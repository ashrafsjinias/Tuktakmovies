// ---------- Small helpers ----------

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function makeSessionToken(secret) {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const sig = await hmac(secret, String(expires));
  return `${expires}.${sig}`;
}

async function isValidSession(token, secret) {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = await hmac(secret, expires);
  return expected === sig;
}

async function requireAuth(request, env) {
  const token = getCookie(request, "admin_session");
  return isValidSession(token, env.ADMIN_PASSWORD);
}

const ALLOWED_TYPES = ["featured", "review", "movie", "article", "trending"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

function makeImageKey(filename) {
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(filename || "");
  const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${crypto.randomUUID()}.${ext}`;
}

// ---------- Serving uploaded images from R2 ----------

async function handleImage(request, env, url) {
  if (!env.IMAGES) return new Response("Image storage isn't set up.", { status: 404 });
  const key = decodeURIComponent(url.pathname.replace(/^\/images\//, ""));
  if (!key) return new Response("Not found", { status: 404 });
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

// ---------- TMDB auto-import (runs on a Cron Trigger) ----------

const TMDB_IMPORT_LIMIT = 5; // how many new movies to add per run
const TMDB_POST_TYPE = "movie"; // which section these land in: "movie", "trending", or "review"

function formatPostDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Best-effort "industry" label from TMDB's original_language code. This is
// a simple heuristic (language ≠ nationality), but it's the same signal
// most movie sites use for a quick Bollywood/Hollywood/South split.
function industryFromLanguage(lang) {
  if (lang === "hi") return "Bollywood";
  if (["ta", "te", "ml", "kn"].includes(lang)) return "South Indian";
  if (lang === "en") return "Hollywood";
  if (lang === "ko") return "Korean";
  if (lang === "ja") return "Japanese";
  if (lang === "bn") return "Bengali";
  return null;
}

// Fetches genres/runtime/tagline/backdrop/trailer/cast + watch-provider info
// for one TMDB item (movie or TV show). Used by fresh imports and the
// backfill (for items that were imported before these fields existed).
async function fetchTmdbExtras(env, tmdbId, mediaType = "movie") {
  const base = mediaType === "tv" ? "tv" : "movie";
  let genres = null, runtime = null, tagline = null, backdropUrl = null, trailerKey = null, castNames = null;
  try {
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${env.TMDB_API_KEY}&append_to_response=videos,credits`
    );
    if (detailRes.ok) {
      const detail = await detailRes.json();
      genres = (detail.genres || []).map(g => g.name).join(", ") || null;
      runtime = mediaType === "tv"
        ? (Array.isArray(detail.episode_run_time) && detail.episode_run_time[0]) || null
        : detail.runtime || null;
      tagline = detail.tagline || null;
      castNames = (detail.credits?.cast || []).slice(0, 5).map(c => c.name).join(", ") || null;

      const trailer = (detail.videos?.results || []).find(
        v => v.site === "YouTube" && v.type === "Trailer"
      ) || (detail.videos?.results || []).find(v => v.site === "YouTube");
      trailerKey = trailer ? trailer.key : null;

      if (detail.backdrop_path && env.IMAGES) {
        try {
          const backdropRes = await fetch(`https://image.tmdb.org/t/p/w1280${detail.backdrop_path}`);
          if (backdropRes.ok) {
            const bKey = `tmdb-${base}-${tmdbId}-backdrop.jpg`;
            await env.IMAGES.put(bKey, await backdropRes.arrayBuffer(), {
              httpMetadata: { contentType: backdropRes.headers.get("Content-Type") || "image/jpeg" },
            });
            backdropUrl = `/images/${bKey}`;
          }
        } catch (err) {
          console.log("Backdrop fetch failed for", tmdbId, err);
        }
      }
    }
  } catch (err) {
    console.log("Detail fetch failed for", tmdbId, err);
  }

  // Where to Watch — TMDB's watch/providers endpoint is item-specific and
  // region-aware (powered by JustWatch). We default to the US region; the
  // returned "link" already points at a page showing real availability,
  // so we never invent a generic Netflix/Prime link.
  let watchProviders = null, watchLink = null;
  try {
    const wRes = await fetch(
      `https://api.themoviedb.org/3/${base}/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`
    );
    if (wRes.ok) {
      const wData = await wRes.json();
      const region = wData.results?.US || wData.results?.GB || null;
      if (region) {
        const names = new Set();
        for (const group of ["flatrate", "rent", "buy"]) {
          (region[group] || []).forEach(p => names.add(p.provider_name));
        }
        watchProviders = names.size ? Array.from(names).join(", ") : null;
        watchLink = region.link || null;
      }
    }
  } catch (err) {
    console.log("Watch providers fetch failed for", tmdbId, err);
  }

  return { genres, runtime, tagline, backdropUrl, trailerKey, castNames, watchProviders, watchLink };
}

