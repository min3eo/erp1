'use client';

import { useState, type ReactNode } from 'react';
import { useErp } from '@/components/erp-provider';
import { Button, Card, DataTable, PageHead, Pill, SectionTitle, SettingRow, Subtitle, Switch, Tabs } from '@/components/ui';
import { inputClass } from '@/components/form-kit';
import { warehouses } from '@/lib/inventory';
import { companyProfile, setCompanyProfile, type CompanyProfile } from '@/lib/operations-report';
import { normalize, type ErpState, type Modules } from '@/lib/flow-core';

const tabs = ['회사 정보', '사용 모듈', '단위 · 번호 규칙', '백업 · 복원'] as const;
const moduleRows: [keyof Modules, string, string][] = [
  ['erp', '구매 · 판매 · 재고', '품목과 거래처, 구매·입출고 업무'],
  ['hr', '인사 · 근태 · 휴가', '구성원과 조직, 근무·휴가 현황'],
  ['manufacturing', '제조 관리', 'BOM, 생산 계획과 진행 현황'],
  ['collab', '협업', '프로젝트 피드, 5단계 업무, 간트차트, 메신저'],
];

const profileFields: [keyof CompanyProfile, string, string][] = [
  ['name', '상호 (법인명)', '(주)이퓨어'], ['bizNo', '사업자등록번호', '000-00-00000'], ['ceo', '대표자', ''], ['phone', '대표 전화', ''],
  ['address', '사업장 주소', ''], ['email', '세금계산서 받을 이메일', ''], ['bizType', '업태', '제조업'], ['bizItem', '종목', '화장품'],
];

/** 회사 정보: printed on tax invoices, statements and reports. */
function CompanyForm() {
  const { state, companyInfo, mutate, toast } = useErp();
  const p = companyProfile(state, companyInfo);
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        try {
          mutate(d => setCompanyProfile(d, f), '회사 정보 저장');
          setError('');
          toast('회사 정보를 저장했어요. 세금계산서와 출력물에 바로 반영돼요.');
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <div className="grid gap-x-5 sm:grid-cols-2">
        {profileFields.map(([k, label, ph]) => (
          <label key={k} className="my-2.5 block text-caption font-medium text-ink-2">
            {label}
            <input name={k} defaultValue={p[k]} placeholder={ph} className={inputClass} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-caption text-danger" role="alert">{error}</span>
        <Button variant="primary" type="submit">저장</Button>
      </div>
      {!state.books.company && <p className="mt-2 text-tiny text-subtle">아직 샘플 값이에요. 실제 사업자등록증 내용으로 바꿔 저장하세요.</p>}
    </form>
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

function BackupPanel() {
  const { state, mutate, toast, company } = useErp();
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `tessel_${company}_${new Date().toLocaleDateString('sv-SE')}.json` }).click();
    URL.revokeObjectURL(url);
    toast('백업 파일을 내려받았어요.');
  };
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ErpState;
      if (!Array.isArray(parsed.items) || !Array.isArray(parsed.orders)) throw Error('tessel 백업 파일이 아니에요.');
      mutate(d => {
        Object.keys(d).forEach(k => delete (d as unknown as Record<string, unknown>)[k]);
        Object.assign(d, normalize(parsed));
      }, `백업 복원 · ${file.name}`);
      toast('백업을 복원했어요.');
    } catch (e) {
      toast((e as Error).message || '파일을 읽지 못했어요.', 'error');
    }
  };
  return (
    <>
      <SettingRow>
        <div>
          <strong>전체 데이터 백업</strong>
          <p className="my-1 text-xs text-muted">거래 · 장부 · 인사 · 설정을 JSON 파일 하나로 내려받아요. 장부와 증빙은 5년 보관 의무가 있어요.</p>
        </div>
        <Button variant="primary" onClick={save}>백업 내려받기</Button>
      </SettingRow>
      <SettingRow>
        <div>
          <strong>백업에서 복원</strong>
          <p className="my-1 text-xs text-muted">지금 회사의 데이터를 백업 파일 내용으로 바꿔요. 바꾸기 전에 먼저 백업해 두세요.</p>
        </div>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-line bg-surface px-3 text-body font-medium hover:bg-surface-2">
          파일 선택
          <input type="file" accept="application/json" className="hidden" onChange={e => restore(e.target.files?.[0])} />
        </label>
      </SettingRow>
      <ResetRow />
    </>
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
        <CompanyForm />
        <SectionTitle>창고 · 보관 장소</SectionTitle>
        <DataTable
          foot={false}
          headers={['창고', '유형', '담당']}
          rows={warehouses(state).map(w => [w.name, <Pill key="t">{w.type}</Pill>, w.owner])}
        />
        <Subtitle>기본 통화는 원화(KRW), 회계연도는 1월 1일 ~ 12월 31일 기준이에요. 외화 거래는 회계 › 수출입 · 외화에서 다뤄요.</Subtitle>
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
      </>
    );
  } else if (tab === '백업 · 복원') {
    body = <BackupPanel />;
  } else {
    body = (
      <>
        <SectionTitle>단위 기준</SectionTitle>
        <DataTable
          headers={['단위 코드', '단위명', '수량 자릿수', '사용 대상']}
          rows={[['EA', '개', '정수', '완제품 · 상품 · 부자재'], ['KG', '킬로그램', '소수 3자리', '원료 · 반제품'], ['BOX', '박스', '정수', '포장 단위 예시']]}
        />
        <SectionTitle>문서 번호 접두어</SectionTitle>
        <DataTable
          foot={false}
          headers={['문서', '접두어', '설명']}
          rows={[
            ['구매 발주', 'PO', '구매 요청 · 발주'], ['판매 주문', 'SO', '주문 · 출고'], ['생산 지시', 'MO', 'BOM 기준 생산'], ['전표', 'JV', '전표 입력 · 계좌/카드 · 결산'],
            ['세금계산서', 'TI', '매출 발행 · 매입 수취 · 수정분'], ['매출 · 매입 거래', 'SL · PU', '매출매입거래'], ['계약', 'CT · LC', '매출 · 매입 계약, 근로계약'], ['고정자산', 'FA', '취득 · 상각 · 처분'],
          ]}
        />
        <Subtitle>번호는 접두어와 겹치지 않는 고유값으로 자동으로 붙어요. 예전 시스템 번호를 그대로 쓰려면 데이터 가져오기에서 품목코드처럼 직접 넣으세요.</Subtitle>
      </>
    );
  }

  return (
    <>
      <PageHead title="회사 설정" sub="세금계산서에 찍히는 회사 정보, 사용할 업무 모듈, 단위 기준과 백업을 관리해요." />
      <Card>
        <div className="border-b border-line px-3 py-2"><Tabs options={tabs} value={tab} onChange={setTab} /></div>
        <div className="p-4 sm:p-6">{body}</div>
      </Card>
    </>
  );
}
