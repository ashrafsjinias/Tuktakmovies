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

  // -- posts --
  if (pathname === "/api/posts" && request.method === "GET") {
    const type = url.searchParams.get("type");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    let stmt;
    if (type) {
      stmt = env.DB.prepare(
        "SELECT * FROM posts WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT ?"
      ).bind(type, limit);
    } else {
      stmt = env.DB.prepare("SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT ?").bind(limit);
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
      `INSERT INTO posts (type, title, excerpt, image, score, rating, year, post_date, comments, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      b.type, b.title, b.excerpt || null, b.image || null,
      b.score ?? null, b.rating ?? null, b.year ?? null,
      b.post_date || null, b.comments ?? 0, b.link || null
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
        `UPDATE posts SET type=?, title=?, excerpt=?, image=?, score=?, rating=?, year=?, post_date=?, comments=?, link=?
         WHERE id=?`
      ).bind(
        b.type, b.title, b.excerpt || null, b.image || null,
        b.score ?? null, b.rating ?? null, b.year ?? null,
        b.post_date || null, b.comments ?? 0, b.link || null, id
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
    return env.ASSETS.fetch(request);
  },
};
