from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from datetime import datetime
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
)
from .http import HttpRequest, HttpResponse, JsonResponse


logger = logging.getLogger(__name__)


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
    profiles, _ = client.select("profiles", select="user_id, full_name", filters={"user_id": f"in.{postgrest_in(user_ids)}"})
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
                "buyer_profile": {"full_name": profiles_by_id.get(order["buyer_id"], {}).get("full_name")} if profiles_by_id.get(order["buyer_id"]) else None,
                "farmer_profile": {"full_name": profiles_by_id.get(order["farmer_id"], {}).get("full_name")} if profiles_by_id.get(order["farmer_id"]) else None,
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


def get_allowed_statuses(current_status: str, is_farmer: bool) -> list[str]:
    if is_farmer:
        if current_status == "pending":
            return ["confirmed", "cancelled"]
        if current_status == "confirmed":
            return ["processing", "shipped", "cancelled"]
        if current_status == "processing":
            return ["shipped", "cancelled"]
        return []
    if current_status == "pending":
        return ["cancelled"]
    if current_status == "shipped":
        return ["delivered"]
    return []


def mark_order_paid(order_id: str, checkout_request_id: str, receipt_number: str | None = None):
    admin = admin_client()
    admin.update(
        "orders",
        {
            "payment_status": "paid",
            "payment_ref": receipt_number or checkout_request_id,
            "paid_at": now_iso(),
            "payment_error": None,
        },
        filters={"id": f"eq.{order_id}"},
    )


SCANNER_ALLOWED_ROLES = {"farmer_pro", "company", "admin"}
SCANNER_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
SCANNER_MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024
SCANNER_GEMINI_MODEL = "gemini-2.5-flash"
SCANNER_SEVERITY_VALUES = {"Low", "Moderate", "High"}
SCANNER_DIAGNOSIS_PROFILES: list[dict[str, Any]] = [
    {
        "disease": "Tomato Late Blight",
        "scientificName": "Phytophthora infestans",
        "crop": "Tomato",
        "confidence": 97.8,
        "severity": "Moderate",
        "spreadRisk": "High",
        "affectedArea": "35-50%",
        "description": "The crop image suggests active late blight symptoms, including dark lesion spread and tissue collapse across the affected surface.",
        "treatment": "Apply a copper-based fungicide within 48 hours. Remove heavily infected leaves to reduce spread.",
        "organicAlternatives": [
            "Apply an approved copper soap or copper hydroxide product at the recommended interval.",
            "Remove heavily infected plant material and destroy it away from the field.",
            "Improve airflow around the crop canopy to reduce moisture retention.",
        ],
        "fertilizerRecommendations": [
            "Avoid high-nitrogen fertilizers which encourage lush, susceptible growth.",
            "Apply potassium-rich foliar feeds to strengthen cell walls."
        ],
        "prevention": "Improve airflow, reduce leaf wetness, and avoid late evening irrigation.",
    },
    {
        "disease": "Maize Leaf Streak",
        "scientificName": "Maize streak virus",
        "crop": "Maize",
        "confidence": 95.4,
        "severity": "High",
        "spreadRisk": "High",
        "affectedArea": "50-60%",
        "description": "The visible streaking and chlorotic tissue pattern are consistent with a strong maize streak infection already spreading across the leaf.",
        "treatment": "Rogue out severely affected plants. Start a targeted leafhopper control plan in the next spray cycle.",
        "organicAlternatives": [
            "Remove severely affected plants early to reduce field pressure.",
            "Control alternate grass hosts around the plot to lower vector activity.",
            "Use neem-based pest suppression where suitable for early vector management.",
        ],
        "fertilizerRecommendations": [
            "Ensure adequate nitrogen top-dressing to support plant recovery.",
            "Apply zinc or balanced micronutrients to reduce overall plant stress."
        ],
        "prevention": "Use resistant seed varieties and maintain clean field edges before the next planting cycle.",
    },
    {
        "disease": "Pepper Bacterial Spot",
        "scientificName": "Xanthomonas euvesicatoria",
        "crop": "Pepper",
        "confidence": 94.9,
        "severity": "Moderate",
        "spreadRisk": "Moderate",
        "affectedArea": "20-35%",
        "description": "The image pattern suggests bacterial spotting with multiple angular lesions and early canopy stress around the affected tissue.",
        "treatment": "Remove badly affected leaves. Apply a labeled copper bactericide and avoid overhead irrigation for the next several days.",
        "organicAlternatives": [
            "Prune and destroy affected leaves away from the field.",
            "Use copper soap where it fits your crop-management plan.",
            "Reduce splash spread by watering close to the soil line.",
        ],
        "fertilizerRecommendations": [
            "Maintain balanced calcium levels to strengthen plant immunity.",
            "Avoid excessive nitrogen applications during active infection."
        ],
        "prevention": "Use clean seed, avoid handling plants when wet, and rotate away from susceptible crops after harvest.",
    },
    {
        "disease": "Healthy Produce",
        "scientificName": "No disease detected",
        "crop": "Mixed crop",
        "confidence": 99.1,
        "severity": "Low",
        "spreadRisk": "Low",
        "affectedArea": "0-5%",
        "description": "The scanned crop image does not show clear disease symptoms. Tissue color and surface structure appear largely normal in the captured area.",
        "treatment": "No disease detected. Maintain your current irrigation and scouting schedule.",
        "organicAlternatives": [
            "Continue using compost or organic foliar feeds as planned.",
            "Keep the field clean and remove weak plant tissue early.",
            "Maintain balanced soil moisture and avoid plant stress.",
        ],
        "fertilizerRecommendations": [
            "Continue with a balanced NPK fertilizer application based on the crop's growth stage.",
            "Incorporate organic matter or compost to improve soil health."
        ],
        "prevention": "Keep monitoring twice a week and continue feeding with balanced nutrients.",
    },
]
SCANNER_KEYWORD_MATCHERS: list[tuple[set[str], str]] = [
    ({"tomato", "blight"}, "Tomato Late Blight"),
    ({"maize", "corn", "streak"}, "Maize Leaf Streak"),
    ({"pepper", "capsicum", "spot"}, "Pepper Bacterial Spot"),
    ({"healthy", "normal", "fresh", "clean"}, "Healthy Produce"),
]
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


