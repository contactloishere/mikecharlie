/* ─────────────────────────────────────────────────────────
   UPDATES TAB
   A simple feed of what is new: member sign ups, new orders waiting for
   payment verification, and (later) new ratings. Rows come from the
   `notifications` table, which the database fills in by itself.
   Uses helpers from shared.js: $, sbGet, sbUpdate, toast.
   ───────────────────────────────────────────────────────── */

const UP={items:[],filter:'all',timer:null};
const UP_ICON={signup:'👤',order:'🧾',rating:'⭐'};
const UP_LABEL={signup:'Sign up',order:'Order',rating:'Rating'};
const UP_TAB={order:'orders'};   // which admin tab a click should open

function upAgo(iso){
  const s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return 'just now';
  if(s<3600)return Math.floor(s/60)+' min ago';
  if(s<86400)return Math.floor(s/3600)+' hr ago';
  if(s<604800)return Math.floor(s/86400)+' day'+(Math.floor(s/86400)>1?'s':'')+' ago';
  return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
}
function upEsc(t){return String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* Red number on the tab. Light check: one tiny request, only while the page is open and visible. */
async function refreshUpdatesBadge(){
  try{
    const rows=await sbGet('notifications','is_read=eq.false&select=id&limit=100');
    const el=$('updates-badge');
    if(!el)return;
    if(rows.length){el.textContent=rows.length>=100?'99+':rows.length;el.style.display='inline-block';}
    else el.style.display='none';
  }catch(e){/* table not created yet: stay quiet */}
}
function startUpdatesBadge(){
  refreshUpdatesBadge();
  if(UP.timer)clearInterval(UP.timer);
  UP.timer=setInterval(()=>{if(!document.hidden)refreshUpdatesBadge();},60000);
}

async function renderUpdates(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading updates...</p></div>`;
  try{
    UP.items=await sbGet('notifications','select=*&order=created_at.desc&limit=100');
    drawUpdates();
    refreshUpdatesBadge();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">🔔</div><p>Couldn't load updates.<br>
      <span class="t-muted" style="font-size:12px">If this is the first time, the notifications set-up (SQL) has not been run in Supabase yet.</span></p></div>`;
  }
}

function setUpFilter(v){UP.filter=v;drawUpdates();}

function drawUpdates(){
  const unread=UP.items.filter(i=>!i.is_read).length;
  const list=UP.items.filter(i=>UP.filter==='all'||(UP.filter==='unread'?!i.is_read:i.kind===UP.filter));
  $('body').innerHTML=`
    <div class="toolbar" style="margin-bottom:12px">
      <select class="inp" onchange="setUpFilter(this.value)">
        <option value="all" ${UP.filter==='all'?'selected':''}>All updates</option>
        <option value="unread" ${UP.filter==='unread'?'selected':''}>Unread (${unread})</option>
        <option value="signup" ${UP.filter==='signup'?'selected':''}>Sign ups</option>
        <option value="order" ${UP.filter==='order'?'selected':''}>Orders</option>
        <option value="rating" ${UP.filter==='rating'?'selected':''}>Ratings</option>
      </select>
      <button class="btn btn-o btn-sm" onclick="markAllUpdatesRead()" ${unread?'':'disabled style="opacity:.5;cursor:default"'}>Mark all as read</button>
    </div>
    ${list.length?list.map(upCard).join(''):'<div class="empty"><div class="empty-i">🔔</div><p>Nothing here yet.</p></div>'}`;
}

function upCard(n){
  const tab=UP_TAB[n.kind];
  return `<div class="card" style="display:flex;gap:12px;align-items:flex-start;padding:.9rem 1.1rem;margin-bottom:8px;${n.is_read?'':'border-left:4px solid var(--golden);'}${tab?'cursor:pointer':''}" ${tab?`onclick="openUpdate('${n.id}')"`:''}>
    <div style="font-size:22px;line-height:1.2">${UP_ICON[n.kind]||'🔔'}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="font-weight:${n.is_read?'500':'700'};color:var(--lagoon)">${upEsc(n.title)}</div>
        <div class="t-muted" style="font-size:12px">${upAgo(n.created_at)}</div>
      </div>
      ${n.body?`<div style="font-size:13px;color:var(--text-mid);margin-top:2px;word-break:break-word">${upEsc(n.body)}</div>`:''}
      <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
        <span class="pill-tiny" style="background:var(--sand-light);color:var(--text-mid)">${UP_LABEL[n.kind]||n.kind}</span>
        ${n.is_read?'':`<button class="btn btn-o btn-sm" onclick="event.stopPropagation();markUpdateRead('${n.id}')">Mark as read</button>`}
      </div>
    </div>
  </div>`;
}

async function markUpdateRead(id){
  try{
    await sbUpdate('notifications',id,{is_read:true});
    const it=UP.items.find(x=>x.id===id);if(it)it.is_read=true;
    drawUpdates();refreshUpdatesBadge();
  }catch(e){toast('Could not update: '+e.message);}
}
async function markAllUpdatesRead(){
  try{
    const r=await fetch(`${SB_URL}/rest/v1/notifications?is_read=eq.false`,{
      method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({is_read:true})
    });
    if(!r.ok)throw new Error(await r.text());
    UP.items.forEach(i=>i.is_read=true);
    drawUpdates();refreshUpdatesBadge();
  }catch(e){toast('Could not update: '+e.message);}
}
/* Clicking an order update marks it read and jumps to the Member Orders tab */
async function openUpdate(id){
  const it=UP.items.find(x=>x.id===id);
  if(!it)return;
  if(!it.is_read){try{await sbUpdate('notifications',id,{is_read:true});it.is_read=true;}catch(e){}}
  const name=UP_TAB[it.kind];
  const btn=[...document.querySelectorAll('.tab')].find(b=>(b.getAttribute('onclick')||'').includes("'"+name+"'"));
  goTab(name,btn);
  refreshUpdatesBadge();
}
