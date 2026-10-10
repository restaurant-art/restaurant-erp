import mimetypes
import os
from pathlib import Path

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
    return FileResponse(candidate.open("rb"), content_type=content_type or "application/octet-stream")
