"""
resolve_stuck_payments — Django management command

Finds orders stuck in 'initiated' or 'pending_confirmation' for longer than
STUCK_PAYMENT_TIMEOUT_MINUTES and resolves them by querying M-Pesa's
transaction status API directly.

Usage:
    python manage.py resolve_stuck_payments
    python manage.py resolve_stuck_payments --timeout-minutes 30
    python manage.py resolve_stuck_payments --dry-run

Schedule with cron (every 10 minutes):
    */10 * * * * cd /path/to/backend && python manage.py resolve_stuck_payments >> /var/log/agrilink/stuck_payments.log 2>&1
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand

from api.common import (
    admin_client,
    mpesa_mock_enabled,
    now_iso,
    query_stk_push,
    resolve_mpesa_payment_state,
)
from api.views_core import _restock_failed_order, mark_order_paid, _extract_mpesa_receipt_number

logger = logging.getLogger(__name__)

STUCK_PAYMENT_TIMEOUT_MINUTES = 15


class Command(BaseCommand):
    help = "Resolve orders stuck in pending M-Pesa payment by querying Safaricom's transaction status API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--timeout-minutes",
            type=int,
            default=STUCK_PAYMENT_TIMEOUT_MINUTES,
            help=f"Minutes before a payment is considered stuck (default: {STUCK_PAYMENT_TIMEOUT_MINUTES})",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would happen without making any changes.",
        )

    def handle(self, *args, **options):
        timeout_minutes = options["timeout_minutes"]
        dry_run = options["dry_run"]

        cutoff_dt = datetime.utcnow() - timedelta(minutes=timeout_minutes)
        cutoff_iso = cutoff_dt.replace(microsecond=0).isoformat() + "Z"

        admin = admin_client()

        # Use created_at as the timeout reference (works on all schema versions)
        # Once the full migration is applied, payment_verification_started_at is more precise
        stuck_orders, _ = admin.select(
            "orders",
            select="id, product_id, quantity, status, payment_status, checkout_request_id, created_at, buyer_id",
            filters={
                "payment_status": "in.(initiated,pending_confirmation)",
                "created_at": f"lt.{cutoff_iso}",
                "checkout_request_id": "not.is.null",
            },
        )

        if not stuck_orders:
            self.stdout.write(self.style.SUCCESS("No stuck payments found."))
            return

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(stuck_orders)} stuck payment(s) older than {timeout_minutes} minutes."
            )
        )

        resolved_paid = 0
        resolved_failed = 0
        skipped = 0

        for order in stuck_orders:
            order_id = str(order.get("id") or "")
            checkout_request_id = str(order.get("checkout_request_id") or "")
            payment_status = str(order.get("payment_status") or "")

            self.stdout.write(
                f"  → Order {order_id[:8]}... (status={order.get('status')}, payment={payment_status})"
            )

            if dry_run:
                self.stdout.write(self.style.WARNING("    [DRY RUN] Would query M-Pesa status"))
                skipped += 1
                continue

            try:
                if mpesa_mock_enabled():
                    # In mock/sandbox mode, auto-fail stuck orders so stock is restored
                    result = {"ResultCode": "1032", "ResultDesc": "Request cancelled by user (mock timeout resolution)"}
                else:
                    result = query_stk_push(checkout_request_id)

                payment_status_resolved, result_code, result_desc = resolve_mpesa_payment_state(result)

                if payment_status_resolved == "paid":
                    receipt_number = _extract_mpesa_receipt_number(result)
                    mark_order_paid(order_id, checkout_request_id, receipt_number)
                    self.stdout.write(self.style.SUCCESS(f"    ✓ Marked PAID (receipt={receipt_number})"))
                    resolved_paid += 1

                elif payment_status_resolved == "failed":
                    admin.update(
                        "orders",
                        {
                            "payment_status": "failed",
                            "payment_error": result_desc,
                        },
                        filters={"id": f"eq.{order_id}"},
                    )
                    _restock_failed_order(admin, order)
                    self.stdout.write(self.style.WARNING(f"    ✗ Marked FAILED — stock restored. Reason: {result_desc}"))
                    resolved_failed += 1

                else:
                    # Still pending — leave it, will be picked up next run
                    self.stdout.write(f"    ~ Still pending ({result_desc}) — will retry next run")
                    skipped += 1

            except Exception as exc:
                logger.exception("Failed to resolve stuck payment for order %s: %s", order_id, exc)
                self.stdout.write(self.style.ERROR(f"    ! Error: {exc}"))
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Resolved: {resolved_paid} paid, {resolved_failed} failed. Skipped/pending: {skipped}."
            )
        )
