'use client';

import { VatTab, TAX_NOTE } from '@/components/tax-tabs';
import { Hint, PageHead } from '@/components/ui';

export default function VatPage() {
  return (
    <>
      <PageHead title="부가세" sub="분기별 매출세액과 매입세액을 장부에서 바로 모아 납부 · 환급 세액을 계산해요. 1 · 3분기는 예정, 2 · 4분기는 확정 신고예요." />
      <VatTab />
      <Hint className="mt-4">{TAX_NOTE}</Hint>
    </>
  );
}