// Fills in genres/runtime/tagline/backdrop/trailer/cast/watch info for posts
// that were TMDB-imported before these fields existed (so it never creates
// duplicates — it only UPDATEs rows that already have a tmdb_id).
async function backfillTmdbDetails(env, limit = 10) {
  if (!env.TMDB_API_KEY || !env.DB) return { updated: 0 };

  const { results } = await env.DB.prepare(
    "SELECT id, tmdb_id, media_type FROM posts WHERE tmdb_id IS NOT NULL AND (genres IS NULL OR genres = '') LIMIT ?"
  ).bind(limit).all();

  let updated = 0;
  for (const row of results) {
    const extra = await fetchTmdbExtras(env, row.tmdb_id, row.media_type || "movie");
    await env.DB.prepare(
      "UPDATE posts SET genres=?, runtime=?, tagline=?, backdrop=?, trailer_key=?, cast_names=?, watch_providers=?, watch_link=? WHERE id=?"
    ).bind(
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, row.id
    ).run();
    updated++;
  }
  return { updated };
}

// Reuses an already-uploaded poster for this tmdb_id when we have one,
// otherwise downloads it from TMDB and stores it in R2.
async function getOrUploadPoster(env, item, mediaType = "movie") {
  const existing = await env.DB.prepare(
    "SELECT image FROM posts WHERE tmdb_id = ? AND media_type = ? AND image IS NOT NULL LIMIT 1"
  ).bind(item.id, mediaType).first();
  if (existing && existing.image) return existing.image;

  if (!item.poster_path || !env.IMAGES) return null;
  try {
    const posterRes = await fetch(`https://image.tmdb.org/t/p/w500${item.poster_path}`);
    if (posterRes.ok) {
      const key = `tmdb-${mediaType}-${item.id}.jpg`;
      await env.IMAGES.put(key, await posterRes.arrayBuffer(), {
        httpMetadata: { contentType: posterRes.headers.get("Content-Type") || "image/jpeg" },
      });
      return `/images/${key}`;
    }
  } catch (err) {
    console.log("Poster fetch failed for", item.id, err);
  }
  return null;
}

// Keeps a single "featured" post (the homepage hero banner) in sync with
// whichever movie is #1 on TMDB's trending list right now. Always UPDATEs
// the same row instead of inserting a new one, so there's only ever one.
async function upsertFeaturedFromTop(env, movie, extra, imageUrl) {
  const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
  const rating = typeof movie.vote_average === "number" ? Math.round(movie.vote_average * 10) / 10 : null;
  const excerpt = (movie.overview || "").slice(0, 300);
  const postDate = formatPostDate(new Date());
  const link = `https://www.themoviedb.org/movie/${movie.id}`;
  const title = movie.title || movie.original_title || "Untitled";
  const industry = industryFromLanguage(movie.original_language);

  const existing = await env.DB.prepare("SELECT id FROM posts WHERE type = 'featured' LIMIT 1").first();

  // NOTE: tmdb_id is intentionally left out here (not set to movie.id).
  // The same TMDB movie already has its own row in the "movie" grid with
  // that tmdb_id, and tmdb_id must stay unique per media type — so the
  // featured slot is matched by type='featured' instead, not by tmdb_id.
  if (existing) {
    await env.DB.prepare(
      "UPDATE posts SET title=?, excerpt=?, image=?, score=?, rating=?, year=?, post_date=?, comments=?, link=?, genres=?, runtime=?, tagline=?, backdrop=?, trailer_key=?, cast_names=?, watch_providers=?, watch_link=?, media_type='movie', industry=?, original_language=? WHERE id=?"
    ).bind(
      title, excerpt, imageUrl, rating, rating, year, postDate, 0, link,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, industry, movie.original_language || null, existing.id
    ).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link, media_type, industry, original_language) VALUES ('featured', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie', ?, ?)"
    ).bind(
      title, excerpt, imageUrl, rating, rating, year, postDate, 0, link,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, industry, movie.original_language || null
    ).run();
  }
}

