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

/* ─── MOBILE NAV ─── */
function openMobileNav() { const el = document.getElementById('mobile-nav-overlay'); if (el) el.classList.add('show'); }
function closeMobileNav() { const el = document.getElementById('mobile-nav-overlay'); if (el) el.classList.remove('show'); }

/* ─── PARTIAL LOADER — call this from each page ─── */
async function loadSharedParts() {
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');
  try {
    if (headerEl) {
      const r = await fetch('/partials/header.html');
      headerEl.outerHTML = await r.text();
    }
  } catch (e) { console.warn('Header failed to load', e); }
  try {
    if (footerEl) {
      const r = await fetch('/partials/footer.html');
      footerEl.outerHTML = await r.text();
    }
  } catch (e) { console.warn('Footer failed to load', e); }
  updateCartBadge();
  restoreSessionUI();
}
