
// ---------- Fallback/demo content ----------
// Used only if the API isn't reachable yet.

const demo = {
  featured: {
    title: "Skyline Protocol — A Sequel That Earns Its Wings",
    excerpt:
      "A high-altitude sequel that pushes practical stunt work and character stakes further than the original, without losing what made it soar.",
    post_date: "May 23, 2025",
    comments: 12,
    rating: 8.6,
    link: "#",
  },

  review: [
    {
      title: "Skyline Protocol",
      score: 8.2,
      post_date: "May 22, 2025",
      comments: 8,
    },
    {
      title: "Nebula Guardians Vol. 3",
      score: 8.0,
      post_date: "May 21, 2025",
      comments: 5,
    },
    {
      title: "The Cinnamon Files",
      score: 9.1,
      post_date: "May 20, 2025",
      comments: 14,
    },
    {
      title: "Doctor Arcane: Multiverse Rift",
      score: 7.6,
      post_date: "May 19, 2025",
      comments: 7,
    },
  ],

  movie: [
    {
      title: "Iron Ledger",
      year: 2023,
      rating: 7.1,
    },
    {
      title: "Silent Wick: Chapter 4",
      year: 2023,
      rating: 7.8,
    },
    {
      title: "Web-Slinger: Across Realms",
      year: 2023,
      rating: 8.7,
    },
    {
      title: "The Coral Tide",
      year: 2023,
      rating: 6.9,
    },
    {
      title: "The Streak",
      year: 2023,
      rating: 6.8,
    },
    {
      title: "Autobots: Rise of the Beasts",
      year: 2023,
      rating: 7.0,
    },
  ],

  article: [
    {
      title: "10 Best Sci-Fi Movies You Must Watch",
      post_date: "May 18, 2025",
      comments: 11,
    },
    {
      title: "Top 15 Hollywood Actors of All Time",
      post_date: "May 16, 2025",
      comments: 8,
    },
    {
      title: "How Movie Ratings Are Calculated",
      post_date: "May 15, 2025",
      comments: 6,
    },
    {
      title: "Upcoming Movies You Can't Miss",
      post_date: "May 14, 2025",
      comments: 9,
    },
  ],

  trending: [
    {
      title: "A Masterclass in Modern Cinema",
      post_date: "May 21, 2025",
    },
    {
      title: "The Best Korean Movies You Shouldn't Miss",
      post_date: "May 19, 2025",
    },
    {
      title: "Why Twist Endings Still Work",
      post_date: "May 18, 2025",
    },
    {
      title: "Best Horror Movies That Will Haunt You",
      post_date: "May 17, 2025",
    },
    {
      title: "A Timeless Classic Revisited",
      post_date: "May 16, 2025",
    },
  ],
};


// ---------- Data loading ----------

async function fetchPosts(type, limit, media) {
  try {
    const qs = new URLSearchParams({
      type,
      limit: String(limit || 20),
    });

    if (media) {
      qs.set("media", media);
    }

    const res = await fetch(`/api/posts?${qs.toString()}`);

    if (!res.ok) {
      throw new Error("Bad API response");
    }

    const data = await res.json();

    if (data.posts && data.posts.length) {
      return data.posts;
    }

    return demo[type] || [];

  } catch (error) {
    console.warn("Failed to load posts:", error);
    return demo[type] || [];
  }
}


// ---------- Render helpers ----------

function thumbHtml(post, scoreBadge) {
  const img = post.image
    ? `<img src="${post.image}" alt="${post.title || "Movie"} poster" loading="lazy">`
    : `<div class="no-image">${post.title || "No Image"}</div>`;

  const score =
    post.score !== null &&
    post.score !== undefined
      ? post.score
      : post.rating;

  const badge =
    scoreBadge &&
    score !== null &&
    score !== undefined
      ? `<span class="score">${score}</span>`
      : "";

  return `
    <div class="thumb">
      ${img}
      ${badge}
    </div>
  `;
}


// ---------- Card routing ----------

function cardWrap(post, innerHtml) {
  if (!post.id) {
    return `<article class="card">${innerHtml}</article>`;
  }

  const href =
    post.media_type === "tv"
      ? `/tv/${post.id}`
      : `/movie/${post.id}`;

  return `
    <a class="card" href="${href}">
      ${innerHtml}
    </a>
  `;
}


// ---------- Reviews ----------

