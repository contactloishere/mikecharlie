/* ─────────────────────────────────────────────────────────
   SHARED
   Loaded first. Config, Supabase helpers, auth/session, DOM helpers, shared state (S, PS), goTab dispatcher, cross-tab data loaders (initInventoryData, fetchSalesData, fmtDate).
   ───────────────────────────────────────────────────────── */

const SB_URL='https://cdczxunygdmswgdzkbed.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkY3p4dW55Z2Rtc3dnZHprYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTg5NjksImV4cCI6MjEwMjc3NDk2OX0.IrC05NPev5Zp6uV0DMe0gZI3boQsqXuTYSTVdyn8oWg';
let ACCESS_TOKEN=null, CURRENT_USER=null, CURRENT_PROFILE=null;

function authHeaders(extra){
  return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+(ACCESS_TOKEN||SB_KEY)}, extra||{});
}
async function sbGet(table,query){
  const r=await fetch(`${SB_URL}/rest/v1/${table}?${query||'select=*'}`,{headers:authHeaders()});
  if(!r.ok) throw new Error('GET failed: '+(await r.text()));
  return r.json();
}
async function sbInsert(table,row){
  const r=await fetch(`${SB_URL}/rest/v1/${table}`,{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),
    body:JSON.stringify(row)
  });
  if(!r.ok) throw new Error('INSERT failed: '+(await r.text()));
  return r.json();
}
async function sbUpdate(table,id,data){
  const r=await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`,{
    method:'PATCH',
    headers:authHeaders({'Content-Type':'application/json','Prefer':'return=representation'}),
    body:JSON.stringify(data)
  });
  if(!r.ok) throw new Error('UPDATE failed: '+(await r.text()));
  return r.json();
}
async function sbDelete(table,query){
  const r=await fetch(`${SB_URL}/rest/v1/${table}?${query}`,{
    method:'DELETE',
    headers:authHeaders()
  });
  if(!r.ok) throw new Error('DELETE failed: '+(await r.text()));
}
async function sbRpc(fn,args){
  const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}`,{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify(args)
  });
  if(!r.ok) throw new Error((await r.text()));
  return r.status===204?null:r.json();
}

/* ─── AUTH ─── */
const SESSION_KEY='mcc_admin_session';
let refreshTimer=null;

function saveSession(data){
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    access_token:data.access_token,
    refresh_token:data.refresh_token,
    expires_at:Date.now()+((data.expires_in||3600)*1000),
    user:data.user
  }));
}
function loadSession(){
  try{const raw=localStorage.getItem(SESSION_KEY);return raw?JSON.parse(raw):null;}catch(e){return null;}
}
function clearSession(){localStorage.removeItem(SESSION_KEY);if(refreshTimer)clearInterval(refreshTimer);}

async function refreshAuthToken(refresh_token){
  const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.error_description||'Session expired');
  return data;
}

// Shared by both a fresh password login and a restored session
async function enterApp(authData, displayEmail){
  ACCESS_TOKEN=authData.access_token;
  CURRENT_USER=authData.user;
  const profiles=await sbGet('profiles',`id=eq.${CURRENT_USER.id}&select=role,full_name`);
  CURRENT_PROFILE=profiles[0];
  if(!CURRENT_PROFILE||!['admin','staff'].includes(CURRENT_PROFILE.role)){
    clearSession();
    showAccessDenied();
    return;
  }
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('hdr-user').textContent=(CURRENT_PROFILE.full_name||displayEmail||CURRENT_USER.email)+' · '+CURRENT_PROFILE.role;
  // Keep the session alive in the background — refresh well before the ~1hr token expiry
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=setInterval(async()=>{
    const s=loadSession();
    if(!s)return;
    try{const fresh=await refreshAuthToken(s.refresh_token);saveSession(fresh);ACCESS_TOKEN=fresh.access_token;}
    catch(e){/* will simply prompt for login again next visit */}
  },45*60*1000);
  initInventoryData().then(()=>renderHome());
}

