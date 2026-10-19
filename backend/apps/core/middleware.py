from django.conf import settings

from .models import Restaurant


class HealthCheckHostMiddleware:
    """Let infrastructure probes reach only the public health endpoint.

    ALB target checks address a Fargate task by its private IP, so their Host
    header cannot be listed statically in ``ALLOWED_HOSTS``.  Normalizing the
    Host for this one read-only endpoint keeps strict host validation in place
    for every application route while allowing both ALB and container probes.
    """

    paths = {"/api/health/", "/api/ready/"}
    methods = {"GET", "HEAD"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path in self.paths and request.method in self.methods:
            canonical_host = next(
                (
                    host
                    for host in settings.ALLOWED_HOSTS
                    if host and host != "*" and not host.startswith(".")
                ),
                "localhost",
            )
            request.META["HTTP_HOST"] = canonical_host
        return self.get_response(request)


class TenantContextMiddleware:
    """Adds request.restaurant when the user belongs to a restaurant."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.restaurant = None
        restaurant_id = request.headers.get("X-Restaurant-ID")
        if getattr(request, "user", None) and request.user.is_authenticated:
            request.restaurant = request.user.restaurant
        if restaurant_id and (not request.restaurant or request.user.is_superuser):
            request.restaurant = Restaurant.objects.filter(id=restaurant_id).first()
        return self.get_response(request)
