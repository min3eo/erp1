'use client';

import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Button, Card, CardHead, DataTable, PageHead, Pill, PreviewNotice } from '@/components/ui';

function RouteCard({ label, name, owner, status }: { label: string; name: string; owner: string; status: string }) {
  return (
    <Card className="p-6.25">
      <span className="mb-2 block text-caption text-accent">{label}</span>
      <h2 className="text-title font-semibold">{name}</h2>
      <p className="my-3 text-xs text-muted">{owner}</p>
      <Pill>{status}</Pill>
    </Card>
  );
}

export default function TransfersPage() {
  const { state } = useErp();
  const openDetail = useOpenDetail();
  return (
    <>
      <PageHead title="창고 이동" sub="출발 창고에서 이동 중 재고를 거쳐 도착 창고로 인계합니다." />
      <PreviewNotice />
      <div className="mb-6 grid items-center gap-6.25 sm:grid-cols-[1fr_90px_1fr] sm:gap-2.5 md:grid-cols-[1fr_180px_1fr] md:gap-6.25">
        <RouteCard label="출발 창고" name="본사 창고" owner="출고 담당 · 물류팀" status="이동 출고 완료" />
        <div className="h-13.75 rotate-90 text-center text-[32px] text-accent sm:h-auto sm:rotate-0">
          →<small className="hidden text-caption text-muted sm:block">이동 중 20 EA</small>
        </div>
        <RouteCard label="도착 창고" name="물류센터" owner="입고 담당 · 물류팀" status="입고 확인 대기" />
      </div>
      <Card>
        <CardHead title="이동 요청 목록" />
        <DataTable
          headers={['이동 번호', '품목', '출발 → 도착', '수량', '상태', '상세']}
          rows={[
            ['TR-202610-001', state.items[0]?.[1] || '샘플 상품', '본사 → 물류센터', '20 EA', <Pill key="s">이동 중</Pill>, <Button key="d" onClick={() => openDetail('transfer', 0)}>상세 보기</Button>],
            ['TR-202610-002', '포장 부자재', '물류센터 → 본사', '100 EA', <Pill key="s">이동 완료</Pill>, <Button key="d" onClick={() => openDetail('transfer', 1)}>상세 보기</Button>],
          ]}
        />
      </Card>
    </>
  );
}
