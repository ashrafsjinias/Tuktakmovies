// ---------- Small helpers ----------

function json(data, init = {}) {
return new Response(JSON.stringify(data), {
...init,
headers: {
"Content-Type": "application/json; charset=utf-8",
...(init.headers || {}),
},
});
}

function getCookie(request, name) {
const header = request.headers.get("Cookie") || "";
const match = header.match(
new RegExp("(?:^|; )" + name + "=([^;]+)")
);

return match
? decodeURIComponent(match[1])
: null;
}

async function hmac(secret, message) {
const enc = new TextEncoder();

const key = await crypto.subtle.importKey(
"raw",
enc.encode(secret),
{
name: "HMAC",
hash: "SHA-256",
},
false,
["sign"]
);

const sig = await crypto.subtle.sign(
"HMAC",
key,
enc.encode(message)
);

return btoa(
String.fromCharCode(
...new Uint8Array(sig)
)
);
}

async function makeSessionToken(secret) {
const expires =
Date.now()
+ 1000 * 60 * 60 * 24 * 7;

const sig =
await hmac(
secret,
String(expires)
);

return `${expires}.${sig}`;
}

async function isValidSession(token, secret) {
if (!token) {
return false;
}

const [expires, sig] =
token.split(".");

if (!expires || !sig) {
return false;
}

if (
Number(expires)
< Date.now()
) {
return false;
}

const expected =
await hmac(
secret,
expires
);

return expected === sig;
}

async function requireAuth(request, env) {
const token =
getCookie(
request,
"admin_session"
);

return isValidSession(
token,
env.ADMIN_PASSWORD
);
}

// ---------- Constants ----------

const ALLOWED_TYPES = [
"featured",
"review",
"movie",
"article",
"trending",
];

const MAX_UPLOAD_BYTES =
5 * 1024 * 1024;

// ---------- Industry helpers ----------

function industryFromLanguage(lang) {

if (!lang) {
return null;
}

const language =
String(lang)
.trim()
.toLowerCase();

if (language === "hi") {
return "Bollywood";
}

if (
[
"ta",
"te",
"ml",
"kn",
].includes(language)
) {
return "South Indian";
}

if (language === "en") {
return "Hollywood";
}

return null;
}

function normalizeIndustry(value) {

if (!value) {
return null;
}

const v =
String(value)
.trim()
.toLowerCase();

if (
v === "bollywood"
|| v === "india"
|| v === "hindi"
) {
return "Bollywood";
}

if (
v === "south indian"
|| v === "south india"
|| v === "tollywood"
) {
return "South Indian";
}

if (
v === "hollywood"
|| v === "usa"
|| v === "english"
) {
return "Hollywood";
}

return null;
}

// ---------- Image helpers ----------

function makeImageKey(filename) {

const extMatch =
/.([a-zA-Z0-9]+)$/
.exec(
filename || ""
);

const ext =
(
extMatch
? extMatch[1]
: "jpg"
)
.toLowerCase()
.replace(
/[^a-z0-9]/g,
""
)
|| "jpg";

return `${crypto.randomUUID()}.${ext}`;
}

// ---------- Serving uploaded images from R2 ----------

async function handleImage(
request,
env,
url
) {

if (!env.IMAGES) {
return new Response(
"Image storage isn't set up.",
{
status: 404,
}
);
}

const key =
decodeURIComponent(
url.pathname.replace(
/^/images//,
""
)
);

if (!key) {
return new Response(
"Not found",
{
status: 404,
}
);
}

const object =
await env.IMAGES.get(
key
);

if (!object) {
return new Response(
"Not found",
{
status: 404,
}
);
}

const headers =
new Headers();

object.writeHttpMetadata(
headers
);

headers.set(
"etag",
object.httpEtag
);

headers.set(
"Cache-Control",
"public, max-age=31536000, immutable"
);

return new Response(
object.body,
{
headers,
}
);
}

// ---------- TMDB auto-import ----------

const TMDB_IMPORT_LIMIT =
5;

const TMDB_POST_TYPE =
"movie";

function formatPostDate(date) {

return date.toLocaleDateString(
"en-US",
{
month: "long",
day: "numeric",
year: "numeric",
}
);

}

// ---------- TMDB extra details ----------

