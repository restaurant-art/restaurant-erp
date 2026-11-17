import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404


FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))


def spa(request, path=""):
    """Serve the Vite build and fall back to index.html for client routes."""

    root = FRONTEND_DIST.resolve()
    candidate = (root / path).resolve() if path else root / "index.html"
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise Http404 from error
    if not candidate.is_file():
        candidate = root / "index.html"
    if not candidate.is_file():
        raise Http404("Frontend build is not installed")
    content_type, _ = mimetypes.guess_type(candidate.name)
    response = FileResponse(candidate.open("rb"), content_type=content_type or "application/octet-stream")
    if candidate.name in {"index.html", "service-worker.js"}:
        response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    if candidate == root / "index.html" and settings.META_WHATSAPP_APP_ID:
        # Embedded Signup completes in a cross-origin Meta popup.
        response["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response
