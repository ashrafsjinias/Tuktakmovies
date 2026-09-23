// User profile, auth, watchlist, favorites pages

import { baseLayout, movieCard, reviewCard } from '../utils/layout.js';
import { htmlResponse, generateMetaTags, sanitizeHtml, redirect } from '../utils/helpers.js';
import { imgUrl } from '../utils/tmdb.js';

export async function renderLogin(request, env, user) {
  if (user) return redirect('/');

  const url = new URL(request.url);
  const returnUrl = sanitizeHtml(url.searchParams.get('return') || '/');
  const registered = url.searchParams.get('registered') === '1';

  const head = generateMetaTags({
    title: 'Sign In – TuktakMovies',
    description: 'Sign in to your TuktakMovies account',
    url: 'https://tuktakmovies.online/login'
  });

  const body = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <a href="/" class="auth-logo" aria-label="TuktakMovies">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#e84b1e"/><path d="M8 10h6l4 6 4-6h2v12h-2v-8l-4 6-4-6v8H8V10z" fill="white"/></svg>
          </a>
          <h1 class="auth-title">Welcome back</h1>
          <p class="auth-subtitle">Sign in to your TuktakMovies account</p>
        </div>

        ${registered ? `
          <div class="alert alert--success" role="alert">
            Account created successfully! Sign in below.
          </div>
        ` : ''}

        <form class="auth-form" id="login-form" novalidate>
          <input type="hidden" name="return_url" value="${returnUrl}">

          <div class="form-group">
            <label class="form-label" for="email">Email or Username</label>
            <input
              type="text"
              id="email"
              name="email"
              autocomplete="username"
              required
              class="form-input"
              placeholder="you@example.com"
              autofocus
            >
          </div>

          <div class="form-group">
            <label class="form-label" for="password">
              Password
              <a href="/forgot-password" class="label-link">Forgot?</a>
            </label>
            <div class="input-with-toggle">
              <input
                type="password"
                id="password"
                name="password"
                autocomplete="current-password"
                required
                minlength="8"
                class="form-input"
                placeholder="Your password"
              >
              <button type="button" class="password-toggle" aria-label="Toggle password visibility" tabindex="-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <div class="form-message" id="login-message" aria-live="polite"></div>

          <button type="submit" class="btn btn--primary btn--full" id="login-submit">
            Sign In
          </button>
        </form>

        <p class="auth-footer">
          Don't have an account? <a href="/register">Create one free</a>
        </p>
      </div>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, bodyClass: 'auth-layout' }));
}

export async function renderRegister(request, env, user) {
  if (user) return redirect('/');

  const regEnabled = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'registration_enabled'"
  ).first();

  if (regEnabled?.value === '0') {
    return htmlResponse(baseLayout({
      head: '<title>Registration Disabled – TuktakMovies</title>',
      body: `<div class="container error-page"><h1>Registration Temporarily Disabled</h1><p>New registrations are currently not available. Please check back later.</p></div>`
    }));
  }

  const head = generateMetaTags({
    title: 'Create Account – TuktakMovies',
    description: 'Join TuktakMovies to rate movies, write reviews, and build your watchlist',
    url: 'https://tuktakmovies.online/register'
  });

  const body = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <a href="/" class="auth-logo" aria-label="TuktakMovies">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#e84b1e"/><path d="M8 10h6l4 6 4-6h2v12h-2v-8l-4 6-4-6v8H8V10z" fill="white"/></svg>
          </a>
          <h1 class="auth-title">Join TuktakMovies</h1>
          <p class="auth-subtitle">Free forever. No credit card required.</p>
        </div>

        <form class="auth-form" id="register-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="display_name">Display Name</label>
            <input
              type="text"
              id="display_name"
              name="display_name"
              maxlength="50"
              class="form-input"
              placeholder="How you'll appear to others"
            >
          </div>

          <div class="form-group">
            <label class="form-label" for="username">
              Username <span class="label-required" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="username"
              name="username"
              pattern="[a-zA-Z0-9_]{3,30}"
              minlength="3"
              maxlength="30"
              required
              autocomplete="username"
              class="form-input"
              placeholder="3-30 chars, letters/numbers/underscores"
            >
            <span class="form-hint">@<span id="username-preview"></span></span>
          </div>

          <div class="form-group">
            <label class="form-label" for="email">
              Email <span class="label-required" aria-hidden="true">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autocomplete="email"
              class="form-input"
              placeholder="you@example.com"
            >
          </div>

          <div class="form-group">
            <label class="form-label" for="password">
              Password <span class="label-required" aria-hidden="true">*</span>
            </label>
            <div class="input-with-toggle">
              <input
                type="password"
                id="password"
                name="password"
                required
                minlength="8"
                maxlength="128"
                autocomplete="new-password"
                class="form-input"
                placeholder="At least 8 characters"
              >
              <button type="button" class="password-toggle" aria-label="Toggle password visibility" tabindex="-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            <div class="password-strength" id="password-strength" aria-live="polite"></div>
          </div>

          <div class="form-group form-group--check">
            <label class="checkbox-label">
              <input type="checkbox" name="terms" required>
              <span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a></span>
            </label>
          </div>

          <div class="form-message" id="register-message" aria-live="polite"></div>

          <button type="submit" class="btn btn--primary btn--full" id="register-submit">
            Create Account
          </button>
        </form>

        <p class="auth-footer">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, bodyClass: 'auth-layout' }));
}