async function fetchTmdbExtras(
env,
tmdbId,
mediaType = "movie"
) {

const base =
mediaType === "tv"
? "tv"
: "movie";

let genres = null;
let runtime = null;
let tagline = null;
let backdropUrl = null;
let trailerKey = null;
let castNames = null;

try {

```
const detailRes =
  await fetch(
    `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${env.TMDB_API_KEY}&append_to_response=videos,credits`
  );


if (detailRes.ok) {

  const detail =
    await detailRes.json();


  genres =
    (detail.genres || [])
      .map(
        g => g.name
      )
      .join(", ")
    || null;


  runtime =
    mediaType === "tv"
      ? (
          Array.isArray(
            detail.episode_run_time
          )
          && detail.episode_run_time[0]
        )
        || null
      : detail.runtime
        || null;


  tagline =
    detail.tagline
    || null;


  castNames =
    (
      detail.credits?.cast
      || []
    )
    .slice(0, 5)
    .map(
      c => c.name
    )
    .join(", ")
    || null;


  const videos =
    detail.videos?.results
    || [];


  const trailer =
    videos.find(
      video =>
        video.site === "YouTube"
        && video.type === "Trailer"
    )
    || videos.find(
      video =>
        video.site === "YouTube"
    );


  trailerKey =
    trailer
      ? trailer.key
      : null;


  if (
    detail.backdrop_path
    && env.IMAGES
  ) {

    try {

      const backdropRes =
        await fetch(
          `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}`
        );


      if (
        backdropRes.ok
      ) {

        const key =
          `tmdb-${base}-${tmdbId}-backdrop.jpg`;


        await env.IMAGES.put(
          key,
          await backdropRes.arrayBuffer(),
          {
            httpMetadata: {
              contentType:
                backdropRes.headers.get(
                  "Content-Type"
                )
                || "image/jpeg",
            },
          }
        );


        backdropUrl =
          `/images/${key}`;

      }

    }

    catch (err) {

      console.log(
        "Backdrop fetch failed for",
        tmdbId,
        err
      );

    }

  }

}
```

}

catch (err) {

```
console.log(
  "Detail fetch failed for",
  tmdbId,
  err
);
```

}

let watchProviders =
null;

let watchLink =
null;

try {

```
const watchRes =
  await fetch(
    `https://api.themoviedb.org/3/${base}/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`
  );


if (
  watchRes.ok
) {

  const watchData =
    await watchRes.json();


  const region =
    watchData.results?.US
    || watchData.results?.GB
    || null;


  if (region) {

    const names =
      new Set();


    for (
      const group
      of [
        "flatrate",
        "rent",
        "buy",
      ]
    ) {

      (
        region[group]
        || []
      ).forEach(
        provider =>
          names.add(
            provider.provider_name
          )
      );

    }


    watchProviders =
      names.size
        ? Array.from(names)
            .join(", ")
        : null;


    watchLink =
      region.link
      || null;

  }

}
```

}

catch (err) {

```
console.log(
  "Watch providers fetch failed for",
  tmdbId,
  err
);
```

}

return {
genres,
runtime,
tagline,
backdropUrl,
trailerKey,
castNames,
watchProviders,
watchLink,
};

}

// ---------- Backfill missing details ----------

async function backfillTmdbDetails(
env,
limit = 10
) {

if (
!env.TMDB_API_KEY
|| !env.DB
) {
return {
updated: 0,
};
}

const {
results,
} =
await env.DB.prepare(
`       SELECT
        id,
        tmdb_id,
        media_type
      FROM posts
      WHERE
        tmdb_id IS NOT NULL
        AND (
          genres IS NULL
          OR genres = ''
        )
      LIMIT ?
      `
)
.bind(
limit
)
.all();

let updated =
0;

for (
const row
of results
) {

```
const extra =
  await fetchTmdbExtras(
    env,
    row.tmdb_id,
    row.media_type
    || "movie"
  );


await env.DB.prepare(
  `
  UPDATE posts
  SET
    genres = ?,
    runtime = ?,
    tagline = ?,
    backdrop = ?,
    trailer_key = ?,
    cast_names = ?,
    watch_providers = ?,
    watch_link = ?
  WHERE id = ?
  `
)
.bind(
  extra.genres,
  extra.runtime,
  extra.tagline,
  extra.backdropUrl,
  extra.trailerKey,
  extra.castNames,
  extra.watchProviders,
  extra.watchLink,
  row.id
)
.run();


updated++;
```

}

return {
updated,
};

}

// ---------- Poster helper ----------

async function getOrUploadPoster(
env,
item,
mediaType = "movie"
) {

const existing =
await env.DB.prepare(
`       SELECT image
      FROM posts
      WHERE
        tmdb_id = ?
        AND media_type = ?
        AND image IS NOT NULL
      LIMIT 1
      `
)
.bind(
item.id,
mediaType
)
.first();

if (
existing
&& existing.image
) {
return existing.image;
}

if (
!item.poster_path
|| !env.IMAGES
) {
return null;
}

try {

```
const posterRes =
  await fetch(
    `https://image.tmdb.org/t/p/w500${item.poster_path}`
  );


if (
  posterRes.ok
) {

  const key =
    `tmdb-${mediaType}-${item.id}.jpg`;


  await env.IMAGES.put(
    key,
    await posterRes.arrayBuffer(),
    {
      httpMetadata: {
        contentType:
          posterRes.headers.get(
            "Content-Type"
          )
          || "image/jpeg",
      },
    }
  );


  return `/images/${key}`;

}
```

}

catch (err) {

```
console.log(
  "Poster fetch failed for",
  item.id,
  err
);
```

}

return null;

}

// ---------- Featured ----------

async function upsertFeaturedFromTop(
env,
movie,
extra,
imageUrl
) {

const year =
movie.release_date
? Number(
movie.release_date
.slice(0, 4)
)
: null;

const rating =
typeof movie.vote_average
=== "number"
? Math.round(
movie.vote_average
* 10
) / 10
: null;

const excerpt =
(
movie.overview
|| ""
)
.slice(
0,
300
);

const postDate =
formatPostDate(
new Date()
);

const link =
`https://www.themoviedb.org/movie/${movie.id}`;

