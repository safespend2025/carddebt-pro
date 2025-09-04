// CardDebt Pro (fixed paths) – dynamic interest preview, edit/delete txns, compounding monthly
const $ = (s)=>document.querySelector(s);
const fmt = (n)=> (Number(n)||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const load = ()=> JSON.parse(localStorage.getItem('cc:debt:data')||'{"cards":[],"history":[]}');
const save = (d)=> localStorage.setItem('cc:debt:data', JSON.stringify(d));

// THEME
const THEME_KEY = 'cc:theme';
function applyTheme(t){ const r=document.documentElement; t==='dark'?r.classList.add('dark'):r.classList.remove('dark'); }
function initTheme(){
  let t = localStorage.getItem(THEME_KEY);
  if (!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, t); applyTheme(t);
}
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('btnTheme');
  if (btn) btn.addEventListener('click', ()=>{
    const t=localStorage.getItem(THEME_KEY)||'light';
    const n=(t==='dark'?'light':'dark');
    localStorage.setItem(THEME_KEY,n); applyTheme(n);
  });
});
initTheme();

let data = load();
let editingCardId = null;
let currentTxnCardId = null;
let editingTxnId = null;

function clampDueDay(d){ d=Number(d||0); if(isNaN(d)) return null; return Math.min(31, Math.max(1, Math.floor(d))); }
function eom(y,m){ return new Date(y, m+1, 0).getDate(); }
function nextDueDate(dueDay){
  if(!dueDay) return null;
  const t=new Date(); const y=t.getFullYear(), m=t.getMonth(), day=t.getDate();
  const thisDay=Math.min(clampDueDay(dueDay)||1, eom(y,m));
  let n=new Date(y,m,thisDay);
  if(day>thisDay){ const ny=m===11?y+1:y; const nm=(m+1)%12; const nd=Math.min(thisDay,eom(ny,nm)); n=new Date(ny,nm,nd); }
  return n;
}
function daysUntil(d){ if(!d) return Infinity; const a=new Date(new Date().toDateString()); const b=new Date(new Date(d).toDateString()); return Math.round((b-a)/(1000*60*60*24)); }

function monthlyInterest(amount, apr){ return (Number(amount)||0) * ((Number(apr)||0)/100); }

function computeTotals(){
  const debt = data.cards.reduce((a,c)=>a + Number(c.debt||0), 0);
  const interest = data.cards.reduce((a,c)=>a + monthlyInterest(c.debt, c.apr), 0);
  return {debt, interest};
}

// Interest posting: once per cycle, uses CURRENT debt & APR at posting time
function applyInterestIfDue(){
  const today = new Date();
  const isoMonth = today.toISOString().slice(0,7); // YYYY-MM
  data.cards.forEach(c=>{
    if(!c.dueDay) return;
    const nd = nextDueDate(c.dueDay);
    if (!nd) return;
    const isTodayBilling = (nd.toDateString() === new Date().toDateString());
    const key = `${isoMonth}-${c.id}`;
    data.interestApplied = data.interestApplied || [];
    if (isTodayBilling && !data.interestApplied.includes(key)){
      const amount = monthlyInterest(c.debt, c.apr); // dynamic
      c.debt = Math.max(0, Number(c.debt||0) + amount);
      data.history.push({id: crypto.randomUUID(), type:'interest', cardId:c.id, amount, desc:`Interés ${c.apr}%`, date:new Date().toISOString()});
      data.interestApplied.push(key);
    }
  });
  save(data);
}

