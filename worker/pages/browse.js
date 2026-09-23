// Browse, Search, Genre, Trending pages

import { baseLayout, movieCard, pagination } from '../utils/layout.js';
import { htmlResponse, generateMetaTags, sanitizeHtml, cacheHeaders } from '../utils/helpers.js';
import {
  searchMovies, searchMulti, getPopular, getNowPlaying, getUpcoming, getTopRated,
  getTrending, getByGenre, getMovieGenres, getTVGenres, getPopularTV, getTrendingTV,
  discoverMovies, imgUrl
} from '../utils/tmdb.js';

export async function renderSearch(request, env, user) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const type = url.searchParams.get('type') || 'all';

  let results = { results: [], total_results: 0, total_pages: 0 };

  if (query.trim().length >= 2) {
    try {
      if (type === 'movie') {
        results = await searchMovies(env, query, page);
      } else if (type === 'tv') {
        const { searchTV } = await import('../utils/tmdb.js');
        results = await searchTV(env, query, page);
      } else {
        results = await searchMulti(env, query, page);
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  }

  const safeQuery = sanitizeHtml(query);
  const basePageUrl = `/search?q=${encodeURIComponent(query)}&type=${type}`;

  const head = generateMetaTags({
    title: query ? `"${safeQuery}" – Search – TuktakMovies` : 'Search – TuktakMovies',
    description: query ? `Search results for "${safeQuery}" on TuktakMovies` : 'Search for movies and TV shows on TuktakMovies',
    url: `https://tuktakmovies.online/search?q=${encodeURIComponent(query)}`
  });

  const body = `
    <div class="container page-container">
      <div class="page-header">
        <h1 class="page-title">
          ${query ? `Results for <em>"${safeQuery}"</em>` : 'Search'}
        </h1>
        ${results.total_results ? `<p class="page-subtitle">${results.total_results.toLocaleString()} results found</p>` : ''}
      </div>

      <div class="search-filters">
        <nav class="filter-tabs" aria-label="Search type filter">
          <a href="/search?q=${encodeURIComponent(query)}&type=all" class="filter-tab ${type === 'all' ? 'filter-tab--active' : ''}" aria-current="${type === 'all' ? 'page' : 'false'}">All</a>
          <a href="/search?q=${encodeURIComponent(query)}&type=movie" class="filter-tab ${type === 'movie' ? 'filter-tab--active' : ''}" aria-current="${type === 'movie' ? 'page' : 'false'}">Movies</a>
          <a href="/search?q=${encodeURIComponent(query)}&type=tv" class="filter-tab ${type === 'tv' ? 'filter-tab--active' : ''}" aria-current="${type === 'tv' ? 'page' : 'false'}">TV Shows</a>
        </nav>
      </div>

      ${!query ? `
        <div class="search-empty search-empty--prompt">
          <div class="search-icon" aria-hidden="true">🎬</div>
          <h2>What are you looking for?</h2>
          <p>Search for any movie or TV show by title, actor, or director.</p>
        </div>
      ` : results.results.length === 0 ? `
        <div class="search-empty">
          <div class="search-icon" aria-hidden="true">😕</div>
          <h2>No results found</h2>
          <p>Try adjusting your search terms or browse our <a href="/movies">movies</a> collection.</p>
        </div>
      ` : `
        <div class="movies-grid" role="list">
          ${results.results.map(item => {
            const mediaType = item.media_type || type !== 'all' ? type : 'movie';
            const effectiveType = item.media_type === 'person' ? null : (item.media_type || mediaType);
            if (!effectiveType || item.media_type === 'person') {
              return renderPersonCard(item);
            }
            return movieCard(item, effectiveType, { showListBtns: !!user });
          }).join('')}
        </div>
        ${pagination(page, results.total_pages, basePageUrl)}
      `}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}

function renderPersonCard(person) {
  return `
    <article class="person-card">
      <a href="/person/${person.id}" class="person-card-link">
        <div class="person-photo-wrapper">
          <img
            src="${person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : '/images/no-avatar.svg'}"
            alt="${sanitizeHtml(person.name)}"
            loading="lazy"
            class="person-photo"
            width="185" height="185"
          >
        </div>
        <div class="person-info">
          <h3 class="person-name">${sanitizeHtml(person.name)}</h3>
          <p class="person-department">${sanitizeHtml(person.known_for_department || '')}</p>
        </div>
      </a>
    </article>
  `;
}

export async function renderBrowseMovies(request, env, user) {
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'popular';
  const page = parseInt(url.searchParams.get('page') || '1');
  const sortBy = url.searchParams.get('sort') || 'popularity.desc';

  const filterMap = {
    popular: { fn: () => getPopular(env, page), title: 'Popular Movies' },
    now_playing: { fn: () => getNowPlaying(env, page), title: 'Now Playing' },
    upcoming: { fn: () => getUpcoming(env, page), title: 'Coming Soon' },
    top_rated: { fn: () => getTopRated(env, page), title: 'Top Rated Movies' }
  };

  const current = filterMap[filter] || filterMap.popular;
  const data = await current.fn();
  const basePageUrl = `/movies?filter=${filter}`;

  const head = generateMetaTags({
    title: `${current.title} – TuktakMovies`,
    description: `Browse ${current.title.toLowerCase()} on TuktakMovies`,
    url: `https://tuktakmovies.online/movies?filter=${filter}`
  });

  const body = `
    <div class="container page-container">
      <div class="page-header">
        <h1 class="page-title">${current.title}</h1>
        <p class="page-subtitle">${data.total_results?.toLocaleString() || ''} movies</p>
      </div>

      <nav class="filter-tabs" aria-label="Movie filter">
        ${Object.entries(filterMap).map(([key, val]) => `
          <a href="/movies?filter=${key}" class="filter-tab ${filter === key ? 'filter-tab--active' : ''}">${val.title.replace(' Movies', '').replace(' Coming', 'Upcoming')}</a>
        `).join('')}
      </nav>

      <div class="movies-grid" role="list">
        ${data.results.map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
      </div>

      ${pagination(page, Math.min(data.total_pages || 1, 500), basePageUrl)}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }), 200, cacheHeaders(600));
}

export async function renderBrowseTV(request, env, user) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');

  const data = await getPopularTV(env, page);

  const head = generateMetaTags({
    title: 'Popular TV Shows – TuktakMovies',
    description: 'Browse popular TV shows on TuktakMovies',
    url: 'https://tuktakmovies.online/tv'
  });

  const body = `
    <div class="container page-container">
      <h1 class="page-title">TV Shows</h1>
      <div class="movies-grid" role="list">
        ${data.results.map(m => movieCard(m, 'tv', { showListBtns: !!user })).join('')}
      </div>
      ${pagination(page, Math.min(data.total_pages || 1, 500), '/tv?')}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }), 200, cacheHeaders(600));
}

