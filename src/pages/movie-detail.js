// Movie detail page

import { baseLayout, movieCard, reviewCard } from '../utils/layout.js';
import { htmlResponse, generateMetaTags, sanitizeHtml, formatDate } from '../utils/helpers.js';
import {
  getMovieDetails, imgUrl, backdropUrl, getTrailerKey,
  formatRuntime, formatCurrency, cacheMovieMetadata
} from '../utils/tmdb.js';

export async function renderMovieDetail(request, env, user, movieId, mediaType = 'movie') {
  const apiEndpoint = mediaType === 'tv' ? 'getTVDetails' : 'getMovieDetails';

  let movie;
  try {
    if (mediaType === 'tv') {
      const { getTVDetails } = await import('../utils/tmdb.js');
      movie = await getTVDetails(env, movieId);
    } else {
      movie = await getMovieDetails(env, movieId);
    }
  } catch (e) {
    return htmlResponse(baseLayout({
      head: '<title>Not Found – TuktakMovies</title>',
      body: `<div class="container error-page"><h1>Movie Not Found</h1><p>We couldn't find that movie.</p><a href="/" class="btn btn--primary">Go Home</a></div>`,
      user
    }), 404);
  }

  // Cache metadata in D1
  await cacheMovieMetadata(env, movie, mediaType);

  const title = movie.title || movie.name;
  const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
  const trailerKey = getTrailerKey(movie.videos);
  const director = movie.credits?.crew?.find(c => c.job === 'Director');
  const cast = movie.credits?.cast?.slice(0, 10) || [];
  const similar = (movie.similar?.results || movie.recommendations?.results || []).slice(0, 8);
  const userScore = movie.vote_average ? Math.round(movie.vote_average * 10) : 0;
  const ratingClass = movie.vote_average >= 7 ? 'high' : movie.vote_average >= 5 ? 'mid' : 'low';

  // Get site reviews
  let siteReviews = [];
  let siteAvgRating = null;
  try {
    const reviewData = await env.DB.prepare(`
      SELECT r.*, u.username, u.display_name
      FROM reviews r JOIN users u ON r.user_id = u.id
      WHERE r.tmdb_id = ? AND r.media_type = ? AND r.status = 'published'
      ORDER BY r.helpful_count DESC, r.created_at DESC LIMIT 5
    `).bind(movieId, mediaType).all();

    siteReviews = reviewData.results;

    const avgData = await env.DB.prepare(
      `SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE tmdb_id = ? AND media_type = ? AND status = 'published'`
    ).bind(movieId, mediaType).first();

    siteAvgRating = avgData?.avg ? Math.round(avgData.avg * 10) / 10 : null;
  } catch {}

  // Check user's list status
  let listStatus = { favorite: false, watchlist: false, watched: false };
  let userReview = null;
  if (user) {
    try {
      const lists = await env.DB.prepare(
        'SELECT list_type FROM user_lists WHERE user_id = ? AND tmdb_id = ? AND media_type = ?'
      ).bind(user.id, movieId, mediaType).all();
      for (const item of lists.results) listStatus[item.list_type] = true;

      userReview = await env.DB.prepare(
        "SELECT * FROM reviews WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND status != 'deleted'"
      ).bind(user.id, movieId, mediaType).first();
    } catch {}
  }

  // Structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": mediaType === 'tv' ? "TVSeries" : "Movie",
    "name": title,
    "description": movie.overview,
    "image": movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
    "datePublished": movie.release_date || movie.first_air_date,
    "genre": movie.genres?.map(g => g.name),
    ...(movie.vote_average ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": movie.vote_average.toFixed(1),
        "ratingCount": movie.vote_count,
        "bestRating": "10",
        "worstRating": "1"
      }
    } : {}),
    ...(director ? { "director": { "@type": "Person", "name": director.name } } : {})
  };

  const head = `
    ${generateMetaTags({
      title: `${title} (${year}) – TuktakMovies`,
      description: movie.overview ? movie.overview.substring(0, 155) : `Watch ${title} on TuktakMovies`,
      url: `https://tuktakmovies.online/${mediaType}/${movieId}`,
      image: movie.backdrop_path ? backdropUrl(movie.backdrop_path) : imgUrl(movie.poster_path),
      type: 'video.movie'
    })}
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  `;

  const body = `
    <!-- HERO BACKDROP -->
    <div class="detail-backdrop" aria-hidden="true">
      <img src="${backdropUrl(movie.backdrop_path)}" alt="" loading="eager" decoding="async" class="detail-backdrop-img">
      <div class="detail-backdrop-overlay"></div>
    </div>

    <div class="detail-page">
      <div class="container">

        <!-- BREADCRUMB -->
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden="true">›</span>
          <a href="/${mediaType === 'tv' ? 'tv' : 'movies'}">${mediaType === 'tv' ? 'TV Shows' : 'Movies'}</a>
          <span aria-hidden="true">›</span>
          <span aria-current="page">${sanitizeHtml(title)}</span>
        </nav>

        <!-- MAIN DETAIL -->
        <div class="detail-layout">
          <!-- POSTER -->
          <aside class="detail-poster-col">
            <div class="detail-poster-wrapper">
              <img
                src="${imgUrl(movie.poster_path, 'w500')}"
                alt="${sanitizeHtml(title)} poster"
                class="detail-poster-img"
                width="500"
                height="750"
                loading="eager"
              >
              ${trailerKey ? `
                <button class="poster-trailer-btn" data-trailer="${trailerKey}" aria-label="Watch trailer for ${sanitizeHtml(title)}">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Watch Trailer
                </button>
              ` : ''}
            </div>

            <!-- User action buttons -->
            <div class="detail-actions" role="group" aria-label="Add to your lists">
              <button
                class="action-btn ${listStatus.watchlist ? 'action-btn--active' : ''}"
                data-action="watchlist"
                data-id="${movieId}"
                data-type="${mediaType}"
                data-title="${sanitizeHtml(title)}"
                data-poster="${movie.poster_path || ''}"
                aria-label="${listStatus.watchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}"
                aria-pressed="${listStatus.watchlist}"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="${listStatus.watchlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                ${listStatus.watchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              <button
                class="action-btn ${listStatus.favorite ? 'action-btn--active action-btn--heart' : ''}"
                data-action="favorite"
                data-id="${movieId}"
                data-type="${mediaType}"
                data-title="${sanitizeHtml(title)}"
                data-poster="${movie.poster_path || ''}"
                aria-label="${listStatus.favorite ? 'Remove from Favorites' : 'Add to Favorites'}"
                aria-pressed="${listStatus.favorite}"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="${listStatus.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                ${listStatus.favorite ? 'Favorited' : 'Favorite'}
              </button>
              <button
                class="action-btn ${listStatus.watched ? 'action-btn--active' : ''}"
                data-action="watched"
                data-id="${movieId}"
                data-type="${mediaType}"
                data-title="${sanitizeHtml(title)}"
                data-poster="${movie.poster_path || ''}"
                aria-label="${listStatus.watched ? 'Remove from Watched' : 'Mark as Watched'}"
                aria-pressed="${listStatus.watched}"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" ${listStatus.watched ? 'fill="currentColor"' : ''}/></svg>
                ${listStatus.watched ? 'Watched' : 'Mark Watched'}
              </button>
            </div>
          </aside>

          <!-- DETAILS -->
          <div class="detail-main">
            <h1 class="detail-title">
              ${sanitizeHtml(title)}
              ${year ? `<span class="detail-year">(${year})</span>` : ''}
            </h1>

            <div class="detail-meta-row">
              ${movie.certification || movie.content_ratings?.results?.[0]?.rating_content_descriptors?.length ? `<span class="cert-badge">${movie.certification || 'NR'}</span>` : ''}
              ${movie.release_date ? `<span>${formatDate(movie.release_date)}</span>` : ''}
              ${movie.runtime ? `<span>${formatRuntime(movie.runtime)}</span>` : ''}
              ${movie.genres?.length ? `
                <div class="genre-tags">
                  ${movie.genres.map(g => `<a href="/genre/${g.id}" class="genre-tag">${g.name}</a>`).join('')}
                </div>
              ` : ''}
            </div>

            <!-- RATINGS -->
            <div class="ratings-row">
              <div class="rating-block rating-block--tmdb">
                <div class="score-circle score-circle--${ratingClass}">
                  <svg viewBox="0 0 36 36" class="score-ring" aria-hidden="true">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#333" stroke-width="2"/>
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="${userScore}, 100"/>
                  </svg>
                  <span class="score-num">${userScore}%</span>
                </div>
                <div>
                  <div class="rating-label">TMDB Score</div>
                  <div class="rating-count">${(movie.vote_count || 0).toLocaleString()} votes</div>
                </div>
              </div>

              ${siteAvgRating ? `
                <div class="rating-block">
                  <div class="site-rating">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#e84b1e" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <span class="site-rating-num">${siteAvgRating}</span><span class="site-rating-max">/10</span>
                  </div>
                  <div class="rating-label">Member Rating</div>
                  <div class="rating-count">${siteReviews.length} review${siteReviews.length !== 1 ? 's' : ''}</div>
                </div>
              ` : ''}
            </div>

            ${movie.tagline ? `<p class="detail-tagline">"${sanitizeHtml(movie.tagline)}"</p>` : ''}

            <div class="detail-section">
              <h2 class="detail-section-title">Overview</h2>
              <p class="detail-overview">${sanitizeHtml(movie.overview || 'No overview available.')}</p>
            </div>

            <!-- CREW -->
            ${director || movie.created_by?.length ? `
              <div class="detail-crew">
                ${director ? `
                  <div class="crew-item">
                    <a href="/person/${director.id}" class="crew-name">${sanitizeHtml(director.name)}</a>
                    <span class="crew-role">Director</span>
                  </div>
                ` : ''}
                ${movie.created_by?.slice(0, 2).map(c => `
                  <div class="crew-item">
                    <a href="/person/${c.id}" class="crew-name">${sanitizeHtml(c.name)}</a>
                    <span class="crew-role">Creator</span>
                  </div>
                `).join('') || ''}
              </div>
            ` : ''}

            <!-- DETAILS TABLE -->
            <div class="detail-info-grid">
              ${movie.status ? `<div class="info-item"><dt>Status</dt><dd>${sanitizeHtml(movie.status)}</dd></div>` : ''}
              ${movie.original_language ? `<div class="info-item"><dt>Language</dt><dd>${movie.original_language.toUpperCase()}</dd></div>` : ''}
              ${movie.budget ? `<div class="info-item"><dt>Budget</dt><dd>${formatCurrency(movie.budget)}</dd></div>` : ''}
              ${movie.revenue ? `<div class="info-item"><dt>Revenue</dt><dd>${formatCurrency(movie.revenue)}</dd></div>` : ''}
              ${movie.number_of_seasons ? `<div class="info-item"><dt>Seasons</dt><dd>${movie.number_of_seasons}</dd></div>` : ''}
              ${movie.number_of_episodes ? `<div class="info-item"><dt>Episodes</dt><dd>${movie.number_of_episodes}</dd></div>` : ''}
            </div>
          </div>
        </div>

        <!-- CAST -->
        ${cast.length ? `
          <section class="detail-section" aria-labelledby="cast-heading">
            <div class="section-header">
              <h2 class="section-title" id="cast-heading">Top Cast</h2>
            </div>
            <div class="cast-scroll">
              ${cast.map(person => `
                <a href="/person/${person.id}" class="cast-card">
                  <div class="cast-photo-wrapper">
                    <img
                      src="${person.profile_path ? imgUrl(person.profile_path, 'w185') : '/images/no-avatar.svg'}"
                      alt="${sanitizeHtml(person.name)}"
                      loading="lazy"
                      width="185"
                      height="185"
                      class="cast-photo"
                    >
                  </div>
                  <div class="cast-info">
                    <span class="cast-name">${sanitizeHtml(person.name)}</span>
                    <span class="cast-character">${sanitizeHtml(person.character || '')}</span>
                  </div>
                </a>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- TRAILER SECTION -->
        ${trailerKey ? `
          <section class="detail-section" aria-labelledby="trailer-heading">
            <h2 class="section-title" id="trailer-heading">Trailer</h2>
            <div class="trailer-container">
              <button class="trailer-thumb-btn" data-trailer="${trailerKey}" aria-label="Play trailer for ${sanitizeHtml(title)}">
                <img
                  src="https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg"
                  alt="Play trailer"
                  loading="lazy"
                  class="trailer-thumb-img"
                >
                <div class="trailer-play-btn" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </button>
            </div>
          </section>
        ` : ''}

        <!-- REVIEWS -->
        <section class="detail-section" id="reviews" aria-labelledby="reviews-heading">
          <div class="section-header">
            <h2 class="section-title" id="reviews-heading">
              Member Reviews
              ${siteReviews.length ? `<span class="reviews-count">${siteReviews.length}</span>` : ''}
            </h2>
            ${user ? `
              <button class="btn btn--primary btn--sm" id="write-review-btn" aria-label="Write a review">
                ${userReview ? 'Edit My Review' : 'Write a Review'}
              </button>
            ` : `
              <a href="/login" class="btn btn--outline btn--sm">Sign in to Review</a>
            `}
          </div>

          ${user ? `
            <!-- REVIEW FORM -->
            <div class="review-form-wrapper" id="review-form-wrapper" ${userReview ? '' : 'hidden'}>
              <form class="review-form" id="review-form" novalidate>
                <input type="hidden" name="tmdb_id" value="${movieId}">
                <input type="hidden" name="media_type" value="${mediaType}">
                ${userReview ? `<input type="hidden" name="review_id" value="${userReview.id}">` : ''}

                <div class="form-group">
                  <label class="form-label" for="review-rating">Your Rating (1-10) <span aria-hidden="true">*</span></label>
                  <div class="rating-input-wrapper">
                    <input
                      type="range"
                      id="review-rating"
                      name="rating"
                      min="1" max="10" step="1"
                      value="${userReview?.rating || 7}"
                      class="rating-slider"
                      aria-valuemin="1" aria-valuemax="10"
                    >
                    <output class="rating-value" id="rating-output">${userReview?.rating || 7}</output>
                    <span class="rating-label-text">/ 10</span>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="review-title">Review Title (optional)</label>
                  <input
                    type="text"
                    id="review-title"
                    name="title"
                    maxlength="200"
                    value="${sanitizeHtml(userReview?.title || '')}"
                    placeholder="Summarize your thoughts…"
                    class="form-input"
                  >
                </div>

                <div class="form-group">
                  <label class="form-label" for="review-body">Your Review <span aria-hidden="true">*</span></label>
                  <textarea
                    id="review-body"
                    name="body"
                    rows="5"
                    minlength="20"
                    maxlength="5000"
                    required
                    placeholder="What did you think of ${sanitizeHtml(title)}?"
                    class="form-textarea"
                  >${sanitizeHtml(userReview?.body || '')}</textarea>
                  <div class="char-count"><span id="review-char-count">${userReview?.body?.length || 0}</span>/5000</div>
                </div>

                <div class="form-group form-group--check">
                  <label class="checkbox-label">
                    <input type="checkbox" name="contains_spoilers" value="1" ${userReview?.contains_spoilers ? 'checked' : ''}>
                    <span>This review contains spoilers</span>
                  </label>
                </div>

                <div class="form-actions">
                  <button type="submit" class="btn btn--primary" id="review-submit-btn">
                    ${userReview ? 'Update Review' : 'Publish Review'}
                  </button>
                  <button type="button" class="btn btn--ghost" id="cancel-review-btn">Cancel</button>
                </div>
                <div class="form-message" id="review-form-message" aria-live="polite"></div>
              </form>
            </div>
          ` : ''}

          ${siteReviews.length ? `
            <div class="reviews-list" id="reviews-list">
              ${siteReviews.map(r => reviewCard(r)).join('')}
            </div>
            <div class="reviews-load-more">
              <button class="btn btn--outline" id="load-more-reviews" data-tmdb-id="${movieId}" data-media-type="${mediaType}" data-page="2">
                Load More Reviews
              </button>
            </div>
          ` : `
            <div class="reviews-empty">
              <p>No reviews yet. Be the first to review ${sanitizeHtml(title)}!</p>
            </div>
          `}
        </section>

        <!-- SIMILAR MOVIES -->
        ${similar.length ? `
          <section class="detail-section" aria-labelledby="similar-heading">
            <div class="section-header">
              <h2 class="section-title" id="similar-heading">More Like This</h2>
            </div>
            <div class="movies-scroll-track">
              <div class="movies-scroll">
                ${similar.map(m => movieCard(m, mediaType, { showListBtns: !!user })).join('')}
              </div>
            </div>
          </section>
        ` : ''}

      </div>
    </div>

    <!-- TRAILER MODAL -->
    <div class="modal" id="trailer-modal" role="dialog" aria-modal="true" aria-label="Movie trailer" hidden>
      <div class="modal-backdrop" id="modal-backdrop"></div>
      <div class="modal-content modal-content--video">
        <button class="modal-close" id="modal-close" aria-label="Close trailer">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
        <div class="video-wrapper" id="video-wrapper"></div>
      </div>
    </div>

    <script>
      // Page-specific data for JS
      window.__PAGE_DATA__ = {
        movieId: ${JSON.stringify(movieId)},
        mediaType: ${JSON.stringify(mediaType)},
        title: ${JSON.stringify(title)},
        posterPath: ${JSON.stringify(movie.poster_path)},
        backdropPath: ${JSON.stringify(movie.backdrop_path)},
        hasReview: ${JSON.stringify(!!userReview)},
        userReviewId: ${JSON.stringify(userReview?.id || null)},
        isLoggedIn: ${JSON.stringify(!!user)}
      };
    </script>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}
