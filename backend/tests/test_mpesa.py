import os
import unittest
from unittest.mock import Mock, patch

from api.common import ApiException, normalize_mpesa_amount, resolve_mpesa_payment_state, validate_mpesa_callback_url
from api.views_core import _restock_failed_order


class MpesaHelperTests(unittest.TestCase):
    def test_validate_callback_url_requires_absolute_url(self):
        with self.assertRaises(ApiException):
            validate_mpesa_callback_url("/api/payments/mpesa/callback")

    @patch.dict(os.environ, {"MPESA_ENV": "live"}, clear=False)
    def test_live_callback_url_rejects_localhost(self):
        with self.assertRaises(ApiException):
            validate_mpesa_callback_url("https://localhost/api/payments/mpesa/callback")

    @patch.dict(os.environ, {"MPESA_ENV": "live"}, clear=False)
    def test_live_callback_url_requires_https(self):
        with self.assertRaises(ApiException):
            validate_mpesa_callback_url("http://payments.example.com/api/payments/mpesa/callback")

    @patch.dict(os.environ, {"MPESA_ENV": "sandbox"}, clear=False)
    def test_sandbox_callback_url_allows_localhost(self):
        callback_url = "http://localhost:3001/api/payments/mpesa/callback"
        self.assertEqual(validate_mpesa_callback_url(callback_url), callback_url)

    def test_normalize_mpesa_amount_rejects_zero(self):
        with self.assertRaises(ApiException):
            normalize_mpesa_amount(0)

    def test_resolve_mpesa_payment_state_paid(self):
        status, result_code, result_desc = resolve_mpesa_payment_state({"ResultCode": "0", "ResultDesc": "Success"})
        self.assertEqual(status, "paid")
        self.assertEqual(result_code, "0")
        self.assertEqual(result_desc, "Success")

    def test_resolve_mpesa_payment_state_failed(self):
        status, result_code, result_desc = resolve_mpesa_payment_state({"ResultCode": "1032", "ResultDesc": "Request cancelled by user"})
        self.assertEqual(status, "failed")
        self.assertEqual(result_code, "1032")
        self.assertEqual(result_desc, "Request cancelled by user")

    def test_resolve_mpesa_payment_state_pending(self):
        status, result_code, result_desc = resolve_mpesa_payment_state({"ResponseDescription": "The service request is being processed"})
        self.assertEqual(status, "pending_confirmation")
        self.assertEqual(result_code, "")
        self.assertEqual(result_desc, "The service request is being processed")

    def test_failed_payment_restock_is_idempotent(self):
        client = Mock()
        order = {"product_id": "product-1", "quantity": 2, "status": "pending", "payment_status": "failed"}

        _restock_failed_order(client, order)

        client.rpc.assert_not_called()

    def test_unresolved_payment_restock_uses_atomic_rpc(self):
        client = Mock()
        order = {"product_id": "product-1", "quantity": 2, "status": "pending", "payment_status": "initiated"}

        _restock_failed_order(client, order)

        client.rpc.assert_called_once_with(
            "increment_product_stock",
            {"p_product_id": "product-1", "p_quantity": 2.0},
        )


if __name__ == "__main__":
    unittest.main()
