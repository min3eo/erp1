'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, CardHead, CellSub, DataTable, FilterToolbar, NameCell, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { reorderSuggestions, requestReorder } from '@/lib/finance';
import { unit } from '@/lib/flow-core';
import { money } from '@/lib/format';

export default function InventoryPage() {
  const { state, mutate, toast } = useErp();
  const suggestions = reorderSuggestions(state);
  const reorder = (codes: string[]) => {
    let made = 0;
    const errors: string[] = [];
    for (const code of codes) {
      try {
        mutate(d => requestReorder(d, code));
        made++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    if (made) toast(`구매 요청 ${made}건을 만들었어요. 결재함에서 승인해 주세요.`);
    else if (errors.length) toast(errors[0], 'info');
  };
  const openForm = useOpenForm();
  const list = useListFilter();
  const rows = state.items
    .filter(i => (list.filter === '전체' || (list.filter === '재고 부족' ? i[4] < i[5] : i[2] === list.filter)) && list.matches(...i))
    .map(i => {
      const low = i[4] < i[5];
      return [
        i[0],
        <span key="n" className="font-semibold">{i[1]}</span>,
        i[2],
        i[3],
        <>
          <strong className={low ? 'text-warn' : ''}>{i[4].toLocaleString()}</strong> <span className="text-tiny text-subtle">{unit(i)}</span>
        </>,
        i[5],
        <>
          <Pill>{low ? '재고 부족' : '정상'}</Pill>
          {state.quarantine[i[0]] ? <CellSub className="text-warn">불량 {state.quarantine[i[0]]} 별도 보관</CellSub> : null}
        </>,
      ];
    });

  return (
    <>
      <PageHead
        title="재고 관리"
        sub="품목별 재고를 확인하고, 부족한 품목을 미리 준비하세요."
        action={<Button variant="primary" onClick={() => openForm('item')}>＋ 품목 등록</Button>}
      />
      <Stats>
        <Stat label="전체 품목" value={state.items.length} unit="개" foot="품목 기준정보" />
        <Stat label="재고 부족" value={state.items.filter(i => i[4] < i[5]).length} unit="개" foot="안전재고 미만" tone="orange" />
        <Stat label="보유 재고 금액" value={money(state.items.reduce((s, i) => s + i[4] * i[6], 0))} unit="" foot="샘플 단가 기준" />
        <Stat label="관리 창고" value={new Set(state.items.map(i => i[3])).size} unit="개" foot="품목에 연결된 창고" />
      </Stats>
      {suggestions.length > 0 && (
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
        <FilterToolbar tabs={['전체', '완제품', '원료', '부자재', '재고 부족']} list={list} />
        <DataTable headers={['품목 코드', '품목명', '유형', '창고', '현재 재고', '안전재고', '상태']} rows={rows} />
      </Card>
    </>
  );
}
