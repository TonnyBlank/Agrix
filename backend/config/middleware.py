from __future__ import annotations

import ipaddress
import os
from typing import Callable, Optional
from urllib.parse import urlparse

from django.http import HttpRequest, HttpResponse


class SimpleCorsMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response
        configured_origins = os.getenv("CLIENT_ORIGIN", "")
        self.allowed_origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
        debug_flag = os.getenv("DEBUG") or os.getenv("DJANGO_DEBUG", "")
        self.debug_allow_request_origin = debug_flag.lower() == "true"

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = HttpResponse(status=204) if request.method == "OPTIONS" else self.get_response(request)
        request_origin = request.headers.get("Origin") if hasattr(request, "headers") else request.META.get("HTTP_ORIGIN")

        allowed_origin = self._resolve_origin(request_origin)
        if allowed_origin:
            response["Access-Control-Allow-Origin"] = allowed_origin
            self._append_vary_header(response, "Origin")

        response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Accept, Authorization, Content-Type, Origin, X-AgriLink-Role"
        if allowed_origin and allowed_origin != "*":
            response["Access-Control-Allow-Credentials"] = "true"

        # This service exposes JSON APIs only. These headers protect every
        # response, including error pages generated before a view is reached.
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "no-referrer"
        response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response["Content-Security-Policy"] = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        if not self.debug_allow_request_origin:
            response["Strict-Transport-Security"] = "max-age=31536000"

        return response

    def _resolve_origin(self, origin: Optional[str]) -> Optional[str]:
        if origin and (self.debug_allow_request_origin or self._is_local_origin(origin)):
            return origin

        if self.allowed_origins:
            if "*" in self.allowed_origins:
                return origin or "*"
            if origin in self.allowed_origins:
                return origin
            return None

        return origin or "*"

    @staticmethod
    def _append_vary_header(response: HttpResponse, value: str) -> None:
        existing = response.headers.get("Vary", "")
        if not existing:
            response["Vary"] = value
            return
        parts = [item.strip() for item in existing.split(",") if item.strip()]
        if value not in parts:
            response["Vary"] = f"{existing}, {value}"

    @staticmethod
    def _is_local_origin(origin: str) -> bool:
        hostname = (urlparse(origin).hostname or "").strip().lower()
        if not hostname:
            return False
        if hostname in {"localhost", "::1"} or hostname.endswith(".local"):
            return True

        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            return False

        return address.is_loopback or address.is_private
