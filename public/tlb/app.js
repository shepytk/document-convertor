/**
 * TLB Finder SA – app.js
 *
 * Loads listings data from the same public folder,
 * populates filter dropdowns, renders cards, and responds to
 * user input (search / price range / brand / province / sort).
 */

const DATA_URL  = './listings.json';
const MIN_PRICE = 350_000;
const MAX_PRICE = 450_000;

let allListings = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const grid          = document.getElementById('listingsGrid');
const noResults     = document.getElementById('noResults');
const totalCount    = document.getElementById('totalCount');
const lastUpdated   = document.getElementById('lastUpdated');
const searchInput   = document.getElementById('searchInput');
const priceRange    = document.getElementById('priceRange');
const priceLabel    = document.getElementById('priceLabel');
const brandFilter   = document.getElementById('brandFilter');
const provinceFilter= document.getElementById('provinceFilter');
const sortSelect    = document.getElementById('sortSelect');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetch(DATA_URL)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      allListings = data.listings || [];
      setMeta(data);
      populateFilters(allListings);
      bindEvents();
      renderListings(allListings);
    })
    .catch(err => {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <span>⚠️</span>
          <p>Could not load listings data.<br><small>${err.message}</small></p>
        </div>`;
      console.error('Failed to load listings:', err);
    });
});

// ── Meta / header ─────────────────────────────────────────────────────────────
function setMeta(data) {
  const dt = new Date(data.updated_at);
  const fmt = new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  lastUpdated.textContent = `Updated ${fmt.format(dt)}`;
  totalCount.textContent  = `${data.count} listings`;
}

// ── Populate filter dropdowns ─────────────────────────────────────────────────
function populateFilters(listings) {
  const brands    = [...new Set(listings.map(l => l.brand).filter(Boolean))].sort();
  const provinces = [...new Set(listings.map(l => extractProvince(l.location)).filter(Boolean))].sort();

  brands.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    brandFilter.appendChild(opt);
  });

  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    provinceFilter.appendChild(opt);
  });
}

function extractProvince(location) {
  if (!location) return '';
  // "City, Province" → take the part after the last comma
  const parts = location.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : location.trim();
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  searchInput.addEventListener('input',   applyFilters);
  brandFilter.addEventListener('change',  applyFilters);
  provinceFilter.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change',   applyFilters);

  priceRange.addEventListener('input', () => {
    priceLabel.textContent = `R ${Number(priceRange.value).toLocaleString('en-ZA')}`;
    applyFilters();
  });
}

// ── Filter + sort ─────────────────────────────────────────────────────────────
function applyFilters() {
  const query   = searchInput.value.trim().toLowerCase();
  const maxPri  = Number(priceRange.value);
  const brand   = brandFilter.value;
  const province= provinceFilter.value;
  const sort    = sortSelect.value;

  let results = allListings.filter(l => {
    if (l.price_zar < MIN_PRICE || l.price_zar > maxPri) return false;
    if (brand && l.brand !== brand) return false;
    if (province && extractProvince(l.location) !== province) return false;
    if (query) {
      const haystack = [l.title, l.brand, l.location, String(l.year || '')].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  results = sortListings(results, sort);
  totalCount.textContent = `${results.length} listing${results.length !== 1 ? 's' : ''}`;
  renderListings(results);
}

function sortListings(list, sort) {
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'price_asc':  return a.price_zar - b.price_zar;
      case 'price_desc': return b.price_zar - a.price_zar;
      case 'year_desc':  return (b.year || 0) - (a.year || 0);
      case 'year_asc':   return (a.year || 0) - (b.year || 0);
      default:           return 0;
    }
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderListings(listings) {
  if (listings.length === 0) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');
  grid.innerHTML = listings.map(buildCard).join('');

  // Attach image-error handlers after inserting markup (avoids inline onerror)
  grid.querySelectorAll('.card-img-wrap img').forEach(img => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const placeholder = img.parentElement.querySelector('.card-img-placeholder');
      if (placeholder) placeholder.style.display = 'flex';
    });
  });
}

function buildCard(l) {
  const imgHtml = l.image_url
    ? `<img src="${safeUrl(l.image_url)}" alt="${escHtml(l.title)}" loading="lazy">`
    : '';

  const yearChip     = l.year ? `<span class="meta-chip">📅 ${l.year}</span>` : '';
  const hoursChip    = l.hours ? `<span class="meta-chip">⏱ ${escHtml(l.hours)}</span>` : '';
  const locationChip = l.location ? `<span class="meta-chip">📍 ${escHtml(l.location)}</span>` : '';

  return `
    <article class="listing-card">
      <div class="card-img-wrap">
        ${imgHtml}
        <div class="card-img-placeholder" style="${l.image_url ? 'display:none' : ''}">🚜</div>
        <span class="card-source-badge">${escHtml(l.source || 'Mascus ZA')}</span>
      </div>
      <div class="card-body">
        <h2 class="card-title">${escHtml(l.title)}</h2>
        <div class="card-price">${escHtml(l.price_display)}</div>
        <div class="card-meta">
          ${yearChip}
          ${hoursChip}
          ${locationChip}
        </div>
        <div class="card-actions">
          <a class="btn-view"
             href="${safeUrl(l.listing_url)}"
             target="_blank"
             rel="noopener noreferrer">
            View Listing →
          </a>
        </div>
      </div>
    </article>`;
}

/** Allow only http/https URLs; fall back to '#' for anything else. */
function safeUrl(url) {
  try {
    const parsed = new URL(String(url ?? ''));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escHtml(url);
    }
  } catch (_) { /* invalid URL */ }
  return '#';
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
