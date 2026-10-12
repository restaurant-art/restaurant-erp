# QZ Tray signing

The AWS-only frontend supports per-computer offline signing. In **Settings →
QZ Tray**, an administrator can select the trusted certificate and matching
private key. The browser validates that they match, stores the private key as a
non-exportable key in local IndexedDB, and signs locally; repeat setup on each
POS computer.

The private key is not stored in AWS or sent to the browser as exportable key
material. Cloud signing is not configured in the current AWS backend; the
`/api/cloud/qz-sign/` endpoint currently returns “not configured.”
