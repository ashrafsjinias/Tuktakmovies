// Home page - Trending, Popular, Now Playing sections

import { baseLayout, movieCard } from '../utils/layout.js';
import { htmlResponse, generateMetaTags, cacheHeaders } from '../utils/helpers.js';
import {
  getTrending, getPopular, getNowPlaying, getUpcoming,
  getMovieGenres, imgUrl, backdropUrl, getTrailerKey
} from '../utils/tmdb.js';

export async function renderHome(request, env, user) {
  try {
    // Fetch all data in parallel
    const [trending, popular, nowPlaying, upcoming, genres] = await Promise.all([
      getTrending(env, 'week'),
      getPopular(env),
      getNowPlaying(env),
      getUpcoming(env),
      getMovieGenres(env)
    ]);

    const hero = trending.results[0];
    const heroTrailerKey = hero?.videos?.results
      ? getTrailerKey(hero.videos)
      : null;

    const genreMap = {};
    for (const g of genres.genres || []) {
      genreMap[g.id] = g.name;
    }

    const head = `
      ${generateMetaTags({
        title: 'TuktakMovies – Discover, Watch & Review Movies',
        description: 'Discover trending movies, read real reviews, and build your personal watchlist. Your go-to destination for movie lovers.',
        url: 'https://tuktakmovies.online',
        image: hero ? backdropUrl(hero.backdrop_path) : undefined
      })}
      <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "TuktakMovies",
        "url": "https://tuktakmovies.online",
        "potentialAction": {
          "@type": "SearchAction",
          "target": { "@type": "EntryPoint", "urlTemplate": "https://tuktakmovies.online/search?q={search_term_string}" },
          "query-input": "required name=search_term_string"
        }
      })}
      </script>
    `;

    const heroGenres = hero?.genre_ids?.slice(0, 3).map(id => genreMap[id]).filter(Boolean) || [];

    const body = `
      <!-- HERO -->
      <section class="hero" aria-label="Featured movie">
        <div class="hero-backdrop" style="background-image: url('${backdropUrl(hero?.backdrop_path)}')">
          <div class="hero-backdrop-overlay"></div>
        </div>
        <div class="hero-content container">
          <div class="hero-meta">
            ${heroGenres.map(g => `<span class="hero-genre-tag">${g}</span>`).join('')}
          </div>
          <h1 class="hero-title">${hero?.title || 'Welcome to TuktakMovies'}</h1>
          <p class="hero-overview">${(hero?.overview || '').substring(0, 200)}${hero?.overview?.length > 200 ? '…' : ''}</p>
          <div class="hero-actions">
            <a href="/movie/${hero?.id}" class="btn btn--primary btn--lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              View Details
            </a>
            ${heroTrailerKey ? `
              <button class="btn btn--ghost btn--lg" id="hero-trailer-btn" data-trailer="${heroTrailerKey}" aria-label="Watch trailer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
                Watch Trailer
              </button>
            ` : ''}
            ${user ? `
              <button class="btn btn--outline btn--lg" data-action="watchlist" data-id="${hero?.id}" data-type="movie" aria-label="Add to Watchlist">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Watchlist
              </button>
            ` : ''}
          </div>
          ${hero?.vote_average ? `
            <div class="hero-rating">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#f5c518" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span>${hero.vote_average.toFixed(1)}</span>
              <span class="hero-vote-count">${(hero.vote_count || 0).toLocaleString()} ratings</span>
            </div>
          ` : ''}
        </div>
        <div class="hero-thumbnails" aria-label="More trending movies">
          ${trending.results.slice(1, 6).map(m => `
            <a href="/movie/${m.id}" class="hero-thumb" title="${m.title}">
              <img src="${imgUrl(m.poster_path, 'w185')}" alt="${m.title}" loading="lazy" width="80" height="120">
            </a>
          `).join('')}
        </div>
      </section>

      <!-- TRENDING SECTION -->
      <section class="content-section" aria-labelledby="trending-heading">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title" id="trending-heading">Trending This Week</h2>
            <div class="section-tabs" role="tablist" aria-label="Trending time period">
              <button class="section-tab section-tab--active" role="tab" data-section="trending" data-period="week" aria-selected="true">This Week</button>
              <button class="section-tab" role="tab" data-section="trending" data-period="day" aria-selected="false">Today</button>
            </div>
            <a href="/trending" class="section-link" aria-label="View all trending movies">See all</a>
          </div>
          <div class="movies-grid" id="trending-grid" role="list">
            ${trending.results.slice(0, 12).map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
          </div>
        </div>
      </section>

      <!-- NOW PLAYING -->
      <section class="content-section content-section--alt" aria-labelledby="now-playing-heading">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title" id="now-playing-heading">Now Playing</h2>
            <a href="/movies?filter=now_playing" class="section-link">See all</a>
          </div>
          <div class="movies-scroll-track">
            <div class="movies-scroll" role="list">
              ${nowPlaying.results.slice(0, 10).map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
            </div>
          </div>
        </div>
      </section>

      <!-- POPULAR MOVIES -->
      <section class="content-section" aria-labelledby="popular-heading">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title" id="popular-heading">Popular Movies</h2>
            <a href="/movies" class="section-link">See all</a>
          </div>
          <div class="movies-grid" role="list">
            ${popular.results.slice(0, 12).map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
          </div>
        </div>
      </section>

      <!-- UPCOMING -->
      <section class="content-section content-section--alt" aria-labelledby="upcoming-heading">
        <div class="container">
          <div class="section-header">
            <h2 class="section-title" id="upcoming-heading">Coming Soon</h2>
            <a href="/movies?filter=upcoming" class="section-link">See all</a>
          </div>
          <div class="movies-scroll-track">
            <div class="movies-scroll" role="list">
              ${upcoming.results.slice(0, 10).map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
            </div>
          </div>
        </div>
      </section>

      <!-- GENRES -->
      <section class="content-section" aria-labelledby="genres-heading">
        <div class="container">
          <h2 class="section-title" id="genres-heading">Browse by Genre</h2>
          <div class="genres-grid" role="list">
            ${genres.genres.slice(0, 16).map(g => `
              <a href="/genre/${g.id}" class="genre-card" role="listitem">
                <span class="genre-icon" aria-hidden="true">${getGenreEmoji(g.name)}</span>
                <span class="genre-name">${g.name}</span>
              </a>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- CTA for non-logged in users -->
      ${!user ? `
        <section class="cta-section" aria-labelledby="cta-heading">
          <div class="container">
            <div class="cta-inner">
              <h2 class="cta-title" id="cta-heading">Join TuktakMovies</h2>
              <p class="cta-desc">Create your account to rate movies, write reviews, and build your personal watchlist.</p>
              <div class="cta-actions">
                <a href="/register" class="btn btn--primary btn--lg">Create Free Account</a>
                <a href="/login" class="btn btn--ghost btn--lg">Sign In</a>
              </div>
            </div>
          </div>
        </section>
      ` : ''}

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
    `;

    return htmlResponse(
      baseLayout({ head, body, user }),
      200,
      cacheHeaders(300) // Cache home page 5 mins
    );

  } catch (error) {
    console.error('Home page error:', error);
    throw error;
  }
}

function getGenreEmoji(name) {
  const map = {
    'Action': '💥', 'Adventure': '🗺️', 'Animation': '🎨',
    'Comedy': '😂', 'Crime': '🔫', 'Documentary': '📹',
    'Drama': '🎭', 'Family': '👨‍👩‍👧', 'Fantasy': '🧙',
    'History': '🏛️', 'Horror': '👻', 'Music': '🎵',
    'Mystery': '🔍', 'Romance': '❤️', 'Science Fiction': '🚀',
    'Thriller': '😱', 'War': '⚔️', 'Western': '🤠', 'TV Movie': '📺'
  };
  return map[name] || '🎬';
}
