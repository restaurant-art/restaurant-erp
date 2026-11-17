import logging
import re

from django.apps import AppConfig


class ReceiptAccessLogFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple):
            record.args = tuple(
                re.sub(r"(/receipts/whatsapp/)\?[^\s]+", r"\1", arg) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True


class WhatsAppConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.whatsapp"

    def ready(self):
        for name in ("uvicorn.access", "django.server"):
            logging.getLogger(name).addFilter(ReceiptAccessLogFilter())
