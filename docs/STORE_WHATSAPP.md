# Store-wise WhatsApp billing

UVPRO’s Django API uses the saved POS sales ledger as the checkout source. Each store has a `StoreConnection` row keyed by its POS store ID and root tenant ID. The store directory creates disconnected rows for new stores and branches. Django checks store access before reading settings or history and before queuing a sale. AWS KMS binds each encrypted credential to the tenant, store, WABA, phone number, and authorization generation. The browser receives connection details and public Meta app IDs.

## Connect a store

1. Sign in as a store owner or administrator and open that store. Go to **Settings → Meta WhatsApp Integration**.
2. Choose **Connect Meta Account**. In Meta’s Embedded Signup window, select the store’s own Meta business portfolio, WhatsApp Business Account, and business phone number.
3. Complete any verification in Meta. If the page asks for registration, enter the sender’s six-digit WhatsApp two-step PIN. Refresh the connection until the registered WhatsApp number and Meta display name appear with **Connected**.
4. Load approved templates and select the invoice template from that store’s WABA. Save the template and queue a test to a recipient who agreed to it. Refresh **Message history** to see Meta’s delivery status.
5. Enable **Automatic WhatsApp billing** and save. At checkout, the cashier enters the number and checks **Customer agreed to receive this bill on WhatsApp**. Indian numbers may use ten local digits. Use `+` and the country code for other countries.

The durable receipt job is committed with the saved sale. The worker uses the configured sender’s phone number ID. An offline checkout becomes eligible when its saved bill reaches the server. Printing and reprinting use the existing receipt workflow. A timeout whose outcome Meta has yet to confirm shows **Awaiting confirmation**. Confirmed failures can be resent by a store administrator from the original store sender.

### Utility template

For a digital bill use an approved text utility template with body variables **store name, bill number, total, receipt URL**, in that order for positional templates (`{{1}}` through `{{4}}`). Named templates can use `{{store_name}}`, `{{invoice_number}}`, `{{total}}`, and `{{receipt_url}}`. Fixed text headers and footers are supported. Select the language approved for that template. Each link opens a read-only receipt for 30 days. The page omits customer contact details and uses an opaque link key.

Stores that already have an approved `uvpro_invoice_confirmation` utility template can select its eight-variable layout for store, bill number, items, subtotal, discount, GST, total, and payment. Long item lists use the digital receipt link in the items field. Meta controls template approval, delivery, and the sender’s display name. [Meta message template reference](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/)

## Platform configuration

Set these values in the environment for Django and the worker. Use a separate platform app, KMS key, and database for staging.

| Variable | Value |
| --- | --- |
| `META_WHATSAPP_APP_ID` | Platform Meta app ID |
| `META_WHATSAPP_APP_SECRET` | Platform app secret used for code exchange and webhook signatures |
| `META_WHATSAPP_SIGNUP_CONFIG_ID` | Facebook Login for Business Embedded Signup configuration ID using the supported code flow |
| `META_WHATSAPP_GRAPH_VERSION` | Supported Graph API version configured for that Meta app |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Independent random text used for the webhook subscription challenge |
| `META_WHATSAPP_KMS_KEY_ARN` | Symmetric AWS KMS key ARN authorized for the app runtime |
| `META_WHATSAPP_RECEIPT_ORIGIN` | HTTPS POS origin such as `https://pos.example.com` |

Configure Meta Embedded Signup for client-owned WABAs. Add the HTTPS POS origin to the app configuration. Complete Meta Business Verification, Tech Provider onboarding, and App Review or Advanced Access for `whatsapp_business_management` and `whatsapp_business_messaging` as required for client accounts. Include the app permissions needed to read the customer business identity. Configure the WhatsApp Business Account `messages` webhook at `https://<POS-host>/api/webhooks/meta/whatsapp/` and enter the server’s verification token. During signup the server subscribes the app to that store’s WABA. [Meta Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/) · [Meta webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)

With the supplied AWS template, put the five Meta app and webhook variables in a Secrets Manager JSON secret and pass its ARN as `MetaWhatsAppPlatformSecretArn`. Set `MetaWhatsAppKmsKeyArn` and keep a worker running. The stack starts a single Celery Beat service. For deployments managed outside this template, run `celery -A config worker -l info` and one `celery -A config beat -l info --schedule=/tmp/uvpro-celerybeat` process with the same Redis broker. Grant the API and worker `kms:Encrypt` and `kms:Decrypt` on the configured key with the `uvpro-whatsapp-sender` purpose in the encryption context. Use a role with temporary AWS credentials. [AWS KMS encryption context](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html)

Route `/receipts/whatsapp/` to Django. Keep receipt query strings out of proxy and load-balancer access logs. Django’s development server and the application’s Uvicorn access logger redact them for this route.

Keep `Cross-Origin-Opener-Policy: same-origin-allow-popups` on the POS HTML served by Django so the Meta popup can return the signup result. [HTML opener policy specification](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-opener-policies)

## Upgrade and rollback

1. Record the active release and take a database snapshot. Preserve the previous receipt environment settings and Secrets Manager versions in your restricted backup. The `whatsapp` migrations add their own tables and copy legacy invoice settings to `uvpro-archive-whatsapp-settings-v1`. The original settings, invoice and customer data, and predecessor message rows remain available in the database. Where the predecessor dispatch table exists, **Earlier WhatsApp receipts** reads its history for the signed-in store.
2. Build from your release source with the store-wise code applied. Releases that already have `core.0004` through `core.0007` need their existing migration files and feature code in the release image. Apply `python manage.py migrate` in staging first and use isolated POS records. Test checkout, stock posting, OTP, the worker, and the sender with Meta-approved test recipients.
3. In a production rollout, migrate before updating the API and worker, then refresh the POS clients. The old `/api/cloud/whatsapp-bill/` endpoint is retired. A store owner must complete Embedded Signup and enable their store. Existing OTP settings and ordinary SMS use their own configuration.
4. For rollback, pause the WhatsApp Beat service and roll back the web and worker image. Keep the additive tables and receipt history for reconciliation. Keep the old bill sender disabled. Use the pre-upgrade database snapshot for isolated recovery and inspection.

## Verification

Run `python manage.py test apps.whatsapp` from `backend` and `pnpm test` from `frontend`. The test suite posts real authenticated POS ledger changes against an isolated database. The simulated Kunnil, HYDIS, and Restaurant ABC stores use different Meta phone IDs. The suite exercises consent, checkout replay, disconnected stores, cross-store access, sender authorization, encrypted credential context, webhook authentication, delivery, retry, and expired receipt links. A live pilot still requires the approved Meta app, a configured KMS key, and a store-owned phone number and template.