export async function renderUserList(request, env, user, listType) {
  if (!user) return redirect('/login?return=' + encodeURIComponent(request.url));

  const listTitles = {
    watchlist: 'My Watchlist',
    favorites: 'My Favorites',
    watched: 'Already Watched'
  };

  const dbListType = listType === 'favorites' ? 'favorite' : listType;
  const title = listTitles[listType] || 'My List';

  const page = parseInt(new URL(request.url).searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const [items, count] = await Promise.all([
    env.DB.prepare(`
      SELECT ul.*, mc.title, mc.poster_path, mc.backdrop_path,
             mc.overview, mc.release_date, mc.vote_average
      FROM user_lists ul
      LEFT JOIN movie_cache mc ON ul.tmdb_id = mc.tmdb_id AND ul.media_type = mc.media_type
      WHERE ul.user_id = ? AND ul.list_type = ?
      ORDER BY ul.added_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, dbListType, perPage, offset).all(),

    env.DB.prepare(
      'SELECT COUNT(*) as total FROM user_lists WHERE user_id = ? AND list_type = ?'
    ).bind(user.id, dbListType).first()
  ]);

  const total = count?.total || 0;

  const head = generateMetaTags({
    title: `${title} – TuktakMovies`,
    description: `${user.display_name || user.username}'s ${title.toLowerCase()} on TuktakMovies`,
    url: `https://tuktakmovies.online/${listType}`
  });

  const body = `
    <div class="container page-container">
      <div class="page-header">
        <h1 class="page-title">${title}</h1>
        <p class="page-subtitle">${total} ${total === 1 ? 'title' : 'titles'}</p>
      </div>

      <nav class="filter-tabs" aria-label="Your lists">
        <a href="/watchlist" class="filter-tab ${listType === 'watchlist' ? 'filter-tab--active' : ''}">Watchlist</a>
        <a href="/favorites" class="filter-tab ${listType === 'favorites' ? 'filter-tab--active' : ''}">Favorites</a>
        <a href="/watched" class="filter-tab ${listType === 'watched' ? 'filter-tab--active' : ''}">Watched</a>
      </nav>

      ${total === 0 ? `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">${listType === 'favorites' ? '❤️' : listType === 'watched' ? '✅' : '🎬'}</div>
          <h2>Your ${title.toLowerCase()} is empty</h2>
          <p>Browse movies and add them to your ${listType.toLowerCase()}.</p>
          <a href="/movies" class="btn btn--primary">Browse Movies</a>
        </div>
      ` : `
        <div class="movies-grid" role="list">
          ${items.results.map(item => {
            // Build a movie object from cached data
            const movie = {
              id: item.tmdb_id,
              title: item.title || 'Unknown Title',
              poster_path: item.poster_path,
              backdrop_path: item.backdrop_path,
              overview: item.overview,
              release_date: item.release_date,
              vote_average: item.vote_average
            };
            return movieCard(movie, item.media_type, { showListBtns: true });
          }).join('')}
        </div>
        ${total > perPage ? `
          <nav class="pagination" aria-label="Page navigation">
            ${page > 1 ? `<a href="/${listType}?page=${page - 1}" class="page-link">← Prev</a>` : ''}
            <span class="page-info">Page ${page} of ${Math.ceil(total / perPage)}</span>
            ${page < Math.ceil(total / perPage) ? `<a href="/${listType}?page=${page + 1}" class="page-link">Next →</a>` : ''}
          </nav>
        ` : ''}
      `}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}

export async function renderMyReviews(request, env, user) {
  if (!user) return redirect('/login');

  const page = parseInt(new URL(request.url).searchParams.get('page') || '1');
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const [reviews, count] = await Promise.all([
    env.DB.prepare(`
      SELECT r.*, mc.title as movie_title, mc.poster_path
      FROM reviews r
      LEFT JOIN movie_cache mc ON r.tmdb_id = mc.tmdb_id AND r.media_type = mc.media_type
      WHERE r.user_id = ? AND r.status != 'deleted'
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, perPage, offset).all(),

    env.DB.prepare(
      "SELECT COUNT(*) as total FROM reviews WHERE user_id = ? AND status != 'deleted'"
    ).bind(user.id).first()
  ]);

  const total = count?.total || 0;

  const head = generateMetaTags({
    title: 'My Reviews – TuktakMovies',
    url: 'https://tuktakmovies.online/my-reviews'
  });

  const body = `
    <div class="container page-container">
      <h1 class="page-title">My Reviews</h1>

      ${total === 0 ? `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">✏️</div>
          <h2>No reviews yet</h2>
          <p>Start watching and reviewing movies to see them here.</p>
          <a href="/movies" class="btn btn--primary">Find Something to Watch</a>
        </div>
      ` : `
        <div class="reviews-full-list">
          ${reviews.results.map(review => `
            <article class="review-list-item">
              <div class="review-movie-info">
                ${review.poster_path ? `
                  <a href="/${review.media_type}/${review.tmdb_id}" class="review-movie-poster-link">
                    <img src="https://image.tmdb.org/t/p/w92${review.poster_path}" alt="${sanitizeHtml(review.movie_title || '')}" width="46" height="69" loading="lazy" class="review-movie-thumb">
                  </a>
                ` : ''}
                <div>
                  <a href="/${review.media_type}/${review.tmdb_id}" class="review-movie-title">${sanitizeHtml(review.movie_title || 'Unknown Title')}</a>
                  <div class="review-rating-small">
                    ${'★'.repeat(Math.round(review.rating / 2))}${'☆'.repeat(5 - Math.round(review.rating / 2))}
                    <span>${review.rating}/10</span>
                  </div>
                </div>
              </div>
              ${review.title ? `<h3 class="review-title">${sanitizeHtml(review.title)}</h3>` : ''}
              <p class="review-preview">${sanitizeHtml(review.body.substring(0, 200))}${review.body.length > 200 ? '…' : ''}</p>
              <div class="review-list-footer">
                <span class="review-status review-status--${review.status}">${review.status}</span>
                <span class="review-date">${new Date(review.created_at * 1000).toLocaleDateString()}</span>
                <div class="review-actions">
                  <a href="/${review.media_type}/${review.tmdb_id}#review-${review.id}" class="btn btn--ghost btn--xs">View</a>
                  <button class="btn btn--ghost btn--xs" data-edit-review="${review.id}">Edit</button>
                  <button class="btn btn--danger btn--xs" data-delete-review="${review.id}">Delete</button>
                </div>
              </div>
            </article>
          `).join('')}
        </div>
      `}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}

export async function renderProfile(request, env, user) {
  if (!user) return redirect('/login');

  const [reviewCount, listCounts] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as total FROM reviews WHERE user_id = ? AND status = 'published'").bind(user.id).first(),
    env.DB.prepare(`
      SELECT list_type, COUNT(*) as count
      FROM user_lists WHERE user_id = ?
      GROUP BY list_type
    `).bind(user.id).all()
  ]);

  const listCountMap = {};
  for (const item of listCounts.results) {
    listCountMap[item.list_type] = item.count;
  }

  const head = generateMetaTags({
    title: `${user.display_name || user.username}'s Profile – TuktakMovies`,
    url: `https://tuktakmovies.online/profile`
  });

  const body = `
    <div class="container page-container">
      <div class="profile-layout">
        <aside class="profile-sidebar">
          <div class="profile-avatar-lg">
            ${user.avatar_url
              ? `<img src="${sanitizeHtml(user.avatar_url)}" alt="${sanitizeHtml(user.display_name || user.username)}" class="avatar-img">`
              : `<div class="avatar-placeholder">${(user.display_name || user.username || 'U')[0].toUpperCase()}</div>`
            }
          </div>
          <h1 class="profile-name">${sanitizeHtml(user.display_name || user.username)}</h1>
          <p class="profile-username">@${sanitizeHtml(user.username)}</p>

          <div class="profile-stats">
            <div class="profile-stat">
              <span class="stat-value">${reviewCount?.total || 0}</span>
              <span class="stat-label">Reviews</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${listCountMap.watchlist || 0}</span>
              <span class="stat-label">Watchlist</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${listCountMap.favorite || 0}</span>
              <span class="stat-label">Favorites</span>
            </div>
            <div class="profile-stat">
              <span class="stat-value">${listCountMap.watched || 0}</span>
              <span class="stat-label">Watched</span>
            </div>
          </div>

          <a href="/settings" class="btn btn--outline btn--full">Edit Profile</a>
        </aside>

        <div class="profile-main">
          <div class="profile-quick-nav">
            <a href="/watchlist" class="profile-quick-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              Watchlist
              <span class="quick-link-count">${listCountMap.watchlist || 0}</span>
            </a>
            <a href="/favorites" class="profile-quick-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              Favorites
              <span class="quick-link-count">${listCountMap.favorite || 0}</span>
            </a>
            <a href="/my-reviews" class="profile-quick-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              My Reviews
              <span class="quick-link-count">${reviewCount?.total || 0}</span>
            </a>
            <a href="/settings" class="profile-quick-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Settings
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}

export async function renderSettings(request, env, user) {
  if (!user) return redirect('/login');

  const fullUser = await env.DB.prepare(
    'SELECT id, username, email, display_name, bio FROM users WHERE id = ?'
  ).bind(user.id).first();

  const head = generateMetaTags({
    title: 'Account Settings – TuktakMovies',
    url: 'https://tuktakmovies.online/settings'
  });

  const body = `
    <div class="container page-container page-container--narrow">
      <h1 class="page-title">Account Settings</h1>

      <div class="settings-card">
        <h2 class="settings-section-title">Profile Information</h2>
        <form id="profile-form" class="settings-form">
          <div class="form-group">
            <label class="form-label" for="display_name">Display Name</label>
            <input type="text" id="display_name" name="display_name" maxlength="50" class="form-input"
              value="${sanitizeHtml(fullUser?.display_name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label" for="bio">Bio</label>
            <textarea id="bio" name="bio" rows="3" maxlength="500" class="form-textarea"
              placeholder="Tell us about yourself…">${sanitizeHtml(fullUser?.bio || '')}</textarea>
          </div>
          <div class="form-message" id="profile-message" aria-live="polite"></div>
          <button type="submit" class="btn btn--primary">Save Changes</button>
        </form>
      </div>

      <div class="settings-card">
        <h2 class="settings-section-title">Account</h2>
        <div class="settings-info-row">
          <span class="settings-info-label">Username</span>
          <span class="settings-info-value">@${sanitizeHtml(fullUser?.username || '')}</span>
        </div>
        <div class="settings-info-row">
          <span class="settings-info-label">Email</span>
          <span class="settings-info-value">${sanitizeHtml(fullUser?.email || '')}</span>
        </div>
      </div>

      <div class="settings-card">
        <h2 class="settings-section-title">Change Password</h2>
        <form id="password-form" class="settings-form">
          <div class="form-group">
            <label class="form-label" for="current_password">Current Password</label>
            <input type="password" id="current_password" name="current_password" required class="form-input" autocomplete="current-password">
          </div>
          <div class="form-group">
            <label class="form-label" for="new_password">New Password</label>
            <input type="password" id="new_password" name="new_password" required minlength="8" class="form-input" autocomplete="new-password">
          </div>
          <div class="form-message" id="password-message" aria-live="polite"></div>
          <button type="submit" class="btn btn--primary">Update Password</button>
        </form>
      </div>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}
