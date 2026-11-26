/* ─────────────────────────────────────────────────────────
   PRODUCTS TAB
   The ONE place to add and edit products (Mike Charlie and Preloved).
   Layout of a product page:
     1. General  (one card, one Save button, applies to every variant)
     2. Variants (one accordion per variant, each with its own Save button)
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTS LIST
   ═══════════════════════════════════════════════════════════════════════ */
async function renderProducts(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading products...</p></div>`;
  try{
    const [listings,skus,photos,recipes,cats,tiers]=await Promise.all([
      sbGet('product_listings','select=*'),
      sbGet('skus','select=*,categories(id,name)&order=product_name.asc'),
      sbGet('variant_photos','select=sku_id,photo_url'),
      sbGet('product_recipes','select=*'),
      sbGet('categories','select=*&order=display_order.asc'),
      sbGet('mcc_partner_price_tiers','select=*&order=min_qty.asc')
    ]);
    PS.tiers=tiers;PS.listings=listings;PS.allSkus=skus;PS.categories=cats;PS.recipesAll=recipes;
    PS.photoMap={};photos.forEach(p=>{if(p.photo_url)PS.photoMap[p.sku_id]=p.photo_url;});
    renderProductsList();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load products.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}

/* Finds the Preloved category by the word "preloved" in its name, so it keeps working even if you rename it. */
function prelovedCategory(){
  return (PS.categories||[]).find(c=>/preloved/i.test(c.name||''))||null;
}
function isPrelovedCatId(id){
  const c=prelovedCategory();
  return !!(c && id && c.id===id);
}

function renderProductsList(){
  PS.draft=null;
  const map={};
  PS.allSkus.forEach(s=>{
    if(!map[s.product_name])map[s.product_name]=[];
    map[s.product_name].push(s);
  });
  PS.groups=Object.entries(map);
  // Show the products in the order Lois set by dragging (new products without an order go last, A to Z)
  const ord=t=>{const l=PS.listings.find(x=>x.title===t);return l&&l.sort_order!=null?l.sort_order:Infinity;};
  PS.groups.sort((a,b)=>ord(a[0])-ord(b[0])||a[0].localeCompare(b[0],'en',{sensitivity:'base'}));
  let html=`<div class="card"><div class="card-title">🗂️ All Products</div>
    <p class="t-muted" style="font-size:13px;margin-bottom:12px">Everything here (photos, descriptions, prices, stock, recipes) is editable right from this screen. This is the only place to add or edit products.</p>
    <p class="t-muted" style="font-size:13px;margin-bottom:12px">☰ <b>Drag a product card</b> to where you want it (or use the ‹ › arrows on a phone). This is the order your customers and partners see in the shop.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p btn-sm" onclick="openNewListingModal(false)">+ New Product</button>
      <button class="btn btn-g btn-sm" onclick="openNewListingModal(true)">+ Preloved Item</button>
    </div>
  </div>`;
  if(!PS.groups.length){
    html+=`<div class="empty"><div class="empty-i">🗂️</div><p>No products yet.</p></div>`;
  }else{
    html+=`<div class="listing-grid">`;
    PS.groups.forEach(([title,arr],idx)=>{
      const listing=PS.listings.find(l=>l.title===title);
      const thumb=listing&&listing.cover_image_url;
      const inactiveCount=arr.filter(s=>!s.is_active).length;
      const pre=isPrelovedCatId(arr[0].category_id);
      html+=`<div class="listing-card" draggable="true" data-title="${attrEsc(title)}" ondragstart="plDragStart(event)" ondragover="plDragOver(event)" ondragleave="plDragLeave(event)" ondrop="plDrop(event)" ondragend="plDragEnd(event)" onclick="openListingDetail(${idx})">
        <div class="pl-move" onclick="event.stopPropagation()"><button title="Move earlier" onclick="plMove(${idx},-1)">‹</button><span class="pl-grip">☰</span><button title="Move later" onclick="plMove(${idx},1)">›</button></div>
        <div class="listing-thumb">${thumb?`<img src="${attrEsc(thumb)}">`:'🌿'}</div>
        <div class="listing-info">
          <div class="listing-title">${title}</div>
          <div class="listing-meta">${pre?'Preloved · ':''}${arr.length} variant${arr.length!==1?'s':''}${inactiveCount?' · '+inactiveCount+' inactive':''}</div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  $('body').innerHTML=html;
}

