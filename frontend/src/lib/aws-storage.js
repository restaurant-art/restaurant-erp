const serverManagedProvider = "amazon_s3";

export function normalizeAwsStorageStatus(payload = {}) {
  const provider = payload?.provider === serverManagedProvider ? serverManagedProvider : "local";
  return {
    provider,
    configured: provider === serverManagedProvider && payload?.configured === true,
    region: typeof payload?.region === "string" && payload.region.trim() ? payload.region.trim() : null,
    private: payload?.private !== false,
    signedUrls: payload?.signedUrls === true,
  };
}

export function stripBrowserCloudConfiguration(settings = {}) {
  const safe = settings && typeof settings === "object" && !Array.isArray(settings)
    ? { ...settings }
    : {};
  delete safe["Cloudflare R2"];
  delete safe["Amazon S3 storage"];
  return safe;
}

export function isSensitiveRecoveryKey(key) {
  const name = String(key || "").trim();
  return /(?:password|token|credential|secret|access.?key|api.?key)/i.test(name)
    || name.toLowerCase() === "cloudflare r2";
}
