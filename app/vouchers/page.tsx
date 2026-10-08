'use client';

import { AttachButton } from '@/components/attachments';
import { useRef, useState, type FormEvent } from 'react';
import { FundOptions, Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, FormShell, ModalForm, Suggestions, dialogClass, inputClass, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, cx, useListFilter } from '@/components/ui';
import { useModalDialog } from '@/components/use-modal-dialog';
import { approverFor, currentUser } from '@/lib/admin';
import {
  EVIDENCE, accountTypes, addCompoundVoucher, addVoucher, allAccounts, approveVoucher, deleteVoucher, evidenceIssue, fundById, monthOf, partnerNames,
  reverseVoucher, updateVoucher, type AccountType, type Voucher, type VoucherKind,
} from '@/lib/books';
import { date, type ErpState } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { depts } from '@/lib/hr';

const kinds: VoucherKind[] = ['출금', '입금', '대체'];
const cell = 'h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-body outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';
const typeOrder: AccountType[] = ['자산', '부채', '자본', '수익', '비용'];

const projectNames = (state: ErpState) => [...new Set([...(state.collab?.projects ?? []).map(p => p.name), ...state.books.vouchers.map(v => v.project).filter((p): p is string => !!p)])];

export default function VouchersPage() {
  const { state } = useErp();
  const act = useAction();
  const list = useListFilter();
  const [editing, setEditing] = useState<Voucher | 'new' | null>(null);
  const [reversing, setReversing] = useState<Voucher | null>(null);
  const me = currentUser(state);
  const canApprove = me?.role === '경리' || me?.role === '관리자';
  const month = monthOf(date());
  const vouchers = state.books.vouchers;
  const thisMonth = vouchers.filter(v => monthOf(v.date) === month);
  const total = (k: VoucherKind) => thisMonth.filter(v => v.kind === k).reduce((t, v) => t + v.lines.reduce((s, l) => s + l.debit, 0), 0);
  const unapproved = vouchers.filter(v => !v.approvedBy && v.origin !== '결산');
  const issues = vouchers.filter(v => evidenceIssue(state, v));
  const editable = (v: Voucher) => (v.origin === '전표 입력' || v.origin === '수입비용') && !v.approvedBy && !v.reversalOf && !v.reversedBy;

  const shown = vouchers.filter(v => {
    const tab = list.filter;
    const pass = tab === '전체' || v.kind === tab || (tab === '미승인' && !v.approvedBy && v.origin !== '결산') || (tab === '증빙 확인' && !!evidenceIssue(state, v));
    return pass && list.matches(v.desc, v.partner, v.dept, v.project, ...v.lines.map(l => l.account));
  });

  const rows = shown.map(v => {
    const side = (debit: boolean) => v.lines.filter(l => (debit ? l.debit : l.credit)).map((l, i) => (
      <span key={i} className="block">{l.fund ? fundById(state, l.fund)?.name ?? l.account : l.account}{v.lines.length > 2 && <span className="ml-1 text-subtle">{money(debit ? l.debit : l.credit)}</span>}</span>
    ));
    const issue = evidenceIssue(state, v);
    const tagsText = [v.partner, v.dept, v.project].filter(Boolean).join(' · ');
    return [
      v.date,
      <Pill key="k" tone={v.kind === '입금' ? 'ok' : v.kind === '출금' ? 'info' : 'neutral'}>{v.kind}</Pill>,
      <><strong className="font-medium text-ink">{v.desc}</strong>{tagsText && <CellSub>{tagsText}</CellSub>}</>,
      side(true),
      side(false),
      money(v.lines.reduce((t, l) => t + l.debit, 0)),
      <span key="e" className="flex flex-col">
        <span className="text-caption text-muted">{v.evidence ?? (v.lines.some(l => l.credit && l.fund && fundById(state, l.fund)?.kind === '카드') ? '신용카드' : '—')}</span>
        {issue && <span className="text-tiny text-warn" title={issue}>{issue.split(' · ')[0]}</span>}
      </span>,
      <span key="s" className="flex flex-col">
        {v.reversedBy ? <Pill tone="neutral">역분개됨</Pill> : v.reversalOf ? <Pill tone="neutral">역분개</Pill> : v.origin === '결산' ? <Pill tone="neutral">결산</Pill> : v.approvedBy ? <Pill tone="ok">승인</Pill> : <Pill tone="warn">미승인</Pill>}
        <span className="text-tiny text-subtle">{v.approvedBy ? `${v.approvedBy} · ${v.approvedAt}` : v.origin}</span>
      </span>,
      <span key="x" className="flex gap-0.5">
        <AttachButton refId={v.id} title={v.desc} />
        {editable(v) && <Button variant="text" onClick={() => setEditing(v)}>수정</Button>}
        {!v.approvedBy && v.origin !== '결산' && (me?.role === '관리자' || me?.role === approverFor(state, '전표', v.lines.reduce((t, l) => t + l.debit, 0))) && <Button variant="text" onClick={() => act(d => approveVoucher(d, v.id, me!), '전표를 승인했어요.')}>승인</Button>}
        {!v.reversedBy && !v.reversalOf && !v.pair && <Button variant="text" onClick={() => setReversing(v)}>역분개</Button>}
        {!v.approvedBy && !v.reversedBy && <Button variant="text" onClick={() => act(d => deleteVoucher(d, v.id), v.origin === '계좌/카드' ? '전표를 지웠어요. 계좌/카드 내역은 미처리로 돌아가요.' : '전표를 지웠어요.')}>삭제</Button>}
      </span>,
    ];
  });

  return (
    <>
      <PageHead
        title="전표 입력"
        sub="거래 화면에서 생기지 않는 돈의 흐름을 직접 적어요. 간단한 건 한 줄 입력으로, 여러 계정이 섞인 건 복합 전표로 넣어요. 경리 · 관리자가 승인하면 확정되고, 그 뒤에는 역분개로만 취소해요."
        action={<Button variant="primary" onClick={() => setEditing('new')}>복합 전표</Button>}
      />
      <Stats>
        <Stat label="이번 달 출금" value={money(total('출금'))} unit="" foot={`${thisMonth.filter(v => v.kind === '출금').length}건`} />
        <Stat label="이번 달 입금" value={money(total('입금'))} unit="" foot={`${thisMonth.filter(v => v.kind === '입금').length}건`} tone="ok" />
        <Stat label="미승인 전표" value={unapproved.length} unit="건" foot={canApprove ? '승인하면 확정돼요 · 결재함에서도 처리' : '전결 규정에 따라 경리 · 관리자가 승인해요'} tone={unapproved.length ? 'warn' : 'ok'} />
        <Stat label="증빙 확인 필요" value={issues.length} unit="건" foot="3만 원 초과 · 적격증빙 없음" tone={issues.length ? 'danger' : 'ok'} />
      </Stats>

      <QuickEntry />

      <Card>
        <FilterToolbar tabs={['전체', ...kinds, '미승인', '증빙 확인']} list={list} placeholder="적요, 계정, 거래처, 부서, 프로젝트 검색" />
        <DataTable headers={['일자', '구분', '적요 · 관리항목', '차변', '대변', '금액', '증빙', '상태', '']} rows={rows} />
      </Card>
      <Hint className="mt-4">
        3만 원(부가세 포함)을 넘는 지출은 세금계산서 · 계산서 · 카드 · 현금영수증 같은 적격증빙을 받아야 해요. 없으면 지출액의 2%가 증빙불비 가산세이고, 접대비는 비용으로 인정받지 못해요. 판매 · 구매 · 급여 전표는 자동으로 만들어지니 여기에 넣지 마세요.
      </Hint>

      <VoucherEditor key={editing === 'new' ? 'new' : editing?.id ?? 'none'} voucher={editing} onClose={() => setEditing(null)} />

      <ModalForm open={!!reversing} onClose={() => setReversing(null)} title="역분개" submitLabel="역분개 전표 만들기" done="반대 분개로 원래 전표를 취소했어요." run={(d, f) => reverseVoucher(d, reversing!.id, f.date)}>
        <p className="text-body text-muted">
          「{reversing?.desc}」의 차변과 대변을 바꾼 전표를 만들어 효과를 없애요. 두 전표 모두 기록에 남아요. 원래 달이 마감됐으면 마감 뒤 날짜로 넣으세요.
        </p>
        <Field name="date" label="역분개 날짜" type="date" defaultValue={date()} />
      </ModalForm>
    </>
  );
}

