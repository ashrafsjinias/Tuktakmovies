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

// Fetches genres/runtime/tagline/backdrop/trailer/cast + watch-provider info
// for one TMDB movie id. Used by both the fresh import and the backfill
// (for movies that were imported before these fields existed).
async function fetchTmdbExtras(env, tmdbId) {
  let genres = null, runtime = null, tagline = null, backdropUrl = null, trailerKey = null, castNames = null;
  try {
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${env.TMDB_API_KEY}&append_to_response=videos,credits`
    );
    if (detailRes.ok) {
      const detail = await detailRes.json();
      genres = (detail.genres || []).map(g => g.name).join(", ") || null;
      runtime = detail.runtime || null;
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
            const bKey = `tmdb-${tmdbId}-backdrop.jpg`;
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

  // Where to Watch — TMDB's watch/providers endpoint is movie-specific and
  // region-aware (powered by JustWatch). We default to the US region; the
  // returned "link" already points at a page showing real availability,
  // so we never invent a generic Netflix/Prime link.
  let watchProviders = null, watchLink = null;
  try {
    const wRes = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`
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
    "SELECT id, tmdb_id FROM posts WHERE tmdb_id IS NOT NULL AND (genres IS NULL OR genres = '') LIMIT ?"
  ).bind(limit).all();

  let updated = 0;
  for (const row of results) {
    const extra = await fetchTmdbExtras(env, row.tmdb_id);
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
async function getOrUploadPoster(env, movie) {
  const existing = await env.DB.prepare(
    "SELECT image FROM posts WHERE tmdb_id = ? AND image IS NOT NULL LIMIT 1"
  ).bind(movie.id).first();
  if (existing && existing.image) return existing.image;

  if (!movie.poster_path || !env.IMAGES) return null;
  try {
    const posterRes = await fetch(`https://image.tmdb.org/t/p/w500${movie.poster_path}`);
    if (posterRes.ok) {
      const key = `tmdb-${movie.id}.jpg`;
      await env.IMAGES.put(key, await posterRes.arrayBuffer(), {
        httpMetadata: { contentType: posterRes.headers.get("Content-Type") || "image/jpeg" },
      });
      return `/images/${key}`;
    }
  } catch (err) {
    console.log("Poster fetch failed for", movie.id, err);
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

  const existing = await env.DB.prepare("SELECT id FROM posts WHERE type = 'featured' LIMIT 1").first();

  // NOTE: tmdb_id is intentionally left out here (not set to movie.id).
  // The same TMDB movie already has its own row in the "movie" grid with
  // that tmdb_id, and tmdb_id must stay unique across all posts — so the
  // featured slot is matched by type='featured' instead, not by tmdb_id.
  if (existing) {
    await env.DB.prepare(
      "UPDATE posts SET title=?, excerpt=?, image=?, score=?, rating=?, year=?, post_date=?, comments=?, link=?, genres=?, runtime=?, tagline=?, backdrop=?, trailer_key=?, cast_names=?, watch_providers=?, watch_link=? WHERE id=?"
    ).bind(
      title, excerpt, imageUrl, rating, rating, year, postDate, 0, link,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink, existing.id
    ).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link) VALUES ('featured', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      title, excerpt, imageUrl, rating, rating, year, postDate, 0, link,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink
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

    const existing = await env.DB.prepare("SELECT id FROM posts WHERE tmdb_id = ?")
      .bind(movie.id)
      .first();
    if (existing) continue; // already imported before

    const imageUrl = await getOrUploadPoster(env, movie);

    // Extra details (genres, runtime, tagline, backdrop, trailer, cast, watch info)
    const extra = await fetchTmdbExtras(env, movie.id);

    const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
    const rating = typeof movie.vote_average === "number" ? Math.round(movie.vote_average * 10) / 10 : null;
    const excerpt = (movie.overview || "").slice(0, 300);

    await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, tmdb_id, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
      extra.watchProviders, extra.watchLink
    ).run();

    imported++;
  }

  // Keep the homepage hero banner pointed at the actual #1 on trending/day
  // (falls back to the first candidate if that specific fetch failed above).
  const featuredPick = trendingTop || movies[0];
  if (featuredPick) {
    const topImage = await getOrUploadPoster(env, featuredPick);
    const topExtra = await fetchTmdbExtras(env, featuredPick.id);
    await upsertFeaturedFromTop(env, featuredPick, topExtra, topImage);
  }

  console.log(`TMDB import finished: ${imported} new post(s) added.`);
}

// ---------- Clean URL routing ----------
// Maps pretty paths to the existing static files/pages. No new pages are
// created here — this only lets the browser show a clean URL (e.g. /movies)
// while the existing list.html / about.html / etc. keep doing the work.

const CLEAN_ROUTES = {
  "/movies": "/list.html?type=movie",
  "/reviews": "/list.html?type=review",
  "/articles": "/list.html?type=article",
  "/tv-shows": "/coming-soon.html?section=TV%20Shows",
  "/celebrities": "/coming-soon.html?section=Celebrities",
  "/top-lists": "/coming-soon.html?section=Top%20Lists",
  "/explainers": "/coming-soon.html?section=Explainers",
  "/industry-news": "/coming-soon.html?section=Industry%20News",
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

  const movieMatch = path.match(/^\/movie\/(\d+)$/);
  if (movieMatch) {
    const target = new URL(`/post.html?id=${movieMatch[1]}`, url.origin);
    return new Request(target.toString(), request);
  }

  const genreMatch = path.match(/^\/genre\/([a-zA-Z0-9-]+)$/);
  if (genreMatch) {
    const name = genreMatch[1].replace(/-/g, " ");
    const target = new URL(`/coming-soon.html?section=${encodeURIComponent(name)}`, url.origin);
    return new Request(target.toString(), request);
  }

  return null;
}

// ---------- API ----------

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
    if (!q) return json({ results: [] });
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`
    );
    if (!res.ok) return json({ error: "TMDB search failed." }, { status: 502 });
    const data = await res.json();
    const results = (data.results || []).slice(0, 12).map(m => ({
      tmdb_id: m.id,
      title: m.title || m.original_title,
      year: m.release_date ? m.release_date.slice(0, 4) : null,
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
    if (!tmdbId) return json({ error: "tmdb_id is required." }, { status: 400 });

    const already = await env.DB.prepare("SELECT id FROM posts WHERE tmdb_id = ?").bind(tmdbId).first();
    if (already) return json({ ok: true, alreadyImported: true, id: already.id });

    const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${env.TMDB_API_KEY}`);
    if (!movieRes.ok) return json({ error: "Could not fetch this movie from TMDB." }, { status: 502 });
    const movie = await movieRes.json();

    const imageUrl = await getOrUploadPoster(env, movie);
    const extra = await fetchTmdbExtras(env, tmdbId);
    const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
    const rating = typeof movie.vote_average === "number" ? Math.round(movie.vote_average * 10) / 10 : null;
    const excerpt = (movie.overview || "").slice(0, 300);

    const result = await env.DB.prepare(
      "INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link, tmdb_id, genres, runtime, tagline, backdrop, trailer_key, cast_names, watch_providers, watch_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      TMDB_POST_TYPE,
      movie.title || movie.original_title || "Untitled",
      excerpt, imageUrl, rating, rating, year, formatPostDate(new Date()), 0,
      `https://www.themoviedb.org/movie/${tmdbId}`, tmdbId,
      extra.genres, extra.runtime, extra.tagline, extra.backdropUrl, extra.trailerKey, extra.castNames,
      extra.watchProviders, extra.watchLink
    ).run();

    return json({ ok: true, id: result.meta.last_row_id });
  }

  // -- posts --
  if (pathname === "/api/posts" && request.method === "GET") {
    const type = url.searchParams.get("type");
    const sort = url.searchParams.get("sort"); // "rating" or default (newest first)
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const orderBy = sort === "rating"
      ? "ORDER BY rating DESC, created_at DESC"
      : "ORDER BY created_at DESC, id DESC";
    let stmt;
    if (type) {
      stmt = env.DB.prepare(`SELECT * FROM posts WHERE type = ? ${orderBy} LIMIT ?`).bind(type, limit);
    } else {
      stmt = env.DB.prepare(`SELECT * FROM posts ${orderBy} LIMIT ?`).bind(limit);
    }
    const { results } = await stmt.all();
    return json({ posts: results });
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
        return json({ error: String(err) }, { status: 500 });
      }
    }
    if (url.pathname.startsWith("/images/")) {
      return handleImage(request, env, url);
    }
    const rewritten = rewriteCleanUrl(request, url);
    if (rewritten) return env.ASSETS.fetch(rewritten);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(importTrendingFromTMDB(env));
  },
};
