from django.urls import path

from . import views

urlpatterns = [
    path("cloud/whatsapp-bill/", views.retired_receipt_endpoint),
    path("cloud/whatsapp/<str:store_id>/", views.integration),
    path("cloud/whatsapp/<str:store_id>/signup/", views.signup_start),
    path("cloud/whatsapp/<str:store_id>/signup/complete/", views.signup_complete),
    path("cloud/whatsapp/<str:store_id>/verify/", views.verify_sender),
    path("cloud/whatsapp/<str:store_id>/disconnect/", views.disconnect),
    path("cloud/whatsapp/<str:store_id>/templates/", views.templates),
    path("cloud/whatsapp/<str:store_id>/test/", views.send_test),
    path("cloud/whatsapp/<str:store_id>/history/", views.history),
    path("cloud/whatsapp/<str:store_id>/history/<uuid:receipt_id>/resend/", views.resend),
    path("webhooks/meta/whatsapp/", views.webhook),
]
