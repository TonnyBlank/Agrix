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
    write_user_notification,
    write_user_notifications,
)
from .http import HttpRequest, HttpResponse, JsonResponse
from .views_core import attach_order_meta, release_order_payout
from .views_loans import (
    compute_loan_eligibility,
    normalize_branch_visit_status,
    normalize_collateral_items,
    normalize_security_type,
    normalize_text_list,
)


BRANCH_DISBURSEMENT_READY_STATUSES = {"documents_received", "verified", "waived"}
APP_ROLE_SET = {"farmer_free", "farmer_pro", "company", "admin"}


def clean_optional_text(value) -> str | None:
    return str(value or "").strip() or None


def require_text(value, label: str) -> str:
    cleaned = clean_optional_text(value)
    if not cleaned:
        raise ApiException(f"{label} is required.", 400)
    return cleaned


def ensure_admin(request: HttpRequest):
    role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
    if role != "admin":
        raise ApiException("Admin access required.", 403)


def admin_count_rows(admin, table: str, filters: dict[str, str] | None = None) -> int:
    _, count = admin.select(table, select="id", filters=filters or {}, head=True, count="exact")
    return int(count or 0)


def write_admin_audit_event(
    admin,
    *,
    actor_user_id: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    summary: str | None = None,
    metadata: dict | None = None,
) -> None:
    try:
        admin.insert(
            "admin_audit_logs",
            {
                "actor_user_id": actor_user_id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "summary": summary,
                "metadata": metadata or {},
                "created_at": now_iso(),
            },
        )
    except Exception:
        # Audit logging should never block the primary admin operation.
        return