async function importTrendingFromTMDB(env) {
  if (!env.TMDB_API_KEY) {
    console.log("TMDB_API_KEY not set — skipping scheduled import.");
    return;
  }
  if (!env.DB) {
    console.log("D1 (DB) not bound — skipping scheduled import.");
    return;
  }

  // Pull from several TMDB lists (a few pages each) instead of just the
  // ~20-item daily trending list, so repeated syncs have a much bigger pool
  // of candidates to draw new movies from instead of quickly running dry.
  const SOURCE_ENDPOINTS = [
    "https://api.themoviedb.org/3/trending/movie/day",
    "https://api.themoviedb.org/3/trending/movie/week",
    "https://api.themoviedb.org/3/movie/popular",
    "https://api.themoviedb.org/3/movie/now_playing",
  ];
  const PAGES_PER_SOURCE = 2;

  const candidateMap = new Map();
  let trendingTop = null; // the actual #1 on trending/day, used for the hero
  for (const base of SOURCE_ENDPOINTS) {
    for (let page = 1; page <= PAGES_PER_SOURCE; page++) {
      try {
        const res = await fetch(`${base}?api_key=${env.TMDB_API_KEY}&page=${page}`);
        if (!res.ok) continue;
        const data = await res.json();
        const results = data.results || [];
        if (base.includes("trending/movie/day") && page === 1 && results.length) {
          trendingTop = results[0];
        }
        results.forEach(m => {
          if (!candidateMap.has(m.id)) candidateMap.set(m.id, m);
        });
      } catch (err) {
        console.log("Candidate fetch failed:", base, page, err);
      }
    }
  }
  const movies = Array.from(candidateMap.values());
  if (!movies.length) {
    console.log("No candidate movies fetched from TMDB — check TMDB_API_KEY.");
    return;
  }

  let imported = 0;
  for (const movie of movies) {
    if (imported >= TMDB_IMPORT_LIMIT) break;

    const existing = await env.DB.prepare("SELECT id FROM posts WHERE tmdb_id = ? AND media_type = 'movie'")
      .bind(movie.id)
      .first();
    if (existing) continue; // already imported before

    const imageUrl = await getOrUploadPoster(env, movie, "movie");

    // Extra details (genres, runtime, tagline, backdrop, trailer, cast, watch info)
    const extra = await fetchTmdbExtras(env, movie.id, "movie");

    const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
    const rating = typeof movie.vote_average === "number" ? Math.round(movie.vote_average * 10) / 10 : null;
    const excerpt = (movie.overview || "").slice(0, 300);
    const industry = industryFromLanguage(movie.original_language);

    await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, tmdb_id, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link, media_type, industry, original_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie', ?, ?)"
    ).bind(
      TMDB_POST_TYPE,
      movie.title || movie.original_title || "Untitled",
      excerpt,
      imageUrl,
      rating,
      rating,
      year,
      formatPostDate(new Date()),
      0,
      `https://www.themoviedb.org/movie/${movie.id}`,
      movie.id,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, industry, movie.original_language || null
    ).run();

    imported++;
  }

  // Keep the homepage hero banner pointed at the actual #1 on trending/day
  // (falls back to the first candidate if that specific fetch failed above).
  const featuredPick = trendingTop || movies[0];
  if (featuredPick) {
    const topImage = await getOrUploadPoster(env, featuredPick, "movie");
    const topExtra = await fetchTmdbExtras(env, featuredPick.id, "movie");
    await upsertFeaturedFromTop(env, featuredPick, topExtra, topImage);
  }

  console.log(`TMDB import finished: ${imported} new post(s) added.`);
}

// ---------- TV Shows import ----------

async function importTVFromTMDB(env) {
  if (!env.TMDB_API_KEY) {
    console.log("TMDB_API_KEY not set — skipping TV import.");
    return;
  }
  if (!env.DB) {
    console.log("D1 (DB) not bound — skipping TV import.");
    return;
  }

  const SOURCE_ENDPOINTS = [
    "https://api.themoviedb.org/3/trending/tv/day",
    "https://api.themoviedb.org/3/trending/tv/week",
    "https://api.themoviedb.org/3/tv/popular",
    "https://api.themoviedb.org/3/tv/top_rated",
  ];
  const PAGES_PER_SOURCE = 2;

  const candidateMap = new Map();
  for (const base of SOURCE_ENDPOINTS) {
    for (let page = 1; page <= PAGES_PER_SOURCE; page++) {
      try {
        const res = await fetch(`${base}?api_key=${env.TMDB_API_KEY}&page=${page}`);
        if (!res.ok) continue;
        const data = await res.json();
        (data.results || []).forEach(s => {
          if (!candidateMap.has(s.id)) candidateMap.set(s.id, s);
        });
      } catch (err) {
        console.log("TV candidate fetch failed:", base, page, err);
      }
    }
  }
  const shows = Array.from(candidateMap.values());
  if (!shows.length) {
    console.log("No candidate TV shows fetched from TMDB.");
    return;
  }

  let imported = 0;
  for (const show of shows) {
    if (imported >= TMDB_IMPORT_LIMIT) break;

    const existing = await env.DB.prepare("SELECT id FROM posts WHERE tmdb_id = ? AND media_type = 'tv'")
      .bind(show.id)
      .first();
    if (existing) continue;

    const imageUrl = await getOrUploadPoster(env, show, "tv");
    const extra = await fetchTmdbExtras(env, show.id, "tv");

    const year = show.first_air_date ? Number(show.first_air_date.slice(0, 4)) : null;
    const rating = typeof show.vote_average === "number" ? Math.round(show.vote_average * 10) / 10 : null;
    const excerpt = (show.overview || "").slice(0, 300);
    const title = show.name || show.original_name || "Untitled";
    const industry = industryFromLanguage(show.original_language);

    await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, tmdb_id, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link, media_type, industry, original_language) VALUES ('movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tv', ?, ?)"
    ).bind(
      title,
      excerpt,
      imageUrl,
      rating,
      rating,
      year,
      formatPostDate(new Date()),
      0,
      `https://www.themoviedb.org/tv/${show.id}`,
      show.id,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, industry, show.original_language || null
    ).run();

    imported++;
  }

  console.log(`TMDB TV import finished: ${imported} new show(s) added.`);
}


