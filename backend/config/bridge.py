from __future__ import annotations

from typing import Any, Callable

from django.http import HttpRequest as DjangoHttpRequest, HttpResponse as DjangoHttpResponse
from django.views.decorators.csrf import csrf_exempt

from api.http import HttpRequest, HttpResponse, UploadedFile

LegacyHandler = Callable[..., HttpResponse]


def build_request(request: DjangoHttpRequest) -> HttpRequest:
    headers = {key.lower(): value for key, value in request.headers.items()}
    query = {key: value for key, value in request.GET.items()}
    files: dict[str, UploadedFile] = {}
    content_type = request.content_type or ""

    for key, uploaded in request.FILES.items():
        files[key] = UploadedFile(
            name=uploaded.name,
            content_type=getattr(uploaded, "content_type", None),
            _content=uploaded.read(),
        )

    body = b"" if "multipart/form-data" in content_type else request.body

    return HttpRequest(
        method=request.method.upper(),
        headers=headers,
        body=body,
        GET=query,
        FILES=files,
    )


def to_django_response(response: HttpResponse) -> DjangoHttpResponse:
    django_response = DjangoHttpResponse(
        content=response.content,
        status=response.status_code,
        content_type=response.content_type,
    )

    for key, value in response.headers.items():
        django_response[key] = value

    return django_response


def legacy_view(handler: LegacyHandler) -> Callable[..., DjangoHttpResponse]:
    @csrf_exempt
    def view(request: DjangoHttpRequest, *args: Any, **kwargs: Any) -> DjangoHttpResponse:
        legacy_request = build_request(request)
        response = handler(legacy_request, *args, **kwargs)
        return to_django_response(response)

    view.__name__ = f"{handler.__name__}_django_bridge"
    return view
