/* ─────────────────────────────────────────────────────────
   DATA REPORTS TAB
   Chart helpers, computeReports(), renderDataReports().
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   DATA REPORTS TAB
   ═══════════════════════════════════════════════════════════════════════ */
let chartJsLoaded=false;
const chartInstances={};
function loadChartJs(){
  return new Promise((resolve,reject)=>{
    if(chartJsLoaded && window.Chart){resolve();return;}
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
    script.onload=()=>{chartJsLoaded=true;resolve();};
    script.onerror=()=>reject(new Error('Chart library failed to load'));
    document.head.appendChild(script);
  });
}
function killChart(id){
  if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];}
}
function makeBarChart(id,labels,data,horizontal){
  killChart(id);
  const ctx=document.getElementById(id);
  if(!ctx)return;
  chartInstances[id]=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:'#729A94',borderRadius:4}]},
    options:{
      indexAxis:horizontal?'y':'x',
      plugins:{legend:{display:false}},
      scales:{x:{grid:{display:!horizontal}},y:{grid:{display:horizontal}}}
    }
  });
}
function makeLineChart(id,labels,datasets){
  killChart(id);
  const ctx=document.getElementById(id);
  if(!ctx)return;
  chartInstances[id]=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:datasets.map(d=>({...d,tension:.3,fill:false}))},
    options:{plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}
  });
}

