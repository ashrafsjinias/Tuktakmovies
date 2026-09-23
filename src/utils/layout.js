// HTML layout wrapper - base template for all pages

export function baseLayout({ head = '', body = '', user = null, bodyClass = '' }) {
  const userName = user?.display_name || user?.username || '';
  const isAdmin = user?.role === 'admin';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0f0f13">
  ${head}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
</head>
<body class="${bodyClass}">

<a class="skip-link" href="#main">Skip to main content</a>

<header class="site-header" id="site-header">
  <nav class="nav-container">
    <a href="/" class="site-logo" aria-label="TuktakMovies Home">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#e84b1e"/>
        <path d="M8 10h6l4 6 4-6h2v12h-2v-8l-4 6-4-6v8H8V10z" fill="white"/>
      </svg>
      <span class="logo-text">Tuktak<em>Movies</em></span>
    </a>

    <div class="nav-search-wrapper" role="search">
      <form action="/search" method="get" class="nav-search-form" id="nav-search-form">
        <input
          type="search"
          name="q"
          placeholder="Search movies, TV shows, people…"
          class="nav-search-input"
          id="nav-search-input"
          autocomplete="off"
          aria-label="Search movies and TV shows"
          minlength="2"
          maxlength="100"
        >
        <button type="submit" class="nav-search-btn" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </form>
      <div class="search-autocomplete" id="search-autocomplete" aria-live="polite"></div>
    </div>

    <div class="nav-links">
      <a href="/movies" class="nav-link">Movies</a>
      <a href="/tv" class="nav-link">TV Shows</a>
      <a href="/genres" class="nav-link">Genres</a>
      ${user ? `
        <div class="nav-user-menu" id="user-menu">
          <button class="nav-user-btn" id="user-menu-btn" aria-expanded="false" aria-haspopup="true">
            <div class="user-avatar-sm">${(userName[0] || 'U').toUpperCase()}</div>
            <span class="user-name-sm">${sanitize(userName)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="nav-dropdown" id="user-dropdown" role="menu">
            <a href="/profile" class="dropdown-item" role="menuitem">My Profile</a>
            <a href="/watchlist" class="dropdown-item" role="menuitem">Watchlist</a>
            <a href="/favorites" class="dropdown-item" role="menuitem">Favorites</a>
            <a href="/my-reviews" class="dropdown-item" role="menuitem">My Reviews</a>
            ${isAdmin ? '<a href="/admin" class="dropdown-item dropdown-item--admin" role="menuitem">Admin Panel</a>' : ''}
            <hr class="dropdown-divider">
            <a href="/settings" class="dropdown-item" role="menuitem">Settings</a>
            <form method="post" action="/api/auth/logout" class="dropdown-form">
              <button type="submit" class="dropdown-item dropdown-item--danger" role="menuitem">Sign Out</button>
            </form>
          </div>
        </div>
      ` : `
        <a href="/login" class="nav-link nav-link--login">Sign In</a>
        <a href="/register" class="btn btn--primary btn--sm">Join Free</a>
      `}
    </div>

    <button class="nav-mobile-toggle" id="nav-mobile-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Toggle navigation">
      <span></span><span></span><span></span>
    </button>
  </nav>

  <div class="mobile-nav" id="mobile-nav" hidden>
    <div class="mobile-nav-inner">
      <form action="/search" method="get" class="mobile-search-form">
        <input type="search" name="q" placeholder="Search…" class="mobile-search-input" aria-label="Search">
        <button type="submit" class="mobile-search-btn" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </form>
      <nav class="mobile-nav-links" aria-label="Mobile navigation">
        <a href="/movies" class="mobile-nav-link">Movies</a>
        <a href="/tv" class="mobile-nav-link">TV Shows</a>
        <a href="/genres" class="mobile-nav-link">Genres</a>
        ${user ? `
          <a href="/profile" class="mobile-nav-link">My Profile</a>
          <a href="/watchlist" class="mobile-nav-link">Watchlist</a>
          <a href="/favorites" class="mobile-nav-link">Favorites</a>
          <a href="/my-reviews" class="mobile-nav-link">My Reviews</a>
          ${isAdmin ? '<a href="/admin" class="mobile-nav-link mobile-nav-link--admin">Admin Panel</a>' : ''}
          <a href="/settings" class="mobile-nav-link">Settings</a>
          <form method="post" action="/api/auth/logout">
            <button type="submit" class="mobile-nav-link mobile-nav-link--signout">Sign Out</button>
          </form>
        ` : `
          <a href="/login" class="mobile-nav-link">Sign In</a>
          <a href="/register" class="mobile-nav-link mobile-nav-link--join">Join Free</a>
        `}
      </nav>
    </div>
  </div>
</header>

<main id="main" ${bodyClass ? '' : ''}>
  ${body}
</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="/" class="footer-logo">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#e84b1e"/>
          <path d="M8 10h6l4 6 4-6h2v12h-2v-8l-4 6-4-6v8H8V10z" fill="white"/>
        </svg>
        <span>TuktakMovies</span>
      </a>
      <p class="footer-tagline">Discover. Watch. Review.</p>
    </div>

    <div class="footer-nav-groups">
      <div class="footer-nav-group">
        <h3>Discover</h3>
        <a href="/movies">Movies</a>
        <a href="/tv">TV Shows</a>
        <a href="/genres">Browse Genres</a>
        <a href="/trending">Trending</a>
        <a href="/top-rated">Top Rated</a>
      </div>
      <div class="footer-nav-group">
        <h3>Account</h3>
        ${user ? `
          <a href="/profile">My Profile</a>
          <a href="/watchlist">Watchlist</a>
          <a href="/favorites">Favorites</a>
          <a href="/my-reviews">My Reviews</a>
        ` : `
          <a href="/register">Create Account</a>
          <a href="/login">Sign In</a>
        `}
      </div>
      <div class="footer-nav-group">
        <h3>Info</h3>
        <a href="/about">About</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/sitemap.xml">Sitemap</a>
      </div>
    </div>
  </div>

  <div class="footer-bottom">
    <p>&copy; ${new Date().getFullYear()} TuktakMovies. Movie data provided by <a href="https://www.themoviedb.org" rel="noopener noreferrer" target="_blank">TMDB</a>.</p>
    <p class="footer-disclaimer">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </div>
</footer>

<div id="toast-container" class="toast-container" aria-live="assertive" aria-atomic="true"></div>

<script src="/js/main.js" defer></script>
</body>
</html>`;
}

function sanitize(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Movie card component
export function movieCard(movie, mediaType = 'movie', opts = {}) {
  const title = movie.title || movie.name || 'Unknown';
  const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
    : '/images/no-poster.svg';
  const url = `/${mediaType}/${movie.id}`;
  const ratingClass = rating >= 7 ? 'high' : rating >= 5 ? 'mid' : 'low';

  return `
    <article class="movie-card ${opts.featured ? 'movie-card--featured' : ''}" data-id="${movie.id}" data-type="${mediaType}">
      <a href="${url}" class="movie-card-link" aria-label="${sanitize(title)} (${year})">
        <div class="movie-card-poster">
          <img
            src="${posterUrl}"
            alt="${sanitize(title)} poster"
            loading="lazy"
            width="342"
            height="513"
            class="movie-poster-img"
          >
          <div class="movie-card-overlay">
            <span class="overlay-play" aria-hidden="true">▶</span>
            <span class="overlay-cta">View Details</span>
          </div>
          <div class="movie-rating rating--${ratingClass}" aria-label="Rating: ${rating}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${rating}
          </div>
          ${opts.showListBtns ? `
            <div class="movie-card-actions" aria-label="Quick actions">
              <button class="card-action-btn" data-action="watchlist" data-id="${movie.id}" data-type="${mediaType}" title="Add to Watchlist" aria-label="Add to Watchlist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button class="card-action-btn" data-action="favorite" data-id="${movie.id}" data-type="${mediaType}" title="Add to Favorites" aria-label="Add to Favorites">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>
          ` : ''}
        </div>
        <div class="movie-card-info">
          <h3 class="movie-card-title">${sanitize(title)}</h3>
          <div class="movie-card-meta">
            ${year ? `<span class="movie-year">${year}</span>` : ''}
            ${movie.genre_ids?.length ? `<span class="movie-genre-dot" aria-hidden="true">·</span>` : ''}
          </div>
        </div>
      </a>
    </article>
  `;
}

// Star rating display
export function starRating(rating, maxRating = 10) {
  const percentage = (rating / maxRating) * 100;
  return `
    <div class="star-rating" aria-label="Rating: ${rating} out of ${maxRating}">
      <div class="stars-bg" aria-hidden="true">★★★★★</div>
      <div class="stars-fill" style="width: ${percentage}%" aria-hidden="true">★★★★★</div>
    </div>
  `;
}

// Pagination component
export function pagination(currentPage, totalPages, baseUrl) {
  if (totalPages <= 1) return '';

  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  if (start > 1) {
    pages.push(`<a href="${baseUrl}&page=1" class="page-link">1</a>`);
    if (start > 2) pages.push('<span class="page-ellipsis">…</span>');
  }

  for (let i = start; i <= end; i++) {
    if (i === currentPage) {
      pages.push(`<span class="page-link page-link--active" aria-current="page">${i}</span>`);
    } else {
      pages.push(`<a href="${baseUrl}&page=${i}" class="page-link">${i}</a>`);
    }
  }

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push('<span class="page-ellipsis">…</span>');
    pages.push(`<a href="${baseUrl}&page=${totalPages}" class="page-link">${totalPages}</a>`);
  }

  return `
    <nav class="pagination" aria-label="Page navigation">
      ${currentPage > 1 ? `<a href="${baseUrl}&page=${currentPage - 1}" class="page-link page-link--prev" aria-label="Previous page">← Prev</a>` : ''}
      <div class="page-numbers">${pages.join('')}</div>
      ${currentPage < totalPages ? `<a href="${baseUrl}&page=${currentPage + 1}" class="page-link page-link--next" aria-label="Next page">Next →</a>` : ''}
    </nav>
  `;
}

// Review card component
export function reviewCard(review, showMovie = false) {
  const stars = review.rating ? Math.round(review.rating / 2) : 0;
  const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);

  return `
    <article class="review-card" id="review-${review.id}">
      <div class="review-header">
        <div class="reviewer-info">
          <div class="reviewer-avatar">${(review.username || 'A')[0].toUpperCase()}</div>
          <div>
            <a href="/user/${sanitize(review.username)}" class="reviewer-name">${sanitize(review.display_name || review.username)}</a>
            <time class="review-date" datetime="${new Date(review.created_at * 1000).toISOString()}" title="${new Date(review.created_at * 1000).toLocaleDateString()}">
              ${timeAgo(review.created_at)}
            </time>
          </div>
        </div>
        <div class="review-rating-display">
          <span class="review-stars" aria-label="${review.rating}/10 stars">${starStr}</span>
          <span class="review-score">${review.rating}<span class="review-score-max">/10</span></span>
        </div>
      </div>
      ${review.contains_spoilers ? '<div class="spoiler-warning">⚠️ Contains spoilers</div>' : ''}
      ${review.title ? `<h4 class="review-title">${sanitize(review.title)}</h4>` : ''}
      <div class="review-body">${sanitize(review.body)}</div>
      <div class="review-footer">
        <button class="helpful-btn" data-review-id="${review.id}" aria-label="Mark as helpful">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          Helpful (${review.helpful_count || 0})
        </button>
      </div>
    </article>
  `;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
