/* ============================================================
   PARTNER PORTAL: INVOICE IMAGE + RECEIPT ANIMATION
   ppViewInvoice(orderId)      shows the invoice as a picture (PNG) with Download and Share buttons
   ppDownloadInvoice(orderId)  saves the PNG straight to the phone or computer
   ppShowReceipt(order)        the "printed receipt" animation shown right after an order is submitted
   The PNG is drawn in the browser (canvas) with the website colors and fonts, so there is nothing to
   install and it works the same on every phone. It always reflects the latest (revised) invoice.
   ============================================================ */
const INV = { logo: null, cache: {} };

const INV_C = { lagoon: '#3E5F5C', lagoonDark: '#2C4542', teal: '#729A94', tealLight: '#A8C5C0', golden: '#D1A679', goldenDark: '#B8905F',
  sand: '#E6D5C3', sandLight: '#F0E8DA', pearl: '#F7F3EC', text: '#1C2E2C', mid: '#4A6862', muted: '#8FA9A4', success: '#2D6A4F' };

function invNum(n) { n = Number(n) || 0; return n.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); }
function invPhp(n) { return 'PHP' + invNum(n); }

async function invLoadLogo() {
  if (INV.logo) return INV.logo;
  return new Promise(res => { const im = new Image(); im.onload = () => { INV.logo = im; res(im); }; im.onerror = () => res(null); im.src = '/partials/invoice-logo.png'; });
}
async function invFonts() {
  try {
    await Promise.all([document.fonts.load('600 100px "Cormorant Garamond"'), document.fonts.load('400 30px "DM Sans"'), document.fonts.load('600 30px "DM Sans"'), document.fonts.load('italic 400 30px "Cormorant Garamond"')]);
  } catch (e) { /* the browser falls back to a serif / sans-serif font */ }
}
function invWrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur); return lines.length ? lines : [''];
}

