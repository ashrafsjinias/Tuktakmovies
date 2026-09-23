/* TuktakMovies – Main Client JS */
'use strict';

// ── UTILS ────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function toast(msg, type = 'success', duration = 3500) {
  const container = $('#toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'alert');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function setFormMessage(el, msg, type = 'error') {
  if (!el) return;
  el.className = `form-message ${type}`;
  el.textContent = msg;
}

function clearFormMessage(el) {
  if (!el) return;
  el.className = 'form-message';
  el.textContent = '';
}

// ── NAV / HEADER ─────────────────────────────────────────────
function initNav() {
  // Mobile toggle
  const toggle = $('#nav-mobile-toggle');
  const mobileNav = $('#mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      mobileNav.hidden = open;
      document.body.style.overflow = open ? '' : 'hidden';
    });
  }

  // User dropdown
  const userBtn = $('#user-menu-btn');
  const dropdown = $('#user-dropdown');
  if (userBtn && dropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('open');
      userBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      userBtn.setAttribute('aria-expanded', 'false');
    });
    dropdown.addEventListener('click', e => e.stopPropagation());

    // Keyboard
    userBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        userBtn.setAttribute('aria-expanded', 'false');
        userBtn.focus();
      }
    });
  }

  // Scroll shadow
  const header = $('#site-header');
  if (header) {
    const obs = new IntersectionObserver(([e]) => {
      header.classList.toggle('scrolled', !e.isIntersecting);
    }, { rootMargin: '-1px 0px 0px 0px', threshold: [1] });
    obs.observe(document.createElement('div'));
    window.addEventListener('scroll', () => {
      header.style.boxShadow = window.scrollY > 10 ? '0 2px 20px rgba(0,0,0,0.4)' : '';
    }, { passive: true });
  }
}

