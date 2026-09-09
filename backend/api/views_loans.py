from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
import logging
import uuid

from .common import (
    ApiException,
    LOAN_BRANCH_VISIT_STATUSES,
    LOAN_PRODUCT_TYPES,
    LOAN_SECURITY_TYPES,
    admin_client,
    api_view,
    build_loan_schedule,
    method_not_allowed,
    normalize_kenyan_phone,
    now_iso,
    parse_json_body,
    postgrest_in,
    require_auth,
    resolve_app_role,
    write_user_notification,
    write_user_notifications,
    initiate_stk_push,
    query_stk_push,
    resolve_mpesa_payment_state,
    mpesa_mock_enabled,
)
from .http import HttpRequest, JsonResponse

logger = logging.getLogger(__name__)

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

LOAN_REPAYMENT_STATUSES = {"initiated", "pending_confirmation", "paid", "failed"}
LOAN_DOCUMENT_STATUSES = {"submitted", "verified", "rejected", "waived"}


def parse_iso_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def paid_repayments(repayments: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        repayment
        for repayment in (repayments or [])
        if str(repayment.get("payment_status") or "paid").strip().lower() == "paid"
    ]


def extract_mpesa_receipt_number(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("MpesaReceiptNumber", "mpesaReceiptNumber", "ReceiptNumber", "receiptNumber"):
        value = payload.get(key)
        if value not in (None, ""):
            return str(value).strip()
    metadata = (((payload.get("CallbackMetadata") or {}).get("Item")) if isinstance(payload.get("CallbackMetadata"), dict) else []) or []
    for item in metadata:
        if str(item.get("Name") or "").strip() == "MpesaReceiptNumber" and item.get("Value") not in (None, ""):
            return str(item.get("Value")).strip()
    return None


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


def offer_matches_borrower_county(offer: dict[str, Any], borrower_county: str | None) -> bool:
    target_county = normalize_county_text(resolve_offer_target_county(offer))
    normalized_borrower_county = normalize_county_text(borrower_county)
    if not normalized_borrower_county or not target_county:
        return False
    return target_county in {"all counties", "all", normalized_borrower_county}


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


def serialize_loan_application(
    loan: dict[str, Any],
    repayments: list[dict[str, Any]],
    *,
    documents: list[dict[str, Any]] | None = None,
    voucher_redemptions: list[dict[str, Any]] | None = None,
    ledger_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    paid = paid_repayments(repayments)
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        paid,
    )
    operational = build_loan_operational_snapshot(loan, repayments, voucher_redemptions=voucher_redemptions)
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
        "credit_score": int(loan.get("credit_score") or 0),
        "credit_score_snapshot": loan.get("credit_score_snapshot") if isinstance(loan.get("credit_score_snapshot"), dict) else {},
        "eligibility_explanation": loan.get("eligibility_explanation") if isinstance(loan.get("eligibility_explanation"), list) else [],
        **operational,
        "repayments": repayments,
        "documents": documents or [],
        "voucher_redemptions": voucher_redemptions or [],
        "ledger_entries": ledger_entries or [],
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
    readiness = [
        {
            "key": "identity",
            "label": "Verified identity",
            "met": checks[0],
            "detail": "ID verification reduces fraud risk and unlocks formal lending review.",
            "points": 20,
        },
        {
            "key": "payout",
            "label": "Payout details completed",
            "met": checks[1],
            "detail": "A verified M-Pesa or bank payout method supports disbursement and collections.",
            "points": 15,
        },
        {
            "key": "profile",
            "label": "Profile and county completed",
            "met": checks[2],
            "detail": "Name, phone, and county let lenders match the borrower to local offers and branches.",
            "points": 10,
        },
        {
            "key": "orders",
            "label": "At least 2 successful orders in 90 days",
            "met": checks[3],
            "detail": f"{total_qualified_orders} qualified order{'s' if total_qualified_orders != 1 else ''} found in the last 90 days.",
            "points": min(20, total_qualified_orders * 5),
        },
        {
            "key": "revenue",
            "label": "At least KES 10,000 revenue in 90 days",
            "met": checks[4],
            "detail": f"Recent qualified revenue is KES {revenue_90:,.0f}.",
            "points": min(20, int(revenue_90 / 5000)),
        },
    ]
    score = sum(item["points"] for item in readiness if item["met"])
    if all_checks:
        score += 10
    credit_score = max(0, min(100, score))
    return {
        "isEligible": all_checks and eligible_amount > 0,
        "eligibleAmount": eligible_amount,
        "averageMonthlyRevenue": average_monthly_revenue,
        "totalQualifiedOrders": total_qualified_orders,
        "revenue90": revenue_90,
        "creditScore": credit_score,
        "readinessChecks": readiness,
        "missingRequirements": [item for item in readiness if not item["met"]],
    }


def loan_credit_snapshot(eligibility: dict[str, Any], role: str, requested_amount: float, outstanding: float) -> dict[str, Any]:
    return {
        "role": role,
        "creditScore": int(eligibility.get("creditScore") or 0),
        "eligibleAmount": float(eligibility.get("eligibleAmount") or 0),
        "requestedAmount": requested_amount,
        "outstandingLoanBalance": outstanding,
        "averageMonthlyRevenue": float(eligibility.get("averageMonthlyRevenue") or 0),
        "revenue90": float(eligibility.get("revenue90") or 0),
        "totalQualifiedOrders": int(eligibility.get("totalQualifiedOrders") or 0),
        "capturedAt": now_iso(),
    }


def build_loan_operational_snapshot(
    loan: dict[str, Any],
    repayments: list[dict[str, Any]] | None,
    *,
    voucher_redemptions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    paid = paid_repayments(repayments)
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        paid,
    )
    summary = schedule["summary"]
    status = str(loan.get("status") or "pending_review")
    remaining_balance = float(summary["remainingBalance"])
    principal = float(summary["principal"])
    start_date = parse_iso_datetime(summary.get("startDate")) or datetime.utcnow()
    repayment_days = max(1, int(loan.get("repayment_days") or 30))
    due_date = start_date + timedelta(days=repayment_days)
    paid_count = len(paid)
    next_due = start_date + timedelta(days=min(repayment_days, max(30, (paid_count + 1) * 30)))
    grace_period_days = int(loan.get("grace_period_days") or 7)

    if status in {"pending_review", "approved", "rejected"}:
        days_late = 0
        arrears_status = "current"
        repayment_status = "not_started"
    elif remaining_balance <= 0 or status == "repaid":
        days_late = 0
        arrears_status = "repaid"
        repayment_status = "repaid"
    else:
        now = datetime.utcnow()
        days_late = max(0, (now - due_date).days)
        if days_late > 30:
            arrears_status = "default_risk"
        elif days_late > grace_period_days:
            arrears_status = "overdue"
        elif days_late > 0:
            arrears_status = "grace"
        else:
            arrears_status = "current"
        repayment_status = "late" if arrears_status in {"overdue", "default_risk"} else "due" if arrears_status == "grace" else "on_track"

    security_type = normalize_security_type(loan.get("security_type"))
    requires_documents = bool(loan.get("requires_branch_visit")) or security_type != "unsecured" or bool(normalize_text_list(loan.get("required_documents")))
    branch_status = normalize_branch_visit_status(loan.get("branch_visit_status"), bool(loan.get("requires_branch_visit")))
    if not requires_documents:
        document_status = "not_required"
    elif branch_status == "waived":
        document_status = "waived"
    elif branch_status == "verified":
        document_status = "verified"
    elif normalize_collateral_items(loan.get("collateral_items")) or normalize_guarantors(loan.get("guarantors")):
        document_status = "submitted"
    else:
        document_status = str(loan.get("document_status") or "required")

    disbursement_method = str(loan.get("disbursement_method") or "mpesa")
    voucher_code = clean_optional_text(loan.get("voucher_code"))
    if disbursement_method != "voucher":
        voucher_status = "not_applicable"
    elif voucher_redemptions:
        voucher_status = "redeemed"
    elif voucher_code:
        voucher_status = "issued"
    else:
        voucher_status = "not_applicable"

    late_fee_amount = 0.0
    if arrears_status in {"overdue", "default_risk"}:
        late_fee_amount = round(max(50.0, principal * 0.01), 2)

    return {
        "due_date": due_date.replace(microsecond=0).isoformat() + "Z" if status not in {"pending_review", "approved", "rejected"} else None,
        "days_late": days_late,
        "late_fee_amount": late_fee_amount,
        "arrears_status": arrears_status,
        "next_payment_due_at": next_due.replace(microsecond=0).isoformat() + "Z" if repayment_status not in {"not_started", "repaid"} else None,
        "next_payment_amount": round(min(float(summary["scheduledPayment"]), remaining_balance), 2) if remaining_balance > 0 else 0,
        "repayment_status": repayment_status,
        "document_status": document_status,
        "voucher_status": voucher_status,
        "ledger_status": "closed" if repayment_status == "repaid" else str(loan.get("ledger_status") or "open"),
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
        select="id, loan_application_id, amount, payment_method, payment_status, payment_ref, phone_number, note, created_at",
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
            paid_repayments(repayments_by_loan.get(loan["id"], [])),
        )
        total += float(schedule["summary"]["remainingBalance"])
    return round(total, 2)


def group_by_loan_id(rows: list[dict[str, Any]] | None) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows or []:
        loan_id = row.get("loan_application_id")
        if loan_id:
            grouped.setdefault(str(loan_id), []).append(row)
    return grouped


def fetch_loan_related_records(client, loan_ids: list[str]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    if not loan_ids:
        return {"repayments": {}, "documents": {}, "voucher_redemptions": {}, "ledger_entries": {}}
    repayments, _ = client.select(
        "micro_loan_repayments",
        select="id, loan_application_id, amount, payment_method, payment_status, payment_ref, phone_number, note, checkout_request_id, merchant_request_id, payment_error, verified_at, created_at",
        filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
        order="created_at.asc",
    )
    try:
        documents, _ = client.select(
            "micro_loan_documents",
            filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
            order="created_at.desc",
        )
    except Exception as exc:
        logger.info("Loan documents table not available yet: %s", exc)
        documents = []
    try:
        voucher_redemptions, _ = client.select(
            "micro_loan_voucher_redemptions",
            filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
            order="redeemed_at.desc",
        )
    except Exception as exc:
        logger.info("Loan voucher redemptions table not available yet: %s", exc)
        voucher_redemptions = []
    try:
        ledger_entries, _ = client.select(
            "micro_loan_ledger_entries",
            filters={"loan_application_id": f"in.{postgrest_in(loan_ids)}"},
            order="created_at.asc",
        )
    except Exception as exc:
        logger.info("Loan ledger table not available yet: %s", exc)
        ledger_entries = []
    return {
        "repayments": group_by_loan_id(repayments),
        "documents": group_by_loan_id(documents),
        "voucher_redemptions": group_by_loan_id(voucher_redemptions),
        "ledger_entries": group_by_loan_id(ledger_entries),
    }


def persist_loan_operational_snapshot(client, loan: dict[str, Any], repayments: list[dict[str, Any]] | None, voucher_redemptions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    updates = build_loan_operational_snapshot(loan, repayments, voucher_redemptions=voucher_redemptions)
    updates["updated_at"] = now_iso()
    try:
        return client.update("micro_loan_applications", updates, filters={"id": f"eq.{loan['id']}"}, single=True)
    except Exception as exc:
        logger.warning("Failed to persist loan operational snapshot for %s: %s", loan.get("id"), exc)
        return {**loan, **updates}


def write_loan_ledger_entry(
    client,
    *,
    loan: dict[str, Any],
    entry_type: str,
    debit: float = 0,
    credit: float = 0,
    balance_after: float = 0,
    reference: str | None = None,
    note: str | None = None,
) -> None:
    try:
        client.insert(
            "micro_loan_ledger_entries",
            {
                "loan_application_id": loan["id"],
                "user_id": loan["user_id"],
                "entry_type": entry_type,
                "debit": round(float(debit or 0), 2),
                "credit": round(float(credit or 0), 2),
                "balance_after": round(float(balance_after or 0), 2),
                "reference": reference,
                "note": note,
            },
            single=True,
        )
    except Exception as exc:
        try:
            admin_client().insert(
                "micro_loan_ledger_entries",
                {
                    "loan_application_id": loan["id"],
                    "user_id": loan["user_id"],
                    "entry_type": entry_type,
                    "debit": round(float(debit or 0), 2),
                    "credit": round(float(credit or 0), 2),
                    "balance_after": round(float(balance_after or 0), 2),
                    "reference": reference,
                    "note": note,
                },
                single=True,
            )
        except Exception as admin_exc:
            logger.warning("Failed to write loan ledger entry for %s: %s / %s", loan.get("id"), exc, admin_exc)


def update_loan_after_repayments(client, loan: dict[str, Any], repayments: list[dict[str, Any]]) -> dict[str, Any]:
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        paid_repayments(repayments),
    )
    next_status = "repaid" if float(schedule["summary"]["remainingBalance"]) <= 0 else loan["status"] if loan["status"] in {"approved", "disbursed"} else "disbursed"
    base_updates = {
        "status": next_status,
        "disbursed_at": loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        "repaid_at": now_iso() if next_status == "repaid" else None,
        "updated_at": now_iso(),
    }
    base_updates.update(build_loan_operational_snapshot({**loan, **base_updates}, repayments))
    return client.update(
        "micro_loan_applications",
        base_updates,
        filters={"id": f"eq.{loan['id']}"},
        single=True,
    )


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
        if offer_matches_borrower_county(offer, borrower_county)
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
        related = fetch_loan_related_records(request.supabase, loan_ids)
        rows = [
            serialize_loan_application(
                loan,
                related["repayments"].get(loan["id"], []),
                documents=related["documents"].get(loan["id"], []),
                voucher_redemptions=related["voucher_redemptions"].get(loan["id"], []),
                ledger_entries=related["ledger_entries"].get(loan["id"], []),
            )
            for loan in loans or []
        ]
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
    outstanding_balance = fetch_outstanding_loan_balance(request.supabase, request.user_id)
    available_amount = eligibility["eligibleAmount"] - outstanding_balance
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
        if normalized_target_county not in {"all counties", "all", normalized_borrower_county}:
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

    score_snapshot = loan_credit_snapshot(eligibility, role, requested_amount, outstanding_balance)
    requires_documents = requires_branch_visit or security_type != "unsecured" or bool(required_documents)

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
            "credit_score": int(eligibility.get("creditScore") or 0),
            "credit_score_snapshot": score_snapshot,
            "eligibility_explanation": eligibility.get("readinessChecks") or [],
            "document_status": "required" if requires_documents else "not_required",
            "voucher_status": "issued" if voucher_code else "not_applicable",
            "repayment_status": "on_track" if application_status == "disbursed" else "not_started",
            "arrears_status": "current",
            "ledger_status": "open",
            "note": auto_note,
            "disbursed_at": now_iso() if application_status == "disbursed" else None,
            "reviewed_at": now_iso() if application_status == "disbursed" else None,
            "updated_at": now_iso(),
        },
        single=True,
    )
    created = persist_loan_operational_snapshot(request.supabase, created, [])
    if application_status == "disbursed":
        schedule = build_loan_schedule(created.get("approved_amount"), created.get("requested_amount"), created.get("interest_rate"), created.get("repayment_days"), created.get("disbursed_at") or created.get("created_at"), [])
        write_loan_ledger_entry(
            request.supabase,
            loan=created,
            entry_type="disbursement",
            debit=float(schedule["summary"]["principal"]),
            balance_after=float(schedule["summary"]["remainingBalance"]),
            reference=voucher_code or f"MPESA-{str(created.get('id'))[:8]}",
            note=f"{disbursement_method.upper()} loan disbursement opened.",
        )
    notification_admin = admin_client()
    write_user_notification(
        notification_admin,
        user_id=request.user_id,
        title="Loan application submitted",
        message=(
            "Your loan application is pending manual review."
            if application_status == "pending_review"
            else "Your loan was submitted and disbursed based on readiness checks."
        ),
        priority="high" if application_status == "pending_review" else "medium",
        category="update",
        entity_type="loan_application",
        entity_id=str(created.get("id") or "").strip() or None,
        action_url="/dashboard/micro-loans",
        source="user",
        source_user_id=request.user_id,
        metadata={"status": application_status, "product_type": selected_product_type},
    )
    if application_status == "pending_review":
        admin_rows, _ = notification_admin.select("user_roles", select="user_id", filters={"role": "eq.admin"})
        write_user_notifications(
            notification_admin,
            user_ids=[str(item.get("user_id") or "").strip() for item in (admin_rows or [])],
            title="New loan application pending review",
            message="A borrower submitted a loan application that requires manual review.",
            priority="high",
            category="action",
            entity_type="loan_application",
            entity_id=str(created.get("id") or "").strip() or None,
            action_url="/dashboard/admin/loan-decisions",
            source="user",
            source_user_id=request.user_id,
            metadata={
                "applicant_role": role,
                "product_type": selected_product_type,
                "target_county": target_county,
            },
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
        select="id, amount, payment_method, payment_status, payment_ref, phone_number, note, checkout_request_id, merchant_request_id, payment_error, verified_at, created_at, loan_application_id",
        filters={"loan_application_id": f"eq.{loan_id}"},
        order="created_at.asc",
    )
    schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        paid_repayments(repayments or []),
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
    if payment_method == "mpesa":
        try:
            stk = initiate_stk_push(phone_number, amount, f"LN-{loan_id[:8]}", f"AgriLink loan {loan_id[:8]}")
        except Exception:
            if not mpesa_mock_enabled():
                raise
            now_tag = int(datetime.utcnow().timestamp())
            stk = {
                "CheckoutRequestID": f"mock-loan-checkout-{loan_id[:8]}-{now_tag}",
                "MerchantRequestID": f"mock-loan-merchant-{loan_id[:8]}-{now_tag}",
                "CustomerMessage": "Sandbox mock loan repayment started. Use Check Payment to confirm.",
                "ResponseDescription": "Sandbox mock loan repayment started",
            }
        repayment = request.supabase.insert(
            "micro_loan_repayments",
            {
                "loan_application_id": loan_id,
                "user_id": request.user_id,
                "amount": amount,
                "payment_method": "mpesa",
                "payment_status": "initiated",
                "payment_ref": None,
                "phone_number": phone_number,
                "checkout_request_id": stk.get("CheckoutRequestID"),
                "merchant_request_id": stk.get("MerchantRequestID"),
                "payment_error": None,
                "note": f"M-Pesa repayment request initiated for {loan['product_title']}.",
            },
            single=True,
        )
        updated = persist_loan_operational_snapshot(request.supabase, loan, repayments or [])
        return JsonResponse(
            {
                "message": stk.get("CustomerMessage") or stk.get("ResponseDescription") or "M-Pesa repayment request initiated.",
                "payment_status": "initiated",
                "repayment": repayment,
                "loan": serialize_loan_application(updated, [*(repayments or []), repayment]),
            },
            status=201,
        )

    repayment = request.supabase.insert(
        "micro_loan_repayments",
        {
            "loan_application_id": loan_id,
            "user_id": request.user_id,
            "amount": amount,
            "payment_method": "pay_with_produce",
            "payment_status": "paid",
            "payment_ref": f"PWP-{int(datetime.utcnow().timestamp())}",
            "phone_number": None,
            "verified_at": now_iso(),
            "note": f"Pay with Produce repayment allocation posted to {loan['product_title']}.",
        },
        single=True,
    )
    all_repayments = [*(repayments or []), repayment]
    updated = update_loan_after_repayments(request.supabase, loan, all_repayments)
    next_schedule = build_loan_schedule(
        loan.get("approved_amount"),
        loan.get("requested_amount"),
        loan.get("interest_rate"),
        loan.get("repayment_days"),
        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
        paid_repayments(all_repayments),
    )
    write_loan_ledger_entry(
        request.supabase,
        loan=updated,
        entry_type="repayment",
        credit=amount,
        balance_after=float(next_schedule["summary"]["remainingBalance"]),
        reference=repayment.get("payment_ref"),
        note="Pay-with-Produce repayment posted.",
    )
    return JsonResponse(
        {
            "message": f"Pay with Produce repayment of KES {amount:.2f} received successfully.",
            "payment_status": "paid",
            "repayment": repayment,
            "loan": serialize_loan_application(updated, all_repayments),
        }
    )


