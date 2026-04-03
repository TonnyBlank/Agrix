from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class UploadedFile:
    name: str
    content_type: str | None
    _content: bytes

    def read(self) -> bytes:
        return self._content


@dataclass
class HttpRequest:
    method: str
    headers: dict[str, str]
    body: bytes = b""
    GET: dict[str, str] = field(default_factory=dict)
    FILES: dict[str, UploadedFile] = field(default_factory=dict)


class HttpResponse:
    def __init__(self, content: bytes | str = b"", status: int = 200, headers: dict[str, str] | None = None, content_type: str = "text/plain; charset=utf-8"):
        if isinstance(content, str):
            content = content.encode("utf-8")
        self.content = content
        self.status_code = status
        self.headers = headers or {}
        self.content_type = content_type

    def __setitem__(self, key: str, value: str) -> None:
        self.headers[key] = value

    def __getitem__(self, key: str) -> str:
        return self.headers[key]


class JsonResponse(HttpResponse):
    def __init__(self, data: Any, status: int = 200, safe: bool = True, headers: dict[str, str] | None = None):
        if safe and not isinstance(data, dict):
            raise TypeError("JsonResponse safe=True requires a dict")
        super().__init__(
            content=json.dumps(data, separators=(",", ":"), default=str),
            status=status,
            headers=headers,
            content_type="application/json",
        )