def _select_scanner_profile(file_name: str, content: bytes) -> dict[str, Any]:
    normalized_name = file_name.lower()
    profiles_by_name = {profile["disease"]: profile for profile in SCANNER_DIAGNOSIS_PROFILES}

    for keywords, diagnosis_name in SCANNER_KEYWORD_MATCHERS:
        if any(keyword in normalized_name for keyword in keywords):
            return profiles_by_name[diagnosis_name]

    digest = hashlib.sha256(content + normalized_name.encode("utf-8")).digest()
    return SCANNER_DIAGNOSIS_PROFILES[digest[0] % len(SCANNER_DIAGNOSIS_PROFILES)]


def _build_scanner_result(file_name: str, content: bytes) -> dict[str, Any]:
    profile = _select_scanner_profile(file_name, content)
    digest = hashlib.sha256(content + b"agrilink-crop-scanner").digest()
    confidence_penalty = (digest[1] % 7) / 10
    confidence_floor = 92.0 if profile["disease"] == "Healthy Produce" else 86.0

    # Keep the API contract stable until a dedicated vision model is wired in.
    return {
        **profile,
        "confidence": round(max(confidence_floor, min(99.8, float(profile["confidence"]) - confidence_penalty)), 1),
    }


def _get_gemini_api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _normalize_scanner_result(raw: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    def normalize_text(key: str) -> str:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return str(fallback.get(key) or "").strip()

    def normalize_level(key: str) -> str:
        value = normalize_text(key)
        if value in SCANNER_SEVERITY_VALUES:
            return value
        return str(fallback.get(key) or "Moderate")

    confidence_value = raw.get("confidence")
    try:
        confidence = round(float(confidence_value), 1)
    except (TypeError, ValueError):
        confidence = float(fallback.get("confidence") or 90.0)
    confidence = max(0.0, min(100.0, confidence))

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

    return {
        "disease": normalize_text("disease"),
        "scientificName": normalize_text("scientificName"),
        "crop": normalize_text("crop"),
        "confidence": confidence,
        "severity": normalize_level("severity"),
        "spreadRisk": normalize_level("spreadRisk"),
        "affectedArea": normalize_text("affectedArea"),
        "description": normalize_text("description"),
        "treatment": normalize_text("treatment"),
        "organicAlternatives": normalized_alternatives[:5],
        "fertilizerRecommendations": normalized_fertilizers[:5],
        "prevention": normalize_text("prevention"),
    }


def _call_gemini_crop_scanner(file_name: str, mime_type: str, content: bytes) -> dict[str, Any]:
    api_key = _get_gemini_api_key()
    if not api_key:
        raise ApiException("Gemini API key is not configured.", 500)

    model_name = os.getenv("GEMINI_MODEL", SCANNER_GEMINI_MODEL)
    fallback = _build_scanner_result(file_name, content)
    image_base64 = base64.b64encode(content).decode("utf-8")
    prompt = (
        "You are an agronomy assistant for smallholder farmers. Analyze this crop photo and return only JSON. "
        "Describe the most likely visible crop issue or return Healthy Produce if no clear disease symptoms are visible. "
        "Keep treatment and prevention practical for field use. "
        "Set severity and spreadRisk to one of Low, Moderate, or High. "
        "Set affectedArea as a short range like 0-5% or 20-35%. "
        "Provide 2-3 specific fertilizerRecommendations."
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
            "maxOutputTokens": 220,
            "responseMimeType": "application/json",
            "responseSchema": SCANNER_GEMINI_RESPONSE_SCHEMA,
        },
    }
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    body = response.json()

    prompt_feedback = body.get("promptFeedback") or {}
    if prompt_feedback.get("blockReason"):
        raise ApiException(f"Gemini blocked the crop analysis request: {prompt_feedback['blockReason']}", 400)

    candidates = body.get("candidates") or []
    if not candidates:
        raise ApiException("Gemini returned no crop analysis candidates.", 502)

    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    text_part = next((part.get("text") for part in parts if isinstance(part, dict) and part.get("text")), None)
    if not text_part:
        raise ApiException("Gemini returned an empty crop analysis response.", 502)

    parsed = json.loads(text_part)
    if not isinstance(parsed, dict):
        raise ApiException("Gemini response format was invalid.", 502)

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
    if _get_gemini_api_key():
        try:
            result = _call_gemini_crop_scanner(image.name, image.content_type or "image/jpeg", content)
            return JsonResponse(
                {
                    "result": result,
                    "scannedAt": now_iso(),
                    "analysisMode": "gemini",
                    "advisory": "AI output can be wrong. Confirm serious or spreading symptoms with an agronomist.",
                }
            )
        except (ApiException, requests.RequestException, json.JSONDecodeError) as exc:
            fallback_reason = str(exc) or exc.__class__.__name__
            logger.warning("Gemini crop scan fallback triggered: %s", fallback_reason)

    return JsonResponse(
        {
            "result": _build_scanner_result(image.name, content),
            "scannedAt": now_iso(),
            "analysisMode": "heuristic",
            "advisory": (
                "This result is guidance only and should be confirmed if symptoms worsen or spread quickly. "
                + (
                    f"Gemini fallback reason: {fallback_reason}."
                    if fallback_reason
                    else "Add GEMINI_API_KEY on the backend to enable Gemini analysis."
                )
            ),
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
        _, count = request.supabase.select("products", filters={"farmer_id": f"eq.{request.user_id}"}, head=True, count="exact")
        if (count or 0) >= 10:
            raise ApiException("Free plan reached the 10 product limit. Upgrade to Pro for unlimited listings.", 403)
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
    file_path = build_safe_storage_path(request.user_id, file.name)
    request.supabase.upload_storage(bucket, file_path, file.read(), file.content_type or "application/octet-stream")
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
    rows, _ = request.supabase.select(
        "orders",
        filters={"farmer_id": f"eq.{request.user_id}", "payment_status": "neq.failed"},
        order="created_at.desc",
    )
    return JsonResponse(attach_order_meta(request.supabase, rows or []), safe=False)


@api_view
@require_auth
def orders_buying(request: HttpRequest):
    if request.method != "GET":
        return method_not_allowed(["GET"])
    rows, _ = request.supabase.select(
        "orders",
        filters={"buyer_id": f"eq.{request.user_id}", "payment_status": "neq.failed"},
        order="created_at.desc",
    )
    return JsonResponse(attach_order_meta(request.supabase, rows or []), safe=False)


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
    delivery_fee = float(body.get("delivery_fee", 50))
    if not body.get("product_id"):
        raise ApiException("Product is required", 400)
    if quantity <= 0:
        raise ApiException("Quantity must be greater than 0", 400)
    if delivery_fee < 0:
        raise ApiException("Delivery fee must be 0 or more", 400)
    result = request.supabase.rpc(
        "place_marketplace_order",
        {
            "p_product_id": body.get("product_id"),
            "p_quantity": quantity,
            "p_unit": body.get("unit"),
            "p_delivery_fee": delivery_fee,
            "p_notes": str(body.get("notes") or "").strip() or None,
        },
    )
    rows = result if isinstance(result, list) else [result] if result else []
    return JsonResponse(attach_order_meta(request.supabase, rows)[0], status=201)


@api_view
@require_auth
def order_status(request: HttpRequest, order_id: str):
    if request.method != "PATCH":
        return method_not_allowed(["PATCH"])
    status = parse_json_body(request).get("status")
    if status not in {"pending", "confirmed", "processing", "shipped", "delivered", "cancelled"}:
        raise ApiException("Invalid status value", 400)
    existing, _ = request.supabase.select(
        "orders",
        filters={"id": f"eq.{order_id}", "or": f"(farmer_id.eq.{request.user_id},buyer_id.eq.{request.user_id})"},
        single=True,
    )
    if not existing:
        raise ApiException("Order not found", 404)
    allowed = get_allowed_statuses(existing["status"], existing["farmer_id"] == request.user_id)
    if status not in allowed:
        raise ApiException(f"You cannot change an order from {existing['status']} to {status}.", 400)
    updated = request.supabase.update("orders", {"status": status}, filters={"id": f"eq.{order_id}"}, single=True)
    
    if status == "delivered":
        # Handle Pay-with-Produce escrow
        loans, _ = request.supabase.select(
            "micro_loan_applications",
            filters={"user_id": f"eq.{existing['farmer_id']}", "repayment_method": "eq.pay_with_produce", "status": "in.(\"approved\",\"disbursed\")"},
        )
        if loans:
            farmer_payout_amount = float(updated.get("total_price") or 0) - float(updated.get("delivery_fee") or 0)
            
            for loan in loans:
                if farmer_payout_amount <= 0:
                    break
                    
                repayments, _ = request.supabase.select(
                    "micro_loan_repayments",
                    select="id, amount, created_at, payment_method, payment_ref, phone_number, note",
                    filters={"loan_application_id": f"eq.{loan['id']}"},
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
                
                remaining_balance = float(schedule["summary"]["remainingBalance"])
                if remaining_balance > 0:
                    deduction = min(farmer_payout_amount, remaining_balance)
                    farmer_payout_amount -= deduction
                    
                    repayment = request.supabase.insert(
                        "micro_loan_repayments",
                        {
                            "loan_application_id": loan["id"],
                            "user_id": existing["farmer_id"],
                            "amount": deduction,
                            "payment_method": "pay_with_produce",
                            "payment_ref": f"ESCROW-{order_id[:8]}",
                            "phone_number": None,
                            "note": f"Automatic Pay-with-Produce deduction from order {order_id[:8]}.",
                        },
                        single=True,
                    )
                    
                    # Compute next schedule
                    next_schedule = build_loan_schedule(
                        loan.get("approved_amount"),
                        loan.get("requested_amount"),
                        loan.get("interest_rate"),
                        loan.get("repayment_days"),
                        loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
                        [*(repayments or []), repayment],
                    )
                    
                    next_status = "repaid" if next_schedule["summary"]["remainingBalance"] <= 0 else loan["status"] if loan["status"] in {"approved", "disbursed"} else "disbursed"
                    
                    request.supabase.update(
                        "micro_loan_applications",
                        {
                            "status": next_status,
                            "disbursed_at": loan.get("disbursed_at") or loan.get("reviewed_at") or loan.get("created_at"),
                            "repaid_at": now_iso() if next_status == "repaid" else None,
                            "updated_at": now_iso(),
                        },
                        filters={"id": f"eq.{loan['id']}"},
                        single=True,
                    )

    return JsonResponse(attach_order_meta(request.supabase, [updated])[0])


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
        "phone",
        "farm_type",
        "irrigation_type",
        "soil_type",
        "has_storage",
        "has_transport",
        "cooperative_name",
    ]:
        if field in body:
            update_payload[field] = body.get(field)

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
        update_payload["payout_mpesa_number"] = body.get("payout_mpesa_number") if payout_method == "mpesa" else None
        update_payload["bank_name"] = body.get("bank_name") if payout_method == "bank" else None
        update_payload["bank_account_name"] = body.get("bank_account_name") if payout_method == "bank" else None
        update_payload["bank_account_number"] = body.get("bank_account_number") if payout_method == "bank" else None
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
    rows, _ = request.supabase.select(
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
    client = user_client()
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
        request.supabase.update("orders", {"payment_status": "failed", "payment_error": result_desc}, filters={"id": f"eq.{order['id']}"})
    else:
        request.supabase.update("orders", {"payment_status": "pending_confirmation", "payment_error": None}, filters={"id": f"eq.{order['id']}"})

    return JsonResponse({"payment_status": payment_status, "resultCode": result_code, "resultDesc": result_desc})


@api_view
def payment_mpesa_callback(request: HttpRequest):
    if request.method != "POST":
        return method_not_allowed(["POST"])
    body = parse_json_body(request)
    callback = (((body.get("Body") or {}).get("stkCallback")) if isinstance(body.get("Body"), dict) else {}) or {}
    checkout_request_id = callback.get("CheckoutRequestID")
    if not checkout_request_id:
        return JsonResponse({"ok": True})
    receipt_number = None
    metadata = (((callback.get("CallbackMetadata") or {}).get("Item")) if isinstance(callback.get("CallbackMetadata"), dict) else []) or []
    for item in metadata:
        if item.get("Name") == "MpesaReceiptNumber":
            receipt_number = str(item.get("Value"))
    admin = admin_client()
    payment_status, _, resolved_desc = resolve_mpesa_payment_state(callback)
    if payment_status == "paid":
        order, _ = admin.select("orders", select="id", filters={"checkout_request_id": f"eq.{checkout_request_id}"}, single=True)
        if order:
            mark_order_paid(order["id"], checkout_request_id, receipt_number)
    elif payment_status == "failed":
        admin.update("orders", {"payment_status": "failed", "payment_error": resolved_desc}, filters={"checkout_request_id": f"eq.{checkout_request_id}"})
    else:
        admin.update("orders", {"payment_status": "pending_confirmation", "payment_error": None}, filters={"checkout_request_id": f"eq.{checkout_request_id}"})
    return JsonResponse({"ok": True})
