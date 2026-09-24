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

type DerElement = { tag: number; start: number; contentStart: number; end: number };

function readDerElement(bytes: Uint8Array, offset: number): DerElement {
  if (offset + 2 > bytes.length) throw new Error("The QZ certificate DER is incomplete");
  const start = offset;
  const tag = bytes[offset++];
  const lengthByte = bytes[offset++];
  let length = lengthByte;
  if (lengthByte & 0x80) {
    const lengthBytes = lengthByte & 0x7f;
    if (!lengthBytes || lengthBytes > 4 || offset + lengthBytes > bytes.length) throw new Error("The QZ certificate DER length is invalid");
    length = 0;
    for (let index = 0; index < lengthBytes; index += 1) length = (length * 256) + bytes[offset++];
  }
  const end = offset + length;
  if (end > bytes.length) throw new Error(`ASN.1 DER message is incomplete: expected ${end}, actual ${bytes.length} at DER byte ${offset}`);
  return { tag, start, contentStart: offset, end };
}

function certificateSpki(certificatePem: string) {
  const bytes = pemToBytes(certificatePem);
  const certificate = readDerElement(bytes, 0);
  const tbsCertificate = readDerElement(bytes, certificate.contentStart);
  if (certificate.tag !== 0x30 || tbsCertificate.tag !== 0x30) throw new Error("The QZ certificate is not valid X.509 DER");
  let offset = tbsCertificate.contentStart;
  let element = readDerElement(bytes, offset);
  if (element.tag === 0xa0) {
    offset = element.end;
    element = readDerElement(bytes, offset);
  }
  // serialNumber, signature, issuer, validity and subject precede SPKI.
  for (let index = 0; index < 5; index += 1) {
    offset = element.end;
    element = readDerElement(bytes, offset);
  }
  if (element.tag !== 0x30) throw new Error("The QZ certificate public key is invalid");
  return bytes.slice(element.start, element.end);
}

const rsaAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
let signingKeyPromise: Promise<CryptoKey> | null = null;

async function importSigningKey(privateKeyPem: string, certificatePem: string) {
  const privateKeyBytes = pemToBytes(privateKeyPem);
  try {
    return await crypto.subtle.importKey("pkcs8", privateKeyBytes, rsaAlgorithm, false, ["sign"]);
  } catch (error) {
    // Recover a known one-byte truncation caused by an earlier secret upload.
    // Every candidate is verified against the configured certificate, so no
    // guessed key can ever be used to sign a print request.
    let declaredEnd = 0;
    try {
      declaredEnd = readDerElement(new Uint8Array([...privateKeyBytes, 0]), 0).end;
    } catch {
      throw error;
    }
    if (declaredEnd !== privateKeyBytes.length + 1) throw error;

    const publicKey = await crypto.subtle.importKey("spki", certificateSpki(certificatePem), rsaAlgorithm, false, ["verify"]);
    const probe = new TextEncoder().encode("uvpro-qz-key-recovery");
    const candidateBytes = new Uint8Array(privateKeyBytes.length + 1);
    candidateBytes.set(privateKeyBytes);
    for (let byte = 0; byte <= 255; byte += 1) {
      candidateBytes[candidateBytes.length - 1] = byte;
      try {
        const candidate = await crypto.subtle.importKey("pkcs8", candidateBytes, rsaAlgorithm, false, ["sign"]);
        const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", candidate, probe);
        if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, probe)) return candidate;
      } catch {
        // Try the next possible final byte.
      }
    }
    throw new Error("The QZ private key is truncated and does not match the configured certificate");
  }
}

async function signRequest(requestText: string, privateKeyPem: string, certificatePem: string) {
  signingKeyPromise ||= importSigningKey(privateKeyPem, certificatePem);
  const key = await signingKeyPromise;
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
    return json(request, { signature: await signRequest(body.request, privateKey, certificate) });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "QZ signing failed" }, 401);
  }
});