export async function renderTrending(request, env, user) {
  const url = new URL(request.url);
  const timeWindow = url.searchParams.get('period') || 'week';
  const page = parseInt(url.searchParams.get('page') || '1');

  const [trendingMovies, trendingTV] = await Promise.all([
    getTrending(env, timeWindow, page),
    getTrendingTV(env, timeWindow, page)
  ]);

  const head = generateMetaTags({
    title: `Trending ${timeWindow === 'week' ? 'This Week' : 'Today'} – TuktakMovies`,
    description: `See what's trending on TuktakMovies`,
    url: 'https://tuktakmovies.online/trending'
  });

  const body = `
    <div class="container page-container">
      <div class="page-header">
        <h1 class="page-title">Trending</h1>
        <nav class="filter-tabs" aria-label="Time period">
          <a href="/trending?period=week" class="filter-tab ${timeWindow === 'week' ? 'filter-tab--active' : ''}">This Week</a>
          <a href="/trending?period=day" class="filter-tab ${timeWindow === 'day' ? 'filter-tab--active' : ''}">Today</a>
        </nav>
      </div>

      <section aria-labelledby="trending-movies-h">
        <h2 class="section-title" id="trending-movies-h">Movies</h2>
        <div class="movies-grid" role="list">
          ${trendingMovies.results.map(m => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
        </div>
        ${pagination(page, trendingMovies.total_pages, `/trending?period=${timeWindow}&`)}
      </section>

      <section class="content-section" aria-labelledby="trending-tv-h">
        <h2 class="section-title" id="trending-tv-h">TV Shows</h2>
        <div class="movies-grid" role="list">
          ${trendingTV.results.map(m => movieCard(m, 'tv', { showListBtns: !!user })).join('')}
        </div>
      </section>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }), 200, cacheHeaders(300));
}

export async function renderGenre(request, env, user, genreId) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const mediaType = url.searchParams.get('type') || 'movie';
  const sortBy = url.searchParams.get('sort') || 'popularity.desc';

  const [genres, data] = await Promise.all([
    mediaType === 'tv' ? getTVGenres(env) : getMovieGenres(env),
    getByGenre(env, genreId, page, mediaType, sortBy)
  ]);

  const genre = genres.genres?.find(g => g.id === parseInt(genreId));
  const genreName = genre?.name || 'Genre';
  const basePageUrl = `/genre/${genreId}?type=${mediaType}&sort=${sortBy}&`;

  const head = generateMetaTags({
    title: `${genreName} ${mediaType === 'tv' ? 'TV Shows' : 'Movies'} – TuktakMovies`,
    description: `Discover the best ${genreName.toLowerCase()} movies and TV shows on TuktakMovies`,
    url: `https://tuktakmovies.online/genre/${genreId}`
  });

  const body = `
    <div class="container page-container">
      <div class="page-header">
        <h1 class="page-title">${sanitizeHtml(genreName)}</h1>
        <p class="page-subtitle">${data.total_results?.toLocaleString() || ''} titles</p>
      </div>

      <div class="browse-controls">
        <nav class="filter-tabs" aria-label="Media type">
          <a href="/genre/${genreId}?type=movie" class="filter-tab ${mediaType === 'movie' ? 'filter-tab--active' : ''}">Movies</a>
          <a href="/genre/${genreId}?type=tv" class="filter-tab ${mediaType === 'tv' ? 'filter-tab--active' : ''}">TV Shows</a>
        </nav>
        <div class="sort-control">
          <label for="sort-select" class="sort-label">Sort by</label>
          <select id="sort-select" class="sort-select" data-base-url="/genre/${genreId}?type=${mediaType}&page=1&sort=">
            <option value="popularity.desc" ${sortBy === 'popularity.desc' ? 'selected' : ''}>Most Popular</option>
            <option value="vote_average.desc" ${sortBy === 'vote_average.desc' ? 'selected' : ''}>Highest Rated</option>
            <option value="release_date.desc" ${sortBy === 'release_date.desc' ? 'selected' : ''}>Newest First</option>
            <option value="revenue.desc" ${sortBy === 'revenue.desc' ? 'selected' : ''}>Highest Revenue</option>
          </select>
        </div>
      </div>

      <div class="movies-grid" role="list">
        ${data.results.map(m => movieCard(m, mediaType, { showListBtns: !!user })).join('')}
      </div>
      ${pagination(page, Math.min(data.total_pages || 1, 500), basePageUrl)}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }), 200, cacheHeaders(600));
}

export async function renderGenreList(request, env, user) {
  const [movieGenres, tvGenres] = await Promise.all([
    getMovieGenres(env),
    getTVGenres(env)
  ]);

  const genreEmojis = {
    'Action': '💥', 'Adventure': '🗺️', 'Animation': '🎨', 'Comedy': '😂',
    'Crime': '🔫', 'Documentary': '📹', 'Drama': '🎭', 'Family': '👨‍👩‍👧',
    'Fantasy': '🧙', 'History': '🏛️', 'Horror': '👻', 'Music': '🎵',
    'Mystery': '🔍', 'Romance': '❤️', 'Science Fiction': '🚀', 'Thriller': '😱',
    'War': '⚔️', 'Western': '🤠', 'TV Movie': '📺', 'Action & Adventure': '🔥',
    'Kids': '🧸', 'News': '📰', 'Reality': '📷', 'Sci-Fi & Fantasy': '🌌',
    'Soap': '🫧', 'Talk': '🗣️', 'War & Politics': '🏛️'
  };

  const head = generateMetaTags({
    title: 'Browse by Genre – TuktakMovies',
    description: 'Discover movies and TV shows by genre on TuktakMovies',
    url: 'https://tuktakmovies.online/genres'
  });

  const body = `
    <div class="container page-container">
      <h1 class="page-title">Browse by Genre</h1>

      <section aria-labelledby="movie-genres-h">
        <h2 class="section-title" id="movie-genres-h">Movie Genres</h2>
        <div class="genres-grid genres-grid--large" role="list">
          ${movieGenres.genres?.map(g => `
            <a href="/genre/${g.id}" class="genre-card genre-card--large" role="listitem">
              <span class="genre-icon" aria-hidden="true">${genreEmojis[g.name] || '🎬'}</span>
              <span class="genre-name">${g.name}</span>
            </a>
          `).join('') || ''}
        </div>
      </section>

      <section class="content-section" aria-labelledby="tv-genres-h">
        <h2 class="section-title" id="tv-genres-h">TV Genres</h2>
        <div class="genres-grid genres-grid--large" role="list">
          ${tvGenres.genres?.map(g => `
            <a href="/genre/${g.id}?type=tv" class="genre-card genre-card--large" role="listitem">
              <span class="genre-icon" aria-hidden="true">${genreEmojis[g.name] || '📺'}</span>
              <span class="genre-name">${g.name}</span>
            </a>
          `).join('') || ''}
        </div>
      </section>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }), 200, cacheHeaders(3600));
}

