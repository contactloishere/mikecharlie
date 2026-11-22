/* ============================================================
   PARTNER PORTAL: SIGN UP, LOG IN AND FIRST-TIME SETUP
   Lives next to partner-portal/index.html. Needs /partials/shared.js
   (login session, Google button, header) and SB_URL / SB_KEY from the page.

   The flow:
   1. Not logged in      -> Sign Up / Log In card (Google or email)
   2. Logged in, but no partner record yet (Google sign-ups, or a shop
      member who wants to partner) -> short "Finish setting up" form
   3. Logged in, partner record found -> the partner's dashboard
      (the dashboard tabs come in their own files, one per tab)

   Telegram alerts are sent by the database when a partner record is created,
   so nothing about Telegram lives in this file.
   ============================================================ */

const PP = { mode: 'signup', session: null, partner: null };
const ppEl = id => document.getElementById(id);
const ppEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ppToast(msg, ms = 3500) {
  const t = ppEl('toast'); if (!t) return;
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._t); t._t = setTimeout(() => { t.style.display = 'none'; }, ms);
}

/* ─── START: decide which screen to show ─── */
async function initPortal() {
  ppEl('portal').innerHTML = '<div class="spin"></div>';
  ppEl('pp-hero').style.display = ''; ppEl('pp-wrap').classList.remove('wide');
  if (new URLSearchParams(location.search).get('viewas')) { await ppStartViewAs(new URLSearchParams(location.search).get('viewas')); return; }
  PP.session = await getFreshSession();
  if (!PP.session) { renderLoggedOut(); return; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partners?id=eq.${PP.session.user.id}&select=*`, { headers: ppHeaders() });
    if (r.status === 401) { clearSession(); renderHeaderAuth(); renderLoggedOut(); return; }
    if (!r.ok) throw new Error('load failed');
    const rows = await r.json();
    PP.partner = rows[0] || null;
  } catch (e) {
    ppEl('portal').innerHTML = `<div class="card center"><h2>We could not load your account</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again.</p>
      <button class="btn btn-p" onclick="initPortal()">Try again</button></div>`;
    return;
  }
  if (PP.partner) renderPortal(PP.partner); else renderSetup();
}
function ppHeaders(json) {
  const h = { apikey: SB_KEY, Authorization: 'Bearer ' + PP.session.access_token };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/* ─── OWNER VIEW: "View as this partner" (opened from the admin Partner Clients tab) ───
   Uses the admin login already saved in this browser. Read only: every save or send to the
   database is blocked, so nothing can be changed or ordered by accident. ─── */
async function ppStartViewAs(partnerId) {
  const msg = (t) => { ppEl('portal').innerHTML = `<div class="card center"><h2>Owner view</h2><p class="muted" style="font-size:13px;line-height:1.6">${t}</p></div>`; };
  let adm = null;
  try { adm = JSON.parse(localStorage.getItem('mcc_admin_session') || 'null'); } catch (e) {}
  if (!adm || !adm.access_token || Date.now() > adm.expires_at - 30000) {
    msg('Please open your <a href="/admin">admin dashboard</a> first (log in there), then use the "View as partner" button again.'); return;
  }
  PP.viewAs = true;
  PP.session = { access_token: adm.access_token, user: { id: partnerId } };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partners?id=eq.${encodeURIComponent(partnerId)}&select=*`, { headers: ppHeaders() });
    if (!r.ok) throw new Error('x');
    PP.partner = (await r.json())[0];
  } catch (e) { msg('We could not load that partner. Please try again from the admin dashboard.'); return; }
  if (!PP.partner) { msg('That partner was not found.'); return; }
  // Block every write while viewing
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const m = ((opts && opts.method) || 'GET').toUpperCase();
    if (m !== 'GET' && String(url).indexOf(SB_URL) === 0) {
      ppToast('View only: nothing is saved in owner view.');
      return Promise.resolve(new Response(JSON.stringify({ message: 'View only: nothing is saved in owner view.' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(url, opts);
  };
  renderPortal(PP.partner);
}

/* ─── SCREEN 1: SIGN UP / LOG IN ─── */
function typePickerHtml() {
  return `<label class="lbl">We are a <span class="req">*</span> <span class="muted" style="font-weight:400">(tick all that apply)</span></label>
    <div class="types">
      <label class="type-card" id="tc-hotel"><input type="checkbox" id="pp-hotel" onchange="ppToggleType(this)"> Hotel or stay</label>
      <label class="type-card" id="tc-retail"><input type="checkbox" id="pp-retail" onchange="ppToggleType(this)"> Retail store</label>
    </div>`;
}
function ppToggleType(cb) {
  const card = cb.closest('.type-card'); if (card) card.classList.toggle('on', cb.checked);
}
function ppReadTypes() {
  const types = [];
  if (ppEl('pp-hotel') && ppEl('pp-hotel').checked) types.push('hotel');
  if (ppEl('pp-retail') && ppEl('pp-retail').checked) types.push('retail');
  return types;
}
function ppShowErr(msg) {
  const b = ppEl('pp-err'); if (!b) return;
  b.textContent = msg; b.style.display = 'block';
  b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function ppClearErr() { const b = ppEl('pp-err'); if (b) b.style.display = 'none'; }

function renderLoggedOut() {
  const signup = PP.mode === 'signup';
  ppEl('portal').innerHTML = `<div class="card">
    <div class="auth-tabs">
      <button class="auth-tab ${signup ? 'on' : ''}" onclick="setPortalMode('signup')">Sign Up</button>
      <button class="auth-tab ${signup ? '' : 'on'}" onclick="setPortalMode('login')">Log In</button>
    </div>
    <div class="auth-err" id="pp-err"></div>
    ${googleButtonHtml()}
    ${signup ? '<p class="hint" style="margin:8px 0 0;text-align:center">With Google, you add your business details on the next step.</p>' : ''}
    <div class="divider">or use email</div>
    ${signup ? `
      <label class="lbl">Business name <span class="req">*</span></label>
      <input class="inp" id="pp-biz" placeholder="e.g. Sunset Cottages" autocomplete="organization">
      <label class="lbl">Your name <span class="req">*</span></label>
      <input class="inp" id="pp-name" placeholder="Full name" autocomplete="name">
      <label class="lbl">Contact number <span class="req">*</span></label>
      <input class="inp" id="pp-phone" type="tel" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" placeholder="09XXXXXXXXX (11 digits)" autocomplete="tel" oninput="this.value=this.value.replace(/\D/g,'').slice(0,11)">
      ${typePickerHtml()}` : ''}
    <label class="lbl">Email <span class="req">*</span></label>
    <input class="inp" type="email" id="pp-email" placeholder="you@email.com" autocomplete="email">
    <label class="lbl">Password <span class="req">*</span></label>
    <input class="inp" type="password" id="pp-pw" placeholder="${signup ? 'Create a password' : '••••••••'}" autocomplete="${signup ? 'new-password' : 'current-password'}" style="margin-bottom:${signup ? '6px' : '14px'}">
    ${signup ? '<p class="hint">Use at least 8 characters.</p>' : ''}
    <button class="btn btn-p" id="pp-submit" onclick="${signup ? 'submitPartnerSignup()' : 'submitPartnerLogin()'}">${signup ? 'Create Partner Account' : 'Log In'}</button>
  </div>
  <p class="center muted" style="font-size:12.5px;line-height:1.6">Questions before you sign up? Message us on
    <a href="https://wa.me/message/T7LXVS3L74A5C1" target="_blank" style="color:var(--lagoon);font-weight:600">WhatsApp</a> or
    <a href="https://m.me/mikecharlieco" target="_blank" style="color:var(--lagoon);font-weight:600">Messenger</a>.
    Want to see what we offer first? <a href="/hotel-partner-program" style="color:var(--lagoon);font-weight:600">Read the partner program</a>.</p>`;
}
function setPortalMode(m) { PP.mode = m; renderLoggedOut(); }

async function submitPartnerSignup() {
  ppClearErr();
  const biz = ppEl('pp-biz').value.trim(), name = ppEl('pp-name').value.trim();
  const phone = ppEl('pp-phone').value.trim();
  const email = ppEl('pp-email').value.trim(), pw = ppEl('pp-pw').value;
  const types = ppReadTypes();
  if (!biz) return ppShowErr('Please enter your business name.');
  if (!name) return ppShowErr('Please enter your name.');
  if (!/^\d{11}$/.test(phone)) return ppShowErr('Please enter your 11-digit contact number, numbers only (for example 09171234567).');
  if (!types.length) return ppShowErr('Please tick Hotel or stay, Retail store, or both.');
  if (!email) return ppShowErr('Please enter your email.');
  if (pw.length < 8) return ppShowErr('Your password needs at least 8 characters.');
  const btn = ppEl('pp-submit'); const orig = btn.textContent; btn.textContent = 'Please wait...'; btn.disabled = true;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, data: {
        account_type: 'partner', business_name: biz, full_name: name, contact_number: phone, partner_types: types
      } })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(ppFriendlyAuthError(data));
    // Supabase answers "ok" for an email that already has an account but shows no sign-in details
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      PP.mode = 'login'; renderLoggedOut();
      ppEl('pp-email').value = email;
      ppShowErr('That email already has an account. Please log in instead.');
      return;
    }
    if (data.access_token) {           // email confirmation is off: they are in right away
      saveSession(data); renderHeaderAuth(); await initPortal(); return;
    }
    ppEl('portal').innerHTML = `<div class="card"><div class="auth-ok"><h3>Almost there! 🌿</h3>
      <p>We sent a confirmation link to <strong>${ppEsc(email)}</strong>. Open it, then come back here and log in.</p></div>
      <button class="btn btn-o" style="margin-top:14px" onclick="setPortalMode('login')">Go to Log In</button></div>`;
  } catch (e) {
    ppShowErr(e.message);
  } finally {
    // The screen may have switched to Log In above, so label the button for whichever screen is showing now
    const b = ppEl('pp-submit');
    if (b) { b.textContent = PP.mode === 'signup' ? 'Create Partner Account' : 'Log In'; b.disabled = false; }
  }
}

