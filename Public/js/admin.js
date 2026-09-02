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
};

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

function resetForm() {
  postForm.reset();
  fields.id.value = "";
  fields.type.value = "review";
  fields.comments.value = "0";
  formTitle.textContent = "Add a New Post";
  cancelEditBtn.hidden = true;
  formError.textContent = "";
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
