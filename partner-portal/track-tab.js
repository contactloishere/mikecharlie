/* ============================================================
   PARTNER PORTAL: TRACK MY ORDER TAB
   Orders that are not delivered yet: progress steps, tracking number, invoice,
   and a "Request a change" button that messages Mike Charlie Co.
   Also holds the helpers History uses (steps, tracking box, change request).
   ============================================================ */
const PSTAGES = [
  { id: 'placed',    label: 'Order placed' },
  { id: 'paid',      label: 'Payment confirmed' },
  { id: 'preparing', label: 'Preparing your order' },
  { id: 'packed',    label: 'Packed' },
  { id: 'shipped',   label: 'Shipped Out Order' }
];

function trkStepsHtml(o) {
  const last = PSTAGES.length - 1;
  const stage = o.current_stage === 'delivered' ? 'shipped' : o.current_stage;
  const cur = Math.max(0, PSTAGES.findIndex(s => s.id === stage));
  const dates = o.stage_dates || {};
  const pct = Math.round(cur / last * 100);
  const bar = `<div class="pbar-wrap"><div class="pbar-top"><span>${cur === last ? 'On its way to you 🎉' : PSTAGES[cur].label}</span><b>${pct}%</b></div>
    <div class="pbar"><div class="pbar-fill" style="width:${pct}%"></div></div></div>`;
  return bar + `<div class="steps">${PSTAGES.map((s, i) => `<div class="step ${i < cur || (i === cur && cur === last) ? 'done' : i === cur ? 'now' : ''}"><i>${i <= cur ? '✓' : ''}</i><span class="sl">${s.label}${dates[s.id] && i <= cur ? `<small>${payDate(dates[s.id])}</small>` : ''}</span></div>`).join('')}</div>`;
}
function trkBoxHtml(o) {
  const t = o.tracking; if (!t || !(t.number || t.link)) return '';
  const type = t.type || o.courier, courier = (COURIER_TRACK[type] || {}).name || 'the courier';
  const url = courierTrackUrl(type, t.link);
  return `<div class="trk">Your package is on its way with ${courier}.${t.number ? `<br>Tracking number: <b>${ppEsc(t.number)}</b> <button type="button" class="copy-btn" onclick="trkCopy(this,'${ppEsc(t.number)}')">Copy</button>` : ''}${url ? `<br><a class="trk-btn" href="${ppEsc(url)}" target="_blank" rel="noopener">Track my package →</a>` : ''}${url && t.number && COURIER_TRACK[type] && COURIER_TRACK[type].fixed ? `<br><small>Type your tracking number on the ${courier} page.</small>` : ''}</div>`;
}
function trkCopy(btn, text) {
  const done = () => { const o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = o; }, 1600); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {}); else done();
}
function trkChangeHtml(o) {
  if (o.is_cancelled || ['shipped', 'delivered'].includes(o.current_stage)) return '';
  return `<div id="chg-${o.id}" style="margin-top:12px">
    <button class="btn btn-o btn-s" style="width:auto;padding:9px 16px" onclick="trkOpenChange('${o.id}')">Request a change</button></div>`;
}
function trkCloseChange(oid) {
  ppEl('chg-' + oid).innerHTML = `<button class="btn btn-o btn-s" style="width:auto;padding:9px 16px" onclick="trkOpenChange('${oid}')">Request a change</button>`;
}
function trkOpenChange(oid) {
  ppEl('chg-' + oid).innerHTML = `<label class="lbl">What would you like to change?</label>
    <textarea class="inp" id="chgm-${oid}" rows="3" placeholder="More pieces, different variants, a new address, anything. We will update your invoice if needed."></textarea>
    <div id="chge-${oid}" class="auth-err"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-p btn-s" id="chgb-${oid}" onclick="trkSendChange('${oid}')">Send to Mike Charlie Co.</button>
    <button class="btn btn-o btn-s" onclick="trkCloseChange('${oid}')">Cancel</button></div>`;
}
async function trkSendChange(oid) {
  const msg = (ppEl('chgm-' + oid).value || '').trim(), err = ppEl('chge-' + oid), btn = ppEl('chgb-' + oid);
  err.style.display = 'none';
  if (!msg) { err.textContent = 'Please tell us what you would like to change.'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/mcc_partner_request_change`, { method: 'POST', headers: ppHeaders(true), body: JSON.stringify({ p_order_id: oid, p_message: msg }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'We could not send your request.'); }
    ppEl('chg-' + oid).innerHTML = `<div class="auth-ok" style="padding:12px"><p>Sent. We will get back to you soon and send a revised invoice if the price changes.</p></div>`;
  } catch (e) { btn.disabled = false; btn.textContent = 'Send to Mike Charlie Co.'; err.textContent = e.message; err.style.display = 'block'; }
}

function trkOrderCard(o) {
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><span class="badge" style="margin:0">${ppEsc(o.order_code)}</span><div class="muted" style="font-size:12px;margin-top:4px">Placed ${payDate(o.created_at)} · ${P(o.total)}</div></div>
      <div style="text-align:right;font-size:13px">${o.pay_status === 'paid' ? '<span style="color:var(--success);font-weight:600">Paid ✓</span>'
        : `<a href="#" onclick="ppShowTab('payment');return false" style="color:var(--lagoon);font-weight:600">${payStatusLabel(o)} →</a>`}</div>
    </div>
    ${trkStepsHtml(o)}${trkBoxHtml(o)}
    ${!o.variants_assigned && o.pay_status === 'paid' ? '<p class="hint" style="margin:10px 0 0">We are choosing the variants for your assorted items.</p>' : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0"><button class="btn btn-o btn-s" style="width:auto;padding:8px 14px" onclick="ppViewInvoice('${o.id}')">📄 View invoice</button><button class="btn btn-o btn-s" style="width:auto;padding:8px 14px" onclick="ppDownloadInvoice('${o.id}')">⬇ Download</button></div>
    ${o.notes ? `<p class="hint" style="margin:8px 0 0">Your note: ${ppEsc(o.notes)}</p>` : ''}
    ${trkChangeHtml(o)}
  </div>`;
}

/* Live updates: every 20 seconds (and when the partner comes back to the page) the Track tab checks for changes
   such as a new stage or edited tracking, and redraws. It waits if the partner is typing a change request. */
let TRK_LIVE = { timer: null, sig: '' };
const trkSig = () => JSON.stringify((PAY.orders || []).map(o => [o.id, o.current_stage, o.tracking, o.is_cancelled, o.stage_dates]));
async function trkLiveCheck() {
  if (PP.tab !== 'track' || document.hidden || !ppEl('tab-body')) return;
  const typing = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) || [...document.querySelectorAll('textarea')].some(t => t.value);
  if (typing) return;
  try { await ppLoadPartnerData(false); } catch (e) { return; }
  if (trkSig() !== TRK_LIVE.sig) ppRenderTrack(ppEl('tab-body'));
}
function trkStartLive() {
  if (TRK_LIVE.timer) return;
  TRK_LIVE.timer = setInterval(trkLiveCheck, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) trkLiveCheck(); });
}

async function ppRenderTrack(body) {
  try { await ppLoadPartnerData(false); } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your orders</h2><button class="btn btn-p" style="max-width:260px;margin:12px auto 0" onclick="ppShowTab('track')">Try again</button></div>`; return;
  }
  TRK_LIVE.sig = trkSig(); trkStartLive();
  const active = PAY.orders.filter(o => o.current_stage !== 'delivered');
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">Track my order</h2>
    <p class="sec-sub">Where your orders are right now.</p>` +
    (active.length ? active.map(trkOrderCard).join('') :
      `<div class="card center"><h2>No orders on the way</h2><p class="muted" style="font-size:13px;margin-bottom:14px">Your delivered orders are in History.</p>
       <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('order')">Start a new order</button></div>`);
}
