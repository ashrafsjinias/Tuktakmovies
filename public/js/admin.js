const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const postForm = document.getElementById("post-form");
const formTitle = document.getElementById("form-title");
const formError = document.getElementById("form-error");
const cancelEditBtn = document.getElementById("cancel-edit");
const filterType = document.getElementById("filter-type");
const postList = document.getElementById("post-list");

const fields = {
  id: document.getElementById("post-id"),
  type: document.getElementById("post-type"),
  title: document.getElementById("post-title"),
  excerpt: document.getElementById("post-excerpt"),
  image: document.getElementById("post-image"),
  score: document.getElementById("post-score"),
  rating: document.getElementById("post-rating"),
  year: document.getElementById("post-year"),
  post_date: document.getElementById("post-date"),
  comments: document.getElementById("post-comments"),
  link: document.getElementById("post-link"),
  genres: document.getElementById("post-genres"),
  tagline: document.getElementById("post-tagline"),
  runtime: document.getElementById("post-runtime"),
  trailer_key: document.getElementById("post-trailer"),
  cast_names: document.getElementById("post-cast"),
  watch_providers: document.getElementById("post-watch-providers"),
  watch_link: document.getElementById("post-watch-link"),
};

const imageFileInput = document.getElementById("post-image-file");
const uploadStatus = document.getElementById("upload-status");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImg = document.getElementById("image-preview-img");
const removeImageBtn = document.getElementById("remove-image-btn");

function showImagePreview(url) {
  if (!url) {
    imagePreview.hidden = true;
    imagePreviewImg.removeAttribute("src");
    return;
  }
  imagePreviewImg.src = url;
  imagePreview.hidden = false;
}

imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files[0];
  if (!file) return;
  uploadStatus.textContent = "Uploading…";
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      uploadStatus.textContent = data.error || "Upload failed.";
      return;
    }
    fields.image.value = data.url;
    showImagePreview(data.url);
    uploadStatus.textContent = "Uploaded ✓";
  } catch {
    uploadStatus.textContent = "Could not reach the server.";
  }
});

removeImageBtn.addEventListener("click", () => {
  fields.image.value = "";
  imageFileInput.value = "";
  uploadStatus.textContent = "";
  showImagePreview("");
});

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadPosts();
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

async function checkSession() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.authenticated) showDashboard();
    else showLogin();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const password = document.getElementById("login-password").value;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "Login failed.";
      return;
    }
    showDashboard();
  } catch {
    loginError.textContent = "Could not reach the server.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showLogin();
});

const syncTmdbBtn = document.getElementById("sync-tmdb-btn");
const syncStatus = document.getElementById("sync-status");
syncTmdbBtn.addEventListener("click", async () => {
  syncStatus.textContent = "Syncing… this can take a few seconds";
  syncTmdbBtn.disabled = true;
  try {
    const res = await fetch("/api/import-tmdb", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      syncStatus.textContent = data.error || "Sync failed.";
    } else {
      syncStatus.textContent = "Done ✓ — check the list below.";
      loadPosts();
    }
  } catch {
    syncStatus.textContent = "Could not reach the server.";
  } finally {
    syncTmdbBtn.disabled = false;
  }
});

const backfillBtn = document.getElementById("backfill-btn");
backfillBtn.addEventListener("click", async () => {
  backfillBtn.disabled = true;
  let totalUpdated = 0;
  try {
    // Runs in batches of 10 (per request) until nothing's left to backfill,
    // so it also works for sites with a lot of older posts.
    while (true) {
      syncStatus.textContent = `Backfilling… (${totalUpdated} done so far)`;
      const res = await fetch("/api/backfill-tmdb", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        syncStatus.textContent = data.error || "Backfill failed.";
        break;
      }
      totalUpdated += data.updated || 0;
      if (!data.updated) {
        syncStatus.textContent = totalUpdated
          ? `Backfill done ✓ — updated ${totalUpdated} post(s).`
          : "Nothing to backfill — all posts already have details.";
        loadPosts();
        break;
      }
    }
  } catch {
    syncStatus.textContent = "Could not reach the server.";
  } finally {
    backfillBtn.disabled = false;
  }
});

const tmdbSearchForm = document.getElementById("tmdb-search-form");
const tmdbSearchInput = document.getElementById("tmdb-search-input");
const tmdbSearchStatus = document.getElementById("tmdb-search-status");
const tmdbSearchResults = document.getElementById("tmdb-search-results");

function renderTmdbResults(results) {
  if (!results.length) {
    tmdbSearchResults.innerHTML = "";
    return;
  }
  tmdbSearchResults.innerHTML = results.map(r => `
    <div class="tmdb-result-row" data-tmdb-id="${r.tmdb_id}">
      ${r.poster ? `<img src="${r.poster}" alt="">` : `<div class="no-poster"></div>`}
      <div class="info">
        <strong>${r.title}</strong>
        ${r.year || ""} ${r.rating ? `· ⭐ ${r.rating.toFixed ? r.rating.toFixed(1) : r.rating}` : ""}
      </div>
      <button type="button" class="import-btn">Import</button>
    </div>`).join("");

  tmdbSearchResults.querySelectorAll(".tmdb-result-row").forEach(row => {
    row.querySelector(".import-btn").addEventListener("click", async () => {
      const btn = row.querySelector(".import-btn");
      const tmdbId = Number(row.dataset.tmdbId);
      btn.disabled = true;
      btn.textContent = "Importing…";
      try {
        const res = await fetch("/api/tmdb-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmdb_id: tmdbId }),
        });
        const data = await res.json();
        if (!res.ok) {
          btn.textContent = "Failed";
          return;
        }
        btn.textContent = data.alreadyImported ? "Already added" : "Added ✓";
        loadPosts();
      } catch {
        btn.textContent = "Failed";
      }
    });
  });
}

tmdbSearchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = tmdbSearchInput.value.trim();
  if (!q) return;
  tmdbSearchStatus.textContent = "Searching…";
  tmdbSearchResults.innerHTML = "";
  try {
    const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) {
      tmdbSearchStatus.textContent = data.error || "Search failed.";
      return;
    }
    const results = data.results || [];
    tmdbSearchStatus.textContent = results.length ? "" : "No results found.";
    renderTmdbResults(results);
  } catch {
    tmdbSearchStatus.textContent = "Could not reach the server.";
  }
});

function resetForm() {
  postForm.reset();
  fields.id.value = "";
  fields.type.value = "review";
  fields.comments.value = "0";
  formTitle.textContent = "Add a New Post";
  cancelEditBtn.hidden = true;
  formError.textContent = "";
  imageFileInput.value = "";
  uploadStatus.textContent = "";
  showImagePreview("");
}

cancelEditBtn.addEventListener("click", resetForm);

postForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const payload = {
    type: fields.type.value,
    title: fields.title.value.trim(),
    excerpt: fields.excerpt.value.trim(),
    image: fields.image.value.trim(),
    score: fields.score.value === "" ? null : Number(fields.score.value),
    rating: fields.rating.value === "" ? null : Number(fields.rating.value),
    year: fields.year.value === "" ? null : Number(fields.year.value),
    post_date: fields.post_date.value.trim(),
    comments: fields.comments.value === "" ? 0 : Number(fields.comments.value),
    link: fields.link.value.trim(),
    genres: fields.genres.value.trim(),
    tagline: fields.tagline.value.trim(),
    runtime: fields.runtime.value === "" ? null : Number(fields.runtime.value),
    trailer_key: fields.trailer_key.value.trim(),
    cast_names: fields.cast_names.value.trim(),
    watch_providers: fields.watch_providers.value.trim(),
    watch_link: fields.watch_link.value.trim(),
  };

  const id = fields.id.value;
  const url = id ? `/api/posts/${id}` : "/api/posts";
  const method = id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      formError.textContent = data.error || "Could not save post.";
      return;
    }
    resetForm();
    loadPosts();
  } catch {
    formError.textContent = "Could not reach the server.";
  }
});

function typeLabel(type) {
  const labels = { featured: "Featured", review: "Review", movie: "Movie", article: "Article", trending: "Trending" };
  return labels[type] || type;
}

function renderPostRow(post) {
  const row = document.createElement("div");
  row.className = "post-row";
  row.innerHTML = `
    <div class="thumb">${post.image ? `<img src="${post.image}" alt="">` : ""}</div>
    <div class="info">
      <h4>${post.title}</h4>
      <span>${typeLabel(post.type)} · ${post.post_date || "no date"}</span>
    </div>
    <div class="actions">
      <button class="edit-btn" type="button">Edit</button>
      <button class="delete-btn" type="button">Delete</button>
    </div>`;

  row.querySelector(".edit-btn").addEventListener("click", () => {
    fields.id.value = post.id;
    fields.type.value = post.type;
    fields.title.value = post.title || "";
    fields.excerpt.value = post.excerpt || "";
    fields.image.value = post.image || "";
    fields.score.value = post.score ?? "";
    fields.rating.value = post.rating ?? "";
    fields.year.value = post.year ?? "";
    fields.post_date.value = post.post_date || "";
    fields.comments.value = post.comments ?? 0;
    fields.link.value = post.link || "";
    fields.genres.value = post.genres || "";
    fields.tagline.value = post.tagline || "";
    fields.runtime.value = post.runtime ?? "";
    fields.trailer_key.value = post.trailer_key || "";
    fields.cast_names.value = post.cast_names || "";
    fields.watch_providers.value = post.watch_providers || "";
    fields.watch_link.value = post.watch_link || "";
    imageFileInput.value = "";
    uploadStatus.textContent = "";
    showImagePreview(post.image || "");
    formTitle.textContent = `Editing: ${post.title}`;
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  row.querySelector(".delete-btn").addEventListener("click", async () => {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    loadPosts();
  });

  return row;
}

async function loadPosts() {
  postList.innerHTML = "";
  const type = filterType.value;
  const url = type ? `/api/posts?type=${type}&limit=100` : "/api/posts?limit=100";
  try {
    const res = await fetch(url);
    const data = await res.json();
    const posts = data.posts || [];
    if (!posts.length) {
      postList.innerHTML = `<p class="empty-note">No posts yet — add one above.</p>`;
      return;
    }
    posts.forEach(post => postList.appendChild(renderPostRow(post)));
  } catch {
    postList.innerHTML = `<p class="empty-note">Could not load posts.</p>`;
  }
}

filterType.addEventListener("change", loadPosts);

checkSession();
