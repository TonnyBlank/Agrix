from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import parse_qs

from .common import (
    ApiException,
    admin_client,
    api_view,
    method_not_allowed,
    normalize_kenyan_phone,
    postgrest_in,
    send_sms,
)
from .http import HttpRequest, HttpResponse, JsonResponse
from .views_core import attach_order_meta


logger = logging.getLogger(__name__)


def _parse_gateway_payload(request: HttpRequest) -> dict[str, Any]:
    if not request.body:
        return {}
    content_type = request.headers.get("content-type", "")
    raw = request.body.decode("utf-8", errors="ignore")
    if "application/json" in content_type:
        try:
            payload = json.loads(raw)
            return payload if isinstance(payload, dict) else {}
        except json.JSONDecodeError:
            return {}
    parsed = parse_qs(raw, keep_blank_values=True)
    return {key: values[-1] if values else "" for key, values in parsed.items()}


def _phone_candidates(phone_number: str) -> list[str]:
    raw = str(phone_number or "").strip()
    candidates = [raw]
    try:
        normalized = normalize_kenyan_phone(raw)
        candidates.extend([normalized, f"+{normalized}", f"0{normalized[-9:]}"])
    except ApiException:
        pass
    return sorted({candidate for candidate in candidates if candidate})


def _find_profile_by_phone(phone_number: str) -> dict[str, Any] | None:
    candidates = _phone_candidates(phone_number)
    if not candidates:
        return None
    admin = admin_client()
    rows, _ = admin.select(
        "profiles",
        select="user_id, full_name, phone, county",
        filters={"phone": f"in.{postgrest_in(candidates)}"},
        limit=1,
    )
    return (rows or [None])[0]


def _latest_orders_for_user(user_id: str, limit: int = 3) -> list[dict[str, Any]]:
    admin = admin_client()
    rows, _ = admin.select(
        "orders",
        filters={"or": f"(buyer_id.eq.{user_id},farmer_id.eq.{user_id})"},
        order="created_at.desc",
        limit=limit,
    )
    return attach_order_meta(admin, rows or [])


def _format_order_summary(order: dict[str, Any], *, include_payment: bool = True) -> str:
    product_name = ((order.get("product") or {}).get("name") or "produce").strip()
    status = str(order.get("status") or "pending").replace("_", " ")
    payment_status = str(order.get("payment_status") or "unpaid").replace("_", " ")
    total = float(order.get("total_price") or 0) + float(order.get("delivery_fee") or 0)
    base = f"#{str(order.get('id') or '')[:8]} {product_name}: {status}"
    if include_payment:
        base = f"{base}, payment {payment_status}, KES {total:,.0f}"
    return base


def _build_status_reply(phone_number: str, *, payment_only: bool = False) -> str:
    profile = _find_profile_by_phone(phone_number)
    if not profile:
        return "AgriLink X: We could not find an account for this phone. Update your profile phone in the app."

    orders = _latest_orders_for_user(str(profile.get("user_id") or ""), limit=3)
    if not orders:
        return "AgriLink X: No recent marketplace orders found for your account."

    if payment_only:
        lines = [_format_order_summary(order, include_payment=True) for order in orders]
        return "AgriLink X M-Pesa status: " + " | ".join(lines)

    lines = [_format_order_summary(order, include_payment=True) for order in orders]
    return "AgriLink X orders: " + " | ".join(lines)


@api_view
def sms_inbound(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    payload = _parse_gateway_payload(request)
    phone_number = str(payload.get("from") or payload.get("phoneNumber") or payload.get("phone_number") or "").strip()
    text = str(payload.get("text") or payload.get("message") or "").strip().lower()
    if not phone_number:
        return JsonResponse({"ok": False, "error": "Missing sender phone number."}, status=400)

    if "help" in text:
        reply = "AgriLink X SMS: send STATUS for latest orders or MPESA for payment status."
    elif "mpesa" in text or "payment" in text or "pay" in text:
        reply = _build_status_reply(phone_number, payment_only=True)
    else:
        reply = _build_status_reply(phone_number)

    sent = send_sms(phone_number, reply)
    return JsonResponse({"ok": True, "sent": sent, "reply": reply})


@api_view
def ussd_gateway(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    payload = _parse_gateway_payload(request)
    phone_number = str(payload.get("phoneNumber") or payload.get("phone_number") or payload.get("msisdn") or "").strip()
    text = str(payload.get("text") or "").strip()

    if not text:
        return HttpResponse(
            "CON AgriLink X\n1. Latest orders\n2. M-Pesa status\n3. Help",
            content_type="text/plain; charset=utf-8",
        )

    selection = text.split("*")[-1].strip()
    if selection == "1":
        reply = _build_status_reply(phone_number)
    elif selection == "2":
        reply = _build_status_reply(phone_number, payment_only=True)
    elif selection == "3":
        reply = "AgriLink X: Send SMS STATUS for orders, MPESA for payments, or use the app for full details."
    else:
        reply = "AgriLink X: Invalid option. Dial again and choose 1, 2, or 3."

    return HttpResponse(f"END {reply}", content_type="text/plain; charset=utf-8")
