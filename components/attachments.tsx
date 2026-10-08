'use client';

import { useRef, useState } from 'react';
import { FILE_LIMIT, TOTAL_LIMIT, addAttachment, attachmentBytes, attachmentsOf, removeAttachment } from '@/lib/attachments';
import { useErp } from './erp-provider';
import { useAction } from './form-kit';
import { Button } from './ui';

const readAs = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(Error('파일을 읽지 못했어요.'));
  r.readAsDataURL(file);
});

/** Photos are shrunk (longest side 1600px, then 1200px) and saved as JPEG so receipts fit in browser storage. */
async function toDataUrl(file: File) {
  if (!file.type.startsWith('image/')) return readAs(file);
  const img = await createImageBitmap(file);
  for (const [side, quality] of [[1600, 0.8], [1200, 0.7], [900, 0.6]] as const) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= FILE_LIMIT) return data;
  }
  throw Error('사진이 너무 커서 줄여도 들어가지 않아요.');
}

/** "첨부 N" button for a table row; opens the files of that record in the side drawer. */
export function AttachButton({ refId, title }: { refId: string; title: string }) {
  const { state, openDrawer } = useErp();
  const count = attachmentsOf(state, refId).length;
  return (
    <Button variant="text" onClick={() => openDrawer(`증빙 · ${title}`, <AttachPanel refId={refId} />)} title="영수증 · 세금계산서 · 계약서 사진이나 PDF">
      첨부{count ? ` ${count}` : ''}
    </Button>
  );
}

export function AttachPanel({ refId }: { refId: string }) {
  const { state, mutate, toast } = useErp();
  const act = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = attachmentsOf(state, refId);
  const used = attachmentBytes(state);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const data = await toDataUrl(file);
        mutate(d => addAttachment(d, refId, { name: file.name, type: file.type, data }), `증빙 첨부 · ${file.name}`);
      }
      toast('증빙을 첨부했어요.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted">사진(자동으로 줄여요) · PDF {Math.round(FILE_LIMIT / 1024)}KB까지 · 사용 {(used / 1024 / 1024).toFixed(1)} / {TOTAL_LIMIT / 1024 / 1024}MB</span>
        <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '올리는 중…' : '파일 올리기'}</Button>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => upload(e.target.files)} />
      </div>
      {!files.length && <p className="rounded-lg border border-dashed border-line p-6 text-center text-body text-subtle">아직 첨부한 증빙이 없어요.</p>}
      {files.map(f => (
        <figure key={f.id} className="overflow-hidden rounded-lg border border-line">
          {f.data.startsWith('data:image') ? <img src={f.data} alt={f.name} className="max-h-80 w-full bg-surface-2 object-contain" /> : <div className="grid h-24 place-items-center bg-surface-2 text-caption text-muted">PDF 문서</div>}
          <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-caption">
            <span className="min-w-0 truncate">{f.name}<span className="ml-2 text-subtle">{f.at} · {f.by} · {Math.round(f.size / 1024)}KB</span></span>
            <span className="flex shrink-0 gap-1">
              <a href={f.data} download={f.name} className="px-1.5 text-muted hover:text-ink">내려받기</a>
              <Button variant="text" onClick={() => act(d => removeAttachment(d, f.id), '첨부를 지웠어요.')}>삭제</Button>
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
