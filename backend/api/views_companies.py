from __future__ import annotations

from datetime import date
import json
import logging
from typing import Any
from urllib.parse import urlparse

import requests

from .common import (
    ApiException,
    api_view,
    require_auth,
    admin_client,
    ensure_profile_exists,
    load_profiles_by_user_ids,
    resolve_app_role,
    postgrest_in,
    parse_json_body,
    build_safe_storage_path,
    normalize_kenyan_phone,
    method_not_allowed,
    now_iso,
    write_user_notification,
)
from .http import HttpRequest, HttpResponse, JsonResponse


logger = logging.getLogger(__name__)


def _clean_optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _clean_required_text(value: Any, field_label: str) -> str:
    text = _clean_optional_text(value)
    if not text:
        raise ApiException(f"{field_label} is required.", 400)
    return text


def _normalize_optional_email(value: Any) -> str | None:
    email = _clean_optional_text(value)
    if not email:
        return None
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ApiException("Email must be a valid email address.", 400)
    return email.lower()


def _normalize_optional_website(value: Any) -> str | None:
    website = _clean_optional_text(value)
    if not website:
        return None
    normalized = website if website.startswith(("http://", "https://")) else f"https://{website}"
    parsed = urlparse(normalized)
    if not parsed.scheme or not parsed.netloc:
        raise ApiException("Website must be a valid URL.", 400)
    return normalized


def _normalize_optional_company_phone(value: Any) -> str | None:
    phone = _clean_optional_text(value)
    if not phone:
        return None
    return f"+{normalize_kenyan_phone(phone)}"


def _normalize_string_list(value: Any, field_label: str) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ApiException(f"{field_label} must be a list of text values.", 400)
    return [str(item).strip() for item in value if str(item or "").strip()]


def _parse_non_negative_number(value: Any, field_label: str, *, allow_zero: bool = True) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ApiException(f"{field_label} must be a valid number.", 400)

    if parsed < 0 or (not allow_zero and parsed <= 0):
        comparator = "greater than 0" if not allow_zero else "0 or more"
        raise ApiException(f"{field_label} must be {comparator}.", 400)

    return parsed


PROCUREMENT_REQUEST_STATUSES = {"open", "paused", "closed"}
PROCUREMENT_RESPONSE_STATUSES = {"submitted", "accepted", "rejected", "withdrawn"}
PROCUREMENT_RESPONSE_DECISIONS = {"accept", "reject"}
DEAL_MATCH_FREE_DAILY_LIMIT = 3
DEAL_MATCH_MAX_RESULTS = 40
DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT = 8.0
DEAL_MATCH_MAX_MIN_MARGIN_PERCENT = 35.0


def _parse_enum_text(
    value: Any,
    field_label: str,
    *,
    allowed: set[str],
    optional: bool = True,
    allow_all: bool = False,
) -> str | None:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        if optional:
            return None
        raise ApiException(f"{field_label} is required.", 400)

    normalized = cleaned.lower()
    if allow_all and normalized == "all":
        return normalized

    if normalized not in allowed:
        values = ", ".join(sorted(allowed))
        if allow_all:
            values = f"{values}, all"
        raise ApiException(f"{field_label} must be one of: {values}.", 400)
    return normalized


def _coerce_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _normalized_match_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _match_tokens(value: Any) -> set[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in str(value or ""))
    return {token for token in cleaned.split() if len(token) >= 3}


def _decode_json_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item or "").strip()]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item or "").strip()]
    return []


def _score_budget_alignment(price: float, budget_min: float | None, budget_max: float | None) -> tuple[float, str]:
    if budget_min is None and budget_max is None:
        return 10.0, "unbounded"

    if budget_min is not None and budget_max is not None and budget_max < budget_min:
        budget_min, budget_max = budget_max, budget_min

    if budget_min is not None and budget_max is not None:
        if budget_min <= price <= budget_max:
            return 20.0, "within_budget"
        if price < budget_min:
            gap_pct = ((budget_min - price) / budget_min) if budget_min > 0 else 0
            return (14.0 if gap_pct <= 0.15 else 8.0), "below_budget"
        if budget_max <= 0:
            return 0.0, "over_budget"
        gap_pct = (price - budget_max) / budget_max
        if gap_pct <= 0.08:
            return 12.0, "over_budget"
        if gap_pct <= 0.18:
            return 5.0, "over_budget"
        return 0.0, "over_budget"

    if budget_min is not None:
        if price >= budget_min:
            return 16.0, "within_budget"
        gap_pct = ((budget_min - price) / budget_min) if budget_min > 0 else 0
        return (11.0 if gap_pct <= 0.15 else 6.0), "below_budget"

    if budget_max is None:
        return 10.0, "unbounded"
    if price <= budget_max:
        return 16.0, "within_budget"
    if budget_max <= 0:
        return 0.0, "over_budget"
    gap_pct = (price - budget_max) / budget_max
    return (8.0 if gap_pct <= 0.1 else 0.0), "over_budget"


def _suggested_price_band(
    list_price: float,
    budget_min: float | None,
    budget_max: float | None,
    min_margin_percent: float,
) -> tuple[float, float]:
    baseline_price = max(1.0, list_price)
    margin_floor = max(1.0, baseline_price * (1.0 - (min_margin_percent / 100.0)))
    lower_bound = max(margin_floor, baseline_price * 0.96)

    if budget_min is not None:
        lower_bound = max(lower_bound, budget_min)

    if budget_max is not None:
        upper_bound = budget_max
    else:
        upper_bound = max(lower_bound, baseline_price * 1.12)

    if budget_max is None:
        upper_bound = max(upper_bound, lower_bound)
    if upper_bound < lower_bound:
        upper_bound = lower_bound

    return round(lower_bound, 2), round(upper_bound, 2)


def _fit_label_for_score(score: float) -> str:
    if score >= 78:
        return "high"
    if score >= 56:
        return "good"
    return "fair"


def _estimate_win_probability(score: float, responses_count: int, days_until_needed: int | None) -> int:
    value = 18.0 + (score * 0.74) - (responses_count * 1.7)
    if days_until_needed is not None and days_until_needed <= 5:
        value += 4.0
    if days_until_needed is not None and days_until_needed < 0:
        value -= 18.0
    return int(round(_clamp(value, 5.0, 95.0)))


def _load_farmer_deal_match_settings(client, user_id: str) -> tuple[dict[str, Any], bool]:
    defaults = {
        "user_id": user_id,
        "realtime_alerts_enabled": True,
        "min_margin_percent": DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT,
        "free_unlocked_on": None,
        "free_unlocked_request_ids": [],
    }
    try:
        row, _ = client.select(
            "farmer_deal_match_settings",
            filters={"user_id": f"eq.{user_id}"},
            single=True,
        )
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "farmer_deal_match_settings"):
            return defaults, False
        raise

    if not row:
        return defaults, True

    min_margin = _clamp(
        _safe_float(row.get("min_margin_percent"), DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT),
        0.0,
        DEAL_MATCH_MAX_MIN_MARGIN_PERCENT,
    )

    return (
        {
            "user_id": user_id,
            "realtime_alerts_enabled": bool(row.get("realtime_alerts_enabled"))
            if row.get("realtime_alerts_enabled") is not None
            else True,
            "min_margin_percent": min_margin,
            "free_unlocked_on": str(row.get("free_unlocked_on") or "") or None,
            "free_unlocked_request_ids": _decode_json_text_list(row.get("free_unlocked_request_ids")),
        },
        True,
    )


def _upsert_farmer_deal_match_settings(client, payload: dict[str, Any]) -> dict[str, Any] | None:
    try:
        return client.insert(
            "farmer_deal_match_settings",
            payload,
            single=True,
            upsert=True,
            on_conflict="user_id",
        )
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "farmer_deal_match_settings"):
            return None
        raise


def _parse_iso_date_relaxed(value: Any) -> date | None:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned[:10])
    except ValueError:
        return None


def _normalize_currency_code(value: Any, *, default: str = "KES") -> str:
    cleaned = _clean_optional_text(value) or default
    code = cleaned.upper()
    if not code.isascii() or len(code) < 3 or len(code) > 6:
        raise ApiException("Currency must be a valid alphabetic code like KES or USD.", 400)
    if not code.isalpha():
        raise ApiException("Currency must only contain letters.", 400)
    return code


def _parse_optional_date_text(value: Any, field_label: str) -> str | None:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        return None
    try:
        # Keep date as ISO text for Supabase while validating format.
        return str(date.fromisoformat(cleaned))
    except ValueError:
        raise ApiException(f"{field_label} must be a valid date in YYYY-MM-DD format.", 400)


