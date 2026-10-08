'use client';

import { OtherIncomeTab, TAX_NOTE } from '@/components/tax-tabs';
import { Hint, PageHead } from '@/components/ui';

export default function OtherTaxPage() {
  return (
    <>
      <PageHead title="기타원천세" sub="근로자가 아닌 사람에게 준 돈(프리랜서 사업소득 3.3%, 강연료 등 기타소득 8.8%)을 등록하면 원천세를 계산하고 지급액에서 떼어 둬요." />
      <OtherIncomeTab />
      <Hint className="mt-4">{TAX_NOTE}</Hint>
    </>
  );
}