// ---------- SEO / server-rendering helpers ----------

const SITE_NAME = "TukTakMovies";
const DEFAULT_DESCRIPTION =
  "TukTakMovies — movie discovery, reviews, TV shows, movie news and where to watch.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "untitled";
}

function publicPostPath(post) {
  const prefix = post.media_type === "tv" ? "/tv/" : "/movie/";
  return `${prefix}${post.id}-${slugify(post.title)}`;
}

function absoluteUrl(origin, path) {
  return new URL(path, origin).toString();
}

function cleanMetaDescription(post) {
  const base = post.excerpt || post.tagline ||
    `${post.title || "Movie"}${post.year ? ` (${post.year})` : ""} — discover details, cast, rating, genres and where to watch on TukTakMovies.`;
  return String(base).replace(/\s+/g, " ").trim().slice(0, 160);
}

function listMeta(type, media, page) {
  let title = "Browse";
  let description = DEFAULT_DESCRIPTION;
  if (media === "tv") {
    title = "TV Shows";
    description = "Discover TV shows, ratings, genres, cast information and where to watch on TukTakMovies.";
  } else if (type === "movie") {
    title = "Movies";
    description = "Discover movies, ratings, genres, cast information, reviews and where to watch on TukTakMovies.";
  } else if (type === "review") {
    title = "Movie Reviews";
    description = "Read movie reviews, ratings and movie details on TukTakMovies.";
  } else if (type === "article") {
    title = "Articles";
    description = "Explore movie news, explainers, lists and entertainment articles on TukTakMovies.";
  } else if (type === "trending") {
    title = "Trending Now";
    description = "See movies and entertainment titles trending on TukTakMovies.";
  } else if (type === "featured") {
    title = "Featured";
    description = "Explore featured movie and entertainment content on TukTakMovies.";
  }
  return {
    title: page > 1 ? `${title} — Page ${page} | ${SITE_NAME}` : `${title} | ${SITE_NAME}`,
    description,
  };
}

function addSeoHead(documentHtml, { title, description, canonical, image, jsonLd, robots = "index,follow" }) {
  let out = documentHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  const metas = `
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${escapeHtml(robots)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
<script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>`;
  out = out.replace(/<\/head>/i, `${metas}\n</head>`);
  return out;
}

async function getPostsPage(env, { type, media, page = 1, limit = 12, sort }) {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(48, Math.max(1, Number(limit) || 12));

  const conditions = [];
  const params = [];
  if (type) { conditions.push("type = ?"); params.push(type); }
  if (media) { conditions.push("media_type = ?"); params.push(media); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderBy = sort === "rating"
    ? "ORDER BY rating DESC, created_at DESC, id DESC"
    : "ORDER BY created_at DESC, id DESC";

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM posts ${where}`
  ).bind(...params).first();

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (page > totalPages && total > 0) page = totalPages;

  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(
    `SELECT * FROM posts ${where} ${orderBy} LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  return { posts: results || [], page, limit, total, totalPages };
}

function listPathFor(type, media, page) {
  let path = "/movies";
  if (media === "tv") path = "/tv-shows";
  else if (type === "review") path = "/reviews";
  else if (type === "article") path = "/articles";
  else if (type === "trending") path = "/trending";
  else if (type === "featured") path = "/featured";
  return page > 1 ? `${path}?page=${page}` : path;
}

function renderListCards(posts, origin) {
  return posts.map(post => {
    const href = publicPostPath(post);
    const image = post.image || post.backdrop;
    const img = image
      ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.title)} poster" loading="lazy" decoding="async">`
      : `<div class="no-image">${escapeHtml(post.title)}</div>`;
    const score = post.score ?? post.rating;
    const badge = score != null ? `<span class="score">${escapeHtml(score)}</span>` : "";
    return `<a class="card" href="${escapeHtml(href)}">
      <div class="thumb">${img}${badge}</div>
      <div class="body">
        <h3>${escapeHtml(post.title)}</h3>
        <div class="sub">
          <span>${escapeHtml(post.post_date || post.year || "")}</span>
          ${post.comments ? `<span>💬 ${escapeHtml(post.comments)}</span>` : ""}
        </div>
      </div>
    </a>`;
  }).join("");
}

