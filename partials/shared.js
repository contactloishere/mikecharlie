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
function openAuthModal() { const m = document.getElementById('auth-modal'); if (m) m.classList.add('show'); }
function closeAuthModal() { const m = document.getElementById('auth-modal'); if (m) m.classList.remove('show'); }
function signInFormHtml() {
  return `<h2>Welcome</h2><div class="auth-tabs"><button class="auth-tab on" onclick="setAuthMode('signin')">Log In</button><button class="auth-tab" onclick="setAuthMode('signup')">Sign Up</button></div>
    <div class="auth-err" id="auth-err"></div>
    <label class="lbl">Email</label><input class="inp" type="email" id="auth-email" placeholder="you@email.com">
    <label class="lbl">Password</label><input class="inp" type="password" id="auth-pw" placeholder="••••••••">
    <button class="btn btn-p" style="width:100%" id="auth-submit" onclick="submitAuth()">Log In</button>`;
}
function signUpFormHtml() {
  return `<h2>Welcome</h2><div class="auth-tabs"><button class="auth-tab" onclick="setAuthMode('signin')">Log In</button><button class="auth-tab on" onclick="setAuthMode('signup')">Sign Up</button></div>
    <div class="auth-err" id="auth-err"></div>
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
    if (window._proceedToCheckoutAfterAuth) {
      window._proceedToCheckoutAfterAuth = false;
      window.location.href = '/checkout.html';
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
  if (session && Date.now() < session.expires_at) {
    const link = document.getElementById('auth-link');
    if (link) {
      link.textContent = 'My Account';
      link.onclick = function () { openAuthModal(); showLoggedInState(session.user.email); };
    }
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
