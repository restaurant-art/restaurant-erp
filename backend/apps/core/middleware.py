from .models import Restaurant


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