const title =
movie.title
|| movie.original_title
|| "Untitled";

const industry =
industryFromLanguage(
movie.original_language
);

const existing =
await env.DB.prepare(
`       SELECT id
      FROM posts
      WHERE type = 'featured'
      LIMIT 1
      `
)
.first();

if (existing) {

```
await env.DB.prepare(
  `
  UPDATE posts
  SET
    title = ?,
    excerpt = ?,
    image = ?,
    score = ?,
    rating = ?,
    year = ?,
    post_date = ?,
    comments = ?,
    link = ?,
    genres = ?,
    runtime = ?,
    tagline = ?,
    backdrop = ?,
    trailer_key = ?,
    cast_names = ?,
    watch_providers = ?,
    watch_link = ?,
    media_type = 'movie',
    industry = ?,
    original_language = ?
  WHERE id = ?
  `
)
.bind(
  title,
  excerpt,
  imageUrl,
  rating,
  rating,
  year,
  postDate,
  0,
  link,
  extra.genres,
  extra.runtime,
  extra.tagline,
  extra.backdropUrl,
  extra.trailerKey,
  extra.castNames,
  extra.watchProviders,
  extra.watchLink,
  industry,
  movie.original_language
    || null,
  existing.id
)
.run();
```

}

else {

```
await env.DB.prepare(
  `
  INSERT INTO posts (
    type,
    title,
    excerpt,
    image,
    score,
    rating,
    year,
    post_date,
    comments,
    link,
    genres,
    runtime,
    tagline,
    backdrop,
    trailer_key,
    cast_names,
    watch_providers,
    watch_link,
    media_type,
    industry,
    original_language
  )
  VALUES (
    'featured',
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie', ?, ?
  )
  `
)
.bind(
  title,
  excerpt,
  imageUrl,
  rating,
  rating,
  year,
  postDate,
  0,
  link,
  extra.genres,
  extra.runtime,
  extra.tagline,
  extra.backdropUrl,
  extra.trailerKey,
  extra.castNames,
  extra.watchProviders,
  extra.watchLink,
  industry,
  movie.original_language
    || null
)
.run();
```

}

}

// ---------- Movie TMDB import ----------

async function importTrendingFromTMDB(env) {

if (
!env.TMDB_API_KEY
) {

```
console.log(
  "TMDB_API_KEY not set — skipping scheduled import."
);

return;
```

}

if (
!env.DB
) {

```
console.log(
  "D1 (DB) not bound — skipping scheduled import."
);

return;
```

}

const SOURCE_ENDPOINTS = [

```
"https://api.themoviedb.org/3/trending/movie/day",

"https://api.themoviedb.org/3/trending/movie/week",

"https://api.themoviedb.org/3/movie/popular",

"https://api.themoviedb.org/3/movie/now_playing",
```

];

const PAGES_PER_SOURCE =
2;

const candidateMap =
new Map();

let trendingTop =
null;

for (
const base
of SOURCE_ENDPOINTS
) {

```
for (
  let page = 1;
  page <= PAGES_PER_SOURCE;
  page++
) {

  try {

    const res =
      await fetch(
        `${base}?api_key=${env.TMDB_API_KEY}&page=${page}`
      );


    if (
      !res.ok
    ) {
      continue;
    }


    const data =
      await res.json();


    const results =
      data.results
      || [];


    if (
      base.includes(
        "trending/movie/day"
      )
      && page === 1
      && results.length
    ) {

      trendingTop =
        results[0];

    }


    results.forEach(
      movie => {

        if (
          !candidateMap.has(
            movie.id
          )
        ) {

          candidateMap.set(
            movie.id,
            movie
          );

        }

      }
    );

  }

  catch (err) {

    console.log(
      "Candidate fetch failed:",
      base,
      page,
      err
    );

  }

}
```

}

const movies =
Array.from(
candidateMap.values()
);

if (
!movies.length
) {

```
console.log(
  "No candidate movies fetched from TMDB."
);

return;
```

}

let imported =
0;

for (
const movie
of movies
) {

```
if (
  imported
  >= TMDB_IMPORT_LIMIT
) {
  break;
}


const existing =
  await env.DB.prepare(
    `
    SELECT id
    FROM posts
    WHERE
      tmdb_id = ?
      AND media_type = 'movie'
    `
  )
  .bind(
    movie.id
  )
  .first();


if (existing) {
  continue;
}


const imageUrl =
  await getOrUploadPoster(
    env,
    movie,
    "movie"
  );


const extra =
  await fetchTmdbExtras(
    env,
    movie.id,
    "movie"
  );


const year =
  movie.release_date
    ? Number(
        movie.release_date
          .slice(0, 4)
      )
    : null;


const rating =
  typeof movie.vote_average
  === "number"
    ? Math.round(
        movie.vote_average
        * 10
      ) / 10
    : null;


const excerpt =
  (
    movie.overview
    || ""
  )
  .slice(
    0,
    300
  );


const industry =
  industryFromLanguage(
    movie.original_language
  );


await env.DB.prepare(
  `
  INSERT INTO posts (
    type,
    title,
    excerpt,
    image,
    score,
    rating,
    year,
    post_date,
    comments,
    link,
    tmdb_id,
    genres,
    runtime,
    tagline,
    backdrop,
    trailer_key,
    cast_names,
    watch_providers,
    watch_link,
    media_type,
    industry,
    original_language
  )
  VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie', ?, ?
  )
  `
)
.bind(
  TMDB_POST_TYPE,
  movie.title
    || movie.original_title
    || "Untitled",
  excerpt,
  imageUrl,
  rating,
  rating,
  year,
  formatPostDate(
    new Date()
  ),
  0,
  `https://www.themoviedb.org/movie/${movie.id}`,
  movie.id,
  extra.genres,
  extra.runtime,
  extra.tagline,
  extra.backdropUrl,
  extra.trailerKey,
  extra.castNames,
  extra.watchProviders,
  extra.watchLink,
  industry,
  movie.original_language
    || null
)
.run();


