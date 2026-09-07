import base64
import ipaddress
import json
import logging
import math
import os
from datetime import datetime, timedelta
from functools import wraps
import time
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urljoin, urlparse

import requests

from .http import HttpRequest, HttpResponse, JsonResponse

APP_ROLES = ("farmer_free", "farmer_pro", "company", "transporter", "admin")
PAID_APP_ROLES = ("farmer_pro", "company")
PLAN_DURATION_DAYS = 30
LOAN_PRODUCT_TYPES = (
    "seasonal_working_capital",
    "equipment_top_up",
    "buyer_contract_financing",
)
LOAN_SECURITY_TYPES = (
    "unsecured",
    "guarantor",
    "collateral",
)
LOAN_BRANCH_VISIT_STATUSES = (
    "not_required",
    "pending_customer_visit",
    "documents_received",
    "valuation_pending",
    "verified",
    "waived",
)
NOTIFICATION_PRIORITY_LEVELS = {"high", "medium", "low"}
NOTIFICATION_CATEGORIES = {"action", "update", "info"}

logger = logging.getLogger(__name__)


class ApiException(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def api_view(fn):
    @wraps(fn)
    def wrapper(request: HttpRequest, *args, **kwargs):
        try:
            return fn(request, *args, **kwargs)
        except ApiException as exc:
            return JsonResponse({"error": exc.message}, status=exc.status)
        except requests.HTTPError as exc:
            text = exc.response.text if exc.response is not None else str(exc)
            return JsonResponse({"error": text or "Supabase request failed"}, status=500)
        except requests.RequestException as exc:
            return JsonResponse({"error": str(exc) or "Upstream request failed"}, status=502)
        except Exception as exc:
            return JsonResponse({"error": str(exc) or "Internal server error"}, status=500)

    return wrapper


def parse_json_body(request: HttpRequest) -> dict[str, Any]:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ApiException(f"Invalid JSON body: {exc}", 400)


def method_not_allowed(allowed: list[str]) -> HttpResponse:
    response = JsonResponse({"error": "Method not allowed"}, status=405)
    response["Allow"] = ", ".join(allowed)
    return response


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def write_user_notification(
    client: "SupabaseClient",
    *,
    user_id: str | None,
    title: str,
    message: str,
    priority: str = "medium",
    category: str = "update",
    entity_type: str | None = None,
    entity_id: str | None = None,
    action_url: str | None = None,
    source: str = "system",
    source_user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    target_user = str(user_id or "").strip()
    clean_title = str(title or "").strip()
    clean_message = str(message or "").strip()
    if not target_user or not clean_title or not clean_message:
        return

    next_priority = str(priority or "medium").strip().lower()
    if next_priority not in NOTIFICATION_PRIORITY_LEVELS:
        next_priority = "medium"

    next_category = str(category or "update").strip().lower()
    if next_category not in NOTIFICATION_CATEGORIES:
        next_category = "update"

    payload = {
        "user_id": target_user,
        "source": str(source or "system").strip() or "system",
        "source_user_id": source_user_id,
        "title": clean_title,
        "message": clean_message,
        "priority": next_priority,
        "category": next_category,
        "entity_type": str(entity_type or "").strip() or None,
        "entity_id": str(entity_id or "").strip() or None,
        "action_url": str(action_url or "").strip() or None,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "created_at": now_iso(),
    }
    try:
        client.insert("user_notifications", payload, single=True)
    except Exception as exc:
        logger.warning("Failed to write user notification: %s", exc)


def write_user_notifications(
    client: "SupabaseClient",
    *,
    user_ids: list[str],
    title: str,
    message: str,
    priority: str = "medium",
    category: str = "update",
    entity_type: str | None = None,
    entity_id: str | None = None,
    action_url: str | None = None,
    source: str = "system",
    source_user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    for user_id in sorted({str(item or "").strip() for item in user_ids if str(item or "").strip()}):
        write_user_notification(
            client,
            user_id=user_id,
            title=title,
            message=message,
            priority=priority,
            category=category,
            entity_type=entity_type,
            entity_id=entity_id,
            action_url=action_url,
            source=source,
            source_user_id=source_user_id,
            metadata=metadata,
        )


def send_sms(to_number: str, message: str) -> bool:
    """Sends SMS using Africa's Talking API, falling back to mock outbox logging if not configured."""
    clean_to = str(to_number or "").strip()
    clean_msg = str(message or "").strip()
    if not clean_to or not clean_msg:
        return False

    # Standardize Kenya numbers to E.164 if they start with 0
    if clean_to.startswith("0") and len(clean_to) == 10:
        clean_to = "+254" + clean_to[1:]

    username = os.getenv("AFRICASTALKING_USERNAME")
    api_key = os.getenv("AFRICASTALKING_API_KEY")
    sender_id = os.getenv("AFRICASTALKING_FROM")

    is_configured = bool(username and api_key and username.lower() != "sandbox" and "your" not in api_key.lower())

    if not is_configured:
        # Mock mode — write to outbox log for development inspection
        log_entry = f"[{datetime.utcnow().isoformat()}Z] TO: {clean_to} | MSG: {clean_msg}\n"
        try:
            log_dir = os.path.dirname(os.path.abspath(__file__))
            outbox_path = os.path.join(log_dir, "..", "sms_outbox.log")
            with open(outbox_path, "a", encoding="utf-8") as f:
                f.write(log_entry)
        except Exception as e:
            logger.warning("Failed to write mock SMS log: %s", e)

        logger.info("Mock SMS Outbox: To %s: %s", clean_to, clean_msg)
        return True

    # Real Africa's Talking API call
    url = "https://api.africastalking.com/version1/messaging"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "apiKey": api_key,
    }
    data = {
        "username": username,
        "to": clean_to,
        "message": clean_msg,
    }
    if sender_id:
        data["from"] = sender_id

    try:
        response = requests.post(url, headers=headers, data=data, timeout=10)
        response.raise_for_status()
        res_json = response.json()
        recipients = res_json.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("status") in {"Success", "UpRoute"}:
            logger.info("SMS sent successfully to %s via Africa's Talking", clean_to)
            return True
        else:
            status = recipients[0].get("status") if recipients else "Unknown"
            logger.warning("Africa's Talking returned failure status for %s: %s", clean_to, status)
            return False
    except Exception as exc:
        logger.error("Failed to send SMS to %s via Africa's Talking: %s", clean_to, exc)
        return False



def build_safe_storage_path(user_id: str, original_name: str) -> str:
    safe = "".join(char if char.isalnum() or char in "._-" else "_" for char in original_name)
    safe = "_".join(filter(None, safe.split("_"))) or "upload"
    return f"{user_id}/{int(datetime.utcnow().timestamp() * 1000)}_{safe}"


def parse_iso_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def build_plan_window(started_at: datetime | None = None, duration_days: int = PLAN_DURATION_DAYS) -> tuple[str, str]:
    plan_start = (started_at or datetime.utcnow()).replace(microsecond=0)
    plan_end = plan_start + timedelta(days=duration_days)
    return plan_start.isoformat() + "Z", plan_end.isoformat() + "Z"


def replace_user_role(client: "SupabaseClient", user_id: str, role: str) -> None:
    client.delete("user_roles", filters={"user_id": f"eq.{user_id}"})
    client.insert("user_roles", {"user_id": user_id, "role": role}, single=True)


def ensure_plan_window(user_id: str, role: str, fallback_full_name: str | None = None, started_at: datetime | None = None) -> dict[str, Any]:
    if role not in PAID_APP_ROLES:
        raise ApiException("Plan window can only be assigned to paid roles.", 400)

    admin = admin_client()
    ensure_profile_exists(admin, user_id, fallback_full_name)
    plan_started_at, plan_expires_at = build_plan_window(started_at)
    return admin.update(
        "profiles",
        {
            "plan_started_at": plan_started_at,
            "plan_expires_at": plan_expires_at,
        },
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )


def set_user_role_with_plan(user_id: str, role: str, fallback_full_name: str | None = None, started_at: datetime | None = None) -> dict[str, Any]:
    admin = admin_client()
    ensure_profile_exists(admin, user_id, fallback_full_name)
    replace_user_role(admin, user_id, role)

    profile_payload: dict[str, Any] = {
        "plan_started_at": None,
        "plan_expires_at": None,
    }
    if role in PAID_APP_ROLES:
        plan_started_at, plan_expires_at = build_plan_window(started_at)
        profile_payload.update(
            {
                "plan_started_at": plan_started_at,
                "plan_expires_at": plan_expires_at,
            }
        )

    profile = admin.update(
        "profiles",
        profile_payload,
        filters={"user_id": f"eq.{user_id}"},
        single=True,
    )
    invalidate_role_cache(user_id)
    return profile


def postgrest_in(values: list[Any]) -> str:
    items = []
    for value in values:
        if isinstance(value, (int, float)):
            items.append(str(value))
        else:
            escaped = str(value).replace('"', '\\"')
            items.append(f'"{escaped}"')
    return f"({','.join(items)})"


class SupabaseClient:
    def __init__(self, access_token: str | None = None, admin: bool = False):
        self.url = os.getenv("SUPABASE_URL")
        self.anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        self.service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not self.url:
            raise ApiException("Missing SUPABASE_URL", 500)
        if admin:
            if not self.service_role_key:
                raise ApiException("Missing SUPABASE_SERVICE_ROLE_KEY", 500)
            self.apikey = self.service_role_key
            self.authorization = f"Bearer {self.service_role_key}"
        else:
            if not self.anon_key:
                raise ApiException("Missing SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY", 500)
            self.apikey = self.anon_key
            self.authorization = f"Bearer {access_token}" if access_token else f"Bearer {self.anon_key}"
        self.session = requests.Session()
        self.session.headers.update(self._headers())

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"apikey": self.apikey, "Authorization": self.authorization}
        if extra:
            headers.update(extra)
        return headers

    def auth_get_user(self, token: str) -> dict[str, Any] | None:
        response = self.session.get(
            urljoin(self.url, "/auth/v1/user"),
            headers={"apikey": self.apikey, "Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code >= 400:
            return None
        return response.json()

    def auth_admin_list_users(self, page: int = 1, per_page: int = 500) -> list[dict[str, Any]]:
        response = self.session.get(
            urljoin(self.url, "/auth/v1/admin/users"),
            headers=self._headers(),
            params={"page": page, "per_page": per_page},
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("users", [])

    def auth_admin_get_user(self, user_id: str) -> dict[str, Any] | None:
        response = self.session.get(
            urljoin(self.url, f"/auth/v1/admin/users/{user_id}"),
            headers=self._headers(),
            timeout=30,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json().get("user")

    def rpc(self, name: str, payload: dict[str, Any]) -> Any:
        response = self.session.post(
            urljoin(self.url, f"/rest/v1/rpc/{name}"),
            headers=self._headers({"Content-Type": "application/json"}),
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        if not response.text:
            return None
        return response.json()

    def select(
        self,
        table: str,
        *,
        select: str = "*",
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = None,
        head: bool = False,
        count: str | None = None,
        single: bool = False,
    ) -> tuple[Any, int | None]:
        headers = self._headers({"Accept": "application/json"})
        if count:
            headers["Prefer"] = f"count={count}"
        response = self.session.request(
            "HEAD" if head else "GET",
            urljoin(self.url, f"/rest/v1/{table}"),
            headers=headers,
            params=self._build_params(select=select, filters=filters, order=order, limit=limit),
            timeout=60,
        )
        response.raise_for_status()
        count_value = None
        content_range = response.headers.get("Content-Range")
        if content_range and "/" in content_range:
            total = content_range.split("/")[-1]
            if total.isdigit():
                count_value = int(total)
        if head:
            return None, count_value
        data = response.json()
        if single:
            return (data[0] if isinstance(data, list) and data else None), count_value
        return data, count_value

    def insert(
        self,
        table: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        select: str = "*",
        single: bool = False,
        upsert: bool = False,
        on_conflict: str | None = None,
    ) -> Any:
        prefer = "return=representation"
        if upsert:
            prefer = "resolution=merge-duplicates,return=representation"
        params = {"select": select}
        if on_conflict:
            params["on_conflict"] = on_conflict
        response = self.session.post(
            urljoin(self.url, f"/rest/v1/{table}"),
            headers=self._headers({"Content-Type": "application/json", "Prefer": prefer}),
            params=params,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if single and isinstance(data, list) and data else data

    def update(
        self,
        table: str,
        payload: dict[str, Any],
        *,
        filters: dict[str, Any],
        select: str = "*",
        single: bool = False,
    ) -> Any:
        response = self.session.patch(
            urljoin(self.url, f"/rest/v1/{table}"),
            headers=self._headers({"Content-Type": "application/json", "Prefer": "return=representation"}),
            params=self._build_params(select=select, filters=filters),
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if single and isinstance(data, list) and data else data

    def delete(self, table: str, *, filters: dict[str, Any]) -> None:
        response = self.session.delete(
            urljoin(self.url, f"/rest/v1/{table}"),
            headers=self._headers(),
            params=self._build_params(filters=filters),
            timeout=60,
        )
        response.raise_for_status()

    def upload_storage(self, bucket: str, file_path: str, content: bytes, content_type: str, upsert: bool = False) -> None:
        response = self.session.post(
            urljoin(self.url, f"/storage/v1/object/{bucket}/{file_path}"),
            headers=self._headers({"Content-Type": content_type, "x-upsert": "true" if upsert else "false"}),
            data=content,
            timeout=120,
        )
        response.raise_for_status()

    def get_public_url(self, bucket: str, file_path: str) -> str:
        return urljoin(self.url, f"/storage/v1/object/public/{bucket}/{file_path}")

    def create_signed_url(self, bucket: str, file_path: str, expires_in: int) -> str:
        response = self.session.post(
            urljoin(self.url, f"/storage/v1/object/sign/{bucket}/{file_path}"),
            headers=self._headers({"Content-Type": "application/json"}),
            json={"expiresIn": expires_in},
            timeout=30,
        )
        response.raise_for_status()
        return urljoin(self.url, f"/storage/v1{response.json()['signedURL']}")

    @staticmethod
    def _build_params(
        *,
        select: str | None = None,
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if select:
            params["select"] = select
        if filters:
            params.update(filters)
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = str(limit)
        return params


def user_client(access_token: str | None = None) -> SupabaseClient:
    return SupabaseClient(access_token=access_token, admin=False)


def admin_client() -> SupabaseClient:
    return SupabaseClient(admin=True)


AUTH_CACHE = {}
AUTH_CACHE_TTL = 300  # 5 minutes
ROLE_CACHE = {}
ROLE_CACHE_TTL = 60  # 1 minute


def _cache_get(cache: dict[str, dict[str, Any]], key: str, ttl: int) -> Any:
    cached = cache.get(key)
    if not cached:
        return None
    if (time.time() - cached["timestamp"]) >= ttl:
        cache.pop(key, None)
        return None
    return cached["value"]


def _cache_set(cache: dict[str, dict[str, Any]], key: str, value: Any) -> Any:
    cache[key] = {"value": value, "timestamp": time.time()}
    return value


def get_authenticated_user(token: str, client: SupabaseClient | None = None) -> dict[str, Any] | None:
    cached_user = _cache_get(AUTH_CACHE, token, AUTH_CACHE_TTL)
    if cached_user:
        return cached_user

    authed_client = client or user_client(token)
    user = authed_client.auth_get_user(token)
    if user:
        return _cache_set(AUTH_CACHE, token, user)
    return None


def invalidate_role_cache(user_id: str) -> None:
    ROLE_CACHE.pop(user_id, None)


def require_auth(view):
    @wraps(view)
    def wrapped(request: HttpRequest, *args, **kwargs):
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise ApiException("Authorization header missing or invalid.", 401)
        token = auth_header.split(" ", 1)[1]

        client = user_client(token)
        user = get_authenticated_user(token, client)

        if not user:
            raise ApiException("Unauthorized - invalid token", 401)

        request.supabase = client
        request.user_id = user["id"]
        request.auth_token = token
        request.auth_user = user
        requested_role = request.headers.get("x-agrilink-role")
        request.requested_role = requested_role if requested_role in APP_ROLES else None
        return view(request, *args, **kwargs)

    return wrapped


def resolve_app_role(client: SupabaseClient, user_id: str, requested_role: str | None = None) -> str:
    cached_role = _cache_get(ROLE_CACHE, user_id, ROLE_CACHE_TTL)

    if cached_role in APP_ROLES:
        return cached_role

    try:
        role = client.rpc("get_user_role", {"_user_id": user_id})
        resolved_role = role if role in APP_ROLES else "farmer_free"
    except Exception:
        resolved_role = "farmer_free"

    if resolved_role in PAID_APP_ROLES:
        try:
            profile, _ = client.select(
                "profiles",
                select="plan_started_at, plan_expires_at",
                filters={"user_id": f"eq.{user_id}"},
                single=True,
            )
            plan_expires_at = parse_iso_datetime((profile or {}).get("plan_expires_at"))
            if plan_expires_at is None:
                try:
                    ensure_plan_window(user_id, resolved_role)
                except Exception:
                    pass
                return _cache_set(ROLE_CACHE, user_id, resolved_role)

            if plan_expires_at <= datetime.utcnow():
                try:
                    set_user_role_with_plan(user_id, "farmer_free")
                except Exception:
                    invalidate_role_cache(user_id)
                return _cache_set(ROLE_CACHE, user_id, "farmer_free")
        except Exception:
            return _cache_set(ROLE_CACHE, user_id, resolved_role)

    return _cache_set(ROLE_CACHE, user_id, resolved_role)


def ensure_profile_exists(client: SupabaseClient, user_id: str, fallback_full_name: str | None = None) -> dict[str, Any]:
    profile, _ = client.select("profiles", filters={"user_id": f"eq.{user_id}"}, single=True)
    if profile:
        return profile
    return client.insert("profiles", {"user_id": user_id, "full_name": fallback_full_name}, single=True)


def load_profiles_by_user_ids(client: SupabaseClient, user_ids: list[str], select: str = "user_id, full_name, county") -> dict[str, dict[str, Any]]:
    if not user_ids:
        return {}
    rows, _ = client.select("profiles", select=select, filters={"user_id": f"in.{postgrest_in(user_ids)}"})
    return {row["user_id"]: row for row in rows or []}


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


def normalize_kenyan_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("254") and len(digits) == 12:
        return digits
    if digits.startswith("0") and len(digits) == 10:
        return f"254{digits[1:]}"
    if digits.startswith("7") and len(digits) == 9:
        return f"254{digits}"
    raise ApiException("Phone number must be a valid Kenyan mobile number", 400)


_mpesa_mock_logged = False


def mpesa_mock_enabled() -> bool:
    global _mpesa_mock_logged
    is_mock = os.getenv("MPESA_ENV") != "live" and os.getenv("MPESA_MOCK_MODE", "true").lower() != "false"
    if is_mock and not _mpesa_mock_logged:
        _mpesa_mock_logged = True
        logger.info(
            "[M-Pesa] Running in MOCK MODE — no real Safaricom API calls will be made. "
            "Set MPESA_ENV=live and MPESA_MOCK_MODE=false when going to production."
        )
    return is_mock


def mpesa_live_mode_enabled() -> bool:
    return os.getenv("MPESA_ENV") == "live"


def get_env(*names: str, fallback: str | None = None) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    if fallback is not None:
        return fallback
    raise ApiException(f"Missing environment variable {names[0]}", 500)


def mpesa_timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d%H%M%S")


def get_mpesa_base_url() -> str:
    return "https://api.safaricom.co.ke" if mpesa_live_mode_enabled() else "https://sandbox.safaricom.co.ke"


def _is_private_hostname(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower()
    if not normalized:
        return True
    if normalized in {"localhost", "::1"} or normalized.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local or address.is_reserved


def validate_mpesa_callback_url(callback_url: str) -> str:
    normalized = callback_url.strip()
    parsed = urlparse(normalized)

    if not parsed.scheme or not parsed.netloc:
        raise ApiException("MPESA_CALLBACK_URL must be an absolute URL.", 500)

    if mpesa_live_mode_enabled():
        if parsed.scheme != "https":
            raise ApiException("Live M-Pesa requires MPESA_CALLBACK_URL to use HTTPS.", 500)
        if _is_private_hostname(parsed.hostname or ""):
            raise ApiException("Live M-Pesa requires MPESA_CALLBACK_URL to be publicly reachable.", 500)

    return normalized


def normalize_mpesa_amount(amount: float) -> int:
    value = int(round(float(amount)))
    if value <= 0:
        raise ApiException("M-Pesa amount must be at least KES 1.", 400)
    return value


def extract_mpesa_message(payload: dict[str, Any] | None, fallback: str) -> str:
    if isinstance(payload, dict):
        for key in ("errorMessage", "ResultDesc", "ResponseDescription", "CustomerMessage", "message", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return fallback


def decode_mpesa_response(response: requests.Response, context: str) -> dict[str, Any]:
    payload: dict[str, Any] | None = None

    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = None
        if isinstance(raw_payload, dict):
            payload = raw_payload

    if response.status_code >= 400:
        fallback = response.text.strip() or f"M-Pesa {context} request failed."
        raise ApiException(f"M-Pesa {context} failed: {extract_mpesa_message(payload, fallback)}", 502)

    if payload is None:
        raise ApiException(f"M-Pesa {context} returned an invalid response.", 502)

    return payload


def resolve_mpesa_payment_state(payload: dict[str, Any]) -> tuple[str, str, str]:
    result_code = str(payload.get("ResultCode") or "").strip()
    result_desc = extract_mpesa_message(payload, "Unknown payment status")

    if result_code == "0":
        return "paid", result_code, result_desc
    if result_code:
        return "failed", result_code, result_desc
    return "pending_confirmation", result_code, result_desc


def get_mpesa_access_token() -> str:
    consumer_key = get_env("MPESA_CONSUMER_KEY")
    consumer_secret = get_env("MPESA_CONSUMER_SECRET")
    auth = base64.b64encode(f"{consumer_key}:{consumer_secret}".encode("utf-8")).decode("utf-8")
    response = requests.get(
        f"{get_mpesa_base_url()}/oauth/v1/generate",
        params={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {auth}"},
        timeout=30,
    )
    payload = decode_mpesa_response(response, "access token request")
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise ApiException("M-Pesa access token response did not include an access token.", 502)
    return access_token.strip()


def mpesa_password(shortcode: str, passkey: str, timestamp: str) -> str:
    return base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode("utf-8")).decode("utf-8")


def initiate_stk_push(phone_number: str, amount: float, account_reference: str, transaction_desc: str) -> dict[str, Any]:
    shortcode = get_env("MPESA_SHORTCODE", "MPESA_SHORT_CODE", fallback="174379" if not mpesa_live_mode_enabled() else None)
    passkey = get_env("MPESA_PASSKEY", "MPESA_PASS_KEY", "MPESA_ONLINE_PASSKEY")
    if mpesa_live_mode_enabled() and not passkey.strip():
        raise ApiException(
            "MPESA_PASSKEY is required in live mode. Set it in your .env file — "
            "obtain it from the Safaricom Developer Portal under your app's Go Live credentials.",
            500,
        )
    callback_url = validate_mpesa_callback_url(get_env("MPESA_CALLBACK_URL", fallback="https://example.com/api/payments/mpesa/callback"))
    token = get_mpesa_access_token()
    timestamp = mpesa_timestamp()
    response = requests.post(
        f"{get_mpesa_base_url()}/mpesa/stkpush/v1/processrequest",
        json={
            "BusinessShortCode": shortcode,
            "Password": mpesa_password(shortcode, passkey, timestamp),
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": normalize_mpesa_amount(amount),
            "PartyA": phone_number,
            "PartyB": shortcode,
            "PhoneNumber": phone_number,
            "CallBackURL": callback_url,
            "AccountReference": account_reference,
            "TransactionDesc": transaction_desc,
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    payload = decode_mpesa_response(response, "STK push")
    response_code = str(payload.get("ResponseCode") or "").strip()
    if response_code and response_code != "0":
        raise ApiException(f"M-Pesa STK push failed: {extract_mpesa_message(payload, 'Request was rejected.')}", 502)
    if not payload.get("CheckoutRequestID") or not payload.get("MerchantRequestID"):
        raise ApiException("M-Pesa STK push did not return checkout identifiers.", 502)
    return payload


def query_stk_push(checkout_request_id: str) -> dict[str, Any]:
    shortcode = get_env("MPESA_SHORTCODE", "MPESA_SHORT_CODE", fallback="174379" if not mpesa_live_mode_enabled() else None)
    passkey = get_env("MPESA_PASSKEY", "MPESA_PASS_KEY", "MPESA_ONLINE_PASSKEY")
    token = get_mpesa_access_token()
    timestamp = mpesa_timestamp()
    response = requests.post(
        f"{get_mpesa_base_url()}/mpesa/stkpushquery/v1/query",
        json={
            "BusinessShortCode": shortcode,
            "Password": mpesa_password(shortcode, passkey, timestamp),
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id,
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    payload = decode_mpesa_response(response, "status query")
    response_code = str(payload.get("ResponseCode") or "").strip()
    if response_code and response_code != "0":
        raise ApiException(f"M-Pesa status query failed: {extract_mpesa_message(payload, 'Request was rejected.')}", 502)
    return payload


def build_loan_schedule(
    approved_amount: float | None,
    requested_amount: float | None,
    interest_rate: float | None,
    repayment_days: int | None,
    start_date: str | None,
    repayments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    principal = round_money(float(approved_amount or requested_amount or 0))
    annual_interest_rate = float(interest_rate or 0)
    scheduled_number_of_payments = max(1, math.ceil(float(repayment_days or 30) / 30))
    periodic_rate = annual_interest_rate / 100 / 12 if annual_interest_rate > 0 else 0
    start_value = start_date or now_iso()
    if principal <= 0:
        scheduled_payment = 0
    elif periodic_rate == 0:
        scheduled_payment = round_money(principal / scheduled_number_of_payments)
    else:
        scheduled_payment = round_money(
            (principal * periodic_rate) / (1 - math.pow(1 + periodic_rate, -scheduled_number_of_payments))
        )
    schedule = []
    beginning_balance = principal
    cumulative_interest = 0.0
    dt = datetime.fromisoformat(start_value.replace("Z", "+00:00"))
    for index in range(scheduled_number_of_payments):
        interest = round_money(beginning_balance * periodic_rate)
        principal_payment = round_money(beginning_balance if index == scheduled_number_of_payments - 1 else max(scheduled_payment - interest, 0))
        scheduled_payment_for_row = round_money(principal_payment + interest)
        ending_balance = round_money(max(beginning_balance - principal_payment, 0))
        cumulative_interest = round_money(cumulative_interest + interest)
        payment_date = (dt + timedelta(days=30 * index)).isoformat().replace("+00:00", "Z")
        schedule.append(
            {
                "paymentNumber": index + 1,
                "paymentDate": payment_date,
                "beginningBalance": beginning_balance,
                "scheduledPayment": scheduled_payment_for_row,
                "principal": principal_payment,
                "interest": interest,
                "endingBalance": ending_balance,
                "cumulativeInterest": cumulative_interest,
            }
        )
        beginning_balance = ending_balance
    total_interest = round_money(sum(row["interest"] for row in schedule))
    total_payable = round_money(principal + total_interest)
    repayments = repayments or []
    total_repaid = round_money(sum(float(item.get("amount") or 0) for item in repayments))
    remaining_balance = round_money(max(total_payable - total_repaid, 0))
    return {
        "summary": {
            "principal": principal,
            "annualInterestRate": annual_interest_rate,
            "scheduledPayment": scheduled_payment,
            "scheduledNumberOfPayments": scheduled_number_of_payments,
            "actualNumberOfPayments": len(repayments),
            "paymentsPerYear": 12,
            "startDate": start_value,
            "totalInterest": total_interest,
            "totalPayable": total_payable,
            "totalRepaid": total_repaid,
            "remainingBalance": remaining_balance,
        },
        "schedule": schedule,
    }


def escape_csv(value: Any) -> str:
    raw = str(value or "")
    if any(ch in raw for ch in ['"', ",", "\n"]):
        return '"' + raw.replace('"', '""') + '"'
    return raw