def _enrich_procurement_responses(client, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []

    farmer_ids = sorted({str(row.get("farmer_id") or "").strip() for row in rows if row.get("farmer_id")})
    product_ids = sorted({str(row.get("product_id") or "").strip() for row in rows if row.get("product_id")})

    profile_by_id = load_profiles_by_user_ids(
        client,
        farmer_ids,
        select="user_id, full_name, county, phone, farm_size, main_crops",
    ) if farmer_ids else {}
    product_rows, _ = client.select(
        "products",
        select="id, farmer_id, name, category, unit, price_per_unit, stock, is_available, cover_image_url",
        filters={"id": f"in.{postgrest_in(product_ids)}"} if product_ids else {},
    )
    product_by_id = {row["id"]: row for row in product_rows or []}

    enriched = []
    for row in rows:
        quantity_offered = float(row.get("quantity_offered") or 0)
        price_per_unit = float(row.get("price_per_unit") or 0)
        accepted_quantity_raw = row.get("accepted_quantity")
        accepted_quantity = float(accepted_quantity_raw) if accepted_quantity_raw is not None else None
        farmer_id = row.get("farmer_id")
        product_id = row.get("product_id")
        profile = profile_by_id.get(farmer_id or "", {})
        product = product_by_id.get(product_id)

        enriched.append(
            {
                **row,
                "quantity_offered": quantity_offered,
                "price_per_unit": price_per_unit,
                "accepted_quantity": accepted_quantity,
                "total_amount": round(quantity_offered * price_per_unit, 2),
                "currency": str(row.get("currency") or "KES"),
                "price_rank": None,
                "is_best_price_offer": False,
                "budget_fit": "unbounded",
                "price_vs_budget_max_pct": None,
                "market_signal": "market_rate",
                "days_until_needed_by": None,
                "farmer_profile": profile or None,
                "product": (
                    {
                        "id": product.get("id"),
                        "name": product.get("name"),
                        "category": product.get("category"),
                        "unit": product.get("unit"),
                        "price_per_unit": float(product.get("price_per_unit") or 0),
                        "stock": float(product.get("stock") or 0),
                        "is_available": bool(product.get("is_available")),
                        "cover_image_url": product.get("cover_image_url"),
                    }
                    if product
                    else None
                ),
            }
        )

    return enriched


def _apply_procurement_response_market_insights(
    procurement_request: dict[str, Any],
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not rows:
        return []

    budget_min = _coerce_float_or_none(procurement_request.get("budget_min"))
    budget_max = _coerce_float_or_none(procurement_request.get("budget_max"))
    needed_by = _parse_iso_date_relaxed(procurement_request.get("needed_by"))
    days_until_needed_by = (needed_by - date.today()).days if needed_by else None

    rankable_rows = [
        row
        for row in rows
        if str(row.get("status") or "").strip().lower() in {"submitted", "accepted"}
    ]
    ranked = sorted(
        rankable_rows,
        key=lambda item: (
            float(item.get("price_per_unit") or 0),
            str(item.get("created_at") or ""),
            str(item.get("id") or ""),
        ),
    )
    rank_by_id = {str(item.get("id")): index + 1 for index, item in enumerate(ranked) if item.get("id")}
    best_price = float(ranked[0].get("price_per_unit") or 0) if ranked else None

    enriched: list[dict[str, Any]] = []
    for row in rows:
        row_id = str(row.get("id") or "")
        price_per_unit = float(row.get("price_per_unit") or 0)

        budget_fit = "unbounded"
        if budget_min is not None and budget_max is not None:
            if price_per_unit < budget_min:
                budget_fit = "below_budget"
            elif price_per_unit > budget_max:
                budget_fit = "over_budget"
            else:
                budget_fit = "within_budget"
        elif budget_min is not None:
            budget_fit = "below_budget" if price_per_unit < budget_min else "within_budget"
        elif budget_max is not None:
            budget_fit = "over_budget" if price_per_unit > budget_max else "within_budget"

        price_vs_budget_max_pct = None
        if budget_max is not None and budget_max > 0:
            price_vs_budget_max_pct = round(((price_per_unit - budget_max) / budget_max) * 100, 2)

        is_best_price_offer = bool(
            row_id
            and best_price is not None
            and abs(price_per_unit - best_price) <= 1e-9
            and row_id in rank_by_id
        )

        market_signal = "market_rate"
        if budget_fit == "over_budget":
            market_signal = "over_budget"
        elif budget_fit == "within_budget" and is_best_price_offer:
            market_signal = "best_value"
        elif budget_fit == "below_budget":
            market_signal = "aggressive_pricing"

        enriched.append(
            {
                **row,
                "price_rank": rank_by_id.get(row_id),
                "is_best_price_offer": is_best_price_offer,
                "budget_fit": budget_fit,
                "price_vs_budget_max_pct": price_vs_budget_max_pct,
                "market_signal": market_signal,
                "days_until_needed_by": days_until_needed_by,
            }
        )

    return enriched


def api_exception_response(exc: ApiException) -> JsonResponse:
    return JsonResponse({"error": exc.message}, status=exc.status)


def get_company_for_user(client, user_id: str) -> dict[str, Any]:
    companies, _ = client.select(
        "companies",
        filters={"user_id": f"eq.{user_id}"},
        limit=1,
    )
    if not companies:
        raise ApiException("No company profile found", 404)
    return companies[0]


def _is_missing_relation_error(exc: requests.HTTPError, relation_name: str) -> bool:
    response = exc.response
    if response is None:
        return False

    parts: list[str] = []
    try:
        payload = response.json()
        if isinstance(payload, dict):
            for key in ("message", "details", "hint", "code", "error"):
                value = payload.get(key)
                if value:
                    parts.append(str(value))
    except ValueError:
        pass

    if response.text:
        parts.append(response.text)

    haystack = " ".join(parts).lower()
    if not haystack:
        return False

    relation_markers = (
        relation_name.lower(),
        f"public.{relation_name.lower()}",
        f'"{relation_name.lower()}"',
    )
    missing_markers = (
        "schema cache",
        "does not exist",
        "could not find the table",
        "relation",
        "42p01",
        "pgrst205",
    )

    return any(marker in haystack for marker in relation_markers) and any(
        marker in haystack for marker in missing_markers
    )


def _safe_select(client, table: str, *, default: Any, **kwargs):
    try:
        return client.select(table, **kwargs)
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, table):
            logger.warning("Company workflow table '%s' is missing in Supabase; falling back to default response.", table)
            return default, None
        raise


def _safe_count(client, table: str, *, filters: dict[str, Any]) -> int:
    rows, _ = _safe_select(client, table, default=[], filters=filters, select="count")
    if not rows:
        return 0
    first = rows[0] if isinstance(rows, list) else rows
    raw_count = first.get("count") if isinstance(first, dict) else None
    try:
        return int(raw_count or 0)
    except (TypeError, ValueError):
        return 0


def companies_root(request: HttpRequest):
    """Create or list companies."""
    if request.method == "GET":
        return companies_list(request)
    elif request.method == "POST":
        return companies_create(request)
    else:
        return method_not_allowed(request)


@require_auth
def companies_list(request: HttpRequest):
    """List all verified companies with optional filters."""
    try:
        client = request.supabase
        
        # Get filters from query params
        company_type = request.GET.get("type")
        search = request.GET.get("search")
        
        filters = {"verified": "eq.true"}
        
        if company_type:
            filters["company_type"] = f"eq.{company_type}"
        
        companies, _ = client.select(
            "companies",
            select="id, user_id, company_name, company_type, bio, logo_url, service_areas, rating, verified, certifications",
            filters=filters,
            order="rating.desc.nullslast,created_at.desc",
            limit=50,
        )
        
        # Filter by search if provided
        if search:
            search_lower = search.lower()
            companies = [c for c in companies or [] if search_lower in c.get("company_name", "").lower()]
        
        return JsonResponse({
            "companies": companies or [],
            "total": len(companies or [])
        })
    except Exception as e:
        logger.error(f"Error listing companies: {e}")
        return JsonResponse({"error": "Failed to list companies"}, status=500)


@require_auth
def companies_create(request: HttpRequest):
    """Create a new company profile."""
    try:
        user = request.auth_user
        if not user:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        
        data = parse_json_body(request)
        if not data:
            return JsonResponse({"error": "Invalid request body"}, status=400)
        
        client = request.supabase
        
        # Check if user already has a company profile
        existing, _ = client.select(
            "companies",
            filters={"user_id": f"eq.{user.get('id')}"},
            limit=1,
        )
        
        if existing:
            return JsonResponse({"error": "User already has a company profile"}, status=400)
        
        # Create company profile
        company_data = {
            "user_id": user.get("id"),
            "company_name": _clean_required_text(data.get("company_name"), "Company name"),
            "company_type": _clean_optional_text(data.get("company_type")) or "other",
            "registration_number": _clean_optional_text(data.get("registration_number")),
            "tax_id": _clean_optional_text(data.get("tax_id")),
            "phone": _normalize_optional_company_phone(data.get("phone")),
            "email": _normalize_optional_email(data.get("email")),
            "website": _normalize_optional_website(data.get("website")),
            "bio": _clean_optional_text(data.get("bio")),
            "headquarters_location": _clean_optional_text(data.get("headquarters_location")),
            "service_areas": _normalize_string_list(data.get("service_areas"), "Service areas"),
            "certifications": _normalize_string_list(data.get("certifications"), "Certifications"),
        }
        
        result = client.insert("companies", [company_data])
        
        return JsonResponse({
            "company": result[0] if result else company_data,
            "success": True,
        })
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error creating company: {e}")
        return JsonResponse({"error": "Failed to create company"}, status=500)


@require_auth
def company_me(request: HttpRequest):
    """Get current user's company profile."""
    if request.method == "GET":
        return company_me_get(request)
    elif request.method == "PATCH":
        return company_me_update(request)
    else:
        return method_not_allowed(request)


@require_auth
def company_me_get(request: HttpRequest):
    """Get the authenticated user's company profile."""
    try:
        user = request.auth_user
        if not user:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        
        client = request.supabase
        
        company = get_company_for_user(client, user.get("id"))
        
        # Get company stats
        orders_count = _safe_count(
            client,
            "company_orders",
            filters={"company_id": f"eq.{company['id']}", "status": "neq.failed"},
        )
        products_count = _safe_count(
            client,
            "company_products",
            filters={"company_id": f"eq.{company['id']}"},
        )
        relations_count = _safe_count(
            client,
            "farmer_company_relations",
            filters={"company_id": f"eq.{company['id']}", "status": "eq.active"},
        )
        contracts_count = _safe_count(
            client,
            "company_contracts",
            filters={"company_id": f"eq.{company['id']}", "status": "eq.active"},
        )
        
        return JsonResponse({
            "company": company,
            "stats": {
                "products_count": products_count,
                "orders_count": orders_count,
                "farmer_partners": relations_count,
                "active_contracts": contracts_count,
            }
        })
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error getting company profile: {e}")
        return JsonResponse({"error": "Failed to get company profile"}, status=500)


@require_auth
def company_me_update(request: HttpRequest):
    """Update the authenticated user's company profile."""
    try:
        user = request.auth_user
        if not user:
            return JsonResponse({"error": "Unauthorized"}, status=401)
        
        data = parse_json_body(request)
        if not data:
            return JsonResponse({"error": "Invalid request body"}, status=400)
        
        client = request.supabase
        
        # Verify company exists and belongs to user
        company = get_company_for_user(client, user.get("id"))
        company_id = company["id"]
        
        # Update only allowed fields
        update_data = {}
        allowed_fields = [
            "company_name", "company_type", "bio", "website", "phone", "email",
            "registration_number", "tax_id",
            "logo_url", "cover_image_url", "service_areas",
            "certifications", "headquarters_location",
            "payout_method", "payout_mpesa_number",
            "bank_name", "bank_account_name", "bank_account_number",
        ]
        
        for field in allowed_fields:
            if field not in data:
                continue
            if field == "company_name":
                update_data[field] = _clean_required_text(data.get(field), "Company name")
            elif field == "company_type":
                update_data[field] = _clean_optional_text(data.get(field)) or "other"
            elif field in {"registration_number", "tax_id", "bio", "logo_url", "cover_image_url", "headquarters_location", "payout_method", "bank_name", "bank_account_name"}:
                update_data[field] = _clean_optional_text(data.get(field))
            elif field == "phone" or field == "payout_mpesa_number":
                update_data[field] = _normalize_optional_company_phone(data.get(field))
            elif field == "email":
                update_data[field] = _normalize_optional_email(data.get(field))
            elif field == "website":
                update_data[field] = _normalize_optional_website(data.get(field))
            elif field == "bank_account_number":
                bank_account_number = _clean_optional_text(data.get(field))
                if bank_account_number and not bank_account_number.isdigit():
                    raise ApiException("Bank account number must contain digits only.", 400)
                update_data[field] = bank_account_number
            elif field in {"service_areas", "certifications"}:
                update_data[field] = _normalize_string_list(data.get(field), field.replace("_", " ").title())

        if not update_data:
            return JsonResponse({"error": "No valid fields to update"}, status=400)
        
        result = client.update("companies", update_data, filters={"id": f"eq.{company_id}"})
        
        return JsonResponse({
            "company": result[0] if result else {**company, **update_data},
            "success": True,
        })
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error updating company profile: {e}")
        return JsonResponse({"error": "Failed to update company profile"}, status=500)


@require_auth
def company_detail(request: HttpRequest, company_id: str):
    """Get details of a specific company."""
    if request.method == "GET":
        return company_detail_get(request, company_id)
    else:
        return method_not_allowed(request)


@require_auth
def company_detail_get(request: HttpRequest, company_id: str):
    """Get company details with relationship info."""
    try:
        user = request.auth_user
        client = request.supabase
        
        companies, _ = client.select(
            "companies",
            filters={"id": f"eq.{company_id}"},
            limit=1,
        )
        
        if not companies:
            return JsonResponse({"error": "Company not found"}, status=404)
        
        company = companies[0]
        
        # Get company products
        products, _ = _safe_select(
            client,
            "company_products",
            default=[],
            filters={"company_id": f"eq.{company_id}", "is_available": "eq.true"},
            select="id, name, category, price_per_unit, unit, stock, rating",
            limit=20,
        )
        
        # Get farmer relationships
        relations, _ = _safe_select(
            client,
            "farmer_company_relations",
            default=[],
            filters={"company_id": f"eq.{company_id}", "status": "eq.active"},
            select="id, farmer_id, rating, created_at",
            limit=10,
        )
        
        return JsonResponse({
            "company": company,
            "products": products or [],
            "farmer_partners": relations or [],
        })
    except Exception as e:
        logger.error(f"Error getting company details: {e}")
        return JsonResponse({"error": "Failed to get company details"}, status=500)


@require_auth
def company_products(request: HttpRequest):
    """Manage company products."""
    if request.method == "GET":
        return company_products_list(request)
    elif request.method == "POST":
        return company_products_create(request)
    else:
        return method_not_allowed(["GET", "POST"])


@require_auth
def company_products_upload_image(request: HttpRequest):
    """Upload a company product image and return its public URL."""
    if request.method != "POST":
        return method_not_allowed(["POST"])
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        file = request.FILES.get("image")
        if not file:
            return JsonResponse({"error": "No file uploaded"}, status=400)
        if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            return JsonResponse({"error": "Unsupported image type"}, status=400)

        file_path = build_safe_storage_path(company["id"], file.name)
        request.supabase.upload_storage("product-media", file_path, file.read(), file.content_type or "application/octet-stream")

        return JsonResponse({"url": request.supabase.get_public_url("product-media", file_path)})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error uploading company product image: {e}")
        return JsonResponse({"error": "Failed to upload company product image"}, status=500)


@require_auth
def company_product_detail(request: HttpRequest, product_id: str):
    if request.method == "PATCH":
        return company_product_update(request, product_id)
    if request.method == "DELETE":
        return company_product_delete(request, product_id)
    return method_not_allowed(["PATCH", "DELETE"])


@require_auth
def company_products_list(request: HttpRequest):
    """List company's products."""
    try:
        user = request.auth_user
        client = request.supabase
        
        # Get company
        company = get_company_for_user(client, user.get("id"))
        company_id = company["id"]
        
        # Get products
        products, _ = _safe_select(
            client,
            "company_products",
            default=[],
            filters={"company_id": f"eq.{company_id}"},
            order="created_at.desc",
            limit=100,
        )
        
        return JsonResponse({
            "products": products or [],
            "total": len(products or [])
        })
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error listing company products: {e}")
        return JsonResponse({"error": "Failed to list products"}, status=500)


@require_auth
def company_products_create(request: HttpRequest):
    """Create a new product."""
    try:
        user = request.auth_user
        data = parse_json_body(request)
        
        if not data or "name" not in data:
            return JsonResponse({"error": "Product name is required"}, status=400)
        
        client = request.supabase
        
        # Get company
        companies, _ = client.select(
            "companies",
            filters={"user_id": f"eq.{user.get('id')}"},
            limit=1,
        )
        
        if not companies:
            return JsonResponse({"error": "No company profile found"}, status=404)
        
        company_id = companies[0]["id"]
        
        product_data = {
            "company_id": company_id,
            "name": _clean_required_text(data.get("name"), "Product name"),
            "category": _clean_optional_text(data.get("category")) or "other",
            "description": _clean_optional_text(data.get("description")),
            "price_per_unit": _parse_non_negative_number(data.get("price_per_unit", 0), "Price per unit"),
            "unit": _clean_optional_text(data.get("unit")) or "kg",
            "minimum_order_quantity": _parse_non_negative_number(data.get("minimum_order_quantity", 1), "Minimum order quantity", allow_zero=False),
            "stock": _parse_non_negative_number(data.get("stock", 0), "Stock"),
            "bulk_discount_tiers": data.get("bulk_discount_tiers", []),
            "image_url": _clean_optional_text(data.get("image_url")),
            "is_available": bool(data.get("is_available", True)),
        }
        
        result = client.insert("company_products", [product_data])
        
        return JsonResponse({
            "product": result[0] if result else product_data,
            "success": True,
        }, status=201)
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_products"):
            return JsonResponse(
                {"error": "Company products are not installed in the database yet. Run repair_company_workflow.sql or setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        return JsonResponse({"error": "Failed to create product"}, status=500)


@require_auth
def company_product_update(request: HttpRequest, product_id: str):
    try:
        user = request.auth_user
        data = parse_json_body(request)
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        products, _ = client.select(
            "company_products",
            filters={"id": f"eq.{product_id}", "company_id": f"eq.{company['id']}"},
            limit=1,
        )
        if not products:
            return JsonResponse({"error": "Product not found"}, status=404)

        allowed_fields = [
            "name",
            "category",
            "description",
            "price_per_unit",
            "unit",
            "minimum_order_quantity",
            "stock",
            "bulk_discount_tiers",
            "image_url",
            "is_available",
        ]
        update_data = {}
        for field in allowed_fields:
            if field not in data:
                continue
            if field == "name":
                update_data[field] = _clean_required_text(data.get(field), "Product name")
            elif field == "category":
                update_data[field] = _clean_optional_text(data.get(field)) or "other"
            elif field == "description":
                update_data[field] = _clean_optional_text(data.get(field))
            elif field == "price_per_unit":
                update_data[field] = _parse_non_negative_number(data.get(field), "Price per unit")
            elif field == "unit":
                update_data[field] = _clean_optional_text(data.get(field)) or "kg"
            elif field == "minimum_order_quantity":
                update_data[field] = _parse_non_negative_number(data.get(field), "Minimum order quantity", allow_zero=False)
            elif field == "stock":
                update_data[field] = _parse_non_negative_number(data.get(field), "Stock")
            elif field == "image_url":
                update_data[field] = _clean_optional_text(data.get(field))
            elif field == "is_available":
                update_data[field] = bool(data.get(field))
            else:
                update_data[field] = data[field]
        if not update_data:
            return JsonResponse({"error": "No valid fields to update"}, status=400)

        result = client.update("company_products", update_data, filters={"id": f"eq.{product_id}"})
        return JsonResponse({"product": result[0] if result else {**products[0], **update_data}, "success": True})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error updating company product: {e}")
        return JsonResponse({"error": "Failed to update product"}, status=500)


@require_auth
def company_product_delete(request: HttpRequest, product_id: str):
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        products, _ = client.select(
            "company_products",
            filters={"id": f"eq.{product_id}", "company_id": f"eq.{company['id']}"},
            limit=1,
        )
        if not products:
            return JsonResponse({"error": "Product not found"}, status=404)
        client.delete("company_products", filters={"id": f"eq.{product_id}"})
        return JsonResponse({"success": True})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error deleting company product: {e}")
        return JsonResponse({"error": "Failed to delete product"}, status=500)


@require_auth
def company_orders(request: HttpRequest):
    """List company orders."""
    if request.method == "GET":
        return company_orders_list(request)
    else:
        return method_not_allowed(request)


@require_auth
def company_orders_list(request: HttpRequest):
    """Get all orders for company's products."""
    try:
        user = request.auth_user
        client = request.supabase
        
        # Get company
        company = get_company_for_user(client, user.get("id"))
        company_id = company["id"]
        
        # Get status filter if provided
        status_filter = request.GET.get("status")
        filters = {"company_id": f"eq.{company_id}"}
        if status_filter:
            filters["status"] = f"eq.{status_filter}"
        
        # Get orders
        orders, _ = _safe_select(
            client,
            "company_orders",
            default=[],
            filters=filters,
            order="created_at.desc",
            limit=100,
        )
        
        return JsonResponse({
            "orders": orders or [],
            "total": len(orders or [])
        })
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error listing company orders: {e}")
        return JsonResponse({"error": "Failed to list orders"}, status=500)


@require_auth
def company_partners(request: HttpRequest):
    if request.method == "GET":
        return company_partners_list(request)
    if request.method == "POST":
        return company_partners_create(request)
    return method_not_allowed(["GET", "POST"])


@require_auth
def company_partners_list(request: HttpRequest):
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))

        status_filter = request.GET.get("status")
        filters = {"company_id": f"eq.{company['id']}"}
        if status_filter and status_filter != "all":
            filters["status"] = f"eq.{status_filter}"

        relations, _ = _safe_select(
            client,
            "farmer_company_relations",
            default=[],
            filters=filters,
            order="created_at.desc",
            limit=100,
        )
        relations = relations or []
        farmer_ids = [relation["farmer_id"] for relation in relations if relation.get("farmer_id")]
        profile_by_user_id = load_profiles_by_user_ids(client, farmer_ids, select="user_id, full_name, county, phone, farm_size, main_crops")

        rows = []
        for relation in relations:
            farmer_profile = profile_by_user_id.get(relation.get("farmer_id"), {})
            rows.append({**relation, "farmer_profile": farmer_profile or None})

        return JsonResponse({"partners": rows, "total": len(rows)})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error listing company partners: {e}")
        return JsonResponse({"error": "Failed to list partners"}, status=500)


@require_auth
def company_partners_create(request: HttpRequest):
    try:
        user = request.auth_user
        data = parse_json_body(request)
        farmer_id = data.get("farmer_id")
        if not farmer_id:
            return JsonResponse({"error": "farmer_id is required"}, status=400)

        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        existing, _ = client.select(
            "farmer_company_relations",
            filters={"company_id": f"eq.{company['id']}", "farmer_id": f"eq.{farmer_id}"},
            limit=1,
        )
        if existing:
            return JsonResponse({"error": "Farmer is already linked to this company"}, status=400)

        relation_data = {
            "company_id": company["id"],
            "farmer_id": farmer_id,
            "status": data.get("status", "pending"),
            "notes": data.get("notes"),
        }
        result = client.insert("farmer_company_relations", [relation_data])
        return JsonResponse({"partner": result[0] if result else relation_data, "success": True}, status=201)
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "farmer_company_relations"):
            return JsonResponse(
                {"error": "Company partners are not installed in the database yet. Run repair_company_workflow.sql or setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error creating company partner relation: {e}")
        return JsonResponse({"error": "Failed to create partner relation"}, status=500)


@require_auth
def company_procurement_requests(request: HttpRequest):
    if request.method == "GET":
        return company_procurement_requests_list(request)
    if request.method == "POST":
        return company_procurement_requests_create(request)
    return method_not_allowed(["GET", "POST"])


@require_auth
def company_procurement_request_detail(request: HttpRequest, request_id: str):
    if request.method == "PATCH":
        return company_procurement_request_update(request, request_id)
    if request.method == "DELETE":
        return company_procurement_request_delete(request, request_id)
    return method_not_allowed(["PATCH", "DELETE"])


@require_auth
def company_procurement_request_update(request: HttpRequest, request_id: str):
    try:
        user = request.auth_user
        data = parse_json_body(request)
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        records, _ = client.select(
            "company_procurement_requests",
            filters={"id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            limit=1,
        )
        if not records:
            return JsonResponse({"error": "Procurement request not found"}, status=404)
        update_data: dict[str, Any] = {}
        if "title" in data:
            update_data["title"] = _clean_required_text(data.get("title"), "Title")
        if "category" in data:
            update_data["category"] = _clean_optional_text(data.get("category")) or "other"
        if "target_county" in data:
            update_data["target_county"] = _clean_optional_text(data.get("target_county"))
        if "quantity_needed" in data:
            update_data["quantity_needed"] = _parse_non_negative_number(data.get("quantity_needed"), "Quantity needed")
        if "unit" in data:
            update_data["unit"] = _clean_optional_text(data.get("unit")) or "kg"
        if "budget_min" in data:
            update_data["budget_min"] = (
                _parse_non_negative_number(data.get("budget_min"), "Budget minimum")
                if data.get("budget_min") not in (None, "")
                else None
            )
        if "budget_max" in data:
            update_data["budget_max"] = (
                _parse_non_negative_number(data.get("budget_max"), "Budget maximum")
                if data.get("budget_max") not in (None, "")
                else None
            )
        if "needed_by" in data:
            update_data["needed_by"] = _parse_optional_date_text(data.get("needed_by"), "Needed-by date")
        if "notes" in data:
            update_data["notes"] = _clean_optional_text(data.get("notes"))
        if "status" in data:
            update_data["status"] = _parse_enum_text(
                data.get("status"),
                "Status",
                allowed=PROCUREMENT_REQUEST_STATUSES,
                optional=False,
            )

        if not update_data:
            return JsonResponse({"error": "No valid fields to update"}, status=400)

        current_row = records[0]
        budget_min = (
            update_data["budget_min"]
            if "budget_min" in update_data
            else _coerce_float_or_none(current_row.get("budget_min"))
        )
        budget_max = (
            update_data["budget_max"]
            if "budget_max" in update_data
            else _coerce_float_or_none(current_row.get("budget_max"))
        )
        if budget_min is not None and budget_max is not None and budget_max < budget_min:
            raise ApiException("Budget maximum must be greater than or equal to budget minimum.", 400)

        result = client.update("company_procurement_requests", update_data, filters={"id": f"eq.{request_id}"})
        return JsonResponse({"request": result[0] if result else {**records[0], **update_data}, "success": True})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error updating procurement request: {e}")
        return JsonResponse({"error": "Failed to update procurement request"}, status=500)


@require_auth
def company_procurement_request_delete(request: HttpRequest, request_id: str):
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        records, _ = client.select(
            "company_procurement_requests",
            filters={"id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            limit=1,
        )
        if not records:
            return JsonResponse({"error": "Procurement request not found"}, status=404)

        client.delete("company_procurement_requests", filters={"id": f"eq.{request_id}"})
        return JsonResponse({"success": True})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error deleting procurement request: {e}")
        return JsonResponse({"error": "Failed to delete procurement request"}, status=500)


@require_auth
def company_procurement_requests_list(request: HttpRequest):
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        status_filter = _parse_enum_text(
            request.GET.get("status"),
            "Status filter",
            allowed=PROCUREMENT_REQUEST_STATUSES,
            allow_all=True,
        )
        filters = {"company_id": f"eq.{company['id']}"}
        if status_filter and status_filter != "all":
            filters["status"] = f"eq.{status_filter}"
        requests_rows, _ = _safe_select(
            client,
            "company_procurement_requests",
            default=[],
            filters=filters,
            order="created_at.desc",
            limit=100,
        )
        requests_rows = requests_rows or []
        request_ids = [row["id"] for row in requests_rows if row.get("id")]

        counts_by_request: dict[str, dict[str, int]] = {}
        if request_ids:
            responses, _ = _safe_select(
                client,
                "company_procurement_responses",
                default=[],
                select="id, request_id, status",
                filters={"request_id": f"in.{postgrest_in(request_ids)}"},
                limit=500,
            )
            for response in responses or []:
                request_id = response.get("request_id")
                if not request_id:
                    continue
                bucket = counts_by_request.setdefault(
                    request_id,
                    {
                        "responses_count": 0,
                        "submitted_responses_count": 0,
                        "accepted_responses_count": 0,
                        "rejected_responses_count": 0,
                        "withdrawn_responses_count": 0,
                    },
                )
                bucket["responses_count"] += 1
                status = str(response.get("status") or "")
                if status == "submitted":
                    bucket["submitted_responses_count"] += 1
                elif status == "accepted":
                    bucket["accepted_responses_count"] += 1
                elif status == "rejected":
                    bucket["rejected_responses_count"] += 1
                elif status == "withdrawn":
                    bucket["withdrawn_responses_count"] += 1

        rows = []
        for item in requests_rows:
            request_id = item.get("id")
            counts = counts_by_request.get(
                request_id,
                {
                    "responses_count": 0,
                    "submitted_responses_count": 0,
                    "accepted_responses_count": 0,
                    "rejected_responses_count": 0,
                    "withdrawn_responses_count": 0,
                },
            )
            rows.append({**item, **counts})

        return JsonResponse({"requests": rows, "total": len(rows)})
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error listing procurement requests: {e}")
        return JsonResponse({"error": "Failed to list procurement requests"}, status=500)


@require_auth
def company_procurement_requests_create(request: HttpRequest):
    try:
        user = request.auth_user
        data = parse_json_body(request)
        if not data.get("title"):
            return JsonResponse({"error": "title is required"}, status=400)
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))
        request_data = {
            "company_id": company["id"],
            "title": _clean_required_text(data.get("title"), "Title"),
            "category": _clean_optional_text(data.get("category")) or "other",
            "target_county": _clean_optional_text(data.get("target_county")),
            "quantity_needed": _parse_non_negative_number(data.get("quantity_needed", 0), "Quantity needed"),
            "unit": _clean_optional_text(data.get("unit")) or "kg",
            "budget_min": _parse_non_negative_number(data.get("budget_min"), "Budget minimum") if data.get("budget_min") not in (None, "") else None,
            "budget_max": _parse_non_negative_number(data.get("budget_max"), "Budget maximum") if data.get("budget_max") not in (None, "") else None,
            "needed_by": _parse_optional_date_text(data.get("needed_by"), "Needed-by date"),
            "notes": _clean_optional_text(data.get("notes")),
            "status": _parse_enum_text(
                data.get("status", "open"),
                "Status",
                allowed=PROCUREMENT_REQUEST_STATUSES,
                optional=False,
            ),
        }
        if request_data["budget_min"] is not None and request_data["budget_max"] is not None and request_data["budget_max"] < request_data["budget_min"]:
            raise ApiException("Budget maximum must be greater than or equal to budget minimum.", 400)
        result = client.insert("company_procurement_requests", [request_data])
        return JsonResponse({"request": result[0] if result else request_data, "success": True}, status=201)
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_procurement_requests"):
            return JsonResponse(
                {"error": "Company procurement is not installed in the database yet. Run repair_company_workflow.sql or setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error creating procurement request: {e}")
        return JsonResponse({"error": "Failed to create procurement request"}, status=500)


@require_auth
def company_procurement_request_responses(request: HttpRequest, request_id: str):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    try:
        user = request.auth_user
        client = request.supabase
        company = get_company_for_user(client, user.get("id"))

        procurement_request, _ = client.select(
            "company_procurement_requests",
            filters={"id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            single=True,
        )
        if not procurement_request:
            return JsonResponse({"error": "Procurement request not found."}, status=404)

        response_status = _parse_enum_text(
            request.GET.get("status"),
            "Response status filter",
            allowed=PROCUREMENT_RESPONSE_STATUSES,
            allow_all=True,
        )
        filters = {"request_id": f"eq.{request_id}"}
        if response_status and response_status != "all":
            filters["status"] = f"eq.{response_status}"

        responses, _ = _safe_select(
            client,
            "company_procurement_responses",
            default=[],
            filters=filters,
            order="created_at.desc",
            limit=300,
        )
        rows = _enrich_procurement_responses(client, responses or [])
        rows = _apply_procurement_response_market_insights(procurement_request, rows)
        return JsonResponse(
            {
                "request": procurement_request,
                "responses": rows,
                "total": len(rows),
            }
        )
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_procurement_responses"):
            return JsonResponse(
                {"error": "Procurement responses are not installed in the database yet. Run setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error listing procurement responses: {e}")
        return JsonResponse({"error": "Failed to list procurement responses"}, status=500)


@require_auth
def company_procurement_response_decision(request: HttpRequest, request_id: str, response_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    try:
        user = request.auth_user
        client = request.supabase
        data = parse_json_body(request)
        company = get_company_for_user(client, user.get("id"))
        company_note = _clean_optional_text(data.get("company_note"))
        decision_raw = str(data.get("decision") or data.get("action") or data.get("status") or "").strip().lower()
        decision = (
            "accept"
            if decision_raw in {"accept", "accepted"}
            else "reject" if decision_raw in {"reject", "rejected"} else ""
        )
        if decision not in PROCUREMENT_RESPONSE_DECISIONS:
            raise ApiException("Decision must be accept or reject.", 400)

        procurement_request, _ = client.select(
            "company_procurement_requests",
            select="id, company_id, title, target_county, status",
            filters={"id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            single=True,
        )
        if not procurement_request:
            return JsonResponse({"error": "Procurement request not found."}, status=404)

        response, _ = client.select(
            "company_procurement_responses",
            filters={"id": f"eq.{response_id}", "request_id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            single=True,
        )
        if not response:
            return JsonResponse({"error": "Procurement response not found."}, status=404)

        current_status = str(response.get("status") or "")
        if decision == "reject":
            if current_status == "accepted":
                raise ApiException("Accepted responses cannot be rejected.", 400)
            if current_status == "rejected":
                enriched_response = _apply_procurement_response_market_insights(
                    procurement_request,
                    _enrich_procurement_responses(client, [response]),
                )[0]
                return JsonResponse({"response": enriched_response, "success": True})
            if current_status != "submitted":
                raise ApiException("Only submitted responses can be rejected.", 400)
            updated = client.update(
                "company_procurement_responses",
                {
                    "status": "rejected",
                    "company_note": company_note,
                    "accepted_quantity": None,
                    "order_id": None,
                    "decided_at": now_iso(),
                },
                filters={"id": f"eq.{response_id}"},
                single=True,
            )
            write_user_notification(
                admin_client(),
                user_id=str(updated.get("farmer_id") or response.get("farmer_id") or "").strip() or None,
                title="Procurement response decision",
                message="Your procurement response was rejected by the company.",
                priority="medium",
                category="update",
                entity_type="procurement_response",
                entity_id=response_id,
                action_url="/dashboard/discovery",
                source="company",
                source_user_id=request.user_id,
                metadata={
                    "request_id": request_id,
                    "status": "rejected",
                    "company_note": company_note,
                },
            )
            enriched_response = _apply_procurement_response_market_insights(
                procurement_request,
                _enrich_procurement_responses(client, [updated]),
            )[0]
            return JsonResponse({"response": enriched_response, "success": True})

        if current_status == "accepted" and response.get("order_id"):
            enriched_response = _apply_procurement_response_market_insights(
                procurement_request,
                _enrich_procurement_responses(client, [response]),
            )[0]
            return JsonResponse({"response": enriched_response, "success": True})
        if current_status != "submitted":
            raise ApiException("Only submitted responses can be accepted.", 400)

        requested_quantity = float(response.get("quantity_offered") or 0)
        accepted_quantity = (
            _parse_non_negative_number(data.get("accepted_quantity"), "Accepted quantity", allow_zero=False)
            if data.get("accepted_quantity") not in (None, "")
            else requested_quantity
        )
        if accepted_quantity <= 0:
            raise ApiException("Accepted quantity must be greater than zero.", 400)
        if accepted_quantity > requested_quantity:
            raise ApiException("Accepted quantity cannot exceed quantity offered.", 400)

        product_id = str(response.get("product_id") or "").strip()
        if not product_id:
            raise ApiException("Response is missing a product reference.", 400)
        product, _ = admin_client().select(
            "products",
            select="id, farmer_id, unit, stock, is_available",
            filters={"id": f"eq.{product_id}"},
            single=True,
        )
        if not product:
            raise ApiException("Selected product no longer exists.", 404)
        if str(product.get("farmer_id") or "") != str(response.get("farmer_id") or ""):
            raise ApiException("Response product no longer belongs to the responding farmer.", 400)
        if not bool(product.get("is_available")):
            raise ApiException("Selected product is no longer available.", 400)
        if float(product.get("stock") or 0) < accepted_quantity:
            raise ApiException("Selected product does not have enough stock for this acceptance quantity.", 400)

        placement_note = f"Accepted procurement response for request: {procurement_request.get('title') or 'Untitled request'}"
        if company_note:
            placement_note = f"{placement_note}. {company_note}"

        result = client.rpc(
            "place_marketplace_order_v2",
            {
                "p_product_id": product_id,
                "p_quantity": accepted_quantity,
                "p_unit": _clean_optional_text(response.get("unit")) or _clean_optional_text(product.get("unit")) or "kg",
                "p_delivery_fee": None,
                "p_notes": placement_note,
                "p_delivery_distance_km": None,
                "p_pickup_county": _clean_optional_text(data.get("pickup_county")) or _clean_optional_text(procurement_request.get("target_county")),
            },
        )
        order_rows = result if isinstance(result, list) else [result] if result else []
        order = order_rows[0] if order_rows else None
        if not order:
            raise ApiException("Order conversion failed. Please try again.", 500)

        updated = client.update(
            "company_procurement_responses",
            {
                "status": "accepted",
                "company_note": company_note,
                "accepted_quantity": accepted_quantity,
                "order_id": order.get("id"),
                "decided_at": now_iso(),
            },
            filters={"id": f"eq.{response_id}"},
            single=True,
        )
        write_user_notification(
            admin_client(),
            user_id=str(updated.get("farmer_id") or response.get("farmer_id") or "").strip() or None,
            title="Procurement response accepted",
            message="Your procurement response was accepted and converted into an order.",
            priority="high",
            category="update",
            entity_type="procurement_response",
            entity_id=response_id,
            action_url="/dashboard/orders",
            source="company",
            source_user_id=request.user_id,
            metadata={
                "request_id": request_id,
                "status": "accepted",
                "order_id": updated.get("order_id"),
                "accepted_quantity": updated.get("accepted_quantity"),
            },
        )

        if bool(data.get("close_request")):
            client.update(
                "company_procurement_requests",
                {"status": "closed"},
                filters={"id": f"eq.{request_id}", "company_id": f"eq.{company['id']}"},
            )

        enriched_response = _apply_procurement_response_market_insights(
            procurement_request,
            _enrich_procurement_responses(client, [updated]),
        )[0]
        return JsonResponse(
            {
                "response": enriched_response,
                "order": order,
                "success": True,
            }
        )
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_procurement_responses"):
            return JsonResponse(
                {"error": "Procurement responses are not installed in the database yet. Run setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error deciding procurement response: {e}")
        return JsonResponse({"error": "Failed to decide procurement response"}, status=500)


@require_auth
def farmer_procurement_request_responses(request: HttpRequest, request_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    try:
        role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
        if role not in {"farmer_free", "farmer_pro", "admin"}:
            raise ApiException("Only farmer accounts can respond to procurement requests.", 403)

        data = parse_json_body(request)
        product_id = _clean_required_text(data.get("product_id"), "Product")
        quantity_offered = _parse_non_negative_number(data.get("quantity_offered"), "Quantity offered", allow_zero=False)
        notes = _clean_optional_text(data.get("notes"))
        unit_override = _clean_optional_text(data.get("unit"))

        client = request.supabase
        procurement_request, _ = client.select(
            "company_procurement_requests",
            select="id, company_id, status",
            filters={"id": f"eq.{request_id}"},
            single=True,
        )
        if not procurement_request:
            return JsonResponse({"error": "Procurement request not found."}, status=404)
        if procurement_request.get("status") != "open":
            raise ApiException("This procurement request is not open for responses.", 400)

        product, _ = client.select(
            "products",
            select="id, farmer_id, unit, stock, is_available, price_per_unit",
            filters={"id": f"eq.{product_id}"},
            single=True,
        )
        if not product:
            raise ApiException("Product not found.", 404)
        if str(product.get("farmer_id") or "") != request.user_id:
            raise ApiException("You can only respond with your own product listings.", 403)
        if not bool(product.get("is_available")):
            raise ApiException("Selected product is not currently available.", 400)
        if float(product.get("stock") or 0) < quantity_offered:
            raise ApiException("Selected product stock is lower than quantity offered.", 400)

        price_per_unit = (
            _parse_non_negative_number(data.get("price_per_unit"), "Price per unit", allow_zero=False)
            if data.get("price_per_unit") not in (None, "")
            else _parse_non_negative_number(product.get("price_per_unit"), "Product price per unit", allow_zero=False)
        )

        existing_response, _ = client.select(
            "company_procurement_responses",
            filters={
                "request_id": f"eq.{request_id}",
                "farmer_id": f"eq.{request.user_id}",
                "product_id": f"eq.{product_id}",
            },
            single=True,
        )
        if existing_response and str(existing_response.get("status") or "") == "accepted" and existing_response.get("order_id"):
            raise ApiException("This offer was already accepted and converted into an order.", 400)

        payload = {
            "request_id": request_id,
            "company_id": procurement_request.get("company_id"),
            "farmer_id": request.user_id,
            "product_id": product_id,
            "quantity_offered": quantity_offered,
            "accepted_quantity": None,
            "unit": unit_override or _clean_optional_text(product.get("unit")) or "kg",
            "price_per_unit": price_per_unit,
            "currency": _normalize_currency_code(data.get("currency")),
            "notes": notes,
            "company_note": None,
            "status": "submitted",
            "order_id": None,
            "decided_at": None,
        }

        row = client.insert(
            "company_procurement_responses",
            payload,
            single=True,
            upsert=True,
            on_conflict="request_id,farmer_id,product_id",
        )
        enriched = _apply_procurement_response_market_insights(
            procurement_request,
            _enrich_procurement_responses(client, [row]),
        )[0]
        return JsonResponse({"response": enriched, "success": True}, status=201)
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_procurement_responses"):
            return JsonResponse(
                {"error": "Procurement responses are not installed in the database yet. Run setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error submitting procurement response: {e}")
        return JsonResponse({"error": "Failed to submit procurement response"}, status=500)


@require_auth
def farmer_procurement_response_withdraw(request: HttpRequest, request_id: str, response_id: str):
    if request.method != "POST":
        return method_not_allowed(["POST"])

    try:
        role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
        if role not in {"farmer_free", "farmer_pro", "admin"}:
            raise ApiException("Only farmer accounts can withdraw procurement offers.", 403)

        client = request.supabase
        procurement_request, _ = client.select(
            "company_procurement_requests",
            select="id, company_id, budget_min, budget_max, needed_by, status",
            filters={"id": f"eq.{request_id}"},
            single=True,
        )
        if not procurement_request:
            return JsonResponse({"error": "Procurement request not found."}, status=404)

        response, _ = client.select(
            "company_procurement_responses",
            filters={
                "id": f"eq.{response_id}",
                "request_id": f"eq.{request_id}",
                "farmer_id": f"eq.{request.user_id}",
            },
            single=True,
        )
        if not response:
            return JsonResponse({"error": "Procurement response not found."}, status=404)

        current_status = str(response.get("status") or "")
        if current_status == "accepted" and response.get("order_id"):
            raise ApiException("Accepted procurement offers cannot be withdrawn.", 400)
        if current_status not in {"submitted", "rejected", "withdrawn"}:
            raise ApiException("This procurement offer cannot be withdrawn.", 400)
        if current_status == "withdrawn":
            enriched = _apply_procurement_response_market_insights(
                procurement_request,
                _enrich_procurement_responses(client, [response]),
            )[0]
            return JsonResponse({"response": enriched, "success": True})

        updated = client.update(
            "company_procurement_responses",
            {
                "status": "withdrawn",
                "accepted_quantity": None,
                "order_id": None,
                "decided_at": None,
            },
            filters={"id": f"eq.{response_id}", "farmer_id": f"eq.{request.user_id}"},
            single=True,
        )
        enriched = _apply_procurement_response_market_insights(
            procurement_request,
            _enrich_procurement_responses(client, [updated]),
        )[0]
        return JsonResponse({"response": enriched, "success": True})
    except requests.HTTPError as exc:
        if _is_missing_relation_error(exc, "company_procurement_responses"):
            return JsonResponse(
                {"error": "Procurement responses are not installed in the database yet. Run setup_database.sql, then try again."},
                status=503,
            )
        raise
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error withdrawing procurement response: {e}")
        return JsonResponse({"error": "Failed to withdraw procurement response"}, status=500)


@require_auth
def farmer_companies(request: HttpRequest):
    """Get companies for a farmer (list companies they can buy from)."""
    if request.method == "GET":
        return farmer_companies_list(request)
    else:
        return method_not_allowed(request)


@require_auth
def farmer_procurement(request: HttpRequest):
    """Get open company procurement requests for farmers."""
    if request.method == "GET":
        return farmer_procurement_list(request)
    return method_not_allowed(["GET"])


@require_auth
def farmer_deal_matches(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])

    try:
        role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
        if role not in {"farmer_free", "farmer_pro", "admin"}:
            raise ApiException("Only farmer accounts can access deal matches.", 403)

        is_pro = role in {"farmer_pro", "admin"}
        settings, settings_available = _load_farmer_deal_match_settings(request.supabase, request.user_id)
        min_margin_percent = (
            _clamp(_safe_float(settings.get("min_margin_percent"), DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT), 0.0, DEAL_MATCH_MAX_MIN_MARGIN_PERCENT)
            if is_pro
            else DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT
        )
        realtime_alerts_enabled = bool(settings.get("realtime_alerts_enabled")) if is_pro else False

        profile, _ = request.supabase.select(
            "profiles",
            select="county",
            filters={"user_id": f"eq.{request.user_id}"},
            single=True,
        )
        farmer_county = _normalized_match_text((profile or {}).get("county"))

        my_products, _ = request.supabase.select(
            "products",
            select="id, name, category, unit, stock, price_per_unit, is_available, location",
            filters={"farmer_id": f"eq.{request.user_id}", "is_available": "eq.true"},
            order="updated_at.desc",
            limit=200,
        )
        product_rows = [
            row
            for row in (my_products or [])
            if bool(row.get("is_available")) and _safe_float(row.get("stock")) > 0 and _safe_float(row.get("price_per_unit")) > 0
        ]

        if not product_rows:
            return JsonResponse(
                {
                    "matches": [],
                    "meta": {
                        "role": role,
                        "is_pro": is_pro,
                        "daily_limit": DEAL_MATCH_FREE_DAILY_LIMIT if not is_pro else None,
                        "remaining_today": DEAL_MATCH_FREE_DAILY_LIMIT if not is_pro else None,
                        "total_scored_matches": 0,
                        "generated_at": now_iso(),
                    },
                    "settings": {
                        "realtime_alerts_enabled": realtime_alerts_enabled,
                        "min_margin_percent": min_margin_percent,
                        "settings_persisted": settings_available,
                    },
                }
            )

        product_profiles: list[dict[str, Any]] = []
        for row in product_rows:
            product_name = str(row.get("name") or "")
            product_category = str(row.get("category") or "")
            normalized_location = _normalized_match_text(row.get("location"))
            product_profiles.append(
                {
                    "row": row,
                    "name_normalized": _normalized_match_text(product_name),
                    "category_normalized": _normalized_match_text(product_category),
                    "tokens": _match_tokens(f"{product_name} {product_category}"),
                    "county_normalized": normalized_location or farmer_county,
                }
            )

        admin = admin_client()
        procurement_requests, _ = _safe_select(
            admin,
            "company_procurement_requests",
            default=[],
            filters={"status": "eq.open"},
            order="created_at.desc",
            limit=160,
        )
        procurement_requests = procurement_requests or []

        company_ids = [row.get("company_id") for row in procurement_requests if row.get("company_id")]
        companies_by_id: dict[str, dict[str, Any]] = {}
        if company_ids:
            company_rows, _ = admin.select(
                "companies",
                select="id, company_name, company_type, headquarters_location, service_areas, verified, verification_status",
                filters={"id": f"in.{postgrest_in(company_ids)}"},
            )
            companies_by_id = {str(company.get("id")): company for company in company_rows or []}

        open_requests: list[dict[str, Any]] = []
        for row in procurement_requests:
            company = companies_by_id.get(str(row.get("company_id") or ""))
            if not company:
                continue
            if not (company.get("verified") or company.get("verification_status") == "approved"):
                continue
            open_requests.append(
                {
                    **row,
                    "company": {
                        "id": company.get("id"),
                        "company_name": company.get("company_name"),
                        "company_type": company.get("company_type"),
                        "headquarters_location": company.get("headquarters_location"),
                        "service_areas": company.get("service_areas") or [],
                    },
                }
            )

        request_ids = [str(row.get("id")) for row in open_requests if row.get("id")]
        responses_count_by_request: dict[str, int] = {}
        submitted_count_by_request: dict[str, int] = {}
        my_response_by_request_product: dict[tuple[str, str], str] = {}
        my_response_by_request: dict[str, str] = {}

        if request_ids:
            all_responses, _ = _safe_select(
                admin,
                "company_procurement_responses",
                default=[],
                select="request_id, status",
                filters={"request_id": f"in.{postgrest_in(request_ids)}"},
                limit=1500,
            )
            for row in all_responses or []:
                request_id = str(row.get("request_id") or "")
                if not request_id:
                    continue
                responses_count_by_request[request_id] = responses_count_by_request.get(request_id, 0) + 1
                if str(row.get("status") or "") == "submitted":
                    submitted_count_by_request[request_id] = submitted_count_by_request.get(request_id, 0) + 1

            my_responses, _ = _safe_select(
                request.supabase,
                "company_procurement_responses",
                default=[],
                select="request_id, product_id, status, updated_at",
                filters={
                    "request_id": f"in.{postgrest_in(request_ids)}",
                    "farmer_id": f"eq.{request.user_id}",
                },
                order="updated_at.desc",
                limit=400,
            )
            for response in my_responses or []:
                request_id = str(response.get("request_id") or "")
                product_id = str(response.get("product_id") or "")
                status = str(response.get("status") or "")
                if not request_id:
                    continue
                if request_id not in my_response_by_request:
                    my_response_by_request[request_id] = status
                if request_id and product_id and (request_id, product_id) not in my_response_by_request_product:
                    my_response_by_request_product[(request_id, product_id)] = status

        opportunities: list[dict[str, Any]] = []

        for request_row in open_requests:
            request_id = str(request_row.get("id") or "")
            if not request_id:
                continue

            category = str(request_row.get("category") or "")
            title = str(request_row.get("title") or "")
            notes = str(request_row.get("notes") or "")
            request_text = f"{title} {category} {notes}"
            request_tokens = _match_tokens(request_text)
            request_text_normalized = _normalized_match_text(request_text)
            request_category_normalized = _normalized_match_text(category)
            target_county = _normalized_match_text(request_row.get("target_county"))
            requested_quantity = _safe_float(request_row.get("quantity_needed"), 0.0)
            normalized_quantity = requested_quantity if requested_quantity > 0 else 1.0
            budget_min = _coerce_float_or_none(request_row.get("budget_min"))
            budget_max = _coerce_float_or_none(request_row.get("budget_max"))
            needed_by = _parse_iso_date_relaxed(request_row.get("needed_by"))
            days_until_needed = (needed_by - date.today()).days if needed_by else None

            best_candidate: dict[str, Any] | None = None
            responses_count = responses_count_by_request.get(request_id, 0)
            submitted_count = submitted_count_by_request.get(request_id, 0)

            for product_profile in product_profiles:
                product = product_profile["row"]
                product_id = str(product.get("id") or "")
                if not product_id:
                    continue

                product_price = _safe_float(product.get("price_per_unit"), 0.0)
                product_stock = _safe_float(product.get("stock"), 0.0)
                if product_price <= 0 or product_stock <= 0:
                    continue

                product_tokens = product_profile["tokens"]
                token_overlap = len(request_tokens.intersection(product_tokens))
                overlap_ratio = token_overlap / max(1, min(len(request_tokens), len(product_tokens)))

                exact_category_match = bool(
                    request_category_normalized
                    and product_profile["category_normalized"]
                    and request_category_normalized == product_profile["category_normalized"]
                )
                category_related = bool(
                    request_category_normalized
                    and (
                        request_category_normalized in product_profile["name_normalized"]
                        or request_category_normalized in product_profile["category_normalized"]
                    )
                )

                text_score = 0.0
                if exact_category_match:
                    text_score = 32.0
                elif category_related:
                    text_score = 24.0
                elif overlap_ratio >= 0.25:
                    text_score = 12.0

                if overlap_ratio >= 0.5:
                    text_score += 10.0
                elif overlap_ratio >= 0.3:
                    text_score += 6.0
                elif token_overlap > 0:
                    text_score += 3.0

                if product_profile["name_normalized"] and product_profile["name_normalized"] in request_text_normalized:
                    text_score += 5.0

                if text_score <= 0:
                    continue

                stock_ratio = min(1.0, product_stock / normalized_quantity) if normalized_quantity > 0 else 1.0
                stock_score = 6.0 + (stock_ratio * 18.0)
                if requested_quantity > 0 and product_stock < requested_quantity * 0.2:
                    stock_score -= 6.0

                if not target_county:
                    county_score = 8.0
                elif target_county == product_profile["county_normalized"]:
                    county_score = 18.0
                elif target_county == farmer_county:
                    county_score = 12.0
                else:
                    county_score = 2.0

                budget_score, budget_fit = _score_budget_alignment(product_price, budget_min, budget_max)

                if days_until_needed is None:
                    urgency_score = 3.0
                elif days_until_needed < 0:
                    urgency_score = -6.0
                elif days_until_needed <= 3:
                    urgency_score = 8.0
                elif days_until_needed <= 10:
                    urgency_score = 6.0
                elif days_until_needed <= 30:
                    urgency_score = 3.0
                else:
                    urgency_score = 1.0

                competition_penalty = min(14.0, responses_count * 1.3)

                my_response_status = my_response_by_request_product.get((request_id, product_id))
                already_applied = bool(my_response_status and my_response_status in {"submitted", "accepted"})
                repeat_penalty = 5.0 if already_applied else 0.0

                raw_score = (
                    text_score
                    + stock_score
                    + county_score
                    + budget_score
                    + urgency_score
                    - competition_penalty
                    - repeat_penalty
                )
                score = _clamp(raw_score, 0.0, 100.0)
                if score < 35.0:
                    continue

                reasons: list[str] = []
                if exact_category_match:
                    reasons.append("Category aligns with the buyer request.")
                if target_county and (target_county == product_profile["county_normalized"] or target_county == farmer_county):
                    reasons.append("Target county matches your current supply location.")
                if stock_ratio >= 1.0:
                    reasons.append("Your stock can satisfy the full requested quantity.")
                if budget_fit == "within_budget":
                    reasons.append("Your listing price fits the buyer's budget.")
                elif budget_fit == "below_budget":
                    reasons.append("Your price is below the buyer budget and can be positioned as value.")
                if responses_count <= 2:
                    reasons.append("Competition is still light on this request.")
                if not reasons:
                    reasons.append("Your product details align with this buyer demand.")

                suggested_min, suggested_max = _suggested_price_band(
                    product_price,
                    budget_min,
                    budget_max,
                    min_margin_percent,
                )
                margin_floor = round(max(1.0, product_price * (1.0 - (min_margin_percent / 100.0))), 2)
                guarded_price = round(max(suggested_min, margin_floor), 2)
                if suggested_max < guarded_price:
                    suggested_max = guarded_price

                draft_quantity = round(
                    min(product_stock, requested_quantity) if requested_quantity > 0 else min(product_stock, 1.0),
                    2,
                )
                if draft_quantity <= 0:
                    draft_quantity = min(product_stock, 1.0)

                candidate = {
                    "score": round(score, 1),
                    "fit_label": _fit_label_for_score(score),
                    "reasons": reasons[:3],
                    "product": product,
                    "budget_fit": budget_fit,
                    "suggested_min": suggested_min,
                    "suggested_max": suggested_max,
                    "guarded_price": guarded_price,
                    "margin_floor": margin_floor,
                    "draft_quantity": round(draft_quantity, 2),
                    "already_applied": already_applied,
                    "my_response_status": my_response_status or my_response_by_request.get(request_id),
                }

                if best_candidate is None or candidate["score"] > best_candidate["score"]:
                    best_candidate = candidate

            if not best_candidate:
                continue

            product = best_candidate["product"]
            recommended_product = {
                "id": product.get("id"),
                "name": product.get("name"),
                "category": product.get("category"),
                "stock": round(_safe_float(product.get("stock")), 2),
                "unit": product.get("unit") or "kg",
                "price_per_unit": round(_safe_float(product.get("price_per_unit")), 2),
            }
            draft_offer = {
                "product_id": recommended_product["id"],
                "quantity_offered": best_candidate["draft_quantity"],
                "price_per_unit": best_candidate["guarded_price"],
                "notes": "Auto-draft from Deal Match Engine.",
            }

            row = {
                "request_id": request_id,
                "title": title,
                "category": category,
                "target_county": request_row.get("target_county"),
                "quantity_needed": round(_safe_float(request_row.get("quantity_needed")), 2),
                "unit": request_row.get("unit") or "kg",
                "budget_min": _coerce_float_or_none(request_row.get("budget_min")),
                "budget_max": _coerce_float_or_none(request_row.get("budget_max")),
                "needed_by": request_row.get("needed_by"),
                "notes": request_row.get("notes"),
                "company": request_row.get("company"),
                "score": best_candidate["score"],
                "fit_label": best_candidate["fit_label"],
                "reasons": best_candidate["reasons"],
                "responses_count": responses_count,
                "submitted_responses_count": submitted_count,
                "recommended_product": recommended_product,
                "suggested_price_range": {
                    "min": best_candidate["suggested_min"],
                    "max": best_candidate["suggested_max"],
                    "currency": "KES",
                },
                "suggested_quantity": best_candidate["draft_quantity"],
                "already_applied": best_candidate["already_applied"],
                "my_response_status": best_candidate["my_response_status"],
                "draft_offer": draft_offer,
                "created_at": request_row.get("created_at"),
                "match_budget_fit": best_candidate["budget_fit"],
            }

            if is_pro:
                row["win_probability"] = _estimate_win_probability(
                    best_candidate["score"],
                    responses_count,
                    days_until_needed,
                )
                row["margin_guard"] = {
                    "min_margin_percent": min_margin_percent,
                    "floor_price": best_candidate["margin_floor"],
                    "guarded_price": best_candidate["guarded_price"],
                    "would_violate_budget": bool(
                        row["budget_max"] is not None and best_candidate["margin_floor"] > float(row["budget_max"])
                    ),
                }

            opportunities.append(row)

        opportunities.sort(
            key=lambda item: (
                -float(item.get("score") or 0),
                str(item.get("needed_by") or "9999-12-31"),
                str(item.get("created_at") or ""),
            )
        )

        visible_matches = opportunities[:DEAL_MATCH_MAX_RESULTS]
        remaining_today = None

        if not is_pro:
            today_text = str(date.today())
            unlocked_on = str(settings.get("free_unlocked_on") or "")
            unlocked_ids_raw = _decode_json_text_list(settings.get("free_unlocked_request_ids"))
            unlocked_ids = [] if unlocked_on != today_text else unlocked_ids_raw[:DEAL_MATCH_FREE_DAILY_LIMIT]
            unlocked_set = set(unlocked_ids)

            if len(unlocked_set) < DEAL_MATCH_FREE_DAILY_LIMIT:
                for item in opportunities:
                    request_id = str(item.get("request_id") or "")
                    if not request_id or request_id in unlocked_set:
                        continue
                    unlocked_set.add(request_id)
                    unlocked_ids.append(request_id)
                    if len(unlocked_set) >= DEAL_MATCH_FREE_DAILY_LIMIT:
                        break

            visible_matches = [item for item in opportunities if str(item.get("request_id") or "") in unlocked_set]
            remaining_today = max(0, DEAL_MATCH_FREE_DAILY_LIMIT - len(unlocked_set))

            if settings_available:
                _upsert_farmer_deal_match_settings(
                    request.supabase,
                    {
                        "user_id": request.user_id,
                        "realtime_alerts_enabled": bool(settings.get("realtime_alerts_enabled")),
                        "min_margin_percent": round(min_margin_percent, 2),
                        "free_unlocked_on": today_text,
                        "free_unlocked_request_ids": unlocked_ids[:DEAL_MATCH_FREE_DAILY_LIMIT],
                    },
                )

        return JsonResponse(
            {
                "matches": visible_matches,
                "meta": {
                    "role": role,
                    "is_pro": is_pro,
                    "daily_limit": DEAL_MATCH_FREE_DAILY_LIMIT if not is_pro else None,
                    "remaining_today": remaining_today,
                    "total_scored_matches": len(opportunities),
                    "generated_at": now_iso(),
                },
                "settings": {
                    "realtime_alerts_enabled": realtime_alerts_enabled,
                    "min_margin_percent": min_margin_percent,
                    "settings_persisted": settings_available,
                },
            }
        )
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error building farmer deal matches: {e}")
        return JsonResponse({"error": "Failed to build deal matches"}, status=500)


@require_auth
def farmer_deal_match_settings(request: HttpRequest):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])

    try:
        role = resolve_app_role(request.supabase, request.user_id, getattr(request, "requested_role", None))
        if role not in {"farmer_pro", "admin"}:
            raise ApiException("Deal Match settings are available on Farmer Pro only.", 403)

        data = parse_json_body(request)
        settings, settings_available = _load_farmer_deal_match_settings(request.supabase, request.user_id)

        realtime_alerts_enabled = bool(settings.get("realtime_alerts_enabled"))
        min_margin_percent = _clamp(
            _safe_float(settings.get("min_margin_percent"), DEAL_MATCH_DEFAULT_MIN_MARGIN_PERCENT),
            0.0,
            DEAL_MATCH_MAX_MIN_MARGIN_PERCENT,
        )

        if "realtime_alerts_enabled" in data:
            realtime_alerts_enabled = bool(data.get("realtime_alerts_enabled"))
        if "min_margin_percent" in data:
            min_margin_percent = _parse_non_negative_number(
                data.get("min_margin_percent"),
                "Minimum margin percent",
            )
            if min_margin_percent > DEAL_MATCH_MAX_MIN_MARGIN_PERCENT:
                raise ApiException(
                    f"Minimum margin percent cannot exceed {int(DEAL_MATCH_MAX_MIN_MARGIN_PERCENT)}.",
                    400,
                )

        payload = {
            "user_id": request.user_id,
            "realtime_alerts_enabled": realtime_alerts_enabled,
            "min_margin_percent": round(min_margin_percent, 2),
            "free_unlocked_on": settings.get("free_unlocked_on"),
            "free_unlocked_request_ids": settings.get("free_unlocked_request_ids") or [],
        }
        persisted_row = _upsert_farmer_deal_match_settings(request.supabase, payload)
        if persisted_row:
            min_margin_percent = _clamp(
                _safe_float(persisted_row.get("min_margin_percent"), min_margin_percent),
                0.0,
                DEAL_MATCH_MAX_MIN_MARGIN_PERCENT,
            )
            realtime_alerts_enabled = bool(persisted_row.get("realtime_alerts_enabled"))

        return JsonResponse(
            {
                "settings": {
                    "realtime_alerts_enabled": realtime_alerts_enabled,
                    "min_margin_percent": round(min_margin_percent, 2),
                    "settings_persisted": settings_available and persisted_row is not None,
                },
                "success": True,
            }
        )
    except ApiException as exc:
        return api_exception_response(exc)
    except Exception as e:
        logger.error(f"Error updating farmer deal match settings: {e}")
        return JsonResponse({"error": "Failed to update deal match settings"}, status=500)


@require_auth
def farmer_procurement_list(request: HttpRequest):
    try:
        search = (request.GET.get("search") or "").strip().lower()
        county = (request.GET.get("county") or "").strip().lower()

        admin = admin_client()
        requests_rows, _ = _safe_select(
            admin,
            "company_procurement_requests",
            default=[],
            filters={"status": "eq.open"},
            order="created_at.desc",
            limit=100,
        )

        requests_rows = requests_rows or []
        company_ids = [row["company_id"] for row in requests_rows if row.get("company_id")]
        company_map: dict[str, dict[str, Any]] = {}
        if company_ids:
            companies, _ = admin.select(
                "companies",
                select="id, company_name, company_type, headquarters_location, service_areas, verified, verification_status",
                filters={"id": f"in.{postgrest_in(company_ids)}"},
            )
            company_map = {company["id"]: company for company in companies or []}

        enriched_rows: list[dict[str, Any]] = []
        for row in requests_rows:
            company = company_map.get(row.get("company_id"))
            if not company:
                continue
            if not (company.get("verified") or company.get("verification_status") == "approved"):
                continue

            target_county = row.get("target_county") or ""
            company_name = company.get("company_name") or ""
            title = row.get("title") or ""
            category = row.get("category") or ""

            if county and county != target_county.lower():
                continue
            if search and search not in title.lower() and search not in company_name.lower() and search not in category.lower() and search not in target_county.lower():
                continue

            enriched_rows.append(
                {
                    **row,
                    "company": {
                        "id": company.get("id"),
                        "company_name": company_name,
                        "company_type": company.get("company_type"),
                        "headquarters_location": company.get("headquarters_location"),
                        "service_areas": company.get("service_areas") or [],
                    },
                }
            )

        request_ids = [row["id"] for row in enriched_rows if row.get("id")]
        responses_count_by_request: dict[str, int] = {}
        accepted_count_by_request: dict[str, int] = {}
        submitted_count_by_request: dict[str, int] = {}
        rejected_count_by_request: dict[str, int] = {}
        withdrawn_count_by_request: dict[str, int] = {}
        my_response_rows_by_request: dict[str, list[dict[str, Any]]] = {}

        if request_ids:
            all_responses, _ = _safe_select(
                admin,
                "company_procurement_responses",
                default=[],
                select="id, request_id, status",
                filters={"request_id": f"in.{postgrest_in(request_ids)}"},
                limit=500,
            )
            for response in all_responses or []:
                key = str(response.get("request_id") or "")
                if not key:
                    continue
                responses_count_by_request[key] = responses_count_by_request.get(key, 0) + 1
                status = str(response.get("status") or "")
                if status == "submitted":
                    submitted_count_by_request[key] = submitted_count_by_request.get(key, 0) + 1
                elif status == "accepted":
                    accepted_count_by_request[key] = accepted_count_by_request.get(key, 0) + 1
                elif status == "rejected":
                    rejected_count_by_request[key] = rejected_count_by_request.get(key, 0) + 1
                elif status == "withdrawn":
                    withdrawn_count_by_request[key] = withdrawn_count_by_request.get(key, 0) + 1

            my_responses, _ = _safe_select(
                request.supabase,
                "company_procurement_responses",
                default=[],
                filters={
                    "request_id": f"in.{postgrest_in(request_ids)}",
                    "farmer_id": f"eq.{request.user_id}",
                },
                order="updated_at.desc",
                limit=200,
            )
            for response in _enrich_procurement_responses(request.supabase, my_responses or []):
                key = str(response.get("request_id") or "")
                if not key:
                    continue
                my_response_rows_by_request.setdefault(key, []).append(response)

        rows = []
        for row in enriched_rows:
            request_id = str(row.get("id") or "")
            my_responses_for_request = my_response_rows_by_request.get(request_id, [])
            if my_responses_for_request:
                my_responses_for_request = _apply_procurement_response_market_insights(row, my_responses_for_request)
            rows.append(
                {
                    **row,
                    "responses_count": responses_count_by_request.get(request_id, 0),
                    "submitted_responses_count": submitted_count_by_request.get(request_id, 0),
                    "accepted_responses_count": accepted_count_by_request.get(request_id, 0),
                    "rejected_responses_count": rejected_count_by_request.get(request_id, 0),
                    "withdrawn_responses_count": withdrawn_count_by_request.get(request_id, 0),
                    "my_responses": my_responses_for_request,
                }
            )

        return JsonResponse({"requests": rows, "total": len(rows)})
    except Exception as e:
        logger.error(f"Error listing farmer procurement requests: {e}")
        return JsonResponse({"error": "Failed to list procurement requests"}, status=500)


@require_auth
def farmer_companies_list(request: HttpRequest):
    """List companies available to farmer."""
    try:
        company_type = request.GET.get("type")
        search = request.GET.get("search")
        
        client = request.supabase
        
        filters = {"verified": "eq.true"}
        if company_type:
            filters["company_type"] = f"eq.{company_type}"
        
        companies, _ = client.select(
            "companies",
            select="id, company_name, company_type, bio, logo_url, service_areas, rating, certifications",
            filters=filters,
            order="rating.desc.nullslast",
            limit=50,
        )
        
        if search:
            search_lower = search.lower()
            companies = [c for c in companies or [] if search_lower in c.get("company_name", "").lower()]
        
        return JsonResponse({
            "companies": companies or [],
            "total": len(companies or [])
        })
    except Exception as e:
        logger.error(f"Error listing farmer companies: {e}")
        return JsonResponse({"error": "Failed to list companies"}, status=500)


# ─── ADMIN ENDPOINTS ──────────────────────────────────────────

@require_auth
def admin_companies(request: HttpRequest):
    """Admin endpoint to list companies for verification."""
    if request.method == "GET":
        return admin_companies_list(request)
    else:
        return method_not_allowed(request)


@require_auth
def admin_companies_list(request: HttpRequest):
    """List companies pending verification."""
    try:
        # Verify admin access
        from .views_admin import ensure_admin
        ensure_admin(request)
        
        # Get status filter
        status = request.GET.get("status", "pending")
        
        admin = admin_client()
        filters = {}
        if status != "all":
            filters["verification_status"] = f"eq.{status}"
        
        companies, _ = admin.select(
            "companies",
            select="id, user_id, company_name, company_type, email, phone, website, registration_number, tax_id, headquarters_location, service_areas, certifications, bio, verification_status, created_at",
            filters=filters,
            order="created_at.desc",
            limit=100,
        )
        
        return JsonResponse({
            "companies": companies or [],
            "total": len(companies or [])
        })
    except Exception as e:
        logger.error(f"Error listing companies for admin: {e}")
        return JsonResponse({"error": "Failed to list companies"}, status=500)


@require_auth
def admin_company_verify(request: HttpRequest, company_id: str):
    """Admin endpoint to approve/reject a company."""
    if request.method == "POST":
        return admin_company_verify_post(request, company_id)
    else:
        return method_not_allowed(request)


@require_auth
def admin_company_verify_post(request: HttpRequest, company_id: str):
    """Process company approval/rejection."""
    try:
        # Verify admin access
        from .views_admin import ensure_admin
        ensure_admin(request)
        
        data = parse_json_body(request)
        if not data or "action" not in data:
            return JsonResponse({"error": "Action is required"}, status=400)
        
        action = data.get("action")  # approve or reject
        notes = data.get("notes", "")
        
        if action not in ["approve", "reject"]:
            return JsonResponse({"error": "Invalid action"}, status=400)
        
        admin = admin_client()
        
        # Check if company exists
        companies, _ = admin.select(
            "companies",
            filters={"id": f"eq.{company_id}"},
            limit=1,
        )
        
        if not companies:
            return JsonResponse({"error": "Company not found"}, status=404)
        
        company = companies[0]
        user_id = company["user_id"]
        
        if action == "approve":
            # Update company as verified
            update_data = {
                "verification_status": "approved",
                "verified": True,
                "verified_at": now_iso(),
                "admin_id": request.user_id,
                "verified_by_admin_at": now_iso(),
                "verification_notes": notes,
            }
            
            # Also set user role to company
            from .common import set_user_role_with_plan
            try:
                set_user_role_with_plan(user_id, "company")
            except Exception as e:
                logger.error(f"Error setting company role: {e}")
                raise ApiException("Company was approved but the role assignment failed. Please repair the role schema and try again.", 500)
        
        else:  # reject
            update_data = {
                "verification_status": "rejected",
                "admin_id": request.user_id,
                "verified_by_admin_at": now_iso(),
                "rejection_reason": notes,
            }
        
        result = admin.update("companies", update_data, filters={"id": f"eq.{company_id}"})
        final_status = "approved" if action == "approve" else "rejected"
        status_message = (
            "Your company profile has been approved. Company workflows are now fully unlocked."
            if final_status == "approved"
            else "Your company profile was rejected. Review the notes and update your details before reapplying."
        )
        write_user_notification(
            admin,
            user_id=user_id,
            title="Company verification update",
            message=status_message,
            priority="high",
            category="update",
            entity_type="company",
            entity_id=company_id,
            action_url="/dashboard/company",
            source="admin",
            source_user_id=request.user_id,
            metadata={
                "verification_status": final_status,
                "notes": notes,
            },
        )
        
        return JsonResponse({
            "company": result[0] if result else company,
            "success": True,
            "message": f"Company {action}ed successfully",
        })
    except Exception as e:
        logger.error(f"Error verifying company: {e}")
        return JsonResponse({"error": "Failed to verify company"}, status=500)


def now_iso() -> str:
    from datetime import datetime
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@require_auth
def admin_company_create_direct(request: HttpRequest):
    """Admin endpoint to directly create and approve a company for a user."""
    if request.method == "POST":
        return admin_company_create_direct_post(request)
    else:
        return method_not_allowed(request)


@require_auth
def admin_company_create_direct_post(request: HttpRequest):
    """Create and immediately approve a company for a user (Admin only)."""
    try:
        # Verify admin access
        from .views_admin import ensure_admin
        ensure_admin(request)
        
        data = parse_json_body(request)
        if not data:
            return JsonResponse({"error": "Request body required"}, status=400)
        
        # Check for user_id or email
        user_id = data.get("user_id")
        email = data.get("email")
        
        if not user_id and not email:
            return JsonResponse({"error": "Either user_id or email is required"}, status=400)
        
        admin = admin_client()
        
        # If email provided, find the user
        if email and not user_id:
            try:
                users = admin.auth_admin_list_users()
                matching_user = next((u for u in users if u.get("email") == email), None)
                if not matching_user:
                    return JsonResponse({"error": f"User with email {email} not found"}, status=404)
                user_id = matching_user["id"]
            except Exception as e:
                logger.error(f"Error finding user by email: {e}")
                return JsonResponse({"error": "Failed to find user"}, status=500)
        
        # Check if user already has a company
        existing_companies, _ = admin.select(
            "companies",
            filters={"user_id": f"eq.{user_id}"},
            limit=1,
        )
        
        if existing_companies:
            return JsonResponse({"error": "User already has a company profile"}, status=400)
        
        # Create company profile with immediate approval
        company_data = {
            "user_id": user_id,
            "company_name": data.get("company_name", "Unnamed Company"),
            "company_type": data.get("company_type", "other"),
            "registration_number": data.get("registration_number"),
            "tax_id": data.get("tax_id"),
            "phone": data.get("phone", ""),
            "email": data.get("email", email or ""),
            "website": data.get("website"),
            "bio": data.get("bio", ""),
            "headquarters_location": data.get("headquarters_location"),
            "service_areas": data.get("service_areas", []),
            "certifications": data.get("certifications", []),
            "verified": True,
            "verification_status": "approved",
            "verified_at": now_iso(),
            "admin_id": request.user_id,
            "verified_by_admin_at": now_iso(),
            "verification_notes": f"Direct creation by admin: {request.user_id}",
        }
        
        # Insert company
        result = admin.insert("companies", [company_data])
        created_company = result[0] if result else company_data
        
        # Set user role to company
        from .common import set_user_role_with_plan
        try:
            set_user_role_with_plan(user_id, "company")
        except Exception as e:
            logger.error(f"Error setting company role: {e}")
            raise ApiException("Company profile was created but the company role could not be assigned. Please repair the role schema and try again.", 500)
        write_user_notification(
            admin,
            user_id=user_id,
            title="Company profile approved",
            message="An admin created and approved your company profile. You can now use company workflows.",
            priority="high",
            category="update",
            entity_type="company",
            entity_id=created_company.get("id"),
            action_url="/dashboard/company",
            source="admin",
            source_user_id=request.user_id,
            metadata={"verification_status": "approved"},
        )
        
        return JsonResponse({
            "company": created_company,
            "success": True,
            "message": f"Company created and approved for user {user_id}",
        }, status=201)
    except Exception as e:
        logger.error(f"Error creating company directly: {e}")
        return JsonResponse({"error": f"Failed to create company: {str(e)}"}, status=500)
