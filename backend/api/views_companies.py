from __future__ import annotations

import json
import logging
from typing import Any

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
    method_not_allowed,
)
from .http import HttpRequest, HttpResponse, JsonResponse


logger = logging.getLogger(__name__)


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
            "company_name": data.get("company_name"),
            "company_type": data.get("company_type", "other"),
            "registration_number": data.get("registration_number"),
            "tax_id": data.get("tax_id"),
            "phone": data.get("phone"),
            "email": data.get("email"),
            "website": data.get("website"),
            "bio": data.get("bio"),
            "headquarters_location": data.get("headquarters_location"),
            "service_areas": data.get("service_areas", []),
            "certifications": data.get("certifications", []),
        }
        
        result = client.insert("companies", [company_data])
        
        return JsonResponse({
            "company": result[0] if result else company_data,
            "success": True,
        })
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
            if field in data:
                update_data[field] = data[field]
        
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
            "name": data.get("name"),
            "category": data.get("category", "other"),
            "description": data.get("description"),
            "price_per_unit": data.get("price_per_unit", 0),
            "unit": data.get("unit", "kg"),
            "minimum_order_quantity": data.get("minimum_order_quantity", 1),
            "stock": data.get("stock", 0),
            "bulk_discount_tiers": data.get("bulk_discount_tiers", []),
            "image_url": data.get("image_url"),
            "is_available": data.get("is_available", True),
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
        update_data = {field: data[field] for field in allowed_fields if field in data}
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
        filters = {"company_id": f"eq.{company_id}", "status": "neq.failed"}
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
        allowed_fields = ["title", "category", "target_county", "quantity_needed", "unit", "budget_min", "budget_max", "needed_by", "notes", "status"]
        update_data = {field: data[field] for field in allowed_fields if field in data}
        if not update_data:
            return JsonResponse({"error": "No valid fields to update"}, status=400)
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
        status_filter = request.GET.get("status")
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
        return JsonResponse({"requests": requests_rows or [], "total": len(requests_rows or [])})
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
            "title": data.get("title"),
            "category": data.get("category", "other"),
            "target_county": data.get("target_county"),
            "quantity_needed": data.get("quantity_needed", 0),
            "unit": data.get("unit", "kg"),
            "budget_min": data.get("budget_min"),
            "budget_max": data.get("budget_max"),
            "needed_by": data.get("needed_by"),
            "notes": data.get("notes"),
            "status": data.get("status", "open"),
        }
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

        enriched_rows = []
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

        return JsonResponse({"requests": enriched_rows, "total": len(enriched_rows)})
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
        
        return JsonResponse({
            "company": created_company,
            "success": True,
            "message": f"Company created and approved for user {user_id}",
        }, status=201)
    except Exception as e:
        logger.error(f"Error creating company directly: {e}")
        return JsonResponse({"error": f"Failed to create company: {str(e)}"}, status=500)
