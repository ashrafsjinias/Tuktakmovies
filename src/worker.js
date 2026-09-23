// TuktakMovies – Main Cloudflare Worker Entry Point

import { getSessionUser } from './utils/auth.js';
import { htmlResponse, jsonResponse, redirect, getClientIP, generateMetaTags, sanitizeHtml } from './utils/helpers.js';
import { baseLayout } from './utils/layout.js';
import { handleAuthRoutes } from './api/auth.js';
import { handleReviewRoutes } from './api/reviews.js';
import { handleListRoutes } from './api/lists.js';
import { handleAdminRoutes } from './api/admin.js';
import { renderHome } from './pages/home.js';
import { renderMovieDetail } from './pages/movie-detail.js';
import {
  renderSearch, renderBrowseMovies, renderBrowseTV,
  renderTrending, renderGenre, renderGenreList, renderTopRated
} from './pages/browse.js';
import {
  renderLogin, renderRegister, renderUserList,
  renderMyReviews, renderProfile, renderSettings
} from './pages/user.js';
import { renderAdminPanel, renderPersonDetail } from './pages/admin.js';

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title></head><body style="background:#0f0f13;color:#f0f0f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center"><div><h1 style="font-size:4rem;color:#2a2a38">500</h1><h2>Something went wrong</h2><p style="color:#70708a">Please try again in a moment.</p><a href="/" style="color:#e84b1e">Go Home</a></div></body></html>`,
        { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': url.origin, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }

  // Serve static assets (CSS, JS, images, favicon, etc.) through Cloudflare Workers Assets.
  // This must run before database/session/page handling so asset requests are not treated as HTML routes.
  if (env.ASSETS && (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/images/') || pathname === '/favicon.ico' || pathname === '/manifest.json')) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      const headers = new Headers(assetResponse.headers);
      for (const [k, v] of Object.entries(securityHeaders)) headers.set(k, v);
      if (pathname.startsWith('/css/')) headers.set('Content-Type', 'text/css; charset=utf-8');
      else if (pathname.startsWith('/js/')) headers.set('Content-Type', 'application/javascript; charset=utf-8');
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }
  }

  // Maintenance mode
  if (env.DB) {
    try {
      const m = await env.DB.prepare("SELECT value FROM settings WHERE key='maintenance_mode'").first();
      if (m?.value === '1' && !pathname.startsWith('/admin') && !pathname.startsWith('/api/auth')) {
        return new Response(maintenancePage(), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600' } });
      }
    } catch {}
  }

  const user = env.DB ? await getSessionUser(request, env) : null;

  // Static
  if (pathname === '/robots.txt') return robotsTxt();
  if (pathname === '/sitemap.xml') return sitemapXml(env);
  if (pathname === '/manifest.json') return manifestJson();

  // API
  if (pathname.startsWith('/api/')) {
    let res = await handleAuthRoutes(request, env, pathname);
    if (res) return addHeaders(res, securityHeaders);

    res = await handleReviewRoutes(request, env, pathname);
    if (res) return addHeaders(res, securityHeaders);

    res = await handleListRoutes(request, env, pathname);
    if (res) return addHeaders(res, securityHeaders);

    if (pathname.startsWith('/api/admin/')) {
      res = await handleAdminRoutes(request, env, pathname);
      if (res) return addHeaders(res, securityHeaders);
    }

    if (pathname === '/api/user/profile' && method === 'PUT') return addHeaders(await handleProfileUpdate(request, env, user), securityHeaders);
    if (pathname === '/api/search/autocomplete') return addHeaders(await handleAutocomplete(request, env), securityHeaders);
    if (pathname === '/api/trending') return addHeaders(await handleTrendingAPI(request, env, user), securityHeaders);

    return addHeaders(jsonResponse({ error: 'Not found' }, 404), securityHeaders);
  }

  // Pages
  let response;
  try {
    if (pathname === '/') response = await renderHome(request, env, user);
    else if (pathname === '/search') response = await renderSearch(request, env, user);
    else if (pathname === '/movies') response = await renderBrowseMovies(request, env, user);
    else if (pathname === '/tv') response = await renderBrowseTV(request, env, user);
    else if (pathname === '/trending') response = await renderTrending(request, env, user);
    else if (pathname === '/top-rated') response = await renderTopRated(request, env, user);
    else if (pathname === '/genres') response = await renderGenreList(request, env, user);
    else if (/^\/genre\/\d+$/.test(pathname)) response = await renderGenre(request, env, user, pathname.split('/')[2]);
    else if (/^\/movie\/\d+$/.test(pathname)) response = await renderMovieDetail(request, env, user, pathname.split('/')[2], 'movie');
    else if (/^\/tv\/\d+$/.test(pathname)) response = await renderMovieDetail(request, env, user, pathname.split('/')[2], 'tv');
    else if (/^\/person\/\d+$/.test(pathname)) response = await renderPersonDetail(request, env, user, pathname.split('/')[2]);
    else if (pathname === '/login') response = await renderLogin(request, env, user);
    else if (pathname === '/register') response = await renderRegister(request, env, user);
    else if (pathname === '/profile') response = await renderProfile(request, env, user);
    else if (pathname === '/settings') response = await renderSettings(request, env, user);
    else if (pathname === '/watchlist') response = await renderUserList(request, env, user, 'watchlist');
    else if (pathname === '/favorites') response = await renderUserList(request, env, user, 'favorites');
    else if (pathname === '/watched') response = await renderUserList(request, env, user, 'watched');
    else if (pathname === '/my-reviews') response = await renderMyReviews(request, env, user);
    else if (pathname === '/admin' || pathname.startsWith('/admin/')) response = await renderAdminPanel(request, env, user);
    else if (pathname === '/about') response = renderStaticPage('About TuktakMovies', aboutContent(), user);
    else if (pathname === '/privacy') response = renderStaticPage('Privacy Policy', privacyContent(), user);
    else if (pathname === '/terms') response = renderStaticPage('Terms of Service', termsContent(), user);
    else response = render404(user);
  } catch (e) {
    console.error(`Page error ${pathname}:`, e);
    response = render500(user);
  }

  if (response) {
    const h = new Headers(response.headers);
    for (const [k, v] of Object.entries(securityHeaders)) h.set(k, v);
    return new Response(response.body, { status: response.status, headers: h });
  }
  return render404(user);
}

async function handleAutocomplete(request, env) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return jsonResponse({ results: [] });
  try {
    const { searchMulti } = await import('./utils/tmdb.js');
    const data = await searchMulti(env, q, 1);
    const results = (data.results || []).slice(0, 8).map(item => ({
      id: item.id, title: item.title || item.name, media_type: item.media_type,
      year: (item.release_date || item.first_air_date || '').substring(0, 4),
      poster_path: item.poster_path, vote_average: item.vote_average
    }));
    return jsonResponse({ results }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch { return jsonResponse({ results: [] }); }
}

async function handleTrendingAPI(request, env, user) {
  const period = new URL(request.url).searchParams.get('period') || 'week';
  try {
    const { getTrending } = await import('./utils/tmdb.js');
    const { movieCard } = await import('./utils/layout.js');
    const data = await getTrending(env, period);
    const html = data.results.slice(0, 12).map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch { return new Response('', { headers: { 'Content-Type': 'text/html' } }); }
}

async function handleProfileUpdate(request, env, user) {
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
  try {
    const { parseJsonBody, sanitizeText } = await import('./utils/helpers.js');
    const body = await parseJsonBody(request);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);
    const { display_name, bio } = body;
    await env.DB.prepare(`UPDATE users SET display_name=COALESCE(?,display_name), bio=COALESCE(?,bio), updated_at=unixepoch() WHERE id=?`)
      .bind(display_name ? sanitizeText(display_name, 50) : null, bio !== undefined ? sanitizeText(bio || '', 500) : null, user.id).run();
    return jsonResponse({ success: true, message: 'Profile updated successfully' });
  } catch { return jsonResponse({ error: 'Failed to update profile' }, 500); }
}

function robotsTxt() {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /login\nDisallow: /register\nDisallow: /settings\nDisallow: /profile\nDisallow: /watchlist\nDisallow: /favorites\nDisallow: /watched\nDisallow: /my-reviews\n\nSitemap: https://tuktakmovies.online/sitemap.xml\nHost: https://tuktakmovies.online`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