@api_view
@require_auth
def micro_loan_repayment_status(request: HttpRequest, loan_id: str, repayment_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    loan, _ = request.supabase.select("micro_loan_applications", filters={"id": f"eq.{loan_id}", "user_id": f"eq.{request.user_id}"}, single=True)
    if not loan:
        raise ApiException("Loan application not found.", 404)
    repayment, _ = request.supabase.select(
        "micro_loan_repayments",
        select="id, loan_application_id, amount, payment_method, payment_status, payment_ref, phone_number, note, checkout_request_id, merchant_request_id, payment_error, verified_at, created_at",
        filters={"id": f"eq.{repayment_id}", "loan_application_id": f"eq.{loan_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not repayment:
        raise ApiException("Loan repayment not found.", 404)
    if repayment.get("payment_method") != "mpesa":
        return JsonResponse({"payment_status": repayment.get("payment_status") or "paid", "repayment": repayment, "loan": serialize_loan_application(loan, [repayment])})
    current_status = str(repayment.get("payment_status") or "paid")
    if current_status == "paid":
        related = fetch_loan_related_records(request.supabase, [loan_id])
        return JsonResponse(
            {
                "payment_status": "paid",
                "resultCode": "0",
                "resultDesc": "Loan repayment already confirmed.",
                "repayment": repayment,
                "loan": serialize_loan_application(loan, related["repayments"].get(loan_id, [])),
            }
        )
    checkout_request_id = repayment.get("checkout_request_id")
    if not checkout_request_id:
        raise ApiException("No M-Pesa request found for this loan repayment.", 400)
    try:
        result = query_stk_push(str(checkout_request_id))
    except Exception:
        if not mpesa_mock_enabled():
            raise
        result = {
            "ResultCode": "0",
            "ResultDesc": "Sandbox mock loan repayment confirmed",
            "ResponseDescription": "Sandbox mock loan repayment confirmed",
            "MpesaReceiptNumber": f"MOCK-LN-{str(repayment_id)[:8]}",
        }
    payment_status, result_code, result_desc = resolve_mpesa_payment_state(result)
    receipt_number = extract_mpesa_receipt_number(result)
    admin = admin_client()
    if payment_status == "paid":
        updated_repayment = admin.update(
            "micro_loan_repayments",
            {
                "payment_status": "paid",
                "payment_ref": receipt_number or repayment.get("payment_ref") or f"LN-{int(datetime.utcnow().timestamp())}",
                "payment_error": None,
                "verified_at": now_iso(),
            },
            filters={"id": f"eq.{repayment_id}"},
            single=True,
        )
    elif payment_status == "failed":
        updated_repayment = admin.update(
            "micro_loan_repayments",
            {"payment_status": "failed", "payment_error": result_desc},
            filters={"id": f"eq.{repayment_id}"},
            single=True,
        )
    else:
        updated_repayment = admin.update(
            "micro_loan_repayments",
            {"payment_status": "pending_confirmation", "payment_error": None},
            filters={"id": f"eq.{repayment_id}"},
            single=True,
        )
    related = fetch_loan_related_records(admin, [loan_id])
    all_repayments = related["repayments"].get(loan_id, [])
    updated_loan = update_loan_after_repayments(admin, loan, all_repayments) if payment_status == "paid" else persist_loan_operational_snapshot(admin, loan, all_repayments)
    if payment_status == "paid":
        next_schedule = build_loan_schedule(
            loan.get("approved_amount"),
            loan.get("requested_amount"),
            loan.get("interest_rate"),
            loan.get("repayment_days"),
            loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
            paid_repayments(all_repayments),
        )
        write_loan_ledger_entry(
            admin,
            loan=updated_loan,
            entry_type="repayment",
            credit=float(updated_repayment.get("amount") or 0),
            balance_after=float(next_schedule["summary"]["remainingBalance"]),
            reference=updated_repayment.get("payment_ref"),
            note="M-Pesa loan repayment confirmed.",
        )
    return JsonResponse(
        {
            "payment_status": payment_status,
            "resultCode": result_code,
            "resultDesc": result_desc,
            "repayment": updated_repayment,
            "loan": serialize_loan_application(updated_loan, all_repayments),
        }
    )


@api_view
@require_auth
def micro_loan_documents(request: HttpRequest, loan_id: str):
    loan, _ = request.supabase.select("micro_loan_applications", filters={"id": f"eq.{loan_id}", "user_id": f"eq.{request.user_id}"}, single=True)
    if not loan:
        raise ApiException("Loan application not found.", 404)
    if request.method == "GET":
        rows, _ = request.supabase.select("micro_loan_documents", filters={"loan_application_id": f"eq.{loan_id}"}, order="created_at.desc")
        return JsonResponse(rows or [], safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    body = parse_json_body(request)
    document_type = clean_optional_text(body.get("documentType") or body.get("document_type"))
    document_name = clean_optional_text(body.get("documentName") or body.get("document_name"))
    if not document_type or not document_name:
        raise ApiException("Document type and name are required.", 400)
    created = request.supabase.insert(
        "micro_loan_documents",
        {
            "loan_application_id": loan_id,
            "user_id": request.user_id,
            "document_type": document_type,
            "document_name": document_name,
            "document_url": clean_optional_text(body.get("documentUrl") or body.get("document_url")),
            "status": "submitted",
        },
        single=True,
    )
    updated_loan = request.supabase.update(
        "micro_loan_applications",
        {"document_status": "submitted", "updated_at": now_iso()},
        filters={"id": f"eq.{loan_id}"},
        single=True,
    )
    return JsonResponse({"document": created, "loan": serialize_loan_application(updated_loan, [])}, status=201)


@api_view
@require_auth
def micro_loan_voucher_redemptions(request: HttpRequest, loan_id: str):
    loan, _ = request.supabase.select("micro_loan_applications", filters={"id": f"eq.{loan_id}", "user_id": f"eq.{request.user_id}"}, single=True)
    if not loan:
        raise ApiException("Loan application not found.", 404)
    if request.method == "GET":
        rows, _ = request.supabase.select("micro_loan_voucher_redemptions", filters={"loan_application_id": f"eq.{loan_id}"}, order="redeemed_at.desc")
        return JsonResponse(rows or [], safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    if str(loan.get("disbursement_method") or "") != "voucher" or not loan.get("voucher_code"):
        raise ApiException("This loan does not have an active voucher.", 400)
    body = parse_json_body(request)
    dealer_name = clean_optional_text(body.get("dealerName") or body.get("dealer_name"))
    if not dealer_name:
        raise ApiException("Dealer name is required.", 400)
    redeemed_value = float(body.get("redeemedValue") or body.get("redeemed_value") or loan.get("approved_amount") or loan.get("requested_amount") or 0)
    admin = admin_client()
    created = admin.insert(
        "micro_loan_voucher_redemptions",
        {
            "loan_application_id": loan_id,
            "user_id": request.user_id,
            "voucher_code": loan["voucher_code"],
            "dealer_name": dealer_name,
            "dealer_location": clean_optional_text(body.get("dealerLocation") or body.get("dealer_location")),
            "redeemed_value": max(0, round(redeemed_value, 2)),
            "status": "redeemed",
            "note": clean_optional_text(body.get("note")),
        },
        single=True,
    )
    updated_loan = admin.update("micro_loan_applications", {"voucher_status": "redeemed", "updated_at": now_iso()}, filters={"id": f"eq.{loan_id}"}, single=True)
    schedule = build_loan_schedule(updated_loan.get("approved_amount"), updated_loan.get("requested_amount"), updated_loan.get("interest_rate"), updated_loan.get("repayment_days"), updated_loan.get("disbursed_at") or updated_loan.get("created_at"), [])
    write_loan_ledger_entry(
        admin,
        loan=updated_loan,
        entry_type="voucher_redemption",
        debit=redeemed_value,
        balance_after=float(schedule["summary"]["remainingBalance"]),
        reference=loan["voucher_code"],
        note=f"Voucher redeemed at {dealer_name}.",
    )
    return JsonResponse({"redemption": created, "loan": serialize_loan_application(updated_loan, [])}, status=201)