def notify_order_parties(
    admin,
    *,
    order: dict,
    title: str,
    message: str,
    priority: str = "medium",
    category: str = "update",
    action_url: str = "/dashboard/orders",
    source_user_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    buyer_id = str(order.get("buyer_id") or "").strip()
    farmer_id = str(order.get("farmer_id") or "").strip()
    write_user_notifications(
        admin,
        user_ids=[buyer_id, farmer_id],
        title=title,
        message=message,
        priority=priority,
        category=category,
        entity_type="order",
        entity_id=str(order.get("id") or "").strip() or None,
        action_url=action_url,
        source="admin",
        source_user_id=source_user_id,
        metadata=metadata or {},
    )


@api_view
@require_auth
def admin_overview(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    _, users_count = admin.select("profiles", select="user_id", head=True, count="exact")
    _, products_count = admin.select("products", select="id", head=True, count="exact")
    _, orders_count = admin.select("orders", select="id", filters={"payment_status": "neq.failed"}, head=True, count="exact")
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
    orders, _ = admin.select(
        "orders",
        select="id, product_id, quantity, total_price, status, payment_status, created_at",
        filters={"payment_status": "neq.failed"},
        order="created_at.asc",
    )
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
def admin_user_summary(request: HttpRequest, user_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()

    profile, _ = admin.select(
        "profiles",
        select=(
            "user_id, full_name, phone, county, bio, farm_size, main_crops, farm_type, irrigation_type, soil_type, "
            "years_farming, has_storage, has_transport, cooperative_name, farm_gps_lat, farm_gps_lng, photo_url, "
            "payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number, "
            "plan_started_at, plan_expires_at, created_at, updated_at"
        ),
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )

    role_rows, _ = admin.select("user_roles", select="role", filters={"user_id": f"eq.{user_id}"})
    roles = sorted({str(row.get("role") or "farmer_free") for row in role_rows or []})
    role_priority = {
        "admin": 1,
        "company": 2,
        "farmer_pro": 3,
        "farmer_free": 4,
    }
    primary_role = sorted(roles, key=lambda item: role_priority.get(item, 99))[0] if roles else "farmer_free"

    auth_user = admin.auth_admin_get_user(user_id) or {}
    if not profile and not auth_user:
        raise ApiException("User not found.", 404)

    id_verification, _ = admin.select(
        "id_verifications",
        select="id, status, reviewer_note, submitted_at, reviewed_at, front_doc_url, back_doc_url, doc_url, created_at",
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )

    company, _ = admin.select(
        "companies",
        select=(
            "id, company_name, company_type, verification_status, verified, phone, email, website, "
            "headquarters_location, service_areas, created_at, updated_at"
        ),
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )

    products_count = admin_count_rows(admin, "products", {"farmer_id": f"eq.{user_id}"})
    selling_orders_count = admin_count_rows(admin, "orders", {"farmer_id": f"eq.{user_id}", "payment_status": "neq.failed"})
    buying_orders_count = admin_count_rows(admin, "orders", {"buyer_id": f"eq.{user_id}", "payment_status": "neq.failed"})
    loan_applications_count = admin_count_rows(admin, "micro_loan_applications", {"user_id": f"eq.{user_id}"})
    loan_repayments_count = admin_count_rows(admin, "micro_loan_repayments", {"user_id": f"eq.{user_id}"})
    crop_events_count = admin_count_rows(admin, "crop_events", {"farmer_id": f"eq.{user_id}"})
    conversations_count = admin_count_rows(admin, "conversations", {"or": f"(participant_a.eq.{user_id},participant_b.eq.{user_id})"})

    products, _ = admin.select(
        "products",
        select="id, name, category, price_per_unit, unit, stock, is_available, created_at, updated_at",
        filters={"farmer_id": f"eq.{user_id}"},
        order="updated_at.desc",
        limit=6,
    )
    selling_orders, _ = admin.select(
        "orders",
        select="id, product_id, buyer_id, farmer_id, total_price, delivery_fee, status, payment_status, created_at, updated_at",
        filters={"farmer_id": f"eq.{user_id}", "payment_status": "neq.failed"},
        order="created_at.desc",
        limit=6,
    )
    buying_orders, _ = admin.select(
        "orders",
        select="id, product_id, buyer_id, farmer_id, total_price, delivery_fee, status, payment_status, created_at, updated_at",
        filters={"buyer_id": f"eq.{user_id}", "payment_status": "neq.failed"},
        order="created_at.desc",
        limit=6,
    )
    loan_applications, _ = admin.select(
        "micro_loan_applications",
        select=(
            "id, applicant_role, product_title, requested_amount, approved_amount, status, "
            "security_type, requires_branch_visit, branch_visit_status, target_county, created_at, updated_at"
        ),
        filters={"user_id": f"eq.{user_id}"},
        order="created_at.desc",
        limit=6,
    )
    loan_repayments, _ = admin.select(
        "micro_loan_repayments",
        select="id, loan_application_id, amount, payment_method, payment_ref, created_at",
        filters={"user_id": f"eq.{user_id}"},
        order="created_at.desc",
        limit=6,
    )
    crop_events, _ = admin.select(
        "crop_events",
        select="id, title, crop, type, event_date, done, created_at, updated_at",
        filters={"farmer_id": f"eq.{user_id}"},
        order="event_date.desc",
        limit=6,
    )

    return JsonResponse(
        {
            "user": {
                "user_id": user_id,
                "email": auth_user.get("email"),
                "phone": auth_user.get("phone"),
                "email_confirmed_at": auth_user.get("email_confirmed_at"),
                "phone_confirmed_at": auth_user.get("phone_confirmed_at"),
                "last_sign_in_at": auth_user.get("last_sign_in_at"),
                "created_at": (profile or {}).get("created_at"),
                "role": primary_role,
                "roles": roles,
            },
            "profile": profile,
            "id_verification": id_verification,
            "company": company,
            "stats": {
                "products_count": products_count,
                "selling_orders_count": selling_orders_count,
                "buying_orders_count": buying_orders_count,
                "loan_applications_count": loan_applications_count,
                "loan_repayments_count": loan_repayments_count,
                "crop_events_count": crop_events_count,
                "conversations_count": conversations_count,
            },
            "recent": {
                "products": products or [],
                "selling_orders": attach_order_meta(admin, selling_orders or []),
                "buying_orders": attach_order_meta(admin, buying_orders or []),
                "loan_applications": loan_applications or [],
                "loan_repayments": loan_repayments or [],
                "crop_events": crop_events or [],
            },
        }
    )


@api_view
@require_auth
def admin_user_role(request: HttpRequest, user_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    admin = admin_client()
    next_role = parse_json_body(request).get("role")
    if next_role not in APP_ROLE_SET:
        raise ApiException("Invalid role", 400)
    role_rows, _ = admin.select("user_roles", select="role", filters={"user_id": f"eq.{user_id}"})
    previous_role = sorted({str(row.get("role") or "farmer_free") for row in role_rows or []})[0] if role_rows else "farmer_free"
    updated_profile = set_user_role_with_plan(user_id, next_role)
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.user_role.updated",
        entity_type="user",
        entity_id=user_id,
        summary=f"Changed user role from {previous_role} to {next_role}.",
        metadata={"previous_role": previous_role, "next_role": next_role},
    )
    write_user_notification(
        admin,
        user_id=user_id,
        title="Account role updated",
        message=f"Your AgriLink role was updated from {previous_role} to {next_role}.",
        priority="high",
        category="update",
        entity_type="user",
        entity_id=user_id,
        action_url="/dashboard/profile",
        source="admin",
        source_user_id=request.user_id,
        metadata={"previous_role": previous_role, "next_role": next_role},
    )
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
    orders, _ = admin_client().select("orders", filters={"payment_status": "neq.failed"}, order="created_at.desc", limit=100)
    return JsonResponse(attach_order_meta(admin_client(), orders or []), safe=False)


@api_view
@require_auth
def admin_order_release(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found.", 404)
    body = parse_json_body(request)
    official_note = str(body.get("official_note") or "").strip() or None
    override_reason = str(body.get("override_reason") or "").strip() or None
    released = release_order_payout(
        admin,
        order,
        request.user_id,
        official_note,
        allow_admin_override=True,
        override_reason=override_reason,
    )
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.order.release",
        entity_type="order",
        entity_id=order_id,
        summary="Released seller payout for marketplace order.",
        metadata={
            "override_reason": override_reason,
            "official_note": official_note,
            "previous_payout_status": order.get("payout_status"),
            "next_payout_status": released.get("payout_status"),
        },
    )
    notify_order_parties(
        admin,
        order=released,
        title="Order payout released",
        message="AgriLink has released payout for a delivered order after official sign-off.",
        priority="high",
        category="update",
        source_user_id=request.user_id,
        metadata={
            "payout_status": released.get("payout_status"),
            "delivery_signoff_status": released.get("delivery_signoff_status"),
        },
    )
    return JsonResponse(attach_order_meta(admin, [released])[0])


@api_view
@require_auth
def admin_order_confirm_delivery(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") == "cancelled":
        raise ApiException("Cancelled orders cannot be marked as delivered.", 400)
    if order.get("status") not in {"processing", "shipped", "delivered"}:
        raise ApiException("Only active delivery orders can be officially confirmed.", 400)

    body = parse_json_body(request)
    official_note = str(body.get("official_note") or "").strip() or "Official AgriLink delivery sign-off completed."
    proof_exists = bool(str(order.get("delivery_proof_photo_url") or "").strip())
    signoff_status = "pending_buyer_confirmation" if proof_exists else "pending_proof"

    updated = admin.update(
        "orders",
        {
            "status": "delivered",
            "payout_status": "awaiting_official_signoff" if order.get("payment_status") == "paid" else order.get("payout_status") or "pending_payment",
            "delivery_signoff_status": signoff_status,
            "dispute_deadline_at": None,
            "official_verified_at": order.get("official_verified_at") or now_iso(),
            "official_verified_by": order.get("official_verified_by") or request.user_id,
            "official_note": official_note,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.order.confirm_delivery",
        entity_type="order",
        entity_id=order_id,
        summary="Marked order as officially delivered.",
        metadata={
            "official_note": official_note,
            "previous_status": order.get("status"),
            "next_status": updated.get("status"),
            "next_delivery_signoff_status": updated.get("delivery_signoff_status"),
        },
    )
    notify_order_parties(
        admin,
        order=updated,
        title="Order officially marked delivered",
        message="An AgriLink admin confirmed delivery and updated this order to delivered.",
        priority="high",
        category="update",
        source_user_id=request.user_id,
        metadata={
            "status": updated.get("status"),
            "delivery_signoff_status": updated.get("delivery_signoff_status"),
        },
    )

    return JsonResponse(attach_order_meta(admin, [updated])[0])


@api_view
@require_auth
def admin_order_resolve_dispute(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    admin = admin_client()
    order, _ = admin.select("orders", filters={"id": f"eq.{order_id}"}, single=True)
    if not order:
        raise ApiException("Order not found.", 404)
    if order.get("status") != "delivered":
        raise ApiException("Only delivered orders can be dispute-resolved.", 400)
    if order.get("payout_status") == "released":
        raise ApiException("Payout is already released for this order.", 400)

    body = parse_json_body(request)
    resolution = str(body.get("resolution") or "confirm").strip().lower()
    if resolution not in {"confirm", "waive"}:
        raise ApiException("Resolution must be either confirm or waive.", 400)
    resolution_note = clean_optional_text(body.get("resolution_note") or body.get("note"))
    if not resolution_note:
        raise ApiException("Provide a dispute resolution note.", 400)

    now_label = now_iso()
    next_signoff_status = "waived_by_admin" if resolution == "waive" else "confirmed"
    next_official_note = str(order.get("official_note") or "").strip() or None
    marker = f"Dispute resolution ({resolution}): {resolution_note}"
    next_official_note = f"{next_official_note}\n{marker}".strip() if next_official_note else marker
    updated = admin.update(
        "orders",
        {
            "delivery_signoff_status": next_signoff_status,
            "dispute_opened_at": None,
            "dispute_opened_by": None,
            "dispute_resolved_at": now_label,
            "dispute_resolution_note": resolution_note,
            "dispute_deadline_at": now_label if resolution == "waive" else order.get("dispute_deadline_at") or now_label,
            "official_note": next_official_note,
            "official_verified_at": order.get("official_verified_at") or now_label,
            "official_verified_by": order.get("official_verified_by") or request.user_id,
        },
        filters={"id": f"eq.{order_id}"},
        single=True,
    )

    if bool(body.get("release_now")):
        updated = release_order_payout(
            admin,
            updated,
            request.user_id,
            next_official_note,
            allow_admin_override=True,
            override_reason=resolution_note if resolution == "waive" else None,
        )
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.order.resolve_dispute",
        entity_type="order",
        entity_id=order_id,
        summary=f"Resolved order dispute with '{resolution}' decision.",
        metadata={
            "resolution": resolution,
            "resolution_note": resolution_note,
            "release_now": bool(body.get("release_now")),
            "next_delivery_signoff_status": updated.get("delivery_signoff_status"),
            "next_payout_status": updated.get("payout_status"),
        },
    )
    notify_order_parties(
        admin,
        order=updated,
        title="Order dispute resolved",
        message=f"An AgriLink admin resolved this order dispute with a '{resolution}' decision.",
        priority="high",
        category="update",
        source_user_id=request.user_id,
        metadata={
            "resolution": resolution,
            "release_now": bool(body.get("release_now")),
            "delivery_signoff_status": updated.get("delivery_signoff_status"),
            "payout_status": updated.get("payout_status"),
        },
    )

    return JsonResponse(attach_order_meta(admin, [updated])[0])


@api_view
@require_auth
def admin_loan_candidates(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()
    roles, _ = admin.select("user_roles", select="user_id, role", filters={"role": 'in.("farmer_pro","company")'})
    profiles, _ = admin.select("profiles", select="user_id, full_name, county, phone, payout_method, payout_mpesa_number, bank_name, bank_account_name, bank_account_number")
    verifications, _ = admin.select("id_verifications", select="user_id, status")
    orders, _ = admin.select(
        "orders",
        select="farmer_id, buyer_id, total_price, created_at, status, payment_status",
        filters={"payment_status": "neq.failed"},
    )
    role_by_id = {item["user_id"]: item["role"] for item in roles or []}
    qualified_ids = set(role_by_id)
    verification_by_id = {item["user_id"]: item["status"] for item in verifications or []}
    orders_by_user = {}
    for order in orders or []:
        farmer_id = order.get("farmer_id")
        buyer_id = order.get("buyer_id")
        if farmer_id in qualified_ids and role_by_id.get(farmer_id) == "farmer_pro":
            orders_by_user.setdefault(farmer_id, []).append(order)
        if buyer_id in qualified_ids and role_by_id.get(buyer_id) == "company":
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
                "target_county": clean_optional_text(offer.get("target_county")) or clean_optional_text(offer.get("branch_location")),
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
    if body.get("applicant_role") not in {"farmer_pro", "company"}:
        raise ApiException("Applicant role must be farmer_pro or company.", 400)
    if body.get("product_type") not in LOAN_PRODUCT_TYPES:
        raise ApiException("Select a valid loan product type.", 400)
    if not str(body.get("product_title") or "").strip():
        raise ApiException("Loan product title is required.", 400)
    max_amount = float(body.get("max_amount") or 0)
    if max_amount <= 0:
        raise ApiException("Maximum offer amount must be greater than zero.", 400)
    branch_name = require_text(body.get("branch_name"), "Branch name")
    branch_location = require_text(body.get("branch_location"), "Branch location")
    target_county = require_text(body.get("target_county"), "Target county")
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
            "branch_name": branch_name,
            "branch_location": branch_location,
            "target_county": target_county,
            "branch_instructions": str(body.get("branch_instructions") or "").strip() or None,
            "collateral_types": collateral_types,
            "required_documents": required_documents,
            "is_active": True,
            "updated_at": now_iso(),
        },
        single=True,
    )
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.loan_offer.created",
        entity_type="loan_offer",
        entity_id=created.get("id"),
        summary="Created a new loan offer.",
        metadata={
            "applicant_role": created.get("applicant_role"),
            "product_type": created.get("product_type"),
            "security_type": created.get("security_type"),
            "target_county": created.get("target_county"),
            "is_active": created.get("is_active"),
        },
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
            updates["branch_name"] = clean_optional_text(body.get("branch_name"))
        if "branch_location" in body:
            updates["branch_location"] = clean_optional_text(body.get("branch_location"))
        if "target_county" in body:
            updates["target_county"] = clean_optional_text(body.get("target_county"))
        if "branch_instructions" in body:
            updates["branch_instructions"] = str(body.get("branch_instructions") or "").strip() or None
        if "collateral_types" in body:
            updates["collateral_types"] = normalize_text_list(body.get("collateral_types"))
        if "required_documents" in body:
            updates["required_documents"] = normalize_text_list(body.get("required_documents"))
        next_branch_name = updates.get("branch_name", clean_optional_text(existing.get("branch_name")))
        next_branch_location = updates.get("branch_location", clean_optional_text(existing.get("branch_location")))
        next_target_county = updates.get("target_county", clean_optional_text(existing.get("target_county")) or clean_optional_text(existing.get("branch_location")))
        if not next_branch_name:
            raise ApiException("Branch name is required on every published loan offer.", 400)
        if not next_branch_location:
            raise ApiException("Branch location is required on every published loan offer.", 400)
        if not next_target_county:
            raise ApiException("Target county is required on every published loan offer.", 400)
        next_security_type = updates.get("security_type", normalize_security_type(existing.get("security_type")))
        next_collateral_types = updates.get("collateral_types", normalize_text_list(existing.get("collateral_types")))
        if next_security_type == "collateral" and not next_collateral_types:
            raise ApiException("Secured collateral offers must list at least one accepted collateral type.", 400)
        updated = admin.update("micro_loan_offers", updates, filters={"id": f"eq.{offer_id}"}, single=True)
        write_admin_audit_event(
            admin,
            actor_user_id=request.user_id,
            action="admin.loan_offer.updated",
            entity_type="loan_offer",
            entity_id=offer_id,
            summary="Updated loan offer details.",
            metadata={"changed_fields": sorted(k for k in updates.keys() if k != "updated_at")},
        )
        return JsonResponse(updated)
    if request.method == "DELETE":
        existing, _ = admin.select("micro_loan_offers", filters={"id": f"eq.{offer_id}"}, single=True)
        admin.delete("micro_loan_offers", filters={"id": f"eq.{offer_id}"})
        write_admin_audit_event(
            admin,
            actor_user_id=request.user_id,
            action="admin.loan_offer.deleted",
            entity_type="loan_offer",
            entity_id=offer_id,
            summary="Deleted loan offer.",
            metadata={
                "applicant_role": (existing or {}).get("applicant_role"),
                "product_type": (existing or {}).get("product_type"),
                "target_county": (existing or {}).get("target_county"),
            },
        )
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
                    "target_county": clean_optional_text(loan.get("target_county")) or clean_optional_text(loan.get("branch_location")),
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
    if body.get("applicant_role") not in {"farmer_pro", "company"}:
        raise ApiException("Applicant role must be farmer_pro or company.", 400)
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
            "target_county": clean_optional_text(body.get("target_county")) or clean_optional_text(profile.get("county")),
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
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.loan_application.created",
        entity_type="loan_application",
        entity_id=created.get("id"),
        summary="Created loan application record from admin workspace.",
        metadata={
            "user_id": created.get("user_id"),
            "status": created.get("status"),
            "security_type": created.get("security_type"),
            "requires_branch_visit": created.get("requires_branch_visit"),
        },
    )
    write_user_notification(
        admin,
        user_id=str(created.get("user_id") or "").strip() or None,
        title="Loan application created",
        message=f"An admin created a loan application record for '{created.get('product_title') or 'your loan'}'.",
        priority="high",
        category="update",
        entity_type="loan_application",
        entity_id=str(created.get("id") or "").strip() or None,
        action_url="/dashboard/micro-loans",
        source="admin",
        source_user_id=request.user_id,
        metadata={
            "status": created.get("status"),
            "requested_amount": created.get("requested_amount"),
            "approved_amount": created.get("approved_amount"),
        },
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
        previous_status = str(existing.get("status") or "").strip() or "pending_review"
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
        if "target_county" in body:
            updates["target_county"] = clean_optional_text(body.get("target_county"))
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
        write_admin_audit_event(
            admin,
            actor_user_id=request.user_id,
            action="admin.loan_application.updated",
            entity_type="loan_application",
            entity_id=loan_id,
            summary="Updated loan application decision/details.",
            metadata={
                "changed_fields": sorted(k for k in updates.keys() if k not in {"updated_at", "reviewed_at"}),
                "next_status": updated.get("status"),
            },
        )
        next_status = str(updated.get("status") or "").strip() or previous_status
        status_message = (
            f"Your loan status changed from {previous_status} to {next_status}."
            if next_status != previous_status
            else f"Your loan application was updated and remains {next_status}."
        )
        write_user_notification(
            admin,
            user_id=str(updated.get("user_id") or existing.get("user_id") or "").strip() or None,
            title="Loan application updated",
            message=status_message,
            priority="high" if next_status in {"approved", "disbursed", "rejected", "repaid"} else "medium",
            category="update",
            entity_type="loan_application",
            entity_id=loan_id,
            action_url="/dashboard/micro-loans",
            source="admin",
            source_user_id=request.user_id,
            metadata={
                "previous_status": previous_status,
                "next_status": next_status,
                "changed_fields": sorted(k for k in updates.keys() if k not in {"updated_at", "reviewed_at"}),
            },
        )
        return JsonResponse(updated)
    if request.method == "DELETE":
        existing, _ = admin.select("micro_loan_applications", filters={"id": f"eq.{loan_id}"}, single=True)
        admin.delete("micro_loan_applications", filters={"id": f"eq.{loan_id}"})
        write_admin_audit_event(
            admin,
            actor_user_id=request.user_id,
            action="admin.loan_application.deleted",
            entity_type="loan_application",
            entity_id=loan_id,
            summary="Deleted loan application.",
            metadata={"status": (existing or {}).get("status"), "user_id": (existing or {}).get("user_id")},
        )
        write_user_notification(
            admin,
            user_id=str((existing or {}).get("user_id") or "").strip() or None,
            title="Loan application removed",
            message="An admin removed one of your loan application records.",
            priority="medium",
            category="info",
            entity_type="loan_application",
            entity_id=loan_id,
            action_url="/dashboard/micro-loans",
            source="admin",
            source_user_id=request.user_id,
            metadata={"status": (existing or {}).get("status")},
        )
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
    admin = admin_client()
    updated = admin.update("id_verifications", updates, filters={"id": f"eq.{verification_id}"}, single=True)
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.verification.updated",
        entity_type="id_verification",
        entity_id=verification_id,
        summary="Updated identity verification status/reviewer note.",
        metadata={"status": updated.get("status"), "user_id": updated.get("user_id")},
    )
    next_status = str(updated.get("status") or "").strip() or "pending_review"
    write_user_notification(
        admin,
        user_id=str(updated.get("user_id") or "").strip() or None,
        title="ID verification updated",
        message=f"Your identity verification status is now '{next_status}'.",
        priority="high" if next_status in {"verified", "rejected"} else "medium",
        category="update",
        entity_type="id_verification",
        entity_id=verification_id,
        action_url="/dashboard/profile",
        source="admin",
        source_user_id=request.user_id,
        metadata={"status": next_status},
    )
    return JsonResponse(updated)


@api_view
@require_auth
def admin_feature_flags(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    flags, _ = admin_client().select("feature_flags", order="feature_key.asc")
    rows = []
    for row in flags or []:
        enabled_for = [str(value) for value in (row.get("enabled_for") or []) if str(value) in APP_ROLE_SET]
        rows.append({**row, "enabled_for": sorted(enabled_for)})
    return JsonResponse(rows, safe=False)


@api_view
@require_auth
def admin_feature_flag_detail(request: HttpRequest, feature_key: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    body = parse_json_body(request)
    if "enabled_for" not in body or not isinstance(body.get("enabled_for"), list):
        raise ApiException("enabled_for must be provided as an array of roles.", 400)
    enabled_for = sorted({str(role) for role in body.get("enabled_for") if str(role) in APP_ROLE_SET})
    admin = admin_client()
    updated = admin.update(
        "feature_flags",
        {"enabled_for": enabled_for},
        filters={"feature_key": f"eq.{feature_key}"},
        single=True,
    )
    if not updated:
        raise ApiException("Feature flag not found.", 404)
    write_admin_audit_event(
        admin,
        actor_user_id=request.user_id,
        action="admin.feature_flag.updated",
        entity_type="feature_flag",
        entity_id=feature_key,
        summary=f"Updated feature flag audience for '{feature_key}'.",
        metadata={"enabled_for": enabled_for},
    )
    return JsonResponse({**updated, "enabled_for": enabled_for})


@api_view
@require_auth
def admin_audit_logs(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    logs, _ = admin_client().select(
        "admin_audit_logs",
        select="id, actor_user_id, action, entity_type, entity_id, summary, metadata, created_at",
        order="created_at.desc",
        limit=200,
    )
    actor_ids = sorted({row.get("actor_user_id") for row in (logs or []) if row.get("actor_user_id")})
    profiles = load_profiles_by_user_ids(admin_client(), actor_ids, "user_id, full_name")
    rows = []
    for row in logs or []:
        actor = profiles.get(row.get("actor_user_id"), {}) if row.get("actor_user_id") else {}
        rows.append({**row, "actor_profile": actor or None})
    return JsonResponse(rows, safe=False)


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
