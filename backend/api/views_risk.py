from __future__ import annotations

from typing import Any

from .common import (
    ApiException,
    admin_client,
    api_view,
    load_profiles_by_user_ids,
    method_not_allowed,
    now_iso,
    parse_json_body,
    require_auth,
    resolve_app_role,
    write_user_notification,
    write_user_notifications,
)
from .http import HttpRequest, JsonResponse


RISK_RECORD_TYPES = {"insurance", "green_credit"}
OWNER_ROLES = {"farmer_free", "farmer_pro", "company"}
OWNER_EDITABLE_STATUSES = {"draft", "ready"}
OWNER_STATUS_VALUES = {"draft", "ready"}
ADMIN_STATUS_VALUES = {"reviewing", "approved", "declined"}


def clean_optional_text(value: Any, max_length: int = 1200) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def require_text(value: Any, label: str, max_length: int = 240) -> str:
    cleaned = clean_optional_text(value, max_length)
    if not cleaned:
        raise ApiException(f"{label} is required.", 400)
    return cleaned


def normalize_score(value: Any, label: str) -> int:
    try:
        score = int(float(value if value not in (None, "") else 0))
    except (TypeError, ValueError):
        raise ApiException(f"{label} must be a number between 0 and 100.", 400)
    if score < 0 or score > 100:
        raise ApiException(f"{label} must be between 0 and 100.", 400)
    return score


def current_role(request: HttpRequest) -> str:
    return resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))


def ensure_owner_role(request: HttpRequest) -> str:
    role = current_role(request)
    if role not in OWNER_ROLES:
        raise ApiException("Risk and credit records are available to farmers and companies.", 403)
    return role


def ensure_admin(request: HttpRequest) -> None:
    if current_role(request) != "admin":
        raise ApiException("Admin access required.", 403)


def normalize_record_payload(body: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {}

    if not partial or "type" in body or "record_type" in body:
        record_type = str(body.get("type") or body.get("record_type") or "").strip()
        if record_type not in RISK_RECORD_TYPES:
            raise ApiException("Finance type must be insurance or green_credit.", 400)
        payload["record_type"] = record_type

    text_fields = [
        ("title", "title", "Title", 240),
        ("amount", "target_amount_text", "Target amount", 80),
        ("enterprise", "enterprise", "Enterprise", 240),
        ("riskFocus", "risk_focus", "Risk focus", 1200),
        ("evidence", "evidence_notes", "Evidence notes", 1600),
        ("climatePractice", "climate_practice", "Climate practice", 500),
    ]

    for body_key, column_key, label, max_length in text_fields:
        if partial and body_key not in body and column_key not in body:
            continue
        raw_value = body.get(body_key, body.get(column_key))
        if column_key in {"title", "enterprise", "risk_focus"}:
            payload[column_key] = require_text(raw_value, label, max_length)
        else:
            payload[column_key] = clean_optional_text(raw_value, max_length)

    if not partial or "readinessScore" in body or "readiness_score" in body:
        payload["readiness_score"] = normalize_score(
            body.get("readinessScore", body.get("readiness_score", 0)),
            "Readiness score",
        )
    if not partial or "greenScore" in body or "green_score" in body:
        payload["green_score"] = normalize_score(
            body.get("greenScore", body.get("green_score", 0)),
            "Green score",
        )

    if "status" in body:
        status = str(body.get("status") or "").strip()
        if status not in OWNER_STATUS_VALUES:
            raise ApiException("Owners can save records as draft or ready only.", 400)
        payload["status"] = status

    if "metadata" in body:
        payload["metadata"] = body["metadata"] if isinstance(body["metadata"], dict) else {}

    return payload


def serialize_record(row: dict[str, Any], profile: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "type": row.get("record_type"),
        "title": row.get("title"),
        "amount": row.get("target_amount_text") or "",
        "enterprise": row.get("enterprise"),
        "riskFocus": row.get("risk_focus") or "",
        "evidence": row.get("evidence_notes") or "",
        "climatePractice": row.get("climate_practice") or "",
        "readinessScore": int(row.get("readiness_score") or 0),
        "greenScore": int(row.get("green_score") or 0),
        "status": row.get("status") or "draft",
        "partnerNote": row.get("partner_note") or "",
        "partnerReference": row.get("partner_reference") or "",
        "submittedAt": row.get("submitted_at"),
        "reviewedAt": row.get("reviewed_at"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "metadata": row.get("metadata") or {},
    }
    if profile is not None:
        payload["profile"] = profile
    return payload


def fetch_owned_record(admin, record_id: str, user_id: str) -> dict[str, Any]:
    record, _ = admin.select(
        "risk_credit_records",
        filters={"id": f"eq.{record_id}", "user_id": f"eq.{user_id}"},
        single=True,
    )
    if not record:
        raise ApiException("Risk and credit record not found.", 404)
    return record


def notify_admins_record_submitted(admin, record: dict[str, Any]) -> None:
    admins, _ = admin.select("user_roles", select="user_id", filters={"role": "eq.admin"})
    admin_ids = [str(row.get("user_id") or "").strip() for row in admins or []]
    write_user_notifications(
        admin,
        user_ids=admin_ids,
        title="Risk & credit file submitted",
        message=f"{record.get('title') or 'A finance record'} is ready for partner review.",
        priority="medium",
        category="action",
        entity_type="risk_credit_record",
        entity_id=str(record.get("id") or ""),
        action_url="/dashboard/admin/risk-credit",
        source="system",
        metadata={"record_type": record.get("record_type"), "status": record.get("status")},
    )


@api_view
@require_auth
def risk_credit_records(request: HttpRequest):
    role = ensure_owner_role(request)
    admin = admin_client()

    if request.method == "GET":
        rows, _ = admin.select(
            "risk_credit_records",
            filters={"user_id": f"eq.{request.user_id}"},
            order="created_at.desc",
            limit=100,
        )
        return JsonResponse([serialize_record(row) for row in rows or []], safe=False)

    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])

    body = parse_json_body(request)
    payload = normalize_record_payload(body)
    readiness_score = int(payload.get("readiness_score") or 0)
    payload.setdefault("status", "ready" if readiness_score >= 70 else "draft")
    payload.update(
        {
            "user_id": request.user_id,
            "metadata": {
                **(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}),
                "creator_role": role,
            },
        }
    )

    created = admin.insert("risk_credit_records", payload, single=True)
    return JsonResponse(serialize_record(created), status=201)