/* ─── Drag to reorder products. The order is saved on each listing (sort_order) and used by the shop and the partner shop. ─── */
let PL_DRAG=null;
function plDragStart(e){PL_DRAG=e.currentTarget.dataset.title;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',PL_DRAG);}catch(x){}e.currentTarget.style.opacity='.45';}
function plDragOver(e){if(PL_DRAG==null)return;e.preventDefault();e.currentTarget.classList.add('pl-over');}
function plDragLeave(e){e.currentTarget.classList.remove('pl-over');}
function plDragEnd(e){e.currentTarget.style.opacity='';document.querySelectorAll('.pl-over').forEach(x=>x.classList.remove('pl-over'));}
function plDrop(e){
  e.preventDefault();e.currentTarget.classList.remove('pl-over');
  const to=e.currentTarget.dataset.title,from=PL_DRAG;PL_DRAG=null;
  if(from==null||from===to)return;
  const arr=PS.groups.map(g=>g[0]),fi=arr.indexOf(from),ti=arr.indexOf(to);
  arr.splice(fi,1);arr.splice(ti,0,from);
  plSaveOrder(arr);
}
function plMove(idx,d){
  const arr=PS.groups.map(g=>g[0]),j=idx+d;if(j<0||j>=arr.length)return;
  const t=arr[idx];arr.splice(idx,1);arr.splice(j,0,t);plSaveOrder(arr);
}
async function plSaveOrder(titles){
  const changed=[];
  titles.forEach((t,i)=>{
    const l=PS.listings.find(x=>x.title===t);
    if(l){if(l.sort_order!==i+1){l.sort_order=i+1;changed.push(['u',l]);}}
    else changed.push(['i',{title:t,sort_order:i+1}]);
  });
  // show the new order straight away, then save it
  PS.groups.sort((a,b)=>titles.indexOf(a[0])-titles.indexOf(b[0]));
  renderProductsList();
  try{
    for(const [k,l] of changed){
      if(k==='u')await sbUpdate('product_listings',l.id,{sort_order:l.sort_order});
      else{const saved=await sbInsert('product_listings',l);PS.listings.push(saved[0]);}
    }
    toast('✓ Order saved');
  }catch(e){toast('Could not save the order: '+e.message);}
}

/* ═══════════════════════════════════════════════════════════════════════
   NEW LISTING (regular product or Preloved item)
   ═══════════════════════════════════════════════════════════════════════ */
function openNewListingModal(isPreloved){
  if(isPreloved && !prelovedCategory()){
    toast('No Preloved category found yet. Add one in Supabase (categories table) with the word "Preloved" in its name.');
    return;
  }
  PS.newIsPreloved=!!isPreloved;
  $('nl-title').value='';
  const t=document.querySelector('#newlisting-modal .modal-title');
  const sub=document.querySelector('#newlisting-modal .modal-sub');
  if(t)t.textContent=isPreloved?'New Preloved Item':'New Product Listing';
  if(sub)sub.textContent=isPreloved?'Give the item a name. Category, stock of 1 and a SKU code are filled in for you.':"Give it a name. You'll add photos, descriptions, and variants next.";
  openModal('newlisting-modal');
}
async function submitNewListing(){
  const title=$('nl-title').value.trim();
  if(!title){toast('Enter a title.');return;}
  if(PS.listings.some(l=>l.title===title)){toast('A listing with that title already exists.');return;}
  try{
    const saved=await sbInsert('product_listings',{title});
    PS.listings.push(saved[0]);
    closeModal('newlisting-modal');
    PS.currentTitle=title;
    PS.currentListing=saved[0];
    PS.variants=[];
    PS.draft=null;
    PS.sharedSettings=defaultSharedSettings();
    PS.expandedId=null;
    PS.newVariantCounter=0;
    if(PS.newIsPreloved){
      const cat=prelovedCategory();
      PS.sharedSettings.category_id=cat?cat.id:null;
      PS.sharedSettings.low_stock_threshold=0;
      toast('✓ Preloved item started. Fill in the details below.');
      addNewVariant(); // opens the first variant right away
    }else{
      toast('✓ Listing created. Now add your first variant.');
      renderListingDetail();
    }
  }catch(e){toast('Error: '+e.message);}
}

/* The shared settings as saved: weight goes to every variant only when a number was typed (empty = leave as is) */
function weightPatch(sh){
  const o=Object.assign({},sh);
  if(o.weight_g==null){delete o.weight_g;}else{o.weight_kg=Math.round(o.weight_g)/1000;}
  return o;
}
function defaultSharedSettings(){
  return {category_id:null,location:'studio',unit_cost:0,ribbon_text:null,low_stock_threshold:5};
}
function deriveSharedSettings(variants){
  if(!variants.length)return defaultSharedSettings();
  const first=variants[0];
  // weight is shown only when every variant weighs the same (otherwise the box stays empty and nothing is overwritten)
  const ws=[...new Set(variants.filter(v=>!v._isNew).map(v=>Number(v.weight_g)||0))];
  return {
    weight_g:ws.length===1&&ws[0]>0?ws[0]:null,
    category_id:first.category_id||null,
    location:first.location||'studio',
    unit_cost:first.unit_cost||0,
    ribbon_text:first.ribbon_text||null,
    low_stock_threshold:first.low_stock_threshold!=null?first.low_stock_threshold:5
  };
}

function blankListing(title){
  return {title,cover_image_url:'',image_1:'',image_2:'',image_3:'',image_4:'',image_5:'',
    image_6:'',image_7:'',image_8:'',image_9:'',short_description:'',long_description:'',
    subsection_1_title:'',subsection_1_body:'',subsection_2_title:'',subsection_2_body:'',
    subsection_3_title:'',subsection_3_body:'',subsection_4_title:'',subsection_4_body:'',
    subsection_5_title:'',subsection_5_body:''};
}

function openListingDetail(idx){
  const [title,skusArr]=PS.groups[idx];
  PS.currentTitle=title;
  PS.currentListing=PS.listings.find(l=>l.title===title)||blankListing(title);
  PS.variants=skusArr.map(s=>({
    ...s,
    photo_url:PS.photoMap[s.id]||'',
    _recipeRows:PS.recipesAll.filter(r=>r.finished_sku_id===s.id),
    _isNew:false
  }));
  PS.draft=null;
  PS.ws=(PS.tiers||[]).filter(t=>t.product_name===title).map(t=>({id:t.id,variant:t.variant||'',min_qty:t.min_qty,unit_price:Number(t.unit_price)}));
  PS.wsGone=[];
  PS.sharedSettings=deriveSharedSettings(PS.variants);
  PS.expandedId=null;
  PS.newVariantCounter=0;
  renderListingDetail();
}

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCT PAGE: GENERAL + VARIANTS
   ═══════════════════════════════════════════════════════════════════════ */

/* Reads whatever is currently typed in the General card (saved or not). */
function readGeneralFromDom(){
  const listing={
    title:$('pl-title').value,
    slug:$('pl-slug')?$('pl-slug').value:'',
    cover_image_url:$('pl-cover').value,
    short_description:$('pl-short').value,
    long_description:$('pl-long').value
  };
  for(let n=1;n<=9;n++)listing['image_'+n]=$('pl-image-'+n).value;
  for(let n=1;n<=5;n++){
    listing['subsection_'+n+'_title']=$('pl-sub'+n+'-title').value;
    listing['subsection_'+n+'_body']=$('pl-sub'+n+'-body').value;
  }
  const th=parseInt($('ls-threshold').value);
  const wv=$('ls-weight')?parseInt($('ls-weight').value):NaN;
  const shared={
    weight_g:isNaN(wv)||wv<0?null:wv,
    category_id:$('ls-cat').value||null,
    location:$('ls-loc').value,
    unit_cost:parseFloat($('ls-cost').value)||0,
    low_stock_threshold:isNaN(th)?5:th,
    ribbon_text:$('ls-ribbon').value.trim()||null
  };
  return {listing,shared};
}

function renderListingDetail(){
  wsRead();
  // Keep anything typed but not yet saved in the General card when the page redraws
  if($('pl-title'))PS.draft=readGeneralFromDom();
  const l=Object.assign({},PS.currentListing,PS.draft?PS.draft.listing:{});
  const s=PS.draft?PS.draft.shared:PS.sharedSettings;
  const cats=PS.categories||[];

  let html=`<button class="pl-back" onclick="renderProductsList()">← Back to Products</button>`;
  html+=`<div class="card">
    <div class="card-title">📝 General <span class="t-muted" style="font-size:11px;font-weight:400">(applies to every variant of this product)</span></div>
    <label class="lbl">Title</label>
    <input class="inp" id="pl-title" value="${attrEsc(l.title)}">
    <p class="t-muted" style="font-size:11px;margin:-8px 0 12px">Renaming this updates all ${PS.variants.length} variant(s) under it automatically.</p>
    <label class="lbl">Web Address (page URL)</label>
    <input class="inp" id="pl-slug" value="${attrEsc(l.slug)}" placeholder="e.g. bamboo-cup" oninput="this.value=cleanSlug(this.value,true)">
    <p class="t-muted" style="font-size:11px;margin:-8px 0 12px">Customers will see: <strong>${location.host}/<span id="pl-slug-preview">${attrEsc(l.slug)||'your-product'}</span></strong>. Use lowercase letters, numbers and hyphens. Changing it later breaks links you already shared, so set it once.</p>
    <label class="lbl">Cover Photo URL</label>
    <input class="inp" id="pl-cover" value="${attrEsc(l.cover_image_url)}" placeholder="Paste a photo URL">
    <label class="lbl">Additional Photos (up to 9)</label>
    <div class="photo-grid" style="margin-bottom:12px">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<input class="inp" id="pl-image-${n}" placeholder="Photo ${n} URL" value="${attrEsc(l['image_'+n])}">`).join('')}
    </div>
    <label class="lbl">Short Description <span class="t-muted">(shown on the shop grid card)</span></label>
    <textarea class="inp" id="pl-short">${l.short_description||''}</textarea>
    <label class="lbl">Long Description <span class="t-muted">(shown on the product page)</span></label>
    <textarea class="inp" id="pl-long" rows="4">${l.long_description||''}</textarea>
    ${[1,2,3,4,5].map(n=>`
      <label class="lbl">Subsection ${n} Title</label>
      <input class="inp" id="pl-sub${n}-title" value="${attrEsc(l['subsection_'+n+'_title'])}" placeholder="e.g. Use and Care">
      <label class="lbl">Subsection ${n} Body</label>
      <textarea class="inp" id="pl-sub${n}-body">${l['subsection_'+n+'_body']||''}</textarea>
    `).join('')}
    <div class="field-row field-row-2">
      <div><label class="lbl">Category</label>
        <select class="inp" id="ls-cat"><option value="">— None —</option>
          ${cats.map(c=>`<option value="${c.id}" ${s.category_id===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select></div>
      <div><label class="lbl">Location</label>
        <select class="inp" id="ls-loc">
          <option value="studio" ${s.location==='studio'?'selected':''}>Studio</option>
          <option value="warehouse" ${s.location==='warehouse'?'selected':''}>Warehouse</option>
        </select></div>
    </div>
    <div class="field-row field-row-2">
      <div><label class="lbl">Unit Cost (₱)</label><input class="inp" type="number" step="0.01" id="ls-cost" value="${s.unit_cost||0}"></div>
      <div><label class="lbl">Low Stock Threshold</label><input class="inp" type="number" id="ls-threshold" value="${s.low_stock_threshold!=null?s.low_stock_threshold:5}"></div>
    </div>
    <label class="lbl">Weight per piece (grams)</label>
    <input class="inp" type="number" min="0" step="1" id="ls-weight" value="${s.weight_g!=null?s.weight_g:''}" placeholder="${(PS.variants||[]).length>1&&s.weight_g==null&&(PS.variants||[]).some(v=>Number(v.weight_g)>0)?'Weights differ by variant. Type a number to set all':'e.g. 120'}">
    <p class="t-muted" style="font-size:11px;margin:-8px 0 12px">Used to work out shipping on shop and partner orders. Leave it empty to keep the weights as they are.</p>
    <label class="lbl">Ribbon Text</label>
    <input class="inp" id="ls-ribbon" value="${attrEsc(s.ribbon_text)}" placeholder="e.g. Bestseller, New Arrival">
    <label class="lbl">Wholesale prices (partners)</label>
    <div id="ws-box">${wsHtml()}</div>
    <button class="btn btn-p" id="gen-save-btn" style="margin-top:4px" onclick="saveGeneral()">Save General</button>
    <p class="t-muted" style="font-size:11px;margin-top:8px">${PS.variants.filter(v=>!v._isNew).length} existing variant(s) will get the Category, Location, Unit Cost, Low Stock Threshold and Ribbon Text above. Variants you add later start with these values too.</p>
  </div>`;

  html+=`<div class="card"><div class="card-title">🎨 Variants (${PS.variants.length})</div>`;
  PS.variants.forEach(v=>{html+=variantAccordionHtml(v);});
  html+=`<button class="btn btn-g btn-block" onclick="addNewVariant()">+ Add Variant</button></div>`;

  $('body').innerHTML=html;
}

/* ─── Wholesale prices (partner price tiers) for this product ─── */
function wsHtml(){
  const rows=(PS.ws||[]).map((r,i)=>`<div class="ws-row">
      <input class="inp" id="ws-qty-${i}" type="number" min="1" step="1" value="${r.min_qty!==''&&r.min_qty!=null?r.min_qty:''}" placeholder="From qty">
      <input class="inp" id="ws-price-${i}" type="number" min="0" step="0.01" value="${r.unit_price!==''&&r.unit_price!=null?r.unit_price:''}" placeholder="₱ each">
      <input class="inp" id="ws-var-${i}" value="${attrEsc(r.variant||'')}" placeholder="All variants">
      <button class="btn btn-g btn-sm" title="Remove" onclick="wsRemove(${i})">✕</button></div>`).join('');
  return `<p class="t-muted" style="font-size:11px;margin:0 0 8px">Price per piece once a partner orders at least the quantity shown. Add one row per price level. Leave the last box empty so it applies to every variant, or type a variant name (use % as a wildcard, for example %with Pouch). Partners order below the first level at the normal price. Click Save General to keep your changes.</p>
    ${rows?`<div class="ws-row ws-head"><span>From qty</span><span>₱ each</span><span>Variant (optional)</span><span></span></div>${rows}`:'<p class="t-muted" style="font-size:12.5px;margin:0 0 8px">No wholesale prices for this product yet.</p>'}
    <button class="btn btn-g btn-sm" onclick="wsAdd()">+ Add price level</button>`;
}
function wsRead(){
  if(!PS.ws||!$('ws-box'))return;
  PS.ws.forEach((r,i)=>{
    const q=$('ws-qty-'+i);if(!q)return;
    r.min_qty=q.value;r.unit_price=$('ws-price-'+i).value;r.variant=$('ws-var-'+i).value;
  });
}
function wsAdd(){wsRead();PS.ws.push({id:null,variant:'',min_qty:'',unit_price:''});$('ws-box').innerHTML=wsHtml();}
function wsRemove(i){wsRead();const r=PS.ws.splice(i,1)[0];if(r&&r.id)PS.wsGone.push(r.id);$('ws-box').innerHTML=wsHtml();}
/* Saves the wholesale rows. Returns an error text, or '' when fine. */
function wsValidate(){
  wsRead();const seen=new Set();
  for(const r of PS.ws){
    const q=Number(r.min_qty),p=Number(r.unit_price);
    if(!Number.isInteger(q)||q<1)return 'Each wholesale row needs a whole-number "From qty" of 1 or more.';
    if(r.unit_price===''||!(p>=0))return 'Each wholesale row needs a price.';
    const k=q+'|'+String(r.variant||'').trim().toLowerCase();
    if(seen.has(k))return 'Two wholesale rows have the same quantity and variant.';
    seen.add(k);
  }
  return '';
}
async function wsSave(oldTitle,newTitle){
  if(oldTitle!==newTitle){
    const r=await fetch(`${SB_URL}/rest/v1/mcc_partner_price_tiers?product_name=eq.${encodeURIComponent(oldTitle)}`,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({product_name:newTitle})});
    if(!r.ok)throw new Error('Saved, but the wholesale prices could not follow the new title.');
    (PS.tiers||[]).forEach(t=>{if(t.product_name===oldTitle)t.product_name=newTitle;});
  }
  // Partner sets list their contents by product name, so they follow a rename too
  if(oldTitle!==newTitle){
    const sets=await sbGet('mcc_partner_sets','select=set_key,contents');
    for(const st of sets){
      const list=Array.isArray(st.contents)?st.contents:[];
      if(!list.some(c=>c.product_name===oldTitle))continue;
      const fixed=list.map(c=>c.product_name===oldTitle?{...c,product_name:newTitle}:c);
      const r=await fetch(`${SB_URL}/rest/v1/mcc_partner_sets?set_key=eq.${encodeURIComponent(st.set_key)}`,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({contents:fixed})});
      if(!r.ok)throw new Error('Saved, but the partner sets could not follow the new title.');
    }
  }
  for(const id of PS.wsGone||[])await sbDelete('mcc_partner_price_tiers','id=eq.'+id);
  PS.tiers=(PS.tiers||[]).filter(t=>!(PS.wsGone||[]).includes(t.id));PS.wsGone=[];
  for(const r of PS.ws){
    const row={product_name:newTitle,variant:String(r.variant||'').trim()||null,min_qty:Number(r.min_qty),unit_price:Number(r.unit_price)};
    if(r.id){await sbUpdate('mcc_partner_price_tiers',r.id,row);const t=PS.tiers.find(x=>x.id===r.id);if(t)Object.assign(t,row);}
    else{const saved=await sbInsert('mcc_partner_price_tiers',row);r.id=saved[0].id;PS.tiers.push(saved[0]);}
  }
}

