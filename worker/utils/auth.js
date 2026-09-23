// Auth utilities using Web Crypto API (Cloudflare Workers compatible)

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, hash) {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

export function generateSessionId() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${encodedSignature}`;
}

export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = Uint8Array.from(
      atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC', key, signature, new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;

    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function getSessionUser(request, env) {
  try {
    const cookie = request.headers.get('Cookie') || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    if (!sessionMatch) return null;

    const sessionId = sessionMatch[1];
    const now = Math.floor(Date.now() / 1000);

    const result = await env.DB.prepare(`
      SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1
    `).bind(sessionId, now).first();

    return result || null;
  } catch {
    return null;
  }
}

export function requireAuth(user) {
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export function requireAdmin(user) {
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export function setSessionCookie(sessionId, maxAge = 2592000) {
  return `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
}

export function clearSessionCookie() {
  return 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
}
