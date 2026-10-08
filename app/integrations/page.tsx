'use client';

import { useState } from 'react';
import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Button, Card, DataTable, PageHead, Pill, PreviewNotice, PreviewTabs } from '@/components/ui';

const tabs = ['연결 현황', '품목 매핑', '오류 내역'] as const;
const systems = [
  ['이퓨어 슈퍼 어드민', '상품 · 주문 · 배송', '연결 예시'],
  ['이카운트', '기준정보 · 기초 재고 이전', '이전 예시'],
  ['배송 서비스', '운송장 · 배송 상태', '미연결 예시'],
];

export default function IntegrationsPage() {
  const { state } = useErp();
  const openDetail = useOpenDetail();
  const [tab, setTab] = useState<(typeof tabs)[number]>('연결 현황');

  return (
    <>
      <PageHead title="연동 관리" sub="외부 시스템의 연결 상태와 동기화 결과를 확인하세요." />
      <PreviewNotice />
      <Card>
        <PreviewTabs options={tabs} value={tab} onChange={setTab} />
        {tab === '연결 현황' ? (
          <div className="grid gap-5 p-6.25 md:grid-cols-3">
            {systems.map(([title, desc, status]) => (
              <section key={title} className="rounded-card border border-accent-line p-5.75">
                <span className="mb-4.5 grid size-9.5 place-items-center rounded-card bg-accent-soft text-lg text-accent">{title[0]}</span>
                <h2 className="text-base font-bold">{title}</h2>
                <p className="my-3 text-caption text-subtle">{desc}</p>
                <Pill>{status}</Pill>
                <small className="mt-4.5 block text-tiny text-subtle">실제 계정에 접속하지 않습니다.</small>
              </section>
            ))}
          </div>
        ) : tab === '품목 매핑' ? (
          <DataTable
            headers={['외부 상품', 'ERP 품목 코드', 'ERP 품목', '연결 상태']}
            rows={state.items.filter(i => ['완제품', '상품'].includes(i[2])).map(i => [i[1], i[0], i[1], <Pill key="s">매핑 예시</Pill>])}
          />
        ) : (
          <DataTable
            headers={['발생일', '연동 항목', '원인', '상태', '상세']}
            rows={[
              ['10.07 11:20', '주문 수신', '품목 코드 미연결', <Pill key="s">확인 필요</Pill>, <Button key="d" onClick={() => openDetail('integration', 0)}>상세 보기</Button>],
              ['10.07 10:30', '재고 전송', '응답 시간 초과', <Pill key="s">재처리 대기</Pill>, <Button key="d" onClick={() => openDetail('integration', 1)}>상세 보기</Button>],
            ]}
          />
        )}
      </Card>
    </>
  );
}