imported++;
```

}

const featuredPick =
trendingTop
|| movies[0];

if (
featuredPick
) {

```
const topImage =
  await getOrUploadPoster(
    env,
    featuredPick,
    "movie"
  );


const topExtra =
  await fetchTmdbExtras(
    env,
    featuredPick.id,
    "movie"
  );


await upsertFeaturedFromTop(
  env,
  featuredPick,
  topExtra,
  topImage
);
```

}

console.log(
`TMDB import finished: ${imported} new post(s) added.`
);

}

// ---------- TV import ----------

async function importTVFromTMDB(env) {

if (
!env.TMDB_API_KEY
|| !env.DB
) {
return;
}

const SOURCE_ENDPOINTS = [

```
"https://api.themoviedb.org/3/trending/tv/day",

"https://api.themoviedb.org/3/trending/tv/week",

"https://api.themoviedb.org/3/tv/popular",

"https://api.themoviedb.org/3/tv/top_rated",
```

];

const PAGES_PER_SOURCE =
2;

const candidateMap =
new Map();

for (
const base
of SOURCE_ENDPOINTS
) {

```
for (
  let page = 1;
  page <= PAGES_PER_SOURCE;
  page++
) {

  try {

    const res =
      await fetch(
        `${base}?api_key=${env.TMDB_API_KEY}&page=${page}`
      );


    if (
      !res.ok
    ) {
      continue;
    }


    const data =
      await res.json();


    (
      data.results
      || []
    )
    .forEach(
      show => {

        if (
          !candidateMap.has(
            show.id
          )
        ) {

          candidateMap.set(
            show.id,
            show
          );

        }

      }
    );

  }

  catch (err) {

    console.log(
      "TV candidate fetch failed:",
      base,
      page,
      err
    );

  }

}
```

}

const shows =
Array.from(
candidateMap.values()
);

if (
!shows.length
) {
return;
}

let imported =
0;

for (
const show
of shows
) {

```
if (
  imported
  >= TMDB_IMPORT_LIMIT
) {
  break;
}


const existing =
  await env.DB.prepare(
    `
    SELECT id
    FROM posts
    WHERE
      tmdb_id = ?
      AND media_type = 'tv'
    `
  )
  .bind(
    show.id
  )
  .first();


if (existing) {
  continue;
}


const imageUrl =
  await getOrUploadPoster(
    env,
    show,
    "tv"
  );


const extra =
  await fetchTmdbExtras(
    env,
    show.id,
    "tv"
  );


const year =
  show.first_air_date
    ? Number(
        show.first_air_date
          .slice(0, 4)
      )
    : null;


const rating =
  typeof show.vote_average
  === "number"
    ? Math.round(
        show.vote_average
        * 10
      ) / 10
    : null;


const excerpt =
  (
    show.overview
    || ""
  )
  .slice(
    0,
    300
  );


const title =
  show.name
  || show.original_name
  || "Untitled";


const industry =
  industryFromLanguage(
    show.original_language
  );


await env.DB.prepare(
  `
  INSERT INTO posts (
    type,
    title,
    excerpt,
    image,
    score,
    rating,
    year,
    post_date,
    comments,
    link,
    tmdb_id,
    genres,
    runtime,
    tagline,
    backdrop,
    trailer_key,
    cast_names,
    watch_providers,
    watch_link,
    media_type,
    industry,
    original_language
  )
  VALUES (
    'movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tv', ?, ?
  )
  `
)
.bind(
  title,
  excerpt,
  imageUrl,
  rating,
  rating,
  year,
  formatPostDate(
    new Date()
  ),
  0,
  `https://www.themoviedb.org/tv/${show.id}`,
  show.id,
  extra.genres,
  extra.runtime,
  extra.tagline,
  extra.backdropUrl,
  extra.trailerKey,
  extra.castNames,
  extra.watchProviders,
  extra.watchLink,
  industry,
  show.original_language
    || null
)
.run();