const RESERVED_SLUGS=['admin','account','checkout','preloved','hotel-portal','partner-portal','hotel-partner-program','partner-program','privacy','api','partials','sql','index','robots','sitemap','favicon'];
/* Turns anything typed into a clean web address: lowercase letters, numbers and single hyphens */
function cleanSlug(v,keepTrailing){
  let t=String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+/,'');
  if(!keepTrailing)t=t.replace(/-+$/,'');
  const pv=document.getElementById('pl-slug-preview');
  if(pv)pv.textContent=t.replace(/-+$/,'')||'your-product';
  return t;
}
async function saveGeneral(){
  const oldTitle=PS.currentTitle;
  const dom=readGeneralFromDom();
  const newTitle=dom.listing.title.trim();
  if(!newTitle){toast('Title is required.');return;}
  if(newTitle!==oldTitle && PS.listings.some(l=>l.title===newTitle && l!==PS.currentListing)){
    toast('Another listing already has that title.');return;
  }
  const slug=cleanSlug(dom.listing.slug,false);
  if(slug){
    if(RESERVED_SLUGS.includes(slug)){toast('"'+slug+'" is reserved for the website. Please pick another web address.');return;}
    if(PS.listings.some(l=>l.slug===slug && l!==PS.currentListing)){toast('Another product already uses that web address.');return;}
  }
  const payload={
    title:newTitle,
    cover_image_url:dom.listing.cover_image_url.trim()||null,
    short_description:dom.listing.short_description.trim()||null,
    long_description:dom.listing.long_description.trim()||null
  };
  if(slug)payload.slug=slug;
  for(let n=1;n<=9;n++)payload['image_'+n]=dom.listing['image_'+n].trim()||null;
  for(let n=1;n<=5;n++){
    payload['subsection_'+n+'_title']=dom.listing['subsection_'+n+'_title'].trim()||null;
    payload['subsection_'+n+'_body']=dom.listing['subsection_'+n+'_body'].trim()||null;
  }
  const shared=dom.shared;
  const wsErr=wsValidate();if(wsErr){toast(wsErr);return;}

  const btn=$('gen-save-btn');
  const orig=btn?btn.textContent:null;
  if(btn){btn.textContent='Saving...';btn.disabled=true;}
  try{
    // 1. Listing content
    if(PS.currentListing.id){
      await sbUpdate('product_listings',PS.currentListing.id,payload);
    }else{
      const saved=await sbInsert('product_listings',payload);
      PS.currentListing=saved[0];
      PS.listings.push(saved[0]);
    }
    // 2. Rename every variant if the title changed
    if(newTitle!==oldTitle){
      const r=await fetch(`${SB_URL}/rest/v1/skus?product_name=eq.${encodeURIComponent(oldTitle)}`,{
        method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({product_name:newTitle})
      });
      if(!r.ok)throw new Error('Listing saved, but renaming the variants failed. Check Supabase.');
      PS.currentTitle=newTitle;
      PS.variants.forEach(v=>v.product_name=newTitle);
      PS.allSkus.forEach(s=>{if(s.product_name===oldTitle)s.product_name=newTitle;});
      if(PS.photoMap){/* photos are keyed by sku id, nothing to rename */}
    }
    // 3. Shared settings go to every existing variant
    const existing=PS.variants.filter(v=>!v._isNew);
    if(existing.length){
      const r=await fetch(`${SB_URL}/rest/v1/skus?product_name=eq.${encodeURIComponent(newTitle)}`,{
        method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify(weightPatch(shared))
      });
      if(!r.ok)throw new Error(await r.text());
    }
    // 4. Wholesale prices
    await wsSave(oldTitle,newTitle);
    PS.sharedSettings=shared;
    PS.draft=null;
    PS.variants.forEach(v=>Object.assign(v,weightPatch(shared)));
    PS.allSkus.forEach(s=>{if(s.product_name===newTitle)Object.assign(s,weightPatch(shared));});
    Object.assign(PS.currentListing,payload);
    toast('✓ General saved!');
  }catch(e){
    if(/subsection_5/.test(e.message||'')){
      toast('Subsection 5 is not set up in Supabase yet. Run the SQL line first, then try again.',6000);
    }else toast('Error: '+e.message);
  }
  finally{if(btn){btn.textContent=orig;btn.disabled=false;}}
}

