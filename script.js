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
  statusEl.textContent = 'Searching...';
  try {
    const res = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(q)}&num=${max}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    statusEl.textContent = `Found ${data.results.length} results (scored).`;
    renderResults(data.results);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error: ' + err.message;
  }
});

function renderResults(items) {
  if (!items.length) {
    resultsEl.innerHTML = '<p>No results found.</p>';
    return;
  }
  const html = items.map(item => {
    const img = item.image || 'https://via.placeholder.com/300x200?text=No+Image';
    const price = item.price ? `<p><strong>Price:</strong> ${item.price}</p>` : '';
    return `
      <article class="card">
        <a href="${item.link}" target="_blank" rel="noopener noreferrer">
          <img src="${img}" alt="${escapeHtml(item.title)}" />
        </a>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.snippet || '')}</p>
          ${price}
          <div style="margin-top:8px"><span class="badge">score ${item.score}</span></div>
        </div>
      </article>
    `;
  }).join('');
  resultsEl.innerHTML = html;
}

function escapeHtml(unsafe) {
  return unsafe ? unsafe.replace(/[&<"']/g, m => ({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m])) : '';
}