@api_view
@require_auth
def risk_credit_record_detail(request: HttpRequest, record_id: str):
    ensure_owner_role(request)
    admin = admin_client()
    record = fetch_owned_record(admin, record_id, request.user_id)

    if request.method == "PATCH":
        if str(record.get("status") or "draft") not in OWNER_EDITABLE_STATUSES:
            raise ApiException("Submitted records cannot be edited. Wait for partner review or create a new file.", 400)
        updates = normalize_record_payload(parse_json_body(request), partial=True)
        if not updates:
            raise ApiException("No updates provided.", 400)
        updated = admin.update(
            "risk_credit_records",
            updates,
            filters={"id": f"eq.{record_id}", "user_id": f"eq.{request.user_id}"},
            single=True,
        )
        return JsonResponse(serialize_record(updated))

    if request.method == "DELETE":
        if str(record.get("status") or "draft") not in OWNER_EDITABLE_STATUSES:
            raise ApiException("Submitted records cannot be deleted from the review queue.", 400)
        admin.delete("risk_credit_records", filters={"id": f"eq.{record_id}", "user_id": f"eq.{request.user_id}"})
        return JsonResponse({"success": True})

    return method_not_allowed(["PATCH", "DELETE"])


@api_view
@require_auth
def risk_credit_record_submit(request: HttpRequest, record_id: str):
    ensure_owner_role(request)
    if request.method != "POST":
        return method_not_allowed(["POST"])

    admin = admin_client()
    record = fetch_owned_record(admin, record_id, request.user_id)
    status = str(record.get("status") or "draft")
    if status not in OWNER_EDITABLE_STATUSES:
        raise ApiException("This record is already in the review workflow.", 400)

    readiness_score = int(record.get("readiness_score") or 0)
    if readiness_score < 70:
        raise ApiException("Reach at least 70% risk readiness before submitting for partner review.", 400)

    updated = admin.update(
        "risk_credit_records",
        {"status": "submitted", "submitted_at": record.get("submitted_at") or now_iso()},
        filters={"id": f"eq.{record_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    notify_admins_record_submitted(admin, updated)
    return JsonResponse(serialize_record(updated))


@api_view
@require_auth
def admin_risk_credit_records(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    ensure_admin(request)
    admin = admin_client()

    filters: dict[str, str] = {}
    status = str(request.GET.get("status") or "").strip()
    record_type = str(request.GET.get("type") or request.GET.get("record_type") or "").strip()
    user_id = str(request.GET.get("user_id") or "").strip()
    if status:
        filters["status"] = f"eq.{status}"
    if record_type:
        filters["record_type"] = f"eq.{record_type}"
    if user_id:
        filters["user_id"] = f"eq.{user_id}"

    rows, _ = admin.select("risk_credit_records", filters=filters, order="created_at.desc", limit=200)
    user_ids = sorted({str(row.get("user_id") or "") for row in rows or [] if row.get("user_id")})
    profiles = load_profiles_by_user_ids(admin, user_ids, select="user_id, full_name, county, phone")
    return JsonResponse(
        [serialize_record(row, profiles.get(str(row.get("user_id") or ""))) for row in rows or []],
        safe=False,
    )


@api_view
@require_auth
def admin_risk_credit_record_decision(request: HttpRequest, record_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    ensure_admin(request)
    body = parse_json_body(request)
    status = str(body.get("status") or "").strip()
    if status not in ADMIN_STATUS_VALUES:
        raise ApiException("Admin status must be reviewing, approved, or declined.", 400)

    admin = admin_client()
    record, _ = admin.select("risk_credit_records", filters={"id": f"eq.{record_id}"}, single=True)
    if not record:
        raise ApiException("Risk and credit record not found.", 404)

    updates = {
        "status": status,
        "partner_note": clean_optional_text(body.get("partnerNote", body.get("partner_note")), 1200),
        "partner_reference": clean_optional_text(body.get("partnerReference", body.get("partner_reference")), 160),
        "reviewed_by": request.user_id,
        "reviewed_at": now_iso(),
    }
    updated = admin.update("risk_credit_records", updates, filters={"id": f"eq.{record_id}"}, single=True)

    write_user_notification(
        admin,
        user_id=str(updated.get("user_id") or ""),
        title="Risk & credit file updated",
        message=f"{updated.get('title') or 'Your finance record'} is now {status}.",
        priority="medium",
        category="update",
        entity_type="risk_credit_record",
        entity_id=str(updated.get("id") or ""),
        action_url="/dashboard/risk-credit",
        source="admin",
        source_user_id=request.user_id,
        metadata={"status": status, "record_type": updated.get("record_type")},
    )
    return JsonResponse(serialize_record(updated))