/* ─── Variants ─── */
function variantAccordionHtml(v){
  const key=v.id||v._tempId;
  const open=PS.expandedId===key;
  const low=v.current_stock<=v.low_stock_threshold;
  return `<div class="variant-acc">
    <div class="variant-acc-hdr" onclick="toggleVariantAcc('${key}')">
      <div>
        <div class="variant-acc-title">${v.variant||v.sku_code||'(unsaved variant)'}${v._isNew?' <span class="t-muted">(new)</span>':''}${v.is_active===false?' <span class="t-muted">(inactive)</span>':''}</div>
        <div class="variant-acc-sub">${v.sku_code||'no SKU yet'} · ${v.retail_price_direct!=null?P(v.retail_price_direct):'no price'} · Stock: <span class="${low?'stock-low':''}" id="vsub-stock-${key}">${v.current_stock}</span>${v.web_status==='hidden'?' · <span class="t-muted">Hidden on website</span>':v.web_status==='unavailable'?' · <span class="t-muted">Unavailable on website</span>':''}</div>
      </div>
      <span class="variant-acc-arrow ${open?'open':''}">▼</span>
    </div>
    <div class="variant-acc-body ${open?'open':''}" id="vbody-${key}">
      ${open?variantFormHtml(v,key):''}
    </div>
  </div>`;
}

