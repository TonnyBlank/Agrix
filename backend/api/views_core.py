from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Any

import requests

from .common import (
    ApiException,
    admin_client,
    api_view,
    build_loan_schedule,
    build_safe_storage_path,
    ensure_profile_exists,
    get_authenticated_user,
    invalidate_role_cache,
    initiate_stk_push,
    load_profiles_by_user_ids,
    method_not_allowed,
    mpesa_mock_enabled,
    normalize_kenyan_phone,
    now_iso,
    parse_json_body,
    postgrest_in,
    query_stk_push,
    require_auth,
    resolve_mpesa_payment_state,
    resolve_app_role,
    set_user_role_with_plan,
    user_client,
    write_user_notification,
    write_user_notifications,
    send_sms,
)
from .http import HttpRequest, HttpResponse, JsonResponse


logger = logging.getLogger(__name__)


def _normalize_optional_profile_phone(value: Any, field_label: str = "Phone number") -> str | None:
    if value in (None, ""):
        return None
    return f"+{normalize_kenyan_phone(str(value))}"


def _normalize_optional_account_number(value: Any, field_label: str = "Bank account number") -> str | None:
    if value in (None, ""):
        return None
    raw = str(value).strip()
    if any(char.isalpha() for char in raw):
        raise ApiException(f"{field_label} must contain digits only.", 400)
    digits = "".join(char for char in raw if char.isdigit())
    if not digits:
        raise ApiException(f"{field_label} must contain digits only.", 400)
    return digits


AGRILINK_COMMISSION_RATE = 0.05
ORDER_STATUS_VALUES = {"pending", "confirmed", "processing", "shipped", "delivered", "cancelled"}
PAID_PLAN_ROLES = {"farmer_pro", "company"}
SELLER_VERIFIED_ID_STATUSES = {"verified", "approved"}
SELLER_VERIFICATION_REQUIRED_MESSAGE = (
    "Your identity must be verified before you can list products. "
    "Please submit your ID verification under Profile -> ID Verification."
)
SUBSCRIPTION_PLAN_DEFAULTS = {
    "farmer_pro": {"amount_kes": 1500, "display_name": "Farmer Pro"},
    "company": {"amount_kes": 5000, "display_name": "Company"},
}
COUNTY_PICKUP_DISCLAIMER = (
    "Delivery will be made through your county AgriLink office. "
    "Please claim your produce there after payment and official confirmation."
)
DELIVERY_BASE_FEE_KES = 50.0
DELIVERY_RATE_PER_KM_KES = 2.5
DELIVERY_INTER_COUNTY_SURCHARGE_KES = 75.0
DELIVERY_MIN_INTER_COUNTY_DISTANCE_KM = 5.0
DELIVERY_FALLBACK_INTER_COUNTY_DISTANCE_KM = 60.0
DELIVERY_MAX_FEE_KES = 2500.0
DELIVERY_SIGNOFF_STATUSES = {
    "pending_proof",
    "pending_buyer_confirmation",
    "confirmed",
    "disputed",
    "waived_by_admin",
}
DELIVERY_SIGNOFF_RELEASE_READY_STATUSES = {"confirmed", "waived_by_admin"}
DELIVERY_OTP_LENGTH = 6
DELIVERY_OTP_MAX_ATTEMPTS = 5
DELIVERY_OTP_TTL_MINUTES = 30
DELIVERY_DISPUTE_WINDOW_HOURS = 24


def require_verified_seller_identity(user_id: str) -> None:
    verification, _ = admin_client().select(
        "id_verifications",
        select="id, status",
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )
    status = str((verification or {}).get("status") or "").strip().lower()
    if status not in SELLER_VERIFIED_ID_STATUSES:
        raise ApiException(SELLER_VERIFICATION_REQUIRED_MESSAGE, 403)


def _subscription_amount_kes(plan_role: str) -> int:
    env_map = {
        "farmer_pro": os.getenv("SUBSCRIPTION_FARMER_PRO_AMOUNT_KES"),
        "company": os.getenv("SUBSCRIPTION_COMPANY_AMOUNT_KES"),
    }
    configured = env_map.get(plan_role)
    if configured is not None and str(configured).strip():
        try:
            parsed = int(float(str(configured)))
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass
    return SUBSCRIPTION_PLAN_DEFAULTS[plan_role]["amount_kes"]


def _derive_payout_status(order_status: str, payment_status: str) -> str:
    if order_status == "cancelled":
        return "cancelled"
    if payment_status != "paid":
        return "pending_payment"
    if order_status == "delivered":
        return "awaiting_official_signoff"
    return "awaiting_delivery"


def _clean_optional_text(value: Any) -> str | None:
    return str(value or "").strip() or None


def _parse_iso_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _normalize_delivery_signoff_status(value: Any, fallback: str = "pending_proof") -> str:
    status = str(value or "").strip().lower()
    return status if status in DELIVERY_SIGNOFF_STATUSES else fallback


def _parse_optional_coordinate(value: Any, label: str, lower_bound: float, upper_bound: float) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ApiException(f"{label} must be a valid number.", 400)
    if parsed < lower_bound or parsed > upper_bound:
        raise ApiException(f"{label} must be between {lower_bound} and {upper_bound}.", 400)
    return round(parsed, 7)


def _delivery_otp_secret() -> str:
    return os.getenv("DELIVERY_OTP_SECRET") or "agrilink-delivery-signoff"


def _hash_delivery_otp(order_id: str, otp_code: str) -> str:
    payload = f"{order_id}:{otp_code}:{_delivery_otp_secret()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _generate_delivery_otp_code() -> str:
    return f"{secrets.randbelow(10**DELIVERY_OTP_LENGTH):0{DELIVERY_OTP_LENGTH}d}"


def _normalize_county_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _is_same_county(left: str | None, right: str | None) -> bool:
    normalized_left = _normalize_county_text(left)
    normalized_right = _normalize_county_text(right)
    return bool(normalized_left and normalized_right and normalized_left == normalized_right)


