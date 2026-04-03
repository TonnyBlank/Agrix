from __future__ import annotations

import ipaddress
import os
from urllib.parse import urlparse

from django.http import HttpResponse


class SimpleCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        configured_origins = os.getenv("CLIENT_ORIGIN", "")
        self.allowed_origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
        debug_flag = os.getenv("DEBUG") or os.getenv("DJANGO_DEBUG", "")
        self.debug_allow_request_origin = debug_flag.lower() == "true"

    def __call__(self, request):
        response = HttpResponse(status=204) if request.method == "OPTIONS" else self.get_response(request)

        allowed_origin = self._resolve_origin(request.headers.get("Origin"))
        if allowed_origin:
            response["Access-Control-Allow-Origin"] = allowed_origin
            self._append_vary_header(response, "Origin")

        response["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Accept, Authorization, Content-Type, Origin, X-AgriLink-Role"
        if allowed_origin and allowed_origin != "*":
            response["Access-Control-Allow-Credentials"] = "true"

        return response

    def _resolve_origin(self, origin: str | None) -> str:
        if origin and (self.debug_allow_request_origin or self._is_local_origin(origin)):
            return origin

        if self.allowed_origins:
            if not origin:
                return self.allowed_origins[0]
            if "*" in self.allowed_origins:
                return origin
            if origin in self.allowed_origins:
                return origin
            return self.allowed_origins[0]

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
