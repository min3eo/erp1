'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, CardHead, CellSub, DataTable, Hint, NameCell, PageHead, Pill, Stat, Stats } from '@/components/ui';
import { unit } from '@/lib/flow-core';
import { IN_TRANSIT, addWarehouse, arriveTransfer, startTransfer, stockByWarehouse, warehouses } from '@/lib/inventory';

export default function TransfersPage() {
  const { state } = useErp();
  const act = useAction();
  const [dialog, setDialog] = useState<null | 'move' | 'wh'>(null);
  const whs = warehouses(state);
  const moving = state.inv.transfers.filter(t => t.status === '이동 중');

  return (
    <>
      <PageHead
        title="창고 이동"
        sub="창고 사이로 재고를 옮겨요. 출발 창고에서 빠진 재고는 도착 확인 전까지 ‘이동 중’에 있고, 총재고와 원가는 변하지 않아요. 3PL 위탁 창고 · 외주 가공처도 창고로 등록해 관리해요."
        action={<><Button onClick={() => setDialog('wh')}>창고 등록</Button><Button variant="primary" onClick={() => setDialog('move')}>이동 요청</Button></>}
      />
      <Stats>
        <Stat label="창고" value={whs.length} unit="곳" foot={`자가 ${whs.filter(w => w.type === '자가').length} · 위탁 ${whs.filter(w => w.type === '외부 위탁').length} · 외주 ${whs.filter(w => w.type === '외주 가공').length}`} />
        <Stat label="이동 중" value={moving.length} unit="건" foot="도착 확인 대기" tone={moving.length ? 'warn' : undefined} />
        <Stat label="이번 달 이동" value={state.inv.transfers.filter(t => t.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).length} unit="건" foot="요청 기준" />
        <Stat label="외부 보관 품목" value={state.items.filter(i => whs.filter(w => w.type !== '자가').some(w => (stockByWarehouse(state, i[0]).get(w.name) ?? 0) > 0)).length} unit="개" foot="위탁 · 외주처에 있는 재고" tone="info" />
      </Stats>
      <Card className="mb-4">
        <CardHead title="이동 내역" />
        <DataTable
          headers={['이동 번호', '품목', '출발 → 도착', '수량', '요청일', '상태', '']}
          rows={state.inv.transfers.map(t => {
            const item = state.items.find(i => i[0] === t.code);
            return [
              <span key="i" className="font-mono text-caption">{t.id}</span>,
              <NameCell key="n" name={t.name} sub={t.code} />,
              `${t.from} → ${t.to}`,
              `${t.qty} ${item ? unit(item) : ''}`,
              <>{t.date}{t.doneAt && <CellSub>도착 {t.doneAt}</CellSub>}</>,
              <Pill key="s">{t.status}</Pill>,
              t.status === '이동 중' ? <Button key="a" variant="primary" onClick={() => act(d => arriveTransfer(d, t.id), `${t.to} 도착을 확인했어요.`)}>도착 확인</Button> : '',
            ];
          })}
        />
      </Card>
      <Card>
        <CardHead title="창고별 재고" sub="이동 중은 출발했지만 아직 도착 확인 전인 수량이에요." />
        <DataTable
          headers={['품목', ...whs.map(w => w.name), IN_TRANSIT]}
          rows={state.items.map(i => {
            const m = stockByWarehouse(state, i[0]);
            return [<NameCell key="n" name={i[1]} sub={i[0]} />, ...whs.map(w => m.get(w.name) || '—'), m.get(IN_TRANSIT) || '—'];
          })}
        />
      </Card>
      <Hint className="mt-4">외주 가공처로 자재를 보낼 때도 창고 이동으로 처리하면, 외주처에 있는 자재를 재고로 계속 볼 수 있어요.</Hint>

      <ModalForm open={dialog === 'move'} onClose={() => setDialog(null)} title="창고 이동 요청" submitLabel="이동 출고" done="이동 출고했어요. 도착하면 도착 확인을 눌러 주세요." run={(d, f) => startTransfer(d, { code: f.code, from: f.from, to: f.to, qty: f.qty })}>
        <Select name="code" label="품목">{state.items.map(i => <option key={i[0]} value={i[0]}>{i[1]} · 총 {i[4]} {unit(i)}</option>)}</Select>
        <div className="grid grid-cols-2 gap-3">
          <Select name="from" label="출발 창고"><Options values={whs.map(w => w.name)} /></Select>
          <Select name="to" label="도착 창고" defaultValue={whs[1]?.name}><Options values={whs.map(w => w.name)} /></Select>
        </div>
        <Field name="qty" label="수량" type="number" min={0.001} step="0.001" />
      </ModalForm>
      <ModalForm open={dialog === 'wh'} onClose={() => setDialog(null)} title="창고 등록" submitLabel="등록" done="창고를 등록했어요." run={(d, f) => addWarehouse(d, { name: f.name, type: f.type, owner: f.owner })}>
        <Field name="name" label="창고 이름" placeholder="예) 김포 물류센터" />
        <Select name="type" label="구분" defaultValue="자가"><Options values={['자가', '외부 위탁', '외주 가공']} /></Select>
        <Field name="owner" label="관리 담당 · 업체" optional />
      </ModalForm>
    </>
  );
}
