/* ============================================================
   PARTNER PORTAL: DASHBOARD SHELL
   Shows the welcome line, the tabs and the saved order draft.
   Each tab lives in its own file in this folder:
     shop-tab.js  (New Order)   picker.js (variant picker)   ... more are added one by one.
   A tab file defines a function named in TABS[].fn below. If the file is not there yet,
   the tab shows a friendly "opening soon" card instead.
   ============================================================ */
const TABS = [
  { id: 'home',    label: 'Home',           fn: 'ppRenderHome' },
  { id: 'order',   label: 'New Order',      fn: 'ppRenderShop' },
  { id: 'payment', label: 'Payment',        fn: 'ppRenderPayment' },
  { id: 'track',   label: 'Track my Order', fn: 'ppRenderTrack' },
  { id: 'history', label: 'History',        fn: 'ppRenderHistory' }
];

/* ─── The order the partner is building (kept on this device, per login) ─── */
function ppDraftKey() { return 'mcc_partner_draft_' + (PP.session ? PP.session.user.id : 'x'); }
function ppLoadDraft() {
  try { PP.draft = JSON.parse(localStorage.getItem(ppDraftKey()) || '[]'); } catch (e) { PP.draft = []; }
  if (!Array.isArray(PP.draft)) PP.draft = [];
}
function ppSaveDraft() {
  try { localStorage.setItem(ppDraftKey(), JSON.stringify(PP.draft)); } catch (e) {}
  if (typeof ppRenderBar === 'function') ppRenderBar();
}
function ppDraftPieces() { return (PP.draft || []).reduce((s, l) => s + (l.qty || 0), 0); }

/* ─── Screen 3: the dashboard ─── */
function renderPortal(p) {
  if (!p.is_active) {
    ppEl('portal').innerHTML = `<div class="wrap"><div class="card center"><h2>Your account is paused</h2>
      <p class="muted" style="font-size:13px;line-height:1.6;margin-bottom:14px">Please message us and we will sort it out together.</p>
      <a class="btn btn-p" href="https://wa.me/message/T7LXVS3L74A5C1" target="_blank" style="text-decoration:none">Message us on WhatsApp</a></div></div>`;
    return;
  }
  ppLoadDraft();
  ppEl('pp-hero').style.display = 'none'; ppEl('pp-wrap').classList.add('wide');
  const kinds = [p.is_hotel ? 'Hotel' : '', p.is_retail ? 'Retail' : ''].filter(Boolean);
  ppEl('portal').innerHTML = `<div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:1rem">
      <div>
        <h1 style="text-align:left;font-size:1.7rem;margin-bottom:6px">${ppEsc(p.business_name)}</h1>
        <div>${kinds.map(k => `<span class="badge">${k} Partner</span>`).join('')}</div>
      </div>
      <button class="btn btn-o" style="width:auto;padding:9px 16px" onclick="doLogout()">Log Out</button>
    </div>
    <div class="tabs" id="pp-tabs">${TABS.map(t => `<button class="tab" id="tab-${t.id}" onclick="ppShowTab('${t.id}')">${t.label}</button>`).join('')}</div>
    <div id="tab-body"></div>
    <div id="pp-bar"></div>
  </div>`;
  ppShowTab(PP.tab || 'order');
}

function ppShowTab(id) {
  PP.tab = id;
  TABS.forEach(t => { const b = ppEl('tab-' + t.id); if (b) b.classList.toggle('on', t.id === id); });
  const t = TABS.find(x => x.id === id);
  const body = ppEl('tab-body'); if (!t || !body) return;
  const fn = window[t.fn];
  if (typeof fn === 'function') { body.innerHTML = '<div class="spin"></div>'; fn(body); }
  else body.innerHTML = `<div class="card center"><h2>${t.label}</h2>
    <p class="muted" style="font-size:13px;line-height:1.65">This part is opening very soon. Until then, message us any time and we will take care of it directly.</p></div>`;
  if (typeof ppRenderBar === 'function') ppRenderBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
