'use client';

import { Fragment, useState } from 'react';
import { Card, DataTable, PageHead, Pill, PreviewNotice, PreviewTabs, SectionTitle, SettingRow } from '@/components/ui';

const tabs = ['구매 요청', '재고 조정', '휴가 신청'] as const;
type Tab = (typeof tabs)[number];

const rulesByTab: Record<Tab, string[][]> = {
  '구매 요청': [['100만원 미만', '팀장 승인', '신청자에게 반환', '부서 대결자'], ['100만원 이상', '팀장 → 경영지원', '신청자에게 반환', '부서 대결자']],
  '재고 조정': [['모든 수량 조정', '물류 팀장 → 관리자', '재실사 요청', '물류 대결자']],
  '휴가 신청': [['연차 · 반차', '소속 팀장', '신청자에게 반환', '부서 대결자']],
};

export default function ApprovalSettingsPage() {
  const [tab, setTab] = useState<Tab>('구매 요청');
  const steps = [['신청', '업무 담당자'], ['1차 승인', '소속 팀장'], ['최종 승인', tab === '구매 요청' ? '경영지원 담당' : '업무 관리자']];

  return (
    <>
      <PageHead title="승인 절차 설정" sub="문서 유형과 금액에 따라 승인 순서를 구성하세요." />
      <PreviewNotice />
      <Card>
        <PreviewTabs options={tabs} value={tab} onChange={setTab} />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center gap-2.5 pt-2.5 pb-5.5 sm:flex-row md:gap-6.25">
            {steps.map(([title, owner], i) => (
              <Fragment key={title}>
                <div className="w-full flex-1 rounded-card border border-accent-line bg-surface p-3.75 md:p-5">
                  <span className="grid size-5.75 place-items-center rounded-full bg-accent-soft text-caption text-accent">{i + 1}</span>
                  <h3 className="mt-3 mb-0.75 text-body font-bold">{title}</h3>
                  <p className="my-3 text-xs text-muted">{owner}</p>
                  <Pill>{i === 0 ? '신청자' : '승인자'}</Pill>
                </div>
                {i < steps.length - 1 && <b className="rotate-90 text-subtle sm:rotate-0">→</b>}
              </Fragment>
            ))}
          </div>
          <SectionTitle>승인 규칙</SectionTitle>
          <DataTable headers={['조건', '승인 경로', '반려 처리', '대결자']} rows={rulesByTab[tab]} />
          <SettingRow><span>승인자 부재 시</span><Pill>대결자에게 전달</Pill></SettingRow>
          <SettingRow><span>승인 완료 후 수정</span><Pill>재승인 필요</Pill></SettingRow>
        </div>
      </Card>
    </>
  );
}
