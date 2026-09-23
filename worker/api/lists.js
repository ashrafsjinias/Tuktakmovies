// User lists API - favorites, watchlist, watched

import { getSessionUser } from '../utils/auth.js';
import { jsonResponse, parseJsonBody } from '../utils/helpers.js';
import { cacheMovieMetadata } from '../utils/tmdb.js';

export async function handleListRoutes(request, env, pathname) {
  const method = request.method;
  const url = new URL(request.url);

  // GET /api/lists/:list_type - get user's list
  if (method === 'GET' && pathname.startsWith('/api/lists/')) {
    const listType = pathname.split('/')[3];
    const page = parseInt(url.searchParams.get('page') || '1');
    return getUserList(request, env, listType, page);
  }

  // POST /api/lists/toggle - add/remove from list
  if (method === 'POST' && pathname === '/api/lists/toggle') {
    return toggleListItem(request, env);
  }

  // GET /api/lists/status/:tmdb_id - get item status across all lists
  if (method === 'GET' && pathname.startsWith('/api/lists/status/')) {
    const tmdbId = pathname.split('/')[4];
    const mediaType = url.searchParams.get('media_type') || 'movie';
    return getItemStatus(request, env, tmdbId, mediaType);
  }

  return null;
}

async function getUserList(request, env, listType, page = 1) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const validTypes = ['favorite', 'watchlist', 'watched'];
  if (!validTypes.includes(listType)) {
    return jsonResponse({ error: 'Invalid list type' }, 400);
  }

  const perPage = 20;
  const offset = (page - 1) * perPage;

  const [items, count] = await Promise.all([
    env.DB.prepare(`
      SELECT ul.*, mc.title, mc.poster_path, mc.backdrop_path,
             mc.overview, mc.release_date, mc.vote_average, mc.genres
      FROM user_lists ul
      LEFT JOIN movie_cache mc ON ul.tmdb_id = mc.tmdb_id AND ul.media_type = mc.media_type
      WHERE ul.user_id = ? AND ul.list_type = ?
      ORDER BY ul.added_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, listType, perPage, offset).all(),

    env.DB.prepare(
      'SELECT COUNT(*) as total FROM user_lists WHERE user_id = ? AND list_type = ?'
    ).bind(user.id, listType).first()
  ]);

  return jsonResponse({
    items: items.results,
    total: count?.total || 0,
    page,
    total_pages: Math.ceil((count?.total || 0) / perPage)
  });
}

async function toggleListItem(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Sign in to manage your lists' }, 401);

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { tmdb_id, media_type = 'movie', list_type, movie_data } = body;

  if (!tmdb_id) return jsonResponse({ error: 'Movie ID required' }, 400);

  const validTypes = ['favorite', 'watchlist', 'watched'];
  if (!validTypes.includes(list_type)) {
    return jsonResponse({ error: 'Invalid list type' }, 400);
  }

  // Check if already in list
  const existing = await env.DB.prepare(
    'SELECT id FROM user_lists WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND list_type = ?'
  ).bind(user.id, tmdb_id, media_type, list_type).first();

  if (existing) {
    // Remove from list
    await env.DB.prepare(
      'DELETE FROM user_lists WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND list_type = ?'
    ).bind(user.id, tmdb_id, media_type, list_type).run();

    return jsonResponse({ success: true, action: 'removed', in_list: false });
  }

  // Add to list
  await env.DB.prepare(
    'INSERT INTO user_lists (user_id, tmdb_id, media_type, list_type) VALUES (?, ?, ?, ?)'
  ).bind(user.id, tmdb_id, media_type, list_type).run();

  // Cache movie metadata if provided
  if (movie_data) {
    await cacheMovieMetadata(env, movie_data, media_type);
  }

  return jsonResponse({ success: true, action: 'added', in_list: true });
}

async function getItemStatus(request, env, tmdbId, mediaType) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return jsonResponse({ favorite: false, watchlist: false, watched: false });
  }

  const items = await env.DB.prepare(
    'SELECT list_type FROM user_lists WHERE user_id = ? AND tmdb_id = ? AND media_type = ?'
  ).bind(user.id, tmdbId, mediaType).all();

  const status = { favorite: false, watchlist: false, watched: false };
  for (const item of items.results) {
    status[item.list_type] = true;
  }

  return jsonResponse(status);
}
