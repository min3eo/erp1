'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, CardHead, DataTable, NameCell, PageHead, Pill, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { unitMaterialCost } from '@/lib/production';

export default function BomPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const products = state.boms.map(b => b.productCode);
  const [code, setCode] = useState(products[0] ?? '');
  const bom = state.boms.find(b => b.productCode === code);
  const item = state.items.find(i => i[0] === code);
  const name = (c: string) => state.items.find(i => i[0] === c)?.[1] ?? c;

  if (!bom || !item) {
    return (
      <>
        <PageHead title="BOM 관리" sub="제품 하나를 만드는 데 필요한 원료와 부자재를 관리해요." />
        <Card><p className="px-4 py-12 text-center text-body text-subtle">등록된 BOM이 없어요. 제조 모듈을 쓰는 회사에서 확인해 주세요.</p></Card>
      </>
    );
  }

  const cost = unitMaterialCost(state, code);
  const usedIn = state.boms.filter(b => b.lines.some(l => l.code === code));
  return (
    <>
      <PageHead
        title="BOM 관리"
        sub="제품 1단위를 만드는 데 필요한 원료·부자재와 소요량이에요. 생산 지시는 이 BOM으로 자재를 출고합니다."
        action={<Button variant="primary" onClick={() => openForm('workOrder')}>＋ 생산 지시</Button>}
      />
      <Stats>
        <Stat label="등록 BOM" value={state.boms.length} unit="개" foot="완제품 · 반제품" />
        <Stat label="구성 자재" value={bom.lines.length} unit="개" foot={`${item[1]} 기준`} />
        <Stat label="단위 재료비" value={money(Math.round(cost))} unit="" foot={`1 ${F.unit(item)} · 자재 기준 단가`} tone="info" />
        <Stat label="기준 단가 대비" value={item[6] ? Math.round((cost / item[6]) * 100) : 0} unit="%" foot={`기준 단가 ${money(item[6])}`} />
      </Stats>
      <Card>
        <Toolbar>
          <Tabs options={products} value={code} onChange={setCode} />
          <span className="flex items-center gap-2 text-caption text-muted"><Pill tone="accent">{bom.version}</Pill>적용 {bom.updated}</span>
        </Toolbar>
        <CardHead title={item[1]} sub={`${code} · ${item[2]} · 1 ${F.unit(item)} 생산 기준${bom.note ? ` · ${bom.note}` : ''}`} />
        <DataTable
          headers={['구성 자재', '유형', '소요량', '단위', '기준 단가', '재료비', '현재 재고']}
          rows={bom.lines.map(l => {
            const m = state.items.find(i => i[0] === l.code);
            return [
              <NameCell key="n" name={name(l.code)} sub={l.code} />,
              m?.[2] ?? '—',
              l.qty,
              m ? F.unit(m) : '',
              money(m?.[6] ?? 0),
              money(Math.round(l.qty * (m?.[6] ?? 0))),
              m ? `${m[4]} ${F.unit(m)}` : '—',
            ];
          })}
        />
      </Card>
      {usedIn.length > 0 && (
        <Card className="mt-4">
          <CardHead title="이 품목을 쓰는 BOM" sub="반제품은 다른 제품의 자재로 들어가요." />
          <DataTable foot={false} headers={['상위 제품', '소요량']} rows={usedIn.map(b => [name(b.productCode), `${b.lines.find(l => l.code === code)!.qty}`])} />
        </Card>
      )}
    </>
  );
}
