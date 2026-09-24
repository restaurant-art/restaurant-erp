const allowedOrigins = new Set(["https://uvpro.in", "https://www.uvpro.in", "http://localhost:4173", "http://127.0.0.1:4173"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://uvpro.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(request), "Cache-Control": "no-store", "Content-Type": "application/json" },
});

function normalizePem(value: string) {
  return String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\[nr]/g, "\n");
}

function pemToBytes(pem: string) {
  const normalized = normalizePem(pem);
  const pemMatch = normalized.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (normalized.includes("-----BEGIN") && !pemMatch) throw new Error("The QZ private key PEM header or footer is invalid");

  // Secret managers and shell commands commonly remove trailing base64
  // padding or preserve URL-safe base64. Web Crypto accepts the same DER
  // after those transport differences are normalized.
  const compact = (pemMatch?.[2] || normalized)
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!compact || /[^A-Za-z0-9+/=]/.test(compact) || /=/.test(compact.replace(/=+$/, ""))) {
    throw new Error("The QZ private key contains invalid base64 characters");
  }
  const unpadded = compact.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw new Error("The QZ private key base64 is truncated");
  const base64 = unpadded.padEnd(unpadded.length + ((4 - (unpadded.length % 4)) % 4), "=");
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("The QZ private key base64 could not be decoded");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signRequest(requestText: string, privateKeyPem: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(requestText),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "POST required" }, 405);

  try {
    const certificate = Deno.env.get("QZ_CERTIFICATE") ? normalizePem(Deno.env.get("QZ_CERTIFICATE") as string) : "";
    const privateKey = Deno.env.get("QZ_PRIVATE_KEY") ? normalizePem(Deno.env.get("QZ_PRIVATE_KEY") as string) : "";
    if (!certificate || !privateKey) return json(request, { error: "QZ signing is not configured" }, 503);

    const body = await request.json().catch(() => null) as { action?: string; request?: string } | null;
    if (body?.action === "certificate") return json(request, { certificate });
    if (body?.action !== "sign" || typeof body.request !== "string" || !body.request) {
      return json(request, { error: "A QZ signing request is required" }, 400);
    }
    return json(request, { signature: await signRequest(body.request, privateKey) });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "QZ signing failed" }, 401);
  }
});
