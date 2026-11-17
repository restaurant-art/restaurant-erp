"""Attach a lost upload reference using a read-only, exact-transaction status check."""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.core.models import PineCloudPayment
from apps.core.pine_cloud import config, provider_call, approved_receipt, valid_reference


class Command(BaseCommand):
    help = "Recover an approved Pine payment after a lost upload response. Never uploads or collects payment."

    def add_arguments(self, parser):
        parser.add_argument("payment_id")
        parser.add_argument("--provider-reference", required=True, help="PTRN from Pine Labs for this exact transaction")

    def handle(self, *args, **options):
        try:
            payment = PineCloudPayment.objects.get(pk=options["payment_id"])
        except Exception:
            raise CommandError("Payment record not found.")
        cfg = config(payment.store_id)
        ref = valid_reference(options["provider_reference"])
        if not ref or not cfg["ready"] or cfg["identity"] != payment.config_identity:
            raise CommandError("Use the original terminal configuration and a valid Pine reference.")
        if payment.provider_reference and payment.provider_reference != ref:
            raise CommandError("The saved payment already has a different Pine reference.")
        payment.provider_reference = ref
        try:
            result = provider_call("status", {"PlutusTransactionReferenceID": ref,
                "TransactionNumber": payment.id.hex, "UserID": str(payment.requested_by_id)}, cfg)
            receipt = approved_receipt(result, payment)
        except Exception:
            raise CommandError("Pine Labs did not verify this exact payment. No payment record was changed.")
        if not receipt:
            raise CommandError("Payment is not approved. Reconcile it with Pine Labs before retrying; no new charge was sent.")
        with transaction.atomic():
            saved = PineCloudPayment.objects.select_for_update().get(pk=payment.pk)
            if saved.status != "approved":
                saved.provider_reference, saved.receipt, saved.status, saved.active_terminal = ref, receipt, "approved", None
                saved.save(update_fields=("provider_reference", "receipt", "status", "active_terminal", "updated_at"))
        self.stdout.write(self.style.SUCCESS("Payment verified. Use Recover saved checkout in UVPRO to finish and save the bill."))
