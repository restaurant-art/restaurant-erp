# QZ Tray signing

UVPRO uses an authenticated Supabase Edge Function for QZ Tray signing. The
private key is never sent to the browser.

Configure these Supabase Edge Function secrets before deploying the frontend:

- `QZ_CERTIFICATE`: the QZ digital certificate text (`digital-certificate.txt`)
- `QZ_PRIVATE_KEY`: the matching PKCS#8 private key (`private-key.pem`)

The certificate must also be trusted by each QZ Tray installation. For a local
development machine, QZ Tray's Advanced → Site Manager can create and install a
demo certificate. Production stores should use a QZ-issued certificate or a
managed certificate deployment across every POS computer.

After the secrets are configured, deploy `qz-sign`, then deploy the frontend.
Without the secrets, the function deliberately returns a configuration error
instead of exposing or embedding a private key in the frontend bundle.
