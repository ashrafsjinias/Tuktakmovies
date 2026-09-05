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
  if (!imagePreview || !imagePreviewImg) return;

  if (!url) {
    imagePreview.hidden = true;
    imagePreviewImg.removeAttribute("src");
    return;
  }

  imagePreviewImg.src = url;
  imagePreview.hidden = false;
}


// ---------- Image Upload ----------

if (imageFileInput) {
  imageFileInput.addEventListener("change", async () => {

    const file = imageFileInput.files?.[0];

    if (!file) return;

    if (uploadStatus) {
      uploadStatus.textContent = "Uploading…";
    }

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body,
      });

      const data = await res.json();

      if (!res.ok) {
        if (uploadStatus) {
          uploadStatus.textContent =
            data.error || "Upload failed.";
        }
        return;
      }

      if (fields.image) {
        fields.image.value = data.url || "";
      }

      showImagePreview(data.url || "");

      if (uploadStatus) {
        uploadStatus.textContent = "Uploaded ✓";
      }

    } catch (error) {

      console.error("Image upload error:", error);

      if (uploadStatus) {
        uploadStatus.textContent =
          "Could not reach the server.";
      }

    }

  });
}


// ---------- Remove Image ----------

if (removeImageBtn) {
  removeImageBtn.addEventListener("click", () => {

    if (fields.image) {
      fields.image.value = "";
    }

    if (imageFileInput) {
      imageFileInput.value = "";
    }

    if (uploadStatus) {
      uploadStatus.textContent = "";
    }

    showImagePreview("");

  });
}


// ---------- Show Dashboard ----------

function showDashboard() {

  if (loginView) {
    loginView.hidden = true;
  }

  if (dashboardView) {
    dashboardView.hidden = false;
  }

  if (typeof loadPosts === "function") {
    loadPosts();
  }

}


// ---------- Show Login ----------

function showLogin() {

  if (loginView) {
    loginView.hidden = false;
  }

  if (dashboardView) {
    dashboardView.hidden = true;
  }

}


// ---------- Check Admin Session ----------

async function checkSession() {

  try {

    const res = await fetch("/api/me");

    if (!res.ok) {
      throw new Error("Session check failed");
    }

    const data = await res.json();

    if (data && data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }

  } catch (error) {

    console.error("Session check error:", error);

    showLogin();

  }

}
