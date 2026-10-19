import assert from "node:assert/strict";
import test from "node:test";
import { isSensitiveRecoveryKey, normalizeAwsStorageStatus, stripBrowserCloudConfiguration } from "./aws-storage.js";

test("normalizes the non-secret Amazon S3 status returned by the server", () => {
  assert.deepEqual(normalizeAwsStorageStatus({
    provider: "amazon_s3",
    configured: true,
    region: " ap-south-1 ",
    private: true,
    signedUrls: true,
    bucket: "must-not-reach-the-browser-model",
    accessKey: "must-not-reach-the-browser-model",
  }), {
    provider: "amazon_s3",
    configured: true,
    region: "ap-south-1",
    private: true,
    signedUrls: true,
  });
});

test("does not report S3 configured for an unknown provider", () => {
  assert.deepEqual(normalizeAwsStorageStatus({ provider: "cloudflare_r2", configured: true }), {
    provider: "local",
    configured: false,
    region: null,
    private: true,
    signedUrls: false,
  });
});

test("removes legacy and injected browser-managed cloud configuration", () => {
  const original = {
    "Restaurant profile": { restaurantName: "UVPRO" },
    "Cloudflare R2": { endpoint: "legacy", accessKey: "legacy-secret" },
    "Amazon S3 storage": { bucket: "do-not-persist", secretKey: "do-not-persist" },
  };
  assert.deepEqual(stripBrowserCloudConfiguration(original), {
    "Restaurant profile": { restaurantName: "UVPRO" },
  });
  assert.ok(original["Cloudflare R2"], "the input object is not mutated");
});

test("recovery exports reject secrets and the retired R2 settings section", () => {
  assert.equal(isSensitiveRecoveryKey("refreshToken"), true);
  assert.equal(isSensitiveRecoveryKey("AWS_SECRET_KEY"), true);
  assert.equal(isSensitiveRecoveryKey("Cloudflare R2"), true);
  assert.equal(isSensitiveRecoveryKey("restaurantName"), false);
});
