// script.js
const form = document.getElementById('searchForm');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');
const maxResultsEl = document.getElementById('maxResults');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('query').value.trim();
  if (!q) return;
  const max = maxResultsEl.value || 10;

  resultsEl.innerHTML = '';
  statusEl.textContent = '🔍 Searching (AI-enhanced)...';

  try {
    const res = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(q)}&num=${encodeURIComponent(max)}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();

    if (!data.results || !data.results.length) {
      statusEl.textContent = data.warning ? `⚠️ ${data.warning}` : 'No results found.';
      resultsEl.innerHTML = '<p>No results found.</p>';
      return;
    }

    statusEl.textContent = `✅ Found ${data.results.length} results (AI-ranked)`;
    renderResults(data.results);
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ Error: ' + err.message;
    resultsEl.innerHTML = `<p class="error">Error: ${escapeHtml(err.message)}</p>`;
  }
});

function renderResults(items) {
  resultsEl.innerHTML = items.map(item => {
    const img = item.image || 'https://via.placeholder.com/400x280?text=No+Image';
    const price = item.price ? `<div class="price-line">💲 ${escapeHtml(item.price)}</div>` : '';
    const sim = (typeof item.similarity === 'number') ? `· sim ${(Math.round(item.similarity * 1000)/10)}%` : '';
    const scoreBadge = (typeof item.score === 'number') ? `<span class="badge">score ${item.score}</span>` : '';
    return `
      <article class="card">
        <a href="${item.link}" target="_blank" rel="noopener noreferrer">
          <img src="${img}" alt="${escapeHtml(item.title)}" />
        </a>
        <div class="card-body">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="snippet">${escapeHtml(item.snippet || '')}</p>
          ${price}
          <div class="meta">
            ${scoreBadge}
            <div class="sim">${sim}</div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function escapeHtml(unsafe) {
  return unsafe ? unsafe.replace(/[&<"']/g, m => ({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m])) : '';
}