// ── SEARCH AUTOCOMPLETE ───────────────────────────────────────
function initSearchAutocomplete() {
  const input = $('#nav-search-input');
  const dropdown = $('#search-autocomplete');
  if (!input || !dropdown) return;

  let timer, abortController;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.classList.remove('visible'); dropdown.innerHTML = ''; return; }
    timer = setTimeout(() => fetchSuggestions(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.classList.remove('visible'); input.blur(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = dropdown.querySelector('.autocomplete-item');
      if (first) first.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('visible');
    }
  });

  async function fetchSuggestions(q) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(q)}`, { signal: abortController.signal });
      const { results = [] } = await res.json();
      renderSuggestions(results, q);
    } catch (e) {
      if (e.name !== 'AbortError') dropdown.classList.remove('visible');
    }
  }

  function renderSuggestions(results, q) {
    if (!results.length) { dropdown.classList.remove('visible'); return; }
    dropdown.innerHTML = results.map(item => {
      const type = item.media_type || 'movie';
      const url = `/${type}/${item.id}`;
      const poster = item.poster_path
        ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
        : '/images/no-poster.svg';
      const typeLabel = type === 'tv' ? 'TV' : type === 'person' ? 'Person' : 'Movie';
      return `<a href="${url}" class="autocomplete-item" role="option">
        <img src="${poster}" alt="" class="autocomplete-thumb" loading="lazy" width="36" height="54">
        <div>
          <div class="autocomplete-title">${escHtml(item.title || '')}</div>
          <div class="autocomplete-meta">${typeLabel}${item.year ? ` · ${item.year}` : ''}${item.vote_average ? ` · ★ ${item.vote_average.toFixed(1)}` : ''}</div>
        </div>
      </a>`;
    }).join('');
    dropdown.classList.add('visible');

    // Keyboard navigation in dropdown
    dropdown.querySelectorAll('.autocomplete-item').forEach((item, i, items) => {
      item.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); items[i + 1]?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); i === 0 ? input.focus() : items[i - 1]?.focus(); }
        if (e.key === 'Escape') { dropdown.classList.remove('visible'); input.focus(); }
      });
    });
  }
}

// ── TRAILER MODAL ─────────────────────────────────────────────
function initTrailerModal() {
  const modal = $('#trailer-modal');
  const videoWrapper = $('#video-wrapper');
  const backdrop = $('#modal-backdrop');
  const closeBtn = $('#modal-close');
  if (!modal) return;

  function openTrailer(key) {
    if (!key) return;
    videoWrapper.innerHTML = `<iframe
      src="https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&modestbranding=1"
      allow="autoplay; encrypted-media; fullscreen"
      allowfullscreen
      title="Movie Trailer"
    ></iframe>`;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeTrailer() {
    modal.hidden = true;
    videoWrapper.innerHTML = '';
    document.body.style.overflow = '';
  }

  // Open buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-trailer]');
    if (btn) { e.preventDefault(); openTrailer(btn.dataset.trailer); }
  });

  closeBtn?.addEventListener('click', closeTrailer);
  backdrop?.addEventListener('click', closeTrailer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeTrailer(); });
}

// ── WATCHLIST / FAVORITES / WATCHED ──────────────────────────
function initListButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const validActions = ['watchlist', 'favorite', 'watched'];
    if (!validActions.includes(action)) return;

    const id = btn.dataset.id;
    const type = btn.dataset.type || 'movie';
    if (!id) return;

    // Collect movie data from data attributes for caching
    const movieData = {
      id: parseInt(id),
      title: btn.dataset.title,
      poster_path: btn.dataset.poster || null
    };

    btn.disabled = true;
    const originalText = btn.textContent;

    try {
      const { ok, data } = await apiFetch('/api/lists/toggle', {
        method: 'POST',
        body: JSON.stringify({ tmdb_id: parseInt(id), media_type: type, list_type: action, movie_data: movieData })
      });

      if (ok) {
        const inList = data.in_list;
        btn.setAttribute('aria-pressed', String(inList));

        // Update button state
        if (action === 'watchlist') {
          btn.classList.toggle('action-btn--active', inList);
          const textNode = btn.childNodes[btn.childNodes.length - 1];
          if (textNode && textNode.nodeType === 3) textNode.textContent = inList ? ' In Watchlist' : ' Add to Watchlist';
          toast(inList ? 'Added to Watchlist' : 'Removed from Watchlist');
        } else if (action === 'favorite') {
          btn.classList.toggle('action-btn--active', inList);
          btn.classList.toggle('action-btn--heart', inList);
          const textNode = btn.childNodes[btn.childNodes.length - 1];
          if (textNode && textNode.nodeType === 3) textNode.textContent = inList ? ' Favorited' : ' Favorite';
          toast(inList ? 'Added to Favorites ❤️' : 'Removed from Favorites');
        } else if (action === 'watched') {
          btn.classList.toggle('action-btn--active', inList);
          const textNode = btn.childNodes[btn.childNodes.length - 1];
          if (textNode && textNode.nodeType === 3) textNode.textContent = inList ? ' Watched' : ' Mark Watched';
          toast(inList ? 'Marked as Watched ✓' : 'Removed from Watched');
        }

        // Also update card-level buttons
        const cardBtns = $$(`[data-action="${action}"][data-id="${id}"]`);
        cardBtns.forEach(b => b.classList.toggle('active', inList));

      } else if (data.error === 'Sign in to manage your lists') {
        window.location.href = '/login?return=' + encodeURIComponent(window.location.pathname);
      } else {
        toast(data.error || 'Something went wrong', 'error');
      }
    } catch {
      toast('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── REVIEW FORM ───────────────────────────────────────────────
function initReviewForm() {
  const pageData = window.__PAGE_DATA__;
  if (!pageData) return;

  const writeBtn = $('#write-review-btn');
  const formWrapper = $('#review-form-wrapper');
  const cancelBtn = $('#cancel-review-btn');
  const form = $('#review-form');
  const ratingSlider = $('#review-rating');
  const ratingOutput = $('#rating-output');
  const bodyTextarea = $('#review-body');
  const charCount = $('#review-char-count');
  const submitBtn = $('#review-submit-btn');
  const messageEl = $('#review-form-message');

  if (writeBtn && formWrapper) {
    writeBtn.addEventListener('click', () => {
      formWrapper.hidden = !formWrapper.hidden;
      if (!formWrapper.hidden) {
        formWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        ratingSlider?.focus();
      }
    });
  }

  cancelBtn?.addEventListener('click', () => { if (formWrapper) formWrapper.hidden = true; });

  // Rating slider
  ratingSlider?.addEventListener('input', () => {
    if (ratingOutput) ratingOutput.textContent = ratingSlider.value;
  });

  // Char counter
  bodyTextarea?.addEventListener('input', () => {
    if (charCount) charCount.textContent = bodyTextarea.value.length;
  });

  // Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormMessage(messageEl);

    const body = bodyTextarea?.value.trim() || '';
    if (body.length < 20) {
      setFormMessage(messageEl, 'Review must be at least 20 characters.');
      return;
    }

    const reviewId = form.querySelector('[name="review_id"]')?.value;
    const isEdit = !!reviewId;

    const payload = {
      tmdb_id: parseInt(pageData.movieId),
      media_type: pageData.mediaType,
      rating: parseInt(ratingSlider?.value || 7),
      title: form.querySelector('[name="title"]')?.value.trim() || '',
      body,
      contains_spoilers: form.querySelector('[name="contains_spoilers"]')?.checked || false
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Publishing…';

    try {
      const url = isEdit ? `/api/reviews/${reviewId}` : '/api/reviews';
      const method = isEdit ? 'PUT' : 'POST';
      const { ok, data } = await apiFetch(url, { method, body: JSON.stringify(isEdit ? { ...payload, reviewBody: payload.body } : payload) });

      if (ok) {
        setFormMessage(messageEl, data.message || 'Review published!', 'success');
        submitBtn.textContent = isEdit ? 'Updated!' : 'Published!';
        if (!isEdit) {
          setTimeout(() => {
            window.location.hash = '#reviews';
            window.location.reload();
          }, 1200);
        }
      } else {
        setFormMessage(messageEl, data.error || 'Failed to publish review.');
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Update Review' : 'Publish Review';
      }
    } catch {
      setFormMessage(messageEl, 'Network error. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Review' : 'Publish Review';
    }
  });

  // Load more reviews
  const loadMoreBtn = $('#load-more-reviews');
  loadMoreBtn?.addEventListener('click', async () => {
    const page = parseInt(loadMoreBtn.dataset.page || '2');
    const tmdbId = loadMoreBtn.dataset.tmdbId;
    const mediaType = loadMoreBtn.dataset.mediaType;

    loadMoreBtn.textContent = 'Loading…';
    loadMoreBtn.disabled = true;

    try {
      const { ok, data } = await apiFetch(`/api/reviews/${tmdbId}?media_type=${mediaType}&page=${page}`);
      if (ok && data.reviews?.length) {
        const reviewsList = $('#reviews-list');
        data.reviews.forEach(r => {
          const div = document.createElement('div');
          div.innerHTML = renderReviewHTML(r);
          reviewsList?.appendChild(div.firstElementChild);
        });

        if (page < data.total_pages) {
          loadMoreBtn.dataset.page = String(page + 1);
          loadMoreBtn.textContent = 'Load More Reviews';
          loadMoreBtn.disabled = false;
        } else {
          loadMoreBtn.remove();
        }
      } else {
        loadMoreBtn.remove();
      }
    } catch {
      loadMoreBtn.textContent = 'Load More Reviews';
      loadMoreBtn.disabled = false;
    }
  });

  // Helpful voting
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.helpful-btn');
    if (!btn) return;
    const reviewId = btn.dataset.reviewId;
    if (!reviewId) return;

    const { ok, data } = await apiFetch(`/api/reviews/${reviewId}/helpful`, { method: 'POST' });
    if (ok) {
      btn.classList.toggle('voted', data.voted);
      const countMatch = btn.textContent.match(/\((\d+)\)/);
      if (countMatch) {
        const count = parseInt(countMatch[1]) + (data.voted ? 1 : -1);
        btn.innerHTML = btn.innerHTML.replace(/\(\d+\)/, `(${Math.max(0, count)})`);
      }
    } else if (data.error?.includes('Sign in')) {
      window.location.href = '/login';
    }
  });
}

function renderReviewHTML(r) {
  const stars = r.rating ? Math.round(r.rating / 2) : 0;
  const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const timeAgo = formatTimeAgo(r.created_at);
  return `<article class="review-card" id="review-${r.id}">
    <div class="review-header">
      <div class="reviewer-info">
        <div class="reviewer-avatar">${(r.username || 'A')[0].toUpperCase()}</div>
        <div>
          <a href="/user/${escHtml(r.username)}" class="reviewer-name">${escHtml(r.display_name || r.username)}</a>
          <time class="review-date">${timeAgo}</time>
        </div>
      </div>
      <div class="review-rating-display">
        <span class="review-stars">${starStr}</span>
        <span class="review-score">${r.rating}<span class="review-score-max">/10</span></span>
      </div>
    </div>
    ${r.contains_spoilers ? '<div class="spoiler-warning">⚠️ Contains spoilers</div>' : ''}
    ${r.title ? `<h4 class="review-title">${escHtml(r.title)}</h4>` : ''}
    <div class="review-body">${escHtml(r.body)}</div>
    <div class="review-footer">
      <button class="helpful-btn" data-review-id="${r.id}">👍 Helpful (${r.helpful_count || 0})</button>
    </div>
  </article>`;
}

// ── TRENDING TABS ─────────────────────────────────────────────
function initTrendingTabs() {
  const tabs = $$('[data-section="trending"]');
  const grid = $('#trending-grid');
  if (!tabs.length || !grid) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const period = tab.dataset.period;
      tabs.forEach(t => { t.classList.remove('section-tab--active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('section-tab--active');
      tab.setAttribute('aria-selected', 'true');

      grid.style.opacity = '0.5';
      try {
        const res = await fetch(`/api/trending?period=${period}`);
        const html = await res.text();
        grid.innerHTML = html;
        initListButtons(); // rebind new cards
      } catch {}
      grid.style.opacity = '1';
    });
  });
}

// ── SORT SELECT ───────────────────────────────────────────────
function initSortSelect() {
  const select = $('#sort-select');
  if (!select) return;
  select.addEventListener('change', () => {
    const base = select.dataset.baseUrl;
    if (base) window.location.href = base + select.value;
  });
}

// ── AUTH FORMS ────────────────────────────────────────────────
function initLoginForm() {
  const form = $('#login-form');
  const msg = $('#login-message');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormMessage(msg);

    const email = form.email?.value?.trim();
    const password = form.password?.value;
    if (!email || !password) { setFormMessage(msg, 'Email and password are required.'); return; }

    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const { ok, data } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (ok) {
      const returnUrl = form.querySelector('[name="return_url"]')?.value || '/';
      window.location.href = returnUrl;
    } else {
      setFormMessage(msg, data.error || 'Invalid credentials.');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

function initRegisterForm() {
  const form = $('#register-form');
  const msg = $('#register-message');
  if (!form) return;

  const usernameInput = $('#username');
  const usernamePreview = $('#username-preview');
  const passwordInput = $('#password');
  const strengthBar = $('#password-strength');

  usernameInput?.addEventListener('input', () => {
    if (usernamePreview) usernamePreview.textContent = usernameInput.value.toLowerCase();
  });

  passwordInput?.addEventListener('input', () => {
    if (!strengthBar) return;
    const val = passwordInput.value;
    let strength = 0;
    if (val.length >= 8) strength += 25;
    if (val.length >= 12) strength += 25;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) strength += 25;
    if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) strength += 25;
    const color = strength <= 25 ? '#ef4444' : strength <= 50 ? '#f59e0b' : strength <= 75 ? '#3b82f6' : '#22c55e';
    strengthBar.style.setProperty('--strength', `${strength}%`);
    strengthBar.style.setProperty('--strength-color', color);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormMessage(msg);

    const username = form.username?.value?.trim();
    const email = form.email?.value?.trim();
    const password = form.password?.value;
    const display_name = form.display_name?.value?.trim();
    const terms = form.terms?.checked;

    if (!terms) { setFormMessage(msg, 'You must accept the Terms of Service.'); return; }
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setFormMessage(msg, 'Username must be 3-30 characters (letters, numbers, underscores only).');
      return;
    }
    if (!email) { setFormMessage(msg, 'Please enter your email.'); return; }
    if (!password || password.length < 8) { setFormMessage(msg, 'Password must be at least 8 characters.'); return; }

    const btn = $('#register-submit');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    const { ok, data } = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, display_name })
    });

    if (ok) {
      window.location.href = '/?registered=1';
    } else {
      setFormMessage(msg, data.error || 'Registration failed.');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}

// ── SETTINGS FORMS ────────────────────────────────────────────
function initSettingsForms() {
  const profileForm = $('#profile-form');
  const profileMsg = $('#profile-message');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const display_name = profileForm.display_name?.value?.trim();
      const bio = profileForm.bio?.value?.trim();
      const { ok, data } = await apiFetch('/api/user/profile', {
        method: 'PUT', body: JSON.stringify({ display_name, bio })
      });
      setFormMessage(profileMsg, data.message || data.error || '', ok ? 'success' : 'error');
    });
  }

  const passwordForm = $('#password-form');
  const passwordMsg = $('#password-message');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current_password = passwordForm.current_password?.value;
      const new_password = passwordForm.new_password?.value;
      if (!current_password || !new_password) return;
      const { ok, data } = await apiFetch('/api/auth/change-password', {
        method: 'POST', body: JSON.stringify({ current_password, new_password })
      });
      setFormMessage(passwordMsg, data.message || data.error || '', ok ? 'success' : 'error');
      if (ok) passwordForm.reset();
    });
  }
}

// ── DELETE REVIEW ─────────────────────────────────────────────
function initReviewManagement() {
  document.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-delete-review]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteReview;
      if (!confirm('Delete this review? This cannot be undone.')) return;
      const { ok, data } = await apiFetch(`/api/reviews/${id}`, { method: 'DELETE' });
      if (ok) {
        deleteBtn.closest('.review-list-item')?.remove();
        toast('Review deleted');
      } else {
        toast(data.error || 'Failed to delete', 'error');
      }
    }
  });
}

// ── PASSWORD VISIBILITY ───────────────────────────────────────
function initPasswordToggles() {
  $$('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
    });
  });
}

// ── BIO EXPAND ────────────────────────────────────────────────
function initBioExpand() {
  const btn = $('.bio-expand-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const more = $('.bio-more');
    if (more) {
      more.hidden = !more.hidden;
      btn.textContent = more.hidden ? 'Read more' : 'Read less';
      btn.setAttribute('aria-expanded', String(!more.hidden));
    }
  });
}

// ── ADMIN PANEL ───────────────────────────────────────────────
function initAdminPanel() {
  const section = window.__ADMIN_SECTION__;
  if (!section) return;

  const titleEl = $('#admin-title');
  const contentEl = $('#admin-content');

  const sections = {
    dashboard: loadDashboard,
    users: loadUsers,
    reviews: loadReviews,
    settings: loadSettings
  };

  const loader = sections[section] || sections.dashboard;
  loader();

  async function loadDashboard() {
    if (titleEl) titleEl.textContent = 'Dashboard';
    const { ok, data } = await apiFetch('/api/admin/stats');
    if (!ok || !contentEl) return;

    const { stats, recent_reviews, recent_users } = data;
    contentEl.innerHTML = `
      <div class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.users.total}</div>
          <div class="admin-stat-label">Total Users</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.users.active}</div>
          <div class="admin-stat-label">Active Users</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.reviews.total}</div>
          <div class="admin-stat-label">Total Reviews</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.reviews.avg_rating ? Number(stats.reviews.avg_rating).toFixed(1) : '–'}</div>
          <div class="admin-stat-label">Avg Rating</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.lists.total}</div>
          <div class="admin-stat-label">List Items</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value">${stats.active_sessions}</div>
          <div class="admin-stat-label">Active Sessions</div>
        </div>
      </div>

      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem">Recent Users</h2>
      <table class="admin-table" style="margin-bottom:2rem">
        <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>
          ${recent_users.map(u => `<tr>
            <td>${escHtml(u.username)}</td>
            <td>${escHtml(u.email)}</td>
            <td>${escHtml(u.role)}</td>
            <td>${new Date(u.created_at * 1000).toLocaleDateString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem">Recent Reviews</h2>
      <table class="admin-table">
        <thead><tr><th>User</th><th>TMDB ID</th><th>Rating</th><th>Date</th></tr></thead>
        <tbody>
          ${recent_reviews.map(r => `<tr>
            <td>${escHtml(r.username)}</td>
            <td><a href="/${r.media_type}/${r.tmdb_id}" style="color:var(--color-primary)">${r.tmdb_id}</a></td>
            <td>${r.rating}/10</td>
            <td>${new Date(r.created_at * 1000).toLocaleDateString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadUsers() {
    if (titleEl) titleEl.textContent = 'Users';
    const { ok, data } = await apiFetch('/api/admin/users');
    if (!ok || !contentEl) return;

    contentEl.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.users.map(u => `<tr>
            <td>${escHtml(u.username)}</td>
            <td>${escHtml(u.email)}</td>
            <td>
              <select class="sort-select" data-user-id="${u.id}" data-field="role" style="font-size:.75rem;padding:.25rem .5rem">
                <option ${u.role === 'user' ? 'selected' : ''}>user</option>
                <option ${u.role === 'moderator' ? 'selected' : ''}>moderator</option>
                <option ${u.role === 'admin' ? 'selected' : ''}>admin</option>
              </select>
            </td>
            <td>${u.is_active ? '<span style="color:var(--color-success)">Active</span>' : '<span style="color:var(--color-error)">Inactive</span>'}</td>
            <td>${new Date(u.created_at * 1000).toLocaleDateString()}</td>
            <td>
              <button class="btn btn--xs btn--danger" data-deactivate="${u.id}">
                ${u.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    contentEl.querySelectorAll('[data-field="role"]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const { ok, data: res } = await apiFetch(`/api/admin/users/${sel.dataset.userId}`, {
          method: 'PUT', body: JSON.stringify({ role: sel.value })
        });
        toast(ok ? 'Role updated' : res.error || 'Failed', ok ? 'success' : 'error');
      });
    });

    contentEl.querySelectorAll('[data-deactivate]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { ok } = await apiFetch(`/api/admin/users/${btn.dataset.deactivate}`, {
          method: 'DELETE'
        });
        if (ok) { toast('User deactivated'); loadUsers(); }
        else toast('Failed', 'error');
      });
    });
  }

  async function loadReviews() {
    if (titleEl) titleEl.textContent = 'Reviews';
    const { ok, data } = await apiFetch('/api/admin/reviews?status=all');
    if (!ok || !contentEl) return;

    contentEl.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>User</th><th>TMDB</th><th>Rating</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.reviews.map(r => `<tr>
            <td>${escHtml(r.username)}</td>
            <td><a href="/${r.media_type}/${r.tmdb_id}" style="color:var(--color-primary)">${r.tmdb_id}</a></td>
            <td>${r.rating}/10</td>
            <td>${r.status}</td>
            <td>${new Date(r.created_at * 1000).toLocaleDateString()}</td>
            <td style="display:flex;gap:.5rem;flex-wrap:wrap">
              ${r.status !== 'published' ? `<button class="btn btn--xs btn--primary" data-review-action="${r.id}" data-status="published">Approve</button>` : ''}
              ${r.status !== 'rejected' ? `<button class="btn btn--xs btn--ghost" data-review-action="${r.id}" data-status="rejected">Reject</button>` : ''}
              <button class="btn btn--xs btn--danger" data-review-action="${r.id}" data-status="deleted">Delete</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    contentEl.querySelectorAll('[data-review-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { ok } = await apiFetch(`/api/admin/reviews/${btn.dataset.reviewAction}`, {
          method: 'PUT', body: JSON.stringify({ status: btn.dataset.status })
        });
        if (ok) { toast('Review updated'); loadReviews(); }
        else toast('Failed', 'error');
      });
    });
  }

  async function loadSettings() {
    if (titleEl) titleEl.textContent = 'Settings';
    const { ok, data } = await apiFetch('/api/admin/settings');
    if (!ok || !contentEl) return;

    const s = data.settings;
    contentEl.innerHTML = `
      <div class="settings-card">
        <h2 class="settings-section-title">Site Settings</h2>
        <form id="admin-settings-form" class="settings-form">
          <div class="form-group">
            <label class="form-label">Site Name</label>
            <input class="form-input" name="site_name" value="${escHtml(s.site_name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Tagline</label>
            <input class="form-input" name="site_tagline" value="${escHtml(s.site_tagline || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Maintenance Mode</label>
            <select class="form-select" name="maintenance_mode">
              <option value="0" ${s.maintenance_mode !== '1' ? 'selected' : ''}>Off</option>
              <option value="1" ${s.maintenance_mode === '1' ? 'selected' : ''}>On</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Registration</label>
            <select class="form-select" name="registration_enabled">
              <option value="1" ${s.registration_enabled !== '0' ? 'selected' : ''}>Enabled</option>
              <option value="0" ${s.registration_enabled === '0' ? 'selected' : ''}>Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reviews Require Approval</label>
            <select class="form-select" name="reviews_require_approval">
              <option value="0" ${s.reviews_require_approval !== '1' ? 'selected' : ''}>No</option>
              <option value="1" ${s.reviews_require_approval === '1' ? 'selected' : ''}>Yes</option>
            </select>
          </div>
          <div class="form-message" id="admin-settings-msg"></div>
          <button type="submit" class="btn btn--primary">Save Settings</button>
        </form>
      </div>
    `;

    $('#admin-settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const settings = {};
      new FormData(form).forEach((v, k) => { settings[k] = v; });
      const { ok } = await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
      setFormMessage($('#admin-settings-msg'), ok ? 'Settings saved!' : 'Failed to save.', ok ? 'success' : 'error');
    });
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initSearchAutocomplete();
  initTrailerModal();
  initListButtons();
  initReviewForm();
  initTrendingTabs();
  initSortSelect();
  initLoginForm();
  initRegisterForm();
  initSettingsForms();
  initReviewManagement();
  initPasswordToggles();
  initBioExpand();
  initAdminPanel();
});
