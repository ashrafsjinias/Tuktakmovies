// TMDB API v3 utilities

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL = 3600; // 1 hour in seconds

export function imgUrl(path, size = 'w500') {
  if (!path) return '/images/no-poster.svg';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(path, size = 'w1280') {
  if (!path) return '/images/no-backdrop.svg';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

async function tmdbFetch(env, endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  url.searchParams.set('language', 'en-US');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  // Check KV cache
  const cacheKey = `tmdb:${url.pathname}${url.search}`;
  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    cf: { cacheEverything: true, cacheTtl: CACHE_TTL }
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} for ${endpoint}`);
  }

  const data = await response.json();

  // Store in KV cache
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  }

  return data;
}

// Movies
export async function getTrending(env, timeWindow = 'week', page = 1) {
  return tmdbFetch(env, `/trending/movie/${timeWindow}`, { page });
}

export async function getPopular(env, page = 1) {
  return tmdbFetch(env, '/movie/popular', { page });
}

export async function getNowPlaying(env, page = 1) {
  return tmdbFetch(env, '/movie/now_playing', { page });
}

export async function getUpcoming(env, page = 1) {
  return tmdbFetch(env, '/movie/upcoming', { page });
}

export async function getTopRated(env, page = 1) {
  return tmdbFetch(env, '/movie/top_rated', { page });
}

export async function getMovieDetails(env, movieId) {
  return tmdbFetch(env, `/movie/${movieId}`, {
    append_to_response: 'credits,videos,images,similar,recommendations,release_dates,keywords'
  });
}

export async function searchMovies(env, query, page = 1, year = null) {
  return tmdbFetch(env, '/search/movie', { query, page, year });
}

export async function searchMulti(env, query, page = 1) {
  return tmdbFetch(env, '/search/multi', { query, page });
}

// TV Shows
export async function getTrendingTV(env, timeWindow = 'week', page = 1) {
  return tmdbFetch(env, `/trending/tv/${timeWindow}`, { page });
}

export async function getPopularTV(env, page = 1) {
  return tmdbFetch(env, '/tv/popular', { page });
}

export async function getTVDetails(env, tvId) {
  return tmdbFetch(env, `/tv/${tvId}`, {
    append_to_response: 'credits,videos,images,similar,recommendations,content_ratings,keywords'
  });
}

export async function searchTV(env, query, page = 1) {
  return tmdbFetch(env, '/search/tv', { query, page });
}

// Genres
export async function getMovieGenres(env) {
  return tmdbFetch(env, '/genre/movie/list');
}

export async function getTVGenres(env) {
  return tmdbFetch(env, '/genre/tv/list');
}

export async function getByGenre(env, genreId, page = 1, mediaType = 'movie', sortBy = 'popularity.desc') {
  const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
  return tmdbFetch(env, endpoint, {
    with_genres: genreId,
    page,
    sort_by: sortBy,
    'vote_count.gte': 50
  });
}

// Person
export async function getPersonDetails(env, personId) {
  return tmdbFetch(env, `/person/${personId}`, {
    append_to_response: 'movie_credits,tv_credits,images'
  });
}

// Discover
export async function discoverMovies(env, params = {}) {
  return tmdbFetch(env, '/discover/movie', {
    sort_by: 'popularity.desc',
    'vote_count.gte': 50,
    ...params
  });
}

// Get YouTube trailer key
export function getTrailerKey(videos) {
  if (!videos?.results?.length) return null;
  const trailer = videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                  videos.results.find(v => v.site === 'YouTube');
  return trailer?.key || null;
}

// Format runtime
export function formatRuntime(minutes) {
  if (!minutes) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Format currency
export function formatCurrency(amount) {
  if (!amount) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

// Cache movie metadata in D1
export async function cacheMovieMetadata(env, movie, mediaType = 'movie') {
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO movie_cache (tmdb_id, media_type, title, poster_path, backdrop_path, overview, release_date, vote_average, genres, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `).bind(
      movie.id,
      mediaType,
      movie.title || movie.name,
      movie.poster_path,
      movie.backdrop_path,
      movie.overview,
      movie.release_date || movie.first_air_date,
      movie.vote_average,
      JSON.stringify(movie.genre_ids || movie.genres?.map(g => g.id) || [])
    ).run();
  } catch (e) {
    // Non-critical, ignore cache errors
  }
}
