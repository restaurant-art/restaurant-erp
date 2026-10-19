import json

from channels.generic.websocket import AsyncWebsocketConsumer


class RestaurantEventsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.restaurant_id = self.scope["url_route"]["kwargs"]["restaurant_id"]
        user = self.scope.get("user")
        if not user or not user.is_authenticated or not user.is_active:
            await self.close(code=4401)
            return
        if not user.is_superuser and user.restaurant_id != self.restaurant_id:
            await self.close(code=4403)
            return
        self.group_name = f"restaurant_{self.restaurant_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def restaurant_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))
