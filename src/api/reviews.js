// Reviews API routes

import { getSessionUser } from '../utils/auth.js';
import { jsonResponse, parseJsonBody, sanitizeText, checkRateLimit, getClientIP } from '../utils/helpers.js';

export async function handleReviewRoutes(request, env, pathname) {
  const method = request.method;
  const url = new URL(request.url);

  // GET /api/reviews/:tmdb_id?media_type=movie
  if (method === 'GET' && pathname.startsWith('/api/reviews/')) {
    const tmdbId = pathname.split('/')[3];
    const mediaType = url.searchParams.get('media_type') || 'movie';
    const page = parseInt(url.searchParams.get('page') || '1');
    return getReviews(env, tmdbId, mediaType, page);
  }

  // POST /api/reviews
  if (method === 'POST' && pathname === '/api/reviews') {
    return createReview(request, env);
  }

  // PUT /api/reviews/:id
  if (method === 'PUT' && pathname.startsWith('/api/reviews/')) {
    const reviewId = pathname.split('/')[3];
    return updateReview(request, env, reviewId);
  }

  // DELETE /api/reviews/:id
  if (method === 'DELETE' && pathname.startsWith('/api/reviews/')) {
    const reviewId = pathname.split('/')[3];
    return deleteReview(request, env, reviewId);
  }

  // POST /api/reviews/:id/helpful
  if (method === 'POST' && pathname.match(/^\/api\/reviews\/\d+\/helpful$/)) {
    const reviewId = pathname.split('/')[3];
    return voteHelpful(request, env, reviewId);
  }

  return null;
}

async function getReviews(env, tmdbId, mediaType, page = 1) {
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const [reviews, countResult] = await Promise.all([
    env.DB.prepare(`
      SELECT r.*, u.username, u.display_name, u.avatar_url
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.tmdb_id = ? AND r.media_type = ? AND r.status = 'published'
      ORDER BY r.helpful_count DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(tmdbId, mediaType, perPage, offset).all(),

    env.DB.prepare(`
      SELECT COUNT(*) as total, AVG(rating) as avg_rating
      FROM reviews
      WHERE tmdb_id = ? AND media_type = ? AND status = 'published'
    `).bind(tmdbId, mediaType).first()
  ]);

  return jsonResponse({
    reviews: reviews.results,
    total: countResult?.total || 0,
    avg_rating: countResult?.avg_rating ? Math.round(countResult.avg_rating * 10) / 10 : null,
    page,
    total_pages: Math.ceil((countResult?.total || 0) / perPage)
  });
}

async function createReview(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Sign in to write a review' }, 401);

  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(env, `review:${user.id}`, 10, 86400);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'You have reached your daily review limit (10 reviews per day)' }, 429);
  }

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { tmdb_id, media_type = 'movie', rating, title, body: reviewBody, contains_spoilers = false } = body;

  if (!tmdb_id) return jsonResponse({ error: 'Movie/Show ID is required' }, 400);
  if (!rating || rating < 1 || rating > 10) return jsonResponse({ error: 'Rating must be between 1 and 10' }, 400);
  if (!reviewBody || reviewBody.trim().length < 20) {
    return jsonResponse({ error: 'Review must be at least 20 characters' }, 400);
  }
  if (reviewBody.length > 5000) {
    return jsonResponse({ error: 'Review cannot exceed 5000 characters' }, 400);
  }

  // Check for existing review
  const existing = await env.DB.prepare(
    'SELECT id FROM reviews WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND status != ?'
  ).bind(user.id, tmdb_id, media_type, 'deleted').first();

  if (existing) {
    return jsonResponse({ error: 'You have already reviewed this title. Edit your existing review instead.' }, 409);
  }

  // Check if reviews require approval
  const needsApproval = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'reviews_require_approval'"
  ).first();

  const status = needsApproval?.value === '1' ? 'pending' : 'published';

  const result = await env.DB.prepare(`
    INSERT INTO reviews (user_id, tmdb_id, media_type, rating, title, body, contains_spoilers, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.id, tmdb_id, media_type, parseInt(rating),
    sanitizeText(title, 200), sanitizeText(reviewBody, 5000),
    contains_spoilers ? 1 : 0, status
  ).run();

  return jsonResponse({
    success: true,
    review_id: result.meta.last_row_id,
    status,
    message: status === 'pending' ? 'Review submitted for moderation' : 'Review published!'
  }, 201);
}

async function updateReview(request, env, reviewId) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const review = await env.DB.prepare(
    'SELECT * FROM reviews WHERE id = ?'
  ).bind(reviewId).first();

  if (!review) return jsonResponse({ error: 'Review not found' }, 404);
  if (review.user_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized to edit this review' }, 403);
  }

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid request body' }, 400);

  const { rating, title, reviewBody, contains_spoilers } = body;

  if (rating && (rating < 1 || rating > 10)) {
    return jsonResponse({ error: 'Rating must be between 1 and 10' }, 400);
  }

  await env.DB.prepare(`
    UPDATE reviews SET
      rating = COALESCE(?, rating),
      title = COALESCE(?, title),
      body = COALESCE(?, body),
      contains_spoilers = COALESCE(?, contains_spoilers),
      updated_at = unixepoch()
    WHERE id = ?
  `).bind(
    rating ? parseInt(rating) : null,
    title ? sanitizeText(title, 200) : null,
    reviewBody ? sanitizeText(reviewBody, 5000) : null,
    contains_spoilers !== undefined ? (contains_spoilers ? 1 : 0) : null,
    reviewId
  ).run();

  return jsonResponse({ success: true, message: 'Review updated' });
}

async function deleteReview(request, env, reviewId) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const review = await env.DB.prepare(
    'SELECT * FROM reviews WHERE id = ?'
  ).bind(reviewId).first();

  if (!review) return jsonResponse({ error: 'Review not found' }, 404);
  if (review.user_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized to delete this review' }, 403);
  }

  await env.DB.prepare(
    "UPDATE reviews SET status = 'deleted', updated_at = unixepoch() WHERE id = ?"
  ).bind(reviewId).run();

  return jsonResponse({ success: true, message: 'Review deleted' });
}

async function voteHelpful(request, env, reviewId) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'Sign in to vote' }, 401);

  const review = await env.DB.prepare(
    'SELECT * FROM reviews WHERE id = ? AND status = ?'
  ).bind(reviewId, 'published').first();

  if (!review) return jsonResponse({ error: 'Review not found' }, 404);
  if (review.user_id === user.id) {
    return jsonResponse({ error: 'You cannot vote on your own review' }, 400);
  }

  // Check existing vote
  const existing = await env.DB.prepare(
    'SELECT id, is_helpful FROM review_votes WHERE review_id = ? AND user_id = ?'
  ).bind(reviewId, user.id).first();

  if (existing) {
    // Toggle off
    await env.DB.prepare('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?').bind(reviewId, user.id).run();
    await env.DB.prepare(
      'UPDATE reviews SET helpful_count = MAX(0, helpful_count - 1) WHERE id = ?'
    ).bind(reviewId).run();
    return jsonResponse({ success: true, voted: false });
  }

  await env.DB.prepare(
    'INSERT INTO review_votes (review_id, user_id, is_helpful) VALUES (?, ?, 1)'
  ).bind(reviewId, user.id).run();

  await env.DB.prepare(
    'UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?'
  ).bind(reviewId).run();

  return jsonResponse({ success: true, voted: true });
}
