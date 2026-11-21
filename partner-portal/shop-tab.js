/* ============================================================
   PARTNER PORTAL: NEW ORDER TAB (the partner shop)
   Sets on top, then product cards with wholesale prices.
   Prices here are for display and the running total only: the database
   works out the real prices again when the order is placed.
   Variant choosing for products with many variants is in picker.js.
   ============================================================ */
const SHOP = { loaded: false, skus: [], tiers: [], sets: [], cover: {}, vphoto: {}, products: [] };

async function ppRest(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: ppHeaders() });
  if (!r.ok) throw new Error('load failed');
  return r.json();
}

async function ppLoadShop() {
    if (!SHOP.loaded) {
      const [skus, tiers, sets, listings, vp] = await Promise.all([
        ppRest('skus?is_active=eq.true&is_sellable=eq.true&select=id,product_name,variant,retail_price_direct,is_on_sale,sale_price,weight_g,web_status&order=product_name.asc,variant.asc'),
        ppRest('mcc_partner_price_tiers?select=product_name,variant,min_qty,unit_price&order=min_qty.asc'),
        ppRest('mcc_partner_sets?is_active=eq.true&select=*&order=sort.asc'),
        ppRest('product_listings?select=title,cover_image_url').catch(() => []),
        ppRest('variant_photos?select=sku_id,photo_url').catch(() => [])
      ]);
      Object.assign(SHOP, { skus, tiers, sets, loaded: true });
      SHOP.cover = {}; listings.forEach(l => { if (l.cover_image_url) SHOP.cover[l.title] = l.cover_image_url; });
      SHOP.vphoto = {}; vp.forEach(v => { if (v.photo_url) SHOP.vphoto[v.sku_id] = v.photo_url; });
      const by = {};
      skus.forEach(s => { (by[s.product_name] = by[s.product_name] || []).push(s); });
      SHOP.products = Object.keys(by).map(name => ({ name, skus: by[name] }));
    }
}

