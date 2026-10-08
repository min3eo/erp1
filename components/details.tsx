'use client';

import type { ReactNode } from 'react';
import { unit } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { masterVendors, masterWarehouses } from '@/lib/masters';
import { EmployeeCard } from './employee-card';
import { useErp } from './erp-provider';
import { Avatar, DataTable, DetailField, DetailGrid, Hint, Pill, SettingRow, Subtitle } from './ui';

const H3 = ({ children }: { children: ReactNode }) => <h3 className="mt-7 text-body font-bold">{children}</h3>;
const DrawerHint = ({ children }: { children: ReactNode }) => <Hint className="mt-5">{children}</Hint>;

function ItemDetail({ code }: { code: string }) {
  const { state } = useErp();
  const i = state.items.find(i => i[0] === code);
  if (!i) return null;
  const u = unit(i);
  return (
    <>
      <Pill>{i[2]}</Pill>
      <Subtitle>{i[0]} · 품목 기준정보</Subtitle>
      <H3>기본 정보</H3>
      <DetailGrid>
        <DetailField label="품목명" value={i[1]} />
        <DetailField label="품목 코드" value={i[0]} />
        <DetailField label="품목 유형" value={i[2]} />
        <DetailField label="기본 단위" value={u} />
        <DetailField label="기본 창고" value={i[3]} />
        <DetailField label="사용 상태" value="사용 중" />
      </DetailGrid>
      <H3>재고 · 구매 기준</H3>
      <DetailGrid>
        <DetailField label="현재 정상 재고" value={`${i[4]} ${u}`} />
        <DetailField label="불량 보관" value={`${state.quarantine[i[0]] || 0} ${u}`} />
        <DetailField label="안전재고" value={`${i[5]} ${u}`} />
        <DetailField label="기준 단가" value={money(i[6])} />
      </DetailGrid>
      <DrawerHint>단위 환산 · LOT · 유통기한 관리 여부를 품목별로 설정하는 영역입니다.</DrawerHint>
      <H3>
        관리 옵션 <small className="ml-2 text-tiny font-normal text-muted">화면 예시</small>
      </H3>
      <SettingRow><span>재고 관리 대상</span><Pill>사용</Pill></SettingRow>
      <SettingRow><span>LOT 추적</span><Pill>선택 설정</Pill></SettingRow>
      <SettingRow><span>유통기한 관리</span><Pill>선택 설정</Pill></SettingRow>
    </>
  );
}

function VendorDetail({ code }: { code: string }) {
  const { state } = useErp();
  const v = masterVendors(state).find(v => v.code === code);
  if (!v) return null;
  return (
    <>
      <Pill>{v.type}</Pill>
      <Subtitle>{v.code} · 거래처 기준정보</Subtitle>
      <H3>기본 정보</H3>
      <DetailGrid>
        <DetailField label="거래처명" value={v.name} />
        <DetailField label="유형" value={v.type} />
        <DetailField label="담당자" value={v.owner} />
        <DetailField label="사용 상태" value={v.status} />
      </DetailGrid>
      <H3>거래 조건</H3>
      <DetailGrid>
        <DetailField label="결제 조건" value={v.terms} />
        <DetailField label="통화" value="KRW · 원화" />
        <DetailField label="기본 구매 창고" value="본사 창고" />
        <DetailField label="사업자 정보" value="등록 영역" />
      </DetailGrid>
      <H3>연결된 구매 문서</H3>
      <DataTable compact headers={['발주 번호', '품목', '상태']} rows={state.orders.filter(o => o.vendor === v.name).map(o => [o.id, o.name, <Pill key="s">{o.status}</Pill>])} />
      <Subtitle>연락처·사업자 정보·정산 정보 입력 영역은 후속 설계에 포함됩니다.</Subtitle>
    </>
  );
}

function WarehouseDetail({ code }: { code: string }) {
  const { state } = useErp();
  const w = masterWarehouses(state).find(w => w.code === code);
  if (!w) return null;
  return (
    <>
      <Pill>운영 중</Pill>
      <Subtitle>{w.code} · 창고 기준정보</Subtitle>
      <H3>창고 정보</H3>
      <DetailGrid>
        <DetailField label="창고명" value={w.name} />
        <DetailField label="창고 유형" value={w.type} />
        <DetailField label="관리 부서" value={w.owner} />
        <DetailField label="위치 정보" value="창고 주소 입력 영역" />
      </DetailGrid>
      <H3>보관 품목</H3>
      <DataTable compact headers={['품목', '정상 재고', '단위']} rows={state.items.filter(i => i[3] === w.name).map(i => [i[1], i[4], unit(i)])} />
      <DrawerHint>불량 보관 구역 · 로케이션 · 창고 간 이동을 추가할 수 있는 구조입니다.</DrawerHint>
    </>
  );
}