async function tryRestoreSession(){
  const session=loadSession();
  if(!session)return false;
  try{
    let authData=session;
    if(Date.now()>session.expires_at-5*60*1000){ // refresh if expiring within 5 min
      authData=await refreshAuthToken(session.refresh_token);
      saveSession(authData);
    }
    await enterApp(authData, session.user&&session.user.email);
    return true;
  }catch(e){
    clearSession();
    return false;
  }
}

async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-pw').value;
  const errBox=document.getElementById('login-err');
  errBox.style.display='none';
  if(!email||!pw){errBox.textContent='Enter your email and password.';errBox.style.display='block';return;}
  const btn=document.getElementById('login-btn');
  btn.textContent='Logging in...';btn.disabled=true;
  try{
    const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pw})
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data.error_description||data.msg||'Login failed');
    saveSession(data);
    await enterApp(data, email);
  }catch(e){
    errBox.textContent=e.message;errBox.style.display='block';
  }finally{
    btn.textContent='Log In';btn.disabled=false;
  }
}
function showAccessDenied(){
  document.getElementById('login-screen').innerHTML=`<div class="access-denied">
    <div style="font-size:36px;margin-bottom:10px">🔒</div>
    <h2 style="color:var(--lagoon);margin-bottom:8px">Access Denied</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">This account isn't set up as an admin. If this is your account, check the profiles table in Supabase.</p>
    <button class="btn btn-o" onclick="location.reload()">Back to Login</button>
  </div>`;
}
function doLogout(){
  clearSession();
  ACCESS_TOKEN=null;CURRENT_USER=null;CURRENT_PROFILE=null;
  location.reload();
}
document.addEventListener('DOMContentLoaded',()=>{
  ['login-email','login-pw'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  });
  tryRestoreSession();
});


/* ─── HELPERS ─── */
const $=id=>document.getElementById(id);
const P=n=>'₱'+(parseFloat(n)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
function toast(msg,ms=3500){
  const t=$('toast');t.textContent=msg;t.style.display='block';
  clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',ms);
}
function closeModal(id){$(id).classList.remove('show');}
function openModal(id){$(id).classList.add('show');}
function soonTab(){toast('This tab is coming in a later phase.');}

/* ─── STATE ─── */
const S={skus:[],categories:[],search:'',catFilter:'',locFilter:'',lowOnly:false};
const PS={listings:[],allSkus:[],categories:[],photoMap:{},recipesAll:[],groups:[],currentTitle:null,currentListing:null,variants:[],expandedId:null,newVariantCounter:0};
function attrEsc(s){return (s==null?'':String(s)).replace(/"/g,'&quot;');}

function goTab(name,btn){
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'));
  if(btn)btn.classList.add('on');
  if(name==='inventory')renderInventory();
  if(name==='takeorder')renderTakeOrder();
  if(name==='home')renderHome();
  if(name==='sales')renderSalesLog();
  if(name==='reports')renderDataReports();
  if(name==='products')renderProducts();
}

/* ─── LOAD DATA ─── */
async function initInventoryData(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading inventory...</p></div>`;
  try{
    const [skus,cats]=await Promise.all([
      sbGet('skus','select=*,categories(id,name)&order=product_name.asc'),
      sbGet('categories','select=*&order=display_order.asc')
    ]);
    S.skus=skus;S.categories=cats;
    const npCat=$('np-category');
    cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;npCat.appendChild(o);});
    renderInventory();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load inventory.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   SHARED: SALES DATA FETCH (used by Home + Sales tabs)
   ═══════════════════════════════════════════════════════════════════════ */
let salesCache=null;
async function fetchSalesData(force){
  if(salesCache && !force)return salesCache;
  salesCache=await sbGet('sales','select=*,sale_items(id,sku_id,quantity,unit_price,subtotal,skus(product_name,variant,sku_code,unit_cost))&order=sale_date.desc');
  return salesCache;
}
function startOfWeek(d){const dt=new Date(d);const day=dt.getDay();const diff=(day===0?-6:1-day);dt.setDate(dt.getDate()+diff);dt.setHours(0,0,0,0);return dt;}
function startOfMonth(d){return new Date(d.getFullYear(),d.getMonth(),1);}

function fmtDate(iso){return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});}