imported++;
```

}

console.log(
`TMDB TV import finished: ${imported} new show(s) added.`
);

}

// ---------- Clean URL routing ----------

const CLEAN_ROUTES = {

"/movies":
"/list.html?type=movie&media=movie",

"/reviews":
"/list.html?type=review",

"/articles":
"/list.html?type=article",

"/tv-shows":
"/list.html?type=movie&media=tv",

"/celebrities":
"/coming-soon.html?section=Celebrities",

"/top-lists":
"/coming-soon.html?section=Top%20Lists",

"/explainers":
"/coming-soon.html?section=Explainers",

"/industry-news":
"/coming-soon.html?section=Industry%20News",

"/about":
"/about.html",

"/contact":
"/contact.html",

"/write-for-us":
"/write-for-us.html",

"/privacy-policy":
"/privacy-policy.html",

"/terms":
"/terms.html",

"/disclaimer":
"/disclaimer.html",

"/dmca":
"/dmca.html",

"/sitemap":
"/sitemap.html",

"/admin":
"/admin.html",

"/search":
"/search.html",

};

function rewriteCleanUrl(
request,
url
) {

const path =
url.pathname.length > 1
? url.pathname.replace(
//$/,
""
)
: url.pathname;

if (
CLEAN_ROUTES[path]
) {

```
const target =
  new URL(
    CLEAN_ROUTES[path]
    + url.search,
    url.origin
  );


return new Request(
  target.toString(),
  request
);
```

}

const movieMatch =
path.match(
/^/movie/(\d+)$/
);

if (
movieMatch
) {

```
const target =
  new URL(
    `/post.html?id=${movieMatch[1]}`,
    url.origin
  );


return new Request(
  target.toString(),
  request
);
```

}

const tvMatch =
path.match(
/^/tv/(\d+)$/
);

if (
tvMatch
) {

```
const target =
  new URL(
    `/post.html?id=${tvMatch[1]}`,
    url.origin
  );


return new Request(
  target.toString(),
  request
);
```

}

const genreMatch =
path.match(
/^/genre/([a-zA-Z0-9-]+)$/
);

if (
genreMatch
) {

```
const target =
  new URL(
    `/genre.html?slug=${genreMatch[1]}`,
    url.origin
  );


return new Request(
  target.toString(),
  request
);
```

}

const industryMatch =
path.match(
/^/industry/([a-zA-Z0-9-]+)$/
);

if (
industryMatch
) {

```
const target =
  new URL(
    `/industry.html?slug=${industryMatch[1]}`,
    url.origin
  );


return new Request(
  target.toString(),
  request
);
```

}

return null;

}

// ---------- API ----------

async function handleApi(
request,
env,
url
) {

const {
pathname,
} =
url;

// ---------- Auth ----------

if (
pathname === "/api/login"
&& request.method === "POST"
) {

```
const body =
  await request.json()
    .catch(
      () => ({})
    );


if (
  !env.ADMIN_PASSWORD
) {

  return json(
    {
      error:
        "Server is missing ADMIN_PASSWORD secret.",
    },
    {
      status: 500,
    }
  );

}


if (
  body.password
  !== env.ADMIN_PASSWORD
) {

  return json(
    {
      error:
        "Wrong password.",
    },
    {
      status: 401,
    }
  );

}


const token =
  await makeSessionToken(
    env.ADMIN_PASSWORD
  );


