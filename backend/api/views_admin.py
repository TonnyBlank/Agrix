from __future__ import annotations

from datetime import datetime, timedelta

from .common import (
    ApiException,
    LOAN_PRODUCT_TYPES,
    admin_client,
    api_view,
    escape_csv,
    load_profiles_by_user_ids,
    method_not_allowed,
    now_iso,
    parse_json_body,
    postgrest_in,
    require_auth,
    resolve_app_role,
    set_user_role_with_plan,
)
from .http import HttpRequest, HttpResponse, JsonResponse
from .views_core import attach_order_meta
from .views_loans import (
    compute_loan_eligibility,
    normalize_branch_visit_status,
    normalize_collateral_items,
    normalize_security_type,
    normalize_text_list,
)


BRANCH_DISBURSEMENT_READY_STATUSES = {"verified", "waived"}


def ensure_admin(request: HttpRequest):
    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role != "admin":
        raise ApiException("Admin access required.", 403)


@api_view
@require_auth
def admin_overview(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    _, users_count = admin.select("profiles", select="user_id", head=True, count="exact")
    _, products_count = admin.select("products", select="id", head=True, count="exact")
    _, orders_count = admin.select("orders", select="id", head=True, count="exact")
    _, loans_count = admin.select("micro_loan_applications", select="id", head=True, count="exact")
    _, pending_loans_count = admin.select("micro_loan_applications", select="id", filters={"status": "eq.pending_review"}, head=True, count="exact")
    _, pending_verifications_count = admin.select("id_verifications", select="id", filters={"status": 'in.("pending_review","unverified")'}, head=True, count="exact")
    _, admin_count = admin.select("user_roles", select="id", filters={"role": "eq.admin"}, head=True, count="exact")
    loans, _ = admin.select("micro_loan_applications", select="approved_amount, requested_amount")
    total_approved_loan_value = sum(float(row.get("approved_amount") or row.get("requested_amount") or 0) for row in loans or [])
    return JsonResponse(
        {
            "usersCount": users_count or 0,
            "productsCount": products_count or 0,
            "ordersCount": orders_count or 0,
            "loansCount": loans_count or 0,
            "pendingLoansCount": pending_loans_count or 0,
            "pendingVerificationsCount": pending_verifications_count or 0,
            "adminCount": admin_count or 0,
            "totalApprovedLoanValue": total_approved_loan_value,
        }
    )


@api_view
@require_auth
def admin_analytics(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    orders, _ = admin.select("orders", select="id, product_id, quantity, total_price, status, payment_status, created_at", order="created_at.asc")
    product_ids = sorted({order["product_id"] for order in orders or []})
    products, _ = admin.select("products", select="id, name, category", filters={"id": f"in.{postgrest_in(product_ids)}"} if product_ids else {})
    products_by_id = {product["id"]: product for product in products or []}
    now = datetime.utcnow()
    months = []
    lookup = {}
    for index in range(6):
        dt = datetime(now.year, now.month, 1) - timedelta(days=30 * (5 - index))
        key = f"{dt.year}-{dt.month}"
        row = {"key": key, "month": dt.strftime("%b"), "orders": 0, "revenue": 0}
        months.append(row)
        lookup[key] = row
    crop_demand = {}
    for order in orders or []:
        if order.get("status") == "cancelled":
            continue
        dt = datetime.fromisoformat(str(order["created_at"]).replace("Z", "+00:00"))
        key = f"{dt.year}-{dt.month}"
        if key in lookup:
            lookup[key]["orders"] += 1
            lookup[key]["revenue"] += float(order.get("total_price") or 0)
        if order.get("payment_status") == "paid" or order.get("status") in {"confirmed", "processing", "shipped", "delivered"}:
            product = products_by_id.get(order["product_id"], {})
            crop = (product.get("name") or product.get("category") or "Unknown crop").strip()
            entry = crop_demand.setdefault(crop, {"crop": crop, "orders": 0, "quantity": 0, "revenue": 0})
            entry["orders"] += 1
            entry["quantity"] += float(order.get("quantity") or 0)
            entry["revenue"] += float(order.get("total_price") or 0)
    demand = sorted(crop_demand.values(), key=lambda item: (-item["orders"], -item["quantity"], -item["revenue"]))
    return JsonResponse({"orderTrend": months, "cropDemand": demand[:8], "topCrop": demand[0] if demand else None})


@api_view
@require_auth
def admin_users(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    profiles, _ = admin.select("profiles", select="user_id, full_name, county, phone, created_at, updated_at", order="created_at.desc")
    roles, _ = admin.select("user_roles", select="user_id, role")
    auth_users = admin.auth_admin_list_users()
    role_by_id = {item["user_id"]: item["role"] for item in roles or []}
    auth_by_id = {item["id"]: item for item in auth_users}
    rows = []
    for profile in profiles or []:
        auth_user = auth_by_id.get(profile["user_id"], {})
        rows.append({**profile, "email": auth_user.get("email"), "email_confirmed_at": auth_user.get("email_confirmed_at"), "last_sign_in_at": auth_user.get("last_sign_in_at"), "role": role_by_id.get(profile["user_id"], "farmer_free")})
    return JsonResponse(rows, safe=False)


@api_view
@require_auth
def admin_user_role(request: HttpRequest, user_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    next_role = parse_json_body(request).get("role")
    if next_role not in {"farmer_free", "farmer_pro", "buyer_enterprise", "admin"}:
        raise ApiException("Invalid role", 400)
    updated_profile = set_user_role_with_plan(user_id, next_role)
    return JsonResponse(
        {
            "user_id": user_id,
            "role": next_role,
            "plan_started_at": updated_profile.get("plan_started_at"),
            "plan_expires_at": updated_profile.get("plan_expires_at"),
        }
    )


@api_view
@require_auth
def admin_orders(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    orders, _ = admin_client().select("orders", order="created_at.desc", limit=100)
    return JsonResponse(attach_order_meta(admin_client(), orders or []), safe=False)


@api_view
@require_auth
def admin_loan_candidates(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    roles, _ = admin.select("user_roles", select="user_id, role", filters={"role": 'in.("farmer_pro","buyer_enterprise")'})
    profiles, _ = admin.select("profiles", select="user_id, full_name, county, phone, payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number")
    verifications, _ = admin.select("id_verifications", select="user_id, status")
    orders, _ = admin.select("orders", select="farmer_id, buyer_id, total_price, created_at, status, payment_status")
    role_by_id = {item["user_id"]: item["role"] for item in roles or []}
    qualified_ids = set(role_by_id)
    verification_by_id = {item["user_id"]: item["status"] for item in verifications or []}
    orders_by_user = {}
    for order in orders or []:
        farmer_id = order.get("farmer_id")
        buyer_id = order.get("buyer_id")
        if farmer_id in qualified_ids and role_by_id.get(farmer_id) == "farmer_pro":
            orders_by_user.setdefault(farmer_id, []).append(order)
        if buyer_id in qualified_ids and role_by_id.get(buyer_id) == "buyer_enterprise":
            orders_by_user.setdefault(buyer_id, []).append(order)
    rows = []
    for profile in profiles or []:
        role = role_by_id.get(profile["user_id"])
        if not role:
            continue
        eligibility = compute_loan_eligibility(role, profile, verification_by_id.get(profile["user_id"]), orders_by_user.get(profile["user_id"], []))
        if eligibility["isEligible"]:
            rows.append({"user_id": profile["user_id"], "full_name": profile.get("full_name"), "county": profile.get("county"), "phone": profile.get("phone"), "role": role, **eligibility})
    rows.sort(key=lambda item: item["eligibleAmount"], reverse=True)
    return JsonResponse(rows, safe=False)


@api_view
@require_auth
def admin_loan_offers(request: HttpRequest):
    ensure_admin(request)
    admin = admin_client()
    if request.method == "GET":
        offers, _ = admin.select("micro_loan_offers", order="created_at.desc")
        rows = [
            {
                **offer,
                "max_amount": float(offer.get("max_amount") or 0),
                "interest_rate": float(offer["interest_rate"]) if offer.get("interest_rate") is not None else None,
                "repayment_days": int(offer["repayment_days"]) if offer.get("repayment_days") is not None else None,
                "security_type": normalize_security_type(offer.get("security_type")),
                "requires_branch_visit": bool(offer.get("requires_branch_visit")),
                "branch_name": str(offer.get("branch_name") or "").strip() or None,
                "branch_location": str(offer.get("branch_location") or "").strip() or None,
                "branch_instructions": str(offer.get("branch_instructions") or "").strip() or None,
                "collateral_types": normalize_text_list(offer.get("collateral_types")),
                "required_documents": normalize_text_list(offer.get("required_documents")),
            }
            for offer in offers or []
        ]
        return JsonResponse(rows, safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    body = parse_json_body(request)
    if body.get("applicant_role") not in {"farmer_pro", "buyer_enterprise"}:
        raise ApiException("Applicant role must be farmer_pro or buyer_enterprise.", 400)
    if body.get("product_type") not in LOAN_PRODUCT_TYPES:
        raise ApiException("Select a valid loan product type.", 400)
    if not str(body.get("product_title") or "").strip():
        raise ApiException("Loan product title is required.", 400)
    max_amount = float(body.get("max_amount") or 0)
    if max_amount <= 0:
        raise ApiException("Maximum offer amount must be greater than zero.", 400)
    security_type = normalize_security_type(body.get("security_type"))
    requires_branch_visit = bool(body.get("requires_branch_visit"))
    collateral_types = normalize_text_list(body.get("collateral_types"))
    required_documents = normalize_text_list(body.get("required_documents"))
    if security_type == "collateral" and not collateral_types:
        raise ApiException("List the accepted collateral types before publishing a secured loan offer.", 400)
    created = admin.insert(
        "micro_loan_offers",
        {
            "applicant_role": body["applicant_role"],
            "product_type": body["product_type"],
            "product_title": str(body["product_title"]).strip(),
            "max_amount": max_amount,
            "interest_rate": float(body["interest_rate"]) if body.get("interest_rate") not in (None, "") else None,
            "repayment_days": int(float(body["repayment_days"])) if body.get("repayment_days") not in (None, "") else None,
            "speed": str(body.get("speed") or "").strip() or None,
            "note": str(body.get("note") or "").strip() or None,
            "security_type": security_type,
            "requires_branch_visit": requires_branch_visit,
            "branch_name": str(body.get("branch_name") or "").strip() or None,
            "branch_location": str(body.get("branch_location") or "").strip() or None,
            "branch_instructions": str(body.get("branch_instructions") or "").strip() or None,
            "collateral_types": collateral_types,
            "required_documents": required_documents,
            "is_active": True,
            "updated_at": now_iso(),
        },
        single=True,
    )
    return JsonResponse(created, status=201)


@api_view
@require_auth
def admin_loan_offer_detail(request: HttpRequest, offer_id: str):
    ensure_admin(request)
    admin = admin_client()
    if request.method == "PATCH":
        body = parse_json_body(request)
        existing, _ = admin.select("micro_loan_offers", filters={"id": f"eq.{offer_id}"}, single=True)
        if not existing:
            raise ApiException("Loan offer not found.", 404)
        updates = {"updated_at": now_iso()}
        if "product_title" in body:
            if not str(body.get("product_title") or "").strip():
                raise ApiException("Loan product title is required.", 400)
            updates["product_title"] = str(body["product_title"]).strip()
        if "max_amount" in body:
            max_amount = float(body["max_amount"])
            if max_amount <= 0:
                raise ApiException("Maximum offer amount must be greater than zero.", 400)
            updates["max_amount"] = max_amount
        if "interest_rate" in body:
            updates["interest_rate"] = float(body["interest_rate"]) if body["interest_rate"] not in (None, "") else None
        if "repayment_days" in body:
            updates["repayment_days"] = int(float(body["repayment_days"])) if body["repayment_days"] not in (None, "") else None
        if "speed" in body:
            updates["speed"] = str(body.get("speed") or "").strip() or None
        if "note" in body:
            updates["note"] = str(body.get("note") or "").strip() or None
        if "is_active" in body:
            updates["is_active"] = bool(body.get("is_active"))
        if "security_type" in body:
            updates["security_type"] = normalize_security_type(body.get("security_type"))
        if "requires_branch_visit" in body:
            updates["requires_branch_visit"] = bool(body.get("requires_branch_visit"))
        if "branch_name" in body:
            updates["branch_name"] = str(body.get("branch_name") or "").strip() or None
        if "branch_location" in body:
            updates["branch_location"] = str(body.get("branch_location") or "").strip() or None
        if "branch_instructions" in body:
            updates["branch_instructions"] = str(body.get("branch_instructions") or "").strip() or None
        if "collateral_types" in body:
            updates["collateral_types"] = normalize_text_list(body.get("collateral_types"))
        if "required_documents" in body:
            updates["required_documents"] = normalize_text_list(body.get("required_documents"))
        next_security_type = updates.get("security_type", normalize_security_type(existing.get("security_type")))
        next_collateral_types = updates.get("collateral_types", normalize_text_list(existing.get("collateral_types")))
        if next_security_type == "collateral" and not next_collateral_types:
            raise ApiException("Secured collateral offers must list at least one accepted collateral type.", 400)
        updated = admin.update("micro_loan_offers", updates, filters={"id": f"eq.{offer_id}"}, single=True)
        return JsonResponse(updated)
    if request.method == "DELETE":
        admin.delete("micro_loan_offers", filters={"id": f"eq.{offer_id}"})
        return HttpResponse(status=204)
    return method_not_allowed(["PATCH", "DELETE"])


@api_view
@require_auth
def admin_loans(request: HttpRequest):
    ensure_admin(request)
    admin = admin_client()
    if request.method == "GET":
        loans, _ = admin.select("micro_loan_applications", order="created_at.desc", limit=100)
        profiles = load_profiles_by_user_ids(admin, sorted({loan["user_id"] for loan in loans or []}), "user_id, full_name, county, phone")
        return JsonResponse(
            [
                {
                    **loan,
                    "security_type": normalize_security_type(loan.get("security_type")),
                    "requires_branch_visit": bool(loan.get("requires_branch_visit")),
                    "branch_name": str(loan.get("branch_name") or "").strip() or None,
                    "branch_location": str(loan.get("branch_location") or "").strip() or None,
                    "branch_instructions": str(loan.get("branch_instructions") or "").strip() or None,
                    "branch_visit_status": normalize_branch_visit_status(loan.get("branch_visit_status"), bool(loan.get("requires_branch_visit"))),
                    "collateral_types": normalize_text_list(loan.get("collateral_types")),
                    "required_documents": normalize_text_list(loan.get("required_documents")),
                    "collateral_items": normalize_collateral_items(loan.get("collateral_items")),
                    "guarantors": loan.get("guarantors") if isinstance(loan.get("guarantors"), list) else [],
                    "profile": profiles.get(loan["user_id"]),
                }
                for loan in loans or []
            ],
            safe=False,
        )
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    body = parse_json_body(request)
    if not str(body.get("user_id") or "").strip():
        raise ApiException("A valid borrower user ID is required.", 400)
    if body.get("applicant_role") not in {"farmer_pro", "buyer_enterprise"}:
        raise ApiException("Applicant role must be farmer_pro or buyer_enterprise.", 400)
    if body.get("product_type") not in LOAN_PRODUCT_TYPES:
        raise ApiException("Select a valid loan product type.", 400)
    if not str(body.get("product_title") or "").strip():
        raise ApiException("Loan product title is required.", 400)
    requested_amount = float(body.get("requested_amount") or 0)
    if requested_amount <= 0:
        raise ApiException("Requested amount must be greater than zero.", 400)
    status = body.get("status") or "approved"
    if status not in {"pending_review", "approved", "rejected", "disbursed", "repaid"}:
        raise ApiException("Invalid loan status.", 400)
    security_type = normalize_security_type(body.get("security_type"))
    requires_branch_visit = bool(body.get("requires_branch_visit"))
    branch_visit_status = normalize_branch_visit_status(body.get("branch_visit_status"), requires_branch_visit)
    guarantors = body.get("guarantors") if isinstance(body.get("guarantors"), list) else []
    collateral_items = normalize_collateral_items(body.get("collateral_items"))
    collateral_types = normalize_text_list(body.get("collateral_types"))
    required_documents = normalize_text_list(body.get("required_documents"))
    if security_type == "guarantor" and not guarantors:
        raise ApiException("Guaranteed loans need at least one guarantor.", 400)
    if security_type == "collateral" and not collateral_items:
        raise ApiException("Secured loans need at least one collateral item.", 400)
    if status == "disbursed" and requires_branch_visit and branch_visit_status not in BRANCH_DISBURSEMENT_READY_STATUSES:
        raise ApiException("Branch-based loans can only be disbursed after branch verification is marked verified or waived.", 400)
    profile, _ = admin.select("profiles", select="user_id, full_name, county, phone", filters={"user_id": f"eq.{body['user_id']}"}, single=True)
    if not profile:
        raise ApiException("Borrower profile not found.", 404)
    created = admin.insert(
        "micro_loan_applications",
        {
            "user_id": body["user_id"],
            "applicant_role": body["applicant_role"],
            "product_type": body["product_type"],
            "product_title": str(body["product_title"]).strip(),
            "requested_amount": requested_amount,
            "approved_amount": float(body["approved_amount"]) if body.get("approved_amount") not in (None, "") else requested_amount,
            "speed": str(body.get("speed") or "").strip() or None,
            "status": status,
            "note": str(body.get("note") or "").strip() or None,
            "interest_rate": float(body["interest_rate"]) if body.get("interest_rate") not in (None, "") else None,
            "repayment_days": int(float(body["repayment_days"])) if body.get("repayment_days") not in (None, "") else None,
            "guarantors": guarantors,
            "security_type": security_type,
            "requires_branch_visit": requires_branch_visit,
            "branch_name": str(body.get("branch_name") or "").strip() or None,
            "branch_location": str(body.get("branch_location") or "").strip() or None,
            "branch_instructions": str(body.get("branch_instructions") or "").strip() or None,
            "branch_visit_status": branch_visit_status,
            "collateral_types": collateral_types,
            "required_documents": required_documents,
            "collateral_items": collateral_items,
            "disbursed_at": now_iso() if status == "disbursed" else None,
            "repaid_at": now_iso() if status == "repaid" else None,
            "reviewed_at": now_iso(),
            "updated_at": now_iso(),
        },
        single=True,
    )
    return JsonResponse({**created, "profile": profile}, status=201)


@api_view
@require_auth
def admin_loan_detail(request: HttpRequest, loan_id: str):
    ensure_admin(request)
    admin = admin_client()
    if request.method == "PATCH":
        body = parse_json_body(request)
        if "status" in body and body["status"] not in {"pending_review", "approved", "rejected", "disbursed", "repaid"}:
            raise ApiException("Invalid loan status.", 400)
        existing, _ = admin.select("micro_loan_applications", filters={"id": f"eq.{loan_id}"}, single=True)
        if not existing:
            raise ApiException("Loan application not found.", 404)
        updates = {"updated_at": now_iso()}
        for key in ["status", "note"]:
            if key in body:
                updates[key] = body[key]
        if "approved_amount" in body:
            updates["approved_amount"] = float(body["approved_amount"])
        if "interest_rate" in body:
            updates["interest_rate"] = float(body["interest_rate"])
        if "repayment_days" in body:
            updates["repayment_days"] = int(float(body["repayment_days"]))
        if "security_type" in body:
            updates["security_type"] = normalize_security_type(body.get("security_type"))
        if "requires_branch_visit" in body:
            updates["requires_branch_visit"] = bool(body.get("requires_branch_visit"))
        if "branch_name" in body:
            updates["branch_name"] = str(body.get("branch_name") or "").strip() or None
        if "branch_location" in body:
            updates["branch_location"] = str(body.get("branch_location") or "").strip() or None
        if "branch_instructions" in body:
            updates["branch_instructions"] = str(body.get("branch_instructions") or "").strip() or None
        if "branch_visit_status" in body or "requires_branch_visit" in updates:
            requires_branch_visit = bool(updates.get("requires_branch_visit", existing.get("requires_branch_visit")))
            updates["branch_visit_status"] = normalize_branch_visit_status(body.get("branch_visit_status", updates.get("branch_visit_status", existing.get("branch_visit_status"))), requires_branch_visit)
        if "collateral_types" in body:
            updates["collateral_types"] = normalize_text_list(body.get("collateral_types"))
        if "required_documents" in body:
            updates["required_documents"] = normalize_text_list(body.get("required_documents"))
        if "collateral_items" in body:
            updates["collateral_items"] = normalize_collateral_items(body.get("collateral_items"))
        if "guarantors" in body:
            updates["guarantors"] = body.get("guarantors") if isinstance(body.get("guarantors"), list) else []
        next_security_type = updates.get("security_type", normalize_security_type(existing.get("security_type")))
        next_requires_branch_visit = bool(updates.get("requires_branch_visit", existing.get("requires_branch_visit")))
        next_branch_visit_status = updates.get("branch_visit_status", normalize_branch_visit_status(existing.get("branch_visit_status"), next_requires_branch_visit))
        next_status = updates.get("status", existing.get("status"))
        next_guarantors = updates.get("guarantors", existing.get("guarantors") if isinstance(existing.get("guarantors"), list) else [])
        next_collateral_items = updates.get("collateral_items", normalize_collateral_items(existing.get("collateral_items")))
        if next_security_type == "guarantor" and not next_guarantors:
            raise ApiException("Guaranteed loans need at least one guarantor before saving.", 400)
        if next_security_type == "collateral" and not next_collateral_items:
            raise ApiException("Secured loans need at least one collateral item before saving.", 400)
        if next_status == "disbursed" and next_requires_branch_visit and next_branch_visit_status not in BRANCH_DISBURSEMENT_READY_STATUSES:
            raise ApiException("Branch-based loans can only be disbursed after branch verification is marked verified or waived.", 400)
        if next_status == "disbursed":
            updates["disbursed_at"] = existing.get("disbursed_at") or now_iso()
        if next_status == "repaid":
            updates["repaid_at"] = existing.get("repaid_at") or now_iso()
        elif "status" in body and body.get("status") != "repaid":
            updates["repaid_at"] = None
        if len(updates) > 1:
            updates["reviewed_at"] = now_iso()
        updated = admin.update("micro_loan_applications", updates, filters={"id": f"eq.{loan_id}"}, single=True)
        return JsonResponse(updated)
    if request.method == "DELETE":
        admin.delete("micro_loan_applications", filters={"id": f"eq.{loan_id}"})
        return HttpResponse(status=204)
    return method_not_allowed(["PATCH", "DELETE"])


@api_view
@require_auth
def admin_verifications(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    rows, _ = admin.select("id_verifications", order="created_at.desc", limit=100)
    profiles = load_profiles_by_user_ids(admin, sorted({row["user_id"] for row in rows or []}), "user_id, full_name, county, phone")
    return JsonResponse([{**row, "profile": profiles.get(row["user_id"])} for row in rows or []], safe=False)


@api_view
@require_auth
def admin_verification_detail(request: HttpRequest, verification_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    body = parse_json_body(request)
    if "status" in body and body["status"] not in {"unverified", "pending_review", "verified", "rejected"}:
        raise ApiException("Invalid verification status.", 400)
    updates = {"reviewed_at": now_iso()}
    if "status" in body:
        updates["status"] = body["status"]
    if "reviewer_note" in body:
        updates["reviewer_note"] = body["reviewer_note"]
    updated = admin_client().update("id_verifications", updates, filters={"id": f"eq.{verification_id}"}, single=True)
    return JsonResponse(updated)


@api_view
@require_auth
def admin_receipts_export(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    orders, _ = admin.select(
        "orders",
        select="id, product_id, buyer_id, farmer_id, quantity, unit, total_price, delivery_fee, status, payment_status, payment_method, payment_ref, paid_at, created_at",
        order="created_at.desc",
    )
    product_ids = sorted({row["product_id"] for row in orders or []})
    user_ids = sorted({item for row in orders or [] for item in [row["buyer_id"], row["farmer_id"]]})
    products, _ = admin.select("products", select="id, name, category", filters={"id": f"in.{postgrest_in(product_ids)}"} if product_ids else {})
    profiles, _ = admin.select("profiles", select="user_id, full_name", filters={"user_id": f"in.{postgrest_in(user_ids)}"} if user_ids else {})
    products_by_id = {item["id"]: item for item in products or []}
    profiles_by_id = {item["user_id"]: item for item in profiles or []}
    rows = [
        "order_id,created_at,paid_at,receipt_number,payment_method,payment_status,order_status,product_name,category,buyer_name,farmer_name,quantity,unit,subtotal_amount,delivery_fee,total_amount"
    ]
    for order in orders or []:
        product = products_by_id.get(order["product_id"], {})
        buyer = profiles_by_id.get(order["buyer_id"], {})
        farmer = profiles_by_id.get(order["farmer_id"], {})
        delivery_fee = float(order.get("delivery_fee") or 0)
        subtotal = float(order.get("total_price") or 0)
        rows.append(
            ",".join(
                [
                    escape_csv(order["id"]),
                    escape_csv(order["created_at"]),
                    escape_csv(order.get("paid_at")),
                    escape_csv(order.get("payment_ref")),
                    escape_csv(order.get("payment_method")),
                    escape_csv(order.get("payment_status")),
                    escape_csv(order.get("status")),
                    escape_csv(product.get("name")),
                    escape_csv(product.get("category")),
                    escape_csv(buyer.get("full_name")),
                    escape_csv(farmer.get("full_name")),
                    escape_csv(order.get("quantity")),
                    escape_csv(order.get("unit")),
                    escape_csv(subtotal),
                    escape_csv(delivery_fee),
                    escape_csv(subtotal + delivery_fee),
                ]
            )
        )
    response = HttpResponse("\n".join(rows), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="agrilink-transaction-receipts-{datetime.utcnow().date().isoformat()}.csv"'
    return response
