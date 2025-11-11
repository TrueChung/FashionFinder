// netlify/functions/search.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  try {
    const q = (event.queryStringParameters && event.queryStringParameters.q) || '';
    const num = (event.queryStringParameters && event.queryStringParameters.num) || '10';

    if (!q) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing query parameter q' }) };
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CX = process.env.GOOGLE_CX;

    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server config error: missing API keys' }) };
    }

    // Call Google Custom Search JSON API
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}&cx=${encodeURIComponent(GOOGLE_CX)}&q=${encodeURIComponent(q)}&num=${encodeURIComponent(num)}`;
    const gres = await fetch(url);
    if (!gres.ok) {
      const txt = await gres.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Google API error', detail: txt }) };
    }
    const gdata = await gres.json();

    // Normalize results
    const items = (gdata.items || []).map(it => ({
      title: it.title || '',
      link: it.link || '',
      snippet: it.snippet || '',
      image: (it.pagemap && it.pagemap.cse_image && it.pagemap.cse_image[0] && it.pagemap.cse_image[0].src) || 
             (it.pagemap && it.pagemap.image && it.pagemap.image[0] && it.pagemap.image[0].src) || '',
      // try to extract price if available in metatags
      price: (it.pagemap && it.pagemap.offer && it.pagemap.offer[0] && it.pagemap.offer[0].price) || ''
    }));

    // Simple scoring rules:
    // +2 points for title containing exact words of query, +1 if snippet contains color words, etc.
    const queryLower = q.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    const colorWords = ['red','blue','green','yellow','black','white','gray','grey','brown','pink','purple','navy','khaki','maroon','olive'];

    const scored = items.map(item => {
      let score = 0;
      const title = (item.title || '').toLowerCase();
      const snippet = (item.snippet || '').toLowerCase();

      // match exact words from query in title
      queryWords.forEach(w => { if (title.includes(w)) score += 2; });

      // small boost if snippet includes query words
      queryWords.forEach(w => { if (snippet.includes(w)) score += 1; });

      // detect colors
      colorWords.forEach(c => { if (queryLower.includes(c) && (title.includes(c) || snippet.includes(c))) score += 1; });

      // penalize extremely short snippets (likely irrelevant)
      if ((snippet.length || 0) < 20) score -= 1;

      // ensure score minimum 0
      if (score < 0) score = 0;
      return { ...item, score };
    });

    // sort by score desc
    scored.sort((a,b) => b.score - a.score);

    return {
      statusCode: 200,
      body: JSON.stringify({ results: scored })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
