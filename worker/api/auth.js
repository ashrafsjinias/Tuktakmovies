// Authentication API routes

import {
  hashPassword, verifyPassword, generateSessionId, generateToken,
  getSessionUser, setSessionCookie, clearSessionCookie
} from '../utils/auth.js';
import {
  jsonResponse, parseJsonBody, parseFormBody, validateEmail,
  validateUsername, sanitizeText, checkRateLimit, getClientIP
} from '../utils/helpers.js';

export async function handleAuthRoutes(request, env, pathname) {
  const method = request.method;

  if (pathname === '/api/auth/register' && method === 'POST') {
    return handleRegister(request, env);
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    return handleLogin(request, env);
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return handleLogout(request, env);
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    return handleMe(request, env);
  }
  if (pathname === '/api/auth/change-password' && method === 'POST') {
    return handleChangePassword(request, env);
  }

  return null;
}

async function handleRegister(request, env) {
  // Check if registration is enabled
  const regEnabled = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'registration_enabled'"
  ).first();

  if (regEnabled?.value === '0') {
    return jsonResponse({ error: 'Registration is currently disabled' }, 403);
  }

  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(env, `register:${ip}`, 5, 3600);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'Too many registration attempts. Please try again later.' }, 429);
  }

  const body = await parseJsonBody(request) || await parseFormBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { username, email, password, display_name } = body;

  // Validate inputs
  if (!username || !validateUsername(username)) {
    return jsonResponse({ error: 'Username must be 3-30 characters (letters, numbers, underscores only)' }, 400);
  }
  if (!email || !validateEmail(email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }
  if (!password || password.length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  }
  if (password.length > 128) {
    return jsonResponse({ error: 'Password too long' }, 400);
  }

  // Check existing user
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?'
  ).bind(username.toLowerCase(), email.toLowerCase()).first();

  if (existing) {
    return jsonResponse({ error: 'Username or email already taken' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const cleanUsername = username.toLowerCase();
  const cleanEmail = email.toLowerCase();
  const cleanDisplayName = sanitizeText(display_name || username, 50);

  try {
    const result = await env.DB.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, role)
      VALUES (?, ?, ?, ?, 'user')
    `).bind(cleanUsername, cleanEmail, passwordHash, cleanDisplayName).run();

    const userId = result.meta.last_row_id;

    // Create session
    const sessionId = generateSessionId();
    const expiresAt = Math.floor(Date.now() / 1000) + 2592000; // 30 days

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, ip_address)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, userId, expiresAt, ip).run();

    const headers = {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(sessionId),
      'Location': '/'
    };

    return new Response(JSON.stringify({
      success: true,
      user: { id: userId, username: cleanUsername, display_name: cleanDisplayName, role: 'user' }
    }), { status: 201, headers });

  } catch (e) {
    console.error('Register error:', e);
    return jsonResponse({ error: 'Registration failed. Please try again.' }, 500);
  }
}

async function handleLogin(request, env) {
  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(env, `login:${ip}`, 10, 900); // 10 per 15 min
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'Too many login attempts. Please try again in 15 minutes.' }, 429);
  }

  const body = await parseJsonBody(request) || await parseFormBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { email, password } = body;

  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE (email = ? OR username = ?) AND is_active = 1'
  ).bind(email.toLowerCase(), email.toLowerCase()).first();

  if (!user || !await verifyPassword(password, user.password_hash)) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  // Create session
  const sessionId = generateSessionId();
  const expiresAt = Math.floor(Date.now() / 1000) + 2592000;

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip_address)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, user.id, expiresAt, ip).run();

  // Update last login
  await env.DB.prepare(
    'UPDATE users SET last_login = unixepoch() WHERE id = ?'
  ).bind(user.id).run();

  const headers = {
    'Content-Type': 'application/json',
    'Set-Cookie': setSessionCookie(sessionId)
  };

  return new Response(JSON.stringify({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    }
  }), { status: 200, headers });
}

async function handleLogout(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/session=([^;]+)/);

  if (sessionMatch) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionMatch[1]).run().catch(() => {});
  }

  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': clearSessionCookie(),
      'Location': '/'
    }
  });
}

async function handleMe(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ user: null }, 200);
  return jsonResponse({ user });
}

async function handleChangePassword(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { current_password, new_password } = body;

  if (!current_password || !new_password) {
    return jsonResponse({ error: 'Both current and new password are required' }, 400);
  }
  if (new_password.length < 8) {
    return jsonResponse({ error: 'New password must be at least 8 characters' }, 400);
  }

  const fullUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (!await verifyPassword(current_password, fullUser.password_hash)) {
    return jsonResponse({ error: 'Current password is incorrect' }, 401);
  }

  const newHash = await hashPassword(new_password);
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(newHash, user.id).run();

  // Invalidate all other sessions
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/session=([^;]+)/);
  if (sessionMatch) {
    await env.DB.prepare(
      'DELETE FROM sessions WHERE user_id = ? AND id != ?'
    ).bind(user.id, sessionMatch[1]).run();
  }

  return jsonResponse({ success: true, message: 'Password updated successfully' });
}
