// /api/product.js
// Runs on Vercel's servers. When someone (or a search engine, or an AI crawler)
// opens a clean product address like /bamboo-cup, vercel.json sends the request here.
//
// What this does:
//   1. Looks the product up in Supabase by its slug.
//   2. Takes the normal shop page (index.html) and fills in that product's real
//      title, description, share photo, price and Google "Product" data, plus a plain
//      text version of the product, so crawlers that do not run JavaScript can still read it.
//   3. Sends that page back. The shop's normal code then takes over for customers.
//
// If anything goes wrong, customers are simply sent to the normal shop page.

const SB_URL = process.env.SUPABASE_URL || 'https://cdczxunygdmswgdzkbed.supabase.co';
// This is the public "anon" key, the same one the shop page already uses in the browser.
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkY3p4dW55Z2Rtc3dnZHprYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTg5NjksImV4cCI6MjEwMjc3NDk2OX0.IrC05NPev5Zp6uV0DMe0gZI3boQsqXuTYSTVdyn8oWg';
const BRAND = 'Mike Charlie Co.';

// Folders and pages that exist on the site. If one of these ever lands here, we just forward it.
const FOLDERS = ['admin', 'preloved', 'hotel-portal', 'hotel-partner-program'];
const PAGES = { account: '/account.html', checkout: '/checkout.html', privacy: '/privacy.html' };

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
const money = (n) => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function sb(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  return r.json();
}

