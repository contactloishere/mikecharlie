/* ============================================================
   SHARED CART / AUTH / MOBILE NAV LOGIC
   One file, included on every page. Assumes each page defines
   SB_URL and SB_KEY before this script loads, and has the header/
   footer/cart/modal HTML already injected into the page.
   ============================================================ */

const P = n => '₱' + (parseFloat(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── CART (shared localStorage across all pages) ─── */
let cart = JSON.parse(localStorage.getItem('mcc_cart') || '[]');
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = cart.reduce((s, i) => s + i.qty, 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}
async function openCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if (!overlay || !drawer) return;
  overlay.classList.add('show');
  drawer.classList.add('show');
  const container = document.getElementById('cart-items');
  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty">Your tote bag is empty.</div>';
    document.getElementById('cart-total').textContent = P(0);
    return;
  }
  try {
    const ids = cart.map(i => i.sku_id).join(',');
    const r = await fetch(`${SB_URL}/rest/v1/skus?id=in.(${ids})&select=*`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    const skus = r.ok ? await r.json() : [];
    let total = 0;
    container.innerHTML = cart.map(item => {
      const sku = skus.find(s => s.id === item.sku_id);
      if (!sku) return '';
      const price = (sku.is_on_sale && sku.sale_price != null) ? sku.sale_price : sku.retail_price_direct;
      const lineTotal = (price || 0) * item.qty; total += lineTotal;
      return `<div class="cart-item">
        <div class="cart-item-img">🌿</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${sku.product_name}</div>
          ${sku.variant ? `<div class="cart-item-var">${sku.variant}</div>` : ''}
          <div class="cart-item-row"><span>Qty: ${item.qty}</span><span class="cart-item-price">${P(lineTotal)}</span></div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('cart-total').textContent = P(total);
  } catch (e) {
    container.innerHTML = '<div class="cart-empty">Could not load your tote bag.</div>';
  }
}
function closeCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if (overlay) overlay.classList.remove('show');
  if (drawer) drawer.classList.remove('show');
}

/* ─── AUTH ─── */
const SESSION_KEY = 'mcc_customer_session';
let authMode = 'signin';
function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + ((data.expires_in || 3600) * 1000), user: data.user })); }
function loadSession() { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

/* ─── STAY LOGGED IN ───
   The login "pass" (access token) only lasts an hour, but Supabase also
   gives a long-life "renewal pass" (refresh token). Whenever the short
   pass is about to run out, we quietly swap it for a new one, so the
   customer stays logged in on this device until they tap Log Out or clear
   their browser data. */
let _refreshing = null;
async function getFreshSession() {
  const s = loadSession();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s;      // still good for another minute or more
  if (!s.refresh_token) { clearSession(); return null; } // old-style login with no renewal pass
  if (!_refreshing) {
    _refreshing = (async () => {
      try {
        const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        const data = await r.json();
        if (!r.ok || !data.access_token) {
          // Supabase said no (renewal pass no longer valid): log out properly.
          if (r.status >= 400 && r.status < 500) clearSession();
          return null;
        }
        saveSession(data);
        return loadSession();
      } catch (e) {
        return null; // no internet right now: keep them logged in, try again next time
      } finally {
        _refreshing = null;
      }
    })();
  }
  return _refreshing;
}
function openAuthModal() { const m = document.getElementById('auth-modal'); if (m) m.classList.add('show'); }
function closeAuthModal() { const m = document.getElementById('auth-modal'); if (m) m.classList.remove('show'); }
function signInFormHtml() {
  return `<h2>Welcome</h2><div class="auth-tabs"><button class="auth-tab on" onclick="setAuthMode('signin')">Log In</button><button class="auth-tab" onclick="setAuthMode('signup')">Sign Up</button></div>
    <div class="auth-err" id="auth-err"></div>
    ${googleButtonHtml()}
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;color:#8FA9A4;font-size:12px"><div style="flex:1;height:1px;background:#E6D5C3"></div>or use email<div style="flex:1;height:1px;background:#E6D5C3"></div></div>
    <label class="lbl">Email</label><input class="inp" type="email" id="auth-email" placeholder="you@email.com">
    <label class="lbl">Password</label><input class="inp" type="password" id="auth-pw" placeholder="••••••••">
    <button class="btn btn-p" style="width:100%" id="auth-submit" onclick="submitAuth()">Log In</button>`;
}
function signUpFormHtml() {
  return `<h2>Welcome</h2><div class="auth-tabs"><button class="auth-tab" onclick="setAuthMode('signin')">Log In</button><button class="auth-tab on" onclick="setAuthMode('signup')">Sign Up</button></div>
    <div class="auth-err" id="auth-err"></div>
    ${googleButtonHtml()}
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;color:#8FA9A4;font-size:12px"><div style="flex:1;height:1px;background:#E6D5C3"></div>or use email<div style="flex:1;height:1px;background:#E6D5C3"></div></div>
    <label class="lbl">Email</label><input class="inp" type="email" id="auth-email" placeholder="you@email.com">
    <label class="lbl">Password</label><input class="inp" type="password" id="auth-pw" placeholder="••••••••">
    <button class="btn btn-p" style="width:100%" id="auth-submit" onclick="submitAuth()">Create Account</button>`;
}
function setAuthMode(mode) { authMode = mode; document.getElementById('auth-content').innerHTML = mode === 'signin' ? signInFormHtml() : signUpFormHtml(); }
async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim(), pw = document.getElementById('auth-pw').value;
  const errBox = document.getElementById('auth-err'); errBox.style.display = 'none';
  if (!email || !pw) { errBox.textContent = 'Enter your email and password.'; errBox.style.display = 'block'; return; }
  const btn = document.getElementById('auth-submit'); const orig = btn.textContent; btn.textContent = 'Please wait...'; btn.disabled = true;
  try {
    const endpoint = authMode === 'signin' ? 'token?grant_type=password' : 'signup';
    const r = await fetch(`${SB_URL}/auth/v1/${endpoint}`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Something went wrong.');
    if (authMode === 'signup' && !data.access_token) {
      document.getElementById('auth-content').innerHTML = `<div class="auth-ok"><h3>Almost there!</h3><p>Check your email to confirm your account, then log in.</p></div>`;
      return;
    }
    saveSession(data);
    showLoggedInState(data.user.email);
    await migrateGuestLikesToServer();
    if (window._proceedToCheckoutAfterAuth) {
      window._proceedToCheckoutAfterAuth = false;
      window.location.href = '/checkout.html';
      return;
    }
    if (typeof S !== 'undefined' && S.likes) {
      window.location.reload(); // refresh hearts on-page to reflect merged likes
      return;
    }
  } catch (e) { errBox.textContent = e.message; errBox.style.display = 'block'; }
  finally { btn.textContent = orig; btn.disabled = false; }
}
function showLoggedInState(email) {
  const link = document.getElementById('auth-link');
  if (link) link.textContent = 'My Account';
  document.getElementById('auth-content').innerHTML = `<div class="auth-ok"><h3>Welcome back! 🌿</h3><p>Logged in as <strong>${email}</strong>.</p></div><button class="btn btn-p" style="width:100%;margin-top:14px" onclick="doLogout()">Log Out</button>`;
}
function doLogout() {
  clearSession();
  const link = document.getElementById('auth-link');
  if (link) link.textContent = 'Log In / Sign Up';
  authMode = 'signin';
  document.getElementById('auth-content').innerHTML = signInFormHtml();
  closeAuthModal();
}
function restoreSessionUI() {
  const session = loadSession();
  if (session && (session.refresh_token || Date.now() < session.expires_at)) {
    getFreshSession(); // renew quietly in the background if needed
    const link = document.getElementById('auth-link');
    if (link) {
      link.textContent = 'My Account';
      link.onclick = function () { openAuthModal(); showLoggedInState(session.user.email); };
    }
  }
}

/* ─── GOOGLE SIGN-IN ───
   The customer taps the button, goes to Google, picks their Gmail, and
   Google sends them back to the site's home page with a login pass in
   the web address. handleAuthReturn() picks that pass up, saves the
   login, then sends them to the page they were heading to. */
function googleButtonHtml() {
  return `<button type="button" onclick="signInWithGoogle()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border-radius:9px;background:#fff;color:#1C2E2C;border:1.5px solid #E6D5C3;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit">
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
    Continue with Google</button>`;
}
function signInWithGoogle() {
  // Remember where to send them after they come back from Google
  try {
    localStorage.setItem('mcc_after_auth', JSON.stringify({
      checkout: !!window._proceedToCheckoutAfterAuth,
      back: window.location.pathname + window.location.search
    }));
  } catch (e) {}
  const redirect = encodeURIComponent(window.location.origin + '/');
  window.location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
}
async function handleAuthReturn() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  const params = new URLSearchParams(hash.slice(1));

  if (params.get('error')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    alert('Google sign in was cancelled or did not finish. Please try again.');
    return;
  }

  const access_token = params.get('access_token');
  if (!access_token) return; // just a normal page link, nothing to do

  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + access_token } });
    if (!r.ok) throw new Error('user lookup failed');
    const user = await r.json();
    saveSession({
      access_token,
      refresh_token: params.get('refresh_token'),
      expires_in: parseInt(params.get('expires_in') || '3600', 10),
      user
    });
  } catch (e) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    alert('Sign in did not finish. Please try again.');
    return;
  }

  await migrateGuestLikesToServer();

  let dest = '/';
  try {
    const saved = JSON.parse(localStorage.getItem('mcc_after_auth') || 'null');
    localStorage.removeItem('mcc_after_auth');
    if (saved) dest = saved.checkout ? '/checkout.html' : (saved.back || '/');
  } catch (e) {}
  if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/';
  window.location.replace(dest); // also clears the long login pass from the address bar
}
window.addEventListener('load', handleAuthReturn);

/* ─── LIKES SYNC (server-side, for logged-in customers) ───
   Guests keep using localStorage only (S.likes in index.html). Once
   someone's logged in, every heart tap also writes to/from mcc_likes
   in Supabase, so likes follow them across devices and show up on
   their account page. */
async function syncLikeToServer(skuId, liked) {
  const session = await getFreshSession();
  if (!session) return;
  const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
  try {
    if (liked) {
      await fetch(`${SB_URL}/rest/v1/mcc_likes`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ customer_id: session.user.id, sku_id: skuId }) });
    } else {
      await fetch(`${SB_URL}/rest/v1/mcc_likes?customer_id=eq.${session.user.id}&sku_id=eq.${skuId}`, { method: 'DELETE', headers });
    }
  } catch (e) { /* not fatal — local like still saved either way */ }
}
async function fetchServerLikes() {
  const session = await getFreshSession();
  if (!session) return null;
  try {
    const rows = await fetch(`${SB_URL}/rest/v1/mcc_likes?customer_id=eq.${session.user.id}&select=sku_id`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token } }).then(r => r.json());
    return rows.map(r => r.sku_id);
  } catch (e) { return null; }
}
// Called right after a successful login/signup: uploads any likes the
// guest collected locally before signing in, so nothing gets lost.
async function migrateGuestLikesToServer() {
  if (typeof S === 'undefined' || !S.likes) return;
  const serverLikes = await fetchServerLikes();
  if (serverLikes === null) return;
  for (const skuId of S.likes) {
    if (!serverLikes.includes(skuId)) await syncLikeToServer(skuId, true);
  }
}

/* ─── ACCOUNT CHOICE (shown when a customer clicks Checkout) ───
   Lets them pick: create an account, log in, or continue as a guest,
   before landing on the checkout page. Self-contained (injects its own
   HTML/CSS) so it works on any page that loads this file. */
const ACCOUNT_CHOICE_HTML = `
<div id="account-choice-modal" style="position:fixed;inset:0;background:rgba(28,46,44,.65);z-index:199;display:none;align-items:center;justify-content:center;padding:1rem;font-family:'DM Sans',sans-serif">
  <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem;width:100%;max-width:380px;box-shadow:0 8px 36px rgba(62,95,92,0.18);position:relative">
    <button onclick="closeAccountChoice()" style="position:absolute;top:12px;right:14px;background:#E6D5C3;border:none;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer">✕</button>
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:#3E5F5C;text-align:center;margin-bottom:8px">Track your order?</h2>
    <p style="font-size:13px;color:#4A6862;text-align:center;line-height:1.6;margin-bottom:1.5rem">Create a free account to see your order status and history anytime — or check out as a guest, no account needed.</p>
    <button onclick="chooseCreateAccount()" style="width:100%;padding:13px;border-radius:9px;background:#3E5F5C;color:#F7F3EC;border:none;font-size:14px;font-weight:500;margin-bottom:10px;cursor:pointer">Create Account</button>
    <button onclick="chooseLogIn()" style="width:100%;padding:13px;border-radius:9px;background:#fff;color:#3E5F5C;border:1.5px solid #3E5F5C;font-size:14px;font-weight:500;margin-bottom:10px;cursor:pointer">Log In</button>
    <button onclick="continueAsGuest()" style="width:100%;padding:13px;border-radius:9px;background:#F0E8DA;color:#4A6862;border:none;font-size:14px;font-weight:500;cursor:pointer">Continue as Guest</button>
    <p style="font-size:11px;color:#8FA9A4;text-align:center;line-height:1.6;margin-top:14px">Checking out as a guest is totally fine — you just won't be able to look up this order later unless you sign up.</p>
  </div>
</div>`;
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('account-choice-modal')) {
    document.body.insertAdjacentHTML('beforeend', ACCOUNT_CHOICE_HTML);
  }
});
function openAccountChoice() {
  closeCart();
  const el = document.getElementById('account-choice-modal');
  if (el) el.style.display = 'flex';
}
function closeAccountChoice() {
  const el = document.getElementById('account-choice-modal');
  if (el) el.style.display = 'none';
}
function continueAsGuest() {
  closeAccountChoice();
  window.location.href = '/checkout.html';
}
function chooseCreateAccount() {
  closeAccountChoice();
  window._proceedToCheckoutAfterAuth = true;
  openAuthModal();
  setAuthMode('signup');
}
function chooseLogIn() {
  closeAccountChoice();
  window._proceedToCheckoutAfterAuth = true;
  openAuthModal();
  setAuthMode('signin');
}

/* ─── MOBILE NAV ─── */
function openMobileNav() { const el = document.getElementById('mobile-nav-overlay'); if (el) el.classList.add('show'); }
function closeMobileNav() { const el = document.getElementById('mobile-nav-overlay'); if (el) el.classList.remove('show'); }

/* ─── GENERIC PARTIAL LOADER ───
   Fetches an HTML file and drops it in place of a placeholder element.
   Use this for the header/footer AND for any future page section that
   should live in its own file instead of being pasted into the page.

   Usage on a page:
     <div id="section-something"></div>
     <script>loadPartial('section-something', '/partials/something.html');</script>

   If the partial file doesn't exist yet (e.g. still being drafted), this
   fails quietly — the placeholder just stays empty — instead of dumping a
   "404 Not Found" error page into the layout. */
async function loadPartial(placeholderId, url) {
  const el = document.getElementById(placeholderId);
  if (!el) return;
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn('Partial not found yet:', url); return; }
    const html = await r.text();
    el.outerHTML = html;
    // Setting outerHTML does NOT execute any <script> tags inside it —
    // that's a browser security quirk, not a bug — so re-create and run
    // them manually if the partial brought any along.
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      if (oldScript.src) newScript.src = oldScript.src;
      else newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
    });
  } catch (e) { console.warn('Partial failed to load:', url, e); }
}

/* ─── PARTIAL LOADER — call this from each page ─── */
async function loadSharedParts() {
  await loadPartial('site-header', '/partials/header.html');
  await loadPartial('site-footer', '/partials/footer.html');
  updateCartBadge();
  restoreSessionUI();
}