export async function renderTopRated(request, env, user) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');

  const data = await getTopRated(env, page);

  const head = generateMetaTags({
    title: 'Top Rated Movies – TuktakMovies',
    description: 'The highest rated movies of all time on TuktakMovies',
    url: 'https://tuktakmovies.online/top-rated'
  });

  const body = `
    <div class="container page-container">
      <h1 class="page-title">Top Rated Movies</h1>
      <div class="movies-grid" role="list">
        ${data.results.map((m, i) => `
          <article class="movie-card movie-card--ranked">
            <span class="rank-number" aria-label="Rank ${(page - 1) * 20 + i + 1}">#${(page - 1) * 20 + i + 1}</span>
            ${movieCard(m, 'movie', { showListBtns: !!user })}
          </article>
        `).join('').replace(/<article[^>]*>\s*<span[^>]*>#\d+<\/span>\s*/g, (match) => match).replace(/(<article class="movie-card movie-card--ranked">)([\s\S]*?)(<\/article>)/g, (m, open, content) => content)}
      </div>
      ${pagination(page, Math.min(data.total_pages || 1, 500), '/top-rated?')}
    </div>
  `;

  // Simpler approach
  const simpleBody = `
    <div class="container page-container">
      <h1 class="page-title">Top Rated Movies</h1>
      <div class="movies-grid" role="list">
        ${data.results.map((m, i) => movieCard(m, 'movie', { showListBtns: !!user })).join('')}
      </div>
      ${pagination(page, Math.min(data.total_pages || 1, 500), '/top-rated?')}
    </div>
  `;

  return htmlResponse(baseLayout({ head, body: simpleBody, user }), 200, cacheHeaders(600));
}
