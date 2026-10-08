/* Browser-only demo transaction rules. No server or external service calls. */
const FlowCore = (() => {
  const unit = item => ['원료', '반제품'].includes(item[2]) ? 'kg' : 'EA';
  const round = n => Math.round(n * 1000) / 1000;
  const id = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const date = () => new Date().toLocaleDateString('sv-SE');
  const itemFor = (state, code) => {
    const item = state.items.find(i => i[0] === code);
    if (!item) throw Error('연결된 품목이 없습니다. 품목을 먼저 등록해 주세요.');
    return item;
  };
  function quantity(value, item) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || (unit(item) === 'EA' && !Number.isInteger(n)) || round(n) !== n) {
      throw Error(unit(item) === 'EA' ? '수량은 1 이상의 정수로 입력해 주세요.' : '수량은 0보다 크게, 소수 셋째 자리까지 입력해 주세요.');
    }
    return n;
  }
  function normalize(state) {
    state.movements ||= [];
    state.sales ||= [];
    state.returns ||= [];
    state.adjustments ||= [];
    state.quarantine ||= {};
    state.orders.forEach(o => {
      o.itemCode ||= state.items.find(i => i[1] === o.name)?.[0] || '';
      if (o.received == null) o.received = o.status === '입고 완료' ? o.qty : 0;
    });
    if (!state.flowVersion) {
      state.items.forEach(i => state.movements.push({id:id('ST'), date:date(), type:'기초 재고', code:i[0], name:i[1], warehouse:i[3], qty:i[4], before:0, after:i[4], ref:'OPENING', note:'시안 시작 시 보유 수량', unit:unit(i)}));
      state.flowVersion = 1;
    }
    return state;
  }
  function purchase(state, f) {
    const item = itemFor(state, f.itemCode), qty = quantity(f.qty, item), price = Number(f.price);
    if (!f.vendor?.trim()) throw Error('거래처를 입력해 주세요.');
    if (!Number.isFinite(price) || price < 0) throw Error('단가는 0 이상의 숫자로 입력해 주세요.');
    const order = {id:id('PO'), itemCode:item[0], name:item[1], vendor:f.vendor.trim(), qty, price, received:0, status:'승인 대기', date:date()};
    state.orders.unshift(order); return order;
  }
  function approve(state, orderId) {
    const o = state.orders.find(o => o.id === orderId);
    if (!o || o.status !== '승인 대기') throw Error('승인 대기 중인 구매 요청만 승인할 수 있어요.');
    o.status = '승인 완료'; return o;
  }
  function place(state, orderId) {
    const o = state.orders.find(o => o.id === orderId);
    if (!o || o.status !== '승인 완료') throw Error('승인 완료된 요청만 발주할 수 있어요.');
    itemFor(state, o.itemCode); o.status = '발주 완료'; return o;
  }
  function movement(state, item, qty, ref, note, token) {
    const before = item[4], after = round(before + qty);
    if (after < 0) throw Error('보유 재고보다 많은 수량을 출고할 수 없어요.');
    const row = {id:token, date:date(), type:qty > 0 ? '구매 입고' : '판매 출고', code:item[0], name:item[1], warehouse:item[3], qty, before, after, ref, note, unit:unit(item)};
    item[4] = after; state.movements.unshift(row); return row;
  }
  function receipt(state, orderId, amount, token) {
    if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 입고입니다. 목록을 다시 확인해 주세요.');
    const o = state.orders.find(o => o.id === orderId);
    if (!o || !['발주 완료', '부분 입고'].includes(o.status)) throw Error('발주된 미입고 내역만 입고할 수 있어요.');
    const item = itemFor(state, o.itemCode), qty = quantity(amount, item);
    if (qty > round(o.qty - o.received)) throw Error('입고 수량이 남은 발주 수량을 초과합니다.');
    const row = movement(state, item, qty, o.id, o.vendor, token);
    o.received = round(o.received + qty); o.status = o.received === o.qty ? '입고 완료' : '부분 입고';
    return row;
  }
  function sale(state, f) {
    const item = itemFor(state, f.itemCode), qty = quantity(f.qty, item), price = Number(f.price);
    if (!['완제품', '상품'].includes(item[2])) throw Error('판매 주문은 완제품 또는 상품으로 등록해 주세요.');
    if (!f.customer?.trim()) throw Error('고객사를 입력해 주세요.');
    if (!Number.isFinite(price) || price < 0) throw Error('판매 단가를 확인해 주세요.');
    const sale = {id:id('SO'), itemCode:item[0], name:item[1], customer:f.customer.trim(), qty, price, shipped:0, status:'출고 대기', date:date()};
    state.sales.unshift(sale); return sale;
  }
  function ship(state, saleId, amount, token) {
    if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 출고입니다. 목록을 다시 확인해 주세요.');
    const sale = state.sales.find(s => s.id === saleId);
    if (!sale || !['출고 대기', '부분 출고'].includes(sale.status)) throw Error('출고 대기 중인 주문만 처리할 수 있어요.');
    const item = itemFor(state, sale.itemCode), qty = quantity(amount, item);
    if (qty > round(sale.qty - sale.shipped)) throw Error('출고 수량이 남은 주문 수량을 초과합니다.');
    const row = movement(state, item, -qty, sale.id, sale.customer, token);
    sale.shipped = round(sale.shipped + qty); sale.status = sale.shipped === sale.qty ? '출고 완료' : '부분 출고';
    return row;
  }
  const reason = value => {
    if (!value?.trim()) throw Error('처리 사유를 입력해 주세요.');
    return value.trim();
  };
  function addChange(state, item, amount, type, ref, note, token, stockType='정상') {
    if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 내역입니다.');
    const before = stockType === '불량' ? state.quarantine[item[0]] || 0 : item[4];
    const after = round(before + amount);
    if (after < 0) throw Error('현재 재고가 부족하여 처리할 수 없어요.');
    const row = {id:token,date:date(),type,code:item[0],name:item[1],warehouse:item[3],qty:amount,before,after,ref,note,unit:unit(item),stockType};
    if (stockType === '불량') state.quarantine[item[0]] = after;
    else item[4] = after;
    state.movements.unshift(row); return row;
  }
  function cancelOrder(state, orderId, note) {
    note = reason(note);
    const o = state.orders.find(o => o.id === orderId);
    if (!o || !['승인 대기','승인 완료','발주 완료'].includes(o.status) || o.received > 0) throw Error('입고 전 요청·발주만 취소할 수 있어요. 입고된 물건은 반품 또는 입고 취소로 처리해 주세요.');
    o.status = '취소'; o.cancelReason = note; o.cancelDate = date(); return o;
  }
  function cancelMovement(state, movementId, note, token) {
    note = reason(note);
    const m = state.movements.find(m => m.id === movementId);
    if (!m || !['구매 입고','판매 출고'].includes(m.type) || m.cancelled) throw Error('취소할 수 있는 입출고 내역이 아닙니다.');
    if (state.returns.some(r => r.ref === m.ref)) throw Error('반품 이력이 있는 거래는 입출고 취소가 제한됩니다.');
    const item = itemFor(state,m.code);
    const doc = (m.type === '구매 입고' ? state.orders : state.sales).find(d => d.id === m.ref);
    if (!doc) throw Error('관련 문서를 찾을 수 없어요.');
    const row = addChange(state,item,-m.qty,m.type === '구매 입고' ? '입고 취소' : '출고 취소',m.ref,note,token);
    row.originalId = m.id; m.cancelled = true; m.cancelledBy = row.id;
    if (m.type === '구매 입고') {doc.received=round(doc.received-m.qty);doc.status=doc.received>0?'부분 입고':'발주 완료';}
    else {doc.shipped=round(doc.shipped+m.qty);doc.status=doc.shipped>0?'부분 출고':'출고 대기';}
    return row;
  }
  function returnGoods(state, f, token) {
    const note = reason(f.reason), kind = f.kind;
    if (!['판매 반품','구매 반품'].includes(kind)) throw Error('반품 유형을 확인해 주세요.');
    const doc=(kind==='판매 반품'?state.sales:state.orders).find(d=>d.id===f.ref);
    if (!doc) throw Error('반품할 거래를 선택해 주세요.');
    const item=itemFor(state,doc.itemCode),qty=quantity(f.qty,item);
    const returned=state.returns.filter(r=>r.ref===doc.id).reduce((sum,r)=>sum+r.qty,0);
    const limit=round((kind==='판매 반품'?doc.shipped:doc.received)-returned);
    if(qty>limit) throw Error('반품 수량이 실제 거래 수량을 초과합니다.');
    const stockType=kind==='판매 반품'&&f.grade==='불량'?'불량':'정상';
    const row=addChange(state,item,kind==='판매 반품'?qty:-qty,kind,doc.id,note,token,stockType);
    state.returns.unshift({id:row.id,date:date(),kind,ref:doc.id,code:item[0],name:item[1],qty,unit:unit(item),grade:stockType,reason:note});
    return row;
  }
  function requestAdjustment(state,f) {
    const item=itemFor(state,f.itemCode),actual=Number(f.actual),note=reason(f.reason);
    if(!Number.isFinite(actual)||actual<0||round(actual)!==actual||(unit(item)==='EA'&&!Number.isInteger(actual))) throw Error('실제 수량은 0 이상으로, 품목 단위에 맞게 입력해 주세요.');
    const a={id:id('ADJ'),date:date(),code:item[0],name:item[1],warehouse:item[3],expected:item[4],actual,delta:round(actual-item[4]),unit:unit(item),reason:note,status:'승인 대기'};
    state.adjustments.unshift(a);return a;
  }
  function decideAdjustment(state, adjustmentId, approve) {
    const a=state.adjustments.find(a=>a.id===adjustmentId);
    if(!a||a.status!=='승인 대기') throw Error('이미 처리한 조정 요청입니다.');
    if(!approve){a.status='반려';return a;}
    const item=itemFor(state,a.code);
    if(item[4]!==a.expected) throw Error('요청 후 재고가 바뀌었어요. 이 요청을 반려하고 다시 실사해 주세요.');
    addChange(state,item,a.delta,'재고 조정',a.id,a.reason,id('TX'));
    a.status='승인 완료';return a;
  }
  return {unit, round, id, date, normalize, purchase, approve, place, receipt, sale, ship, cancelOrder, cancelMovement, returnGoods, requestAdjustment, decideAdjustment};
})();
if (typeof module !== 'undefined') module.exports = FlowCore;
