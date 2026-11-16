from celery import shared_task

from .delivery import deliver_pending


@shared_task(ignore_result=True)
def deliver_receipts():
    deliver_pending()
