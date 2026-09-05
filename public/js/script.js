// ---------- Fallback/demo content ----------
// Used only if the API isn't reachable yet (e.g. you haven't set up
// D1 and deployed the Worker). Once posts exist in the database,
// these are ignored automatically.

const demo = {
  featured: {
    title: "Skyline Protocol — A Sequel That Earns Its Wings",
    excerpt: "A high-altitude sequel that pushes practical stunt work and character stakes further than the original, without losing what made it soar.",
    post_date: "May 23, 2025", comments: 12, rating: 8.6, link: "#",
  },
  review: [
    { title: "Skyline Protocol", score: 8.2, post_date: "May 22, 2025", comments: 8 },
    { title: "Nebula Guardians Vol. 3", score: 8.0, post_date: "May 21, 2025", comments: 5 },
    { title: "The Cinnamon Files", score: 9.1, post_date: "May 20, 2025", comments: 14 },
    { title: "Doctor Arcane: Multiverse Rift", score: 7.6, post_date: "May 19, 2025", comments: 7 },
  ],
  movie: [
    { title: "Iron Ledger", year: 2023, rating: 7.1 },
    { title: "Silent Wick: Chapter 4", year: 2023, rating: 7.8 },
    { title: "Web-Slinger: Across Realms", year: 2023, rating: 8.7 },
    { title: "The Coral Tide", year: 2023, rating: 6.9 },
    { title: "The Streak", year: 2023, rating: 6.8 },
    { title: "Autobots: Rise of the Beasts", year: 2023, rating: 7.0 },
  ],
  article: [
    { title: "10 Best Sci-Fi Movies You Must Watch", post_date: "May 18, 2025", comments: 11 },
    { title: "Top 15 Hollywood Actors of All Time", post_date: "May 16, 2025", comments: 8 },
    { title: "How Movie Ratings Are Calculated", post_date: "May 15, 2025", comments: 6 },
    { title: "Upcoming Movies You Can't Miss", post_date: "May 14, 2025", comments: 9 },
  ],
  trending: [
    { title: "A Masterclass in Modern Cinema", post_date: "May 21, 2025" },
    { title: "The Best Korean Movies You Shouldn't Miss", post_date: "May 19, 2025" },
    { title: "Why Twist Endings Still Work", post_date: "May 18, 2025" },
    { title: "Best Horror Movies That Will Haunt You", post_date: "May 17, 2025" },
    { title: "A Timeless Classic Revisited", post_date: "May 16, 2025" },
  ],
};

// ---------- Data loading ----------
async function fetchPosts(type, limit) {
  try {
    const res = await fetch(`/api/posts?type=${type}&limit=${limit || 20}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    return data.posts && data.posts.length ? data.posts : demo[type] || [];
  } catch {
    return demo[type] || [];
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

// Wraps a card's inner HTML in a link to post.html?id=... when the post has
// a real database id (demo/fallback posts have no id, so they stay static).
function cardWrap(post, innerHtml) {
  return post.id
    ? `<a class="card" href="/movie/${post.id}">${innerHtml}</a>`
    : `<article class="card">${innerHtml}</article>`;
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
    const post = (data.posts && data.posts[0]) || demo.featured;
    document.querySelector("#hero-content h1").textContent = post.title;
    document.querySelector("#hero-content p").textContent = post.excerpt || "";
    document.querySelector("#hero-content .meta-row").innerHTML = `
      <span>📅 ${post.post_date || ""}</span>
      <span>💬 ${post.comments || 0} Comments</span>
      <span class="rating-inline">⭐ ${post.rating ?? "—"}/10</span>`;
    document.querySelector("#hero-content .btn").href = post.link || "#";
    if (post.image) {
      const media = document.getElementById("hero-media");
      media.style.backgroundImage = `url('${post.image}')`;
      media.style.backgroundSize = "cover";
      media.style.backgroundPosition = "center";
    }
  } catch {
    // keep default markup already in the HTML
  }
}

async function renderTop10() {
  const items = await fetchPosts("movie", 100);
  const sorted = [...items]
    .filter(m => m.rating != null)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);
  renderMovies(sorted.length ? sorted : items.slice(0, 10), "top10-grid");
}

const GENRE_TABS = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Animation"];
let allMoviesForGenres = [];

function renderGenreGrid(genre) {
  const filtered = allMoviesForGenres.filter(m => (m.genres || "").includes(genre));
  renderMovies(filtered.length ? filtered.slice(0, 12) : [], "genre-grid");
  if (!filtered.length) {
    document.getElementById("genre-grid").innerHTML =
      `<p style="color:var(--ink-soft);grid-column:1/-1;padding:20px 0;">No ${genre} movies yet — check back after the next sync.</p>`;
  }
}

async function renderGenreSection() {
  allMoviesForGenres = await fetchPosts("movie", 100);
  const tabsEl = document.getElementById("genre-tabs");
  tabsEl.innerHTML = GENRE_TABS.map((g, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-genre="${g}">${g}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGenreGrid(btn.dataset.genre);
    });
  });
  renderGenreGrid(GENRE_TABS[0]);
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
  renderMovies(await fetchPosts("movie", 6));
  renderArticles(await fetchPosts("article", 4));
  renderTrending(await fetchPosts("trending", 5));
  renderTop10();
  renderGenreSection();
});