function recipeRowHtml(key,ri,row){
  const rawOptions=PS.allSkus.map(s=>`<option value="${s.id}" ${row&&row.raw_material_sku_id===s.id?'selected':''}>${s.sku_code} — ${s.product_name}${s.variant?' ('+s.variant+')':''}</option>`).join('');
  return `<div class="recipe-row" id="v-recipe-row-${key}-${ri}">
    <div><label class="lbl">Raw Material</label><select class="inp raw-sel"><option value="">Select...</option>${rawOptions}</select></div>
    <div><label class="lbl">Qty Used</label><input class="inp raw-qty" type="number" value="${row?row.raw_qty_consumed:1}" min="1"></div>
    <button class="rm-btn" type="button" onclick="document.getElementById('v-recipe-row-${key}-${ri}').remove()">✕</button>
  </div>`;
}

function variantFormHtml(v,key){
  const hasRecipe=v._recipeRows&&v._recipeRows.length>0;
  return `
    <label class="lbl">Variant Name</label>
    <input class="inp" id="v-variant-${key}" value="${attrEsc(v.variant)}">
    <label class="lbl">SKU Code ${v._isNew?'*':''}</label>
    <input class="inp" id="v-sku-${key}" value="${attrEsc(v.sku_code)}" ${v._isNew?'':'readonly style="background:var(--pearl)"'}>
    ${stockBlockHtml(v,key)}
    <div class="field-row field-row-2">
      <div><label class="lbl">Price – Direct (₱)</label><input class="inp" type="number" step="0.01" id="v-pricedirect-${key}" value="${v.retail_price_direct!=null?v.retail_price_direct:''}"></div>
      <div><label class="lbl">Price – Shopee (₱)</label><input class="inp" type="number" step="0.01" id="v-priceshopee-${key}" value="${v.retail_price_shopee!=null?v.retail_price_shopee:''}"></div>
    </div>
    <div class="check-row"><input type="checkbox" id="v-onsale-${key}" ${v.is_on_sale?'checked':''}><label for="v-onsale-${key}">On Sale</label></div>
    <label class="lbl">Sale Price (₱)</label>
    <input class="inp" type="number" step="0.01" id="v-saleprice-${key}" value="${v.sale_price!=null?v.sale_price:''}">
    <label class="lbl">Photo URL <span class="t-muted">(this specific variant)</span></label>
    <input class="inp" id="v-photo-${key}" value="${attrEsc(v.photo_url)}" placeholder="Paste a photo URL">
    <label class="lbl">Supplier/Source</label>
    <input class="inp" id="v-supplier-${key}" value="${attrEsc(v.supplier_source)}">
    <label class="lbl">Notes</label>
    <textarea class="inp" id="v-notes-${key}">${v.notes||''}</textarea>
    <label class="lbl">On the website</label>
    <select class="inp" id="v-web-${key}">
      <option value="shown" ${(v.web_status||'shown')==='shown'?'selected':''}>Shown (customers can buy it)</option>
      <option value="unavailable" ${v.web_status==='unavailable'?'selected':''}>Unavailable (customers see it grayed out, even though you have stock)</option>
      <option value="hidden" ${v.web_status==='hidden'?'selected':''}>Hidden (customers do not see it at all)</option>
    </select>
    <div class="check-row"><input type="checkbox" id="v-active-${key}" ${v.is_active!==false?'checked':''}><label for="v-active-${key}">Active <span class="t-muted">(untick only to retire this item for good)</span></label></div>

    <div class="check-row"><input type="checkbox" id="v-hasrecipe-${key}" onchange="toggleVariantRecipe('${key}')" ${hasRecipe?'checked':''}><label for="v-hasrecipe-${key}">This variant is cut/assembled from raw materials</label></div>
    <div id="v-recipe-section-${key}" style="display:${hasRecipe?'block':'none'}">
      <label class="lbl">Yield Quantity <span class="t-muted">(units produced per cut/assembly)</span></label>
      <input class="inp" type="number" id="v-yield-${key}" value="${hasRecipe?v._recipeRows[0].yield_qty:1}">
      <label class="lbl">Raw Materials</label>
      <div id="v-recipe-rows-${key}">
        ${(v._recipeRows||[]).map((r,ri)=>recipeRowHtml(key,ri,r)).join('')}
      </div>
      <button class="btn btn-o btn-sm" type="button" onclick="addVariantRecipeRow('${key}')">+ Add Raw Material</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-p" onclick="saveVariant('${key}')">Save Variant</button>
      ${!v._isNew?`<button class="btn btn-danger btn-sm" onclick="deactivateVariant('${key}')">Deactivate</button>`:''}
    </div>
  `;
}

