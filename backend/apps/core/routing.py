from django.urls import path

from .consumers import RestaurantEventsConsumer

websocket_urlpatterns = [
    path("ws/restaurants/<int:restaurant_id>/", RestaurantEventsConsumer.as_asgi()),
]