async function ppRenderShop(body) {
  try {
    await ppLoadShop();
  } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load the shop</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again.</p>
      <button class="btn btn-p" onclick="SHOP.loaded=false;ppShowTab('order')">Try again</button></div>`;
    return;
  }
  body.innerHTML = `
    <h2 class="sec-title" style="margin-top:.4rem">Ready-made sets</h2>
    <p class="sec-sub">Our most popular bundles for hotels and shops. We choose the variants for you and wrap them in your branding.</p>
    <div class="sets">${SHOP.sets.map(ppSetCard).join('')}</div>
    <h2 class="sec-title">Shop all products</h2>
    <p class="sec-sub">Wholesale prices apply automatically once you reach the amount shown. You can always order fewer, you will just pay our regular price.</p>
    <div class="grid">${SHOP.products.map(ppProductCard).join('')}</div>`;
  ppRenderBar();
}

/* ─── Prices ─── */
function ppBase(s) { return (s.is_on_sale && s.sale_price != null) ? Number(s.sale_price) : Number(s.retail_price_direct); }
function ppTiersFor(productName) { return SHOP.tiers.filter(t => t.product_name === productName); }
function ppMatchVariant(pattern, variant) {
  if (pattern == null) return true;
  const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
  return re.test(variant || '');
}
function ppPooled(lines, productName, pattern) {
  return lines.reduce((sum, l) => {
    if (l.kind === 'set') return sum;
    const s = l.kind === 'product' ? SHOP.skus.find(x => x.id === l.sku_id) : null;
    const pn = s ? s.product_name : l.product_name;
    return pn === productName && (pattern == null || (s && ppMatchVariant(pattern, s.variant))) ? sum + l.qty : sum;
  }, 0);
}
/* The price one piece costs given the whole draft (same rule the database uses) */
function ppUnitPrice(sku, lines) {
  const tiers = ppTiersFor(sku.product_name).filter(t => ppMatchVariant(t.variant, sku.variant) && ppPooled(lines, sku.product_name, t.variant) >= t.min_qty);
  if (tiers.length) return Number(tiers.sort((a, b) => b.min_qty - a.min_qty)[0].unit_price);
  return ppBase(sku);
}
function ppDraftTotal() {
  let total = 0;
  (PP.draft || []).forEach(l => {
    if (l.kind === 'set') { const st = SHOP.sets.find(x => x.set_key === l.set_key); if (st) total += Number(st.price) * l.qty; return; }
    const sku = l.kind === 'product' ? SHOP.skus.find(x => x.id === l.sku_id)
      : SHOP.skus.filter(x => x.product_name === l.product_name).sort((a, b) => a.retail_price_direct - b.retail_price_direct)[0];
    if (sku) total += ppUnitPrice(sku, PP.draft) * l.qty;
  });
  return total;
}

/* ─── Cards ─── */
function ppTierLabel(pattern) { return pattern ? ' (' + pattern.replace(/%/g, '').trim() + ')' : ''; }
function ppTiersHtml(productName, base) {
  const ts = ppTiersFor(productName); if (!ts.length) return '';
  const groups = {}; ts.forEach(t => { (groups[t.variant || ''] = groups[t.variant || ''] || []).push(t); });
  return `<div class="tiers"><div style="font-weight:600;color:var(--lagoon);margin-bottom:2px">Wholesale, per piece</div>` +
    Object.keys(groups).map(k => {
      const g = groups[k].sort((a, b) => a.min_qty - b.min_qty); const lab = ppTierLabel(k || null);
      const parts = [];
      if (g[0].min_qty > 1) parts.push(`${g[0].min_qty - 1 > 1 ? '1–' + (g[0].min_qty - 1) : '1'} pcs ₱${base}`);
      g.forEach((t, i) => {
        const next = g[i + 1]; const range = next ? `${t.min_qty}–${next.min_qty - 1}` : `${t.min_qty}+`;
        parts.push(`${range} pcs <b>${P(t.unit_price)}</b>`);
      });
      return `<div>${lab ? `<span class="muted">${ppEsc(lab.trim())}</span><br>` : ''}${parts.join(' · ')}</div>`;
    }).join('') + `</div>`;
}
function ppSetCard(st) {
  return `<div class="set-card">
    <div><h3>${ppEsc(st.name)}</h3><div class="muted" style="font-size:12px">${st.pcs} pcs total</div></div>
    <ul>${(st.bullets || []).map(b => `<li>${ppEsc(b)}</li>`).join('')}</ul>
    <div class="set-price">${P(st.price)}</div>
    <button class="btn btn-p btn-s" onclick="ppAddSet('${st.set_key}')">Add set to order</button>
  </div>`;
}
function ppProductCard(pr) {
  const prices = pr.skus.map(ppBase);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const photo = pr.skus.map(s => SHOP.vphoto[s.id]).find(Boolean) || SHOP.cover[pr.name];
  const multi = pr.skus.length > 1;
  const act = multi
    ? `<button class="btn btn-p btn-s" onclick="ppOpenPicker('${ppEsc(pr.name).replace(/'/g, "\\'")}')">Choose variants</button>`
    : `<div class="stepper"><button onclick="ppStep(this,-1)">−</button><input type="number" min="1" value="1" inputmode="numeric"><button onclick="ppStep(this,1)">+</button>
        <button class="btn btn-p btn-s" style="flex:1" onclick="ppAddSingle('${pr.skus[0].id}',this)">Add</button></div>`;
  return `<div class="pcard">
    <div class="pimg">${photo ? `<img src="${ppEsc(photo)}" referrerpolicy="no-referrer" alt="">` : '🌿'}</div>
    <div class="pbody">
      <div class="pname">${ppEsc(pr.name)}</div>
      <div class="pprice">${lo === hi ? `<b>${P(lo)}</b>` : `<b>${P(lo)}</b> to <b>${P(hi)}</b>`} each</div>
      ${ppTiersHtml(pr.name, lo)}
      ${multi ? `<div class="pvars">${pr.skus.length} variants</div>` : ''}
      <div style="margin-top:auto;padding-top:6px">${act}</div>
    </div>
  </div>`;
}

/* ─── Adding to the order ─── */
function ppStep(btn, d) {
  const inp = btn.parentElement.querySelector('input');
  inp.value = Math.max(1, (parseInt(inp.value, 10) || 1) + d);
}
function ppAddLine(line) {
  const same = PP.draft.find(l => l.kind === line.kind && l.sku_id === line.sku_id && l.set_key === line.set_key && l.product_name === line.product_name);
  if (same) same.qty += line.qty; else PP.draft.push(line);
  ppSaveDraft();
}
function ppAddSet(key) { ppAddLine({ kind: 'set', set_key: key, qty: 1 }); ppToast('Added to your order'); }
function ppAddSingle(skuId, btn) {
  const q = parseInt(btn.parentElement.querySelector('input').value, 10) || 1;
  ppAddLine({ kind: 'product', sku_id: skuId, qty: q }); ppToast('Added to your order');
}
function ppOpenPicker(name) {
  if (typeof ppShowPicker === 'function') ppShowPicker(name);
  else ppToast('Choosing variants is opening very soon');
}

/* ─── The bar at the bottom: pieces and running total ─── */
function ppRenderBar() {
  const bar = ppEl('pp-bar'); if (!bar) return;
  const n = ppDraftPieces();
  if (!n || PP.tab !== 'order' || !SHOP.loaded) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div class="bar"><div><b>${n}</b> item${n === 1 ? '' : 's'} in your order<br><span style="font-size:12px;opacity:.85">Products total ${P(ppDraftTotal())}, shipping is added at checkout</span></div>
    <button onclick="ppGoCheckout()">Review order</button></div>`;
}
function ppGoCheckout() {
  if (typeof ppShowCheckout === 'function') ppShowCheckout();
  else ppToast('Checkout is opening very soon');
}