async function submitPartnerLogin() {
  ppClearErr();
  const email = ppEl('pp-email').value.trim(), pw = ppEl('pp-pw').value;
  if (!email || !pw) return ppShowErr('Enter your email and password.');
  const btn = ppEl('pp-submit'); const orig = btn.textContent; btn.textContent = 'Please wait...'; btn.disabled = true;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(ppFriendlyAuthError(data));
    saveSession(data); renderHeaderAuth();
    await initPortal();
  } catch (e) {
    ppShowErr(e.message);
    const b = ppEl('pp-submit'); if (b) { b.textContent = orig; b.disabled = false; }
  }
}
function ppFriendlyAuthError(d) {
  const m = String((d && (d.error_description || d.msg || d.message)) || '');
  if (/invalid login/i.test(m)) return 'That email and password do not match. Please try again.';
  if (/not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for our link.';
  if (/at least|weak|short/i.test(m)) return 'Please choose a longer password (at least 8 characters).';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a few minutes and try again.';
  return m || 'Something went wrong. Please try again.';
}

/* ─── SCREEN 2: FINISH SETTING UP (Google sign-ups, or a shop member becoming a partner) ─── */
function renderSetup() {
  const meta = (PP.session.user && PP.session.user.user_metadata) || {};
  const guess = meta.full_name || meta.name || '';
  ppEl('portal').innerHTML = `<div class="card">
    <h2>Finish setting up your partner account</h2>
    <p class="muted" style="font-size:13px;line-height:1.6;margin-bottom:1rem">Signed in as <strong>${ppEsc(PP.session.user.email)}</strong>. Just a few details about your business.</p>
    <div class="auth-err" id="pp-err"></div>
    <label class="lbl">Business name <span class="req">*</span></label>
    <input class="inp" id="pp-biz" placeholder="e.g. Sunset Cottages" autocomplete="organization">
    <label class="lbl">Your name <span class="req">*</span></label>
    <input class="inp" id="pp-name" value="${ppEsc(guess)}" placeholder="Full name" autocomplete="name">
    <label class="lbl">Contact number <span class="req">*</span></label>
    <input class="inp" id="pp-phone" type="tel" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" placeholder="09XXXXXXXXX (11 digits)" autocomplete="tel" oninput="this.value=this.value.replace(/\D/g,'').slice(0,11)">
    ${typePickerHtml()}
    <button class="btn btn-p" id="pp-submit" onclick="submitPartnerSetup()">Finish Setup</button>
  </div>
  <p class="center" style="font-size:12.5px"><button onclick="doLogout()" style="background:none;border:none;color:var(--text-mid);text-decoration:underline;font-size:12.5px">Log out</button></p>`;
}
async function submitPartnerSetup() {
  ppClearErr();
  const biz = ppEl('pp-biz').value.trim(), name = ppEl('pp-name').value.trim(), phone = ppEl('pp-phone').value.trim();
  const types = ppReadTypes();
  if (!biz) return ppShowErr('Please enter your business name.');
  if (!name) return ppShowErr('Please enter your name.');
  if (!/^\d{11}$/.test(phone)) return ppShowErr('Please enter your 11-digit contact number, numbers only (for example 09171234567).');
  if (!types.length) return ppShowErr('Please tick Hotel or stay, Retail store, or both.');
  const btn = ppEl('pp-submit'); btn.textContent = 'Saving...'; btn.disabled = true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partners`, {
      method: 'POST',
      headers: { ...ppHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify({
        id: PP.session.user.id, business_name: biz, contact_name: name,
        contact_number: phone || null, is_hotel: types.includes('hotel'), is_retail: types.includes('retail')
      })
    });
    if (r.status === 409) { await initPortal(); return; }   // already set up (for example in another tab)
    if (!r.ok) throw new Error('We could not save your details. Please try again.');
    const rows = await r.json();
    PP.partner = rows[0];
    ppToast('Welcome aboard! 🌿');
    renderPortal(PP.partner);
  } catch (e) {
    ppShowErr(e.message);
    const b = ppEl('pp-submit'); if (b) { b.textContent = 'Finish Setup'; b.disabled = false; }
  }
}

/* SCREEN 3 (the dashboard with its tabs) lives in portal.js, one file per tab after that. */

/* ─── GLUE ─── */
// If someone logs in through the shop popup in the header, show their partner screen right away
(function hookShopLogin() {
  const orig = window.showLoggedInState;
  window.showLoggedInState = function (email) {
    if (typeof orig === 'function') orig(email);
    closeAuthModal();
    initPortal();
  };
})();
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !ppEl('pp-submit')) return;
  const a = document.activeElement;
  if (a && /^pp-/.test(a.id) && a.tagName === 'INPUT' && a.type !== 'checkbox') ppEl('pp-submit').click();
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPortal);
else initPortal();