def _parse_optional_distance_km(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ApiException("Delivery distance must be a valid number.", 400)
    if parsed < 0:
        raise ApiException("Delivery distance cannot be negative.", 400)
    return round(parsed, 2)


def _get_county_office_details(pickup_county: str | None) -> dict[str, str] | None:
    if not pickup_county:
        return None
    try:
        county_clean = str(pickup_county).strip().lower()
        office, _ = admin_client().select(
            "agrilink_county_offices",
            select="office_name, physical_address, contact_phone",
            filters={"county": f"eq.{county_clean}"},
            single=True
        )
        if office:
            return office
    except Exception as e:
        logger.warning("Failed to lookup county office details for %s: %s", pickup_county, e)
    return None


def _build_delivery_quote(distance_km: float | None, buyer_county: str | None, seller_county: str | None) -> dict[str, Any]:
    same_county = _is_same_county(buyer_county, seller_county)
    effective_distance = float(distance_km) if distance_km is not None else (
        0.0 if same_county else DELIVERY_FALLBACK_INTER_COUNTY_DISTANCE_KM
    )
    effective_distance = max(effective_distance, 0.0)

    surcharge = 0.0
    if not same_county:
        effective_distance = max(effective_distance, DELIVERY_MIN_INTER_COUNTY_DISTANCE_KM)
        surcharge = DELIVERY_INTER_COUNTY_SURCHARGE_KES

    fee_kes = min(
        DELIVERY_BASE_FEE_KES + surcharge + (effective_distance * DELIVERY_RATE_PER_KM_KES),
        DELIVERY_MAX_FEE_KES,
    )
    pickup_county = _clean_optional_text(buyer_county) or _clean_optional_text(seller_county)

    office_details = _get_county_office_details(pickup_county)
    if office_details:
        office_label = f"{office_details['office_name']} ({office_details['physical_address']}, Tel: {office_details['contact_phone']})"
    else:
        office_label = f"{pickup_county} AgriLink County Office" if pickup_county else None

    return {
        "same_county": same_county,
        "distance_km": round(effective_distance, 2),
        "fee_kes": round(fee_kes, 2),
        "base_fee_kes": DELIVERY_BASE_FEE_KES,
        "rate_per_km_kes": DELIVERY_RATE_PER_KM_KES,
        "inter_county_surcharge_kes": round(surcharge, 2),
        "pickup_county": pickup_county,
        "pickup_office_label": office_label,
    }



def _resolve_buyer_farmer_counties(client, buyer_id: str, farmer_id: str | None) -> tuple[str | None, str | None]:
    party_ids = sorted({item for item in [buyer_id, farmer_id] if item})
    if not party_ids:
        return None, None
    profiles_by_user_id = load_profiles_by_user_ids(client, party_ids, "user_id, county")
    buyer_county = _clean_optional_text((profiles_by_user_id.get(buyer_id) or {}).get("county"))
    farmer_county = _clean_optional_text((profiles_by_user_id.get(farmer_id or "") or {}).get("county"))
    return buyer_county, farmer_county


def _upstream_error_message(exc: requests.HTTPError) -> str:
    response = exc.response
    raw_text = response.text.strip() if response is not None and response.text else ""
    if raw_text:
        try:
            payload = json.loads(raw_text)
            if isinstance(payload, dict):
                for key in ("message", "error", "details", "hint"):
                    value = payload.get(key)
                    if value:
                        return str(value)
        except json.JSONDecodeError:
            return raw_text
    return str(exc)


def _is_missing_marketplace_order_rpc(exc: requests.HTTPError) -> bool:
    response = exc.response
    raw_text = response.text if response is not None else str(exc)
    message = raw_text.lower()
    return (
        "place_marketplace_order_v2" in message
        and (
            "could not find" in message
            or "schema cache" in message
            or "does not exist" in message
            or "function" in message
        )
    )


def _create_marketplace_order_without_rpc(
    *,
    buyer_id: str,
    product_id: str,
    quantity: float,
    unit: str | None,
    delivery_quote: dict[str, Any],
    pickup_county: str | None,
    notes: str | None,
) -> dict[str, Any]:
    admin = admin_client()
    product, _ = admin.select(
        "products",
        select="id, farmer_id, unit, stock, is_available, price_per_unit",
        filters={"id": f"eq.{product_id}"},
        single=True,
    )
    if not product:
        raise ApiException("Product not found", 404)
    if product.get("farmer_id") == buyer_id:
        raise ApiException("You cannot place an order for your own product", 400)
    if not bool(product.get("is_available")):
        raise ApiException("This product is not currently available", 400)

    stock = float(product.get("stock") or 0)
    if stock < quantity:
        raise ApiException(f"Only {product.get('stock')} {product.get('unit')} available for this product", 400)

    unit_value = _clean_optional_text(unit) or _clean_optional_text(product.get("unit")) or "unit"
    subtotal = round(float(product.get("price_per_unit") or 0) * quantity, 2)
    delivery_fee = round(float(delivery_quote.get("fee_kes") or 0), 2)
    commission_amount = round(subtotal * AGRILINK_COMMISSION_RATE, 2)
    seller_payout_amount = round(max(subtotal - commission_amount, 0), 2)
    next_stock = round(stock - quantity, 2)

    updated_product = admin.update(
        "products",
        {"stock": next_stock, "is_available": next_stock > 0},
        filters={"id": f"eq.{product_id}", "stock": f"gte.{quantity}"},
    )
    if not updated_product:
        raise ApiException("This product no longer has enough stock. Please refresh the marketplace.", 409)

    order_payload = {
        "product_id": product_id,
        "buyer_id": buyer_id,
        "farmer_id": product.get("farmer_id"),
        "quantity": quantity,
        "unit": unit_value,
        "total_price": subtotal,
        "delivery_fee": delivery_fee,
        "delivery_distance_km": delivery_quote.get("distance_km"),
        "delivery_base_fee": delivery_quote.get("base_fee_kes"),
        "delivery_rate_per_km": delivery_quote.get("rate_per_km_kes"),
        "inter_county_surcharge": delivery_quote.get("inter_county_surcharge_kes"),
        "delivery_mode": "county_office_pickup",
        "pickup_county": pickup_county,
        "pickup_office_label": delivery_quote.get("pickup_office_label"),
        "delivery_disclaimer": COUNTY_PICKUP_DISCLAIMER,
        "status": "pending",
        "payment_method": "mpesa",
        "payment_status": "unpaid",
        "notes": notes,
        "escrow_amount": round(subtotal + delivery_fee, 2),
        "agrilink_commission_rate": AGRILINK_COMMISSION_RATE,
        "agrilink_commission_amount": commission_amount,
        "seller_payout_amount": seller_payout_amount,
        "payout_status": "pending_payment",
    }

    try:
        return admin.insert("orders", order_payload, single=True)
    except Exception:
        try:
            admin.update(
                "products",
                {"stock": stock, "is_available": bool(product.get("is_available"))},
                filters={"id": f"eq.{product_id}"},
            )
        except Exception as rollback_exc:
            logger.warning("Failed to roll back stock after fallback order insert failed for %s: %s", product_id, rollback_exc)
        raise


def attach_order_meta(client, orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not orders:
        return []
    product_ids = sorted({order["product_id"] for order in orders})
    user_ids = sorted({item for order in orders for item in [order["buyer_id"], order["farmer_id"]]})
    products, _ = client.select(
        "products",
        select="id, name, image_emoji, cover_image_url, category",
        filters={"id": f"in.{postgrest_in(product_ids)}"},
    )
    profiles, _ = client.select("profiles", select="user_id, full_name, county", filters={"user_id": f"in.{postgrest_in(user_ids)}"})
    products_by_id = {row["id"]: row for row in products or []}
    profiles_by_id = {row["user_id"]: row for row in profiles or []}
    result = []
    for order in orders:
        product = products_by_id.get(order["product_id"])
        result.append(
            {
                **order,
                "product": {
                    "name": product.get("name"),
                    "image_emoji": product.get("image_emoji"),
                    "cover_image_url": product.get("cover_image_url"),
                    "category": product.get("category"),
                }
                if product
                else None,
                "buyer_profile": {
                    "full_name": profiles_by_id.get(order["buyer_id"], {}).get("full_name"),
                    "county": profiles_by_id.get(order["buyer_id"], {}).get("county"),
                }
                if profiles_by_id.get(order["buyer_id"])
                else None,
                "farmer_profile": {
                    "full_name": profiles_by_id.get(order["farmer_id"], {}).get("full_name"),
                    "county": profiles_by_id.get(order["farmer_id"], {}).get("county"),
                }
                if profiles_by_id.get(order["farmer_id"])
                else None,
            }
        )
    return result


def build_marketplace_products(client, current_user_id: str | None = None) -> list[dict[str, Any]]:
    products, _ = client.select(
        "products",
        filters={"is_available": "eq.true"},
        order="created_at.desc",
    )
    product_ids = [item["id"] for item in products or []]
    if not products:
        return []
    farmer_ids = sorted({item["farmer_id"] for item in products if item.get("farmer_id")})
    profiles_by_user_id = load_profiles_by_user_ids(client, farmer_ids, "user_id, full_name, county") if farmer_ids else {}
    likes, _ = client.select("product_likes", select="product_id, user_id", filters={"product_id": f"in.{postgrest_in(product_ids)}"})
    ratings, _ = client.select("product_ratings", select="product_id, user_id, rating", filters={"product_id": f"in.{postgrest_in(product_ids)}"})
    likes_count: dict[str, int] = {}
    liked_by_me: set[str] = set()
    for like in likes or []:
        likes_count[like["product_id"]] = likes_count.get(like["product_id"], 0) + 1
        if current_user_id and like["user_id"] == current_user_id:
            liked_by_me.add(like["product_id"])
    ratings_by_product: dict[str, list[dict[str, Any]]] = {}
    for row in ratings or []:
        ratings_by_product.setdefault(row["product_id"], []).append(row)
    result = []
    for product in products or []:
        rating_rows = ratings_by_product.get(product["id"], [])
        count = len(rating_rows)
        average = round(sum(float(item["rating"]) for item in rating_rows) / count, 1) if count else 0
        my_rating = next((item["rating"] for item in rating_rows if current_user_id and item["user_id"] == current_user_id), None)
        result.append(
            {
                **product,
                "profiles": profiles_by_user_id.get(product.get("farmer_id")),
                "likes_count": likes_count.get(product["id"], 0),
                "liked_by_me": product["id"] in liked_by_me,
                "ratings_count": count,
                "average_rating": average,
                "my_rating": my_rating,
            }
        )
    return result


def get_allowed_statuses(current_status: str, is_farmer: bool, payment_status: str) -> list[str]:
    if is_farmer:
        if payment_status != "paid":
            if current_status in {"pending", "confirmed", "processing"}:
                return ["cancelled"]
            return []
        if current_status == "pending":
            return ["confirmed", "cancelled"]
        if current_status == "confirmed":
            return ["processing", "shipped", "cancelled"]
        if current_status == "processing":
            return ["shipped", "cancelled"]
        return []
    if current_status == "pending" and payment_status != "paid":
        return ["cancelled"]
    return []


def compute_order_financials(order: dict[str, Any]) -> dict[str, float]:
    subtotal = float(order.get("total_price") or 0)
    delivery_fee = float(order.get("delivery_fee") or 0)
    escrow_amount = round(subtotal + delivery_fee, 2)
    commission_amount = round(subtotal * AGRILINK_COMMISSION_RATE, 2)
    seller_payout_amount = round(max(subtotal - commission_amount, 0), 2)
    return {
        "escrow_amount": escrow_amount,
        "agrilink_commission_amount": commission_amount,
        "seller_payout_amount": seller_payout_amount,
    }


def ensure_logistics_dispatch_for_order(client, order: dict[str, Any]) -> dict[str, Any] | None:
    order_id = str(order.get("id") or "").strip()
    if not order_id:
        return None

    existing, _ = client.select("logistics_dispatches", filters={"order_id": f"eq.{order_id}"}, single=True)
    if existing:
        return existing

    pickup_label = _clean_optional_text(order.get("pickup_office_label")) or _clean_optional_text(order.get("pickup_county"))
    dispatch = client.insert(
        "logistics_dispatches",
        {
            "order_id": order_id,
            "status": "open",
            "pickup_location": "Seller pickup point",
            "dropoff_location": pickup_label or "AgriLink county handover point",
        },
        single=True,
    )

    try:
        roles, _ = client.select("user_roles", select="user_id", filters={"role": "eq.transporter"}, limit=25)
        transporter_ids = [str(row.get("user_id") or "").strip() for row in roles or [] if str(row.get("user_id") or "").strip()]
        if transporter_ids:
            write_user_notifications(
                client,
                user_ids=transporter_ids,
                title="New dispatch available",
                message=f"Paid order #{order_id[:8]} is ready for logistics acceptance.",
                priority="high",
                category="action",
                entity_type="logistics_dispatch",
                entity_id=str(dispatch.get("id") or "") or None,
                action_url="/dashboard/logistics",
                source="system",
                metadata={"order_id": order_id},
            )
            profiles_by_id = load_profiles_by_user_ids(client, transporter_ids, "user_id, phone")
            for profile in profiles_by_id.values():
                phone = profile.get("phone")
                if phone:
                    send_sms(phone, f"AgriLink X: Paid order #{order_id[:8]} is ready for dispatch. Open Logistics to accept.")
    except Exception as exc:
        logger.warning("Failed to notify transporters for order %s: %s", order_id, exc)

    return dispatch


def apply_pay_with_produce_deductions(client, order: dict[str, Any]):
    farmer_id = order.get("farmer_id")
    order_id = str(order.get("id") or "")
    seller_payout_amount = float(
        order.get("seller_payout_amount")
        if order.get("seller_payout_amount") is not None
        else compute_order_financials(order)["seller_payout_amount"]
    )

    if not farmer_id or not order_id or seller_payout_amount <= 0:
        return

    loans, _ = client.select(
        "micro_loan_applications",
        filters={"user_id": f"eq.{farmer_id}", "repayment_method": "eq.pay_with_produce", "status": 'in.("approved","disbursed")'},
    )
    if not loans:
        return

    for loan in loans:
        if seller_payout_amount <= 0:
            break

        repayments, _ = client.select(
            "micro_loan_repayments",
            select="id, amount, created_at, payment_method, payment_status, payment_ref, phone_number, note",
            filters={"loan_application_id": f"eq.{loan['id']}"},
            order="created_at.asc",
        )

        schedule = build_loan_schedule(
            loan.get("approved_amount"),
            loan.get("requested_amount"),
            loan.get("interest_rate"),
            loan.get("repayment_days"),
            loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            _paid_loan_repayments(repayments or []),
        )

        remaining_balance = float(schedule["summary"]["remainingBalance"])
        if remaining_balance <= 0:
            continue

        deduction = min(seller_payout_amount, remaining_balance)
        seller_payout_amount = round(seller_payout_amount - deduction, 2)

        repayment = client.insert(
            "micro_loan_repayments",
            {
                "loan_application_id": loan["id"],
                "user_id": farmer_id,
                "amount": deduction,
                "payment_method": "pay_with_produce",
                "payment_status": "paid",
                "payment_ref": f"ESCROW-{order_id[:8]}",
                "phone_number": None,
                "verified_at": now_iso(),
                "note": f"Automatic Pay-with-Produce deduction from released payout for order {order_id[:8]}.",
            },
            single=True,
        )

        next_schedule = build_loan_schedule(
            loan.get("approved_amount"),
            loan.get("requested_amount"),
            loan.get("interest_rate"),
            loan.get("repayment_days"),
            loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            _paid_loan_repayments([*(repayments or []), repayment]),
        )

        next_status = "repaid" if next_schedule["summary"]["remainingBalance"] <= 0 else loan["status"] if loan["status"] in {"approved", "disbursed"} else "disbursed"

        client.update(
            "micro_loan_applications",
            {
                "status": next_status,
                "repayment_status": "repaid" if next_status == "repaid" else "on_track",
                "arrears_status": "repaid" if next_status == "repaid" else str(loan.get("arrears_status") or "current"),
                "ledger_status": "closed" if next_status == "repaid" else str(loan.get("ledger_status") or "open"),
                "disbursed_at": loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
                "repaid_at": now_iso() if next_status == "repaid" else None,
                "updated_at": now_iso(),
            },
            filters={"id": f"eq.{loan['id']}"},
            single=True,
        )


def release_order_payout(
    client,
    order: dict[str, Any],
    verified_by_user_id: str,
    official_note: str | None = None,
    *,
    allow_admin_override: bool = False,
    override_reason: str | None = None,
):
    if order.get("payment_status") != "paid":
        raise ApiException("Buyer funds must reach the AgriLink escrow account before payout can be released.", 400)
    if order.get("status") != "delivered":
        raise ApiException("Only delivered orders can be officially signed off for seller payout.", 400)
    if order.get("payout_status") == "released":
        return order

    signoff_status = _normalize_delivery_signoff_status(order.get("delivery_signoff_status"), "pending_proof")
    has_open_dispute = bool(order.get("dispute_opened_at"))
    now_dt = datetime.utcnow()
    dispute_deadline = _parse_iso_datetime(order.get("dispute_deadline_at"))
    dispute_window_open = bool(dispute_deadline and now_dt < dispute_deadline)
    override_note = _clean_optional_text(override_reason)
    using_override = bool(allow_admin_override and override_note)

    if has_open_dispute and not using_override:
        raise ApiException("Seller payout is blocked while the buyer dispute is still open.", 400)

    if signoff_status not in DELIVERY_SIGNOFF_RELEASE_READY_STATUSES and not using_override:
        raise ApiException("Seller payout requires buyer delivery sign-off or an admin waiver reason.", 400)

    if dispute_window_open and not using_override:
        deadline_label = dispute_deadline.replace(microsecond=0).isoformat() + "Z"
        raise ApiException(f"Wait until the dispute window closes at {deadline_label} before releasing payout.", 400)

    now_label = now_iso()
    next_signoff_status = "waived_by_admin" if using_override else signoff_status
    next_official_note = official_note if official_note is not None else order.get("official_note")
    if using_override:
        marker = f"Admin override reason: {override_note}"
        next_official_note = f"{next_official_note}\n{marker}".strip() if next_official_note else marker

    next_dispute_resolution_note = order.get("dispute_resolution_note")
    if using_override and has_open_dispute:
        next_dispute_resolution_note = override_note

    update_payload: dict[str, Any] = {
        "payout_status": "released",
        "delivery_signoff_status": next_signoff_status,
        "official_verified_at": order.get("official_verified_at") or now_label,
        "official_verified_by": order.get("official_verified_by") or verified_by_user_id,
        "official_note": next_official_note,
        "payout_released_at": order.get("payout_released_at") or now_label,
        "dispute_opened_at": None if using_override else order.get("dispute_opened_at"),
        "dispute_opened_by": None if using_override else order.get("dispute_opened_by"),
        "dispute_resolved_at": now_label if using_override and has_open_dispute else order.get("dispute_resolved_at"),
        "dispute_resolution_note": next_dispute_resolution_note,
    }

    updated = client.update(
        "orders",
        update_payload,
        filters={"id": f"eq.{order['id']}"},
        single=True,
    )
    apply_pay_with_produce_deductions(client, updated)
    return updated


def mark_order_paid(order_id: str, checkout_request_id: str, receipt_number: str | None = None):
    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found while confirming payment.", 404)
    financials = compute_order_financials(order or {})
    payout_status = _derive_payout_status(str(order.get("status") or "pending"), "paid")
    verified_at = now_iso()
    admin.update(
        "orders",
        {
            "payment_status": "paid",
            "payment_ref": receipt_number or checkout_request_id,
            "paid_at": verified_at,
            "payment_error": None,
            "escrow_amount": financials["escrow_amount"],
            "agrilink_commission_rate": AGRILINK_COMMISSION_RATE,
            "agrilink_commission_amount": financials["agrilink_commission_amount"],
            "seller_payout_amount": financials["seller_payout_amount"],
            "escrow_received_at": verified_at,
            "payout_status": payout_status,
            "payment_verified_at": verified_at,
            "delivery_mode": order.get("delivery_mode") or "county_office_pickup",
            "pickup_county": order.get("pickup_county"),
            "pickup_office_label": order.get("pickup_office_label"),
            "delivery_disclaimer": order.get("delivery_disclaimer") or COUNTY_PICKUP_DISCLAIMER,
        },
        filters={"id": f"eq.{order_id}"},
    )

    # SMS notification to buyer and farmer of successful payment
    try:
        buyer_id = str(order.get("buyer_id") or "")
        farmer_id = str(order.get("farmer_id") or "")
        buyer_phone = _fetch_profile_phone(admin, buyer_id) if buyer_id else None
        farmer_phone = _fetch_profile_phone(admin, farmer_id) if farmer_id else None
        total_kes = financials["escrow_amount"]

        if buyer_phone:
            send_sms(
                buyer_phone,
                f"AgriLink X: Payment of KES {total_kes} received for order #{order_id[:8]}. Preparing order."
            )
        if farmer_phone:
            send_sms(
                farmer_phone,
                f"AgriLink X: Order #{order_id[:8]} has been paid. Please prepare and ship."
            )
    except Exception as sms_exc:
        logger.warning("Failed to send payment SMS: %s", sms_exc)

    try:
        ensure_logistics_dispatch_for_order(admin, {**order, "id": order_id})
    except Exception as dispatch_exc:
        logger.warning("Failed to create logistics dispatch for order %s: %s", order_id, dispatch_exc)



def _extract_mpesa_receipt_number(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None

    candidates = [
        payload.get("MpesaReceiptNumber"),
        payload.get("mpesaReceiptNumber"),
        payload.get("ReceiptNumber"),
        payload.get("receiptNumber"),
    ]

    for value in candidates:
        if value not in (None, ""):
            return str(value).strip()

    metadata = (((payload.get("CallbackMetadata") or {}).get("Item")) if isinstance(payload.get("CallbackMetadata"), dict) else []) or []
    for item in metadata:
        if str(item.get("Name") or "").strip() == "MpesaReceiptNumber" and item.get("Value") not in (None, ""):
            return str(item.get("Value")).strip()
    return None


def _activate_paid_subscription(
    payment_id: str,
    user_id: str,
    plan_role: str,
    checkout_request_id: str | None,
    receipt_number: str | None = None,
    fallback_full_name: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if plan_role not in PAID_PLAN_ROLES:
        raise ApiException("Invalid paid plan for subscription activation.", 400)

    admin = admin_client()
    existing_payment, _ = admin.select(
        "subscription_payments",
        select="id, payment_status, paid_at, plan_started_at, plan_expires_at, plan_role, user_id",
        filters={"id": f"eq.{payment_id}"},
        single=True,
    )
    if existing_payment and existing_payment.get("payment_status") == "paid":
        profile, _ = admin.select("profiles", filters={"user_id": f"eq.{user_id}"}, single=True)
        return existing_payment, profile or {}

    updated_profile = set_user_role_with_plan(user_id, plan_role, fallback_full_name)
    updated_payment = admin.update(
        "subscription_payments",
        {
            "payment_status": "paid",
            "payment_ref": receipt_number or checkout_request_id,
            "payment_error": None,
            "paid_at": (existing_payment or {}).get("paid_at") or now_iso(),
            "plan_started_at": updated_profile.get("plan_started_at"),
            "plan_expires_at": updated_profile.get("plan_expires_at"),
        },
        filters={"id": f"eq.{payment_id}"},
        single=True,
    )
    return updated_payment, updated_profile


def _restock_cancelled_order_item(client, order: dict[str, Any]) -> None:
    """Atomically restore stock when an order is cancelled.
    Uses the increment_product_stock RPC to avoid TOCTOU races.
    """
    if not order.get("product_id"):
        return
    if order.get("status") not in {"pending", "confirmed", "processing"}:
        return
    qty = float(order.get("quantity") or 0)
    if qty <= 0:
        return
    try:
        client.rpc("increment_product_stock", {"p_product_id": order["product_id"], "p_quantity": qty})
    except Exception:
        # Fallback to read-then-write if RPC is not yet deployed
        product, _ = client.select("products", select="id, stock", filters={"id": f"eq.{order['product_id']}"}, single=True)
        if not product:
            return
        next_stock = round(float(product.get("stock") or 0) + qty, 2)
        client.update(
            "products",
            {"stock": next_stock, "is_available": next_stock > 0},
            filters={"id": f"eq.{order['product_id']}"},
        )


def _restock_failed_order(client, order: dict[str, Any]) -> None:
    """Atomically restore stock when a payment fails or times out.
    Only restores for orders that were never delivered or cancelled.
    """
    if not order.get("product_id"):
        return
    # Callback retries and repeated status checks must not restore stock twice.
    if str(order.get("payment_status") or "").strip().lower() == "failed":
        return
    if order.get("status") in {"delivered", "cancelled"}:
        return
    qty = float(order.get("quantity") or 0)
    if qty <= 0:
        return
    try:
        client.rpc("increment_product_stock", {"p_product_id": order["product_id"], "p_quantity": qty})
    except Exception:
        # Fallback to read-then-write if RPC is not yet deployed
        product, _ = client.select("products", select="id, stock", filters={"id": f"eq.{order['product_id']}"}, single=True)
        if not product:
            return
        next_stock = round(float(product.get("stock") or 0) + qty, 2)
        client.update(
            "products",
            {"stock": next_stock, "is_available": next_stock > 0},
            filters={"id": f"eq.{order['product_id']}"},
        )


SCANNER_ALLOWED_ROLES = {"farmer_pro", "company", "admin"}
SCANNER_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
SCANNER_MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024
DELIVERY_PROOF_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MEDIA_MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024
SCANNER_GEMINI_MODEL = "gemini-2.5-flash"
SCANNER_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite"
SCANNER_GEMINI_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}
SCANNER_GEMINI_MAX_ATTEMPTS = 3
SCANNER_GEMINI_MAX_OUTPUT_TOKENS = 1536
SCANNER_SEVERITY_VALUES = {"Low", "Moderate", "High"}
SCANNER_UNDETERMINED_RESULT: dict[str, Any] = {
    "disease": "Unable to determine from image",
    "scientificName": "Not assessed",
    "crop": "Not identified",
    "confidence": 0.0,
    "severity": "Low",
    "spreadRisk": "Low",
    "affectedArea": "Not assessed",
    "description": "No reliable diagnosis was made from this image. A disease should not be inferred without a clear, close photo of the affected crop tissue.",
    "treatment": "Do not apply a disease treatment based on this result.",
    "organicAlternatives": [],
    "fertilizerRecommendations": [],
    "prevention": "Retake the photo in daylight, focus on one affected leaf, include both sides if possible, and avoid blurred or distant images.",
}
SCANNER_GEMINI_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "disease": {"type": "string"},
        "scientificName": {"type": "string"},
        "crop": {"type": "string"},
        "confidence": {"type": "number"},
        "severity": {"type": "string", "enum": ["Low", "Moderate", "High"]},
        "spreadRisk": {"type": "string", "enum": ["Low", "Moderate", "High"]},
        "affectedArea": {"type": "string"},
        "description": {"type": "string"},
        "treatment": {"type": "string"},
        "organicAlternatives": {"type": "array", "items": {"type": "string"}},
        "fertilizerRecommendations": {"type": "array", "items": {"type": "string"}},
        "prevention": {"type": "string"},
    },
    "required": [
        "disease",
        "scientificName",
        "crop",
        "confidence",
        "severity",
        "spreadRisk",
        "affectedArea",
        "description",
        "treatment",
        "organicAlternatives",
        "fertilizerRecommendations",
        "prevention",
    ],
}


def _build_scanner_result(_file_name: str, _content: bytes) -> dict[str, Any]:
    # Never invent a crop disease when the vision service is unavailable.
    return dict(SCANNER_UNDETERMINED_RESULT)


def _gemini_error_detail(response: requests.Response | None) -> str:
    response_text = getattr(response, "text", "") if response is not None else ""
    if not isinstance(response_text, str):
        return "<unavailable>"
    return response_text.strip().replace("\n", " ")[:500] or "<empty>"


def _get_gemini_api_key() -> str | None:
    def _is_placeholder(value: str | None) -> bool:
        if value is None:
            return True
        cleaned = value.strip()
        if not cleaned:
            return True
        lowered = cleaned.lower()
        placeholder_words = (
            "your-gemini-api-key",
            "your-google-api-key",
            "your_api_key",
            "example",
            "placeholder",
            "changeme",
            "replace-me",
            "abc123",
            "test-key",
        )
        if lowered in placeholder_words:
            return True
        if lowered.startswith("your-") or lowered.startswith("example"):
            return True
        return False

    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        value = os.getenv(env_name)
        if value and not _is_placeholder(value):
            return value.strip()
    return None


def _normalize_scanner_result(raw: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    def normalize_text(key: str, *aliases: str) -> str:
        value = raw.get(key)
        if value is None:
            value = next((raw.get(alias) for alias in aliases if raw.get(alias) is not None), None)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return str(fallback.get(key) or "").strip()

    def normalize_level(key: str) -> str:
        value = normalize_text(key)
        canonical_values = {level.lower(): level for level in SCANNER_SEVERITY_VALUES}
        if value.lower() in canonical_values:
            return canonical_values[value.lower()]
        return str(fallback.get(key) or "Moderate")

    confidence_value = raw.get("confidence", raw.get("confidenceScore"))
    try:
        confidence = float(confidence_value)
    except (TypeError, ValueError):
        confidence = float(fallback.get("confidence") or 0.0)
    if 0 < confidence <= 1:
        confidence *= 100
    confidence = round(max(0.0, min(100.0, confidence)), 1)

    organic_alternatives = raw.get("organicAlternatives")
    normalized_alternatives = [
        str(item).strip()
        for item in (organic_alternatives if isinstance(organic_alternatives, list) else [])
        if str(item).strip()
    ]
    if not normalized_alternatives:
        normalized_alternatives = [str(item).strip() for item in fallback.get("organicAlternatives") or [] if str(item).strip()]

    fertilizer_recommendations = raw.get("fertilizerRecommendations")
    normalized_fertilizers = [
        str(item).strip()
        for item in (fertilizer_recommendations if isinstance(fertilizer_recommendations, list) else [])
        if str(item).strip()
    ]
    if not normalized_fertilizers:
        normalized_fertilizers = [str(item).strip() for item in fallback.get("fertilizerRecommendations") or [] if str(item).strip()]

    disease = normalize_text("disease", "diagnosis")
    # Gemini is responsible for deciding whether the crop/symptoms are clear.
    # Do not turn its legitimate lower-confidence diagnosis into a false 0%
    # result; show the confidence so the farmer can judge the uncertainty.
    if disease.lower() in {
        "unable to determine from image",
        "unable to determine",
        "not enough information",
        "unknown",
    }:
        return dict(SCANNER_UNDETERMINED_RESULT)

    return {
        "disease": disease,
        "scientificName": normalize_text("scientificName", "scientific_name"),
        "crop": normalize_text("crop"),
        "confidence": confidence,
        "severity": normalize_level("severity"),
        "spreadRisk": normalize_level("spreadRisk"),
        "affectedArea": normalize_text("affectedArea", "affected_area"),
        "description": normalize_text("description"),
        "treatment": normalize_text("treatment"),
        "organicAlternatives": normalized_alternatives[:5],
        "fertilizerRecommendations": normalized_fertilizers[:5],
        "prevention": normalize_text("prevention"),
    }


def _persist_crop_scanner_scan(
    request: HttpRequest,
    *,
    file_name: str,
    mime_type: str,
    image_content: bytes,
    analysis_mode: str,
    advisory: str,
    result: dict[str, Any],
    scanned_at: str,
) -> dict[str, Any]:
    payload = {
        "user_id": request.user_id,
        "file_name": str(file_name or "crop-scan.jpg"),
        "mime_type": mime_type,
        "image_size_bytes": len(image_content),
        "image_sha256": hashlib.sha256(image_content).hexdigest(),
        "analysis_mode": analysis_mode,
        "advisory": str(advisory or "").strip() or "No advisory available.",
        "result": result,
        "scanned_at": scanned_at,
        "created_at": scanned_at,
    }
    return request.supabase.insert("crop_scanner_scans", payload, single=True)


def _call_gemini_crop_scanner(file_name: str, mime_type: str, content: bytes) -> dict[str, Any]:
    api_key = _get_gemini_api_key()
    if not api_key:
        raise ApiException("Gemini API key is not configured.", 500)

    model_name = os.getenv("GEMINI_MODEL", SCANNER_GEMINI_MODEL).strip() or SCANNER_GEMINI_MODEL
    fallback = _build_scanner_result(file_name, content)
    image_base64 = base64.b64encode(content).decode("utf-8")
    prompt = (
        "You are an agronomy assistant for smallholder farmers. Analyze this crop photo and return only JSON matching the schema. "
        "Base every conclusion on visible evidence in this image only; never infer from the filename or missing details. "
        "When a usable leaf, fruit, or plant tissue has visible symptoms, identify the single most likely diagnosis and give a confidence percentage from 0 to 100. "
        "Use Unable to determine from image only when crop tissue or symptoms are genuinely not visible, the image is too blurred/distant, or no reliable conclusion is possible. "
        "If the image is healthy, set disease to No disease detected and state the healthy evidence. "
        "For a disease, describe the visible symptoms and give concise practical actions that fit smallholder farms. Do not invent pesticide rates or recommend restricted products; advise following the Kenyan product label and local agronomy guidance. "
        "Set severity and spreadRisk to Low, Moderate, or High. Set affectedArea as a visible range such as 0-5% or 20-35%. "
        "Return fertilizerRecommendations only for clear nutrient-management advice; otherwise return an empty array."
    )
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                    {"text": prompt},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            # Reserve enough room for every field, treatment, and prevention step.
            "maxOutputTokens": SCANNER_GEMINI_MAX_OUTPUT_TOKENS,
            "responseMimeType": "application/json",
            "responseSchema": SCANNER_GEMINI_RESPONSE_SCHEMA,
        },
    }
    # Gemini 2.5 Flash counts thinking tokens against maxOutputTokens. Crop
    # diagnoses need the response budget for the complete JSON document.
    if model_name.startswith("gemini-2.5-"):
        payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}

    model_names = [model_name]
    if SCANNER_GEMINI_FALLBACK_MODEL and model_name != SCANNER_GEMINI_FALLBACK_MODEL:
        model_names.append(SCANNER_GEMINI_FALLBACK_MODEL)

    body: dict[str, Any] | None = None
    last_error: Exception | None = None
    for candidate_model in model_names:
        for attempt in range(SCANNER_GEMINI_MAX_ATTEMPTS):
            try:
                response = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{candidate_model}:generateContent",
                    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                    json=payload,
                    timeout=60,
                )
                if response.status_code in SCANNER_GEMINI_RETRYABLE_STATUS_CODES:
                    response.raise_for_status()
                response.raise_for_status()
                try:
                    body = response.json()
                except requests.exceptions.JSONDecodeError as exc:
                    # Gemini can occasionally return an empty response body with a 200 status.
                    # Treat that as transient instead of immediately giving up on the scan.
                    last_error = exc
                    body = None
                    logger.warning(
                        "Gemini returned a non-JSON crop analysis response; retrying model=%s attempt=%s",
                        candidate_model,
                        attempt + 1,
                    )
                    if attempt == SCANNER_GEMINI_MAX_ATTEMPTS - 1:
                        break
                    time.sleep(attempt + 1)
                    continue
                break
            except requests.RequestException as exc:
                last_error = exc
                error_response = exc.response if isinstance(exc, requests.HTTPError) else None
                status_code = error_response.status_code if error_response is not None else None
                logger.warning(
                    "Gemini crop scan request failed model=%s attempt=%s/%s status=%s error=%s response=%s",
                    candidate_model,
                    attempt + 1,
                    SCANNER_GEMINI_MAX_ATTEMPTS,
                    status_code,
                    str(exc) or exc.__class__.__name__,
                    _gemini_error_detail(error_response),
                )
                # A 429 quota response includes a retry delay that can be much longer
                # than a web request. Try the lower-cost model instead of waiting.
                if status_code == 429:
                    break
                if status_code not in SCANNER_GEMINI_RETRYABLE_STATUS_CODES or attempt == SCANNER_GEMINI_MAX_ATTEMPTS - 1:
                    break
                time.sleep(attempt + 1)
        if body is not None:
            break

    if body is None:
        if last_error:
            raise last_error
        raise ApiException("Gemini did not return a crop analysis response.", 502)

    prompt_feedback = body.get("promptFeedback") or {}
    if prompt_feedback.get("blockReason"):
        raise ApiException(f"Gemini blocked the crop analysis request: {prompt_feedback['blockReason']}", 400)

    candidates = body.get("candidates") or []
    if not candidates:
        raise ApiException("Gemini returned no crop analysis candidates.", 502)

    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    text_parts = [
        str(part["text"])
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str) and part["text"].strip()
    ]
    visible_text_parts = [
        str(part["text"])
        for part in parts
        if isinstance(part, dict)
        and not part.get("thought")
        and isinstance(part.get("text"), str)
        and part["text"].strip()
    ]
    # Gemini thinking models can send thought or prose parts beside the final JSON part.
    # Work backwards through the visible parts until a valid JSON object is found.
    candidate_text_parts = visible_text_parts or text_parts
    if not candidate_text_parts:
        raise ApiException("Gemini returned an empty crop analysis response.", 502)

    parsed: dict[str, Any] | None = None
    for text_part in reversed(candidate_text_parts):
        response_text = text_part.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[-1]
            if response_text.rstrip().endswith("```"):
                response_text = response_text.rstrip()[:-3].rstrip()

        if not response_text.startswith("{"):
            object_start = response_text.find("{")
            object_end = response_text.rfind("}")
            if object_start >= 0 and object_end > object_start:
                response_text = response_text[object_start : object_end + 1]

        try:
            candidate = json.loads(response_text)
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict):
            parsed = candidate
            break

    if parsed is None:
        raise ApiException("Gemini returned a crop analysis without valid JSON.", 502)

    return _normalize_scanner_result(parsed, fallback)


