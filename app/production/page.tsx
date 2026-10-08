'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, CellSub, Dash, DataTable, FilterToolbar, Hint, MiniProgress, NameCell, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { cancelWorkOrder, issueMaterials, requirements, unitMaterialCost, type WorkOrder } from '@/lib/production';

function WorkOrderDetail({ id }: { id: string }) {
  const { state, mutate, toast } = useErp();
  const wo = state.workOrders.find(w => w.id === id);
  if (!wo) return null;
  const req = requirements(state, wo);
  const short = req.filter(r => r.short > 0);
  const buyShortages = () => {
    try {
      mutate(d => short.forEach(r => {
        const vendor = d.orders.find(o => o.itemCode === r.code)?.vendor ?? '한빛 공급';
        const price = d.items.find(i => i[0] === r.code)?.[6] ?? 0;
        F.purchase(d, { itemCode: r.code, vendor, qty: Math.ceil(r.short), price });
      }));
      toast(`부족 자재 ${short.length}건을 구매 요청했어요. 결재함에서 승인해 주세요.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{wo.status}</Pill>
        <span className="font-mono text-caption text-muted">{wo.lot}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['지시', wo.qty], ['완료', wo.produced], ['남음', F.round(wo.qty - wo.produced)]].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line p-3">
            <div className="text-tiny text-muted">{k}</div>
            <div className="text-[20px] font-medium">{v}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-caption text-muted">자재 소요량 · BOM 기준</h3>
        <DataTable
          compact
          foot={false}
          headers={['자재', '필요 수량', '현재 재고', '상태']}
          rows={req.map(r => [
            <NameCell key="n" name={r.name} sub={r.code} />,
            `${r.need} ${r.unit}`,
            `${r.stock} ${r.unit}`,
            wo.issued ? <Pill key="s" tone="ok">출고 완료</Pill> : r.short ? <Pill key="s" tone="danger">{`${r.short} 부족`}</Pill> : <Pill key="s" tone="ok">확보</Pill>,
          ])}
        />
      </div>
      {!wo.issued && short.length > 0 && wo.status === '계획' && (
        <Hint className="mb-0">
          자재가 부족해 출고할 수 없어요. <button type="button" onClick={buyShortages} className="font-medium text-accent hover:underline">부족 자재 구매 요청 →</button>
        </Hint>
      )}
      <p className="text-caption text-muted">
        예상 재료비 {money(Math.round(unitMaterialCost(state, wo.productCode) * wo.qty))} (자재 기준 단가 × 소요량)
        {wo.note && <> · {wo.note}</>}
      </p>
    </div>
  );
}

export default function ProductionPage() {
  const { state, mutate, toast, openDrawer } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const shortOf = (w: WorkOrder) => w.status === '계획' && requirements(state, w).some(r => r.short > 0);

  const act = (fn: (d: F.ErpState) => unknown, done: string) => {
    try {
      mutate(fn);
      toast(done);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const open = (w: WorkOrder) => openDrawer(`${w.name} · ${w.id}`, <WorkOrderDetail id={w.id} />);

  const rows = state.workOrders
    .filter(w => (list.filter === '전체' || w.status === list.filter || (list.filter === '자재 부족' && shortOf(w))) && list.matches(w.id, w.name, w.lot))
    .map(w => {
      const item = state.items.find(i => i[0] === w.productCode);
      const u = item ? F.unit(item) : '';
      return [
        <button key="id" type="button" onClick={() => open(w)} className="text-left font-mono text-caption text-accent hover:underline">{w.id}<CellSub>{w.lot}</CellSub></button>,
        <NameCell key="n" name={w.name} sub={w.productCode} />,
        `${w.produced} / ${w.qty} ${u}`,
        <span key="p" className="flex items-center gap-2"><MiniProgress ratio={w.produced / w.qty} />{Math.round((w.produced / w.qty) * 100)}%</span>,
        w.due,
        w.status === '계획' ? (shortOf(w) ? <Pill key="m" tone="danger">자재 부족</Pill> : <Pill key="m" tone="ok">출고 가능</Pill>) : w.issued ? <Pill key="m" tone="neutral">출고 완료</Pill> : <Dash key="m" />,
        <Pill key="s">{w.status}</Pill>,
        <span key="a" className="flex items-center gap-1.5">
          {w.status === '계획' && (
            <>
              <Button variant="primary" disabled={shortOf(w)} onClick={() => act(d => issueMaterials(d, w.id, F.id('TX')), '자재를 출고했어요. 생산이 시작됐어요.')}>자재 출고</Button>
              <Button variant="text" onClick={() => act(d => cancelWorkOrder(d, w.id), '생산 지시를 취소했어요.')}>취소</Button>
            </>
          )}
          {w.status === '생산 중' && <Button variant="primary" onClick={() => openForm('output', w.id)}>실적 등록</Button>}
          <Button variant="text" onClick={() => open(w)}>상세</Button>
        </span>,
      ];
    });

  const count = (s: string) => state.workOrders.filter(w => w.status === s).length;
  return (
    <>
      <PageHead
        title="생산 현황"
        sub="생산 지시 → 자재 출고(BOM만큼 원료·부자재 차감) → 실적 등록(완제품 입고) 순서로 재고에 반영돼요."
        action={<><ButtonLink href="/bom">BOM 보기</ButtonLink><Button variant="primary" onClick={() => openForm('workOrder')}>＋ 생산 지시</Button></>}
      />
      <Stats>
        <Stat label="계획" value={count('계획')} unit="건" foot={`자재 부족 ${state.workOrders.filter(shortOf).length}건`} tone={state.workOrders.some(shortOf) ? 'danger' : undefined} />
        <Stat label="생산 중" value={count('생산 중')} unit="건" foot="자재 출고 완료" tone="info" />
        <Stat label="완료" value={count('완료')} unit="건" foot="실적 등록 완료" tone="ok" />
        <Stat label="생산 입고" value={state.movements.filter(m => m.type === '생산 입고').length} unit="회" foot="누적 · 입출고 이력 기준" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '계획', '자재 부족', '생산 중', '완료', '취소']} list={list} placeholder="지시 번호, 품목, LOT 검색" />
        <DataTable headers={['생산 지시', '품목', '완료 / 지시', '진행률', '완료 예정', '자재', '상태', '처리']} rows={rows} />
      </Card>
    </>
  );
}
