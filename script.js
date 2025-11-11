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
  statusEl.textContent = '🔍 Searching...';

  try {
    const res = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(q)}&num=${max}`);
    if (!res.ok) throw new Error('Search request failed');
    const data = await res.json();

    if (!data.results || !data.results.length) {
      statusEl.textContent = 'No results found.';
      resultsEl.innerHTML = '<p>No matching products found.</p>';
      return;
    }

    statusEl.textContent = `✅ Found ${data.results.length} results`;
    renderResults(data.results);
  } catch (err) {
    console.error(err);
    statusEl.textContent = '⚠️ Error: ' + err.message;
  }
});

function renderResults(items) {
  resultsEl.innerHTML = items
    .map(item => {
      const img = item.image || 'https://via.placeholder.com/300x200?text=No+Image';
      const price = item.price ? `<p><strong>💲 Price:</strong> ${escapeHtml(item.price)}</p>` : '';
      return `
        <article class="card">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">
            <img src="${img}" alt="${escapeHtml(item.title)}" />
          </a>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.snippet || '')}</p>
            ${price}
            <div class="score">⭐ Score: ${item.score}</div>
          </div>
        </article>
      `;
    })
    .join('');
}

function escapeHtml(unsafe) {
  return unsafe
    ? unsafe.replace(/[&<"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '"': '&quot;', "'": '&#039;' }[m]))
    : '';
}
