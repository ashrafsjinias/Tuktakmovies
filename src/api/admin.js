// Admin API routes

import { getSessionUser } from '../utils/auth.js';
import { jsonResponse, parseJsonBody, sanitizeText } from '../utils/helpers.js';

async function requireAdminUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function handleAdminRoutes(request, env, pathname) {
  const method = request.method;
  const url = new URL(request.url);

  // All admin routes require admin auth
  const user = await requireAdminUser(request, env);
  if (!user) {
    return jsonResponse({ error: 'Admin access required' }, 403);
  }

  // GET /api/admin/stats
  if (method === 'GET' && pathname === '/api/admin/stats') {
    return getStats(env);
  }

  // GET /api/admin/users
  if (method === 'GET' && pathname === '/api/admin/users') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const search = url.searchParams.get('q') || '';
    return getUsers(env, page, search);
  }

  // PUT /api/admin/users/:id
  if (method === 'PUT' && pathname.match(/^\/api\/admin\/users\/\d+$/)) {
    const userId = pathname.split('/')[4];
    return updateUser(request, env, user, userId);
  }

  // DELETE /api/admin/users/:id
  if (method === 'DELETE' && pathname.match(/^\/api\/admin\/users\/\d+$/)) {
    const userId = pathname.split('/')[4];
    return deleteUser(env, user, userId);
  }

  // GET /api/admin/reviews
  if (method === 'GET' && pathname === '/api/admin/reviews') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const status = url.searchParams.get('status') || 'all';
    return getReviews(env, page, status);
  }

  // PUT /api/admin/reviews/:id
  if (method === 'PUT' && pathname.match(/^\/api\/admin\/reviews\/\d+$/)) {
    const reviewId = pathname.split('/')[4];
    return updateReview(request, env, user, reviewId);
  }

  // GET /api/admin/settings
  if (method === 'GET' && pathname === '/api/admin/settings') {
    return getSettings(env);
  }

  // PUT /api/admin/settings
  if (method === 'PUT' && pathname === '/api/admin/settings') {
    return updateSettings(request, env, user);
  }

  return null;
}

async function getStats(env) {
  const [users, reviews, lists, sessions] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active FROM users').first(),
    env.DB.prepare("SELECT COUNT(*) as total, AVG(rating) as avg_rating FROM reviews WHERE status='published'").first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM user_lists').first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM sessions WHERE expires_at > unixepoch()').first()
  ]);

  // Recent activity
  const recentReviews = await env.DB.prepare(`
    SELECT r.id, r.rating, r.created_at, u.username, r.tmdb_id, r.media_type
    FROM reviews r JOIN users u ON r.user_id = u.id
    ORDER BY r.created_at DESC LIMIT 5
  `).all();

  const recentUsers = await env.DB.prepare(
    'SELECT id, username, email, created_at, role FROM users ORDER BY created_at DESC LIMIT 5'
  ).all();

  return jsonResponse({
    stats: {
      users: { total: users?.total || 0, active: users?.active || 0 },
      reviews: { total: reviews?.total || 0, avg_rating: reviews?.avg_rating },
      lists: { total: lists?.total || 0 },
      active_sessions: sessions?.total || 0
    },
    recent_reviews: recentReviews.results,
    recent_users: recentUsers.results
  });
}

async function getUsers(env, page, search) {
  const perPage = 25;
  const offset = (page - 1) * perPage;

  const searchParam = search ? `%${search}%` : '%';

  const [users, count] = await Promise.all([
    env.DB.prepare(`
      SELECT id, username, email, display_name, role, is_active, created_at, last_login
      FROM users
      WHERE username LIKE ? OR email LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(searchParam, searchParam, perPage, offset).all(),

    env.DB.prepare(
      'SELECT COUNT(*) as total FROM users WHERE username LIKE ? OR email LIKE ?'
    ).bind(searchParam, searchParam).first()
  ]);

  return jsonResponse({
    users: users.results,
    total: count?.total || 0,
    page,
    total_pages: Math.ceil((count?.total || 0) / perPage)
  });
}

async function updateUser(request, env, adminUser, userId) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

  const { role, is_active } = body;
  const validRoles = ['user', 'moderator', 'admin'];

  if (role && !validRoles.includes(role)) {
    return jsonResponse({ error: 'Invalid role' }, 400);
  }

  // Prevent self-demotion
  if (parseInt(userId) === adminUser.id && role !== 'admin') {
    return jsonResponse({ error: 'Cannot change your own admin role' }, 400);
  }

  await env.DB.prepare(`
    UPDATE users SET
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active),
      updated_at = unixepoch()
    WHERE id = ?
  `).bind(role || null, is_active !== undefined ? (is_active ? 1 : 0) : null, userId).run();

  // Log action
  await env.DB.prepare(
    'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminUser.id, 'update_user', 'user', userId, JSON.stringify({ role, is_active })).run();

  return jsonResponse({ success: true });
}

async function deleteUser(env, adminUser, userId) {
  if (parseInt(userId) === adminUser.id) {
    return jsonResponse({ error: 'Cannot delete your own account' }, 400);
  }

  await env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

  await env.DB.prepare(
    'INSERT INTO audit_log (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)'
  ).bind(adminUser.id, 'deactivate_user', 'user', userId).run();

  return jsonResponse({ success: true });
}

async function getReviews(env, page, status) {
  const perPage = 25;
  const offset = (page - 1) * perPage;
  const statusFilter = status === 'all' ? '%' : status;

  const [reviews, count] = await Promise.all([
    env.DB.prepare(`
      SELECT r.*, u.username, u.email
      FROM reviews r JOIN users u ON r.user_id = u.id
      WHERE r.status LIKE ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(statusFilter, perPage, offset).all(),

    env.DB.prepare(
      'SELECT COUNT(*) as total FROM reviews WHERE status LIKE ?'
    ).bind(statusFilter).first()
  ]);

  return jsonResponse({
    reviews: reviews.results,
    total: count?.total || 0,
    page,
    total_pages: Math.ceil((count?.total || 0) / perPage)
  });
}

async function updateReview(request, env, adminUser, reviewId) {
  const body = await parseJsonBody(request);
  const { status } = body || {};

  const validStatuses = ['published', 'pending', 'rejected', 'deleted'];
  if (!validStatuses.includes(status)) {
    return jsonResponse({ error: 'Invalid status' }, 400);
  }

  await env.DB.prepare(
    'UPDATE reviews SET status = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(status, reviewId).run();

  await env.DB.prepare(
    'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminUser.id, 'update_review', 'review', reviewId, JSON.stringify({ status })).run();

  return jsonResponse({ success: true });
}

async function getSettings(env) {
  const settings = await env.DB.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const s of settings.results) {
    obj[s.key] = s.value;
  }
  return jsonResponse({ settings: obj });
}

async function updateSettings(request, env, adminUser) {
  const body = await parseJsonBody(request);
  if (!body || !body.settings) return jsonResponse({ error: 'Invalid request' }, 400);

  const allowedKeys = [
    'site_name', 'site_tagline', 'maintenance_mode',
    'registration_enabled', 'reviews_require_approval', 'max_reviews_per_day'
  ];

  for (const [key, value] of Object.entries(body.settings)) {
    if (!allowedKeys.includes(key)) continue;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())'
    ).bind(key, sanitizeText(String(value), 500)).run();
  }

  await env.DB.prepare(
    'INSERT INTO audit_log (admin_id, action, details) VALUES (?, ?, ?)'
  ).bind(adminUser.id, 'update_settings', JSON.stringify(body.settings)).run();

  return jsonResponse({ success: true });
}
