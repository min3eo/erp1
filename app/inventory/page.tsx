'use client';

import { useState } from 'react';
import { ToolbarField } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm } from '@/components/form-kit';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, CardHead, CellSub, DataTable, Hint, NameCell, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { reorderSuggestions, requestReorder } from '@/lib/finance';
import { date, unit } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { itemByBarcode, lotBalances, packLabel, setItemMeta, stockAnalysis, stockByWarehouse, stockLedger, valuation } from '@/lib/inventory';

const views = ['재고 현황', '원가 · 평가', '수불부', 'LOT · 유통기한', '분석', '품목 설정'] as const;
type View = (typeof views)[number];

export default function InventoryPage() {
  const { state, mutate, toast, openDrawer } = useErp();
  const openForm = useOpenForm();
  const today = date();
  const [view, setView] = useState<View>('재고 현황');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const suggestions = reorderSuggestions(state);
  const values = valuation(state);
  const totalValue = values.reduce((t, v) => t + v.value, 0);
  const scanned = query.trim().length >= 8 ? itemByBarcode(state, query) : undefined;
  const hit = (...v: (string | number | undefined)[]) => !query || !!scanned || v.join(' ').toLowerCase().includes(query.toLowerCase());
  const items = state.items.filter(i => (scanned ? i[0] === scanned[0] : hit(...i, state.inv.meta[i[0]]?.barcode)));

  const reorder = (codes: string[]) => {
    let made = 0;
    const errors: string[] = [];
    for (const code of codes) {
      try {
        mutate(d => requestReorder(d, code), '발주 제안으로 구매 요청');
        made++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    if (made) toast(`구매 요청 ${made}건을 만들었어요. 결재함에서 승인해 주세요.`);
    else if (errors.length) toast(errors[0], 'info');
  };

  const showLot = (code: string, lot: string) => {
    const l = lotBalances(state, code).find(x => x.lot === lot);
    if (!l) return;
    openDrawer(`${lot} 추적`, (
      <DataTable compact foot={false} headers={['출고일', '관련 문서', '수량', '거래처']} rows={l.out.map(o => [o.date, <span key="r" className="font-mono text-caption">{o.ref}</span>, o.qty, state.sales.find(s => s.id === o.ref)?.customer ?? (state.workOrders.some(w => w.id === o.ref) ? '생산 투입' : '—')])} />
    ));
  };

  let body;
  if (view === '재고 현황') {
    body = (
      <DataTable
        headers={['품목', '유형', '창고별 재고', '현재 재고', '안전재고', '상태']}
        rows={items.map(i => {
          const low = i[4] < i[5];
          const byWh = [...stockByWarehouse(state, i[0])].filter(([, q]) => q);
          const pack = packLabel(state, i[0], i[4]);
          return [
            <NameCell key="n" name={i[1]} sub={`${i[0]}${state.inv.meta[i[0]]?.barcode ? ' · ' + state.inv.meta[i[0]].barcode : ''}`} />,
            i[2],
            <span key="w" className="flex flex-col text-caption">{byWh.map(([w, q]) => <span key={w}>{w} <strong className="font-medium">{q}</strong></span>)}</span>,
            <><strong className={low ? 'text-warn' : ''}>{i[4].toLocaleString()}</strong> <span className="text-tiny text-subtle">{unit(i)}</span>{pack && <CellSub>{pack}</CellSub>}</>,
            i[5],
            <><Pill>{low ? '재고 부족' : '정상'}</Pill>{state.quarantine[i[0]] ? <CellSub className="text-warn">불량 {state.quarantine[i[0]]} 별도 보관</CellSub> : null}</>,
          ];
        })}
      />
    );
  } else if (view === '원가 · 평가') {
    body = (
      <DataTable
        headers={['품목', '보유 수량', '기준 단가', '이동평균 단가', '차이', '평가액']}
        rows={values.filter(v => items.some(i => i[0] === v.code)).map(v => [
          <NameCell key="n" name={v.name} sub={v.code} />,
          v.qty.toLocaleString(),
          money(v.std),
          money(v.avg),
          <span key="d" className={v.avg > v.std ? 'text-warn' : v.avg < v.std ? 'text-ok' : 'text-subtle'}>{v.std ? `${v.avg >= v.std ? '+' : ''}${Math.round(((v.avg - v.std) / v.std) * 100)}%` : '—'}</span>,
          <strong key="v" className="font-medium text-ink">{money(v.value)}</strong>,
        ])}
      />
    );
  } else if (view === '수불부') {
    body = (
      <DataTable
        headers={['품목', '기초 수량', '입고 수량', '출고 수량', '기말 수량', '기초 금액', '입고 금액', '출고 금액', '기말 금액']}
        rows={stockLedger(state, month).filter(r => items.some(i => i[0] === r.code)).map(r => [
          <NameCell key="n" name={r.name} sub={`${r.code} · ${r.unit}`} />,
          r.open.qty, r.inQty, r.outQty, <strong key="c" className="font-medium">{r.close.qty}</strong>,
          money(r.open.value), money(r.inValue), money(r.outValue), <strong key="v" className="font-medium text-ink">{money(r.close.value)}</strong>,
        ])}
      />
    );
  } else if (view === 'LOT · 유통기한') {
    const lots = lotBalances(state).filter(l => l.qty > 0 && items.some(i => i[0] === l.code)).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    body = (
      <DataTable
        headers={['품목', 'LOT', '입고일', '유통기한', '남은 수량', '출고 이력', '']}
        rows={lots.map(l => {
          const item = state.items.find(i => i[0] === l.code)!;
          const days = l.expiry ? Math.round((Date.parse(l.expiry) - Date.parse(today)) / 86400000) : null;
          return [
            <NameCell key="n" name={item[1]} sub={l.code} />,
            <span key="l" className="font-mono text-caption">{l.lot}</span>,
            l.received,
            l.expiry ? <span key="e" className={days! < 0 ? 'text-danger' : days! <= 90 ? 'text-warn' : ''}>{l.expiry}<CellSub>{days! < 0 ? `${-days!}일 지남` : `D-${days}`}</CellSub></span> : <span key="e" className="text-subtle">관리 안 함</span>,
            `${l.qty} / ${l.inQty} ${unit(item)}`,
            `${l.out.length}건`,
            <Button key="t" variant="text" onClick={() => showLot(l.code, l.lot)}>추적</Button>,
          ];
        })}
      />
    );
  } else if (view === '분석') {
    body = (
      <DataTable
        headers={['품목', '평가액', '최근 출고', '정체 일수', '회전율 (연)', '90일 안 유통기한', '판단']}
        rows={stockAnalysis(state, today).filter(a => items.some(i => i[0] === a.code)).map(a => {
          const dead = a.idle == null ? a.value > 0 : a.idle > 90;
          return [
            <NameCell key="n" name={a.name} sub={a.code} />,
            money(a.value),
            a.last ?? '없음',
            a.idle == null ? '—' : `${a.idle}일`,
            a.turnover ? `${a.turnover.toFixed(1)}회` : '0회',
            a.expiring.length ? <span key="x" className="text-warn">{a.expiring.reduce((t, l) => t + l.qty, 0)} ({a.expiring.length} LOT)</span> : '—',
            <Pill key="p" tone={dead ? 'warn' : 'ok'}>{dead ? '장기 체화' : '정상 회전'}</Pill>,
          ];
        })}
      />
    );
  } else {
    body = (
      <DataTable
        headers={['품목', '바코드', '유통기한 일수', '포장 단위', '입고 검사', '']}
        rows={items.map(i => {
          const m = state.inv.meta[i[0]] ?? {};
          return [
            <NameCell key="n" name={i[1]} sub={i[0]} />,
            m.barcode ? <span key="b" className="font-mono text-caption">{m.barcode}</span> : '—',
            m.shelfLifeDays ? `${m.shelfLifeDays}일` : '—',
            m.pack ? `1 ${m.pack.unit} = ${m.pack.per} ${unit(i)}` : '—',
            m.inspect ? <Pill key="q" tone="info">검사</Pill> : '—',
            <Button key="e" variant="text" onClick={() => setEditing(i[0])}>수정</Button>,
          ];
        })}
      />
    );
  }

  const meta = editing ? state.inv.meta[editing] ?? {} : {};
  return (
    <>
      <PageHead
        title="재고 관리"
        sub="창고별 재고와 이동평균 원가, 수불부, LOT · 유통기한을 한곳에서 봐요. 바코드를 검색창에 찍으면 그 품목만 보여요."
        action={<><ButtonLink href="/print/report/stock">수불부 인쇄</ButtonLink><Button variant="primary" onClick={() => openForm('item')}>＋ 품목 등록</Button></>}
      />
      <Stats>
        <Stat label="전체 품목" value={state.items.length} unit="개" foot="품목 기준정보" />
        <Stat label="재고 부족" value={state.items.filter(i => i[4] < i[5]).length} unit="개" foot="안전재고 미만" tone="orange" />
        <Stat label="재고 평가액" value={money(totalValue)} unit="" foot="이동평균 원가 · 장부 재고자산과 같음" tone="info" />
        <Stat label="유통기한 90일 이내" value={lotBalances(state).filter(l => l.qty > 0 && l.expiry && Date.parse(l.expiry) - Date.parse(today) <= 90 * 86400000).length} unit="LOT" foot="먼저 출고 · 판촉 검토" />
      </Stats>
      {view === '재고 현황' && suggestions.length > 0 && (
        <Card className="mb-4">
          <CardHead title={<>발주 제안 <span className="ml-1 text-muted">{suggestions.length}</span></>} sub="안전재고 미만 품목 · 제안 수량 = 안전재고 × 2 − 보유 − 입고 예정">
            {suggestions.some(x => x.qty > 0) && <Button variant="primary" onClick={() => reorder(suggestions.filter(x => x.qty > 0).map(x => x.item[0]))}>모두 구매 요청</Button>}
          </CardHead>
          <DataTable
            foot={false}
            headers={['품목', '보유 / 안전재고', '입고 예정', '제안 수량', '최근 거래처', '처리']}
            rows={suggestions.map(x => [
              <NameCell key="n" name={x.item[1]} sub={x.item[0]} />,
              <span key="s"><strong className="text-warn">{x.item[4]}</strong> / {x.item[5]} {unit(x.item)}</span>,
              x.incoming ? `${x.incoming} ${unit(x.item)}` : '—',
              x.qty ? `${x.qty} ${unit(x.item)}` : '—',
              x.vendor,
              x.qty > 0 ? <Button key="a" onClick={() => reorder([x.item[0]])}>구매 요청</Button> : <Pill key="a" tone="neutral">발주 진행 중</Pill>,
            ])}
          />
        </Card>
      )}
      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          <span className="flex items-center gap-2">
            {view === '수불부' && <ToolbarField label="월"><input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent outline-none" /></ToolbarField>}
            <SearchInput value={query} onChange={setQuery} placeholder="품목명 · 코드 · 바코드" />
          </span>
        </Toolbar>
        {scanned && <p className="border-b border-line bg-accent-soft px-4 py-2 text-caption text-accent">바코드 {query} → {scanned[1]}</p>}
        {body}
      </Card>
      <Hint className="mt-4">매입은 발주 단가로, 생산품은 투입한 자재 원가로 들어오고, 출고 · 조정 · 이동은 그 시점의 이동평균 단가로 나가요. 장부의 매출원가와 재고자산도 같은 금액을 써요.</Hint>

      {editing && (
        <ModalForm open onClose={() => setEditing(null)} title={`${state.items.find(i => i[0] === editing)?.[1]} 설정`} submitLabel="저장" done="품목 설정을 저장했어요." run={(d, f) => setItemMeta(d, editing, f)}>
          <Field name="barcode" label="바코드 (EAN-13 등)" defaultValue={meta.barcode} optional />
          <Field name="shelfLifeDays" label="유통기한 (제조 · 입고일로부터 일수)" type="number" min={0} defaultValue={meta.shelfLifeDays ?? 0} optional />
          <div className="grid grid-cols-2 gap-3">
            <Field name="packUnit" label="포장 단위 이름" defaultValue={meta.pack?.unit ?? 'BOX'} optional />
            <Field name="packPer" label="1포장 당 수량" type="number" min={0} defaultValue={meta.pack?.per ?? 0} optional />
          </div>
          <label className="my-3 flex items-center gap-2 text-caption font-medium text-ink-2">
            <input type="checkbox" name="inspect" defaultChecked={meta.inspect} className="size-4 accent-accent" />
            입고 검사 대상 (검사 기록을 남겨요)
          </label>
        </ModalForm>
      )}
    </>
  );
}