return json(
  {
    ok: true,
  },
  {
    headers: {
      "Set-Cookie":
        `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
    },
  }
);
```

}

if (
pathname === "/api/logout"
&& request.method === "POST"
) {

```
return json(
  {
    ok: true,
  },
  {
    headers: {
      "Set-Cookie":
        "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    },
  }
);
```

}

if (
pathname === "/api/me"
&& request.method === "GET"
) {

```
const ok =
  await requireAuth(
    request,
    env
  );


return json({
  authenticated:
    ok,
});
```

}

// ---------- Upload ----------

if (
pathname === "/api/upload"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


if (
  !env.IMAGES
) {

  return json(
    {
      error:
        "Image storage (R2) isn't set up yet.",
    },
    {
      status: 500,
    }
  );

}


const form =
  await request.formData()
    .catch(
      () => null
    );


const file =
  form
    ? form.get(
        "file"
      )
    : null;


if (
  !file
  || typeof file === "string"
) {

  return json(
    {
      error:
        "No file received.",
    },
    {
      status: 400,
    }
  );

}


if (
  !file.type
  || !file.type.startsWith(
    "image/"
  )
) {

  return json(
    {
      error:
        "Only image files are allowed.",
    },
    {
      status: 400,
    }
  );

}


if (
  file.size
  > MAX_UPLOAD_BYTES
) {

  return json(
    {
      error:
        "Image is larger than 5MB.",
    },
    {
      status: 400,
    }
  );

}


const key =
  makeImageKey(
    file.name
  );


await env.IMAGES.put(
  key,
  await file.arrayBuffer(),
  {
    httpMetadata: {
      contentType:
        file.type,
    },
  }
);


return json({
  url:
    `/images/${key}`,
});
```

}

// ---------- TMDB imports ----------

if (
pathname === "/api/import-tmdb"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


await importTrendingFromTMDB(
  env
);


return json({
  ok: true,
});
```

}

if (
pathname === "/api/import-tmdb-tv"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


await importTVFromTMDB(
  env
);


return json({
  ok: true,
});
```

}

if (
pathname === "/api/backfill-tmdb"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


const result =
  await backfillTmdbDetails(
    env,
    10
  );


return json({
  ok: true,
  ...result,
});
```

}

// ---------- Industry backfill ----------

if (
pathname === "/api/backfill-industries"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


const {
  results,
} =
  await env.DB.prepare(
    `
    SELECT
      id,
      original_language
    FROM posts
    WHERE
      industry IS NULL
      OR industry = ''
    `
  )
  .all();


let updated =
  0;


for (
  const post
  of results
) {

  const industry =
    industryFromLanguage(
      post.original_language
    );


  if (
    !industry
  ) {
    continue;
  }


  await env.DB.prepare(
    `
    UPDATE posts
    SET industry = ?
    WHERE id = ?
    `
  )
  .bind(
    industry,
    post.id
  )
  .run();


  updated++;

}


return json({

  ok: true,

  updated,

  totalChecked:
    results.length,

});
```

}

// ---------- Search ----------

if (
pathname === "/api/search"
&& request.method === "GET"
) {

```
const q =
  (
    url.searchParams.get(
      "q"
    )
    || ""
  )
  .trim();


if (
  !q
) {

  return json({
    posts: [],
  });

}


const like =
  `%${q}%`;


const {
  results,
} =
  await env.DB.prepare(
    `
    SELECT *
    FROM posts
    WHERE
      type IN (
        'movie',
        'review',
        'article'
      )
      AND (
        title LIKE ?
        OR excerpt LIKE ?
        OR genres LIKE ?
        OR cast_names LIKE ?
      )
    ORDER BY id DESC
    LIMIT 40
    `
  )
  .bind(
    like,
    like,
    like,
    like
  )
  .all();


return json({
  posts:
    results,
});
```

}

// ---------- Newsletter ----------

if (
pathname === "/api/subscribe"
&& request.method === "POST"
) {

```
const body =
  await request.json()
    .catch(
      () => ({})
    );


const email =
  (
    body.email
    || ""
  )
  .trim()
  .toLowerCase();


const validEmail =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(
      email
    );


if (
  !validEmail
) {

  return json(
    {
      error:
        "Please enter a valid email address.",
    },
    {
      status: 400,
    }
  );

}


try {

  await env.DB.prepare(
    `
    INSERT INTO subscribers (
      email
    )
    VALUES (?)
    `
  )
  .bind(
    email
  )
  .run();

}

catch (err) {

  if (
    !String(err)
      .includes(
        "UNIQUE"
      )
  ) {

    return json(
      {
        error:
          "Could not save your subscription.",
      },
      {
        status: 500,
      }
    );

  }

}


return json({
  ok: true,
});
```

}

// ---------- TMDB search ----------

if (
pathname === "/api/tmdb-search"
&& request.method === "GET"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


if (
  !env.TMDB_API_KEY
) {

  return json(
    {
      error:
        "TMDB_API_KEY isn't set.",
    },
    {
      status: 500,
    }
  );

}


const q =
  (
    url.searchParams.get(
      "q"
    )
    || ""
  )
  .trim();


const media =
  url.searchParams.get(
    "media"
  )
  === "tv"
    ? "tv"
    : "movie";


if (
  !q
) {

  return json({
    results: [],
  });

}


const res =
  await fetch(
    `https://api.themoviedb.org/3/search/${media}?api_key=${env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`
  );


if (
  !res.ok
) {

  return json(
    {
      error:
        "TMDB search failed.",
    },
    {
      status: 502,
    }
  );

}


const data =
  await res.json();


const results =
  (
    data.results
    || []
  )
  .slice(
    0,
    12
  )
  .map(
    item => ({

      tmdb_id:
        item.id,

      media_type:
        media,

      title:
        media === "tv"
          ? (
              item.name
              || item.original_name
            )
          : (
              item.title
              || item.original_title
            ),

      year:
        (
          media === "tv"
            ? item.first_air_date
            : item.release_date
        )
        ?.slice(
          0,
          4
        )
        || null,

      poster:
        item.poster_path
          ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
          : null,

      rating:
        item.vote_average,

    })
  );


return json({
  results,
});
```

}

// ---------- One-off TMDB import ----------

if (
pathname === "/api/tmdb-import"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


if (
  !env.TMDB_API_KEY
) {

  return json(
    {
      error:
        "TMDB_API_KEY isn't set.",
    },
    {
      status: 500,
    }
  );

}


const body =
  await request.json()
    .catch(
      () => ({})
    );


const tmdbId =
  Number(
    body.tmdb_id
  );


const media =
  body.media_type
  === "tv"
    ? "tv"
    : "movie";


if (
  !tmdbId
) {

  return json(
    {
      error:
        "tmdb_id is required.",
    },
    {
      status: 400,
    }
  );

}


const already =
  await env.DB.prepare(
    `
    SELECT id
    FROM posts
    WHERE
      tmdb_id = ?
      AND media_type = ?
    `
  )
  .bind(
    tmdbId,
    media
  )
  .first();


if (
  already
) {

  return json({

    ok: true,

    alreadyImported:
      true,

    id:
      already.id,

  });

}


const itemRes =
  await fetch(
    `https://api.themoviedb.org/3/${media}/${tmdbId}?api_key=${env.TMDB_API_KEY}`
  );


if (
  !itemRes.ok
) {

  return json(
    {
      error:
        `Could not fetch this ${media} from TMDB.`,
    },
    {
      status: 502,
    }
  );

}


const item =
  await itemRes.json();


const imageUrl =
  await getOrUploadPoster(
    env,
    item,
    media
  );


const extra =
  await fetchTmdbExtras(
    env,
    tmdbId,
    media
  );


const dateField =
  media === "tv"
    ? item.first_air_date
    : item.release_date;


const year =
  dateField
    ? Number(
        dateField.slice(
          0,
          4
        )
      )
    : null;


const rating =
  typeof item.vote_average
  === "number"
    ? Math.round(
        item.vote_average
        * 10
      ) / 10
    : null;


const excerpt =
  (
    item.overview
    || ""
  )
  .slice(
    0,
    300
  );


const title =
  media === "tv"
    ? (
        item.name
        || item.original_name
      )
    : (
        item.title
        || item.original_title
      );


const industry =
  industryFromLanguage(
    item.original_language
  );


const result =
  await env.DB.prepare(
    `
    INSERT INTO posts (
      type,
      title,
      excerpt,
      image,
      score,
      rating,
      year,
      post_date,
      comments,
      link,
      tmdb_id,
      genres,
      runtime,
      tagline,
      backdrop,
      trailer_key,
      cast_names,
      watch_providers,
      watch_link,
      media_type,
      industry,
      original_language
    )
    VALUES (
      'movie',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    `
  )
  .bind(
    title
      || "Untitled",
    excerpt,
    imageUrl,
    rating,
    rating,
    year,
    formatPostDate(
      new Date()
    ),
    0,
    `https://www.themoviedb.org/${media}/${tmdbId}`,
    tmdbId,
    extra.genres,
    extra.runtime,
    extra.tagline,
    extra.backdropUrl,
    extra.trailerKey,
    extra.castNames,
    extra.watchProviders,
    extra.watchLink,
    media,
    industry,
    item.original_language
      || null
  )
  .run();


return json({

  ok: true,

  id:
    result.meta
      .last_row_id,

});
```

}

// ==========================================================
// POSTS API — UNLIMITED PAGINATION
// ==========================================================

if (
pathname === "/api/posts"
&& request.method === "GET"
) {

```
const type =
  url.searchParams.get(
    "type"
  );


const media =
  url.searchParams.get(
    "media"
  );


const industry =
  normalizeIndustry(
    url.searchParams.get(
      "industry"
    )
  );


const genre =
  (
    url.searchParams.get(
      "genre"
    )
    || ""
  )
  .trim();


const sort =
  url.searchParams.get(
    "sort"
  );


let page =
  Number(
    url.searchParams.get(
      "page"
    )
    || 1
  );


if (
  !Number.isFinite(
    page
  )
  || page < 1
) {

  page = 1;

}


page =
  Math.floor(
    page
  );


let limit =
  Number(
    url.searchParams.get(
      "limit"
    )
    || 24
  );


if (
  !Number.isFinite(
    limit
  )
  || limit < 1
) {

  limit = 24;

}


// Per-request safety limit only.
// Total number of pages/posts is unlimited.
limit =
  Math.min(
    Math.floor(
      limit
    ),
    100
  );


const offset =
  (
    page
    - 1
  )
  * limit;


const conditions =
  [];


const params =
  [];


if (
  type
) {

  conditions.push(
    "type = ?"
  );

  params.push(
    type
  );

}


if (
  media
) {

  conditions.push(
    "media_type = ?"
  );

  params.push(
    media
  );

}


if (
  industry
) {

  conditions.push(
    "industry = ?"
  );

  params.push(
    industry
  );

}


if (
  genre
) {

  conditions.push(
    "LOWER(genres) LIKE ?"
  );

  params.push(
    `%${genre.toLowerCase()}%`
  );

}


const where =
  conditions.length
    ? `WHERE ${conditions.join(
        " AND "
      )}`
    : "";


const orderBy =
  sort === "rating"
    ? `
      ORDER BY
        rating DESC,
        id DESC
      `
    : `
      ORDER BY
        id DESC
      `;


const countResult =
  await env.DB.prepare(
    `
    SELECT COUNT(*) AS total
    FROM posts
    ${where}
    `
  )
  .bind(
    ...params
  )
  .first();


const total =
  Number(
    countResult?.total
    || 0
  );


const totalPages =
  total > 0
    ? Math.ceil(
        total
        / limit
      )
    : 0;


const {
  results,
} =
  await env.DB.prepare(
    `
    SELECT *
    FROM posts
    ${where}
    ${orderBy}
    LIMIT ?
    OFFSET ?
    `
  )
  .bind(
    ...params,
    limit,
    offset
  )
  .all();


return json({

  posts:
    results
    || [],

  total,

  page,

  limit,

  totalPages,

  hasPrevious:
    page > 1,

  hasNext:
    page < totalPages,

});
```

}

// ---------- Create post ----------

if (
pathname === "/api/posts"
&& request.method === "POST"
) {

```
if (
  !(
    await requireAuth(
      request,
      env
    )
  )
) {

  return json(
    {
      error:
        "Unauthorized",
    },
    {
      status: 401,
    }
  );

}


const body =
  await request.json()
    .catch(
      () => ({})
    );


if (
  !body.title
  || !ALLOWED_TYPES.includes(
    body.type
  )
) {

  return json(
    {
      error:
        "title and a valid type are required.",
    },
    {
      status: 400,
    }
  );

}


const mediaType =
  body.media_type
  === "tv"
    ? "tv"
    : "movie";


const industry =
  normalizeIndustry(
    body.industry
  );


const result =
  await env.DB.prepare(
    `
    INSERT INTO posts (
      type,
      title,
      excerpt,
      image,
      score,
      rating,
      year,
      post_date,
      comments,
      link,
      genres,
      runtime,
      tagline,
      backdrop,
      trailer_key,
      cast_names,
      watch_providers,
      watch_link,
      media_type,
      industry,
      original_language
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    `
  )
  .bind(
    body.type,
    body.title,
    body.excerpt
      || null,
    body.image
      || null,
    body.score
      ?? null,
    body.rating
      ?? null,
    body.year
      ?? null,
    body.post_date
      || null,
    body.comments
      ?? 0,
    body.link
      || null,
    body.genres
      || null,
    body.runtime
      ?? null,
    body.tagline
      || null,
    body.backdrop
      || null,
    body.trailer_key
      || null,
    body.cast_names
      || null,
    body.watch_providers
      || null,
    body.watch_link
      || null,
    mediaType,
    industry,
    body.original_language
      || null
  )
  .run();


return json({

  ok: true,

  id:
    result.meta
      .last_row_id,

});
```

}

// ---------- Single post ----------

const singleMatch =
pathname.match(
/^/api/posts/(\d+)$/
);

if (
singleMatch
) {

```
const id =
  Number(
    singleMatch[1]
  );


if (
  request.method
  === "GET"
) {

  const post =
    await env.DB.prepare(
      `
      SELECT *
      FROM posts
      WHERE id = ?
      `
    )
    .bind(
      id
    )
    .first();


  if (
    !post
  ) {

    return json(
      {
        error:
          "Not found",
      },
      {
        status: 404,
      }
    );

  }


  return json({
    post,
  });

}


if (
  request.method
  === "PUT"
) {

  if (
    !(
      await requireAuth(
        request,
        env
      )
    )
  ) {

    return json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );

  }


  const body =
    await request.json()
      .catch(
        () => ({})
      );


  if (
    !body.title
    || !ALLOWED_TYPES.includes(
      body.type
    )
  ) {

    return json(
      {
        error:
          "title and a valid type are required.",
      },
      {
        status: 400,
      }
    );

  }


  const mediaType =
    body.media_type
    === "tv"
      ? "tv"
      : "movie";


  const industry =
    normalizeIndustry(
      body.industry
    );


  await env.DB.prepare(
    `
    UPDATE posts
    SET
      type = ?,
      title = ?,
      excerpt = ?,
      image = ?,
      score = ?,
      rating = ?,
      year = ?,
      post_date = ?,
      comments = ?,
      link = ?,
      genres = ?,
      runtime = ?,
      tagline = ?,
      backdrop = ?,
      trailer_key = ?,
      cast_names = ?,
      watch_providers = ?,
      watch_link = ?,
      media_type = ?,
      industry = ?,
      original_language = ?
    WHERE id = ?
    `
  )
  .bind(
    body.type,
    body.title,
    body.excerpt
      || null,
    body.image
      || null,
    body.score
      ?? null,
    body.rating
      ?? null,
    body.year
      ?? null,
    body.post_date
      || null,
    body.comments
      ?? 0,
    body.link
      || null,
    body.genres
      || null,
    body.runtime
      ?? null,
    body.tagline
      || null,
    body.backdrop
      || null,
    body.trailer_key
      || null,
    body.cast_names
      || null,
    body.watch_providers
      || null,
    body.watch_link
      || null,
    mediaType,
    industry,
    body.original_language
      || null,
    id
  )
  .run();


  return json({
    ok: true,
  });

}


