function adjustmentPending(){return state.adjustments.filter(a=>a.status==='승인 대기').length;}
function returnAvailable(doc,kind){return FlowCore.round((kind==='판매 반품'?doc.shipped:doc.received)-state.returns.filter(r=>r.ref===doc.id).reduce((s,r)=>s+r.qty,0));}
function exceptionPage(){
  if(page==='returns') return head('반품 관리','판매 반품은 검수 결과에 따라 정상 재고 또는 불량 보관으로 반영됩니다.',`<div class="tabs">${action('구매 반품','purchaseReturn')}${action('판매 반품','saleReturn')}</div>`)+`<div class="hint">정상 판매 반품은 판매 가능한 재고로 돌아옵니다. 불량 반품은 별도로 보관하며 출고 가능한 수량에 포함하지 않습니다.</div><section class="card">${toolbar(['전체','판매 반품','구매 반품'])}${table(['처리일','유형','품목','반품 수량','검수 결과','원래 거래','사유'],state.returns.filter(r=>(filter==='전체'||filter===r.kind)&&[r.name,r.ref,r.reason].join(' ').includes(query)).map(r=>[r.date,pill(r.kind),esc(r.name),r.qty+' '+r.unit,pill(r.grade),esc(r.ref),esc(r.reason)]))}</section>`;
  if(page==='adjustments') return head('재고 실사 · 조정','실제 수량을 기록하고, 승인 후 시스템 재고에 반영하세요.',action('실사 결과 등록','adjustment'))+`<div class="stats">${stat('승인 대기',adjustmentPending(),'건','승인 전에는 재고가 바뀌지 않아요','orange')}${stat('조정 완료',state.adjustments.filter(a=>a.status==='승인 완료').length,'건','승인 내역은 이력에 기록')}${stat('불량 보관',Object.values(state.quarantine).filter(n=>n>0).length,'품목','판매 재고와 분리','orange')}${stat('전체 실사',state.adjustments.length,'건','등록된 실사 기록')}</div><section class="card">${toolbar(['전체','승인 대기','승인 완료','반려'])}${table(['실사일','품목 · 창고','시스템 수량','실제 수량','차이','사유','상태'],state.adjustments.filter(a=>(filter==='전체'||a.status===filter)&&[a.name,a.code,a.reason].join(' ').includes(query)).map(a=>[a.date,`<strong>${esc(a.name)}</strong><span class="cell-sub">${esc(a.warehouse)}</span>`,a.expected+' '+a.unit,a.actual+' '+a.unit,`<strong class="${a.delta<0?'orange':'blue'}">${a.delta>0?'+':''}${a.delta}</strong>`,esc(a.reason),pill(a.status)]))}</section><section class="card" style="margin-top:22px"><div class="card-head"><h2>불량 보관 현황</h2><small>정상 재고에서 제외</small></div>${table(['품목 코드','품목명','보관 창고','불량 수량'],state.items.filter(i=>(state.quarantine[i[0]]||0)>0).map(i=>[i[0],esc(i[1]),esc(i[3]),state.quarantine[i[0]]+' '+FlowCore.unit(i)]))}</section>`;
  if(page==='approval') {
    let entries=[...state.orders.filter(o=>o.status==='승인 대기').map(o=>({kind:'order',id:state.orders.indexOf(o),title:o.name+' 구매 요청',person:'구매팀',detail:money(o.qty*o.price)})),...state.leaves.filter(l=>l.status==='승인 대기').map(l=>({kind:'leave',id:state.leaves.indexOf(l),title:l.type+' 신청',person:l.name,detail:l.date+' · '+l.days+'일'})),...state.adjustments.filter(a=>a.status==='승인 대기').map(a=>({kind:'adjust',id:a.id,title:a.name+' 재고 조정',person:'실사 담당',detail:`${a.expected} → ${a.actual} ${a.unit}<span class="cell-sub">${esc(a.reason)}</span>`}))];
    return head('결재함','구매·휴가·재고 조정 요청을 함께 확인하세요.')+`<div class="hint">재고 조정 승인 시 수량이 반영됩니다. 요청 이후 재고가 바뀐 경우 다시 실사해야 합니다.</div><section class="card"><div class="card-head"><h2>승인 대기 <span class="blue">${entries.length}</span></h2></div>${table(['요청 내용','요청자','상세','상태','처리'],entries.map(e=>[esc(e.title),esc(e.person),e.detail,pill('승인 대기'),e.kind==='adjust'?`<button class="button" data-adjust-decision="${e.id}:no">반려</button> <button class="button primary" data-adjust-decision="${e.id}:yes">승인</button>`:`<button class="button" data-decision="${e.kind}:${e.id}:반려">반려</button> <button class="button primary" data-decision="${e.kind}:${e.id}:승인">승인</button>`]))}</section>`;
  }
  return null;
}
function exceptionOpen(type,ref){
  let fields,title;
  if(type==='cancelOrder') {
    const o=state.orders.find(o=>o.id===ref);if(!o)return true;
    title='구매 요청 · 발주 취소';fields=`<div class="form-summary"><strong>${esc(o.name)}</strong><p>${esc(o.id)} · ${esc(o.status)}</p><span>재고는 변하지 않으며, 취소 사유가 남습니다.</span></div>`+field('reason','취소 사유');
  } else if(type==='cancelMovement') {
    const m=state.movements.find(m=>m.id===ref);if(!m)return true;
    title=m.type==='구매 입고'?'입고 취소':'출고 취소';fields=`<div class="form-summary"><strong>${esc(m.name)}</strong><p>${esc(m.ref)}</p><div><span>되돌릴 수량</span><b>${-m.qty>0?'+':''}${-m.qty} ${m.unit}</b></div></div><p class="subtitle">원래 기록은 유지하고, 반대 수량의 취소 이력을 추가합니다.</p>`+field('reason','취소 사유');
  } else if(type==='saleReturn'||type==='purchaseReturn') {
    const kind=type==='saleReturn'?'판매 반품':'구매 반품';const docs=(type==='saleReturn'?state.sales:state.orders).filter(d=>d.itemCode&&returnAvailable(d,kind)>0);
    if(!docs.length){toast('반품 가능한 입고·출고 거래가 없습니다.');return true;}
    title=kind+' 등록';fields=`<label>원래 거래<select name="ref" required>${docs.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.id)} · 반품 가능 ${returnAvailable(d,kind)}</option>`).join('')}</select></label>`+field('qty','반품 수량','number','1')+(type==='saleReturn'?'<label>검수 결과<select name="grade"><option value="정상">정상 · 판매 재고로 복원</option><option value="불량">불량 · 별도 보관</option></select></label>':'')+field('reason','반품 사유');
  } else if(type==='adjustment') {
    title='실사 결과 등록';fields=`<label>품목<select name="itemCode">${itemOptions()}</select></label><div id="actual-hint" class="form-summary"></div>`+field('actual','실제 확인 수량','number','0')+field('reason','차이 사유')+'<p class="subtitle">승인을 요청합니다. 승인되기 전까지 재고는 유지됩니다.</p>';
  } else return false;
  flowContext={type,ref,token:FlowCore.id('TX')};$('#modal-title').textContent=title;$('#fields').innerHTML=fields+'<p id="form-error" class="form-error" role="alert"></p>';
  $('#form button[type=submit]').textContent=type.startsWith('cancel')?'취소 확정':type==='adjustment'?'승인 요청':'반품 확정';
  if(type==='adjustment') {
    const sync=()=>{let item=state.items.find(i=>i[0]===$('#fields select[name=itemCode]').value);$('#actual-hint').textContent=`시스템 수량 ${item[4]} ${FlowCore.unit(item)} · ${item[3]}`;let input=$('#fields input[name=actual]');input.value=item[4];input.min='0';input.step=FlowCore.unit(item)==='kg'?'0.001':'1';};$('#fields select[name=itemCode]').onchange=sync;sync();
  } else if(type.endsWith('Return')) {
    const sync=()=>{const list=type==='saleReturn'?state.sales:state.orders;const doc=list.find(d=>d.id===$('#fields select[name=ref]').value);const item=state.items.find(i=>i[0]===doc.itemCode),input=$('#fields input[name=qty]');input.min=input.step=FlowCore.unit(item)==='kg'?'0.001':'1';input.max=returnAvailable(doc,type==='saleReturn'?'판매 반품':'구매 반품');};$('#fields select[name=ref]').onchange=sync;sync();
  }
  $('#modal').showModal();return true;
}
function exceptionSubmit(f){
  const {type,ref,token}=flowContext;
  if(type==='cancelOrder') FlowCore.cancelOrder(state,ref,f.reason);
  else if(type==='cancelMovement') FlowCore.cancelMovement(state,ref,f.reason,token);
  else if(type==='saleReturn'||type==='purchaseReturn') FlowCore.returnGoods(state,{...f,kind:type==='saleReturn'?'판매 반품':'구매 반품'},token);
  else if(type==='adjustment') FlowCore.requestAdjustment(state,f);
  else return false;
  return true;
}
function bindExceptions(){
  document.querySelectorAll('[data-cancel-order]').forEach(b=>b.onclick=()=>exceptionOpen('cancelOrder',b.dataset.cancelOrder));
  document.querySelectorAll('[data-cancel-movement]').forEach(b=>b.onclick=()=>exceptionOpen('cancelMovement',b.dataset.cancelMovement));
  document.querySelectorAll('[data-adjust-decision]').forEach(b=>b.onclick=()=>{try{let [id,decision]=b.dataset.adjustDecision.split(':');FlowCore.decideAdjustment(state,id,decision==='yes');save();render();toast(decision==='yes'?'조정을 승인하고 재고에 반영했어요.':'조정 요청을 반려했어요.')}catch(e){toast(e.message)}});
}