function monthKey(dateStr){const d=new Date(dateStr);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function monthLabel(key){const [y,m]=key.split('-');return new Date(y,m-1,1).toLocaleDateString('en-PH',{month:'short',year:'2-digit'});}

function computeReports(sales){
  const now=new Date();
  const moStart=startOfMonth(now);
  const inMonth=sales.filter(s=>new Date(s.sale_date)>=moStart);
  const grossMonth=inMonth.reduce((s,x)=>s+parseFloat(x.total_amount||0),0);
  const netMonth=inMonth.reduce((s,x)=>s+parseFloat(x.net_profit||0),0);
  const platformFeeMonth=inMonth.reduce((s,x)=>s+parseFloat(x.platform_fee||0),0);
  const aov = inMonth.length ? grossMonth/inMonth.length : 0;
  const feePct = grossMonth ? (platformFeeMonth/grossMonth*100) : 0;

  // 6-month trend
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  const grossByMonth={},netByMonth={};
  months.forEach(m=>{grossByMonth[m]=0;netByMonth[m]=0;});
  sales.forEach(s=>{
    const k=monthKey(s.sale_date);
    if(k in grossByMonth){grossByMonth[k]+=parseFloat(s.total_amount||0);netByMonth[k]+=parseFloat(s.net_profit||0);}
  });

  // top sellers / slow movers (all-time, by units sold)
  const soldMap={};
  sales.forEach(sale=>(sale.sale_items||[]).forEach(item=>{
    const key=item.sku_id;
    if(!soldMap[key])soldMap[key]={label:(item.skus?item.skus.product_name+(item.skus.variant?' — '+item.skus.variant:''):'Unknown'),qty:0};
    soldMap[key].qty+=item.quantity;
  }));
  const topSellers=Object.values(soldMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
  const slowMovers=S.skus
    .filter(s=>s.is_sellable && s.is_active && s.current_stock>0)
    .map(s=>({label:s.product_name+(s.variant?' — '+s.variant:''), qty:(soldMap[s.id]?soldMap[s.id].qty:0)}))
    .sort((a,b)=>a.qty-b.qty).slice(0,5);

  // payment method breakdown
  const payMap={};
  sales.forEach(s=>{const k=s.payment_method||'Unspecified';payMap[k]=(payMap[k]||0)+parseFloat(s.total_amount||0);});
  const paymentBreakdown=Object.entries(payMap).sort((a,b)=>b[1]-a[1]);

  // top cities
  const cityMap={};
  sales.forEach(s=>{if(s.city_province){cityMap[s.city_province]=(cityMap[s.city_province]||0)+parseFloat(s.total_amount||0);}});
  const topCities=Object.entries(cityMap).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // top recurring customers
  const custMap={};
  sales.forEach(s=>{
    if(!s.customer_name)return;
    const key=s.customer_name.trim().toLowerCase();
    if(!custMap[key])custMap[key]={name:s.customer_name.trim(),count:0,total:0,last:s.sale_date};
    custMap[key].count++;
    custMap[key].total+=parseFloat(s.total_amount||0);
    if(new Date(s.sale_date)>new Date(custMap[key].last))custMap[key].last=s.sale_date;
  });
  const topCustomers=Object.values(custMap).sort((a,b)=>b.count-a.count||b.total-a.total).slice(0,5);
  const distinctCustomers=Object.keys(custMap).length;
  const repeatCustomers=Object.values(custMap).filter(c=>c.count>1).length;
  const repeatRate = distinctCustomers ? (repeatCustomers/distinctCustomers*100) : 0;

  // days of inventory remaining (based on last 30 days velocity)
  const thirtyAgo=new Date(now);thirtyAgo.setDate(thirtyAgo.getDate()-30);
  const recentSoldMap={};
  sales.filter(s=>new Date(s.sale_date)>=thirtyAgo).forEach(sale=>(sale.sale_items||[]).forEach(item=>{
    recentSoldMap[item.sku_id]=(recentSoldMap[item.sku_id]||0)+item.quantity;
  }));
  const runwayList=S.skus
    .filter(s=>s.is_sellable && s.is_active && recentSoldMap[s.id])
    .map(s=>{
      const dailyRate=recentSoldMap[s.id]/30;
      return {label:s.product_name+(s.variant?' — '+s.variant:''), stock:s.current_stock, days: dailyRate>0?Math.round(s.current_stock/dailyRate):null};
    })
    .filter(x=>x.days!=null)
    .sort((a,b)=>a.days-b.days).slice(0,6);

  return {grossMonth,netMonth,aov,feePct,months,grossByMonth,netByMonth,topSellers,slowMovers,paymentBreakdown,topCities,topCustomers,repeatRate,distinctCustomers,runwayList};
}

async function renderDataReports(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading reports...</p></div>`;
  try{
    const [sales]=await Promise.all([fetchSalesData(), loadChartJs()]);
    const r=computeReports(sales);

    let html=`
    <div class="stat-strip">
      <div class="stat-box"><div class="stat-num">${P(r.grossMonth)}</div><div class="stat-lbl">Gross Sales (Month)</div></div>
      <div class="stat-box"><div class="stat-num">${P(r.netMonth)}</div><div class="stat-lbl">Net Sales (Month)</div></div>
      <div class="stat-box"><div class="stat-num">${P(r.aov)}</div><div class="stat-lbl">Avg Order Value</div></div>
      <div class="stat-box"><div class="stat-num">${r.feePct.toFixed(1)}%</div><div class="stat-lbl">Platform Fee of Revenue</div></div>
      <div class="stat-box"><div class="stat-num">${r.repeatRate.toFixed(0)}%</div><div class="stat-lbl">Repeat Customer Rate</div></div>
    </div>

    <div class="card"><div class="card-title">📈 Gross vs. Net Sales — Last 6 Months</div>
      <canvas id="chart-trend" height="90"></canvas></div>

    <div class="card"><div class="card-title">🏆 Top 5 Best-Selling Items</div>
      ${r.topSellers.length?'<canvas id="chart-topsellers" height="120"></canvas>':'<p class="t-muted" style="font-size:13px">No sales recorded yet.</p>'}</div>

    <div class="card"><div class="card-title">🐌 Top 5 Slow-Moving Items <span class="t-muted" style="font-size:11px;font-weight:400">(in stock, fewest units sold all-time)</span></div>
      ${r.slowMovers.length?'<canvas id="chart-slowmovers" height="120"></canvas>':'<p class="t-muted" style="font-size:13px">No data yet.</p>'}</div>

    <div class="card"><div class="card-title">💳 Payment Method Breakdown</div>
      ${r.paymentBreakdown.length?'<canvas id="chart-paymethod" height="120"></canvas>':'<p class="t-muted" style="font-size:13px">No sales recorded yet.</p>'}</div>

    <div class="card"><div class="card-title">📍 Top 5 Cities/Provinces</div>
      ${r.topCities.length?'<canvas id="chart-cities" height="120"></canvas>':'<p class="t-muted" style="font-size:13px">No location data yet.</p>'}</div>

    <div class="card"><div class="card-title">👤 Top 5 Recurring Direct Customers</div>
      ${r.topCustomers.length?`<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Orders</th><th>Total Spent</th><th>Last Order</th></tr></thead><tbody>
        ${r.topCustomers.map(c=>`<tr><td>${c.name}</td><td>${c.count}</td><td>${P(c.total)}</td><td>${fmtDate(c.last)}</td></tr>`).join('')}
      </tbody></table></div>`:'<p class="t-muted" style="font-size:13px">No customer data yet.</p>'}
    </div>

    <div class="card"><div class="card-title">⏳ Inventory Running Low Fastest <span class="t-muted" style="font-size:11px;font-weight:400">(based on last 30 days of sales)</span></div>
      ${r.runwayList.length?`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Current Stock</th><th>Est. Days Remaining</th></tr></thead><tbody>
        ${r.runwayList.map(x=>`<tr><td>${x.label}</td><td>${x.stock}</td><td class="${x.days<=7?'stock-low':''}">${x.days} days</td></tr>`).join('')}
      </tbody></table></div>`:'<p class="t-muted" style="font-size:13px">Not enough recent sales history yet to estimate.</p>'}
    </div>

    <p class="t-muted" style="font-size:11px;text-align:center;margin-top:8px">Hotel orders and shipping/courier reports aren't wired in yet — these reports reflect direct/storefront sales only.</p>`;

    $('body').innerHTML=html;

    // Draw charts now that canvases exist in the DOM
    makeLineChart('chart-trend', r.months.map(monthLabel), [
      {label:'Gross',data:r.months.map(m=>r.grossByMonth[m]),borderColor:'#3E5F5C',backgroundColor:'#3E5F5C'},
      {label:'Net',data:r.months.map(m=>r.netByMonth[m]),borderColor:'#D1A679',backgroundColor:'#D1A679'}
    ]);
    if(r.topSellers.length)makeBarChart('chart-topsellers', r.topSellers.map(x=>x.label), r.topSellers.map(x=>x.qty), true);
    if(r.slowMovers.length)makeBarChart('chart-slowmovers', r.slowMovers.map(x=>x.label), r.slowMovers.map(x=>x.qty), true);
    if(r.paymentBreakdown.length)makeBarChart('chart-paymethod', r.paymentBreakdown.map(x=>x[0]), r.paymentBreakdown.map(x=>x[1]), true);
    if(r.topCities.length)makeBarChart('chart-cities', r.topCities.map(x=>x[0]), r.topCities.map(x=>x[1]), true);
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load reports.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}