function render(){
  applyInterestIfDue();

  const viewResumen = document.getElementById('viewResumen');
  const viewTarjetas = document.getElementById('viewTarjetas');
  const activeTab = localStorage.getItem('cc:tab') || 'resumen';
  viewResumen.classList.toggle('hidden', activeTab!=='resumen');
  viewTarjetas.classList.toggle('hidden', activeTab!=='tarjetas');

  const t = computeTotals();
  document.getElementById('sumDebt').textContent = fmt(t.debt);
  document.getElementById('sumInterest').textContent = fmt(t.interest);

  const hist = document.getElementById('historyList'); hist.innerHTML = "";
  data.history.slice(-10).reverse().forEach(h=>{
    const row = document.createElement('div');
    row.className='row';
    const sign = h.type==='payment' ? '-' : '+';
    row.innerHTML = `<div class="muted">${new Date(h.date).toLocaleString()} — ${h.desc||h.type}</div><div><strong>${sign}${fmt(h.amount)}</strong></div>`;
    hist.appendChild(row);
  });

  const wrap = document.getElementById('cards'); wrap.innerHTML='';
  sortCards(data.cards).forEach(c=>{
    const nd = nextDueDate(c.dueDay); const d = daysUntil(nd);
    const overdue = d<0;
    let cls = 'card';
    if (nd){
      if (overdue) cls+=' overdue due-danger';
      else if (d<=5) cls+=' due-danger';
      else if (d<=15) cls+=' due-warn';
      else cls+=' due-ok';
    }
    const interestPreview = monthlyInterest(c.debt, c.apr);
    const label = nd ? nd.toLocaleDateString() : '—';
    const container = document.createElement('div');
    container.className = cls;
    container.innerHTML = `
      <div class="row">
        <div><strong>${c.name}</strong>
          <div class="muted">Balance: ${fmt(c.debt)} · Intereses: ${fmt(interestPreview)} · Día restante a pago: ${nd?d:'—'}</div>
          <div class="muted">APR mensual: ${c.apr}% · Día de cobro: ${c.dueDay||'—'} (próx: ${label})</div>
        </div>
        <div class="right"><span class="badge">ID ${c.id.slice(0,4)}</span></div>
      </div>
      <div class="actions" style="margin-top:10px">
        <button data-act="txn" data-id="${c.id}">Añadir movimiento</button>
        <button data-act="edit" data-id="${c.id}">Editar</button>
        <button data-act="delete" data-id="${c.id}" class="danger">Eliminar</button>
      </div>
      <div class="list" style="margin-top:10px" id="txns-${c.id}"></div>
    `;
    wrap.appendChild(container);

    const list = container.querySelector(`#txns-${c.id}`);
    data.history.filter(h=>h.cardId===c.id).slice().reverse().forEach(h=>{
      const row = document.createElement('div');
      row.className='txn';
      const sign = h.type==='payment' ? '-' : '+';
      row.innerHTML = `
        <div class="muted">${new Date(h.date).toLocaleString()} — ${h.desc||h.type}</div>
        <div><strong>${sign}${fmt(h.amount)}</strong></div>
        <div class="actions">
          ${h.type!=='interest' ? `<button data-tact="edit-txn" data-id="${h.id}">Editar</button>` : ''}
          <button data-tact="del-txn" data-id="${h.id}" class="danger">Borrar</button>
        </div>`;
      list.appendChild(row);
    });
  });
}

function sortCards(cards){
  return [...cards].sort((a,b)=>{
    const da = nextDueDate(a.dueDay); const db = nextDueDate(b.dueDay);
    const ua = da ? da.getTime() : Number.MAX_SAFE_INTEGER;
    const ub = db ? db.getTime() : Number.MAX_SAFE_INTEGER;
    return ua - ub;
  });
}

// CRUD cards
function addCard(name, debt, apr, dueDay){
  const id = crypto.randomUUID();
  data.cards.push({id, name, debt:Number(debt||0), apr:Number(apr||0), dueDay: clampDueDay(dueDay)});
  save(data); render();
}
function updateCard(id, name, debt, apr, dueDay){
  const c = data.cards.find(x=>x.id===id); if(!c) return;
  c.name=name; c.debt=Number(debt||0); c.apr=Number(apr||0); c.dueDay=clampDueDay(dueDay);
  save(data); render();
}
function deleteCard(id){
  if(!confirm('¿Eliminar tarjeta y su historial?')) return;
  data.cards = data.cards.filter(x=>x.id!==id);
  data.history = data.history.filter(h=>h.cardId!==id);
  save(data); render();
}

// Txn helpers
function applyTxnEffect(c, type, amount){
  if (type==='expense' || type==='interest'){ c.debt = Math.max(0, Number(c.debt||0) + amount); }
  else if (type==='payment'){ c.debt = Math.max(0, Number(c.debt||0) - amount); }
}
function reverseTxnEffect(c, type, amount){
  if (type==='expense' || type==='interest'){ c.debt = Math.max(0, Number(c.debt||0) - amount); }
  else if (type==='payment'){ c.debt = Math.max(0, Number(c.debt||0) + amount); }
}

// Add txn
function addTxn(cardId, type, amount, desc){
  const c = data.cards.find(x=>x.id===cardId); if(!c) return;
  const v = Number(amount||0); if (!v) return;
  applyTxnEffect(c, type, v);
  data.history.push({id: crypto.randomUUID(), type, cardId, amount:v, desc, date:new Date().toISOString()});
  save(data); render();
}

// Edit / delete txn
function editTxn(txnId, newType, newAmount, newDesc){
  const h = data.history.find(x=>x.id===txnId); if(!h) return;
  const c = data.cards.find(x=>x.id===h.cardId); if(!c) return;
  reverseTxnEffect(c, h.type, Number(h.amount||0));
  const typeToApply = (h.type==='interest') ? 'interest' : newType;
  const amountToApply = Number(newAmount||0);
  applyTxnEffect(c, typeToApply, amountToApply);
  h.type = typeToApply; h.amount = amountToApply; h.desc = newDesc; h.date = new Date().toISOString();
  save(data); render();
}
function deleteTxn(txnId){
  const idx = data.history.findIndex(x=>x.id===txnId); if(idx<0) return;
  const h = data.history[idx];
  const c = data.cards.find(x=>x.id===h.cardId); if(!c) return;
  reverseTxnEffect(c, h.type, Number(h.amount||0));
  data.history.splice(idx,1);
  save(data); render();
}