function CorrectionDetail() {
  return (
    <>
      <Pill>승인 대기</Pill>
      <H3>요청 내용</H3>
      <DetailGrid>
        <DetailField label="신청자" value="민서" />
        <DetailField label="대상일" value="2026.10.06" />
        <DetailField label="기존 기록" value="출근 미기록" />
        <DetailField label="정정 요청" value="09:00 출근" />
      </DetailGrid>
      <H3>정정 사유</H3>
      <p className="my-3">출근 기록을 누락하여 정정 요청합니다.</p>
      <H3>승인 경로</H3>
      <p className="my-3">신청자 → 소속 팀장</p>
      <DrawerHint>정정 승인 화면 예시입니다. 실제 출퇴근 기록은 변경하지 않습니다.</DrawerHint>
    </>
  );
}

function TransferDetail({ index }: { index: number }) {
  const { state } = useErp();
  const done = index > 0;
  return (
    <>
      <Pill>{done ? '이동 완료' : '이동 중'}</Pill>
      <H3>이동 경로</H3>
      <DetailGrid>
        <DetailField label="출발" value={done ? '물류센터' : '본사 창고'} />
        <DetailField label="도착" value={done ? '본사 창고' : '물류센터'} />
        <DetailField label="이동 품목" value={state.items[0]?.[1] || '샘플 품목'} />
        <DetailField label="수량" value={done ? '100 EA' : '20 EA'} />
      </DetailGrid>
      <H3>인계 확인</H3>
      <p className="my-3">이동 출고 → 운송 중 → 도착 확인 → 이동 입고</p>
      <DrawerHint>미도착 수량은 이동 중 재고로 구분하는 화면 예시입니다.</DrawerHint>
    </>
  );
}

function ProductionDetail({ index: n }: { index: number }) {
  const { state } = useErp();
  const status = ['생산 중', '자재 대기', '완료'][n] || '생산 중';
  const plan = [1000, 500, 800][n] || 1000;
  const actual = [720, 0, 800][n] ?? 720;
  const product = n === 2 ? '포장 공정' : state.items[n]?.[1] || '샘플 제품';
  return (
    <>
      <Pill>{status}</Pill>
      <H3>생산 계획</H3>
      <DetailGrid>
        <DetailField label="생산 품목" value={product} />
        <DetailField label="적용 BOM" value="v1.1" />
        <DetailField label="계획" value={plan + ' EA'} />
        <DetailField label="실적" value={actual + ' EA'} />
        <DetailField label="생산 LOT" value="LOT-20261007-A" />
        <DetailField label="작업장" value="본사 공장" />
      </DetailGrid>
      <H3>자재 소요량</H3>
      <DataTable
        compact
        headers={['자재', '필요 수량', '확보 상태']}
        rows={[['기본 원료', '60 kg', <Pill key="s">확보 완료</Pill>], ['용기', '1,000 EA', <Pill key="s">확보 완료</Pill>], ['제품 라벨', '1,000 EA', <Pill key="s">확인 필요</Pill>]]}
      />
      <DrawerHint>생산 실적 등록과 원료 차감은 화면 예시입니다.</DrawerHint>
    </>
  );
}

function IntegrationDetail({ index }: { index: number }) {
  const stock = index > 0;
  return (
    <>
      <Pill>확인 필요</Pill>
      <H3>오류 정보</H3>
      <DetailGrid>
        <DetailField label="대상 시스템" value="이퓨어 슈퍼 어드민" />
        <DetailField label="연동 항목" value={stock ? '재고 전송' : '주문 수신'} />
        <DetailField label="오류 원인" value={stock ? '응답 시간 초과' : '품목 코드 미연결'} />
        <DetailField label="최근 시도" value="2026.10.07 11:20" />
      </DetailGrid>
      <H3>처리 안내</H3>
      <p className="my-3">연결 정보와 품목 매핑을 확인한 뒤 재처리합니다.</p>
      <DrawerHint>실제 API 호출이나 계정 연결은 수행하지 않습니다.</DrawerHint>
    </>
  );
}

export type DetailKind = 'item' | 'vendor' | 'warehouse' | 'employee' | 'correction' | 'transfer' | 'production' | 'integration';

export function useOpenDetail() {
  const { state, openDrawer } = useErp();
  return (kind: DetailKind, key: string | number) => {
    const index = Number(key);
    switch (kind) {
      case 'item': {
        const item = state.items.find(i => i[0] === key);
        if (item) openDrawer(item[1], <ItemDetail code={String(key)} />);
        return;
      }
      case 'vendor': {
        const v = masterVendors(state).find(v => v.code === key);
        if (v) openDrawer(v.name, <VendorDetail code={String(key)} />);
        return;
      }
      case 'warehouse': {
        const w = masterWarehouses(state).find(w => w.code === key);
        if (w) openDrawer(w.name, <WarehouseDetail code={String(key)} />);
        return;
      }
      case 'employee': {
        // Key is the employee name (older callers passed an index into the active staff list).
        const name = typeof key === 'number' ? state.employees.filter(e => !e.left)[key]?.name : key;
        if (name && state.employees.some(e => e.name === name)) openDrawer(name, <EmployeeCard name={name} />);
        return;
      }
      case 'correction': return openDrawer('근태 정정 요청', <CorrectionDetail />);
      case 'transfer': return openDrawer('창고 이동 상세', <TransferDetail index={index} />);
      case 'production': return openDrawer('생산 지시 상세', <ProductionDetail index={index} />);
      case 'integration': return openDrawer('연동 오류 상세', <IntegrationDetail index={index} />);
    }
  };
}