if (
  request.method
  === "DELETE"
) {

  if (
    !(
      await requireAuth(
        request,
        env
      )
    )
  ) {

    return json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );

  }


  await env.DB.prepare(
    `
    DELETE FROM posts
    WHERE id = ?
    `
  )
  .bind(
    id
  )
  .run();


  return json({
    ok: true,
  });

}
```

}

return json(
{
error:
"Not found",
},
{
status: 404,
}
);

}

// ==========================================================
// WORKER
// ==========================================================

export default {

async fetch(
request,
env,
ctx
) {

```
const url =
  new URL(
    request.url
  );


if (
  url.pathname.startsWith(
    "/api/"
  )
) {

  try {

    return await handleApi(
      request,
      env,
      url
    );

  }

  catch (err) {

    console.error(
      err
    );


    return json(
      {
        error:
          String(err),
      },
      {
        status: 500,
      }
    );

  }

}


if (
  url.pathname.startsWith(
    "/images/"
  )
) {

  return handleImage(
    request,
    env,
    url
  );

}


const rewritten =
  rewriteCleanUrl(
    request,
    url
  );


if (
  rewritten
) {

  return env.ASSETS.fetch(
    rewritten
  );

}


return env.ASSETS.fetch(
  request
);
```

},

async scheduled(
event,
env,
ctx
) {

```
ctx.waitUntil(
  importTrendingFromTMDB(
    env
  )
);


ctx.waitUntil(
  importTVFromTMDB(
    env
  )
);
```

},

};