// UI events
document.getElementById('btnAddCard').addEventListener('click', ()=>{
  document.getElementById('dlgCardTitle').textContent = "Añadir tarjeta";
  document.getElementById('cardName').value = "";
  document.getElementById('cardDebt').value = "";
  document.getElementById('cardAPR').value = "";
  document.getElementById('cardDueDay').value = "";
  window.editingCardId = null;
  document.getElementById('dlgCard').showModal();
});
document.getElementById('cancelCard').addEventListener('click', ()=> document.getElementById('dlgCard').close());
document.getElementById('saveCard').onclick = ()=>{
  const name=document.getElementById('cardName').value.trim();
  const debt=document.getElementById('cardDebt').value.trim();
  const apr=document.getElementById('cardAPR').value.trim();
  const due=document.getElementById('cardDueDay').value.trim();
  if(!name) return alert("Pon el nombre de la tarjeta");
  if (window.editingCardId) updateCard(window.editingCardId, name, debt, apr, due);
  else addCard(name, debt, apr, due);
  document.getElementById('dlgCard').close();
};

document.getElementById('cards').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const id = btn.dataset.id; const act = btn.dataset.act;
  if (act==='edit'){
    const c = data.cards.find(x=>x.id===id); if(!c) return;
    window.editingCardId = id;
    document.getElementById('dlgCardTitle').textContent = "Editar tarjeta";
    document.getElementById('cardName').value = c.name;
    document.getElementById('cardDebt').value = c.debt;
    document.getElementById('cardAPR').value = c.apr;
    document.getElementById('cardDueDay').value = c.dueDay || "";
    document.getElementById('dlgCard').showModal();
  } else if (act==='delete'){
    deleteCard(id);
  } else if (act==='txn'){
    window.currentTxnCardId = id;
    document.getElementById('dlgTxnTitle').textContent = "Añadir movimiento";
    document.getElementById('txnType').value = "expense";
    document.getElementById('txnAmount').value = "";
    document.getElementById('txnDesc').value = "";
    document.getElementById('dlgTxn').showModal();
  } else if (e.target.dataset.tact==='edit-txn'){
    const txnId = e.target.dataset.id; editingTxnId = txnId;
    const h = data.history.find(x=>x.id===txnId); if(!h) return;
    document.getElementById('editTxnType').value = (h.type==='interest') ? 'expense' : h.type;
    document.getElementById('editTxnAmount').value = h.amount;
    document.getElementById('editTxnDesc').value = h.desc || '';
    document.getElementById('dlgTxnEdit').showModal();
  } else if (e.target.dataset.tact==='del-txn'){
    const txnId = e.target.dataset.id;
    if (confirm('¿Borrar este movimiento?')) deleteTxn(txnId);
  }
});

document.getElementById('cancelTxn').onclick = ()=> document.getElementById('dlgTxn').close();
document.getElementById('saveTxn').onclick = ()=>{
  const type = document.getElementById('txnType').value;
  const amount = document.getElementById('txnAmount').value.trim();
  const desc = document.getElementById('txnDesc').value.trim();
  if(!amount) return alert("Escribe un monto");
  addTxn(window.currentTxnCardId, type, amount, desc);
  document.getElementById('dlgTxn').close();
};

document.getElementById('cancelEditTxn').onclick = ()=> document.getElementById('dlgTxnEdit').close();
document.getElementById('updateTxn').onclick = ()=>{
  if(!editingTxnId) return document.getElementById('dlgTxnEdit').close();
  const t = document.getElementById('editTxnType').value;
  const a = document.getElementById('editTxnAmount').value.trim();
  const d = document.getElementById('editTxnDesc').value.trim();
  editTxn(editingTxnId, t, a, d);
  document.getElementById('dlgTxnEdit').close();
};

// Tabs
function setTab(t){ localStorage.setItem('cc:tab', t); render(); }
document.getElementById('tabResumen').onclick = ()=> setTab('resumen');
document.getElementById('tabTarjetas').onclick = ()=> setTab('tarjetas');

// SW auto-update (relative path)
if ('serviceWorker' in navigator){
  window.addEventListener('load', async () => {
    try{
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', ()=>{
        const sw = reg.installing;
        sw && sw.addEventListener('statechange', ()=>{
          if (sw.state==='installed' && navigator.serviceWorker.controller) reg.waiting && reg.waiting.postMessage({type:'SKIP_WAITING'});
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', ()=> window.location.reload());
      if (reg.update) setTimeout(()=>reg.update().catch(()=>{}), 1000);
    }catch(e){}
  });
}

render();