function toggleVariantAcc(key){
  PS.expandedId=PS.expandedId===key?null:key;
  renderListingDetail();
}
function toggleVariantRecipe(key){
  const checked=$('v-hasrecipe-'+key).checked;
  $('v-recipe-section-'+key).style.display=checked?'block':'none';
}
let recipeRowCounter=0;
function addVariantRecipeRow(key){
  recipeRowCounter++;
  $('v-recipe-rows-'+key).insertAdjacentHTML('beforeend',recipeRowHtml(key,'new'+recipeRowCounter,null));
}

/* Next free Preloved SKU code: PRE-001, PRE-002, ... */
function nextPrelovedSku(){
  let max=0;
  [...(PS.allSkus||[]),...PS.variants].forEach(x=>{
    const m=/^PRE-(\d+)$/i.exec(x.sku_code||'');
    if(m)max=Math.max(max,parseInt(m[1],10));
  });
  return 'PRE-'+String(max+1).padStart(3,'0');
}

function addNewVariant(){
  const s=$('ls-cat')?readGeneralFromDom().shared:(PS.sharedSettings||defaultSharedSettings());
  const pre=isPrelovedCatId(s.category_id);
  PS.newVariantCounter++;
  const tempId='newv'+PS.newVariantCounter;
  PS.variants.push({
    id:null,_tempId:tempId,_isNew:true,product_name:PS.currentTitle,
    sku_code:pre?nextPrelovedSku():'',variant:'',category_id:s.category_id,location:s.location,unit_cost:s.unit_cost,
    current_stock:pre?1:0,retail_price_direct:null,retail_price_shopee:null,
    is_on_sale:false,sale_price:null,ribbon_text:s.ribbon_text,low_stock_threshold:s.low_stock_threshold,weight_g:s.weight_g!=null?s.weight_g:0,
    supplier_source:null,notes:null,is_active:true,web_status:'shown',photo_url:'',_recipeRows:[]
  });
  PS.expandedId=tempId;
  renderListingDetail();
}

