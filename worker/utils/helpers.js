// General utilities, rate limiting, validation

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers
    }
  });
}

export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

// Rate limiting using D1
export async function checkRateLimit(env, key, limit = 60, windowSeconds = 60) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    const existing = await env.DB.prepare(
      'SELECT count, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first();

    if (!existing || existing.window_start < windowStart) {
      // New window
      await env.DB.prepare(
        'INSERT OR REPLACE INTO rate_limits (key, count, window_start, updated_at) VALUES (?, 1, ?, ?)'
      ).bind(key, now, now).run();
      return { allowed: true, remaining: limit - 1 };
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    await env.DB.prepare(
      'UPDATE rate_limits SET count = count + 1, updated_at = ? WHERE key = ?'
    ).bind(now, key).run();

    return { allowed: true, remaining: limit - existing.count - 1 };
  } catch {
    return { allowed: true, remaining: limit }; // Fail open
  }
}

// Input validation
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

export function sanitizeText(text, maxLength = 5000) {
  if (!text) return '';
  return String(text).trim().substring(0, maxLength);
}

export function sanitizeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
         '0.0.0.0';
}

// Parse JSON body safely
export async function parseJsonBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Parse form body
export async function parseFormBody(request) {
  try {
    const formData = await request.formData();
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    return data;
  } catch {
    return null;
  }
}

// Generate pagination metadata
export function paginate(total, page, perPage = 20) {
  const totalPages = Math.ceil(total / perPage);
  return {
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1
  };
}

// Format date
export function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// CORS headers for API routes
export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// Cache control headers
export function cacheHeaders(seconds = 300) {
  return {
    'Cache-Control': `public, max-age=${seconds}, s-maxage=${seconds}`,
    'Vary': 'Accept-Encoding'
  };
}

// SEO helpers
export function generateMetaTags({ title, description, image, url, type = 'website', siteName = 'TuktakMovies' }) {
  const safeTitle = sanitizeHtml(title);
  const safeDesc = sanitizeHtml(description);
  const safeImage = image || 'https://tuktakmovies.online/images/og-default.jpg';
  const safeUrl = url || 'https://tuktakmovies.online';

  return `
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}">
    <link rel="canonical" href="${safeUrl}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDesc}">
    <meta property="og:image" content="${safeImage}">
    <meta property="og:url" content="${safeUrl}">
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="${siteName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDesc}">
    <meta name="twitter:image" content="${safeImage}">
  `.trim();
}