function renderPaginationLinks(type, media, page, totalPages) {
  if (totalPages <= 1) return "";
  const prev = page > 1
    ? `<a class="page-btn page-prev" href="${escapeHtml(listPathFor(type, media, page - 1))}">← Prev</a>`
    : `<span class="page-btn page-prev" aria-disabled="true" style="opacity:.4;cursor:default;">← Prev</span>`;
  const next = page < totalPages
    ? `<a class="page-btn page-next" href="${escapeHtml(listPathFor(type, media, page + 1))}">Next →</a>`
    : `<span class="page-btn page-next" aria-disabled="true" style="opacity:.4;cursor:default;">Next →</span>`;
  return `${prev}<span class="page-info">Page ${page} of ${totalPages}</span>${next}`;
}

async function renderListHtml(request, env, url, type, media) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const sort = url.searchParams.get("sort") || undefined;
  const data = await getPostsPage(env, { type, media, page, limit: 12, sort });
  const asset = await env.ASSETS.fetch(new Request(new URL("/list.html", url.origin), request));
  if (!asset.ok) return asset;

  let html = await asset.text();
  const meta = listMeta(type, media, data.page);
  const canonicalPath = listPathFor(type, media, data.page);
  const canonical = absoluteUrl(url.origin, canonicalPath);

  const displayTitle = media === "tv" ? "TV Shows" :
    type === "review" ? "Movie Reviews" :
    type === "article" ? "Articles" :
    type === "trending" ? "Trending Now" :
    type === "featured" ? "Featured" : "Movies";

  html = html.replace(/<main class="list-page">/i, `<main class="list-page" data-ssr="true">`);
  html = html.replace(/<h1 id="list-title">[\s\S]*?<\/h1>/i, `<h1 id="list-title">${escapeHtml(displayTitle)}</h1>`);
  html = html.replace(/<div class="grid grid-4" id="list-grid"><\/div>/i,
    `<div class="grid grid-4" id="list-grid">${data.posts.length ? renderListCards(data.posts, url.origin) : `<p class="list-empty">No posts here yet.</p>`}</div>`);
  html = html.replace(/<div id="list-pagination" class="pagination-controls"><\/div>/i,
    `<div id="list-pagination" class="pagination-controls">${renderPaginationLinks(type, media, data.page, data.totalPages)}</div>`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": meta.title,
    "description": meta.description,
    "url": canonical,
    "isPartOf": { "@type": "WebSite", "name": SITE_NAME, "url": url.origin },
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": data.total,
      "itemListElement": data.posts.map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "url": absoluteUrl(url.origin, publicPostPath(p)),
        "name": p.title
      }))
    }
  };

  html = addSeoHead(html, {
    title: meta.title,
    description: meta.description,
    canonical,
    jsonLd
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=60, s-maxage=300"
    }
  });
}

function renderPostMain(post, origin) {
  const metaParts = [];
  if (post.post_date) metaParts.push(`<span>📅 ${escapeHtml(post.post_date)}</span>`);
  if (post.year) metaParts.push(`<span>${escapeHtml(post.year)}</span>`);
  if (post.runtime) {
    const h = Math.floor(post.runtime / 60), m = post.runtime % 60;
    metaParts.push(`<span>${h ? `${h}h ${m}m` : `${m}m`}</span>`);
  }
  if (post.comments) metaParts.push(`<span>💬 ${escapeHtml(post.comments)} Comments</span>`);
  const rating = post.rating ?? post.score;
  if (rating != null) metaParts.push(`<span class="stars">⭐ ${escapeHtml(rating)}</span>`);

  const genres = (post.genres || "").split(",").map(g => g.trim()).filter(Boolean)
    .map(g => `<span>${escapeHtml(g)}</span>`).join("");
  const hero = post.backdrop || post.image;
  const watchProviders = (post.watch_providers || "").split(",").map(p => p.trim()).filter(Boolean);
  const watch = watchProviders.length || post.watch_link
    ? `<div class="watch-section"><h3>Where to Watch</h3>
      ${watchProviders.length ? `<div class="watch-pills">${watchProviders.map(name =>
        `<a href="${escapeHtml(post.watch_link || "#")}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`).join("")}</div>` : ""}
      <p class="watch-note">Availability may vary by region and change over time.
      ${post.watch_link ? `<a href="${escapeHtml(post.watch_link)}" target="_blank" rel="noopener">Check current availability →</a>` : ""}</p></div>`
    : `<div class="watch-section"><h3>Where to Watch</h3><p class="watch-note">Streaming availability isn't listed for this title yet.</p></div>`;

  return `<a href="/" class="back-link">← Back to home</a>
    ${hero ? `<img class="post-hero-img" src="${escapeHtml(hero)}" alt="${escapeHtml(post.title)}" loading="eager" decoding="async">` : ""}
    <h1>${escapeHtml(post.title)}</h1>
    ${post.tagline ? `<p class="tagline">${escapeHtml(post.tagline)}</p>` : ""}
    <div class="post-meta">${metaParts.join("")}</div>
    ${genres ? `<div class="genre-pills">${genres}</div>` : ""}
    ${post.trailer_key ? `<div class="trailer-wrap"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(post.trailer_key)}" title="${escapeHtml(post.title)} trailer" allowfullscreen loading="lazy"></iframe></div>` : ""}
    ${post.excerpt ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>` : ""}
    ${post.cast_names ? `<p class="cast-line"><strong>Starring:</strong> ${escapeHtml(post.cast_names)}</p>` : ""}
    ${watch}`;
}