/* Draws the invoice and returns the canvas */
async function ppInvoiceCanvas(o) {
  await invFonts(); const logo = await invLoadLogo();
  const W = 1080, M = 60, SERIF = '"Cormorant Garamond", Georgia, serif', SANS = '"DM Sans", Arial, sans-serif';
  const scratch = document.createElement('canvas').getContext('2d');
  const items = (o.items || []).map(i => { const l = ppLineLabel(i); return { name: l.n, sub: l.s, qty: i.qty, unit: i.unit_price, total: i.line_total }; });
  // description column width, to wrap long names
  const colQty = 640, colPrice = 760, colTot = 1020 - 34; const descW = colQty - M - 30;
  scratch.font = `500 29px ${SANS}`; const small = `400 21px ${SANS}`;
  const rows = items.map(it => { scratch.font = `500 29px ${SANS}`; const n = invWrap(scratch, it.name, descW); scratch.font = small; const s = it.sub ? invWrap(scratch, it.sub, descW) : []; return { it, n, s, h: Math.max(66, 22 + n.length * 36 + s.length * 28) }; });
  const blank = Math.max(0, 5 - rows.length);
  const paid = Number(o.amount_paid) || 0, balance = Math.max(0, Number(o.total) - paid), showPaid = paid > 0;
  scratch.font = `400 26px ${SANS}`;
  const regionTxt = o.region_label && !String(o.address || '').toLowerCase().includes(String(o.region_label).toLowerCase()) ? o.region_label : '';
  const addrLines = [o.recipient_name, ...invWrap(scratch, o.address, 560), regionTxt, o.contact_number].filter(Boolean);
  const headH = 408 + addrLines.length * 38 + 10;                 // title, date, billed to block
  const tableH = 74 + rows.reduce((n, r) => n + r.h, 0) + blank * 62;
  const totalsH = showPaid ? 250 : 190;
  const noteLines = o.revision_note ? (scratch.font = `italic 400 24px ${SANS}`, invWrap(scratch, 'Note: ' + o.revision_note, 480)) : [];
  const lowerH = Math.max(totalsH, 330, noteLines.length * 34 + 200);
  const footH = 190;
  const H = Math.ceil(Math.max(headH, 440) + tableH + lowerH + footH + 40);

  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);

  // soft page tint behind the lower half, like the printed invoice
  const topH = Math.max(headH, 440);
  x.textBaseline = 'alphabetic';
  // title
  x.fillStyle = INV_C.lagoon; x.font = `600 128px ${SERIF}`; x.fillText('INVOICE', M - 4, 150);
  x.fillStyle = INV_C.text; x.font = `400 30px ${SANS}`;
  const when = new Date(o.created_at || Date.now()).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  x.fillText(when, M, 215);
  x.fillStyle = INV_C.mid; x.font = `500 24px ${SANS}`;
  x.fillText('Invoice no. ' + (o.order_code || '') + ((o.invoice_rev || 1) > 1 ? '  ·  Revised (version ' + o.invoice_rev + ')' : ''), M, 250);
  // billed to
  x.fillStyle = INV_C.text; x.font = `600 28px ${SANS}`; x.fillText('BILLED TO', M, 312);
  x.font = `600 36px ${SANS}`; x.fillText(String(o.business_name || (PP.partner && PP.partner.business_name) || '').toUpperCase(), M, 358);
  x.font = `400 28px ${SANS}`; addrLines.forEach((ln, i) => x.fillText(ln, M, 408 + i * 38));
  // logo box
  const bx = W - M - 330, by = 56;
  x.fillStyle = INV_C.sandLight; x.fillRect(bx, by, 330, 330);
  if (logo) { const lw = 290, lh = lw * logo.height / logo.width; x.drawImage(logo, bx + 20, by + (330 - lh) / 2, lw, lh); }
  else { x.fillStyle = INV_C.teal; x.font = `600 56px ${SANS}`; x.textAlign = 'center'; x.fillText('mikecharlie', bx + 165, by + 180); x.textAlign = 'left'; }

  // table header
  let y = topH;
  x.fillStyle = INV_C.lagoon; x.fillRect(M, y, W - 2 * M, 74);
  x.fillStyle = '#FFFFFF'; x.font = `500 28px ${SANS}`;
  x.fillText('DESCRIPTION', M + 34, y + 48); x.fillText('QTY', colQty, y + 48); x.fillText('PRICE', colPrice, y + 48);
  x.textAlign = 'right'; x.fillText('TOTAL', colTot, y + 48); x.textAlign = 'left';
  y += 74;
  // rows
  rows.forEach(r => {
    x.fillStyle = INV_C.pearl; x.fillRect(M, y, W - 2 * M, r.h);
    x.fillStyle = INV_C.text; x.font = `500 29px ${SANS}`;
    r.n.forEach((ln, i) => x.fillText(ln, M + 34, y + 42 + i * 36));
    x.fillStyle = INV_C.mid; x.font = small;
    r.s.forEach((ln, i) => x.fillText(ln, M + 34, y + 42 + (r.n.length - 1) * 36 + 30 + i * 28));
    x.fillStyle = INV_C.text; x.font = `400 29px ${SANS}`;
    x.fillText(String(r.it.qty), colQty, y + 42); x.fillText(invNum(r.it.unit), colPrice, y + 42);
    x.textAlign = 'right'; x.fillText(invNum(r.it.total), colTot, y + 42); x.textAlign = 'left';
    x.fillStyle = INV_C.teal; x.fillRect(M, y + r.h - 2, W - 2 * M, 2);
    y += r.h;
  });
  for (let i = 0; i < blank; i++) { x.fillStyle = INV_C.pearl; x.fillRect(M, y, W - 2 * M, 62); x.fillStyle = INV_C.teal; x.fillRect(M, y + 60, W - 2 * M, 2); y += 62; }

  // lower area
  x.fillStyle = INV_C.pearl; x.fillRect(M, y, W - 2 * M, lowerH);
  // totals box
  const tw = 430, tx = W - M - tw, ty = y + 40;
  x.fillStyle = INV_C.lagoon; x.fillRect(tx, ty, tw, totalsH);
  const line = (label, val, yy, big, color) => {
    x.fillStyle = color || '#FFFFFF'; x.font = `${big ? 600 : 400} ${big ? 34 : 28}px ${SANS}`; x.fillText(label, tx + 30, yy);
    x.textAlign = 'right'; x.fillText(val, tx + tw - 30, yy); x.textAlign = 'left';
  };
  line('SUBTOTAL', invPhp(o.subtotal), ty + 56); line('SHIPPING', invPhp(o.shipping_fee), ty + 108);
  x.fillStyle = INV_C.teal; x.fillRect(tx + 30, ty + 128, tw - 60, 2);
  line('TOTAL', invPhp(o.total), ty + 176, true, '#FFFFFF');
  if (showPaid) { line('PAID', invPhp(paid), ty + 216, false, INV_C.tealLight); line(balance > 0 ? 'BALANCE DUE' : 'BALANCE', invPhp(balance), ty + 252 - 0, true, INV_C.golden); }
  // payment options (left)
  let py = y + 60;
  x.fillStyle = INV_C.text; x.font = `600 30px ${SANS}`; x.fillText('Payment Options Available:', M + 34, py);
  x.font = `400 28px ${SANS}`;
  const opts = [['Maribank', 'GCash'], ['GoTyme', 'BDO'], ['CIMB', 'BPI']];
  opts.forEach((p, i) => { x.fillText(p[0], M + 34, py + 48 + i * 40); x.fillText(p[1], M + 34 + 170, py + 48 + i * 40); });
  // thank you / revision note
  let ny = y + 40 + totalsH + 50;
  x.fillStyle = INV_C.mid; x.font = `italic 500 40px ${SERIF}`; x.fillText('Thank you very much!', M + 34, Math.max(py + 190, ny - 10) - 0 > y + lowerH - 40 ? y + lowerH - 40 : Math.max(py + 190, ny - 10));
  if (noteLines.length) { x.fillStyle = INV_C.goldenDark; x.font = `italic 400 24px ${SANS}`; noteLines.forEach((ln, i) => x.fillText(ln, M + 34, y + lowerH - 40 - 50 + i * 34 - (noteLines.length - 1) * 34)); }
  // PAID stamp
  if (o.pay_status === 'paid') {
    x.save(); x.translate(M + 330, y + 40 + totalsH - 30); x.rotate(-0.2); x.strokeStyle = INV_C.success; x.fillStyle = INV_C.success; x.lineWidth = 6;
    x.strokeRect(-100, -44, 200, 88); x.font = `700 56px ${SANS}`; x.textAlign = 'center'; x.fillText('PAID', 0, 20); x.restore();
  }
  y += lowerH;

  // footer band
  x.fillStyle = INV_C.teal; x.fillRect(M, y, W - 2 * M, footH);
  x.fillStyle = '#FFFFFF'; x.font = `400 27px ${SANS}`;
  const sp = (t, xx, yy, right) => { x.letterSpacing = '4px'; if (right) { x.textAlign = 'right'; x.fillText(t, xx, yy); x.textAlign = 'left'; } else x.fillText(t, xx, yy); x.letterSpacing = '0px'; };
  sp('MIKE CHARLIE CO.', M + 40, y + 70); sp('AREVALO, ILOILO CITY', M + 40, y + 112); sp('PHILIPPINES 5000', M + 40, y + 154);
  x.font = `400 25px ${SANS}`;
  sp('WHATSAPP | VIBER | SMS', W - M - 40, y + 64, true); sp('+63 976 046 7782', W - M - 40, y + 102, true);
  sp('slow@mikecharlieco.com', W - M - 40, y + 140, true); sp('www.mikecharlieco.com', W - M - 40, y + 176, true);
  return c;
}

