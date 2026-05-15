// Firebase Admin OAuth helper — generates short-lived access tokens for the
// FCM HTTP v1 API. Reads service account JSON from `FIREBASE_SERVICE_ACCOUNT`
// env var (paste full JSON from Firebase Console > Service accounts > Generate
// new private key).
//
// Tokens cached module-scope for ~55min (TTL 60min). Warm Edge invocations
// reuse; cold starts re-sign.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let cachedKey: CryptoKey | null = null;
let serviceAccount: ServiceAccount | null = null;

function loadServiceAccount(): ServiceAccount {
  if (serviceAccount) return serviceAccount;
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  try {
    serviceAccount = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT missing client_email or private_key');
  }
  return serviceAccount;
}

export function getFirebaseProjectId(): string {
  return loadServiceAccount().project_id;
}

function base64urlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Strip header/footer + whitespace. Service account JSON has \n literals,
  // which JSON.parse already decodes — but be defensive.
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const sa = loadServiceAccount();
  const keyData = pemToArrayBuffer(sa.private_key);
  cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}

async function signJwt(): Promise<string> {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const headerEnc = base64urlEncode(JSON.stringify(header));
  const payloadEnc = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerEnc}.${payloadEnc}`;
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64urlEncode(sig)}`;
}

/**
 * Returns a cached OAuth access token if still valid (55min window),
 * otherwise mints a new one via the JWT-bearer flow.
 */
export async function getFirebaseAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }
  const sa = loadServiceAccount();
  const jwt = await signJwt();
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const resp = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firebase OAuth failed (${resp.status}): ${text}`);
  }
  const body = (await resp.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000 - 60_000, // -1min safety
  };
  return cached.accessToken;
}