function renderReviews(items) {
  const el = document.getElementById("reviews-grid");

  if (!el) return;

  el.innerHTML = items.map(r =>
    cardWrap(
      r,
      `
      ${thumbHtml(r, true)}

      <div class="body">
        <h3>${r.title || ""}</h3>

        <div class="sub">
          <span>📅 ${r.post_date || ""}</span>
          <span>💬 ${r.comments || 0}</span>
        </div>
      </div>
      `
    )
  ).join("");
}


// ---------- Movies ----------

function renderMovies(items, targetId = "movies-grid") {
  const el = document.getElementById(targetId);

  if (!el) return;

  if (!items || !items.length) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = items.map(m =>
    cardWrap(
      m,
      `
      ${thumbHtml(m, false)}

      <div class="body">
        <h3>${m.title || ""}</h3>

        <div class="sub">
          <span>${m.year || ""}</span>

          <span class="stars">
            ⭐ ${
              m.rating !== null &&
              m.rating !== undefined
                ? m.rating
                : "—"
            }
          </span>
        </div>
      </div>
      `
    )
  ).join("");
}


// ---------- Articles ----------

function renderArticles(items) {
  const el = document.getElementById("articles-grid");

  if (!el) return;

  el.innerHTML = items.map(a =>
    cardWrap(
      a,
      `
      ${thumbHtml(a, false)}

      <div class="body">
        <h3>${a.title || ""}</h3>

        <div class="sub">
          <span>📅 ${a.post_date || ""}</span>
          <span>💬 ${a.comments || 0}</span>
        </div>
      </div>
      `
    )
  ).join("");
}


// ---------- Trending ----------

function renderTrending(items) {
  const el = document.getElementById("trending-list");

  if (!el) return;

  el.innerHTML = items.map((t, i) => {

    const title = t.title || "";

    const inner = `
      <span class="num">${i + 1}</span>

      <div
        class="thumb"
        style="width:52px;height:52px;"
      >
        ${
          t.image
            ? `<img src="${t.image}" alt="${title}" loading="lazy">`
            : `<div
                 class="no-image"
                 style="font-size:9px;"
               >
                 ${title.slice(0, 2)}
               </div>`
        }
      </div>

      <div>
        <h4>${title}</h4>
        <time>${t.post_date || ""}</time>
      </div>
    `;

    if (t.id) {

      const href =
        t.media_type === "tv"
          ? `/tv/${t.id}`
          : `/movie/${t.id}`;

      return `
        <li>
          <a
            href="${href}"
            style="
              display:flex;
              gap:12px;
              align-items:flex-start;
            "
          >
            ${inner}
          </a>
        </li>
      `;
    }

    return `<li>${inner}</li>`;

  }).join("");
}


// ---------- Hero ----------

async function renderHero() {
  try {

    const res = await fetch(
      "/api/posts?type=featured&limit=1"
    );

    const data =
      res.ok
        ? await res.json()
        : { posts: [] };

    const post =
      data.posts &&
      data.posts.length
        ? data.posts[0]
        : demo.featured;

    const titleEl =
      document.querySelector("#hero-content h1");

    const excerptEl =
      document.querySelector("#hero-content p");

    const metaEl =
      document.querySelector(
        "#hero-content .meta-row"
      );

    const buttonEl =
      document.querySelector(
        "#hero-content .btn"
      );

    if (titleEl) {
      titleEl.textContent =
        post.title || "";
    }

    if (excerptEl) {
      excerptEl.textContent =
        post.excerpt || "";
    }

    if (metaEl) {

      const rating =
        post.rating !== null &&
        post.rating !== undefined
          ? post.rating
          : "—";

      metaEl.innerHTML = `
        <span>
          📅 ${post.post_date || ""}
        </span>

        <span>
          💬 ${post.comments || 0} Comments
        </span>

        <span class="rating-inline">
          ⭐ ${rating}/10
        </span>
      `;
    }

    if (buttonEl) {

      if (post.id) {
        buttonEl.href =
          post.media_type === "tv"
            ? `/tv/${post.id}`
            : `/movie/${post.id}`;
      } else {
        buttonEl.href =
          post.link || "#";
      }
    }

    if (post.image) {

      const media =
        document.getElementById(
          "hero-media"
        );

      if (media) {

        media.style.backgroundImage =
          `url('${post.image}')`;

        media.style.backgroundSize =
          "cover";

        media.style.backgroundPosition =
          "center";
      }
    }

  } catch (error) {
    console.warn(
      "Hero failed to load:",
      error
    );
  }
}


