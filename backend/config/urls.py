from __future__ import annotations

from django.urls import path

from api import views_admin, views_core, views_loans, views_social

from .bridge import legacy_view

urlpatterns = [
    path("health", legacy_view(views_core.health)),
    path("api/scanner/crops", legacy_view(views_core.scanner_crops)),
    path("api/products", legacy_view(views_core.products_root)),
    path("api/products/mine", legacy_view(views_core.products_mine)),
    path("api/products/upload-video", legacy_view(views_core.products_upload_video)),
    path("api/products/upload-image", legacy_view(views_core.products_upload_image)),
    path("api/products/<str:product_id>", legacy_view(views_core.product_detail)),
    path("api/products/<str:product_id>/like", legacy_view(views_core.product_like)),
    path("api/products/<str:product_id>/rate", legacy_view(views_core.product_rate)),
    path("api/orders", legacy_view(views_core.orders_root)),
    path("api/orders/selling", legacy_view(views_core.orders_selling)),
    path("api/orders/buying", legacy_view(views_core.orders_buying)),
    path("api/orders/<str:order_id>/status", legacy_view(views_core.order_status)),
    path("api/payments/orders/<str:order_id>/mpesa", legacy_view(views_core.payment_mpesa)),
    path("api/payments/orders/<str:order_id>/mpesa-status", legacy_view(views_core.payment_mpesa_status)),
    path("api/payments/mpesa/callback", legacy_view(views_core.payment_mpesa_callback)),
    path("api/profiles/me", legacy_view(views_core.profile_me)),
    path("api/profiles/me/role", legacy_view(views_core.profile_me_role)),
    path("api/profiles/me/photo", legacy_view(views_core.profile_me_photo)),
    path("api/profiles/farmers", legacy_view(views_core.profiles_farmers)),
    path("api/profiles/<str:user_id>", legacy_view(views_core.profile_public)),
    path("api/messages/conversations", legacy_view(views_social.conversations_root)),
    path("api/messages/conversations/<str:conversation_id>", legacy_view(views_social.conversation_detail)),
    path("api/messages/conversations/<str:conversation_id>/send", legacy_view(views_social.conversation_send)),
    path("api/crop-events", legacy_view(views_social.crop_events_root)),
    path("api/crop-events/<str:event_id>", legacy_view(views_social.crop_event_detail)),
    path("api/id-verification", legacy_view(views_social.id_verification_root)),
    path("api/id-verification/upload", legacy_view(views_social.id_verification_upload)),
    path("api/micro-loans/offers", legacy_view(views_loans.micro_loan_offers)),
    path("api/micro-loans/applications", legacy_view(views_loans.micro_loan_applications)),
    path("api/micro-loans/applications/<str:loan_id>/repay", legacy_view(views_loans.micro_loan_repay)),
    path("api/admin/overview", legacy_view(views_admin.admin_overview)),
    path("api/admin/analytics", legacy_view(views_admin.admin_analytics)),
    path("api/admin/users", legacy_view(views_admin.admin_users)),
    path("api/admin/users/<str:user_id>/role", legacy_view(views_admin.admin_user_role)),
    path("api/admin/orders", legacy_view(views_admin.admin_orders)),
    path("api/admin/loan-candidates", legacy_view(views_admin.admin_loan_candidates)),
    path("api/admin/loan-offers", legacy_view(views_admin.admin_loan_offers)),
    path("api/admin/loan-offers/<str:offer_id>", legacy_view(views_admin.admin_loan_offer_detail)),
    path("api/admin/loans", legacy_view(views_admin.admin_loans)),
    path("api/admin/loans/<str:loan_id>", legacy_view(views_admin.admin_loan_detail)),
    path("api/admin/verifications", legacy_view(views_admin.admin_verifications)),
    path("api/admin/verifications/<str:verification_id>", legacy_view(views_admin.admin_verification_detail)),
    path("api/admin/receipts/export", legacy_view(views_admin.admin_receipts_export)),
]
