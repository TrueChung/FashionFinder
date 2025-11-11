// netlify/functions/search.js
const fetch = require('node-fetch');

function dot(a,b){
  let s = 0;
  for(let i=0;i<a.length;i++) s += a[i]*b[i];
  return s;
}
function norm(a){
  let s = 0;
  for(let i=0;i<a.length;i++) s += a[i]*a[i];
  return Math.sqrt(s);
}
function cosine(a,b){
  const d = dot(a,b);
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return d / (na * nb);
}

exports.handler = async function(event) {
  try {
    const q = (event.queryStringParameters && event.queryStringParameters.q) || '';
    let num = parseInt((event.queryStringParameters && event.queryStringParameters.num) || '10', 10);
    if (isNaN(num) || num < 1) num = 10;
    // cap to avoid large embedding requests
    const MAX_CANDIDATES = 12;
    if (num > MAX_CANDIDATES) num = MAX_CANDIDATES;

    if (!q) return { statusCode: 400, body: JSON.stringify({ error: 'Missing query parameter q' }) };

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CX = process.env.GOOGLE_CX;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!GOOGLE_API_KEY || !GOOGLE_CX || !OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server config error: missing API keys' }) };
    }

    // 1) Call Google Custom Search to get candidate pages
    const gurl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}&cx=${encodeURIComponent(GOOGLE_CX)}&q=${encodeURIComponent(q)}&num=${encodeURIComponent(num)}`;
    const gres = await fetch(gurl);
    if (!gres.ok) {
      const txt = await gres.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Google API error', detail: txt }) };
    }
    const gdata = await gres.json();
    const rawItems = gdata.items || [];

    // Normalize candidate items (title + snippet + image + price if any)
    const candidates = rawItems.map(it => {
      const pagemap = it.pagemap || {};
      const image =
        (pagemap.cse_image && pagemap.cse_image[0] && pagemap.cse_image[0].src) ||
        (pagemap.image && pagemap.image[0] && pagemap.image[0].src) ||
        (pagemap.metatags && pagemap.metatags[0] && (pagemap.metatags[0]['og:image'] || pagemap.metatags[0]['twitter:image'])) ||
        '';
      const price =
        (pagemap.offer && pagemap.offer[0] && (pagemap.offer[0].price || pagemap.offer[0].priceCurrency)) ||
        (pagemap.product && pagemap.product[0] && pagemap.product[0].offers && pagemap.product[0].offers[0] && pagemap.product[0].offers[0].price) ||
        (pagemap.metatags && pagemap.metatags[0] && (pagemap.metatags[0]['product:price:amount'] || pagemap.metatags[0]['og:price:amount'])) ||
        '';

      return {
        title: it.title || '',
        link: it.link || '',
        snippet: it.snippet || '',
        image,
        price,
        pagemap
      };
    });

    // 2) Prepare texts for embeddings: first item is query, then candidate title+snippet
    const embedInputs = [ q ].concat(candidates.map(c => `${c.title} — ${c.snippet}`));
    // 3) Call OpenAI embeddings (text-embedding-3-large) to get all vectors in one request
    const openaiRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: embedInputs
      })
    });

    if (!openaiRes.ok) {
      const txt = await openaiRes.text();
      // fallback: return Google results with basic scoring if embeddings fail
      return { statusCode: 200, body: JSON.stringify({ results: candidates.map((c,i)=>({ ...c, score:0 })) , warning: 'OpenAI embeddings failed', detail: txt }) };
    }

    const openaiJson = await openaiRes.json();
    const embeddings = (openaiJson.data || []).map(d => d.embedding);

    if (!embeddings || embeddings.length < 1) {
      return { statusCode: 200, body: JSON.stringify({ results: candidates.map((c,i)=>({ ...c, score:0 })) }) };
    }

    const queryEmbedding = embeddings[0];
    const itemEmbeddings = embeddings.slice(1);

    // 4) Compute cosine similarity and combine with lightweight heuristics
    const colorWords = ['red','blue','green','yellow','black','white','gray','grey','brown','pink','purple','navy','khaki','maroon','olive'];

    const scored = candidates.map((c, idx) => {
      const emb = itemEmbeddings[idx] || null;
      const sim = emb ? cosine(queryEmbedding, emb) : 0;

      // heuristic signals
      let heuristic = 0;
      const t = (`${c.title} ${c.snippet}`).toLowerCase();
      // query word boosts (light)
      q.toLowerCase().split(/\s+/).filter(Boolean).forEach(w => {
        if (t.includes(w)) heuristic += 0.2;
      });
      // color match bonus
      colorWords.forEach(col => { if (q.toLowerCase().includes(col) && t.includes(col)) heuristic += 0.15; });
      // image & price bonus
      if (c.image) heuristic += 0.12;
      if (c.price) heuristic += 0.25;
      // product structured data (pagemap.product / offer) big bonus
      if (c.pagemap && (c.pagemap.offer || c.pagemap.product)) heuristic += 0.45;

      // Combine: primary weight to semantic sim, then heuristics
      // similarity is in [-1,1], but embeddings should produce positive similarity for related items
      const finalScore = Math.max(0, (sim * 1.2) + heuristic);

      return {
        ...c,
        similarity: sim,
        score: Math.round(finalScore * 100) / 100
      };
    });

    // 5) sort by score desc, fallback by similarity
    scored.sort((a,b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.similarity || 0) - (a.similarity || 0);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: scored })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
