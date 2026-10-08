'use client';

import { useState, type ReactNode } from 'react';
import { useErp } from '@/components/erp-provider';
import { Button, Card, DataTable, PageHead, Pill, PreviewNotice, PreviewTabs, SectionTitle, SettingRow, Subtitle, Switch } from '@/components/ui';
import type { Modules } from '@/lib/flow-core';

const tabs = ['회사 정보', '사용 모듈', '단위 · 번호 규칙'] as const;
const moduleRows: [keyof Modules, string, string][] = [
  ['erp', '구매 · 판매 · 재고', '품목과 거래처, 구매·입출고 업무'],
  ['hr', '인사 · 근태 · 휴가', '구성원과 조직, 근무·휴가 현황'],
  ['manufacturing', '제조 관리', 'BOM, 생산 계획과 진행 현황'],
  ['collab', '협업', '프로젝트 피드, 5단계 업무, 간트차트, 메신저'],
];

function PreviewInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-caption text-muted">
      {label}
      <input readOnly value={value} className="mt-1.75 block w-full rounded-md border border-accent-line bg-surface px-3 py-2.5 text-xs text-ink-2" />
    </label>
  );
}

function ResetRow() {
  const { resetState, toast } = useErp();
  const [confirming, setConfirming] = useState(false);
  const reset = () => {
    if (confirming) {
      resetState();
      setConfirming(false);
      toast('초기화했어요.');
    } else {
      setConfirming(true);
      toast('샘플 입력을 초기화하려면 한 번 더 눌러주세요.', 'info');
    }
  };
  return (
    <SettingRow>
      <div>
        <strong>샘플 데이터 초기화</strong>
        <p className="my-1 text-xs text-muted">현재 회사의 기존 입력 내역을 처음 상태로 돌립니다.</p>
      </div>
      <Button onClick={reset}>{confirming ? '다시 눌러 초기화' : '초기화'}</Button>
    </SettingRow>
  );
}

export default function SettingsPage() {
  const { state, companyInfo, mutate, toast } = useErp();
  const [tab, setTab] = useState<(typeof tabs)[number]>('회사 정보');

  let body: ReactNode;
  if (tab === '회사 정보') {
    body = (
      <>
        <div className="mb-6.25 flex items-center gap-3.5">
          <span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-[23px] font-bold text-accent">{companyInfo.tile}</span>
          <div>
            <h2 className="text-title font-semibold">{companyInfo.name}</h2>
            <p className="my-1 text-xs text-muted">독립 ERP 워크스페이스 · {companyInfo.business}</p>
          </div>
          <Pill className="ml-auto">사용 중</Pill>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <PreviewInput label="회사명" value={companyInfo.name} />
          <PreviewInput label="기본 통화" value="KRW · 원화" />
          <PreviewInput label="기준 시간대" value="Asia/Seoul" />
          <PreviewInput label="사업장" value="본사 · 물류센터" />
          <PreviewInput label="회계 기준월" value="1월" />
          <PreviewInput label="워크스페이스 코드" value={companyInfo.code} />
        </div>
        <SectionTitle>사업장</SectionTitle>
        <DataTable
          headers={['사업장 코드', '사업장명', '담당 조직', '상태']}
          rows={[['HQ', '본사', '경영지원팀', <Pill key="s">운영 중</Pill>], ['DC', '물류센터', '물류팀', <Pill key="s">운영 중</Pill>]]}
        />
      </>
    );
  } else if (tab === '사용 모듈') {
    body = (
      <>
        {moduleRows.map(([key, title, desc]) => (
          <label key={key} className="flex items-center justify-between border-b border-line py-4.5">
            <div>
              <strong>{title}</strong>
              <p className="my-1 text-xs text-muted">{desc}</p>
            </div>
            <Switch
              checked={state.modules[key]}
              aria-label={`${title} 모듈`}
              onChange={e => {
                const checked = e.target.checked;
                mutate(d => { d.modules[key] = checked; });
                toast('모듈 설정을 저장했어요.');
              }}
            />
          </label>
        ))}
        <Subtitle>모듈 선택은 이 브라우저의 시안 메뉴에만 반영됩니다.</Subtitle>
        <ResetRow />
      </>
    );
  } else {
    body = (
      <>
        <SectionTitle>단위 기준</SectionTitle>
        <DataTable
          headers={['단위 코드', '단위명', '수량 자릿수', '사용 대상']}
          rows={[['EA', '개', '정수', '완제품 · 상품 · 부자재'], ['KG', '킬로그램', '소수 3자리', '원료 · 반제품'], ['BOX', '박스', '정수', '포장 단위 예시']]}
        />
        <SectionTitle>문서 번호 규칙</SectionTitle>
        <DataTable
          headers={['문서 유형', '접두어', '연월', '일련번호', '생성 예시']}
          rows={[['구매 발주', 'PO', 'YYYYMM', '4자리', 'PO-202610-0001'], ['판매 주문', 'SO', 'YYYYMM', '4자리', 'SO-202610-0001'], ['생산 지시', 'MO', 'YYYYMM', '4자리', 'MO-202610-0001']]}
        />
      </>
    );
  }

  return (
    <>
      <PageHead title="회사 설정" sub="회사의 기본 기준과 사용할 업무 모듈을 확인하세요." />
      <PreviewNotice />
      <Card>
        <PreviewTabs options={tabs} value={tab} onChange={setTab} />
        <div className="p-4 sm:p-6">{body}</div>
      </Card>
    </>
  );
}
