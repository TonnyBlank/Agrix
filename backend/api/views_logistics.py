from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from .common import (
    ApiException,
    admin_client,
    api_view,
    load_profiles_by_user_ids,
    method_not_allowed,
    now_iso,
    parse_json_body,
    postgrest_in,
    require_auth,
    resolve_app_role,
    send_sms,
    write_user_notification,
    write_user_notifications,
)
from .http import HttpRequest, JsonResponse
from .views_core import (
    DELIVERY_DISPUTE_WINDOW_HOURS,
    DELIVERY_OTP_MAX_ATTEMPTS,
    _clean_optional_text,
    _fetch_profile_phone,
    _hash_delivery_otp,
    _notify_order_status_change,
    _parse_iso_datetime,
    _parse_optional_coordinate,
    attach_order_meta,
)


logger = logging.getLogger(__name__)


LOGISTICS_STATUSES = {"open", "assigned", "accepted", "picked_up", "in_transit", "delivered", "cancelled"}
TRANSPORTER_VISIBLE_STATUSES = {"open", "assigned", "accepted", "picked_up", "in_transit", "delivered"}
TRANSPORTER_TRANSITIONS = {
    "open": {"accepted"},
    "assigned": {"accepted"},
    "accepted": {"picked_up", "in_transit", "cancelled"},
    "picked_up": {"in_transit", "delivered", "cancelled"},
    "in_transit": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}


def _require_logistics_role(request: HttpRequest) -> str:
    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role not in {"admin", "transporter"}:
        raise ApiException("Transporter or admin access required.", 403)
    return role


def _require_admin(request: HttpRequest) -> None:
    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role != "admin":
        raise ApiException("Admin access required.", 403)


def _profile_label(profile: dict[str, Any] | None, fallback: str = "Transporter") -> str:
    return str((profile or {}).get("full_name") or fallback).strip() or fallback


def _load_profile(client, user_id: str | None) -> dict[str, Any] | None:
    if not user_id:
        return None
    profile, _ = client.select(
        "profiles",
        select="user_id, full_name, phone, county",
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )
    return profile


