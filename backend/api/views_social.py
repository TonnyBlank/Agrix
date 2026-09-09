from __future__ import annotations

from datetime import datetime

import requests

from .common import ApiException, admin_client, api_view, ensure_profile_exists, load_profiles_by_user_ids, method_not_allowed, now_iso, parse_json_body, require_auth
from .http import HttpRequest, HttpResponse, JsonResponse



@api_view
@require_auth
def conversations_root(request: HttpRequest):
    if request.method == "GET":
        rows, _ = request.supabase.select(
            "conversations",
            filters={"or": f"(participant_a.eq.{request.user_id},participant_b.eq.{request.user_id})"},
            order="last_at.desc",
        )
        conversations = rows or []
        other_ids = sorted(
            {
                conversation["participant_b"] if conversation.get("participant_a") == request.user_id else conversation.get("participant_a")
                for conversation in conversations
                if conversation.get("participant_a") and conversation.get("participant_b")
            }
        )
        profiles_by_user_id = load_profiles_by_user_ids(admin_client(), other_ids, "user_id, full_name, photo_url")
        enriched = []
        for conversation in conversations:
            other_id = (
                conversation.get("participant_b")
                if conversation.get("participant_a") == request.user_id
                else conversation.get("participant_a")
            )
            other_profile = profiles_by_user_id.get(other_id or "", {})
            enriched.append(
                {
                    **conversation,
                    "other_name": other_profile.get("full_name") or "Unknown",
                    "other_photo_url": other_profile.get("photo_url"),
                }
            )
        return JsonResponse(enriched, safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    other_user_id = parse_json_body(request).get("other_user_id")
    if not other_user_id:
        raise ApiException("other_user_id required", 400)
    if other_user_id == request.user_id:
        raise ApiException("Cannot start a conversation with yourself", 400)
    existing, _ = request.supabase.select(
        "conversations",
        select="id, created_at",
        filters={"or": f"(and(participant_a.eq.{request.user_id},participant_b.eq.{other_user_id}),and(participant_a.eq.{other_user_id},participant_b.eq.{request.user_id}))"},
        order="created_at.asc",
        limit=1,
    )
    if existing:
        return JsonResponse({"id": existing[0]["id"]})
    participant_a, participant_b = sorted([request.user_id, other_user_id])
    try:
        created = request.supabase.insert("conversations", {"participant_a": participant_a, "participant_b": participant_b}, single=True)
    except requests.HTTPError as exc:
        # Both participants can open the same chat at once. The database's unique
        # constraint is authoritative, so return the row that won that race.
        if exc.response is None or exc.response.status_code != 409:
            raise
        existing, _ = request.supabase.select(
            "conversations",
            select="id",
            filters={"participant_a": f"eq.{participant_a}", "participant_b": f"eq.{participant_b}"},
            limit=1,
        )
        if not existing:
            raise
        return JsonResponse({"id": existing[0]["id"]})
    return JsonResponse(created, status=201)


@api_view
@require_auth
def conversation_detail(request: HttpRequest, conversation_id: str):
    conversation, _ = request.supabase.select(
        "conversations",
        select="id, participant_a, participant_b, unread_a, unread_b",
        filters={"id": f"eq.{conversation_id}"},
        single=True,
    )
    if not conversation or request.user_id not in {conversation["participant_a"], conversation["participant_b"]}:
        raise ApiException("Not a participant", 403)
    if request.method == "GET":
        rows, _ = request.supabase.select("messages", filters={"conversation_id": f"eq.{conversation_id}"}, order="created_at.asc")
        update = {"unread_a": 0} if conversation["participant_a"] == request.user_id else {"unread_b": 0}
        request.supabase.update("conversations", update, filters={"id": f"eq.{conversation_id}"})
        return JsonResponse(rows or [], safe=False)
    if request.method == "DELETE":
        request.supabase.delete("conversations", filters={"id": f"eq.{conversation_id}"})
        return HttpResponse(status=204)
    return method_not_allowed(["GET", "DELETE"])


@api_view
@require_auth
def conversation_send(request: HttpRequest, conversation_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = str(parse_json_body(request).get("body") or "").strip()
    if not body:
        raise ApiException("Message body required", 400)
    conversation, _ = request.supabase.select(
        "conversations",
        select="id, participant_a, participant_b, unread_a, unread_b",
        filters={"id": f"eq.{conversation_id}"},
        single=True,
    )
    if not conversation or request.user_id not in {conversation["participant_a"], conversation["participant_b"]}:
        raise ApiException("Not a participant", 403)
    created = request.supabase.insert("messages", {"conversation_id": conversation_id, "sender_id": request.user_id, "body": body}, single=True)
    update = (
        {"last_message": body, "last_at": now_iso(), "unread_a": 0, "unread_b": int(conversation.get("unread_b") or 0) + 1}
        if conversation["participant_a"] == request.user_id
        else {"last_message": body, "last_at": now_iso(), "unread_b": 0, "unread_a": int(conversation.get("unread_a") or 0) + 1}
    )
    request.supabase.update("conversations", update, filters={"id": f"eq.{conversation_id}"})
    return JsonResponse(created, status=201)


def normalize_crop_event_payload(body):
    title = str(body.get("title") or "").strip()
    crop = str(body.get("crop") or "").strip()
    event_type = str(body.get("type") or "").strip()
    event_date = str(body.get("event_date") or "").strip()
    notes = str(body.get("notes") or "").strip() or None
    if not title:
        raise ApiException("Event title is required.", 400)
    if not crop:
        raise ApiException("Crop is required.", 400)
    if not event_type:
        raise ApiException("Activity type is required.", 400)
    if len(event_type) > 20:
        raise ApiException("Activity type must be 20 characters or less.", 400)
    if not event_date:
        raise ApiException("Scheduled date is required.", 400)
    return {"title": title, "crop": crop, "type": event_type, "event_date": event_date, "notes": notes}


@api_view
@require_auth
def crop_events_root(request: HttpRequest):
    if request.method == "GET":
        rows, _ = request.supabase.select("crop_events", filters={"farmer_id": f"eq.{request.user_id}"}, order="event_date.asc")
        return JsonResponse(rows or [], safe=False)
    if request.method != "POST":
        return method_not_allowed(["GET", "POST"])
    payload = normalize_crop_event_payload(parse_json_body(request))
    created = request.supabase.insert("crop_events", {"farmer_id": request.user_id, **payload, "done": False}, single=True)
    return JsonResponse(created, status=201)


@api_view
@require_auth
def crop_event_detail(request: HttpRequest, event_id: str):
    if request.method == "PATCH":
        updates = parse_json_body(request)
        if "done" in updates and not isinstance(updates["done"], bool):
            raise ApiException("Invalid done status.", 400)
        if any(key in updates for key in ["title", "crop", "type", "event_date", "notes"]):
            updates.update(normalize_crop_event_payload(updates))
        updated = request.supabase.update(
            "crop_events",
            updates,
            filters={"id": f"eq.{event_id}", "farmer_id": f"eq.{request.user_id}"},
            single=True,
        )
        if not updated:
            raise ApiException("Not authorized or event not found", 403)
        return JsonResponse(updated)
    if request.method == "DELETE":
        request.supabase.delete("crop_events", filters={"id": f"eq.{event_id}", "farmer_id": f"eq.{request.user_id}"})
        return JsonResponse({"success": True})
    return method_not_allowed(["PATCH", "DELETE"])


@api_view
@require_auth
def id_verification_root(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    row, _ = request.supabase.select("id_verifications", filters={"user_id": f"eq.{request.user_id}"}, single=True)
    return JsonResponse(row or {"status": "unverified"})


@api_view
@require_auth
def id_verification_upload(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    front = request.FILES.get("front_side")
    back = request.FILES.get("back_side")
    if not front or not back:
        raise ApiException("Both front and back ID files are required", 400)
    fallback_full_name = request.auth_user.get("user_metadata", {}).get("full_name")
    ensure_profile_exists(request.supabase, request.user_id, fallback_full_name)
    uid = request.user_id
    front_path = f"{uid}/front_{int(datetime.utcnow().timestamp() * 1000)}_{front.name}"
    back_path = f"{uid}/back_{int(datetime.utcnow().timestamp() * 1000)}_{back.name}"
    request.supabase.upload_storage("id-documents", front_path, front.read(), front.content_type or "application/octet-stream", upsert=True)
    request.supabase.upload_storage("id-documents", back_path, back.read(), back.content_type or "application/octet-stream", upsert=True)
    front_url = request.supabase.create_signed_url("id-documents", front_path, 31536000)
    back_url = request.supabase.create_signed_url("id-documents", back_path, 31536000)
    created = request.supabase.insert(
        "id_verifications",
        {
            "user_id": uid,
            "doc_url": front_url,
            "front_doc_url": front_url,
            "back_doc_url": back_url,
            "status": "verified",
            "submitted_at": now_iso(),
            "reviewed_at": now_iso(),
            "reviewer_note": "Auto-verified on upload",
        },
        single=True,
        upsert=True,
        on_conflict="user_id",
    )
    return JsonResponse(created, status=201)


@api_view
@require_auth
def notifications_root(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    limit_raw = str(request.GET.get("limit") or "").strip()
    unread_only_raw = str(request.GET.get("unread_only") or "").strip().lower()
    try:
        limit = int(limit_raw) if limit_raw else 80
    except ValueError:
        raise ApiException("limit must be a valid integer.", 400)
    limit = max(1, min(limit, 200))

    filters = {"user_id": f"eq.{request.user_id}"}
    if unread_only_raw in {"1", "true", "yes"}:
        filters["read_at"] = "is.null"

    rows, _ = request.supabase.select(
        "user_notifications",
        select="id, user_id, source, source_user_id, title, message, priority, category, entity_type, entity_id, action_url, metadata, read_at, created_at",
        filters=filters,
        order="created_at.desc",
        limit=limit,
    )
    return JsonResponse(rows or [], safe=False)


@api_view
@require_auth
def notification_mark_read(request: HttpRequest, notification_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    existing, _ = request.supabase.select(
        "user_notifications",
        select="id, user_id, read_at",
        filters={"id": f"eq.{notification_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    if not existing:
        raise ApiException("Notification not found.", 404)
    if existing.get("read_at"):
        return JsonResponse(existing)

    updated = request.supabase.update(
        "user_notifications",
        {"read_at": now_iso()},
        filters={"id": f"eq.{notification_id}", "user_id": f"eq.{request.user_id}"},
        single=True,
    )
    return JsonResponse(updated)


@api_view
@require_auth
def notifications_mark_all_read(request: HttpRequest):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    updated = request.supabase.update(
        "user_notifications",
        {"read_at": now_iso()},
        filters={"user_id": f"eq.{request.user_id}", "read_at": "is.null"},
    )
    return JsonResponse({"updated": len(updated or [])})
