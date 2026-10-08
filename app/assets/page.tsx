'use client';

import { useState } from 'react';
import { FundOptions, Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, DetailField, DetailGrid, FilterToolbar, Hint, MiniProgress, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { addAsset, addCapex, decliningRate, depreciation, disposeAsset, fundName, monthOf, type Asset } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';

const categories = ['비품', '기계장치', '차량운반구', '공구와기구', '시설장치', '건물', '소프트웨어'];

export default function AssetsPage() {
  const { state, openDrawer } = useErp();
  const list = useListFilter();
  const [open, setOpen] = useState(false);
  const [disposing, setDisposing] = useState<Asset | null>(null);
  const [capex, setCapex] = useState<Asset | null>(null);
  const today = date();
  const rows = state.books.assets.map(a => ({ a, d: depreciation(a, a.disposed ?? today) }));
  const held = rows.filter(r => !r.a.disposed);
  const sum = (pick: (r: (typeof rows)[number]) => number) => held.reduce((t, r) => t + pick(r), 0);
  const thisMonth = held.reduce((t, r) => t + (r.d.rows.find(x => x.month === monthOf(today))?.amount ?? 0), 0);
  const status = (r: (typeof rows)[number]) => (r.a.disposed ? '처분' : r.d.done ? '상각 완료' : '보유');

  const schedule = (a: Asset) => {
    const d = depreciation(a, a.disposed ?? today);
    let acc = 0;
    openDrawer(a.name, (
      <>
        <DetailGrid>
          <DetailField label="취득일 · 취득가액" value={`${a.date} · ${money(a.cost)}`} />
          <DetailField label="상각 방법" value={`${a.method ?? '정액법'} · ${a.life}년 (${a.life * 12}개월)${a.method === '정률법' ? ` · 상각률 ${(decliningRate(a.life) * 100).toFixed(1)}%` : ''}`} />
          {(a.capex ?? []).map((c, i) => <DetailField key={i} label={`자본적 지출 · ${c.date}`} value={`${c.desc} ${money(c.amount)}`} />)}
          {a.sale && <DetailField label="매각" value={`${a.disposed} · ${money(a.sale.price)} (+부가세 ${money(a.sale.vat)})`} />}
          <DetailField label="월 상각액" value={money(d.monthly)} />
          <DetailField label="장부가액" value={money(d.book)} />
        </DetailGrid>
        <DataTable
          compact
          foot={false}
          headers={['월', '상각 금액', '누계', '장부가액']}
          rows={d.rows.map(r => {
            acc += r.amount;
            return [r.month, money(r.amount), money(acc), money(d.cost - acc)];
          })}
        />
        <p className="mt-3 text-tiny text-subtle">정액법은 남은 금액을 남은 개월에 나누고, 정률법은 매년 초 장부가액에 상각률을 곱해요. 다 상각해도 1,000원을 남겨요(비망가액).</p>
      </>
    ));
  };

  return (
    <>
      <PageHead
        title="고정자산"
        sub="비품 · 설비 · 차량을 등록하면 매달 감가상각비가 자동으로 장부에 들어가요. 처분하면 남은 장부가액은 처분손실로 정리됩니다."
        action={<Button variant="primary" onClick={() => setOpen(true)}>자산 등록</Button>}
      />
      <Stats>
        <Stat label="취득가액 합계" value={money(sum(r => r.d.cost))} unit="" foot={`보유 ${held.length}건`} />
        <Stat label="감가상각누계액" value={money(sum(r => r.d.accumulated))} unit="" foot="오늘까지" />
        <Stat label="장부가액" value={money(sum(r => r.d.book))} unit="" foot="취득가액 − 누계액" tone="info" />
        <Stat label="이번 달 상각비" value={money(thisMonth)} unit="" foot="월말 자동 반영" tone="ok" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '보유', '상각 완료', '처분']} list={list} placeholder="자산 이름, 분류 검색" />
        <DataTable
          headers={['자산', '취득일', '취득가액', '내용연수', '월 상각액', '감가상각누계', '장부가액', '상태', '처리']}
          rows={rows
            .filter(r => (list.filter === '전체' || status(r) === list.filter) && list.matches(r.a.name, r.a.category))
            .map(r => [
              <><strong className="font-medium text-ink">{r.a.name}</strong><CellSub>{r.a.category} · {fundName(state, r.a.settle)}</CellSub></>,
              r.a.date,
              <>{money(r.d.cost)}{r.a.capex?.length ? <CellSub>자본적 지출 {r.a.capex.length}건</CellSub> : null}</>,
              <>{r.a.life}년<CellSub>{r.a.method ?? '정액법'}</CellSub></>,
              money(r.d.monthly),
              <span key="acc" className="flex items-center justify-end gap-2">{money(r.d.accumulated)}<MiniProgress ratio={r.d.accumulated / (r.d.cost - 1000)} className="w-10" /></span>,
              <strong key="b" className="font-medium text-ink">{money(r.d.book)}</strong>,
              <Pill key="s">{status(r)}</Pill>,
              <span key="x" className="flex gap-1.5">
                <Button onClick={() => schedule(r.a)}>상각표</Button>
                {!r.a.disposed && <Button variant="text" onClick={() => setCapex(r.a)}>자본적 지출</Button>}
                {!r.a.disposed && <Button variant="text" onClick={() => setDisposing(r.a)}>처분 · 매각</Button>}
              </span>,
            ])}
        />
      </Card>
      <Hint className="mt-4">감가상각은 취득한 달부터 정액법 또는 정률법으로 계산해요. 세무상 내용연수와 상각 방법은 회사가 신고한 기준에 맞춰 세무사와 확인하세요.</Hint>

      <ModalForm open={open} onClose={() => setOpen(false)} title="고정자산 등록" done="자산을 등록했어요. 이번 달부터 상각이 반영돼요." run={(d, f) => addAsset(d, { name: f.name, category: f.category, date: f.date, cost: f.cost, life: f.life, settle: f.settle, method: f.method })}>
        <Field name="name" label="자산 이름" placeholder="예) 사무용 복합기" />
        <div className="grid grid-cols-2 gap-3">
          <Select name="category" label="분류" defaultValue="비품"><Options values={categories} /></Select>
          <Field name="life" label="내용연수 (년)" type="number" defaultValue={5} />
        </div>
        <Select name="method" label="상각 방법" defaultValue="정액법"><Options values={['정액법', '정률법']} /></Select>
        <p className="-mt-1.5 text-tiny text-subtle">세법상 건물은 정액법, 기계 · 차량 · 비품은 신고하지 않으면 정률법이에요. 회사가 신고한 방법을 고르세요.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="취득일" type="date" defaultValue={today} />
          <Field name="cost" label="취득가액 (원, 부가세 제외)" type="number" />
        </div>
        <Select name="settle" label="결제 방법" defaultValue="BANK-1">
          <option value="외상">외상 (미지급금)</option>
          <FundOptions funds={state.books.funds} />
        </Select>
      </ModalForm>

      <ModalForm open={!!disposing} onClose={() => setDisposing(null)} title={`${disposing?.name ?? ''} 처분 · 매각`} submitLabel="처분 확정" done="처분했어요. 장부가액과의 차이는 처분손익으로 정리했어요." run={(d, f) => disposeAsset(d, disposing!.id, f.date, { price: f.price, fund: f.fund })}>
        <p className="text-body text-muted">처분일이 속한 달까지 상각해요. 팔았으면 매각 금액(부가세 제외)을 넣으면 부가세 10%가 매출세액으로 잡히고, 장부가액과의 차이가 처분이익 · 손실이 돼요. 폐기면 비워 두세요.</p>
        <Field name="date" label="처분일" type="date" defaultValue={today} />
        <div className="grid grid-cols-2 gap-3">
          <Field name="price" label="매각 금액 (공급가, 원)" type="number" min={0} optional />
          <Select name="fund" label="받은 계좌" defaultValue="BANK-1"><FundOptions funds={state.books.funds} kinds={['계좌', '현금']} /></Select>
        </div>
        {disposing && <p className="text-tiny text-subtle">현재 장부가액 {money(depreciation(disposing, today).book)}</p>}
      </ModalForm>

      <ModalForm open={!!capex} onClose={() => setCapex(null)} title={`${capex?.name ?? ''} 자본적 지출`} submitLabel="추가" done="자산 가치에 더하고 남은 기간에 나눠 상각해요." run={(d, f) => addCapex(d, capex!.id, { date: f.date, amount: f.amount, desc: f.desc, settle: f.settle })}>
        <p className="text-body text-muted">성능을 높이거나 수명을 늘리는 개량 · 증설 비용이에요. 고장 수리처럼 원래 상태로 돌리는 비용은 수선비(비용)로 처리하세요.</p>
        <Field name="desc" label="내용" placeholder="예) 자동 라벨러 추가 설치" />
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="지출일" type="date" defaultValue={today} />
          <Field name="amount" label="금액 (공급가, 원)" type="number" />
        </div>
        <Select name="settle" label="결제 방법" defaultValue="BANK-1">
          <option value="외상">외상 (미지급금)</option>
          <FundOptions funds={state.books.funds} />
        </Select>
      </ModalForm>
    </>
  );
}