/** <option>s for every account, with the company's own funds first (value fund:<id>). */
function AccountOptions({ state }: { state: ErpState }) {
  const types = accountTypes(state);
  const funds = state.books.funds;
  return (
    <>
      <option value="">계정 선택</option>
      <optgroup label="계좌 · 현금 · 카드">{funds.map(f => <option key={f.id} value={'fund:' + f.id}>{f.name}</option>)}</optgroup>
      {typeOrder.map(t => (
        <optgroup key={t} label={t}>
          {Object.keys(types).filter(a => types[a] === t && a !== '보통예금' && a !== '현금').map(a => <option key={a} value={a}>{a}</option>)}
        </optgroup>
      ))}
    </>
  );
}

interface Row { account: string; debit: string; credit: string }
const blank = (): Row => ({ account: '', debit: '', credit: '' });

function VoucherEditor({ voucher, onClose }: { voucher: Voucher | 'new' | null; onClose: () => void }) {
  const ref = useModalDialog(!!voucher);
  return (
    <dialog ref={ref} onClose={onClose} className={cx(dialogClass, 'sm:w-[760px]')}>
      {voucher && <EditorBody voucher={voucher === 'new' ? null : voucher} onClose={onClose} />}
    </dialog>
  );
}

function EditorBody({ voucher, onClose }: { voucher: Voucher | null; onClose: () => void }) {
  const { state } = useErp();
  const [rows, setRows] = useState<Row[]>(() =>
    voucher ? voucher.lines.map(l => ({ account: l.fund ? 'fund:' + l.fund : l.account, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' })) : [blank(), blank()],
  );
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const dr = rows.reduce((t, r) => t + (Number(r.debit) || 0), 0), cr = rows.reduce((t, r) => t + (Number(r.credit) || 0), 0);

  return (
    <FormShell
      title={voucher ? '전표 수정' : '복합 전표'}
      submitLabel={voucher ? '저장' : '등록하기'}
      done={voucher ? '전표를 고쳤어요.' : '복합 전표를 등록했어요.'}
      onClose={onClose}
      run={(d, f) => {
        const draft = { date: f.date, desc: f.desc, partner: f.partner, dept: f.dept, project: f.project, evidence: f.evidence, lines: rows };
        return voucher ? updateVoucher(d, voucher.id, draft) : addCompoundVoucher(d, draft);
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[150px_1fr]">
        <Field name="date" label="일자" type="date" defaultValue={voucher?.date ?? date()} />
        <Field name="desc" label="적요" defaultValue={voucher?.desc} placeholder="예) 대표 출장비 가지급 · 숙박비" />
      </div>
      <div className="mt-1 overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[1fr_130px_130px_32px] gap-2 bg-surface-2 px-3 py-2 text-tiny text-muted">
          <span>계정</span><span className="text-right">차변</span><span className="text-right">대변</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_130px_130px_32px] items-center gap-2 border-t border-line px-3 py-2">
            <select aria-label={`${i + 1}번째 줄 계정`} value={r.account} onChange={e => set(i, { account: e.target.value })} className={cell}><AccountOptions state={state} /></select>
            <input aria-label={`${i + 1}번째 줄 차변`} type="number" min={0} value={r.debit} onChange={e => set(i, { debit: e.target.value, ...(e.target.value && { credit: '' }) })} className={cx(cell, 'text-right')} />
            <input aria-label={`${i + 1}번째 줄 대변`} type="number" min={0} value={r.credit} onChange={e => set(i, { credit: e.target.value, ...(e.target.value && { debit: '' }) })} className={cx(cell, 'text-right')} />
            <button type="button" aria-label="줄 삭제" disabled={rows.length <= 2} onClick={() => setRows(rs => rs.filter((_, n) => n !== i))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30">✕</button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_130px_130px_32px] items-center gap-2 border-t border-line bg-surface-2 px-3 py-2 text-body">
          <span className="flex items-center gap-2">
            <Button onClick={() => setRows(rs => [...rs, { ...blank(), ...(dr !== cr && { [dr > cr ? 'credit' : 'debit']: String(Math.abs(dr - cr)) }) }])}>줄 추가</Button>
            <span className={cx('text-caption', dr === cr && dr ? 'text-ok' : 'text-warn')}>{dr === cr ? (dr ? '차대 일치' : '') : `차이 ${money(Math.abs(dr - cr))}`}</span>
          </span>
          <strong className="text-right font-medium tabular-nums">{money(dr)}</strong>
          <strong className="text-right font-medium tabular-nums">{money(cr)}</strong>
          <span />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field name="partner" label="거래처" optional list="editor-partners" defaultValue={voucher?.partner} />
        <Field name="dept" label="부서" optional list="editor-depts" defaultValue={voucher?.dept} />
        <Field name="project" label="프로젝트" optional list="editor-projects" defaultValue={voucher?.project} />
        <label className="my-3 block text-caption font-medium text-ink-2">
          증빙
          <select name="evidence" defaultValue={voucher?.evidence ?? ''} className={inputClass}>
            <option value="">해당 없음</option>
            <Options values={EVIDENCE} />
          </select>
        </label>
      </div>
      <Suggestions id="editor-partners" values={partnerNames(state)} />
      <Suggestions id="editor-depts" values={depts(state)} />
      <Suggestions id="editor-projects" values={projectNames(state)} />
    </FormShell>
  );
}

/** One-line spreadsheet-style entry: keeps date and kind between lines so a stack of receipts goes in fast. */
function QuickEntry() {
  const { state, mutate, toast } = useErp();
  const [kind, setKind] = useState<VoucherKind>('출금');
  const [day, setDay] = useState(date());
  const [error, setError] = useState('');
  const accountRef = useRef<HTMLInputElement>(null);
  const funds = state.books.funds.filter(f => kind !== '입금' || f.kind !== '카드');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      mutate(d => addVoucher(d, { date: day, kind, account: f.account, counter: f.counter, amount: f.amount, desc: f.desc, partner: f.partner, evidence: f.evidence }), '전표 입력 · 전표를 저장했어요.');
      toast('전표를 저장했어요.');
      setError('');
      (['account', 'amount', 'desc', 'partner'] as const).forEach(n => { (form.elements.namedItem(n) as HTMLInputElement).value = ''; });
      accountRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="grid gap-2 p-3 md:grid-cols-[130px_150px_1fr_1fr_110px_120px_1.3fr_1fr_auto] md:items-end">
        <label className="text-tiny text-muted">일자<input type="date" value={day} onChange={e => setDay(e.target.value)} className={cell} required /></label>
        <div className="text-tiny text-muted">
          구분
          <div className="flex h-9 overflow-hidden rounded-md border border-line-strong">
            {kinds.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={k === kind ? 'flex-1 bg-ink text-body text-canvas' : 'flex-1 text-body text-muted hover:text-ink'}>{k}</button>
            ))}
          </div>
        </div>
        <label className="text-tiny text-muted">{kind === '대체' ? '차변 계정' : kind === '출금' ? '쓴 곳 (계정)' : '받은 이유 (계정)'}<input ref={accountRef} name="account" list="voucher-accounts" required autoComplete="off" placeholder="예) 복리후생비" className={cell} /></label>
        {kind === '대체' ? (
          <label className="text-tiny text-muted">대변 계정<input name="counter" list="voucher-accounts" required autoComplete="off" placeholder="예) 미지급금" className={cell} /></label>
        ) : (
          <label className="text-tiny text-muted">{kind === '출금' ? '나간 곳' : '들어온 곳'}<select key={kind} name="counter" required className={cell}><FundOptions funds={funds} kinds={kind === '입금' ? ['현금', '계좌'] : ['현금', '계좌', '카드']} /></select></label>
        )}
        <label className="text-tiny text-muted">금액<input name="amount" type="number" min={1} required className={cell} /></label>
        <label className="text-tiny text-muted">증빙<select name="evidence" defaultValue="" className={cell}><option value="">—</option><Options values={EVIDENCE} /></select></label>
        <label className="text-tiny text-muted">적요<input name="desc" required className={cell} placeholder="예) 사무실 다과" /></label>
        <label className="text-tiny text-muted">거래처<input name="partner" list="voucher-partners" autoComplete="off" className={cell} placeholder="선택" /></label>
        <Button variant="primary" type="submit" className="h-9">저장 ↵</Button>
        <Suggestions id="voucher-accounts" values={allAccounts(state)} />
        <Suggestions id="voucher-partners" values={partnerNames(state)} />
      </form>
      {error && <p className="border-t border-line px-3 py-2 text-caption text-danger" role="alert">{error}</p>}
    </Card>
  );
}
