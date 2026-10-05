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
    const [listings,skus,photos,recipes,cats]=await Promise.all([
      sbGet('product_listings','select=*'),
      sbGet('skus','select=*,categories(id,name)&order=product_name.asc'),
      sbGet('variant_photos','select=sku_id,photo_url'),
      sbGet('product_recipes','select=*'),
      sbGet('categories','select=*&order=display_order.asc')
    ]);
    PS.listings=listings;PS.allSkus=skus;PS.categories=cats;PS.recipesAll=recipes;
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
  let html=`<div class="card"><div class="card-title">🗂️ All Products</div>
    <p class="t-muted" style="font-size:13px;margin-bottom:12px">Everything here (photos, descriptions, prices, stock, recipes) is editable right from this screen. This is the only place to add or edit products.</p>
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
      html+=`<div class="listing-card" onclick="openListingDetail(${idx})">
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

function defaultSharedSettings(){
  return {category_id:null,location:'studio',unit_cost:0,ribbon_text:null,low_stock_threshold:5};
}
function deriveSharedSettings(variants){
  if(!variants.length)return defaultSharedSettings();
  const first=variants[0];
  return {
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
  const shared={
    category_id:$('ls-cat').value||null,
    location:$('ls-loc').value,
    unit_cost:parseFloat($('ls-cost').value)||0,
    low_stock_threshold:isNaN(th)?5:th,
    ribbon_text:$('ls-ribbon').value.trim()||null
  };
  return {listing,shared};
}

function renderListingDetail(){
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
    <label class="lbl">Ribbon Text</label>
    <input class="inp" id="ls-ribbon" value="${attrEsc(s.ribbon_text)}" placeholder="e.g. Bestseller, New Arrival">
    <button class="btn btn-p" id="gen-save-btn" style="margin-top:4px" onclick="saveGeneral()">Save General</button>
    <p class="t-muted" style="font-size:11px;margin-top:8px">${PS.variants.filter(v=>!v._isNew).length} existing variant(s) will get the Category, Location, Unit Cost, Low Stock Threshold and Ribbon Text above. Variants you add later start with these values too.</p>
  </div>`;

  html+=`<div class="card"><div class="card-title">🎨 Variants (${PS.variants.length})</div>`;
  PS.variants.forEach(v=>{html+=variantAccordionHtml(v);});
  html+=`<button class="btn btn-g btn-block" onclick="addNewVariant()">+ Add Variant</button></div>`;

  $('body').innerHTML=html;
}

async function saveGeneral(){
  const oldTitle=PS.currentTitle;
  const dom=readGeneralFromDom();
  const newTitle=dom.listing.title.trim();
  if(!newTitle){toast('Title is required.');return;}
  if(newTitle!==oldTitle && PS.listings.some(l=>l.title===newTitle && l!==PS.currentListing)){
    toast('Another listing already has that title.');return;
  }
  const payload={
    title:newTitle,
    cover_image_url:dom.listing.cover_image_url.trim()||null,
    short_description:dom.listing.short_description.trim()||null,
    long_description:dom.listing.long_description.trim()||null
  };
  for(let n=1;n<=9;n++)payload['image_'+n]=dom.listing['image_'+n].trim()||null;
  for(let n=1;n<=5;n++){
    payload['subsection_'+n+'_title']=dom.listing['subsection_'+n+'_title'].trim()||null;
    payload['subsection_'+n+'_body']=dom.listing['subsection_'+n+'_body'].trim()||null;
  }
  const shared=dom.shared;

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
        body:JSON.stringify(shared)
      });
      if(!r.ok)throw new Error(await r.text());
    }
    PS.sharedSettings=shared;
    PS.draft=null;
    PS.variants.forEach(v=>Object.assign(v,shared));
    PS.allSkus.forEach(s=>{if(s.product_name===newTitle)Object.assign(s,shared);});
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
        <div class="variant-acc-sub">${v.sku_code||'no SKU yet'} · ${v.retail_price_direct!=null?P(v.retail_price_direct):'no price'} · Stock: <span class="${low?'stock-low':''}">${v.current_stock}</span></div>
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
    <label class="lbl">Current Stock</label>
    <input class="inp" type="number" id="v-stock-${key}" value="${v.current_stock||0}">
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
    <div class="check-row"><input type="checkbox" id="v-active-${key}" ${v.is_active!==false?'checked':''}><label for="v-active-${key}">Active</label></div>

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
    is_on_sale:false,sale_price:null,ribbon_text:s.ribbon_text,low_stock_threshold:s.low_stock_threshold,
    supplier_source:null,notes:null,is_active:true,photo_url:'',_recipeRows:[]
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
  // Use what is currently shown in General, so a category you just picked is not lost
  const shared=$('ls-cat')?readGeneralFromDom().shared:(PS.sharedSettings||defaultSharedSettings());
  const payload={
    sku_code:skuCode,
    product_name:PS.currentTitle,
    variant:$('v-variant-'+key).value.trim()||null,
    category_id:shared.category_id,
    location:shared.location,
    unit_cost:shared.unit_cost,
    current_stock:parseInt($('v-stock-'+key).value)||0,
    retail_price_direct:priceDirect?parseFloat(priceDirect):null,
    retail_price_shopee:priceShopee?parseFloat(priceShopee):null,
    is_on_sale:onSale,
    sale_price:salePrice?parseFloat(salePrice):null,
    ribbon_text:shared.ribbon_text,
    low_stock_threshold:shared.low_stock_threshold,
    supplier_source:$('v-supplier-'+key).value.trim()||null,
    notes:$('v-notes-'+key).value.trim()||null,
    is_active:$('v-active-'+key).checked,
    is_sellable:!!(priceDirect||priceShopee)
  };
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
