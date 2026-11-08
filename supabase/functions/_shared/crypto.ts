const encoder = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createParticipantToken(idempotencyKey: string) {
  const secret = Deno.env.get('GH_A_ACCESS_SECRET');
  if (!secret || secret.length < 32) throw new Error('سر الوصول الخاص بالإصدار غير مضبوط على الخادم.');
  return base64Url(await hmac(secret, `participant:${idempotencyKey}`));
}

export async function createAdminToken() {
  const secret = Deno.env.get('GH_A_ADMIN_TOKEN_SECRET');
  if (!secret || secret.length < 32) throw new Error('سر جلسة الإدارة غير مضبوط على الخادم.');
  const payload = base64Url(encoder.encode(JSON.stringify({
    purpose: 'ghawthani-admin',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
    nonce: crypto.randomUUID(),
  })));
  const signature = base64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyAdminToken(token: string) {
  const secret = Deno.env.get('GH_A_ADMIN_TOKEN_SECRET');
  if (!secret || !token) return false;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature) return false;
  const expectedSignature = base64Url(await hmac(secret, payload));
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return false;
  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decoded = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(paddedPayload), (char) => char.charCodeAt(0)),
    ));
    return decoded.purpose === 'ghawthani-admin' && Number(decoded.exp) > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] || 0) ^ (b[index % Math.max(b.length, 1)] || 0);
  }
  return mismatch === 0;
}
