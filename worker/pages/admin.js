// Admin panel page renderer

import { baseLayout } from '../utils/layout.js';
import { htmlResponse, generateMetaTags, redirect, sanitizeHtml } from '../utils/helpers.js';

export async function renderAdminPanel(request, env, user) {
  if (!user || user.role !== 'admin') return redirect('/');

  const url = new URL(request.url);
  const section = url.searchParams.get('section') || 'dashboard';

  const head = generateMetaTags({
    title: `Admin Panel – TuktakMovies`,
    url: 'https://tuktakmovies.online/admin'
  });

  const body = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="admin-sidebar-header">
          <span class="admin-badge">Admin</span>
        </div>
        <nav class="admin-nav" aria-label="Admin navigation">
          <a href="/admin?section=dashboard" class="admin-nav-link ${section === 'dashboard' ? 'admin-nav-link--active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Dashboard
          </a>
          <a href="/admin?section=users" class="admin-nav-link ${section === 'users' ? 'admin-nav-link--active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
          </a>
          <a href="/admin?section=reviews" class="admin-nav-link ${section === 'reviews' ? 'admin-nav-link--active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Reviews
          </a>
          <a href="/admin?section=settings" class="admin-nav-link ${section === 'settings' ? 'admin-nav-link--active' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </a>
        </nav>
        <a href="/" class="admin-nav-link admin-nav-link--back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
          Back to Site
        </a>
      </aside>

      <main class="admin-main" id="admin-main">
        <div class="admin-topbar">
          <h1 class="admin-page-title" id="admin-title">Loading…</h1>
          <span class="admin-user-badge">${sanitizeHtml(user.display_name || user.username)}</span>
        </div>
        <div class="admin-content" id="admin-content">
          <div class="admin-loading">
            <div class="spinner" aria-label="Loading"></div>
          </div>
        </div>
      </main>
    </div>

    <script>
      window.__ADMIN_SECTION__ = ${JSON.stringify(section)};
    </script>
  `;

  return htmlResponse(baseLayout({ head, body, user, bodyClass: 'admin-layout-body' }));
}

export async function renderPersonDetail(request, env, user, personId) {
  let person;
  try {
    const { getPersonDetails } = await import('../utils/tmdb.js');
    person = await getPersonDetails(env, personId);
  } catch (e) {
    return htmlResponse(baseLayout({
      head: '<title>Person Not Found – TuktakMovies</title>',
      body: `<div class="container error-page"><h1>Person Not Found</h1><a href="/" class="btn btn--primary">Go Home</a></div>`,
      user
    }), 404);
  }

  const { imgUrl, backdropUrl } = await import('../utils/tmdb.js');
  const knownFor = [...(person.movie_credits?.cast || []), ...(person.tv_credits?.cast || [])]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 12);

  const { generateMetaTags, sanitizeHtml, htmlResponse: hr } = await import('../utils/helpers.js');
  const { movieCard } = await import('../utils/layout.js');

  const head = generateMetaTags({
    title: `${person.name} – TuktakMovies`,
    description: person.biography ? person.biography.substring(0, 155) : `Filmography of ${person.name}`,
    url: `https://tuktakmovies.online/person/${personId}`,
    image: person.profile_path ? `https://image.tmdb.org/t/p/w500${person.profile_path}` : undefined
  });

  const body = `
    <div class="container page-container">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">${sanitizeHtml(person.name)}</span>
      </nav>

      <div class="person-layout">
        <aside class="person-sidebar">
          <img
            src="${person.profile_path ? imgUrl(person.profile_path, 'w342') : '/images/no-avatar.svg'}"
            alt="${sanitizeHtml(person.name)}"
            class="person-profile-img"
            width="342" height="513"
            loading="eager"
          >
          <div class="person-info-list">
            ${person.birthday ? `<div class="person-info-item"><dt>Born</dt><dd>${person.birthday}</dd></div>` : ''}
            ${person.place_of_birth ? `<div class="person-info-item"><dt>Birthplace</dt><dd>${sanitizeHtml(person.place_of_birth)}</dd></div>` : ''}
            ${person.deathday ? `<div class="person-info-item"><dt>Died</dt><dd>${person.deathday}</dd></div>` : ''}
            ${person.known_for_department ? `<div class="person-info-item"><dt>Known For</dt><dd>${sanitizeHtml(person.known_for_department)}</dd></div>` : ''}
          </div>
        </aside>

        <div class="person-main">
          <h1 class="person-name-heading">${sanitizeHtml(person.name)}</h1>

          ${person.biography ? `
            <section aria-labelledby="bio-heading">
              <h2 class="section-title" id="bio-heading">Biography</h2>
              <div class="person-bio" id="person-bio">
                <p>${sanitizeHtml(person.biography.substring(0, 600))}${person.biography.length > 600 ? `<span class="bio-more" hidden>${sanitizeHtml(person.biography.substring(600))}</span> <button class="bio-expand-btn" aria-expanded="false">Read more</button>` : ''}</p>
              </div>
            </section>
          ` : ''}

          <section aria-labelledby="filmography-heading">
            <h2 class="section-title" id="filmography-heading">Known For</h2>
            <div class="movies-scroll-track">
              <div class="movies-scroll">
                ${knownFor.map(m => movieCard(m, m.media_type || 'movie', { showListBtns: !!user })).join('')}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  return htmlResponse(baseLayout({ head, body, user }));
}
