'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useErp } from '@/components/erp-provider';
import { Avatar, ButtonLink, Card, CellSub, DataTable, Hint, MiniProgress, NameCell, PageHead, Pill, Subtitle, Tabs, Toolbar, cx } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { previewDocuments, type PurchaseDocument } from '@/lib/masters';

const documentTabs = ['품목 내역', '관련 문서', '처리 이력', '메모 · 첨부'] as const;
type DocumentTab = (typeof documentTabs)[number];

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, company } = useErp();
  const doc = previewDocuments(state, company).find(d => d.id === decodeURIComponent(id));
  const back = <ButtonLink href="/documents">← 문서 목록</ButtonLink>;
  const linked = state.collab.tasks.filter(t => t.ref === decodeURIComponent(id));

  if (!doc) {
    return (
      <>
        <PageHead title="구매 발주 상세" sub="문서를 찾을 수 없어요. 회사를 전환했거나 초기화한 경우 목록에서 다시 선택해 주세요." action={back} />
      </>
    );
  }

  const status = doc.status;
  const steps: [string, string][] = [
    ['구매 요청', '완료'],
    ['승인', status === '승인 대기' ? '대기' : status === '반려' ? '반려' : '완료'],
    ['발주', ['발주 완료', '부분 입고', '입고 완료'].includes(status) ? '완료' : '대기'],
    ['입고', status === '입고 완료' ? '완료' : status === '부분 입고' ? '진행 중' : '대기'],
  ];
  const info: [string, string][] = [
    ['거래처', doc.vendor], ['발주일', doc.date], ['입고 예정일', doc.due], ['담당 부서', '구매팀'],
    ['등록 품목', doc.lines.length + '개'], ['문서 구분', doc.preview ? '화면 예시' : '샘플 입력 내역'],
  ];

  return (
    <>
      <PageHead title="구매 발주 상세" sub="품목별 입고 상태와 관련 문서를 함께 확인하세요." action={back} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_235px]">
        <div className="min-w-0">
          <Card className="p-4.5 sm:p-6.25">
            <div className="mb-6.25 flex items-center justify-between">
              <div>
                <p className="mb-1 text-xs text-muted">구매 발주</p>
                <h2 className="text-title font-semibold sm:text-[18px]">{doc.id}</h2>
              </div>
              <Pill>{doc.status}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-5.5 sm:grid-cols-3">
              {info.map(([k, v]) => (
                <div key={k}>
                  <small className="mb-1.25 block text-caption text-muted">{k}</small>
                  <strong className="text-xs font-medium">{v}</strong>
                </div>
              ))}
            </div>
          </Card>
          {doc.preview && <Hint className="mt-4.5">다품목 발주 화면 예시입니다. 이 문서의 수량과 금액은 실제 시안 재고에 반영되지 않습니다.</Hint>}
          <DocumentTabs doc={doc} />
        </div>
        <Card className="hidden h-fit p-6 lg:block">
          <h2 className="text-title font-semibold">문서 진행 현황</h2>
          {steps.map(([k, s]) => (
            <div key={k} className="mt-5.75 flex items-center gap-3.25">
              <span className={cx('grid size-6.75 place-items-center rounded-full', s === '완료' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-subtle')}>{s === '완료' ? '✓' : '○'}</span>
              <div>
                <strong className="text-xs font-medium">{k}</strong>
                <small className="block text-tiny text-muted">{s}</small>
              </div>
            </div>
          ))}
          <hr className="mt-6 border-line" />
          <Subtitle>입고 수량은 품목별로 관리합니다. 한 품목이 먼저 도착해도 나머지 품목은 미입고로 표시됩니다.</Subtitle>
          {linked.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-caption text-muted">연결된 협업 업무</h3>
              <ul className="flex flex-col gap-1.5">
                {linked.map(t => (
                  <li key={t.id}>
                    <Link href={'/projects/' + t.projectId} className="flex items-center justify-between gap-2 text-body hover:text-accent">
                      <span className="truncate">{t.title}</span>
                      <Pill>{t.status}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function DocumentTabs({ doc }: { doc: PurchaseDocument }) {
  const { state } = useErp();
  const [tab, setTab] = useState<DocumentTab>('품목 내역');
  const related = state.movements.filter(m => m.ref === doc.id);
  const total = doc.lines.reduce((s, l) => s + l.qty * l.price, 0);

  let body: ReactNode;
  if (tab === '품목 내역') {
    body = (
      <>
        <DataTable
          compact
          headers={['품목 · 코드', '입고 창고', '발주 수량', '입고 누계', '미입고', '진행률', '단가', '금액']}
          rows={doc.lines.map(l => [
            <span key="n" className="block min-w-37.5"><NameCell name={l.name} sub={l.code} /></span>,
            l.warehouse,
            `${l.qty} ${l.unit}`,
            `${l.received} ${l.unit}`,
            <strong key="r" className={l.qty > l.received ? 'text-warn' : 'text-ok'}>{F.round(l.qty - l.received)} {l.unit}</strong>,
            <span key="p"><MiniProgress ratio={l.received / l.qty} className="w-11.5" /><CellSub>{Math.round((l.received / l.qty) * 100)}%</CellSub></span>,
            money(l.price),
            money(l.price * l.qty),
          ])}
        />
        <div className="flex items-center justify-end gap-8.75 border-t border-line bg-surface px-5.75 py-5">
          <span className="text-xs text-muted">발주 금액 <small className="block text-tiny text-subtle">공급가 기준</small></span>
          <strong className="text-[18px]">{money(total)}</strong>
        </div>
      </>
    );
  } else if (tab === '관련 문서') {
    body = doc.preview ? (
      <DataTable
        compact
        headers={['문서 유형', '문서 번호', '처리일', '내용', '상태']}
        rows={[
          ['구매 요청', 'REQ-PREVIEW-001', '2026.10.06', '3개 품목 구매 요청', <Pill key="s">승인 완료</Pill>],
          ['구매 발주', doc.id, '2026.10.07', '한빛 공급 발주', <Pill key="s">발주 완료</Pill>],
          ['구매 입고', 'GR-PREVIEW-001', '2026.10.07', '완제품 60 EA 입고', <Pill key="s">입고 완료</Pill>],
          ['구매 입고', 'GR-PREVIEW-002', '2026.10.07', '부자재 500 EA 입고', <Pill key="s">입고 완료</Pill>],
        ]}
      />
    ) : (
      <DataTable compact headers={['처리일', '유형', '품목', '수량', '사유']} rows={related.map(m => [m.date, <Pill key="t">{m.type}</Pill>, m.name, `${m.qty} ${m.unit}`, m.note])} />
    );
  } else if (tab === '처리 이력') {
    body = doc.preview ? (
      <div className="px-7.5 py-6.25">
        {[['구매 요청 등록', '구매팀 · 김하늘', '10.06 10:00'], ['구매 요청 승인', '팀장 · 민서', '10.06 14:20'], ['발주 확정', '구매팀 · 김하늘', '10.07 09:10'], ['1차 부분 입고', '물류팀 · 이서윤', '10.07 11:30']].map(([t, p, d], i, all) => (
          <div key={t} className="relative flex items-center gap-3.75 pb-6">
            {i < all.length - 1 && <span className="absolute top-6 left-1.25 h-7.5 border-l border-accent-line" />}
            <i className="size-2.75 shrink-0 rounded-full border-[3px] border-accent-line bg-accent-soft" />
            <section>
              <strong className="text-xs">{t}</strong>
              <p className="my-0.75 text-caption text-muted">{p}</p>
            </section>
            <small className="ml-auto text-caption text-subtle">{d}</small>
          </div>
        ))}
      </div>
    ) : (
      <DataTable compact headers={['처리일', '변경 내용', '변동 수량', '재고 전후']} rows={related.map(m => [m.date, <Pill key="t">{m.type}</Pill>, `${m.qty} ${m.unit}`, `${m.before} → ${m.after}`])} />
    );
  } else {
    const cancelReason = state.orders.find(o => o.id === doc.id)?.cancelReason;
    body = (
      <div className="p-6.25">
        {doc.preview ? (
          <>
            <div className="flex gap-3">
              <Avatar name="하" />
              <section>
                <strong className="text-xs">김하늘 <small className="ml-1.75 text-tiny font-normal text-subtle">구매팀 · 10.07 09:12</small></strong>
                <p className="text-xs text-muted">원료는 다음 주 입고 예정입니다. 완제품과 용기를 먼저 받아 주세요.</p>
              </section>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-accent-line p-3.25 sm:flex-nowrap">
              <span className="rounded-md bg-danger-soft p-2 text-micro text-danger">PDF</span>
              <div>
                <strong className="text-xs">발주서_한빛공급_1007.pdf</strong>
                <small className="block text-tiny text-subtle">첨부파일 화면 예시 · 248 KB</small>
              </div>
              <Pill tone="gray" className="ml-auto">미리보기 예시</Pill>
            </div>
          </>
        ) : (
          <Subtitle>
            {doc.lines.length}개 품목 발주 내역입니다.{cancelReason ? ' 취소 사유: ' + cancelReason : ' 등록된 메모·첨부파일이 없습니다.'}
          </Subtitle>
        )}
      </div>
    );
  }

  return (
    <Card className="mt-5">
      <Toolbar>
        <Tabs options={documentTabs} value={tab} onChange={setTab} />
      </Toolbar>
      {body}
    </Card>
  );
}