async function renderPostHtml(request, env, url, id, mediaType) {
  const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!post || (mediaType && post.media_type !== mediaType)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=UTF-8" }
    });
  }

  const asset = await env.ASSETS.fetch(new Request(new URL("/post.html", url.origin), request));
  if (!asset.ok) return asset;
  let html = await asset.text();

  const canonical = absoluteUrl(url.origin, publicPostPath(post));
  const titleType = post.media_type === "tv" ? "TV Show" : "Movie";
  const title = `${post.title}${post.year ? ` (${post.year})` : ""} — ${titleType} Details & Where to Watch | ${SITE_NAME}`;
  const description = cleanMetaDescription(post);
  const image = post.backdrop || post.image || null;

  html = html.replace(/<main class="post-detail" id="post-detail">[\s\S]*?<\/main>/i,
    `<main class="post-detail" id="post-detail" data-ssr="true">${renderPostMain(post, url.origin)}</main>`);
  html = addSeoHead(html, {
    title,
    description,
    canonical,
    image: image ? absoluteUrl(url.origin, image) : null,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": post.media_type === "tv" ? "TVSeries" : "Movie",
      "name": post.title,
      "description": description,
      "url": canonical,
      ...(image ? { "image": [absoluteUrl(url.origin, image)] } : {}),
      ...(post.year ? { "dateCreated": `${post.year}-01-01` } : {}),
      ...(post.genres ? { "genre": post.genres.split(",").map(g => g.trim()).filter(Boolean) } : {}),
      ...(post.cast_names ? { "actor": post.cast_names.split(",").map(n => ({ "@type": "Person", "name": n.trim() })).filter(a => a.name) } : {}),
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": url.origin },
          { "@type": "ListItem", "position": 2, "name": titleType === "TV Show" ? "TV Shows" : "Movies", "item": absoluteUrl(url.origin, titleType === "TV Show" ? "/tv-shows" : "/movies") },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": canonical }
        ]
      }
    }
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=60, s-maxage=300"
    }
  });
}

