const databaseName = "uvpro-qz-offline-signing";
const databaseVersion = 1;
const storeName = "signer";
const signerKey = "current";
const signatureAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("This browser does not support offline QZ signing storage"));
  databasePromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline QZ signing storage"));
  });
  return databasePromise;
}

async function storeRequest(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    request.onerror = () => reject(request.error || new Error("Offline QZ signing storage failed"));
    transaction.onabort = () => reject(transaction.error || new Error("Offline QZ signing storage failed"));
  });
}

function pemBytes(pem, label) {
  const match = String(pem || "").match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`));
  if (!match) throw new Error(`The selected QZ ${label.toLowerCase()} file is not valid PEM`);
  const base64 = match[1].replace(/\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readDer(bytes, offset) {
  if (offset + 2 > bytes.length) throw new Error("The QZ certificate is incomplete");
  const start = offset;
  const tag = bytes[offset++];
  const size = bytes[offset++];
  let length = size;
  if (size & 0x80) {
    const count = size & 0x7f;
    if (!count || count > 4 || offset + count > bytes.length) throw new Error("The QZ certificate is invalid");
    length = 0;
    for (let i = 0; i < count; i += 1) length = length * 256 + bytes[offset++];
  }
  const end = offset + length;
  if (end > bytes.length) throw new Error("The QZ certificate is incomplete");
  return { tag, start, contentStart: offset, end };
}

function certificatePublicKey(certificate) {
  const bytes = pemBytes(certificate, "CERTIFICATE");
  const outer = readDer(bytes, 0);
  const tbs = readDer(bytes, outer.contentStart);
  if (outer.tag !== 0x30 || tbs.tag !== 0x30) throw new Error("The QZ certificate is not valid X.509");
  let element = readDer(bytes, tbs.contentStart);
  if (element.tag === 0xa0) element = readDer(bytes, element.end);
  for (let i = 0; i < 5; i += 1) element = readDer(bytes, element.end);
  if (element.tag !== 0x30) throw new Error("The QZ certificate has no valid public key");
  return bytes.slice(element.start, element.end);
}

export async function getOfflineQzSigner() {
  return await storeRequest("readonly", (store) => store.get(signerKey)) || null;
}

export async function saveOfflineQzSigner(certificatePem, privateKeyPem) {
  const certificate = String(certificatePem || "").trim();
  const privateBytes = pemBytes(privateKeyPem, "PRIVATE KEY");
  pemBytes(certificate, "CERTIFICATE");
  const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes, signatureAlgorithm, false, ["sign"]);
  const publicKey = await crypto.subtle.importKey("spki", certificatePublicKey(certificate), signatureAlgorithm, false, ["verify"]);
  const probe = new TextEncoder().encode("UVPRO offline QZ signing check");
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, probe);
  const matches = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, probe);
  if (!matches) throw new Error("That private key does not belong to the selected QZ certificate");
  await storeRequest("readwrite", (store) => store.put({ certificate, privateKey, savedAt: Date.now() }, signerKey));
  return { certificate, savedAt: Date.now() };
}

export async function signOfflineQzRequest(requestText) {
  const signer = await getOfflineQzSigner();
  if (!signer) throw new Error("Offline QZ signing is not set up on this computer");
  const bytes = new TextEncoder().encode(String(requestText));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer.privateKey, bytes);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
