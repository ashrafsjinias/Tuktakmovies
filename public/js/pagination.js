// ---------- Reusable pagination helper ----------
// Does not fetch or change any data — it only slices an already-loaded
// array into pages and calls your existing render function with each
// page's items. Drop this file into any listing page alongside its
// current script; nothing else needs to change.
//
// Usage:
//   paginate(allItems, {
//     perPage: 12,
//     containerId: "my-pagination",   // an empty <div> where controls go
//     onRender: (pageItems) => { ...your existing render call... }
//   });

function paginate(allItems, { perPage = 12, containerId, onRender }) {
  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));

  function renderPage() {
    const start = (currentPage - 1) * perPage;
    const pageItems = allItems.slice(start, start + perPage);
    onRender(pageItems);
    renderControls();
  }

  function renderControls() {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = `
      <button type="button" class="page-btn page-prev" ${currentPage === 1 ? "disabled" : ""}>← Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="page-btn page-next" ${currentPage === totalPages ? "disabled" : ""}>Next →</button>
    `;
    container.querySelector(".page-prev")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderPage();
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    container.querySelector(".page-next")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPage();
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  renderPage();
}
