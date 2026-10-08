'use client';

import { useErp } from '@/components/erp-provider';
import { ButtonLink, Card, DataTable, FilterToolbar, PageHead, Pill, useListFilter, IdLink } from '@/components/ui';
import { money } from '@/lib/format';
import { PREVIEW_DOCUMENT_ID, previewDocuments } from '@/lib/masters';

export default function DocumentsPage() {
  const { state, company } = useErp();
  const list = useListFilter();
  const rows = previewDocuments(state, company)
    .filter(d => (list.filter === '전체' || d.status === list.filter) && list.matches(d.id, d.vendor, ...d.lines.map(l => l.name)))
    .map(d => [
      <IdLink key="id" id={d.id} href={`/documents/${encodeURIComponent(d.id)}`} />,
      d.vendor,
      d.lines.length + '개 품목',
      money(d.lines.reduce((s, l) => s + l.qty * l.price, 0)),
      <Pill key="s">{d.status}</Pill>,
      d.preview ? <Pill key="p">화면 예시</Pill> : '샘플 입력',
      <ButtonLink key="d" href={`/documents/${encodeURIComponent(d.id)}`}>상세 보기</ButtonLink>,
    ]);

  return (
    <>
      <PageHead
        title="문서 관리"
        sub="구매 문서와 품목별 진행 상황을 한곳에서 확인하세요."
        action={<ButtonLink variant="primary" href={`/documents/${PREVIEW_DOCUMENT_ID}`}>다품목 발주 예시 보기 →</ButtonLink>}
      />
      <Card>
        <FilterToolbar tabs={['전체', '부분 입고', '입고 완료', '승인 대기', '취소']} list={list} />
        <DataTable headers={['발주 번호', '거래처', '품목', '발주 금액', '상태', '구분', '상세']} rows={rows} />
      </Card>
    </>
  );
}