// ---------- Top 10 ----------

async function renderTop10() {

  const items =
    await fetchPosts(
      "movie",
      100,
      "movie"
    );

  const sorted =
    [...items]
      .filter(
        m =>
          m.rating !== null &&
          m.rating !== undefined
      )
      .sort(
        (a, b) =>
          Number(b.rating) -
          Number(a.rating)
      )
      .slice(0, 10);

  renderMovies(
    sorted.length
      ? sorted
      : items.slice(0, 10),
    "top10-grid"
  );
}


// ==================================================
// GENRE SECTION
// ==================================================

const GENRE_TABS = [
  {
    label: "Action",
    match: "Action",
  },
  {
    label: "Comedy",
    match: "Comedy",
  },
  {
    label: "Drama",
    match: "Drama",
  },
  {
    label: "Horror",
    match: "Horror",
  },
  {
    label: "Sci-Fi",
    match: "Science Fiction",
  },
  {
    label: "Animation",
    match: "Animation",
  },
];

let allMoviesForGenres = [];


function renderGenreGrid(genre) {

  const filtered =
    allMoviesForGenres.filter(m => {

      const genres =
        (m.genres || "")
          .toLowerCase();

      return genres.includes(
        genre.match.toLowerCase()
      );

    });

  const grid =
    document.getElementById(
      "genre-grid"
    );

  if (!grid) return;

  if (!filtered.length) {

    grid.innerHTML = `
      <p
        style="
          color:var(--ink-soft);
          grid-column:1/-1;
          padding:20px 0;
        "
      >
        No ${genre.label} movies yet —
        check back after the next sync.
      </p>
    `;

    return;
  }

  renderMovies(
    filtered.slice(0, 12),
    "genre-grid"
  );
}


async function renderGenreSection() {

  allMoviesForGenres =
    await fetchPosts(
      "movie",
      100,
      "movie"
    );

  const tabsEl =
    document.getElementById(
      "genre-tabs"
    );

  if (!tabsEl) return;

  tabsEl.innerHTML =
    GENRE_TABS.map(
      (g, i) => `
        <button
          type="button"
          class="${
            i === 0
              ? "active"
              : ""
          }"
          data-label="${g.label}"
        >
          ${g.label}
        </button>
      `
    ).join("");

  tabsEl
    .querySelectorAll("button")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          tabsEl
            .querySelectorAll(
              "button"
            )
            .forEach(
              b =>
                b.classList.remove(
                  "active"
                )
            );

          btn.classList.add(
            "active"
          );

          const genre =
            GENRE_TABS.find(
              g =>
                g.label ===
                btn.dataset.label
            );

          if (genre) {
            renderGenreGrid(
              genre
            );
          }

        }
      );

    });

  renderGenreGrid(
    GENRE_TABS[0]
  );
}


// ==================================================
// TV SHOWS
// ==================================================

async function renderTVShows() {

  const items =
    await fetchPosts(
      "movie",
      6,
      "tv"
    );

  renderMovies(
    items,
    "tv-grid"
  );
}


// ==================================================
// BROWSE BY INDUSTRY
// ==================================================

const INDUSTRY_TABS = [
  {
    label: "Bollywood",
    match: "Bollywood",
  },
  {
    label: "Hollywood",
    match: "Hollywood",
  },
  {
    label: "South Indian",
    match: "South Indian",
  },
];

let allItemsForIndustry = [];


// Normalizes industry values safely.
//
// Handles:
// "Hollywood"
// " hollywood "
// "HOLLYWOOD"
// null
// undefined

function normalizeIndustry(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();

}


// ---------- Industry grid ----------

function renderIndustryGrid(industry) {

  const grid =
    document.getElementById(
      "industry-grid"
    );

  if (!grid) return;


  const expectedIndustry =
    normalizeIndustry(
      industry.match
    );


  // Only compare movie rows.
  //
  // TV shows can still exist in the database
  // with the same industry value, but Browse
  // by Industry on the homepage is intended
  // primarily for movie browsing.

  const filtered =
    allItemsForIndustry.filter(m => {

      const itemIndustry =
        normalizeIndustry(
          m.industry
        );

      const isMovie =
        !m.media_type ||
        m.media_type ===
          "movie";

      return (
        isMovie &&
        itemIndustry ===
          expectedIndustry
      );

    });


  if (!filtered.length) {

    grid.innerHTML = `
      <p
        style="
          color:var(--ink-soft);
          grid-column:1/-1;
          padding:20px 0;
        "
      >
        No ${industry.label}
        titles yet — check back
        after the next sync.
      </p>
    `;

    return;
  }


  renderMovies(
    filtered.slice(0, 12),
    "industry-grid"
  );

}


