import os
import unittest
from unittest.mock import Mock, patch

import requests

from api.common import ApiException, normalize_mpesa_amount, resolve_mpesa_payment_state, validate_mpesa_callback_url
from api.views_core import _build_scanner_result, _call_gemini_crop_scanner, _get_gemini_api_key, _restock_failed_order


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

    @patch.dict(os.environ, {"GEMINI_API_KEY": "real-key-value"}, clear=False)
    def test_gemini_key_accepts_real_value(self):
        self.assertEqual(_get_gemini_api_key(), "real-key-value")

    @patch.dict(os.environ, {"GEMINI_API_KEY": "your-gemini-api-key"}, clear=False)
    def test_gemini_key_rejects_placeholder_value(self):
        self.assertIsNone(_get_gemini_api_key())

    @patch.dict(os.environ, {"GEMINI_API_KEY": "   "}, clear=False)
    def test_gemini_key_rejects_blank_value(self):
        self.assertIsNone(_get_gemini_api_key())

    def test_scanner_fallback_never_invents_a_disease(self):
        result = _build_scanner_result("tomato-late-blight.jpg", b"not-a-diagnostic-image")

        self.assertEqual(result["disease"], "Unable to determine from image")
        self.assertEqual(result["confidence"], 0.0)
        self.assertEqual(result["organicAlternatives"], [])

    @patch.dict(os.environ, {"GEMINI_API_KEY": "real-key-value", "GEMINI_MODEL": "gemini-3.6-flash"}, clear=False)
    @patch("api.views_core.time.sleep")
    @patch("api.views_core.requests.post")
    def test_gemini_scanner_retries_503_on_supported_model(self, post, _sleep):
        unavailable = Mock(status_code=503)
        unavailable.raise_for_status.side_effect = requests.HTTPError(response=unavailable)
        success = Mock(status_code=200)
        success.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"disease":"No disease detected","scientificName":"Not applicable","crop":"Tomato","confidence":88,"severity":"Low","spreadRisk":"Low","affectedArea":"0%","description":"No clear disease symptoms are visible.","treatment":"Continue normal crop monitoring.","organicAlternatives":[],"fertilizerRecommendations":[],"prevention":"Inspect the crop weekly."}'
                            }
                        ]
                    }
                }
            ]
        }
        post.side_effect = [unavailable, unavailable, success]

        result = _call_gemini_crop_scanner("healthy-leaf.jpg", "image/jpeg", b"image-data")

        self.assertEqual(result["disease"], "No disease detected")
        self.assertEqual(post.call_count, 3)
        self.assertIn("gemini-3.6-flash", post.call_args.args[0])
        generation_config = post.call_args.kwargs["json"]["generationConfig"]
        self.assertEqual(generation_config["maxOutputTokens"], 1024)
        self.assertEqual(generation_config["thinkingConfig"]["thinkingLevel"], "minimal")

    @patch.dict(os.environ, {"GEMINI_API_KEY": "real-key-value", "GEMINI_MODEL": "gemini-3.6-flash"}, clear=False)
    @patch("api.views_core.time.sleep")
    @patch("api.views_core.requests.post")
    def test_gemini_scanner_retries_an_empty_json_response(self, post, _sleep):
        malformed = Mock(status_code=200)
        malformed.json.side_effect = requests.exceptions.JSONDecodeError("Expecting value", "", 0)
        success = Mock(status_code=200)
        success.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"disease":"No disease detected","scientificName":"Not applicable","crop":"Tomato","confidence":88,"severity":"Low","spreadRisk":"Low","affectedArea":"0%","description":"No clear disease symptoms are visible.","treatment":"Continue normal crop monitoring.","organicAlternatives":[],"fertilizerRecommendations":[],"prevention":"Inspect the crop weekly."}'
                            }
                        ]
                    }
                }
            ]
        }
        post.side_effect = [malformed, success]

        result = _call_gemini_crop_scanner("healthy-leaf.jpg", "image/jpeg", b"image-data")

        self.assertEqual(result["disease"], "No disease detected")
        self.assertEqual(post.call_count, 2)

    @patch.dict(os.environ, {"GEMINI_API_KEY": "real-key-value", "GEMINI_MODEL": "gemini-3.6-flash"}, clear=False)
    @patch("api.views_core.requests.post")
    def test_gemini_scanner_uses_json_after_thought_part(self, post):
        success = Mock(status_code=200)
        success.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"thought": True, "text": "I need to inspect the crop symptoms before answering."},
                            {
                                "text": '{"disease":"No disease detected","scientificName":"Not applicable","crop":"Tomato","confidence":88,"severity":"Low","spreadRisk":"Low","affectedArea":"0%","description":"No clear disease symptoms are visible.","treatment":"Continue normal crop monitoring.","organicAlternatives":[],"fertilizerRecommendations":[],"prevention":"Inspect the crop weekly."}'
                            },
                        ]
                    }
                }
            ]
        }
        post.return_value = success

        result = _call_gemini_crop_scanner("healthy-leaf.jpg", "image/jpeg", b"image-data")

        self.assertEqual(result["disease"], "No disease detected")

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
