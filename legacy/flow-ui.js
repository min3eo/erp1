function normalizeFlowState(s) { return FlowCore.normalize(s); }
function flowProgress(active) {
  return `<div class="flow-guide">${['구매 요청','승인','발주','입고','재고 반영','판매 출고'].map((n,i)=>`<span class="${i===active?'current':''}"><b>${i+1}</b>${n}</span>${i<5?'<i>→</i>':''}`).join('')}</div>`;
}
function itemOptions(salesOnly=false) {
  return state.items.filter(i=>!salesOnly||['완제품','상품'].includes(i[2])).map(i=>`<option value="${esc(i[0])}">${esc(i[1])} · ${i[0]} (${FlowCore.unit(i)})</option>`).join('');
}
function flowPurchasePage() {
  const orders=state.orders.filter(o=>(filter==='전체'||o.status===filter)&&[o.id,o.name,o.vendor].join(' ').includes(query));
  return head('구매 관리','요청을 승인하고 발주한 뒤, 받은 수량만큼 입고하세요.',`<div class="tabs"><button class="button" data-document="PO-PREVIEW-001">다품목 문서 예시</button>${action('구매 요청','purchase')}</div>`)+flowProgress(0)+`<div class="stats">${stat('승인 대기',state.orders.filter(o=>o.status==='승인 대기').length,'건','담당자 확인 필요','orange')}${stat('발주 준비',state.orders.filter(o=>o.status==='승인 완료').length,'건','승인 후 발주 진행')}${stat('입고 대기',state.orders.filter(o=>['발주 완료','부분 입고'].includes(o.status)).length,'건','부분 입고 포함','blue')}${stat('입고 완료',state.orders.filter(o=>o.status==='입고 완료').length,'건','발주 수량 입고 완료','green')}</div><section class="card">${toolbar(['전체','승인 대기','승인 완료','발주 완료','부분 입고','입고 완료','취소'])}${table(['발주 번호','품목','거래처','발주 / 입고','금액','상태','다음 업무'],orders.map(o=>{let item=state.items.find(i=>i[0]===o.itemCode);return [o.id,`<strong>${esc(o.name)}</strong><span class="cell-sub">${esc(o.itemCode||'품목 연결 필요')}</span>`,esc(o.vendor),`${o.qty} / ${o.received} ${item?FlowCore.unit(item):''}`,money(o.qty*o.price),pill(o.status), (o.status==='승인 대기'?'<a class="button" href="#approval">결재함 이동</a>':o.status==='승인 완료'?`<button class="button primary" data-place="${esc(o.id)}">발주하기</button>`:['발주 완료','부분 입고'].includes(o.status)?`<button class="button" data-receipt="${esc(o.id)}" ${item?'':'disabled'}>입고 처리</button>`:'<span class="cell-sub">—</span>')+(['승인 대기','승인 완료','발주 완료'].includes(o.status)&&!o.received?` <button class="button text" data-cancel-order="${esc(o.id)}">취소</button>`:'')]}))}</section>`;
}
function flowPage() {
  const product=productPage();if(product!==null)return product;
  const master=masterPage();if(master!==null)return master;
  const exception=exceptionPage();if(exception!==null)return exception;
  if(page==='purchase') return flowPurchasePage();
  if(page==='receipt') {
    let orders=state.orders.filter(o=>['발주 완료','부분 입고'].includes(o.status)&&[o.id,o.name,o.vendor].join(' ').includes(query)&&(filter==='전체'||o.status===filter));
    return head('입고 관리','실제로 받은 수량을 입력하면 해당 품목의 재고가 늘어납니다.')+flowProgress(3)+`<section class="card">${toolbar(['전체','발주 완료','부분 입고'])}${table(['발주 번호','품목 · 창고','거래처','발주 수량','입고 누계','남은 수량','처리'],orders.map(o=>{let i=state.items.find(i=>i[0]===o.itemCode);return [o.id,`<strong>${esc(o.name)}</strong><span class="cell-sub">${esc(i?.[3]||'품목 연결 필요')}</span>`,esc(o.vendor),o.qty,o.received,`<strong class="blue">${FlowCore.round(o.qty-o.received)} ${i?FlowCore.unit(i):''}</strong>`,`<button class="button primary" data-receipt="${esc(o.id)}" ${i?'':'disabled'}>입고 처리</button>`]}))}</section><p class="subtitle">기초 재고는 기존 보유 수량입니다. 이번 시안에서 처리한 입고만 추가 반영됩니다.</p>`;
  }
  if(page==='sales') {
    let sales=state.sales.filter(s=>(filter==='전체'||s.status===filter)&&[s.id,s.name,s.customer].join(' ').includes(query));
    return head('판매 · 출고','고객 주문을 등록하고, 보유 재고에서 출고하세요.',action('판매 주문','sale'))+flowProgress(5)+`<div class="stats">${stat('전체 주문',state.sales.length,'건','등록된 판매 주문')}${stat('출고 대기',state.sales.filter(s=>s.status==='출고 대기').length,'건','재고 확보 전 주문 포함','orange')}${stat('부분 출고',state.sales.filter(s=>s.status==='부분 출고').length,'건','남은 수량 확인')}${stat('출고 완료',state.sales.filter(s=>s.status==='출고 완료').length,'건','주문 수량 출고 완료','green')}</div><section class="card">${toolbar(['전체','출고 대기','부분 출고','출고 완료'])}${table(['주문 번호','품목','고객사','주문 / 출고','현재 재고','상태','처리'],sales.map(s=>{let i=state.items.find(i=>i[0]===s.itemCode);return [s.id,`<strong>${esc(s.name)}</strong><span class="cell-sub">${money(s.qty*s.price)}</span>`,esc(s.customer),`${s.qty} / ${s.shipped} ${i?FlowCore.unit(i):''}`,i?.[4]??'—',pill(s.status),s.status==='출고 완료'?'<span class="cell-sub">—</span>':`<button class="button primary" data-ship="${esc(s.id)}">출고 처리</button>`]}))}</section><p class="subtitle">주문 등록 시 재고는 변하지 않습니다. 출고를 확정할 때 차감됩니다.</p>`;
  }
  if(page==='movements') {
    const rows=state.movements.filter(m=>(filter==='전체'||m.type===filter)&&[m.ref,m.name,m.code,m.warehouse].join(' ').includes(query));
    return head('입출고 이력','재고가 언제, 어떤 거래로 바뀌었는지 확인하세요.')+`<section class="card">${toolbar(['전체','구매 입고','판매 출고','판매 반품','구매 반품','재고 조정','입고 취소','출고 취소','기초 재고'])}${table(['처리일','구분','품목 · 창고','변동 수량','이전 → 이후','관련 문서','사유','처리'],rows.map(m=>[m.date,pill(m.type)+(m.cancelled?'<span class="cell-sub orange">취소됨 · 원본 보존</span>':''),`<strong>${esc(m.name)}</strong><span class="cell-sub">${esc(m.code)} · ${esc(m.warehouse)}${m.stockType==='불량'?' · 불량 보관':''}</span>`,`<strong class="${m.qty<0?'orange':'blue'}">${m.qty>0?'+':''}${m.qty} ${m.unit}</strong>`,`${m.before} → <strong>${m.after}</strong>`,esc(m.ref),esc(m.note),['구매 입고','판매 출고'].includes(m.type)&&!m.cancelled?`<button class="button" data-cancel-movement="${esc(m.id)}">취소</button>`:'—']))}</section>`;
  }
  return null;
}
let flowContext=null;
function flowOpen(type, ref) {
  if(exceptionOpen(type,ref))return true;
  const options=itemOptions(type==='sale');
  flowContext={type,ref,token:FlowCore.id('TX')};
  let title,fields;
  if(type==='purchase'||type==='sale') {
    title=type==='purchase'?'구매 요청':'판매 주문';
    fields=`<label>품목<select name="itemCode" required>${options}</select></label>`+field(type==='sale'?'customer':'vendor',type==='sale'?'고객사':'공급 거래처')+field('qty','수량','number','10')+field('price',type==='sale'?'판매 단가 (원)':'구매 단가 (원)','number','1000');
  } else if(type==='receipt'||type==='ship') {
    let row=(type==='receipt'?state.orders:state.sales).find(o=>o.id===ref);
    if(!row) return true;
    let item=state.items.find(i=>i[0]===row.itemCode);
    if(!item){toast('품목 연결을 먼저 확인해 주세요.');return true;}
    title=type==='receipt'?'구매 입고 처리':'판매 출고 처리';
    const remaining=FlowCore.round(row.qty-(type==='receipt'?row.received:row.shipped));
    fields=`<div class="form-summary"><strong>${esc(row.name)}</strong><p>${esc(ref)}</p><div><span>남은 ${type==='receipt'?'입고':'출고'} 수량</span><b>${remaining} ${FlowCore.unit(item)}</b></div><div><span>${esc(item[3])} 현재 재고</span><b>${item[4]} ${FlowCore.unit(item)}</b></div></div><label>이번 ${type==='receipt'?'입고':'출고'} 수량 (${FlowCore.unit(item)})<input name="qty" type="number" min="${FlowCore.unit(item)==='kg'?'0.001':'1'}" step="${FlowCore.unit(item)==='kg'?'0.001':'1'}" max="${remaining}" required value="${type==='receipt'?remaining:Math.min(remaining,item[4])||1}"></label><p class="subtitle">${type==='receipt'?'남은 수량 중 일부만 입고할 수 있어요.':'보유 재고를 초과하는 출고는 처리되지 않아요.'}</p>`;
  } else return false;
  $('#modal-title').textContent=title;$('#fields').innerHTML=fields+'<p id="form-error" class="form-error" role="alert"></p>';
  $('#form button[type=submit]').textContent=type==='receipt'?'입고 확정':type==='ship'?'출고 확정':'등록하기';
  if(type==='purchase'||type==='sale') {
    const syncUnit=()=>{let i=state.items.find(i=>i[0]===$('#fields select[name=itemCode]').value);let q=$('#fields input[name=qty]');q.step=i&&FlowCore.unit(i)==='kg'?'0.001':'1';q.min=q.step;};
    $('#fields select[name=itemCode]').onchange=syncUnit;syncUnit();
    $('#fields input[name=price]').min='0';
  }
  $('#modal').showModal();return true;
}
function flowSubmit(f) {
  if(!flowContext) return false;
  try {
    const {type,ref,token}=flowContext;
    if(type==='purchase') FlowCore.purchase(state,f);
    else if(type==='sale') FlowCore.sale(state,f);
    else if(type==='receipt') FlowCore.receipt(state,ref,f.qty,token);
    else if(type==='ship') FlowCore.ship(state,ref,f.qty,token);
    else if(!exceptionSubmit(f)) return false;
    save();$('#modal').close();flowContext=null;render();toast(type==='receipt'?'입고를 확정하고 재고에 반영했어요.':type==='ship'?'출고를 확정하고 재고를 차감했어요.':'등록했어요.');
  } catch(e) {$('#form-error').textContent=e.message;}
  return true;
}
function bindFlow() {
  bindExceptions();
  document.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>{try{FlowCore.place(state,b.dataset.place);save();render();toast('발주했어요. 입고 관리에서 처리할 수 있습니다.')}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=()=>flowOpen('receipt',b.dataset.receipt));
  document.querySelectorAll('[data-ship]').forEach(b=>b.onclick=()=>flowOpen('ship',b.dataset.ship));
}