def _attach_dispatch_meta(client, dispatches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not dispatches:
        return []

    order_ids = sorted({str(item.get("order_id") or "") for item in dispatches if item.get("order_id")})
    transporter_ids = sorted({str(item.get("transporter_id") or "") for item in dispatches if item.get("transporter_id")})
    orders_by_id: dict[str, dict[str, Any]] = {}
    transporter_profiles = load_profiles_by_user_ids(client, transporter_ids, "user_id, full_name, phone, county") if transporter_ids else {}

    if order_ids:
        orders, _ = client.select(
            "orders",
            filters={"id": f"in.{postgrest_in(order_ids)}"},
        )
        orders_by_id = {str(order.get("id")): order for order in attach_order_meta(client, orders or [])}

    return [
        {
            **dispatch,
            "order": orders_by_id.get(str(dispatch.get("order_id") or "")),
            "transporter_profile": transporter_profiles.get(str(dispatch.get("transporter_id") or "")),
        }
        for dispatch in dispatches
    ]


def _fetch_dispatch(client, dispatch_id: str) -> dict[str, Any]:
    dispatch, _ = client.select("logistics_dispatches", filters={"id": f"eq.{dispatch_id}"}, single=True)
    if not dispatch:
        raise ApiException("Dispatch not found.", 404)
    return dispatch


def _fetch_order(client, order_id: str) -> dict[str, Any]:
    order, _ = client.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found for dispatch.", 404)
    return order


def _ensure_transporter_dispatch(dispatch: dict[str, Any], user_id: str) -> None:
    transporter_id = str(dispatch.get("transporter_id") or "")
    if transporter_id and transporter_id != user_id:
        raise ApiException("This dispatch is assigned to another transporter.", 403)
    if str(dispatch.get("status") or "") not in TRANSPORTER_VISIBLE_STATUSES:
        raise ApiException("This dispatch is not available to transporters.", 400)


def _notify_dispatch_parties(
    *,
    order: dict[str, Any],
    dispatch: dict[str, Any],
    title: str,
    message: str,
    source_user_id: str | None = None,
    priority: str = "medium",
) -> None:
    admin = admin_client()
    order_id = str(order.get("id") or "")
    party_ids = [str(order.get("buyer_id") or ""), str(order.get("farmer_id") or "")]
    write_user_notifications(
        admin,
        user_ids=party_ids,
        title=title,
        message=message,
        priority=priority,
        category="update",
        entity_type="logistics_dispatch",
        entity_id=str(dispatch.get("id") or "") or None,
        action_url="/dashboard/orders",
        source="logistics",
        source_user_id=source_user_id,
        metadata={"order_id": order_id, "dispatch_status": dispatch.get("status")},
    )
    for user_id in party_ids:
        phone = _fetch_profile_phone(admin, user_id) if user_id else None
        if phone:
            send_sms(phone, f"AgriLink X: {message} (Order #{order_id[:8]})")


def _notify_transporter_assignment(dispatch: dict[str, Any]) -> None:
    transporter_id = str(dispatch.get("transporter_id") or "")
    if not transporter_id:
        return
    admin = admin_client()
    write_user_notification(
        admin,
        user_id=transporter_id,
        title="New dispatch assigned",
        message=f"Dispatch #{str(dispatch.get('id') or '')[:8]} is assigned to you. Accept it from Logistics.",
        priority="high",
        category="action",
        entity_type="logistics_dispatch",
        entity_id=str(dispatch.get("id") or "") or None,
        action_url="/dashboard/logistics",
        source="admin",
        metadata={"order_id": dispatch.get("order_id")},
    )
    phone = _fetch_profile_phone(admin, transporter_id)
    if phone:
        send_sms(phone, f"AgriLink X: New dispatch #{str(dispatch.get('id') or '')[:8]} assigned. Open Logistics to accept.")


def _normalize_dispatch_payload(body: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for source_key, target_key in [
        ("pickup_location", "pickup_location"),
        ("dropoff_location", "dropoff_location"),
        ("vehicle_label", "vehicle_label"),
        ("driver_phone", "driver_phone"),
        ("pickup_note", "pickup_note"),
        ("delivery_note", "delivery_note"),
        ("delivery_proof_photo_url", "delivery_proof_photo_url"),
    ]:
        if source_key in body:
            payload[target_key] = _clean_optional_text(body.get(source_key))
    return payload


@api_view
@require_auth
def logistics_shipments(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    role = _require_logistics_role(request)
    admin = admin_client()
    rows, _ = admin.select("logistics_dispatches", order="updated_at.desc", limit=200)
    dispatches = rows or []

    status_filter = str(request.GET.get("status") or "").strip().lower()
    if status_filter and status_filter != "all":
        if status_filter not in LOGISTICS_STATUSES and status_filter not in {"available", "mine"}:
            raise ApiException("Invalid dispatch status filter.", 400)

    if role == "transporter":
        dispatches = [
            dispatch
            for dispatch in dispatches
            if str(dispatch.get("status") or "") == "open" or str(dispatch.get("transporter_id") or "") == request.user_id
        ]
        if status_filter == "available":
            dispatches = [dispatch for dispatch in dispatches if str(dispatch.get("status") or "") == "open"]
        elif status_filter == "mine":
            dispatches = [dispatch for dispatch in dispatches if str(dispatch.get("transporter_id") or "") == request.user_id]
        elif status_filter and status_filter != "all":
            dispatches = [dispatch for dispatch in dispatches if str(dispatch.get("status") or "") == status_filter]
    elif status_filter and status_filter not in {"all", "available", "mine"}:
        dispatches = [dispatch for dispatch in dispatches if str(dispatch.get("status") or "") == status_filter]

    return JsonResponse(_attach_dispatch_meta(admin, dispatches), safe=False)


@api_view
@require_auth
def logistics_shipment_accept(request: HttpRequest, dispatch_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    role = _require_logistics_role(request)
    if role != "transporter":
        raise ApiException("Only transporters can accept dispatches.", 403)

    admin = admin_client()
    dispatch = _fetch_dispatch(admin, dispatch_id)
    _ensure_transporter_dispatch(dispatch, request.user_id)
    current_status = str(dispatch.get("status") or "open")
    if current_status not in {"open", "assigned"}:
        raise ApiException(f"Dispatch cannot be accepted from {current_status}.", 400)

    profile = _load_profile(admin, request.user_id)
    now_label = now_iso()
    updated = admin.update(
        "logistics_dispatches",
        {
            "transporter_id": request.user_id,
            "status": "accepted",
            "accepted_at": now_label,
            "assigned_at": dispatch.get("assigned_at") or now_label,
            "driver_phone": dispatch.get("driver_phone") or (profile or {}).get("phone"),
        },
        filters={"id": f"eq.{dispatch_id}"},
        single=True,
    )

    order = _fetch_order(admin, str(updated.get("order_id") or ""))
    driver_name = _profile_label(profile)
    _notify_dispatch_parties(
        order=order,
        dispatch=updated,
        title="Transporter accepted dispatch",
        message=f"{driver_name} accepted the delivery dispatch and will coordinate pickup.",
        source_user_id=request.user_id,
    )
    return JsonResponse(_attach_dispatch_meta(admin, [updated])[0])


@api_view
@require_auth
def logistics_shipment_status(request: HttpRequest, dispatch_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    role = _require_logistics_role(request)
    body = parse_json_body(request)
    next_status = str(body.get("status") or "").strip().lower()
    if next_status not in LOGISTICS_STATUSES:
        raise ApiException("Invalid logistics status.", 400)

    admin = admin_client()
    dispatch = _fetch_dispatch(admin, dispatch_id)
    current_status = str(dispatch.get("status") or "open")

    if role == "transporter":
        if str(dispatch.get("transporter_id") or "") != request.user_id:
            raise ApiException("Accept this dispatch before updating handover state.", 403)
        if next_status not in TRANSPORTER_TRANSITIONS.get(current_status, set()):
            raise ApiException(f"You cannot move a dispatch from {current_status} to {next_status}.", 400)

    order = _fetch_order(admin, str(dispatch.get("order_id") or ""))
    if order.get("status") == "cancelled":
        raise ApiException("Cancelled orders cannot be moved through logistics.", 400)

    now_label = now_iso()
    updates = _normalize_dispatch_payload(body)
    updates["status"] = next_status

    if next_status == "picked_up":
        updates["pickup_confirmed_at"] = dispatch.get("pickup_confirmed_at") or now_label
        updates["pickup_geo_lat"] = _parse_optional_coordinate(body.get("pickup_geo_lat"), "Pickup latitude", -90, 90)
        updates["pickup_geo_lng"] = _parse_optional_coordinate(body.get("pickup_geo_lng"), "Pickup longitude", -180, 180)
    elif next_status == "delivered":
        updates["delivered_at"] = dispatch.get("delivered_at") or now_label
        updates["delivery_geo_lat"] = _parse_optional_coordinate(body.get("delivery_geo_lat"), "Delivery latitude", -90, 90)
        updates["delivery_geo_lng"] = _parse_optional_coordinate(body.get("delivery_geo_lng"), "Delivery longitude", -180, 180)

    updated_dispatch = admin.update(
        "logistics_dispatches",
        updates,
        filters={"id": f"eq.{dispatch_id}"},
        single=True,
    )

    next_order_status = None
    order_updates: dict[str, Any] = {}
    if next_status in {"picked_up", "in_transit"}:
        next_order_status = "shipped"
        order_updates = {
            "status": "shipped",
            "payout_status": "awaiting_delivery" if order.get("payment_status") == "paid" else order.get("payout_status"),
        }
    elif next_status == "delivered":
        proof_url = _clean_optional_text(body.get("delivery_proof_photo_url"))
        signoff_status = "pending_buyer_confirmation" if proof_url else "pending_proof"
        next_order_status = "delivered"
        order_updates = {
            "status": "delivered",
            "payout_status": "awaiting_official_signoff" if order.get("payment_status") == "paid" else order.get("payout_status"),
            "delivery_signoff_status": signoff_status,
            "delivery_proof_photo_url": proof_url or order.get("delivery_proof_photo_url"),
            "delivery_proof_geo_lat": updates.get("delivery_geo_lat") if updates.get("delivery_geo_lat") is not None else order.get("delivery_proof_geo_lat"),
            "delivery_proof_geo_lng": updates.get("delivery_geo_lng") if updates.get("delivery_geo_lng") is not None else order.get("delivery_proof_geo_lng"),
            "delivery_proof_submitted_at": now_label,
            "delivery_proof_submitted_by": request.user_id,
            "delivery_proof_note": _clean_optional_text(body.get("delivery_note")) or order.get("delivery_proof_note"),
            "dispute_deadline_at": None,
        }

    if order_updates:
        updated_order = admin.update("orders", order_updates, filters={"id": f"eq.{order['id']}"}, single=True)
        if str(order.get("status") or "") != next_order_status:
            _notify_order_status_change(updated_order)
        if next_status == "delivered":
            _notify_dispatch_parties(
                order=updated_order,
                dispatch=updated_dispatch,
                title="Delivery handover ready",
                message="The transporter marked your order delivered. Request or verify the delivery OTP to complete handover.",
                source_user_id=request.user_id,
                priority="high",
            )

    return JsonResponse(_attach_dispatch_meta(admin, [updated_dispatch])[0])


@api_view
@require_auth
def logistics_shipment_handover(request: HttpRequest, dispatch_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    role = _require_logistics_role(request)
    if role != "transporter":
        raise ApiException("Only transporters can verify a delivery handover.", 403)

    body = parse_json_body(request)
    otp_code = str(body.get("otp_code") or body.get("otp") or "").strip()
    if not otp_code:
        raise ApiException("OTP code is required.", 400)

    admin = admin_client()
    dispatch = _fetch_dispatch(admin, dispatch_id)
    if str(dispatch.get("transporter_id") or "") != request.user_id:
        raise ApiException("This dispatch is assigned to another transporter.", 403)

    order = _fetch_order(admin, str(dispatch.get("order_id") or ""))
    if order.get("status") != "delivered":
        raise ApiException("Mark the dispatch delivered before verifying handover OTP.", 400)
    if order.get("payout_status") == "released":
        raise ApiException("Payout was already released for this order.", 400)

    now_dt = datetime.utcnow().replace(microsecond=0)
    now_label = now_dt.isoformat() + "Z"
    stored_hash = str(order.get("buyer_delivery_otp_hash") or "").strip()
    expires_at = _parse_iso_datetime(order.get("buyer_delivery_otp_expires_at"))
    if not stored_hash:
        raise ApiException("No active OTP found for this order. Request a new buyer OTP first.", 400)
    if expires_at and now_dt > expires_at:
        raise ApiException("Delivery OTP has expired. Request a new OTP code.", 400)

    if _hash_delivery_otp(str(order["id"]), otp_code) != stored_hash:
        attempts = int(order.get("buyer_delivery_otp_attempts") or 0) + 1
        remaining = max(DELIVERY_OTP_MAX_ATTEMPTS - attempts, 0)
        updates: dict[str, Any] = {"buyer_delivery_otp_attempts": attempts}
        if attempts >= DELIVERY_OTP_MAX_ATTEMPTS:
            updates.update(
                {
                    "delivery_signoff_status": "disputed",
                    "dispute_reason": "Maximum handover OTP attempts reached. Admin review required.",
                    "dispute_opened_at": now_label,
                    "dispute_opened_by": request.user_id,
                    "dispute_resolved_at": None,
                    "dispute_resolution_note": None,
                }
            )
        admin.update("orders", updates, filters={"id": f"eq.{order['id']}"})
        if remaining == 0:
            raise ApiException("OTP attempts exceeded. Order has been flagged for admin review.", 400)
        raise ApiException(f"Invalid OTP code. {remaining} attempts remaining.", 400)

    dispute_deadline_at = (now_dt + timedelta(hours=DELIVERY_DISPUTE_WINDOW_HOURS)).isoformat() + "Z"
    updated_order = admin.update(
        "orders",
        {
            "buyer_delivery_otp_hash": None,
            "buyer_delivery_otp_verified_at": now_label,
            "buyer_delivery_otp_attempts": 0,
            "delivery_signoff_status": "confirmed",
            "dispute_opened_at": None,
            "dispute_opened_by": None,
            "dispute_resolved_at": None,
            "dispute_resolution_note": None,
            "dispute_deadline_at": dispute_deadline_at,
        },
        filters={"id": f"eq.{order['id']}"},
        single=True,
    )
    updated_dispatch = admin.update(
        "logistics_dispatches",
        {
            "status": "delivered",
            "delivered_at": dispatch.get("delivered_at") or now_label,
            "delivery_note": _clean_optional_text(body.get("delivery_note")) or dispatch.get("delivery_note"),
        },
        filters={"id": f"eq.{dispatch_id}"},
        single=True,
    )
    _notify_dispatch_parties(
        order=updated_order,
        dispatch=updated_dispatch,
        title="Delivery handover confirmed",
        message="Buyer OTP was verified and the delivery handover is confirmed.",
        source_user_id=request.user_id,
        priority="high",
    )
    return JsonResponse({"message": "Delivery handover confirmed.", "dispatch": _attach_dispatch_meta(admin, [updated_dispatch])[0]})


@api_view
@require_auth
def admin_logistics_dispatches(request: HttpRequest):
    _require_admin(request)
    admin = admin_client()

    if request.method == "GET":
        rows, _ = admin.select("logistics_dispatches", order="updated_at.desc", limit=300)
        return JsonResponse(_attach_dispatch_meta(admin, rows or []), safe=False)

    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])

    body = parse_json_body(request)
    order_id = str(body.get("order_id") or "").strip()
    if not order_id:
        raise ApiException("Order ID is required.", 400)
    order = _fetch_order(admin, order_id)
    if order.get("status") == "cancelled":
        raise ApiException("Cancelled orders cannot be dispatched.", 400)

    transporter_id = _clean_optional_text(body.get("transporter_id"))
    now_label = now_iso()
    payload = {
        "order_id": order_id,
        "transporter_id": transporter_id,
        "status": "assigned" if transporter_id else "open",
        "assigned_at": now_label if transporter_id else None,
        "created_by": request.user_id,
        **_normalize_dispatch_payload(body),
    }
    dispatch = admin.insert(
        "logistics_dispatches",
        payload,
        single=True,
        upsert=True,
        on_conflict="order_id",
    )
    if transporter_id:
        _notify_transporter_assignment(dispatch)
    return JsonResponse(_attach_dispatch_meta(admin, [dispatch])[0], status=201)


@api_view
@require_auth
def admin_logistics_dispatch_detail(request: HttpRequest, dispatch_id: str):
    _require_admin(request)
    admin = admin_client()
    dispatch = _fetch_dispatch(admin, dispatch_id)

    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    body = parse_json_body(request)
    updates = _normalize_dispatch_payload(body)

    if "transporter_id" in body:
        transporter_id = _clean_optional_text(body.get("transporter_id"))
        updates["transporter_id"] = transporter_id
        updates["status"] = "assigned" if transporter_id else "open"
        updates["assigned_at"] = now_iso() if transporter_id else None

    if "status" in body:
        next_status = str(body.get("status") or "").strip().lower()
        if next_status not in LOGISTICS_STATUSES:
            raise ApiException("Invalid logistics status.", 400)
        updates["status"] = next_status

    if not updates:
        return JsonResponse(_attach_dispatch_meta(admin, [dispatch])[0])

    updated = admin.update("logistics_dispatches", updates, filters={"id": f"eq.{dispatch_id}"}, single=True)
    if updates.get("transporter_id"):
        _notify_transporter_assignment(updated)
    return JsonResponse(_attach_dispatch_meta(admin, [updated])[0])
