import logging

from django.db import transaction

from .receipts import enqueue_new_sales
from .stores import prepare_connections


log = logging.getLogger(__name__)


def handle_saved_state(key, before, value, access):
    if key not in {"vestora-stores", "vestora-sales-ledger"}:
        return
    try:
        # Persist the outbox in the same transaction as the sale. A savepoint
        # also lets the ledger commit if the integration schema is unavailable.
        with transaction.atomic():
            if key == "vestora-stores":
                prepare_connections(value)
            else:
                enqueue_new_sales(before, value, access)
    except Exception as error:
        log.error("WhatsApp could not process %s (%s)", key, type(error).__name__)
