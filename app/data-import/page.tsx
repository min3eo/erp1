'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Button, Card, CardHead, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { IMPORT_KINDS, previewImport, runImport, templateCsv } from '@/lib/import';

const kinds = Object.keys(IMPORT_KINDS);
const labels = kinds.map(k => IMPORT_KINDS[k].label);

/** Korean Excel saves CSV as EUC-KR (CP949); fall back to it when UTF-8 shows broken characters. */
const readText = (file: File, encoding: string) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(Error('파일을 읽지 못했어요.'));
  r.readAsText(file, encoding);
});

export default function DataImportPage() {
  const { state, mutate, toast } = useErp();
  const [label, setLabel] = useState(labels[0]);
  const [text, setText] = useState('');
  const kind = kinds[labels.indexOf(label)];
  const k = IMPORT_KINDS[kind];
  const preview = text.trim() ? previewImport(state, kind, text) : null;
  const good = preview?.rows.filter(r => !r.error).length ?? 0;
  const bad = (preview?.rows.length ?? 0) - good;

  const pick = (l: string) => { setLabel(l); setText(''); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `tessel_${k.label}_양식.csv` }).click();
    URL.revokeObjectURL(url);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    let t = await readText(file, 'utf-8');
    if (t.includes('�')) t = await readText(file, 'euc-kr');
    setText(t);
  };
  const run = () => {
    try {
      const r = mutate(d => runImport(d, kind, text), `데이터 가져오기 · ${k.label} ${good}건`);
      toast(`${k.label} ${r.imported}건을 가져왔어요.${r.skipped ? ` 오류 ${r.skipped}건은 건너뛰었어요.` : ''}`);
      setText('');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <PageHead
        title="데이터 가져오기"
        sub="쓰던 프로그램이나 엑셀의 품목 · 거래처 · 직원 · 잔액을 한 번에 옮겨요. 엑셀에서 표를 복사해 붙여 넣거나 CSV 파일을 올리면, 행마다 검사한 뒤 문제없는 행만 들여요."
      />
      <Stats>
        <Stat label="품목" value={state.items.length} unit="개" foot="지금 등록된 수" />
        <Stat label="거래처" value={state.books.partners.length} unit="곳" foot="기초등록 › 거래처" />
        <Stat label="재직 직원" value={state.employees.filter(e => !e.left).length} unit="명" foot="인사관리" />
        <Stat label="계좌 · 카드" value={state.books.funds.length} unit="개" foot="계좌/카드" />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={labels} value={label} onChange={pick} />
          <Button onClick={download}>양식 내려받기</Button>
        </Toolbar>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-2">
            <label className="text-caption font-medium text-ink-2" htmlFor="paste">엑셀에서 머리글 행까지 복사해 붙여 넣기</label>
            <textarea
              id="paste" value={text} onChange={e => setText(e.target.value)} spellCheck={false}
              placeholder={k.columns.map(c => c.label).join('\t') + '\n' + k.columns.map(c => c.example).join('\t')}
              className="h-44 w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-caption outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
              또는
              <label className="cursor-pointer rounded-md border border-line px-2.5 py-1 hover:bg-surface-2">
                CSV 파일 고르기
                <input type="file" accept=".csv,.txt,text/csv" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <span>엑셀 파일은 ‘다른 이름으로 저장 › CSV’로 저장해서 올려 주세요.</span>
            </div>
          </div>
          <section className="rounded-card border border-line p-4">
            <h2 className="mb-1 text-caption text-muted">{k.label} 열 ({k.desc})</h2>
            <ul className="flex flex-col gap-1.5 text-caption">
              {k.columns.map(c => (
                <li key={c.key} className="flex justify-between gap-2">
                  <span className={cx(c.required && 'font-medium text-ink')}>{c.label}{c.required && <span className="text-danger"> *</span>}</span>
                  <span className="truncate text-subtle">{c.hint ?? c.example}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-tiny text-subtle">열 순서는 상관없어요. 머리글 이름으로 맞춰요. 금액의 쉼표(,)는 지워도 되고 그대로 둬도 돼요.</p>
          </section>
        </div>
      </Card>

      {preview && (
        <Card className="mt-4">
          <CardHead title="미리보기" sub={preview.missing.length ? `필수 열이 없어요: ${preview.missing.join(', ')}` : `정상 ${good}건 · 오류 ${bad}건`}>
            <Button variant="primary" disabled={!good || preview.missing.length > 0} onClick={run}>정상 {good}건 가져오기</Button>
          </CardHead>
          {!preview.missing.length && (
            <DataTable
              headers={['행', ...k.columns.map(c => c.label), '검사 결과']}
              rows={preview.rows.map(r => [
                r.line,
                ...k.columns.map(c => r.values[c.key] || <span key={c.key} className="text-subtle">—</span>),
                r.error ? <span key="e" className="text-caption text-danger">{r.error}</span> : <Pill key="ok" tone="ok">정상</Pill>,
              ])}
            />
          )}
        </Card>
      )}
      <Hint className="mt-4">순서는 계좌 · 카드 → 거래처 → 품목 → 직원 → 기초 잔액을 권해요. 가져온 기록은 변경 이력에 남고, 품목의 기초 수량은 기초 재고로 장부에 들어가요.</Hint>
    </>
  );
}