// ---------- Industry section ----------

async function renderIndustrySection() {

  // Fetch a large homepage pool.
  //
  // Full unlimited browsing is handled
  // by list.html pagination.

  allItemsForIndustry =
    await fetchPosts(
      "movie",
      100,
      "movie"
    );


  const tabsEl =
    document.getElementById(
      "industry-tabs-home"
    );

  if (!tabsEl) return;


  tabsEl.innerHTML =
    INDUSTRY_TABS.map(
      (industry, i) => `
        <button
          type="button"
          class="${
            i === 0
              ? "active"
              : ""
          }"
          data-label="${industry.label}"
        >
          ${industry.label}
        </button>
      `
    ).join("");


  tabsEl
    .querySelectorAll("button")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          tabsEl
            .querySelectorAll(
              "button"
            )
            .forEach(
              b =>
                b.classList.remove(
                  "active"
                )
            );


          btn.classList.add(
            "active"
          );


          const industry =
            INDUSTRY_TABS.find(
              g =>
                g.label ===
                btn.dataset.label
            );


          if (industry) {
            renderIndustryGrid(
              industry
            );
          }

        }
      );

    });


  // Default tab: Bollywood

  renderIndustryGrid(
    INDUSTRY_TABS[0]
  );

}


// ==================================================
// UI BEHAVIOUR
// ==================================================

function initHeader() {

  const dateEl =
    document.getElementById(
      "today-date"
    );


  if (dateEl) {

    dateEl.textContent =
      new Date()
        .toLocaleDateString(
          "en-US",
          {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }
        );

  }


  const searchToggle =
    document.getElementById(
      "search-toggle"
    );

  const searchPanel =
    document.getElementById(
      "search-panel"
    );


  searchToggle?.addEventListener(
    "click",
    () => {
      searchPanel?.classList.toggle(
        "open"
      );
    }
  );


  const navToggle =
    document.getElementById(
      "nav-toggle"
    );

  const mainNav =
    document.getElementById(
      "main-nav"
    );


  navToggle?.addEventListener(
    "click",
    () => {
      mainNav?.classList.toggle(
        "nav-open"
      );
    }
  );


  const yearEl =
    document.getElementById(
      "year"
    );

  if (yearEl) {
    yearEl.textContent =
      new Date().getFullYear();
  }

}


// ==================================================
// NEWSLETTER
// ==================================================

function initNewsletter() {

  const form =
    document.getElementById(
      "newsletter-form"
    );

  const note =
    document.getElementById(
      "newsletter-note"
    );


  form?.addEventListener(
    "submit",
    async e => {

      e.preventDefault();


      const emailInput =
        form.querySelector(
          'input[type="email"]'
        );


      const email =
        emailInput?.value
          .trim();


      if (!email) {
        if (note) {
          note.textContent =
            "Please enter your email.";
        }
        return;
      }


      if (note) {
        note.textContent =
          "Subscribing…";
      }


      try {

        const res =
          await fetch(
            "/api/subscribe",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  email,
                }),
            }
          );


        const data =
          await res.json();


        if (!res.ok) {

          if (note) {
            note.textContent =
              data.error ||
              "Couldn't subscribe right now.";
          }

          return;
        }


        if (note) {
          note.textContent =
            "Thanks for subscribing! 🎬";
        }


        form.reset();


      } catch (error) {

        console.warn(
          "Newsletter error:",
          error
        );

        if (note) {
          note.textContent =
            "Couldn't reach the server — please try again.";
        }

      }

    }
  );

}


// ==================================================
// INITIALIZATION
// ==================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    initHeader();

    initNewsletter();


    // Hero

    renderHero();


    // Homepage sections

    renderReviews(
      await fetchPosts(
        "review",
        4
      )
    );


    renderMovies(
      await fetchPosts(
        "movie",
        6,
        "movie"
      )
    );


    renderArticles(
      await fetchPosts(
        "article",
        4
      )
    );


    renderTrending(
      await fetchPosts(
        "trending",
        5
      )
    );


    // Advanced sections

    renderTop10();

    renderGenreSection();

    renderTVShows();

    renderIndustrySection();

  }
);
```