@api_view
def health(_request: HttpRequest):
    return JsonResponse({"status": "ok", "service": "AgriLink X Django Backend", "time": now_iso()})


@api_view
@require_auth
def scanner_crops(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role not in SCANNER_ALLOWED_ROLES:
        raise ApiException("AI crop scanner is available on Pro and Enterprise plans only.", 403)

    image = request.FILES.get("image")
    if not image:
        raise ApiException("Crop image is required.", 400)
    if image.content_type not in SCANNER_ALLOWED_IMAGE_TYPES:
        raise ApiException("Unsupported image type. Use JPEG, PNG, or WEBP.", 400)

    content = image.read()
    if not content:
        raise ApiException("Uploaded image is empty.", 400)
    if len(content) > SCANNER_MAX_IMAGE_SIZE_BYTES:
        raise ApiException("Image must be 8MB or less.", 400)

    fallback_reason: str | None = None
    analysis_mode = "heuristic"
    advisory = ""
    result = _build_scanner_result(image.name, content)
    if _get_gemini_api_key():
        try:
            result = _call_gemini_crop_scanner(image.name, image.content_type or "image/jpeg", content)
            analysis_mode = "gemini"
            advisory = "AI output can be wrong. Confirm serious or spreading symptoms with an agronomist."
        except (ApiException, requests.RequestException, json.JSONDecodeError) as exc:
            fallback_reason = "Gemini is temporarily unavailable. Please try the scan again in a moment."
            error_response = getattr(exc, "response", None)
            status_code = getattr(error_response, "status_code", None)
            logger.warning(
                "Gemini crop scan fallback triggered error_type=%s status=%s error=%s response=%s",
                exc.__class__.__name__,
                status_code,
                str(exc) or exc.__class__.__name__,
                _gemini_error_detail(error_response),
            )
            result = _build_scanner_result(image.name, content)
            analysis_mode = "heuristic"
    else:
        fallback_reason = "Gemini is not configured on the backend."

    if analysis_mode == "heuristic":
        advisory = "AI analysis was unavailable, so no diagnosis was made. "
        if fallback_reason:
            advisory += f"{fallback_reason} "
        advisory += "Please confirm it with an agronomist if symptoms worsen or spread quickly."

    scanned_at = now_iso()
    scan_record: dict[str, Any] = {}
    if result.get("disease") != SCANNER_UNDETERMINED_RESULT["disease"]:
        try:
            scan_record = _persist_crop_scanner_scan(
                request,
                file_name=image.name,
                mime_type=image.content_type or "image/jpeg",
                image_content=content,
                analysis_mode=analysis_mode,
                advisory=advisory,
                result=result,
                scanned_at=scanned_at,
            )
        except Exception as exc:
            logger.warning("Failed to persist crop scanner result; continuing with response: %s", exc)

    return JsonResponse(
        {
            "scanId": scan_record.get("id"),
            "result": result,
            "scannedAt": scanned_at,
            "analysisMode": analysis_mode,
            "advisory": advisory,
        }
    )


@api_view
def products_root(request: HttpRequest):
    if request.method == "GET":
        auth_header = request.headers.get("authorization", "")
        current_user_id = None
        client = user_client()
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            authed = user_client(token)
            user = get_authenticated_user(token, authed)
            if user:
                client = authed
                current_user_id = user["id"]
        return JsonResponse(build_marketplace_products(client, current_user_id), safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    return require_auth(_products_create)(request)


def _products_create(request: HttpRequest):
    body = parse_json_body(request)
    name = str(body.get("name") or "").strip()
    category = str(body.get("category") or "").strip()
    unit = str(body.get("unit") or "").strip()
    if not name or not category or not unit:
        raise ApiException("Name, category, and unit are required", 400)
    try:
        price = float(body.get("price_per_unit"))
        stock = float(body.get("stock"))
    except (TypeError, ValueError):
        raise ApiException("Price and stock must be valid numbers", 400)
    if price < 0:
        raise ApiException("Price must be a valid non-negative number", 400)
    if stock < 0:
        raise ApiException("Stock must be a valid non-negative number", 400)
    profile, _ = request.supabase.select(
        "profiles",
        select="full_name, phone, county, farm_size, main_crops, bio, payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number",
        filters={"user_id": f"eq.{request.user_id}"},
        single=True,
    )
    missing = [
        "full name" if not (profile or {}).get("full_name") else None,
        "phone number" if not (profile or {}).get("phone") else None,
        "county" if not (profile or {}).get("county") else None,
        "farm size" if not (profile or {}).get("farm_size") else None,
        "main crops" if not (profile or {}).get("main_crops") else None,
        "bio" if not (profile or {}).get("bio") else None,
        "payout method" if not (profile or {}).get("payout_method") else None,
    ]
    if (profile or {}).get("payout_method") == "mpesa" and not (profile or {}).get("payout_mpesa_number"):
        missing.append("M-Pesa payout number")
    if (profile or {}).get("payout_method") == "bank":
        if not (profile or {}).get("bank_name"):
            missing.append("bank name")
        if not (profile or {}).get("bank_account_name"):
            missing.append("bank account name")
        if not (profile or {}).get("bank_account_number"):
            missing.append("bank account number")
    missing = [item for item in missing if item]
    if missing:
        raise ApiException(f"Complete your profile before uploading products. Missing: {', '.join(missing)}.", 403)
    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role == "farmer_free":
        require_verified_seller_identity(request.user_id)
        _, count = request.supabase.select("products", filters={"farmer_id": f"eq.{request.user_id}"}, head=True, count="exact")
        if (count or 0) >= 10:
            raise ApiException("Free plan reached the 10 product limit. Upgrade to Pro for unlimited listings.", 403)
    elif role in {"farmer_pro"}:
        require_verified_seller_identity(request.user_id)
    created = request.supabase.insert(
        "products",
        {
            "farmer_id": request.user_id,
            "name": name,
            "category": category,
            "price_per_unit": price,
            "unit": unit,
            "stock": stock,
            "description": str(body.get("description") or "").strip() or None,
            "image_emoji": str(body.get("image_emoji") or "").strip() or None,
            "cover_image_url": str(body.get("cover_image_url") or "").strip() or None,
            "video_url": str(body.get("video_url") or "").strip() or None,
            "is_organic": bool(body.get("is_organic")),
            "location": str(body.get("location") or "").strip() or None,
        },
        single=True,
    )
    return JsonResponse(created, status=201)


@api_view
@require_auth
def products_mine(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    rows, _ = request.supabase.select("products", filters={"farmer_id": f"eq.{request.user_id}"}, order="created_at.desc")
    return JsonResponse(rows or [], safe=False)


@api_view
def product_detail(request: HttpRequest, product_id: str):
    if request.method == "GET":
        row, _ = user_client().select("products", filters={"id": f"eq.{product_id}"}, single=True)
        if not row:
            raise ApiException("Product not found", 404)
        return JsonResponse(row)
    if request.method == "PATCH":
        return require_auth(_product_update)(request, product_id=product_id)
    if request.method == "DELETE":
        return require_auth(_product_delete)(request, product_id=product_id)
    return method_not_allowed(["GET", "PATCH", "DELETE"])


def _product_update(request: HttpRequest, product_id: str):
    updated = request.supabase.update(
        "products",
        parse_json_body(request),
        filters={"id": f"eq.{product_id}", "farmer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not updated:
        raise ApiException("Not authorized or product not found", 403)
    return JsonResponse(updated)


def _product_delete(request: HttpRequest, product_id: str):
    product, _ = request.supabase.select(
        "products",
        select="id",
        filters={"id": f"eq.{product_id}", "farmer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not product:
        raise ApiException("Product not found or you are not allowed to delete it", 404)

    orders, _ = request.supabase.select(
        "orders",
        select="id",
        filters={"product_id": f"eq.{product_id}", "farmer_id": f"eq.{request.user_id}"},
        limit=1,
    )
    if orders:
        raise ApiException("This product has existing orders and cannot be deleted. Mark it unavailable instead.", 409)

    request.supabase.delete("products", filters={"id": f"eq.{product_id}", "farmer_id": f"eq.{request.user_id}"})
    return JsonResponse({"success": True})


@api_view
@require_auth
def product_like(request: HttpRequest, product_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    product, _ = request.supabase.select("products", select="id", filters={"id": f"eq.{product_id}"}, single=True)
    if not product:
        raise ApiException("Product not found", 404)
    existing, _ = request.supabase.select(
        "product_likes",
        select="id",
        filters={"product_id": f"eq.{product_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    if existing:
        request.supabase.delete("product_likes", filters={"id": f"eq.{existing['id']}"})
        liked = False
    else:
        request.supabase.insert("product_likes", {"product_id": product_id, "user_id": request.user_id}, single=True)
        liked = True
    _, count = request.supabase.select("product_likes", filters={"product_id": f"eq.{product_id}"}, head=True, count="exact")
    return JsonResponse({"liked": liked, "likes_count": count or 0})


@api_view
@require_auth
def product_rate(request: HttpRequest, product_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    try:
        rating = int(parse_json_body(request).get("rating"))
    except (TypeError, ValueError):
        raise ApiException("Rating must be an integer between 1 and 5", 400)
    if rating < 1 or rating > 5:
        raise ApiException("Rating must be an integer between 1 and 5", 400)
    product, _ = request.supabase.select("products", select="id", filters={"id": f"eq.{product_id}"}, single=True)
    if not product:
        raise ApiException("Product not found", 404)
    request.supabase.insert(
        "product_ratings",
        {"product_id": product_id, "user_id": request.user_id, "rating": rating},
        single=True,
        upsert=True,
        on_conflict="product_id,user_id",
    )
    rows, _ = request.supabase.select("product_ratings", select="rating", filters={"product_id": f"eq.{product_id}"})
    count = len(rows or [])
    average = round(sum(float(row["rating"]) for row in rows or []) / count, 1) if count else 0
    return JsonResponse({"my_rating": rating, "average_rating": average, "ratings_count": count})


def _upload_media(request: HttpRequest, field_name: str, allowed_types: set[str], bucket: str = "product-media"):
    file = request.FILES.get(field_name)
    if not file:
        raise ApiException("No file uploaded", 400)
    if file.content_type not in allowed_types:
        raise ApiException(f"Unsupported {field_name} type", 400)
    content = file.read()
    if not content:
        raise ApiException("Uploaded file is empty", 400)
    if len(content) > MEDIA_MAX_UPLOAD_SIZE_BYTES:
        raise ApiException("Uploaded file must be 8MB or less", 400)
    file_path = build_safe_storage_path(request.user_id, file.name)
    request.supabase.upload_storage(bucket, file_path, content, file.content_type or "application/octet-stream")
    return JsonResponse({"url": request.supabase.get_public_url(bucket, file_path)})


@api_view
@require_auth
def products_upload_video(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    return _upload_media(request, "video", {"video/mp4", "video/webm", "video/quicktime"})


@api_view
@require_auth
def products_upload_image(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    return _upload_media(request, "image", {"image/jpeg", "image/png", "image/webp"})


@api_view
@require_auth
def orders_selling(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    filters: dict[str, Any] = {"farmer_id": f"eq.{request.user_id}"}
    params = request.GET

    # Status filter: ?status=pending or ?status=confirmed,shipped
    status_raw = str(params.get("status") or "").strip().lower()
    if status_raw and status_raw != "all":
        statuses = [s.strip() for s in status_raw.split(",") if s.strip() in ORDER_STATUS_VALUES]
        if len(statuses) == 1:
            filters["status"] = f"eq.{statuses[0]}"
        elif statuses:
            filters["status"] = f"in.({','.join(statuses)})"

    # Payment status filter: ?payment_status=paid
    pstatus = str(params.get("payment_status") or "").strip().lower()
    VALID_PAYMENT_STATUSES = {"unpaid", "initiated", "pending_confirmation", "paid", "failed"}
    if pstatus and pstatus in VALID_PAYMENT_STATUSES:
        filters["payment_status"] = f"eq.{pstatus}"

    # Date range: ?from=2026-01-01&to=2026-12-31
    from_date = str(params.get("from") or "").strip()
    to_date = str(params.get("to") or "").strip()
    if from_date:
        filters["created_at"] = f"gte.{from_date}"
    if to_date:
        filters["created_at"] = f"lte.{to_date}"

    rows, _ = request.supabase.select("orders", filters=filters, order="created_at.desc")
    orders = attach_order_meta(request.supabase, rows or [])

    # Text search on product name: ?search=maize
    search = str(params.get("search") or "").strip().lower()
    if search:
        orders = [
            o for o in orders
            if search in str((o.get("product") or {}).get("name") or "").lower()
            or search in str(o.get("notes") or "").lower()
        ]

    return JsonResponse(orders, safe=False)


@api_view
@require_auth
def orders_buying(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    filters: dict[str, Any] = {"buyer_id": f"eq.{request.user_id}"}
    params = request.GET

    # Status filter: ?status=pending or ?status=confirmed,shipped
    status_raw = str(params.get("status") or "").strip().lower()
    if status_raw and status_raw != "all":
        statuses = [s.strip() for s in status_raw.split(",") if s.strip() in ORDER_STATUS_VALUES]
        if len(statuses) == 1:
            filters["status"] = f"eq.{statuses[0]}"
        elif statuses:
            filters["status"] = f"in.({','.join(statuses)})"

    # Payment status filter: ?payment_status=paid
    pstatus = str(params.get("payment_status") or "").strip().lower()
    VALID_PAYMENT_STATUSES = {"unpaid", "initiated", "pending_confirmation", "paid", "failed"}
    if pstatus and pstatus in VALID_PAYMENT_STATUSES:
        filters["payment_status"] = f"eq.{pstatus}"

    # Date range: ?from=2026-01-01&to=2026-12-31
    from_date = str(params.get("from") or "").strip()
    to_date = str(params.get("to") or "").strip()
    if from_date:
        filters["created_at"] = f"gte.{from_date}"
    if to_date:
        filters["created_at"] = f"lte.{to_date}"

    rows, _ = request.supabase.select("orders", filters=filters, order="created_at.desc")
    orders = attach_order_meta(request.supabase, rows or [])

    # Text search on product name: ?search=maize
    search = str(params.get("search") or "").strip().lower()
    if search:
        orders = [
            o for o in orders
            if search in str((o.get("product") or {}).get("name") or "").lower()
            or search in str(o.get("notes") or "").lower()
            or search in str((o.get("farmer_profile") or {}).get("full_name") or "").lower()
        ]

    return JsonResponse(orders, safe=False)


@api_view
@require_auth
def orders_root(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = parse_json_body(request)
    try:
        quantity = float(body.get("quantity"))
    except (TypeError, ValueError):
        raise ApiException("Quantity must be greater than 0", 400)
    product_id = str(body.get("product_id") or "").strip()
    if not product_id:
        raise ApiException("Product is required", 400)
    if quantity <= 0:
        raise ApiException("Quantity must be greater than 0", 400)
    provided_distance_km = _parse_optional_distance_km(body.get("delivery_distance_km"))

    product, _ = request.supabase.select(
        "products",
        select="id, farmer_id, unit, stock, is_available",
        filters={"id": f"eq.{product_id}"},
        single=True,
    )
    if not product:
        raise ApiException("Product not found", 404)
    if product.get("farmer_id") == request.user_id:
        raise ApiException("You cannot place an order for your own product", 400)

    buyer_county, seller_county = _resolve_buyer_farmer_counties(
        request.supabase,
        request.user_id,
        str(product.get("farmer_id") or ""),
    )
    delivery_quote = _build_delivery_quote(provided_distance_km, buyer_county, seller_county)
    pickup_county = _clean_optional_text(body.get("pickup_county")) or delivery_quote.get("pickup_county")
    notes = str(body.get("notes") or "").strip() or None
    order_rpc_payload = {
        "p_product_id": product_id,
        "p_quantity": quantity,
        "p_unit": body.get("unit") or product.get("unit"),
        "p_delivery_fee": delivery_quote["fee_kes"],
        "p_notes": notes,
        "p_delivery_distance_km": delivery_quote["distance_km"],
        "p_pickup_county": pickup_county,
    }

    try:
        result = request.supabase.rpc("place_marketplace_order_v2", order_rpc_payload)
        rows = result if isinstance(result, list) else [result] if result else []
        if not rows:
            raise ApiException("Order could not be created. Please try again.", 500)
        created_order = rows[0]
    except requests.HTTPError as exc:
        if not _is_missing_marketplace_order_rpc(exc):
            status_code = exc.response.status_code if exc.response is not None else 502
            raise ApiException(_upstream_error_message(exc), 400 if status_code < 500 else 502)
        logger.warning("place_marketplace_order_v2 is unavailable; using backend order fallback.")
        created_order = _create_marketplace_order_without_rpc(
            buyer_id=request.user_id,
            product_id=product_id,
            quantity=quantity,
            unit=body.get("unit") or product.get("unit"),
            delivery_quote=delivery_quote,
            pickup_county=pickup_county,
            notes=notes,
        )

    # Clear the buyer's cart item for this product now that the order is placed
    try:
        admin_client().delete(
            "cart_items",
            filters={"buyer_id": f"eq.{request.user_id}", "product_id": f"eq.{product_id}"},
        )
    except Exception as exc:
        logger.warning("Could not clear cart item after order %s: %s", created_order.get("id"), exc)

    # SMS notification to buyer and farmer
    try:
        buyer_phone = _fetch_profile_phone(admin_client(), request.user_id)
        farmer_id = str(product.get("farmer_id") or "")
        farmer_phone = _fetch_profile_phone(admin_client(), farmer_id) if farmer_id else None

        if buyer_phone:
            send_sms(
                buyer_phone,
                f"AgriLink X: You placed order #{created_order['id'][:8]} for {quantity} {product.get('unit', 'kg')}. Status: unpaid."
            )
        if farmer_phone:
            send_sms(
                farmer_phone,
                f"AgriLink X: New pending order #{created_order['id'][:8]} received. Awaiting buyer payment."
            )
    except Exception as sms_exc:
        logger.warning("Failed to send order placement SMS notifications: %s", sms_exc)

    return JsonResponse(attach_order_meta(request.supabase, [created_order])[0], status=201)


@api_view
@require_auth
def order_status(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    status = parse_json_body(request).get("status")
    if status not in ORDER_STATUS_VALUES:
        raise ApiException("Invalid status value", 400)
    existing, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "or": f"(farmer_id.eq.{request.user_id},buyer_id.eq.{request.user_id})"},
        single=True,
    )
    if not existing:
        raise ApiException("Order not found", 404)
    allowed = get_allowed_statuses(existing["status"], existing["farmer_id"] == request.user_id, str(existing.get("payment_status") or "unpaid"))
    if status not in allowed:
        raise ApiException(f"You cannot change an order from {existing['status']} to {status}.", 400)
    if status == "cancelled" and existing.get("status") != "cancelled":
        _restock_cancelled_order_item(request.supabase, existing)
    next_payment_status = str(existing.get("payment_status") or "unpaid")
    updates: dict[str, Any] = {
        "status": status,
        "payout_status": _derive_payout_status(status, next_payment_status),
    }
    updated = request.supabase.update("orders", updates, filters={"id": f"eq.{order_id}"}, single=True)
    _notify_order_status_change(updated)
    return JsonResponse(attach_order_meta(request.supabase, [updated])[0])


def _fetch_profile_phone(client, user_id: str) -> str | None:
    try:
        profile, _ = client.select("profiles", select="phone", filters={"user_id": f"eq.{user_id}"}, single=True)
        return profile.get("phone") if profile else None
    except Exception:
        return None


def _is_assigned_transporter_for_order(client, order_id: str, user_id: str) -> bool:
    try:
        dispatch, _ = client.select(
            "logistics_dispatches",
            select="id, status",
            filters={"order_id": f"eq.{order_id}", "transporter_id": f"eq.{user_id}"},
            single=True,
        )
        return str((dispatch or {}).get("status") or "") in {"accepted", "picked_up", "in_transit", "delivered"}
    except Exception:
        return False


def _notify_order_status_change(order: dict[str, Any]) -> None:
    """Send in-app notifications to buyer and farmer when order status changes."""
    order_id = str(order.get("id") or "")
    status = str(order.get("status") or "")
    buyer_id = str(order.get("buyer_id") or "")
    farmer_id = str(order.get("farmer_id") or "")
    admin = admin_client()

    STATUS_MESSAGES: dict[str, tuple[str, str, str, str]] = {
        # status: (buyer_title, buyer_msg, farmer_title, farmer_msg)
        "confirmed": (
            "Order confirmed", "Your order has been confirmed by the farmer and is being prepared.",
            "Order confirmed", "You confirmed an order. Please prepare the produce for delivery.",
        ),
        "processing": (
            "Order being processed", "Your produce is being prepared and packaged.",
            "Order in processing", "Your order is marked as processing. Update when shipped.",
        ),
        "shipped": (
            "Order shipped 🚚", "Your produce is on its way to the county office!",
            "Order shipped", "You marked the order as shipped. Buyer has been notified.",
        ),
        "delivered": (
            "Order delivered ✅", "Your produce arrived at the county office. Please confirm receipt with your OTP.",
            "Delivery marked", "You marked the order as delivered. Awaiting buyer OTP confirmation.",
        ),
        "cancelled": (
            "Order cancelled", "Your order was cancelled. Any paid amount will be reviewed for refund.",
            "Order cancelled", "An order was cancelled. Stock has been restored.",
        ),
    }
    if status not in STATUS_MESSAGES:
        return
    b_title, b_msg, f_title, f_msg = STATUS_MESSAGES[status]
    try:
        write_user_notifications(
            admin,
            user_ids=[uid for uid in [buyer_id, farmer_id] if uid],
            title=b_title if buyer_id else f_title,
            message=b_msg if buyer_id else f_msg,
            priority="high" if status in {"shipped", "delivered", "cancelled"} else "medium",
            category="update",
            entity_type="order",
            entity_id=order_id,
            action_url="/dashboard/orders",
            source="system",
        )
        # Per-user tailored messages
        if buyer_id:
            write_user_notification(admin, user_id=buyer_id, title=b_title, message=b_msg,
                priority="high" if status in {"shipped", "delivered", "cancelled"} else "medium",
                category="update", entity_type="order", entity_id=order_id, action_url="/dashboard/orders")
            # SMS notification
            b_phone = _fetch_profile_phone(admin, buyer_id)
            if b_phone:
                send_sms(b_phone, f"AgriLink X: {b_msg} (Order #{order_id[:8]})")

        if farmer_id:
            write_user_notification(admin, user_id=farmer_id, title=f_title, message=f_msg,
                priority="medium", category="update", entity_type="order", entity_id=order_id,
                action_url="/dashboard/orders")
            # SMS notification
            f_phone = _fetch_profile_phone(admin, farmer_id)
            if f_phone:
                send_sms(f_phone, f"AgriLink X: {f_msg} (Order #{order_id[:8]})")
    except Exception as exc:
        logger.warning("Failed to send order status notifications for %s: %s", order_id, exc)



@api_view
@require_auth
def order_cancel(request: HttpRequest, order_id: str):
    """Buyer-facing order cancellation — only allowed before payment is confirmed."""
    if request.method != "POST":
        return method_not_allowed(["POST"])

    order, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not order:
        raise ApiException("Order not found.", 404)

    current_status = str(order.get("status") or "")
    current_payment = str(order.get("payment_status") or "unpaid")

    if current_status == "cancelled":
        return JsonResponse(attach_order_meta(request.supabase, [order])[0])

    if current_payment == "paid":
        raise ApiException(
            "Payment was already confirmed. You cannot cancel a paid order. "
            "Please use the dispute option if there is a problem.",
            400,
        )
    if current_status in {"shipped", "delivered"}:
        raise ApiException(
            f"Orders that are '{current_status}' cannot be cancelled by the buyer.", 400
        )

    now_label = now_iso()
    body = parse_json_body(request)
    cancel_reason = _clean_optional_text(body.get("reason")) or "Cancelled by buyer"

    updated = admin_client().update(
        "orders",
        {
            "status": "cancelled",
            "payout_status": "cancelled",
            "payment_error": cancel_reason,
            "updated_at": now_label,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )

    # Restore stock
    _restock_cancelled_order_item(admin_client(), order)

    # Notify the farmer
    write_user_notification(
        admin_client(),
        user_id=str(order.get("farmer_id") or ""),
        title="Order cancelled by buyer",
        message=f"A buyer cancelled their order. Reason: {cancel_reason}. Stock has been restored.",
        priority="high",
        category="update",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/orders",
        source="user",
        source_user_id=request.user_id,
    )

    return JsonResponse(attach_order_meta(request.supabase, [updated])[0])


@api_view
@require_auth
def order_delivery_proof_image(request: HttpRequest, order_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found.", 404)
    is_seller = str(order.get("farmer_id") or "") == request.user_id
    is_assigned_transporter = _is_assigned_transporter_for_order(admin, order_id, request.user_id)
    if not is_seller and not is_assigned_transporter:
        raise ApiException("Only the seller or assigned transporter can upload delivery proof.", 403)
    if order.get("status") == "cancelled":
        raise ApiException("Cancelled orders cannot accept delivery proof.", 400)
    if order.get("status") not in {"processing", "shipped", "delivered"}:
        raise ApiException("Delivery proof can only be uploaded for active delivery orders.", 400)

    image = request.FILES.get("image")
    if not image:
        raise ApiException("Choose a delivery proof image to upload.", 400)
    if image.content_type not in DELIVERY_PROOF_ALLOWED_IMAGE_TYPES:
        raise ApiException("Delivery proof must be a JPEG, PNG, or WebP image.", 400)
    content = image.read()
    if not content:
        raise ApiException("Delivery proof image is empty.", 400)
    if len(content) > MEDIA_MAX_UPLOAD_SIZE_BYTES:
        raise ApiException("Delivery proof image must be 8MB or less.", 400)

    file_path = f"delivery-proofs/{order_id}/{build_safe_storage_path(request.user_id, image.name)}"
    admin.upload_storage("product-media", file_path, content, image.content_type or "application/octet-stream")
    return JsonResponse({"url": admin.get_public_url("product-media", file_path)})


@api_view
@require_auth
def order_delivery_proof(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    order, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "farmer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") == "cancelled":
        raise ApiException("Cancelled orders cannot accept delivery proof.", 400)
    if order.get("status") not in {"processing", "shipped", "delivered"}:
        raise ApiException("Delivery proof can only be submitted for active delivery orders.", 400)

    body = parse_json_body(request)
    proof_photo_url = _clean_optional_text(body.get("proof_photo_url") or body.get("photo_url"))
    if not proof_photo_url:
        raise ApiException("Delivery proof photo URL is required.", 400)
    proof_geo_lat = _parse_optional_coordinate(body.get("proof_geo_lat") or body.get("gps_lat"), "Delivery proof latitude", -90, 90)
    proof_geo_lng = _parse_optional_coordinate(body.get("proof_geo_lng") or body.get("gps_lng"), "Delivery proof longitude", -180, 180)
    proof_note = _clean_optional_text(body.get("proof_note") or body.get("note"))

    current_signoff_status = _normalize_delivery_signoff_status(order.get("delivery_signoff_status"), "pending_proof")
    next_signoff_status = "pending_buyer_confirmation" if current_signoff_status == "pending_proof" else current_signoff_status
    now_label = now_iso()
    updated = request.supabase.update(
        "orders",
        {
            "delivery_proof_photo_url": proof_photo_url,
            "delivery_proof_geo_lat": proof_geo_lat,
            "delivery_proof_geo_lng": proof_geo_lng,
            "delivery_proof_submitted_at": now_label,
            "delivery_proof_submitted_by": request.user_id,
            "delivery_proof_note": proof_note,
            "delivery_signoff_status": next_signoff_status,
            "dispute_deadline_at": None if next_signoff_status == "pending_buyer_confirmation" else order.get("dispute_deadline_at"),
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )
    write_user_notification(
        admin_client(),
        user_id=str(updated.get("buyer_id") or order.get("buyer_id") or "").strip() or None,
        title="Delivery proof submitted",
        message="The seller uploaded delivery proof. Please confirm delivery when you receive the produce.",
        priority="high",
        category="action",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/orders",
        source="user",
        source_user_id=request.user_id,
        metadata={"delivery_signoff_status": updated.get("delivery_signoff_status")},
    )
    return JsonResponse(attach_order_meta(request.supabase, [updated])[0])


@api_view
@require_auth
def order_delivery_otp_request(request: HttpRequest, order_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found.", 404)
    is_farmer = str(order.get("farmer_id") or "") == request.user_id
    is_assigned_transporter = _is_assigned_transporter_for_order(admin, order_id, request.user_id)
    if not is_farmer and not is_assigned_transporter:
        raise ApiException("Only the seller or assigned transporter can request this delivery OTP.", 403)
    if order.get("status") != "delivered":
        raise ApiException("Mark the order as delivered before requesting buyer OTP.", 400)
    if not _clean_optional_text(order.get("delivery_proof_photo_url")) and not is_assigned_transporter:
        raise ApiException("Submit delivery proof first before requesting buyer OTP.", 400)
    if order.get("payout_status") == "released":
        raise ApiException("Payout is already released for this order.", 400)

    otp_code = _generate_delivery_otp_code()
    now_dt = datetime.utcnow().replace(microsecond=0)
    now_label = now_dt.isoformat() + "Z"
    expires_at = (now_dt + timedelta(minutes=DELIVERY_OTP_TTL_MINUTES)).isoformat() + "Z"
    updated = admin.update(
        "orders",
        {
            "buyer_delivery_otp_hash": _hash_delivery_otp(order_id, otp_code),
            "buyer_delivery_otp_requested_at": now_label,
            "buyer_delivery_otp_expires_at": expires_at,
            "buyer_delivery_otp_verified_at": None,
            "buyer_delivery_otp_attempts": 0,
            "delivery_signoff_status": "pending_buyer_confirmation",
            "dispute_deadline_at": None,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )
    requester_label = "The transporter" if is_assigned_transporter and not is_farmer else "The seller"
    write_user_notification(
        admin,
        user_id=str(updated.get("buyer_id") or order.get("buyer_id") or "").strip() or None,
        title="Delivery confirmation code ready",
        message=f"{requester_label} requested delivery confirmation. Use the OTP shown in your orders workflow to confirm delivery.",
        priority="high",
        category="action",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/orders",
        source="user",
        source_user_id=request.user_id,
        metadata={"otp_expires_at": expires_at},
    )

    # Fetch buyer's phone to send SMS OTP
    buyer_id = str(updated.get("buyer_id") or order.get("buyer_id") or "")
    if buyer_id:
        buyer_phone = _fetch_profile_phone(admin, buyer_id)
        if buyer_phone:
            send_sms(
                buyer_phone,
                f"AgriLink X: Your OTP to confirm receipt of order #{order_id[:8]} is {otp_code}. Valid for {DELIVERY_OTP_TTL_MINUTES} mins."
            )

    return JsonResponse(
        {
            "message": "Buyer delivery OTP created.",
            "otp_code": otp_code,
            "otp_expires_at": expires_at,
            "order": attach_order_meta(admin, [updated])[0],
        }
    )


@api_view
@require_auth
def order_delivery_otp_verify(request: HttpRequest, order_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    order, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") != "delivered":
        raise ApiException("Only delivered orders can be buyer-confirmed.", 400)
    if order.get("payout_status") == "released":
        raise ApiException("Payout was already released for this order.", 400)

    body = parse_json_body(request)
    otp_code = str(body.get("otp_code") or body.get("otp") or "").strip()
    if not otp_code:
        raise ApiException("OTP code is required.", 400)

    now_dt = datetime.utcnow().replace(microsecond=0)
    now_label = now_dt.isoformat() + "Z"
    stored_hash = str(order.get("buyer_delivery_otp_hash") or "").strip()
    expires_at = _parse_iso_datetime(order.get("buyer_delivery_otp_expires_at"))
    if not stored_hash:
        raise ApiException("No active OTP found for this order.", 400)
    if expires_at and now_dt > expires_at:
        raise ApiException("Delivery OTP has expired. Request a new OTP code.", 400)

    expected_hash = _hash_delivery_otp(order_id, otp_code)
    if expected_hash != stored_hash:
        attempts = int(order.get("buyer_delivery_otp_attempts") or 0) + 1
        remaining = max(DELIVERY_OTP_MAX_ATTEMPTS - attempts, 0)
        updates: dict[str, Any] = {"buyer_delivery_otp_attempts": attempts}
        if attempts >= DELIVERY_OTP_MAX_ATTEMPTS:
            updates.update(
                {
                    "delivery_signoff_status": "disputed",
                    "dispute_reason": "Maximum OTP attempts reached. Admin review required.",
                    "dispute_opened_at": now_label,
                    "dispute_opened_by": request.user_id,
                    "dispute_resolved_at": None,
                    "dispute_resolution_note": None,
                }
            )
        request.supabase.update("orders", updates, filters={"id": f"eq.{order_id}"})
        if remaining == 0:
            raise ApiException("OTP attempts exceeded. Order has been flagged for admin review.", 400)
        raise ApiException(f"Invalid OTP code. {remaining} attempts remaining.", 400)

    dispute_deadline_at = (now_dt + timedelta(hours=DELIVERY_DISPUTE_WINDOW_HOURS)).isoformat() + "Z"
    updated = request.supabase.update(
        "orders",
        {
            "buyer_delivery_otp_hash": None,
            "buyer_delivery_otp_verified_at": now_label,
            "buyer_delivery_otp_attempts": 0,
            "delivery_signoff_status": "confirmed",
            "dispute_reason": None,
            "dispute_opened_at": None,
            "dispute_opened_by": None,
            "dispute_resolved_at": None,
            "dispute_resolution_note": None,
            "dispute_deadline_at": dispute_deadline_at,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )
    write_user_notification(
        admin_client(),
        user_id=str(updated.get("farmer_id") or order.get("farmer_id") or "").strip() or None,
        title="Buyer confirmed delivery",
        message="The buyer confirmed delivery. The order is now eligible for official payout release checks.",
        priority="high",
        category="update",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/orders",
        source="user",
        source_user_id=request.user_id,
        metadata={"delivery_signoff_status": updated.get("delivery_signoff_status")},
    )
    return JsonResponse(
        {
            "message": f"Delivery confirmed. Dispute window ends at {dispute_deadline_at}.",
            "order": attach_order_meta(request.supabase, [updated])[0],
        }
    )


@api_view
@require_auth
def order_raise_dispute(request: HttpRequest, order_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    order, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") != "delivered":
        raise ApiException("Only delivered orders can be disputed.", 400)
    if order.get("payout_status") == "released":
        raise ApiException("Payout was already released; this order can no longer be disputed.", 400)

    reason = _clean_optional_text(parse_json_body(request).get("reason"))
    if not reason:
        raise ApiException("Dispute reason is required.", 400)

    now_label = now_iso()
    updated = request.supabase.update(
        "orders",
        {
            "delivery_signoff_status": "disputed",
            "dispute_reason": reason,
            "dispute_opened_at": now_label,
            "dispute_opened_by": request.user_id,
            "dispute_resolved_at": None,
            "dispute_resolution_note": None,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )
    notifications_admin = admin_client()
    write_user_notification(
        notifications_admin,
        user_id=str(updated.get("farmer_id") or order.get("farmer_id") or "").strip() or None,
        title="Order dispute opened",
        message="A buyer opened a dispute for a delivered order. Review the dispute details in your order history.",
        priority="high",
        category="action",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/orders",
        source="user",
        source_user_id=request.user_id,
        metadata={"dispute_reason": reason},
    )
    admin_rows, _ = notifications_admin.select("user_roles", select="user_id", filters={"role": "eq.admin"})
    write_user_notifications(
        notifications_admin,
        user_ids=[str(item.get("user_id") or "").strip() for item in (admin_rows or [])],
        title="New order dispute requires review",
        message="A buyer has opened a delivery dispute. Review and resolve it from the admin disputes queue.",
        priority="high",
        category="action",
        entity_type="order",
        entity_id=order_id,
        action_url="/dashboard/admin/disputes",
        source="user",
        source_user_id=request.user_id,
        metadata={"dispute_reason": reason},
    )
    return JsonResponse(attach_order_meta(request.supabase, [updated])[0])


def attach_cart_meta(client, cart_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not cart_items:
        return []

    product_ids = sorted({item["product_id"] for item in cart_items if item.get("product_id")})
    products, _ = client.select(
        "products",
        select="id, farmer_id, name, image_emoji, cover_image_url, category, unit, price_per_unit, stock, is_available",
        filters={"id": f"in.{postgrest_in(product_ids)}"},
    )
    farmer_ids = sorted({item["farmer_id"] for item in products or [] if item.get("farmer_id")})
    profiles = load_profiles_by_user_ids(client, farmer_ids, "user_id, full_name, county") if farmer_ids else {}
    products_by_id = {row["id"]: row for row in products or []}

    result = []
    for item in cart_items:
        product = products_by_id.get(item.get("product_id"))
        farmer_profile = profiles.get(product.get("farmer_id")) if product else None
        result.append(
            {
                **item,
                "product": (
                    {
                        "id": product.get("id"),
                        "name": product.get("name"),
                        "category": product.get("category"),
                        "unit": product.get("unit"),
                        "price_per_unit": float(product.get("price_per_unit") or 0),
                        "stock": float(product.get("stock") or 0),
                        "is_available": bool(product.get("is_available")),
                        "image_emoji": product.get("image_emoji"),
                        "cover_image_url": product.get("cover_image_url"),
                    }
                    if product
                    else None
                ),
                "farmer_profile": (
                    {
                        "full_name": farmer_profile.get("full_name"),
                        "county": farmer_profile.get("county"),
                    }
                    if farmer_profile
                    else None
                ),
            }
        )
    return result


@api_view
@require_auth
def cart_root(request: HttpRequest):
    if request.method == "GET":
        rows, _ = request.supabase.select(
            "cart_items",
            filters={"buyer_id": f"eq.{request.user_id}"},
            order="created_at.desc",
        )
        return JsonResponse(attach_cart_meta(request.supabase, rows or []), safe=False)

    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])

    body = parse_json_body(request)
    product_id = str(body.get("product_id") or "").strip()
    if not product_id:
        raise ApiException("Product is required.", 400)
    selected_for_checkout = body.get("selected_for_checkout")
    if selected_for_checkout is not None and not isinstance(selected_for_checkout, bool):
        raise ApiException("selected_for_checkout must be true or false.", 400)
    try:
        quantity = float(body.get("quantity"))
    except (TypeError, ValueError):
        raise ApiException("Quantity must be greater than 0.", 400)
    if quantity <= 0:
        raise ApiException("Quantity must be greater than 0.", 400)

    product, _ = request.supabase.select(
        "products",
        select="id, farmer_id, unit, stock, is_available",
        filters={"id": f"eq.{product_id}"},
        single=True,
    )
    if not product:
        raise ApiException("Product not found.", 404)
    if product.get("farmer_id") == request.user_id:
        raise ApiException("You cannot add your own product to cart.", 400)
    if not bool(product.get("is_available")):
        raise ApiException("This product is not currently available.", 400)
    if float(product.get("stock") or 0) < quantity:
        raise ApiException(f"Only {product.get('stock')} {product.get('unit')} currently available.", 400)

    existing_item, _ = request.supabase.select(
        "cart_items",
        filters={"buyer_id": f"eq.{request.user_id}", "product_id": f"eq.{product_id}"},
        single=True,
    )
    if existing_item:
        next_quantity = round(float(existing_item.get("quantity") or 0) + quantity, 2)
        if next_quantity > float(product.get("stock") or 0):
            raise ApiException(f"Cart quantity exceeds available stock ({product.get('stock')} {product.get('unit')}).", 400)
        updated = request.supabase.update(
            "cart_items",
            {
                "quantity": next_quantity,
                "unit": str(body.get("unit") or product.get("unit") or existing_item.get("unit") or "").strip() or product.get("unit"),
                "notes": str(body.get("notes") or "").strip() or existing_item.get("notes"),
                "selected_for_checkout": selected_for_checkout if selected_for_checkout is not None else existing_item.get("selected_for_checkout", True),
            },
            filters={"id": f"eq.{existing_item['id']}"},
            single=True,
        )
        return JsonResponse(attach_cart_meta(request.supabase, [updated])[0])

    created = request.supabase.insert(
        "cart_items",
        {
            "buyer_id": request.user_id,
            "product_id": product_id,
            "quantity": quantity,
            "unit": str(body.get("unit") or product.get("unit") or "").strip() or product.get("unit"),
            "notes": str(body.get("notes") or "").strip() or None,
            "selected_for_checkout": selected_for_checkout if selected_for_checkout is not None else True,
        },
        single=True,
    )
    return JsonResponse(attach_cart_meta(request.supabase, [created])[0], status=201)


@api_view
@require_auth
def cart_item_detail(request: HttpRequest, item_id: str):
    if request.method == "DELETE":
        request.supabase.delete("cart_items", filters={"id": f"eq.{item_id}", "buyer_id": f"eq.{request.user_id}"})
        return JsonResponse({"success": True})

    if request.method != "PATCH":
        return method_not_allowed(["PATCH", "DELETE"])

    body = parse_json_body(request)
    existing, _ = request.supabase.select(
        "cart_items",
        filters={"id": f"eq.{item_id}", "buyer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not existing:
        raise ApiException("Cart item not found.", 404)

    updates: dict[str, Any] = {}
    if "quantity" in body:
        try:
            quantity = float(body.get("quantity"))
        except (TypeError, ValueError):
            raise ApiException("Quantity must be greater than 0.", 400)
        if quantity <= 0:
            raise ApiException("Quantity must be greater than 0.", 400)
        product, _ = request.supabase.select(
            "products",
            select="stock, unit",
            filters={"id": f"eq.{existing['product_id']}"},
            single=True,
        )
        if product and quantity > float(product.get("stock") or 0):
            raise ApiException(f"Only {product.get('stock')} {product.get('unit')} currently available.", 400)
        updates["quantity"] = quantity

    if "unit" in body:
        updates["unit"] = str(body.get("unit") or "").strip() or existing.get("unit")
    if "notes" in body:
        updates["notes"] = str(body.get("notes") or "").strip() or None
    if "selected_for_checkout" in body:
        if not isinstance(body.get("selected_for_checkout"), bool):
            raise ApiException("selected_for_checkout must be true or false.", 400)
        updates["selected_for_checkout"] = bool(body.get("selected_for_checkout"))

    if not updates:
        return JsonResponse(attach_cart_meta(request.supabase, [existing])[0])

    updated = request.supabase.update("cart_items", updates, filters={"id": f"eq.{item_id}"}, single=True)
    return JsonResponse(attach_cart_meta(request.supabase, [updated])[0])


@api_view
@require_auth
def profile_me(request: HttpRequest):
    fallback_full_name = request.auth_user.get("user_metadata", {}).get("full_name")
    if request.method == "GET":
        profile = ensure_profile_exists(request.supabase, request.user_id, fallback_full_name)
        role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
        if role in {"farmer_pro", "company"}:
            refreshed_profile, _ = request.supabase.select("profiles", filters={"user_id": f"eq.{request.user_id}"}, single=True)
            profile = refreshed_profile or profile
        return JsonResponse({"profile": profile, "role": role})
    if request.method != "PATCH":
        return method_not_allowed(["GET", "PATCH"])
    body = parse_json_body(request)
    existing_profile = ensure_profile_exists(request.supabase, request.user_id, fallback_full_name)
    update_payload = {}
    
    for field in [
        "full_name",
        "county",
        "farm_size",
        "main_crops",
        "bio",
        "farm_type",
        "irrigation_type",
        "soil_type",
        "has_storage",
        "has_transport",
        "cooperative_name",
    ]:
        if field in body:
            update_payload[field] = body.get(field)

    if "phone" in body:
        update_payload["phone"] = _normalize_optional_profile_phone(body.get("phone"))

    if "years_farming" in body:
        years_farming = body.get("years_farming")
        if years_farming in (None, ""):
            update_payload["years_farming"] = None
        else:
            try:
                update_payload["years_farming"] = int(years_farming)
            except (TypeError, ValueError):
                raise ApiException("Years farming must be a whole number.", 400)

    if "farm_gps_lat" in body:
        farm_gps_lat = body.get("farm_gps_lat")
        if farm_gps_lat in (None, ""):
            update_payload["farm_gps_lat"] = None
        else:
            try:
                update_payload["farm_gps_lat"] = float(farm_gps_lat)
            except (TypeError, ValueError):
                raise ApiException("Farm latitude must be a valid number.", 400)

    if "farm_gps_lng" in body:
        farm_gps_lng = body.get("farm_gps_lng")
        if farm_gps_lng in (None, ""):
            update_payload["farm_gps_lng"] = None
        else:
            try:
                update_payload["farm_gps_lng"] = float(farm_gps_lng)
            except (TypeError, ValueError):
                raise ApiException("Farm longitude must be a valid number.", 400)
            
    if "payout_method" in body:
        payout_method = body.get("payout_method") if body.get("payout_method") in {"mpesa", "bank"} else None
        update_payload["payout_method"] = payout_method
        update_payload["payout_mpesa_number"] = (
            _normalize_optional_profile_phone(body.get("payout_mpesa_number"), "M-Pesa number")
            if payout_method == "mpesa"
            else None
        )
        update_payload["bank_name"] = body.get("bank_name") if payout_method == "bank" else None
        update_payload["bank_account_name"] = body.get("bank_account_name") if payout_method == "bank" else None
        update_payload["bank_account_number"] = (
            _normalize_optional_account_number(body.get("bank_account_number"))
            if payout_method == "bank"
            else None
        )
        update_payload["payout_details_updated_at"] = now_iso() if payout_method else None

    if existing_profile.get("guarantors") is None:
        update_payload["guarantors"] = body.get("guarantors") if isinstance(body.get("guarantors"), list) else []
    elif "guarantors" in body and isinstance(body.get("guarantors"), list):
        update_payload["guarantors"] = body.get("guarantors")

    # Allow profile updates to succeed even if the connected Supabase table
    # has not yet received every latest optional migration column.
    supported_columns = set((existing_profile or {}).keys())
    update_payload = {key: value for key, value in update_payload.items() if key in supported_columns}

    if not update_payload:
        return JsonResponse(existing_profile)

    updated = request.supabase.update(
        "profiles",
        update_payload,
        filters={"user_id": f"eq.{request.user_id}"},
        single=True,
    )
    return JsonResponse(updated)


@api_view
@require_auth
def profile_me_role(request: HttpRequest):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    next_role = parse_json_body(request).get("role")
    if next_role not in {"farmer_free", "farmer_pro", "company"}:
        raise ApiException("Invalid role", 400)
    if next_role in PAID_PLAN_ROLES:
        raise ApiException("Paid plans must be activated through /api/payments/subscriptions/mpesa after successful payment.", 402)
    try:
        fallback_full_name = request.auth_user.get("user_metadata", {}).get("full_name")
        updated_profile = set_user_role_with_plan(request.user_id, next_role, fallback_full_name)
        invalidate_role_cache(request.user_id)
        return JsonResponse({"role": next_role, "profile": updated_profile})
    except Exception as e:
        raise ApiException(f"Role update failed: {str(e)}", 500)


@api_view
@require_auth
def profile_me_photo(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    photo = request.FILES.get("photo")
    if not photo:
        raise ApiException("No photo uploaded", 400)
    fallback_full_name = request.auth_user.get("user_metadata", {}).get("full_name")
    existing_profile = ensure_profile_exists(request.supabase, request.user_id, fallback_full_name)
    file_path = f"{request.user_id}/{int(datetime.utcnow().timestamp() * 1000)}_{photo.name}"
    request.supabase.upload_storage("profile-photos", file_path, photo.read(), photo.content_type or "application/octet-stream", upsert=True)
    update_payload = {"photo_url": request.supabase.get_public_url("profile-photos", file_path)}
    if existing_profile.get("guarantors") is None:
        update_payload["guarantors"] = []
    updated = request.supabase.update(
        "profiles",
        update_payload,
        filters={"user_id": f"eq.{request.user_id}"},
        single=True,
    )
    return JsonResponse(updated)


@api_view
@require_auth
def profiles_farmers(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    query = (request.GET.get("q") or "").strip().lower()
    rows, _ = admin_client().select(
        "profiles",
        select="user_id, full_name, county, farm_size, main_crops, farm_type, irrigation_type, soil_type, years_farming, has_storage, has_transport, cooperative_name, farm_gps_lat, farm_gps_lng, bio, photo_url",
        filters={"user_id": f"neq.{request.user_id}"},
        order="updated_at.desc",
        limit=50,
    )
    filtered = []
    for profile in rows or []:
        if not (profile.get("farm_size") or profile.get("county") or profile.get("bio") or profile.get("main_crops")):
            continue
        if query:
            haystack = " ".join(
                [
                    str(profile.get("full_name") or ""),
                    str(profile.get("county") or ""),
                    str(profile.get("farm_size") or ""),
                    str(profile.get("bio") or ""),
                    *[str(item) for item in profile.get("main_crops") or []],
                ]
            ).lower()
            if query not in haystack:
                continue
        filtered.append(profile)
    return JsonResponse(filtered, safe=False)


@api_view
def profile_public(request: HttpRequest, user_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    client = admin_client()
    profile, _ = client.select(
        "profiles",
        select="full_name, county, farm_size, main_crops, farm_type, irrigation_type, soil_type, years_farming, has_storage, has_transport, cooperative_name, farm_gps_lat, farm_gps_lng, bio, photo_url",
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )
    if not profile:
        raise ApiException("Profile not found", 404)
    product, _ = client.select(
        "products",
        select="video_url",
        filters={"farmer_id": f"eq.{user_id}", "video_url": "not.is.null"},
        order="created_at.desc",
        limit=1,
        single=True,
    )
    return JsonResponse({**profile, "video_url": (product or {}).get("video_url")})


@api_view
@require_auth
def payment_mpesa(request: HttpRequest, order_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    phone_number = normalize_kenyan_phone(str(parse_json_body(request).get("phoneNumber") or ""))
    order, _ = request.supabase.select("orders", filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"}, single=True)
    if not order:
        raise ApiException("Order not found", 404)
    if order["status"] == "cancelled":
        raise ApiException("Cancelled orders cannot be paid", 400)
    if order.get("payment_status") == "paid":
        raise ApiException("This order has already been paid", 400)
    amount = float(order.get("total_price") or 0) + float(order.get("delivery_fee") or 0)
    if amount <= 0:
        raise ApiException("Order amount must be greater than zero before requesting M-Pesa payment.", 400)
    try:
        stk = initiate_stk_push(phone_number, amount, order["id"][:12], f"AgriLink order {order['id'][:8]}")
    except Exception:
        if not mpesa_mock_enabled():
            raise
        stk = {
            "CheckoutRequestID": f"mock-checkout-{order['id']}",
            "MerchantRequestID": f"mock-merchant-{order['id']}",
            "CustomerMessage": "Sandbox mock payment started. Use Check Payment to confirm.",
            "ResponseDescription": "Sandbox mock payment started",
        }
    request.supabase.update(
        "orders",
        {
            "payment_method": "mpesa",
            "payment_status": "initiated",
            "checkout_request_id": stk["CheckoutRequestID"],
            "merchant_request_id": stk["MerchantRequestID"],
            "payment_ref": None,
            "payment_error": None,
            "payment_verification_started_at": now_iso(),
            "payment_verified_at": None,
        },
        filters={"id": f"eq.{order['id']}"},
    )
    return JsonResponse({"message": stk.get("CustomerMessage") or stk.get("ResponseDescription"), "checkoutRequestId": stk["CheckoutRequestID"], "merchantRequestId": stk["MerchantRequestID"]})


@api_view
@require_auth
def payment_mpesa_status(request: HttpRequest, order_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    order, _ = request.supabase.select("orders", filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"}, single=True)
    if not order:
        raise ApiException("Order not found", 404)
    if order.get("payment_status") == "paid":
        return JsonResponse({"payment_status": "paid", "resultCode": "0", "resultDesc": "Payment already confirmed"})
    if order.get("payment_status") == "failed":
        return JsonResponse(
            {
                "payment_status": "failed",
                "resultCode": "",
                "resultDesc": order.get("payment_error") or "The M-Pesa payment failed. Please start a new payment.",
            }
        )
    if not order.get("checkout_request_id"):
        raise ApiException("No M-Pesa request found for this order", 400)
    try:
        result = query_stk_push(order["checkout_request_id"])
    except Exception:
        if not mpesa_mock_enabled():
            raise
        result = {"ResultCode": "0", "ResultDesc": "Sandbox mock payment confirmed", "ResponseDescription": "Sandbox mock payment confirmed"}

    payment_status, result_code, result_desc = resolve_mpesa_payment_state(result)
    if payment_status == "paid":
        mark_order_paid(order["id"], order["checkout_request_id"], order.get("payment_ref"))
    elif payment_status == "failed":
        request.supabase.update(
            "orders",
            {
                "payment_status": "failed",
                "payment_error": result_desc,
                "payment_verification_started_at": order.get("payment_verification_started_at") or now_iso(),
            },
            filters={"id": f"eq.{order['id']}"},
        )
        # Restore stock so other buyers can purchase this product
        _restock_failed_order(admin_client(), order)
    else:
        request.supabase.update(
            "orders",
            {
                "payment_status": "pending_confirmation",
                "payment_error": None,
                "payment_verification_started_at": order.get("payment_verification_started_at") or now_iso(),
            },
            filters={"id": f"eq.{order['id']}"},
        )

    return JsonResponse({"payment_status": payment_status, "resultCode": result_code, "resultDesc": result_desc})


@api_view
@require_auth
def payment_subscription_mpesa(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = parse_json_body(request)
    plan_role = str(body.get("planRole") or body.get("role") or "").strip()
    if plan_role not in PAID_PLAN_ROLES:
        raise ApiException("Choose a valid paid plan role.", 400)

    phone_number = normalize_kenyan_phone(str(body.get("phoneNumber") or ""))
    amount_kes = _subscription_amount_kes(plan_role)
    checkout_desc = f"AgriLink {SUBSCRIPTION_PLAN_DEFAULTS[plan_role]['display_name']} plan"

    try:
        stk = initiate_stk_push(phone_number, amount_kes, f"PLAN-{request.user_id[:8]}", checkout_desc)
    except Exception:
        if not mpesa_mock_enabled():
            raise
        now_tag = int(datetime.utcnow().timestamp())
        stk = {
            "CheckoutRequestID": f"mock-plan-checkout-{request.user_id[:8]}-{now_tag}",
            "MerchantRequestID": f"mock-plan-merchant-{request.user_id[:8]}-{now_tag}",
            "CustomerMessage": "Sandbox mock subscription payment started. Use Check M-Pesa to confirm.",
            "ResponseDescription": "Sandbox mock subscription payment started",
        }

    created = request.supabase.insert(
        "subscription_payments",
        {
            "user_id": request.user_id,
            "plan_role": plan_role,
            "amount_kes": amount_kes,
            "currency": "KES",
            "payment_method": "mpesa",
            "payment_status": "initiated",
            "checkout_request_id": stk.get("CheckoutRequestID"),
            "merchant_request_id": stk.get("MerchantRequestID"),
            "payment_ref": None,
            "payment_error": None,
        },
        single=True,
    )
    return JsonResponse(
        {
            "message": stk.get("CustomerMessage") or stk.get("ResponseDescription"),
            "payment": created,
        },
        status=201,
    )


@api_view
@require_auth
def payment_subscription_mpesa_status(request: HttpRequest, payment_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    payment, _ = request.supabase.select(
        "subscription_payments",
        filters={"id": f"eq.{payment_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not payment:
        raise ApiException("Subscription payment not found.", 404)

    current_status = str(payment.get("payment_status") or "initiated")
    if current_status == "paid":
        profile, _ = request.supabase.select("profiles", filters={"user_id": f"eq.{request.user_id}"}, single=True)
        return JsonResponse(
            {
                "payment_status": "paid",
                "resultCode": "0",
                "resultDesc": "Subscription payment already confirmed.",
                "payment": payment,
                "role": payment.get("plan_role"),
                "profile": profile,
            }
        )

    checkout_request_id = payment.get("checkout_request_id")
    if not checkout_request_id:
        raise ApiException("No M-Pesa request found for this subscription payment.", 400)

    try:
        result = query_stk_push(str(checkout_request_id))
    except Exception:
        if not mpesa_mock_enabled():
            raise
        result = {
            "ResultCode": "0",
            "ResultDesc": "Sandbox mock subscription payment confirmed",
            "ResponseDescription": "Sandbox mock subscription payment confirmed",
            "MpesaReceiptNumber": f"MOCK-{str(payment_id)[:8]}",
        }

    payment_status, result_code, result_desc = resolve_mpesa_payment_state(result)
    admin = admin_client()
    if payment_status == "paid":
        receipt_number = _extract_mpesa_receipt_number(result)
        fallback_full_name = request.auth_user.get("user_metadata", {}).get("full_name")
        updated_payment, updated_profile = _activate_paid_subscription(
            str(payment["id"]),
            request.user_id,
            str(payment["plan_role"]),
            str(checkout_request_id),
            receipt_number,
            fallback_full_name,
        )
        return JsonResponse(
            {
                "payment_status": "paid",
                "resultCode": result_code,
                "resultDesc": result_desc,
                "payment": updated_payment,
                "role": payment.get("plan_role"),
                "profile": updated_profile,
            }
        )

    if payment_status == "failed":
        updated_payment = admin.update(
            "subscription_payments",
            {
                "payment_status": "failed",
                "payment_error": result_desc,
            },
            filters={"id": f"eq.{payment_id}"},
            single=True,
        )
        return JsonResponse(
            {
                "payment_status": "failed",
                "resultCode": result_code,
                "resultDesc": result_desc,
                "payment": updated_payment,
            }
        )

    updated_payment = admin.update(
        "subscription_payments",
        {
            "payment_status": "pending_confirmation",
            "payment_error": None,
        },
        filters={"id": f"eq.{payment_id}"},
        single=True,
    )
    return JsonResponse(
        {
            "payment_status": "pending_confirmation",
            "resultCode": result_code,
            "resultDesc": result_desc,
            "payment": updated_payment,
        }
    )


def _paid_loan_repayments(repayments: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        repayment
        for repayment in (repayments or [])
        if str(repayment.get("payment_status") or "paid").strip().lower() == "paid"
    ]


def _sync_micro_loan_repayment_payment(
    admin,
    checkout_request_id: str,
    payment_status: str,
    result_desc: str,
    receipt_number: str | None,
) -> None:
    repayment, _ = admin.select(
        "micro_loan_repayments",
        select="id, loan_application_id, user_id, amount, payment_method, payment_status, payment_ref, phone_number, checkout_request_id, created_at",
        filters={"checkout_request_id": f"eq.{checkout_request_id}"},
        single=True,
    )
    if not repayment:
        return

    if payment_status == "paid":
        admin.update(
            "micro_loan_repayments",
            {
                "payment_status": "paid",
                "payment_ref": receipt_number or repayment.get("payment_ref") or f"LN-{int(datetime.utcnow().timestamp())}",
                "payment_error": None,
                "verified_at": now_iso(),
            },
            filters={"id": f"eq.{repayment['id']}"},
            single=True,
        )
    elif payment_status == "failed":
        admin.update(
            "micro_loan_repayments",
            {"payment_status": "failed", "payment_error": result_desc},
            filters={"id": f"eq.{repayment['id']}"},
            single=True,
        )
        return
    else:
        admin.update(
            "micro_loan_repayments",
            {"payment_status": "pending_confirmation", "payment_error": None},
            filters={"id": f"eq.{repayment['id']}"},
            single=True,
        )
        return

    loan, _ = admin.select("micro_loan_applications", filters={"id": f"eq.{repayment['loan_application_id']}"}, single=True)
    if not loan:
        return
    repayments, _ = admin.select(
        "micro_loan_repayments",
        select="id, amount, payment_method, payment_status, payment_ref, phone_number, note, created_at, loan_application_id",
        filters={"loan_application_id": f"eq.{loan['id']}"},
        order="created_at.asc",
    )
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        _paid_loan_repayments(repayments or []),
    )
    next_status = "repaid" if float(schedule["summary"]["remainingBalance"]) <= 0 else loan["status"] if loan["status"] in {"approved", "disbursed"} else "disbursed"
    admin.update(
        "micro_loan_applications",
        {
            "status": next_status,
            "repayment_status": "repaid" if next_status == "repaid" else "on_track",
            "arrears_status": "repaid" if next_status == "repaid" else str(loan.get("arrears_status") or "current"),
            "ledger_status": "closed" if next_status == "repaid" else str(loan.get("ledger_status") or "open"),
            "disbursed_at": loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            "repaid_at": now_iso() if next_status == "repaid" else None,
            "updated_at": now_iso(),
        },
        filters={"id": f"eq.{loan['id']}"},
        single=True,
    )
    try:
        admin.insert(
            "micro_loan_ledger_entries",
            {
                "loan_application_id": loan["id"],
                "user_id": loan["user_id"],
                "entry_type": "repayment",
                "debit": 0,
                "credit": float(repayment.get("amount") or 0),
                "balance_after": float(schedule["summary"]["remainingBalance"]),
                "reference": receipt_number or repayment.get("payment_ref"),
                "note": "M-Pesa loan repayment confirmed from callback.",
            },
            single=True,
        )
    except Exception as exc:
        logger.warning("Failed to write loan repayment ledger entry from callback: %s", exc)


@api_view
def payment_mpesa_callback(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = parse_json_body(request)
    callback = (((body.get("Body") or {}).get("stkCallback")) if isinstance(body.get("Body"), dict) else {}) or {}
    checkout_request_id = callback.get("CheckoutRequestID")
    if not checkout_request_id:
        return JsonResponse({"ok": True})
    receipt_number = _extract_mpesa_receipt_number(callback)
    admin = admin_client()
    payment_status, _, resolved_desc = resolve_mpesa_payment_state(callback)
    if payment_status == "paid":
        order, _ = admin.select("orders", select="id", filters={"checkout_request_id": f"eq.{checkout_request_id}"}, single=True)
        if order:
            mark_order_paid(order["id"], checkout_request_id, receipt_number)
        subscription_payment, _ = admin.select(
            "subscription_payments",
            select="id, user_id, plan_role, checkout_request_id",
            filters={"checkout_request_id": f"eq.{checkout_request_id}"},
            single=True,
        )
        if subscription_payment and str(subscription_payment.get("plan_role") or "") in PAID_PLAN_ROLES:
            _activate_paid_subscription(
                str(subscription_payment["id"]),
                str(subscription_payment["user_id"]),
                str(subscription_payment["plan_role"]),
                str(subscription_payment.get("checkout_request_id") or checkout_request_id),
                receipt_number,
            )
        _sync_micro_loan_repayment_payment(admin, str(checkout_request_id), payment_status, resolved_desc, receipt_number)
    elif payment_status == "failed":
        failed_order, _ = admin.select(
            "orders",
            select="id, product_id, quantity, status, payment_status",
            filters={"checkout_request_id": f"eq.{checkout_request_id}"},
            single=True,
        )
        admin.update("orders", {"payment_status": "failed", "payment_error": resolved_desc}, filters={"checkout_request_id": f"eq.{checkout_request_id}"})
        if failed_order:
            _restock_failed_order(admin, failed_order)
        admin.update(
            "subscription_payments",
            {"payment_status": "failed", "payment_error": resolved_desc},
            filters={"checkout_request_id": f"eq.{checkout_request_id}"},
        )
        _sync_micro_loan_repayment_payment(admin, str(checkout_request_id), payment_status, resolved_desc, receipt_number)
    else:
        admin.update("orders", {"payment_status": "pending_confirmation", "payment_error": None}, filters={"checkout_request_id": f"eq.{checkout_request_id}"})
        admin.update(
            "subscription_payments",
            {"payment_status": "pending_confirmation", "payment_error": None},
            filters={"checkout_request_id": f"eq.{checkout_request_id}"},
        )
        _sync_micro_loan_repayment_payment(admin, str(checkout_request_id), payment_status, resolved_desc, receipt_number)
    return JsonResponse({"ok": True})


@api_view
@require_auth
def order_refund_request(request: HttpRequest, order_id: str):
    """Allows buyers to request a refund for paid orders that were cancelled."""
    if request.method != "POST":
        return method_not_allowed(["POST"])

    # Retrieve order
    order, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "buyer_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") != "cancelled" or order.get("payment_status") != "paid":
        raise ApiException("Refund requests are available only for paid orders that have been cancelled.", 400)

    # Check if a refund request already exists for this order
    existing_refund, _ = request.supabase.select(
        "refund_requests",
        filters={"order_id": f"eq.{order_id}"},
        single=True,
    )
    if existing_refund:
        return JsonResponse(
            {
                "message": "Refund request already exists for this order.",
                "refund": existing_refund,
            }
        )

    body = parse_json_body(request)
    reason = _clean_optional_text(body.get("reason"))
    if not reason:
        raise ApiException("Reason for refund is required.", 400)

    financials = compute_order_financials(order)
    amount = financials.get("escrow_amount", 0)
    if amount <= 0:
        raise ApiException("Order total amount is 0; no refund is due.", 400)

    refund_data = {
        "order_id": order_id,
        "buyer_id": request.user_id,
        "amount": amount,
        "reason": reason,
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    created = admin_client().insert("refund_requests", refund_data, single=True)

    # Write admin notification
    write_user_notification(
        admin_client(),
        user_id=None,
        title="New Refund Request",
        message=f"Buyer requested KES {amount} refund for order #{order_id[:8]}. Reason: {reason}",
        priority="high",
        category="action",
        entity_type="refund_request",
        entity_id=created.get("id"),
        action_url="/dashboard/admin/transactions",
        source="user",
        source_user_id=request.user_id,
    )

    return JsonResponse(created, status=201)
