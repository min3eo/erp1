'use client';

import { WithholdingTab, TAX_NOTE } from '@/components/tax-tabs';
import { Hint, PageHead } from '@/components/ui';

export default function WithholdingPage() {
  return (
    <>
      <PageHead title="원천징수" sub="급여 · 일용 노임 · 프리랜서 · 강사료에서 떼어 둔 세금을 지급한 달별로 모아요. 다음 달 10일까지 원천징수이행상황신고서로 신고 · 납부합니다." />
      <WithholdingTab />
      <Hint className="mt-4">{TAX_NOTE}</Hint>
    </>
  );
}