/* ─── Getting the order and the picture ─── */
async function invGetOrder(id) {
  // always ask the server first, so the invoice shows the latest paid amount and any added charges
  let o = null;
  try { const r = await ppRest(`mcc_partner_orders?id=eq.${encodeURIComponent(id)}&select=*`); o = r && r[0]; } catch (e) { /* fall back to what we already have */ }
  if (!o) o = (typeof PAY !== 'undefined' ? PAY.orders : []).find(x => x.id === id);
  if (!o && typeof PP !== 'undefined' && PP.lastOrder && PP.lastOrder.id === id) o = PP.lastOrder;
  return o;
}
function invBlob(canvas) { return new Promise(res => canvas.toBlob(b => res(b), 'image/png')); }
async function invRender(id) {
  const o = await invGetOrder(id); if (!o) throw new Error('Order not found');
  const key = id + ':' + o.invoice_rev + ':' + o.total + ':' + o.amount_paid + ':' + o.pay_status;
  if (INV.cache[key]) return INV.cache[key];
  const canvas = await ppInvoiceCanvas(o), blob = await invBlob(canvas);
  return (INV.cache[key] = { o, blob, url: URL.createObjectURL(blob), name: 'MikeCharlie-Invoice-' + (o.order_code || 'order') + (o.invoice_rev > 1 ? '-rev' + o.invoice_rev : '') + '.png' });
}
function invSave(inv) {
  const a = document.createElement('a'); a.href = inv.url; a.download = inv.name; document.body.appendChild(a); a.click(); a.remove();
}
async function ppDownloadInvoice(id) {
  try { ppToast('Preparing your invoice...'); invSave(await invRender(id)); } catch (e) { ppToast('Sorry, we could not make the invoice. Please try again.'); }
}
async function invShare(id) {
  try {
    const inv = await invRender(id), file = new File([inv.blob], inv.name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Mike Charlie Co. invoice' });
    else invSave(inv);
  } catch (e) { /* the person closed the share sheet */ }
}

/* ─── The viewer ─── */
function invOverlay(html) {
  let ov = ppEl('inv-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'inv-overlay'; ov.className = 'inv-overlay'; ov.onclick = e => { if (e.target === ov) invClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = html; ov.classList.add('show'); document.body.style.overflow = 'hidden'; return ov;
}
function invClose() { const ov = ppEl('inv-overlay'); if (ov) { ov.classList.remove('show'); ov.innerHTML = ''; } document.body.style.overflow = ''; }
async function ppViewInvoice(id) {
  invOverlay(`<div class="inv-sheet"><button class="pk-x" onclick="invClose()" aria-label="Close">✕</button><div class="spin" style="margin:3rem auto"></div><p class="muted center" style="font-size:13px">Preparing your invoice...</p></div>`);
  try {
    const inv = await invRender(id);
    invOverlay(`<div class="inv-sheet"><button class="pk-x" onclick="invClose()" aria-label="Close">✕</button>
      <h2 style="font-size:1.3rem;margin-bottom:10px;padding-right:34px">Invoice ${ppEsc(inv.o.order_code)}</h2>
      <img class="inv-img" src="${inv.url}" alt="Invoice ${ppEsc(inv.o.order_code)}">
      <div class="inv-btns"><button class="btn btn-p" onclick="invSave(INV.cache[Object.keys(INV.cache).find(k => k.indexOf('${inv.o.id}:') === 0)])">⬇ Download invoice (PNG)</button>
        ${navigator.canShare ? `<button class="btn btn-o" onclick="invShare('${inv.o.id}')">Share or save to phone</button>` : ''}
        <button class="btn btn-o" onclick="invClose()">Close</button></div>
      <p class="muted center" style="font-size:12px;margin-top:8px">On a phone you can also press and hold the picture to save it.</p></div>`);
  } catch (e) {
    console.error('invoice', e);
    invOverlay(`<div class="inv-sheet"><button class="pk-x" onclick="invClose()" aria-label="Close">✕</button><h2>We could not open the invoice</h2>
      <p class="muted" style="font-size:13px;margin:8px 0 14px">Please check your connection and try again.</p><button class="btn btn-p" onclick="ppViewInvoice('${id}')">Try again</button></div>`);
  }
}

/* ─── The printed-receipt animation ─── */
function ppShowReceipt(o) {
  const items = (o.items || []);
  const show = items.slice(0, 7), more = items.length - show.length;
  const when = new Date(o.created_at || Date.now()).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const money = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parts = [
    `<div class="rc-logo"><img src="/partials/invoice-logo.png" alt="mikecharlie"></div>`,
    `<div class="rc-c rc-b">ORDER RECEIVED</div>`,
    `<div class="rc-c rc-s">${ppEsc(when)}</div>`,
    `<div class="rc-c rc-b">${ppEsc(o.order_code || '')}</div>`,
    `<div class="rc-dash"></div>`,
    ...show.map(i => { const l = ppLineLabel(i); return `<div class="rc-it"><span>${ppEsc(l.n)}${l.s ? '<em>' + ppEsc(l.s.length > 38 ? l.s.slice(0, 36) + '…' : l.s) + '</em>' : ''}</span></div><div class="rc-row rc-s"><span>${i.qty} x ${money(i.unit_price)}</span><span>${money(i.line_total)}</span></div>`; }),
    more > 0 ? `<div class="rc-c rc-s">+ ${more} more item${more === 1 ? '' : 's'}</div>` : '',
    `<div class="rc-dash"></div>`,
    `<div class="rc-row"><span>Products</span><span>${money(o.subtotal)}</span></div>`,
    `<div class="rc-row"><span>Shipping</span><span>${o.courier === 'lbc' ? 'to follow' : money(o.shipping_fee)}</span></div>`,
    `<div class="rc-row rc-big"><span>TOTAL</span><span>PHP ${money(o.total)}</span></div>`,
    `<div class="rc-dash"></div>`,
    `<div class="rc-c">Thank you, ${ppEsc((PP.partner && PP.partner.business_name) || 'partner')}!</div>`,
    `<div class="rc-c rc-s">We will check your order and payment, then start preparing it.</div>`,
    `<div class="rc-bars"></div>`
  ].filter(Boolean);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  invOverlay(`<div class="rc-wrap"><div class="rc-printer"><div class="rc-slot"></div></div>
    <div class="rc-feed"><div class="rc-paper" id="rc-paper"></div></div>
    <div class="rc-actions" id="rc-actions" style="opacity:0"><button class="btn btn-p" onclick="invClose();ppViewInvoice('${o.id}')">View invoice</button>
      <button class="btn btn-o" style="background:white" onclick="invClose()">Close</button></div></div>`);
  const paper = ppEl('rc-paper'), acts = ppEl('rc-actions');
  const done = () => { paper.classList.add('rc-torn'); acts.style.transition = 'opacity .5s'; acts.style.opacity = '1'; };
  if (reduce) { paper.innerHTML = parts.join(''); done(); return; }
  paper.classList.add('rc-printing');
  let i = 0;
  const next = () => {
    if (!ppEl('rc-paper')) return;          // closed early
    if (i >= parts.length) { paper.classList.remove('rc-printing'); setTimeout(done, 250); return; }
    const d = document.createElement('div'); d.className = 'rc-line'; d.innerHTML = parts[i++]; paper.appendChild(d);
    setTimeout(next, parts[i - 1].indexOf('rc-logo') >= 0 ? 500 : 190);
  };
  setTimeout(next, 350);
}