async function sitemapXml(env) {
  const staticUrls = [
    { url: 'https://tuktakmovies.online/', priority: '1.0', changefreq: 'daily' },
    { url: 'https://tuktakmovies.online/movies', priority: '0.9', changefreq: 'daily' },
    { url: 'https://tuktakmovies.online/tv', priority: '0.9', changefreq: 'daily' },
    { url: 'https://tuktakmovies.online/trending', priority: '0.8', changefreq: 'daily' },
    { url: 'https://tuktakmovies.online/genres', priority: '0.7', changefreq: 'weekly' },
    { url: 'https://tuktakmovies.online/top-rated', priority: '0.7', changefreq: 'weekly' },
    { url: 'https://tuktakmovies.online/about', priority: '0.3', changefreq: 'monthly' },
  ];
  let movieUrls = [];
  if (env.DB) {
    try {
      const cached = await env.DB.prepare('SELECT tmdb_id, media_type FROM movie_cache ORDER BY cached_at DESC LIMIT 2000').all();
      movieUrls = cached.results.map(m => ({ url: `https://tuktakmovies.online/${m.media_type}/${m.tmdb_id}`, priority: '0.6', changefreq: 'weekly' }));
    } catch {}
  }
  const today = new Date().toISOString().split('T')[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...movieUrls].map(u => `  <url>\n    <loc>${u.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

function manifestJson() {
  return new Response(JSON.stringify({ name: 'TuktakMovies', short_name: 'TuktakMovies', description: 'Discover, Watch & Review Movies', start_url: '/', display: 'standalone', background_color: '#0f0f13', theme_color: '#e84b1e', icons: [{ src: '/images/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }),
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=86400' } });
}

function addHeaders(response, headers) {
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(response.body, { status: response.status, headers: h });
}

function render404(user) {
  return htmlResponse(baseLayout({ head: generateMetaTags({ title: 'Page Not Found – TuktakMovies', url: 'https://tuktakmovies.online' }), body: `<div class="container error-page"><div class="error-code" aria-hidden="true">404</div><h1 class="error-title">Page not found</h1><p class="error-desc">The page you're looking for doesn't exist.</p><div class="error-actions"><a href="/" class="btn btn--primary">Go Home</a><a href="/movies" class="btn btn--ghost">Browse Movies</a></div></div>`, user }), 404);
}

function render500(user) {
  return htmlResponse(baseLayout({ head: '<title>Error – TuktakMovies</title>', body: `<div class="container error-page"><div class="error-code" aria-hidden="true">500</div><h1 class="error-title">Something went wrong</h1><p class="error-desc">We hit a snag. Please try again.</p><a href="/" class="btn btn--primary">Go Home</a></div>`, user }), 500);
}

function renderStaticPage(title, content, user) {
  return htmlResponse(baseLayout({ head: generateMetaTags({ title: `${title} – TuktakMovies`, url: 'https://tuktakmovies.online' }), body: `<div class="container page-container page-container--narrow"><div class="static-content">${content}</div></div>`, user }));
}

function maintenancePage() { return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Maintenance – TuktakMovies</title><style>body{background:#0f0f13;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.i{max-width:480px;padding:2rem}</style></head><body><div class="i"><div style="font-size:2rem;color:#e84b1e;font-weight:700">🎬 TuktakMovies</div><h1>We'll be right back</h1><p style="color:#aaa">TuktakMovies is undergoing maintenance.</p></div></body></html>`; }

function aboutContent() { return `<h1>About TuktakMovies</h1><p>TuktakMovies is your ultimate destination for discovering movies and TV shows, reading genuine member reviews, and building your personal watchlist.</p><h2>Features</h2><p>Search millions of titles, watch trailers, explore cast and crew, write and read reviews, build watchlists and favorites, and discover content by genre and trending charts.</p><h2>Our Data</h2><p>Movie data is provided by <a href="https://www.themoviedb.org" rel="noopener noreferrer">The Movie Database (TMDB)</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>`; }

function privacyContent() { return `<h1>Privacy Policy</h1><p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p><h2>Data We Collect</h2><p>Account info (username, email, password hash), content you create (reviews, ratings, lists), and standard server logs.</p><h2>How We Use It</h2><p>To operate TuktakMovies and personalize your experience. We never sell your data.</p><h2>Cookies</h2><p>A single HttpOnly session cookie. No advertising or tracking cookies.</p><h2>Movie Data</h2><p>Provided by <a href="https://www.themoviedb.org" rel="noopener">TMDB</a>.</p>`; }

function termsContent() { return `<h1>Terms of Service</h1><p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p><h2>Usage</h2><p>By using TuktakMovies you agree to these terms.</p><h2>Content</h2><p>Reviews must be genuine. No spam, hate speech, or harassment. Violations may result in account suspension.</p><h2>Disclaimer</h2><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>`; }
