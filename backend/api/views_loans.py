from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
import uuid

from .common import (
    ApiException,
    LOAN_BRANCH_VISIT_STATUSES,
    LOAN_PRODUCT_TYPES,
    LOAN_SECURITY_TYPES,
    api_view,
    build_loan_schedule,
    method_not_allowed,
    normalize_kenyan_phone,
    now_iso,
    parse_json_body,
    postgrest_in,
    require_auth,
    resolve_app_role,
)
from .http import HttpRequest, JsonResponse

PRODUCT_CONFIG = {
    "seasonal_working_capital": {
        "title": "Seasonal Working Capital",
        "multiplier": 0.35,
        "enterpriseMinimum": 35000,
        "farmerMinimum": 15000,
        "speedEnterprise": "Same-day review",
        "speedFarmer": "24-48h review",
        "interestEnterprise": 6.5,
        "interestFarmer": 8.5,
        "repaymentDaysEnterprise": 45,
        "repaymentDaysFarmer": 30,
    },
    "equipment_top_up": {
        "title": "Equipment Top-Up",
        "multiplier": 0.65,
        "enterpriseMinimum": 80000,
        "farmerMinimum": 30000,
        "speedEnterprise": "1 day release",
        "speedFarmer": "2 day release",
        "interestEnterprise": 7.5,
        "interestFarmer": 9.5,
        "repaymentDaysEnterprise": 90,
        "repaymentDaysFarmer": 60,
    },
    "buyer_contract_financing": {
        "title": "Buyer Contract Financing",
        "multiplier": 1,
        "enterpriseMinimum": 150000,
        "farmerMinimum": 50000,
        "speedEnterprise": "Priority lane",
        "speedFarmer": "Fast review",
        "interestEnterprise": 5.5,
        "interestFarmer": 7.5,
        "repaymentDaysEnterprise": 120,
        "repaymentDaysFarmer": 75,
    },
}

COLLATERAL_ITEM_KEYS = (
    "asset_type",
    "description",
    "owner_name",
    "document_reference",
    "estimated_value",
    "location",
    "notes",
)


def normalize_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = []
    for item in value:
        text = str(item or "").strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def normalize_security_type(value: Any) -> str:
    selected = str(value or "").strip()
    return selected if selected in LOAN_SECURITY_TYPES else "unsecured"


def clean_optional_text(value: Any) -> str | None:
    return str(value or "").strip() or None


def normalize_county_text(value: Any) -> str | None:
    cleaned = clean_optional_text(value)
    return cleaned.lower() if cleaned else None


def resolve_offer_target_county(offer: dict[str, Any]) -> str | None:
    return clean_optional_text(offer.get("target_county")) or clean_optional_text(offer.get("branch_location"))


def loan_requires_manual_review(security_type: str, requires_branch_visit: bool) -> bool:
    return requires_branch_visit or security_type != "unsecured"


def normalize_branch_visit_status(value: Any, requires_branch_visit: bool) -> str:
    if not requires_branch_visit:
        return "not_required"
    selected = str(value or "").strip()
    if selected in LOAN_BRANCH_VISIT_STATUSES and selected != "not_required":
        return selected
    return "pending_customer_visit"


