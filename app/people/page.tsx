'use client';

import { useOpenDetail } from '@/components/details';
import { Avatar, Button, ButtonLink, Card, DataTable, FilterToolbar, PageHead, Pill, Subtitle, useListFilter } from '@/components/ui';
import { href } from '@/lib/nav';
import { people } from '@/lib/seed';

export default function PeoplePage() {
  const openDetail = useOpenDetail();
  const list = useListFilter();
  const rows = people
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => (list.filter === '전체' || p[3] === list.filter) && list.matches(...p))
    .map(({ p, index }) => [
      <div key="n" className="flex items-center gap-2.5"><Avatar name={p[0]} className="size-7.5" /><strong>{p[0]}</strong></div>,
      p[1], p[2], '2025.03.01', '정규직',
      <Pill key="s">{p[3]}</Pill>,
      <Button key="d" onClick={() => openDetail('employee', index)}>상세 보기</Button>,
    ]);

  return (
    <>
      <PageHead title="구성원" sub="직원의 기본 정보와 소속 조직을 한곳에서 확인하세요." action={<ButtonLink href={href('organization')}>조직도 보기 →</ButtonLink>} />
      <Card>
        <FilterToolbar tabs={['전체', '근무 중', '외근', '휴가']} list={list} />
        <DataTable headers={['구성원', '부서', '직책', '입사일', '고용 형태', '오늘 근무', '상세']} rows={rows} />
      </Card>
      <Subtitle>입사일·고용 형태·개인 상세는 샘플 정보입니다.</Subtitle>
    </>
  );
}