function notFoundPage(origin) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page not found | ${BRAND}</title><meta name="robots" content="noindex">
<style>body{font-family:sans-serif;background:#F7F3EC;color:#1C2E2C;text-align:center;padding:4rem 1.25rem}a{color:#3E5F5C;font-weight:600}</style></head>
<body><h1>We couldn't find that page</h1><p>The product may have moved or is no longer available.</p><p><a href="${origin}/">Go to the shop</a></p></body></html>`;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = `${proto}://${host}`;
  // Once the real domain is live, set SITE_URL in Vercel (for example https://mikecharlieco.com)
  // so the official address in the page always uses it.
  const siteUrl = (process.env.SITE_URL || origin).replace(/\/$/, '');

  if (!slug) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
  if (FOLDERS.includes(slug)) { res.statusCode = 308; res.setHeader('Location', `/${slug}/`); return res.end(); }
  if (PAGES[slug]) { res.statusCode = 308; res.setHeader('Location', PAGES[slug]); return res.end(); }

  let listing, skus;
  try {
    const found = await sb(`product_listings?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`);
    listing = found[0];
    if (listing) {
      skus = await sb(`skus?product_name=eq.${encodeURIComponent(listing.title)}&is_sellable=eq.true&is_active=eq.true&select=sku_code,variant,variant_axis_1,variant_axis_2,retail_price_direct,sale_price,is_on_sale,current_stock,categories(name)&order=sku_code.asc`);
    }
  } catch (e) {
    // Could not reach the database: let the shop page handle it in the browser.
    res.statusCode = 302; res.setHeader('Location', '/?product=' + encodeURIComponent(slug)); return res.end();
  }

  if (!listing || !skus || !skus.length) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.end(notFoundPage(origin));
  }

  // ---- Work out the product facts ----
  const title = listing.title;
  const canonical = `${siteUrl}/${slug}`;
  const preloved = skus.some(s => s.categories && /preloved/i.test(s.categories.name || ''));
  const price = (s) => (s.is_on_sale && s.sale_price != null ? s.sale_price : s.retail_price_direct);
  const prices = skus.map(price).filter(p => p != null).map(Number);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const inStock = skus.some(s => s.current_stock > 0);
  const strip = (t) => String(t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const longDesc = strip(listing.long_description);
  const shortDesc = strip(listing.short_description);
  const descSource = shortDesc || longDesc || `${title} from ${BRAND}, handmade in the Philippines.`;
  const metaDesc = (descSource.length > 155 ? descSource.slice(0, 152).replace(/\s+\S*$/, '') + '...' : descSource);
  const images = [listing.cover_image_url, listing.image_1, listing.image_2, listing.image_3, listing.image_4,
    listing.image_5, listing.image_6, listing.image_7, listing.image_8, listing.image_9]
    .filter(u => u && /^https?:\/\//i.test(u));
  const ogImage = images[0] || 'https://static.wixstatic.com/media/d7782b_3a9162ba9b124d5ab92b94577479d348~mv2.png';
  const pageTitle = `${title} | ${BRAND}`;
  const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`;
  const condition = `https://schema.org/${preloved ? 'UsedCondition' : 'NewCondition'}`;

  let offers;
  if (skus.length > 1 && low != null) {
    offers = {
      '@type': 'AggregateOffer', priceCurrency: 'PHP', lowPrice: low, highPrice: high, offerCount: skus.length,
      availability, itemCondition: condition, url: canonical,
      offers: skus.map(s => ({
        '@type': 'Offer', priceCurrency: 'PHP', price: Number(price(s)), sku: s.sku_code,
        name: [s.variant_axis_1, s.variant_axis_2].filter(Boolean).join(' ') || s.variant || s.sku_code,
        availability: `https://schema.org/${s.current_stock > 0 ? 'InStock' : 'OutOfStock'}`,
        itemCondition: condition, url: canonical
      }))
    };
  } else if (low != null) {
    offers = { '@type': 'Offer', priceCurrency: 'PHP', price: low, sku: skus[0].sku_code, availability, itemCondition: condition, url: canonical };
  }

  const product = {
    '@context': 'https://schema.org', '@type': 'Product', name: title, description: longDesc || descSource,
    brand: { '@type': 'Brand', name: BRAND }, url: canonical
  };
  if (images.length) product.image = images;
  if (offers) product.offers = offers;

  const headBlock = `
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<script type="application/ld+json">${jsonLd(product)}</script>
`;

  // A plain readable copy of the product, for crawlers that do not run JavaScript.
  // The shop's own code replaces this as soon as the page loads, so customers never see two copies.
  const variantNames = skus.map(s => [s.variant_axis_1, s.variant_axis_2].filter(Boolean).join(' ') || s.variant).filter(Boolean);
  const staticBlock = `<div id="seo-product">
<h1>${esc(title)}</h1>
${images[0] ? `<img src="${esc(images[0])}" alt="${esc(title)}" width="600">` : ''}
<p>${esc(longDesc || descSource)}</p>
${low != null ? `<p>Price: ${low === high ? money(low) : money(low) + ' to ' + money(high)} (Philippine pesos). ${inStock ? 'In stock.' : 'Currently out of stock.'}</p>` : ''}
${variantNames.length > 1 ? `<p>Available options: ${esc(variantNames.join(', '))}</p>` : ''}
<p><a href="/">Shop all products from ${BRAND}</a></p>
</div>`;

  // ---- Get the normal shop page and fill it in ----
  let shell = '';
  try {
    const r = await fetch(`${origin}/index.html`, { headers: { 'x-mcc-internal': '1' } });
    if (r.ok) shell = await r.text();
  } catch (e) { /* fall through */ }

  let html;
  if (shell && shell.includes('<div id="detail-view"></div>')) {
    html = shell
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+name="description"[^>]*>/gi, '')
      .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi, '')
      .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
      .replace('</head>', headBlock + '</head>')
      .replace('<div id="detail-view"></div>', `<div id="detail-view">${staticBlock}</div>`);
  } else {
    // Could not load the shop page: send a small page that forwards customers to the shop.
    const first = skus[0].sku_code;
    html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${headBlock}
<script>location.replace('/?product=${encodeURIComponent(first)}');</script></head><body>${staticBlock}</body></html>`;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Vercel keeps a copy for 5 minutes, so lots of visitors or crawlers do not each hit the database.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.end(html);
}