async function renderRobots(origin) {
  return new Response(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: ${origin}/sitemap.xml
`, { headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}

async function renderSitemap(env, origin) {
  const urls = new Set([
    `${origin}/`,
    `${origin}/movies`,
    `${origin}/tv-shows`,
    `${origin}/reviews`,
    `${origin}/articles`
  ]);

  const { results } = await env.DB.prepare(
    "SELECT id, title, media_type, type FROM posts ORDER BY id ASC"
  ).all();

  for (const post of results || []) {
    if (!post.title) continue;
    if (post.media_type === "tv") urls.add(`${origin}${publicPostPath(post)}`);
    else if (post.type === "movie" || post.type === "review" || post.type === "featured") {
      urls.add(`${origin}${publicPostPath(post)}`);
    } else if (post.type === "article") {
      urls.add(`${origin}${publicPostPath(post)}`);
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls).map(u => `<url><loc>${escapeHtml(u)}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}


// ---------- Clean URL routing ----------
// Public routes are rendered with real D1 data so important content is present
// in the initial HTML response instead of requiring a browser-only API fetch.

const CLEAN_ROUTES = {
  "/about": "/about.html",
  "/contact": "/contact.html",
  "/write-for-us": "/write-for-us.html",
  "/privacy-policy": "/privacy-policy.html",
  "/terms": "/terms.html",
  "/disclaimer": "/disclaimer.html",
  "/dmca": "/dmca.html",
  "/sitemap": "/sitemap.html",
  "/admin": "/admin.html",
  "/search": "/search.html",
};

function rewriteCleanUrl(request, url) {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

  if (CLEAN_ROUTES[path]) {
    const target = new URL(CLEAN_ROUTES[path] + url.search, url.origin);
    return new Request(target.toString(), request);
  }

  return null;
}

async function handlePublicHtml(request, env, url) {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

  if (path === "/robots.txt") return renderRobots(url.origin);
  if (path === "/sitemap.xml") return renderSitemap(env, url.origin);

  if (path === "/movies") return renderListHtml(request, env, url, "movie", "movie");
  if (path === "/tv-shows") return renderListHtml(request, env, url, "movie", "tv");
  if (path === "/reviews") return renderListHtml(request, env, url, "review", null);
  if (path === "/articles") return renderListHtml(request, env, url, "article", null);
  if (path === "/trending") return renderListHtml(request, env, url, "trending", null);
  if (path === "/featured") return renderListHtml(request, env, url, "featured", null);

  // Preferred canonical form: /movie/123-title-slug or /tv/123-title-slug.
  // The numeric ID keeps this backward-compatible without requiring a DB schema migration.
  let match = path.match(/^\/movie\/(\d+)(?:-[a-z0-9-]+)?$/i);
  if (match) return renderPostHtml(request, env, url, Number(match[1]), "movie");

  match = path.match(/^\/tv\/(\d+)(?:-[a-z0-9-]+)?$/i);
  if (match) return renderPostHtml(request, env, url, Number(match[1]), "tv");

  // Legacy ID-only URLs continue to work.
  return null;
}

async function handleApi(request, env, url) {
  const { pathname } = url;

  // -- auth --
  if (pathname === "/api/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD) {
      return json({ error: "Server is missing ADMIN_PASSWORD secret." }, { status: 500 });
    }
    if (body.password !== env.ADMIN_PASSWORD) {
      return json({ error: "Wrong password." }, { status: 401 });
    }
    const token = await makeSessionToken(env.ADMIN_PASSWORD);
    return json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      }
    );
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    return json({ ok: true }, {
      headers: { "Set-Cookie": "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" },
    });
  }

  if (pathname === "/api/me" && request.method === "GET") {
    const ok = await requireAuth(request, env);
    return json({ authenticated: ok });
  }

  // -- image upload --
  if (pathname === "/api/upload" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    if (!env.IMAGES) {
      return json({ error: "Image storage (R2) isn't set up yet. See README.md." }, { status: 500 });
    }
    const form = await request.formData().catch(() => null);
    const file = form ? form.get("file") : null;
    if (!file || typeof file === "string") {
      return json({ error: "No file received." }, { status: 400 });
    }
    if (!file.type || !file.type.startsWith("image/")) {
      return json({ error: "Only image files are allowed." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: "Image is larger than 5MB." }, { status: 400 });
    }
    const key = makeImageKey(file.name);
    await env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    return json({ url: `/images/${key}` });
  }

  // -- manual trigger for testing the TMDB import (admin only) --
  if (pathname === "/api/import-tmdb" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    await importTrendingFromTMDB(env);
    return json({ ok: true });
  }

  // -- manual trigger for TV shows sync (admin only) --
  if (pathname === "/api/import-tmdb-tv" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    await importTVFromTMDB(env);
    return json({ ok: true });
  }

  // -- backfill missing movie details on old TMDB-imported posts (admin only) --
  if (pathname === "/api/backfill-tmdb" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    const result = await backfillTmdbDetails(env, 10);
    return json({ ok: true, ...result });
  }

  // -- search --
  if (pathname === "/api/search" && request.method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return json({ posts: [] });
    const like = `%${q}%`;
    const { results } = await env.DB.prepare(
      "SELECT * FROM posts WHERE type IN ('movie','review','article') AND (title LIKE ? OR excerpt LIKE ? OR genres LIKE ? OR cast_names LIKE ?) ORDER BY created_at DESC LIMIT 40"
    ).bind(like, like, like, like).all();
    return json({ posts: results });
  }

  // -- newsletter --
  if (pathname === "/api/subscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const email = (b.email || "").trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) return json({ error: "Please enter a valid email address." }, { status: 400 });
    try {
      await env.DB.prepare("INSERT INTO subscribers (email) VALUES (?)").bind(email).run();
    } catch (err) {
      // UNIQUE constraint = already subscribed; treat as success either way
      if (!String(err).includes("UNIQUE")) {
        return json({ error: "Could not save your subscription." }, { status: 500 });
      }
    }
    return json({ ok: true });
  }

  // -- TMDB search + one-off import (admin only) --
  if (pathname === "/api/tmdb-search" && request.method === "GET") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    if (!env.TMDB_API_KEY) return json({ error: "TMDB_API_KEY isn't set." }, { status: 500 });
    const q = (url.searchParams.get("q") || "").trim();
    const media = url.searchParams.get("media") === "tv" ? "tv" : "movie";
    if (!q) return json({ results: [] });
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${media}?api_key=${env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`
    );
    if (!res.ok) return json({ error: "TMDB search failed." }, { status: 502 });
    const data = await res.json();
    const results = (data.results || []).slice(0, 12).map(m => ({
      tmdb_id: m.id,
      media_type: media,
      title: media === "tv" ? (m.name || m.original_name) : (m.title || m.original_title),
      year: (media === "tv" ? m.first_air_date : m.release_date)?.slice(0, 4) || null,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
      rating: m.vote_average,
    }));
    return json({ results });
  }

  if (pathname === "/api/tmdb-import" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    if (!env.TMDB_API_KEY) return json({ error: "TMDB_API_KEY isn't set." }, { status: 500 });
    const b = await request.json().catch(() => ({}));
    const tmdbId = Number(b.tmdb_id);
    const media = b.media_type === "tv" ? "tv" : "movie";
    if (!tmdbId) return json({ error: "tmdb_id is required." }, { status: 400 });

    const already = await env.DB.prepare("SELECT id FROM posts WHERE tmdb_id = ? AND media_type = ?")
      .bind(tmdbId, media).first();
    if (already) return json({ ok: true, alreadyImported: true, id: already.id });

    const itemRes = await fetch(`https://api.themoviedb.org/3/${media}/${tmdbId}?api_key=${env.TMDB_API_KEY}`);
    if (!itemRes.ok) return json({ error: `Could not fetch this ${media} from TMDB.` }, { status: 502 });
    const item = await itemRes.json();

    const imageUrl = await getOrUploadPoster(env, item, media);
    const extra = await fetchTmdbExtras(env, tmdbId, media);
    const dateField = media === "tv" ? item.first_air_date : item.release_date;
    const year = dateField ? Number(dateField.slice(0, 4)) : null;
    const rating = typeof item.vote_average === "number" ? Math.round(item.vote_average * 10) / 10 : null;
    const excerpt = (item.overview || "").slice(0, 300);
    const title = media === "tv" ? (item.name || item.original_name) : (item.title || item.original_title);
    const industry = industryFromLanguage(item.original_language);

    const result = await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, tmdb_id, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link, media_type, industry, original_language) VALUES ('movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      title || "Untitled",
      excerpt, imageUrl, rating, rating, year, formatPostDate(new Date()), 0,
      `https://www.themoviedb.org/${media}/${tmdbId}`, tmdbId,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, media, industry, item.original_language || null
    ).run();

    return json({ ok: true, id: result.meta.last_row_id });
  }

  // -- posts --
  if (pathname === "/api/posts" && request.method === "GET") {
    const type = url.searchParams.get("type");
    const media = url.searchParams.get("media");
    const sort = url.searchParams.get("sort");
    const requestedLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 48);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));

    const data = await getPostsPage(env, { type, media, page, limit, sort });
    return json({
      posts: data.posts,
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages,
      hasNext: data.page < data.totalPages,
      hasPrev: data.page > 1
    });
  }

  if (pathname === "/api/posts" && request.method === "POST") {
    if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
    const b = await request.json().catch(() => ({}));
    if (!b.title || !ALLOWED_TYPES.includes(b.type)) {
      return json({ error: "title and a valid type are required." }, { status: 400 });
    }
    const result = await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      b.type, b.title, b.excerpt || null, b.image || null,
      b.score ?? null, b.rating ?? null, b.year ?? null,
      b.post_date || null, b.comments ?? 0, b.link || null,
      b.genres || null, b.runtime ?? null, b.tagline || null,
      b.backdrop || null, b.trailer_key || null, b.cast_names || null,
      b.watch_providers || null, b.watch_link || null
    ).run();
    return json({ ok: true, id: result.meta.last_row_id });
  }

  const singleMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (singleMatch) {
    const id = Number(singleMatch[1]);

    if (request.method === "GET") {
      const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
      if (!post) return json({ error: "Not found" }, { status: 404 });
      return json({ post });
    }

    if (request.method === "PUT") {
      if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
      const b = await request.json().catch(() => ({}));
      if (!b.title || !ALLOWED_TYPES.includes(b.type)) {
        return json({ error: "title and a valid type are required." }, { status: 400 });
      }
      await env.DB.prepare(
        "UPDATE posts SET type=?, title=?, excerpt=?, image=?, score=?, rating=?, year=?, post_date=?, comments=?, link=?, genres=?, runtime=?, tagline=?, backdrop=?, trailer_key=?, cast_names=?, watch_providers=?, watch_link=? WHERE id=?"
      ).bind(
        b.type, b.title, b.excerpt || null, b.image || null,
        b.score ?? null, b.rating ?? null, b.year ?? null,
        b.post_date || null, b.comments ?? 0, b.link || null,
        b.genres || null, b.runtime ?? null, b.tagline || null,
        b.backdrop || null, b.trailer_key || null, b.cast_names || null,
        b.watch_providers || null, b.watch_link || null, id
      ).run();
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      if (!(await requireAuth(request, env))) return json({ error: "Unauthorized" }, { status: 401 });
      await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error("API error:", err);
        return json({ error: String(err) }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/images/")) {
      return handleImage(request, env, url);
    }

    // Server-render important public pages for crawlability.
    try {
      const rendered = await handlePublicHtml(request, env, url);
      if (rendered) return rendered;
    } catch (err) {
      console.error("Public render error:", err);
      // Fall through to the existing static asset behavior rather than taking
      // the whole site down if a render fails.
    }

    const rewritten = rewriteCleanUrl(request, url);
    if (rewritten) return env.ASSETS.fetch(rewritten);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(importTrendingFromTMDB(env));
    ctx.waitUntil(importTVFromTMDB(env));
  },
};