async function upsertVariantPhoto(skuId,url){
  const r=await fetch(`${SB_URL}/rest/v1/variant_photos?on_conflict=sku_id`,{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),
    body:JSON.stringify({sku_id:skuId,photo_url:url||null})
  });
  if(!r.ok)throw new Error('Photo save failed: '+(await r.text()));
}

/* ─── STOCK: "New stock in" and "Correction" ───
   Existing variants show their stock as a number plus two buttons. Each button saves right away, with its own
   date, as a dated record. Saving the variant never overwrites the stock number. */
function stockBlockHtml(v,key){
  const today=todayPH();
  if(v._isNew){
    return `<label class="lbl">Starting stock</label>
    <input class="inp" type="number" id="v-stock-${key}" value="${v.current_stock||0}">
    <label class="lbl">Date received <span class="t-muted">(when this stock came in)</span></label>
    <input class="inp" type="date" id="v-stockdate-${key}" value="${today}" max="${today}">`;
  }
  const panel='background:var(--pearl);border-radius:10px;padding:10px 12px;margin:6px 0 12px;display:none';
  return `<label class="lbl">Current Stock</label>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:2px 0 8px">
      <span id="v-stockshown-${key}" style="font-size:22px;font-weight:700;min-width:36px">${v.current_stock||0}</span>
      <button class="btn btn-o btn-sm" type="button" onclick="showStockPanel('${key}','in')">+ New stock in</button>
      <button class="btn btn-o btn-sm" type="button" onclick="showStockPanel('${key}','fix')">Correction</button>
    </div>
    <div id="v-stockpanel-in-${key}" style="${panel}">
      <div class="t-muted" style="font-size:12px;margin-bottom:6px">How many new pieces arrived? They are added to your stock.</div>
      <label class="lbl">Quantity received</label><input class="inp" type="number" min="1" id="v-in-qty-${key}" placeholder="e.g. 50">
      <label class="lbl">Date received</label><input class="inp" type="date" id="v-in-date-${key}" value="${today}" max="${today}">
      <label class="lbl">Note <span class="t-muted">(optional, e.g. supplier)</span></label><input class="inp" id="v-in-note-${key}">
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p btn-sm" type="button" onclick="applyStockIn('${key}')">Add stock</button><button class="btn btn-o btn-sm" type="button" onclick="showStockPanel('${key}','')">Cancel</button></div>
    </div>
    <div id="v-stockpanel-fix-${key}" style="${panel}">
      <div class="t-muted" style="font-size:12px;margin-bottom:6px">Type the number you actually counted. The difference is recorded as a correction.</div>
      <label class="lbl">Counted number</label><input class="inp" type="number" min="0" id="v-fix-qty-${key}" placeholder="the real count">
      <label class="lbl">Date</label><input class="inp" type="date" id="v-fix-date-${key}" value="${today}" max="${today}">
      <label class="lbl">Reason</label>
      <select class="inp" id="v-fix-reason-${key}"><option>Miscount</option><option>Damaged</option><option>Lost</option><option>Found extra</option><option>Other</option></select>
      <label class="lbl">Note <span class="t-muted">(optional)</span></label><input class="inp" id="v-fix-note-${key}">
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p btn-sm" type="button" onclick="applyStockCorrection('${key}')">Apply correction</button><button class="btn btn-o btn-sm" type="button" onclick="showStockPanel('${key}','')">Cancel</button></div>
    </div>`;
}
function showStockPanel(key,which){
  const a=$('v-stockpanel-in-'+key),b=$('v-stockpanel-fix-'+key);
  if(a)a.style.display=which==='in'?'block':'none';
  if(b)b.style.display=which==='fix'?'block':'none';
}
async function refreshVariantStock(v,key){
  const f=await sbGet('skus',`id=eq.${v.id}&select=current_stock`);
  if(f[0])v.current_stock=f[0].current_stock;
  const sk=PS.allSkus.find(s=>s.id===v.id);if(sk)sk.current_stock=v.current_stock;
  const a=$('v-stockshown-'+key);if(a)a.textContent=v.current_stock;
  const b=$('vsub-stock-'+key);if(b)b.textContent=v.current_stock;
}
async function applyStockIn(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v||!v.id)return;
  const qty=parseInt($('v-in-qty-'+key).value);
  const date=$('v-in-date-'+key).value||todayPH();
  const note=$('v-in-note-'+key).value.trim();
  if(!(qty>0)){toast('Enter how many pieces arrived (a number above 0).');return;}
  if(date>todayPH()){toast('The date cannot be in the future.');return;}
  try{
    await sbRpc('apply_inventory_adjustment',{p_sku_id:v.id,p_txn_type:'restock',p_quantity_change:qty,
      p_notes:'New stock in'+(note?': '+note:''),p_created_by:CURRENT_USER.id,p_stock_date:date});
    await refreshVariantStock(v,key);
    showStockPanel(key,'');
    $('v-in-qty-'+key).value='';$('v-in-note-'+key).value='';
    toast('✓ Added '+qty+' to stock, dated '+fmtDay(date));
  }catch(e){toast('Could not add stock: '+e.message);}
}
async function applyStockCorrection(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v||!v.id)return;
  const counted=parseInt($('v-fix-qty-'+key).value);
  const date=$('v-fix-date-'+key).value||todayPH();
  const reason=$('v-fix-reason-'+key).value;
  const note=$('v-fix-note-'+key).value.trim();
  if(isNaN(counted)||counted<0){toast('Type the number you counted (0 or more).');return;}
  if(date>todayPH()){toast('The date cannot be in the future.');return;}
  try{
    const f=await sbGet('skus',`id=eq.${v.id}&select=current_stock`);   // the real number right now
    const now=f[0]?f[0].current_stock:v.current_stock;
    const diff=counted-now;
    if(diff===0){toast('Your count matches the current stock. Nothing to correct.');return;}
    await sbRpc('apply_inventory_adjustment',{p_sku_id:v.id,p_txn_type:'adjustment_other',p_quantity_change:diff,
      p_notes:`Correction (${reason}): count ${now} to ${counted}`+(note?'. '+note:''),p_created_by:CURRENT_USER.id,p_stock_date:date});
    await refreshVariantStock(v,key);
    showStockPanel(key,'');
    $('v-fix-qty-'+key).value='';$('v-fix-note-'+key).value='';
    toast('✓ Stock corrected from '+now+' to '+counted+' ('+(diff>0?'+':'')+diff+'), dated '+fmtDay(date));
  }catch(e){toast('Could not correct stock: '+e.message);}
}