def normalize_collateral_items(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    cleaned = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized: dict[str, Any] = {}
        for key in COLLATERAL_ITEM_KEYS:
            if key == "estimated_value":
                raw = item.get(key)
                if raw in (None, ""):
                    continue
                try:
                    amount = round(float(raw), 2)
                except (TypeError, ValueError):
                    continue
                if amount > 0:
                    normalized[key] = amount
                continue
            text = str(item.get(key) or "").strip()
            if text:
                normalized[key] = text
        if normalized:
            normalized.setdefault("asset_type", "other")
            cleaned.append(normalized)
    return cleaned


def normalize_guarantors(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in value:
        normalized: dict[str, Any] = {}
        if isinstance(item, dict):
            for raw_key, raw_value in item.items():
                key = str(raw_key or "").strip()
                text = str(raw_value or "").strip()
                if key and text:
                    normalized[key] = text
        else:
            text = str(item or "").strip()
            if text:
                normalized["name"] = text
        if normalized:
            cleaned.append(normalized)
    return cleaned


def serialize_loan_offer(offer: dict[str, Any], available_amount: float, eligibility: dict[str, Any], outstanding: float) -> dict[str, Any]:
    max_amount = float(offer.get("max_amount") or 0)
    requires_branch_visit = bool(offer.get("requires_branch_visit"))
    security_type = normalize_security_type(offer.get("security_type"))
    return {
        **offer,
        "max_amount": max_amount,
        "interest_rate": float(offer["interest_rate"]) if offer.get("interest_rate") is not None else None,
        "repayment_days": int(offer["repayment_days"]) if offer.get("repayment_days") is not None else None,
        "available_amount": min(available_amount, max_amount) if eligibility["isEligible"] else 0,
        "user_eligible": eligibility["isEligible"],
        "outstanding_loan_balance": outstanding,
        "requires_branch_visit": requires_branch_visit,
        "security_type": security_type,
        "branch_name": str(offer.get("branch_name") or "").strip() or None,
        "branch_location": str(offer.get("branch_location") or "").strip() or None,
        "target_county": resolve_offer_target_county(offer),
        "branch_instructions": str(offer.get("branch_instructions") or "").strip() or None,
        "collateral_types": normalize_text_list(offer.get("collateral_types")),
        "required_documents": normalize_text_list(offer.get("required_documents")),
    }


def serialize_loan_application(loan: dict[str, Any], repayments: list[dict[str, Any]]) -> dict[str, Any]:
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        repayments,
    )
    return {
        **loan,
        "requested_amount": float(loan.get("requested_amount") or 0),
        "approved_amount": float(loan["approved_amount"]) if loan.get("approved_amount") is not None else None,
        "interest_rate": float(loan["interest_rate"]) if loan.get("interest_rate") is not None else None,
        "repayment_days": int(loan["repayment_days"]) if loan.get("repayment_days") is not None else None,
        "guarantors": loan.get("guarantors") if isinstance(loan.get("guarantors"), list) else [],
        "requires_branch_visit": bool(loan.get("requires_branch_visit")),
        "security_type": normalize_security_type(loan.get("security_type")),
        "branch_name": str(loan.get("branch_name") or "").strip() or None,
        "branch_location": str(loan.get("branch_location") or "").strip() or None,
        "target_county": clean_optional_text(loan.get("target_county")) or clean_optional_text(loan.get("branch_location")),
        "branch_instructions": str(loan.get("branch_instructions") or "").strip() or None,
        "branch_visit_status": normalize_branch_visit_status(loan.get("branch_visit_status"), bool(loan.get("requires_branch_visit"))),
        "collateral_types": normalize_text_list(loan.get("collateral_types")),
        "required_documents": normalize_text_list(loan.get("required_documents")),
        "collateral_items": normalize_collateral_items(loan.get("collateral_items")),
        "repayments": repayments,
        "loan_summary": schedule["summary"],
        "amortization_schedule": schedule["schedule"],
    }


def get_eligibility_order_field(role: str) -> str:
    return "buyer_id" if role == "company" else "farmer_id"


def fetch_eligibility_orders(client, role: str, user_id: str) -> list[dict[str, Any]]:
    order_field = get_eligibility_order_field(role)
    orders, _ = client.select(
        "orders",
        select="total_price, created_at, status, payment_status",
        filters={order_field: f"eq.{user_id}"},
    )
    return orders or []


def compute_loan_eligibility(role: str, profile: dict[str, Any] | None, verification_status: str | None, orders: list[dict[str, Any]]) -> dict[str, Any]:
    ninety_days_ago = datetime.utcnow() - timedelta(days=90)
    qualified_orders = []
    for order in orders:
        created_at = datetime.fromisoformat(str(order["created_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
        status_ok = order.get("payment_status") == "paid" or order.get("status") in {"confirmed", "processing", "shipped", "delivered"}
        if status_ok and created_at >= ninety_days_ago:
            qualified_orders.append(order)
    revenue_90 = sum(float(item.get("total_price") or 0) for item in qualified_orders)
    total_qualified_orders = len(qualified_orders)
    average_monthly_revenue = revenue_90 / 3 if revenue_90 else 0
    has_payout = False
    if profile:
        if profile.get("payout_method") == "mpesa":
            has_payout = bool((profile.get("payout_mpesa_number") or "").strip())
        elif profile.get("payout_method") == "bank":
            has_payout = bool((profile.get("bank_name") or "").strip() and (profile.get("bank_account_name") or "").strip() and (profile.get("bank_account_number") or "").strip())
    checks = [
        verification_status == "verified",
        has_payout,
        bool((profile or {}).get("full_name") and (profile or {}).get("phone") and (profile or {}).get("county")),
        total_qualified_orders >= 2,
        revenue_90 >= 10000,
    ]
    all_checks = all(checks)
    score_multiplier = 1.1 if role == "company" else 0.8
    raw_eligible_amount = average_monthly_revenue * score_multiplier
    minimum = 25000 if role == "company" else 10000
    maximum = 1200000 if role == "company" else 250000
    eligible_amount = max(minimum, min(maximum, round(raw_eligible_amount / 1000) * 1000)) if all_checks else 0
    return {
        "isEligible": all_checks and eligible_amount > 0,
        "eligibleAmount": eligible_amount,
        "averageMonthlyRevenue": average_monthly_revenue,
        "totalQualifiedOrders": total_qualified_orders,
    }


def fetch_outstanding_loan_balance(client, user_id: str) -> float:
    loans, _ = client.select(
        "micro_loan_applications",
        filters={"user_id": f"eq.{user_id}", "status": 'in.("pending_review","approved","disbursed")'},
    )
    loan_ids = [loan["id"] for loan in loans or []]
    if not loan_ids:
        return 0
    repayments, _ = client.select(
        "micro_loan_repayments",
        select="id, loan_application_id, amount, payment_method, payment_ref, phone_number, note, created_at",
        filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
        order="created_at.asc",
    )
    repayments_by_loan = {}
    for repayment in repayments or []:
        repayments_by_loan.setdefault(repayment["loan_application_id"], []).append(repayment)
    total = 0.0
    for loan in loans or []:
        schedule = build_loan_schedule(
            loan.get("approved_amount"),
            loan.get("requested_amount"),
            loan.get("interest_rate"),
            loan.get("repayment_days"),
            loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            repayments_by_loan.get(loan["id"], []),
        )
        total += float(schedule["summary"]["remainingBalance"])
    return round(total, 2)


@api_view
@require_auth
def micro_loan_offers(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    role = resolve_app_role(request.supabase, request.user_id, request.requested_role)
    if role not in {"farmer_pro", "company"}:
        return JsonResponse([], safe=False)
    profile, _ = request.supabase.select(
        "profiles",
        select="full_name, phone, county, payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number",
        filters={"user_id": f"eq.{request.user_id}"},
        single=True,
    )
    borrower_county = normalize_county_text((profile or {}).get("county"))
    offers, _ = request.supabase.select("micro_loan_offers", filters={"is_active": "eq.true", "applicant_role": f"eq.{role}"}, order="created_at.desc")
    matching_offers = [
        offer
        for offer in offers or []
        if borrower_county and normalize_county_text(resolve_offer_target_county(offer)) == borrower_county
    ]
    verification, _ = request.supabase.select("id_verifications", select="status", filters={"user_id": f"eq.{request.user_id}"}, single=True)
    eligibility_orders = fetch_eligibility_orders(request.supabase, role, request.user_id)
    eligibility = compute_loan_eligibility(role, profile, (verification or {}).get("status"), eligibility_orders)
    outstanding = fetch_outstanding_loan_balance(request.supabase, request.user_id) if eligibility["isEligible"] else 0
    available = max(0, eligibility["eligibleAmount"] - outstanding)
    rows = [serialize_loan_offer(offer, available, eligibility, outstanding) for offer in matching_offers]
    return JsonResponse(rows, safe=False)


@api_view
@require_auth
def micro_loan_applications(request: HttpRequest):
    if request.method == "GET":
        loans, _ = request.supabase.select("micro_loan_applications", filters={"user_id": f"eq.{request.user_id}"}, order="created_at.desc")
        loan_ids = [loan["id"] for loan in loans or []]
        repayments = []
        if loan_ids:
            repayments, _ = request.supabase.select(
                "micro_loan_repayments",
                select="id, loan_application_id, amount, payment_method, payment_ref, phone_number, note, created_at",
                filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
                order="created_at.asc",
            )
        repayments_by_loan = {}
        for repayment in repayments or []:
            repayments_by_loan.setdefault(repayment["loan_application_id"], []).append(repayment)
        rows = [serialize_loan_application(loan, repayments_by_loan.get(loan["id"], [])) for loan in loans or []]
        return JsonResponse(rows, safe=False)

    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    body = parse_json_body(request)
    role = resolve_app_role(request.supabase, request.user_id, request.requested_role)
    if role not in {"farmer_pro", "company"}:
        raise ApiException("Upgrade required before borrowing.", 403)
    try:
        requested_amount = float(body.get("requestedAmount"))
    except (TypeError, ValueError):
        raise ApiException("Requested amount must be a valid number.", 400)
    if requested_amount <= 0:
        raise ApiException("Requested amount must be greater than zero.", 400)
    requested_amount = round(requested_amount, 2)
    profile, _ = request.supabase.select(
        "profiles",
        select="full_name, phone, county, payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number",
        filters={"user_id": f"eq.{request.user_id}"},
        single=True,
    )
    borrower_county = clean_optional_text((profile or {}).get("county"))
    normalized_borrower_county = normalize_county_text(borrower_county)
    if not normalized_borrower_county:
        raise ApiException("Add your county on your profile before applying for a county-based loan.", 400)
    verification, _ = request.supabase.select("id_verifications", select="status", filters={"user_id": f"eq.{request.user_id}"}, single=True)
    eligibility_orders = fetch_eligibility_orders(request.supabase, role, request.user_id)
    eligibility = compute_loan_eligibility(role, profile, (verification or {}).get("status"), eligibility_orders)
    if not eligibility["isEligible"]:
        raise ApiException("You are not eligible for borrowing yet. Complete readiness requirements first.", 400)
    offer_id = body.get("offerId")
    product_type = body.get("productType")
    available_amount = eligibility["eligibleAmount"] - fetch_outstanding_loan_balance(request.supabase, request.user_id)
    if offer_id:
        offer, _ = request.supabase.select(
            "micro_loan_offers",
            filters={"id": f"eq.{offer_id}", "is_active": "eq.true", "applicant_role": f"eq.{role}"},
            single=True,
        )
        if not offer:
            raise ApiException("Loan offer not found or no longer active.", 404)
        selected_product_type = offer["product_type"]
        product_title = offer["product_title"]
        speed = offer.get("speed")
        interest_rate = float(offer.get("interest_rate") or 0)
        repayment_days = int(offer.get("repayment_days") or 0)
        target_county = resolve_offer_target_county(offer)
        normalized_target_county = normalize_county_text(target_county)
        if not normalized_target_county:
            raise ApiException("This loan offer is missing a target county. Ask admin to update it first.", 400)
        if normalized_target_county != normalized_borrower_county:
            raise ApiException(f"This loan is only available to borrowers registered in {target_county}.", 403)
        max_allowed = min(available_amount, float(offer.get("max_amount") or 0))
        security_type = normalize_security_type(offer.get("security_type"))
        requires_branch_visit = bool(offer.get("requires_branch_visit"))
        branch_name = str(offer.get("branch_name") or "").strip() or None
        branch_location = str(offer.get("branch_location") or "").strip() or None
        branch_instructions = str(offer.get("branch_instructions") or "").strip() or None
        collateral_types = normalize_text_list(offer.get("collateral_types"))
        required_documents = normalize_text_list(offer.get("required_documents"))
    else:
        if product_type not in LOAN_PRODUCT_TYPES:
            raise ApiException("Invalid loan product selected.", 400)
        config = PRODUCT_CONFIG[product_type]
        selected_product_type = product_type
        product_title = config["title"]
        speed = config["speedEnterprise"] if role == "company" else config["speedFarmer"]
        interest_rate = config["interestEnterprise"] if role == "company" else config["interestFarmer"]
        repayment_days = config["repaymentDaysEnterprise"] if role == "company" else config["repaymentDaysFarmer"]
        max_allowed = max(
            available_amount * config["multiplier"],
            config["enterpriseMinimum"] if role == "company" else config["farmerMinimum"],
        )
        security_type = "unsecured"
        requires_branch_visit = False
        branch_name = None
        branch_location = None
        target_county = borrower_county
        branch_instructions = None
        collateral_types = []
        required_documents = []
    duplicate, _ = request.supabase.select(
        "micro_loan_applications",
        select="id, product_title",
        filters={"user_id": f"eq.{request.user_id}", "product_type": f"eq.{selected_product_type}", "status": 'in.("pending_review","approved","disbursed")'},
        order="created_at.desc",
        limit=1,
        single=True,
    )
    if duplicate:
        raise ApiException(f"You already have this loan type ({duplicate['product_title']}) in progress. Finish it before applying for the same one again.", 400)
    if requested_amount > max_allowed:
        raise ApiException(f"Requested amount exceeds your current limit for {product_title}.", 400)
    approved_amount = round(requested_amount / 100) * 100
    guarantors = normalize_guarantors(body.get("guarantors"))
    collateral_items = normalize_collateral_items(body.get("collateralItems"))
    branch_visit_acknowledged = bool(body.get("branchVisitAcknowledged"))
    manual_review_required = loan_requires_manual_review(security_type, requires_branch_visit)
    if security_type == "guarantor" and not guarantors:
        raise ApiException("Add at least one guarantor before submitting this guaranteed loan request.", 400)
    if security_type == "collateral" and not collateral_items:
        raise ApiException("Add at least one collateral item such as a title deed or logbook before submitting this secured loan.", 400)
    if requires_branch_visit and not branch_visit_acknowledged:
        raise ApiException("Confirm that you will visit the branch with the required documents before submitting this loan.", 400)
    application_status = "pending_review" if manual_review_required else "disbursed"
    branch_visit_status = normalize_branch_visit_status(None, requires_branch_visit)
    auto_note = f"Auto-approved from live financing readiness checks at {interest_rate}% interest over {repayment_days} days."
    if manual_review_required:
        review_bits = []
        if security_type == "guarantor":
            review_bits.append("guarantor confirmation")
        if security_type == "collateral":
            review_bits.append("collateral verification")
        if requires_branch_visit:
            review_bits.append("branch document handover")
        auto_note = "Pending manual review for " + ", ".join(review_bits) + "."

    disbursement_method = str(body.get("disbursementMethod") or "mpesa").strip().lower()
    if disbursement_method not in ("mpesa", "voucher"):
        disbursement_method = "mpesa"
    
    repayment_method = str(body.get("repaymentMethod") or "mpesa").strip().lower()
    if repayment_method not in ("mpesa", "pay_with_produce"):
        repayment_method = "mpesa"
    if repayment_method == "pay_with_produce" and role != "farmer_pro":
        raise ApiException("Pay with Produce is available for Farmer Pro loans only right now.", 400)
        
    voucher_code = None
    if disbursement_method == "voucher" and application_status == "disbursed":
        voucher_code = f"ALV-{str(uuid.uuid4())[:8].upper()}"

    created = request.supabase.insert(
        "micro_loan_applications",
        {
            "user_id": request.user_id,
            "applicant_role": role,
            "product_type": selected_product_type,
            "product_title": product_title,
            "requested_amount": requested_amount,
            "approved_amount": approved_amount,
            "speed": speed,
            "interest_rate": interest_rate,
            "repayment_days": repayment_days,
            "status": application_status,
            "guarantors": guarantors,
            "security_type": security_type,
            "requires_branch_visit": requires_branch_visit,
            "branch_name": branch_name,
            "branch_location": branch_location,
            "target_county": target_county,
            "branch_instructions": branch_instructions,
            "branch_visit_status": branch_visit_status,
            "collateral_types": collateral_types,
            "required_documents": required_documents,
            "collateral_items": collateral_items,
            "disbursement_method": disbursement_method,
            "repayment_method": repayment_method,
            "voucher_code": voucher_code,
            "note": auto_note,
            "disbursed_at": now_iso() if application_status == "disbursed" else None,
            "reviewed_at": now_iso() if application_status == "disbursed" else None,
            "updated_at": now_iso(),
        },
        single=True,
    )
    return JsonResponse(serialize_loan_application(created, []), status=201)


@api_view
@require_auth
def micro_loan_repay(request: HttpRequest, loan_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = parse_json_body(request)
    try:
        amount = float(body.get("amount"))
    except (TypeError, ValueError):
        raise ApiException("Repayment amount must be greater than zero.", 400)
    if amount <= 0:
        raise ApiException("Repayment amount must be greater than zero.", 400)
    loan, _ = request.supabase.select("micro_loan_applications", filters={"id": f"eq.{loan_id}", "user_id": f"eq.{request.user_id}"}, single=True)
    if not loan:
        raise ApiException("Loan application not found.", 404)
    if loan["status"] == "rejected":
        raise ApiException("Rejected loans cannot be repaid.", 400)
    if loan["status"] == "repaid":
        raise ApiException("This loan is already fully repaid.", 400)
    if loan["status"] != "disbursed":
        raise ApiException("This loan is not disbursed yet. Complete review and branch verification first.", 400)
    repayments, _ = request.supabase.select(
        "micro_loan_repayments",
        select="id, amount, payment_method, payment_ref, phone_number, note, created_at, loan_application_id",
        filters={"loan_application_id": f"eq.{loan_id}"},
        order="created_at.asc",
    )
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        repayments or [],
    )
    if schedule["summary"]["remainingBalance"] <= 0:
        raise ApiException("This loan is already fully repaid.", 400)
    if amount > schedule["summary"]["remainingBalance"]:
        raise ApiException(f"Repayment exceeds the current balance of KES {schedule['summary']['remainingBalance']:.2f}.", 400)

    loan_repayment_method = str(loan.get("repayment_method") or "mpesa").strip().lower()
    if loan_repayment_method not in {"mpesa", "pay_with_produce"}:
        loan_repayment_method = "mpesa"
    requested_payment_method = str(body.get("paymentMethod") or "").strip().lower()
    payment_method = requested_payment_method if requested_payment_method in {"mpesa", "pay_with_produce"} else loan_repayment_method
    if payment_method != loan_repayment_method:
        expected = "Pay with Produce" if loan_repayment_method == "pay_with_produce" else "M-Pesa"
        raise ApiException(f"This loan is configured for {expected} repayments.", 400)

    phone_number = normalize_kenyan_phone(str(body.get("phoneNumber") or "")) if payment_method == "mpesa" else None
    payment_ref_prefix = "LN" if payment_method == "mpesa" else "PWP"
    repayment_note = (
        f"M-Pesa repayment posted to {loan['product_title']}."
        if payment_method == "mpesa"
        else f"Pay with Produce repayment allocation posted to {loan['product_title']}."
    )

    repayment = request.supabase.insert(
        "micro_loan_repayments",
        {
            "loan_application_id": loan_id,
            "user_id": request.user_id,
            "amount": amount,
            "payment_method": payment_method,
            "payment_ref": f"{payment_ref_prefix}-{int(datetime.utcnow().timestamp())}",
            "phone_number": phone_number,
            "note": repayment_note,
        },
        single=True,
    )
    next_schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        [*(repayments or []), repayment],
    )
    next_status = "repaid" if next_schedule["summary"]["remainingBalance"] <= 0 else loan["status"] if loan["status"] in {"approved", "disbursed"} else "disbursed"
    updated = request.supabase.update(
        "micro_loan_applications",
        {
            "status": next_status,
            "disbursed_at": loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            "repaid_at": now_iso() if next_status == "repaid" else None,
            "updated_at": now_iso(),
        },
        filters={"id": f"eq.{loan_id}"},
        single=True,
    )
    success_label = "M-Pesa" if payment_method == "mpesa" else "Pay with Produce"
    return JsonResponse(
        {
            "message": f"{success_label} repayment of KES {amount:.2f} received successfully.",
            "repayment": repayment,
            "loan": serialize_loan_application(updated, [*(repayments or []), repayment]),
        }
    )
