// ---------- Data loading ----------
async function fetchPosts(type, limit, media) {
  try {
    const qs = new URLSearchParams({ type, limit: String(limit || 20) });
    if (media) qs.set("media", media);
    const res = await fetch(`/api/posts?${qs.toString()}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

// ---------- Render helpers ----------
function thumbHtml(post, scoreBadge) {
  const img = post.image
    ? `<img src="${post.image}" alt="${post.title} poster" loading="lazy">`
    : `<div class="no-image">${post.title}</div>`;
  const badge = scoreBadge && post.score != null ? `<span class="score">${post.score}</span>` : "";
  return `<div class="thumb">${img}${badge}</div>`;
}

// Wraps a card's inner HTML in a link to /movie/:id or /tv/:id when the post
// has a real database id.
function cardWrap(post, innerHtml) {
  if (!post.id) return `<article class="card">${innerHtml}</article>`;
  const href = post.media_type === "tv" ? `/tv/${post.id}` : `/movie/${post.id}`;
  return `<a class="card" href="${href}">${innerHtml}</a>`;
}

function renderReviews(items) {
  const el = document.getElementById("reviews-grid");
  el.innerHTML = items.map(r => cardWrap(r, `
      ${thumbHtml(r, true)}
      <div class="body">
        <h3>${r.title}</h3>
        <div class="sub"><span>📅 ${r.post_date || ""}</span><span>💬 ${r.comments || 0}</span></div>
      </div>`)).join("");
}

function renderMovies(items, targetId = "movies-grid") {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = items.map(m => cardWrap(m, `
      ${thumbHtml(m, false)}
      <div class="body">
        <h3>${m.title}</h3>
        <div class="sub"><span>${m.year || ""}</span><span class="stars">⭐ ${m.rating ?? "—"}</span></div>
      </div>`)).join("");
}

function renderArticles(items) {
  const el = document.getElementById("articles-grid");
  el.innerHTML = items.map(a => cardWrap(a, `
      ${thumbHtml(a, false)}
      <div class="body">
        <h3>${a.title}</h3>
        <div class="sub"><span>📅 ${a.post_date || ""}</span><span>💬 ${a.comments || 0}</span></div>
      </div>`)).join("");
}

function renderTrending(items) {
  const el = document.getElementById("trending-list");
  el.innerHTML = items.map((t, i) => {
    const inner = `
      <span class="num">${i + 1}</span>
      <div class="thumb" style="width:52px;height:52px;">${t.image ? `<img src="${t.image}" alt="${t.title}" loading="lazy">` : `<div class="no-image" style="font-size:9px;">${t.title.slice(0,2)}</div>`}</div>
      <div>
        <h4>${t.title}</h4>
        <time>${t.post_date || ""}</time>
      </div>`;
    return t.id
      ? `<li><a href="/movie/${t.id}" style="display:flex;gap:12px;align-items:flex-start;">${inner}</a></li>`
      : `<li>${inner}</li>`;
  }).join("");
}

async function renderHero() {
  try {
    const res = await fetch("/api/posts?type=featured&limit=1");
    const data = res.ok ? await res.json() : { posts: [] };
    const post = data.posts && data.posts[0];
    if (!post) return; // no Featured post yet — hero stays hidden, no fake content shown

    document.querySelector("#hero-content h1").textContent = post.title;
    document.querySelector("#hero-content p").textContent = post.excerpt || "";
    document.querySelector("#hero-content .meta-row").innerHTML = `
      <span>📅 ${post.post_date || ""}</span>
      <span>💬 ${post.comments || 0} Comments</span>
      <span class="rating-inline">⭐ ${post.rating ?? "—"}/10</span>`;
    const heroHref = post.id
      ? (post.media_type === "tv" ? `/tv/${post.id}` : `/movie/${post.id}`)
      : (post.link || "#");
    document.querySelector("#hero-content .btn").href = heroHref;
    if (post.image) {
      const media = document.getElementById("hero-media");
      media.style.backgroundImage = `url('${post.image}')`;
      media.style.backgroundSize = "cover";
      media.style.backgroundPosition = "center";
    }
    document.getElementById("home").hidden = false;
  } catch {
    // keep hero hidden — never fall back to fake content
  }
}

async function renderTop10() {
  const items = await fetchPosts("movie", 100, "movie");
  const sorted = [...items]
    .filter(m => m.rating != null)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);
  renderMovies(sorted.length ? sorted : items.slice(0, 10), "top10-grid");
}

const GENRE_TABS = [
  { label: "Action", match: "Action" },
  { label: "Comedy", match: "Comedy" },
  { label: "Drama", match: "Drama" },
  { label: "Horror", match: "Horror" },
  { label: "Sci-Fi", match: "Science Fiction" },
  { label: "Animation", match: "Animation" },
];
let allMoviesForGenres = [];

function renderGenreGrid(genre) {
  const filtered = allMoviesForGenres.filter(m => (m.genres || "").toLowerCase().includes(genre.match.toLowerCase()));
  renderMovies(filtered.length ? filtered.slice(0, 12) : [], "genre-grid");
  if (!filtered.length) {
    document.getElementById("genre-grid").innerHTML =
      `<p style="color:var(--ink-soft);grid-column:1/-1;padding:20px 0;">No ${genre.label} movies yet — check back after the next sync.</p>`;
  }
}

async function renderGenreSection() {
  allMoviesForGenres = await fetchPosts("movie", 100, "movie");
  const tabsEl = document.getElementById("genre-tabs");
  tabsEl.innerHTML = GENRE_TABS.map((g, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-label="${g.label}">${g.label}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const genre = GENRE_TABS.find(g => g.label === btn.dataset.label);
      renderGenreGrid(genre);
    });
  });
  renderGenreGrid(GENRE_TABS[0]);
}

async function renderTVShows() {
  const items = await fetchPosts("movie", 6, "tv");
  renderMovies(items, "tv-grid");
}

const INDUSTRY_TABS = [
  { label: "Bollywood", match: "Bollywood" },
  { label: "Hollywood", match: "Hollywood" },
  { label: "South Indian", match: "South Indian" },
  { label: "Bengali", match: " Bengali" },
  { label: "Korean", match: " Korean" },
  { label: "Japanese", match: "Japanese" },
   
];
let allItemsForIndustry = [];

function renderIndustryGrid(industry) {
  const filtered = allItemsForIndustry.filter(m => m.industry === industry.match);
  renderMovies(filtered.length ? filtered.slice(0, 12) : [], "industry-grid");
  if (!filtered.length) {
    document.getElementById("industry-grid").innerHTML =
      `<p style="color:var(--ink-soft);grid-column:1/-1;padding:20px 0;">No ${industry.label} titles yet — check back after the next sync.</p>`;
  }
}

async function renderIndustrySection() {
  // Includes both movies and TV shows (both stored under type='movie').
  allItemsForIndustry = await fetchPosts("movie", 200);
  const tabsEl = document.getElementById("industry-tabs-home");
  tabsEl.innerHTML = INDUSTRY_TABS.map((g, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-label="${g.label}">${g.label}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const industry = INDUSTRY_TABS.find(g => g.label === btn.dataset.label);
      renderIndustryGrid(industry);
    });
  });
  renderIndustryGrid(INDUSTRY_TABS[0]);
}

// ---------- UI behaviour ----------
function initHeader() {
  const dateEl = document.getElementById("today-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  const searchToggle = document.getElementById("search-toggle");
  const searchPanel = document.getElementById("search-panel");
  searchToggle?.addEventListener("click", () => searchPanel.classList.toggle("open"));

  const navToggle = document.getElementById("nav-toggle");
  const mainNav = document.getElementById("main-nav");
  navToggle?.addEventListener("click", () => {
    mainNav.classList.toggle("nav-open");
  });

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function initNewsletter() {
  const form = document.getElementById("newsletter-form");
  const note = document.getElementById("newsletter-note");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput?.value.trim();
    note.textContent = "Subscribing…";
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        note.textContent = data.error || "Couldn't subscribe right now.";
        return;
      }
      note.textContent = "Thanks for subscribing! 🎬";
      form.reset();
    } catch {
      note.textContent = "Couldn't reach the server — please try again.";
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initHeader();
  initNewsletter();
  renderHero();
  renderReviews(await fetchPosts("review", 4));
  renderMovies(await fetchPosts("movie", 6, "movie"));
  renderArticles(await fetchPosts("article", 4));
  renderTrending(await fetchPosts("trending", 5));
  renderTop10();
  renderGenreSection();
  renderTVShows();
  renderIndustrySection();
});