async function saveVariant(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v)return;
  const skuCode=$('v-sku-'+key).value.trim();
  if(!skuCode){toast('SKU Code is required.');return;}
  const priceDirect=$('v-pricedirect-'+key).value;
  const priceShopee=$('v-priceshopee-'+key).value;
  const onSale=$('v-onsale-'+key).checked;
  const salePrice=$('v-saleprice-'+key).value;
  if(onSale && !salePrice){toast('Enter a Sale Price, or untick On Sale.');return;}
  const receivedOn=v._isNew?($('v-stockdate-'+key).value||todayPH()):todayPH();
  if(receivedOn>todayPH()){toast('Date received cannot be in the future.');return;}
  // Use what is currently shown in General, so a category you just picked is not lost
  const shared=$('ls-cat')?readGeneralFromDom().shared:(PS.sharedSettings||defaultSharedSettings());
  const payload={
    sku_code:skuCode,
    product_name:PS.currentTitle,
    variant:$('v-variant-'+key).value.trim()||null,
    category_id:shared.category_id,
    location:shared.location,
    unit_cost:shared.unit_cost,
    retail_price_direct:priceDirect?parseFloat(priceDirect):null,
    retail_price_shopee:priceShopee?parseFloat(priceShopee):null,
    is_on_sale:onSale,
    sale_price:salePrice?parseFloat(salePrice):null,
    ribbon_text:shared.ribbon_text,
    low_stock_threshold:shared.low_stock_threshold,
    ...(shared.weight_g!=null?{weight_g:shared.weight_g,weight_kg:shared.weight_g/1000}:{}),
    supplier_source:$('v-supplier-'+key).value.trim()||null,
    notes:$('v-notes-'+key).value.trim()||null,
    is_active:$('v-active-'+key).checked,
    web_status:$('v-web-'+key).value,
    is_sellable:!!(priceDirect||priceShopee)
  };
  // Stock is never written from this form for an existing variant: use New stock in / Correction.
  // (A brand new variant starts with the stock typed here, recorded as stock in.)
  if(v._isNew)payload.current_stock=parseInt($('v-stock-'+key).value)||0;
  const photoUrl=$('v-photo-'+key).value.trim();
  const hasRecipe=$('v-hasrecipe-'+key).checked;
  const yieldQty=hasRecipe?(parseInt($('v-yield-'+key).value)||1):1;
  const recipeRowEls=hasRecipe?[...document.querySelectorAll('#v-recipe-rows-'+key+' .recipe-row')].map(row=>({
    rawId: row.querySelector('.raw-sel').value,
    rawQty: parseInt(row.querySelector('.raw-qty').value)||1
  })):[];

  try{
    let savedId;
    if(v._isNew){
      const saved=await sbInsert('skus',payload);
      savedId=saved[0].id;
    }else{
      await sbUpdate('skus',v.id,payload);
      savedId=v.id;
    }
    // A new variant's starting stock is recorded as "New stock in" on the date chosen
    if(v._isNew&&payload.current_stock>0){
      try{
        await sbInsert('inventory_transactions',{
          sku_id:savedId,txn_type:'restock',quantity_change:payload.current_stock,
          location:payload.location,notes:'New stock in: starting stock of a new product',stock_date:receivedOn
        });
      }catch(e){toast('Saved, but the stock date could not be recorded: '+e.message);}
    }
    Object.assign(v,payload,{id:savedId,_isNew:false});

    await upsertVariantPhoto(savedId,photoUrl);
    v.photo_url=photoUrl;

    await sbDelete('product_recipes',`finished_sku_id=eq.${savedId}`);
    let newRecipeRows=[];
    if(hasRecipe){
      for(const {rawId,rawQty} of recipeRowEls){
        if(rawId){
          await sbInsert('product_recipes',{finished_sku_id:savedId,raw_material_sku_id:rawId,yield_qty:yieldQty,raw_qty_consumed:rawQty});
          newRecipeRows.push({raw_material_sku_id:rawId,yield_qty:yieldQty,raw_qty_consumed:rawQty});
        }
      }
    }
    v._recipeRows=newRecipeRows;

    // Refresh the master lists so other variants' raw-material pickers (and the next PRE- code) see this one too
    const inAll=PS.allSkus.find(s=>s.id===savedId);
    if(inAll)Object.assign(inAll,payload);
    else PS.allSkus.push({...v});

    toast('✓ Variant saved!');
    renderListingDetail();
  }catch(e){
    toast('Error: '+e.message);
  }
}

async function deactivateVariant(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v||!v.id)return;
  if(!confirm('Deactivate this variant? It disappears from the shop but stays in your records.'))return;
  try{
    await sbUpdate('skus',v.id,{is_active:false,is_sellable:false});
    v.is_active=false;v.is_sellable=false;
    toast('✓ Deactivated.');
    renderListingDetail();
  }catch(e){toast('Error: '+e.message);}
}
