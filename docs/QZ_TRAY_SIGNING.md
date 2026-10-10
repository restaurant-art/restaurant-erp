# QZ Tray signing

UVPRO signs QZ Tray requests through the authenticated Django endpoint `/api/cloud/qz-sign`. The RSA private key remains non-exportable in AWS KMS. Configure its asymmetric key ARN or ID as `QZ_KMS_KEY_ID` and inject the matching public certificate as `QZ_CERTIFICATE`.

The certificate must be trusted by each QZ Tray installation. Development machines can use QZ Tray's Advanced → Site Manager demo certificate. Production stores should use a QZ-issued certificate and managed certificate rollout.

The ECS task role needs `kms:Sign` for only that key. The endpoint returns a configuration error when the certificate or KMS key ID is absent. Never place a private key in the frontend image, S3 website content, source control, or a `VITE_` variable.
