/* 증빙 첨부: receipts, invoices and contracts kept as data URLs next to the record they prove (browser storage in this prototype). */
import { currentUser } from './admin';
import { date, id, type ErpState } from './flow-core';

export interface Attachment { id: string; ref: string; name: string; type: string; size: number; data: string; at: string; by: string }

/** Per file and in total; browser storage holds about 5 MB per site. */
export const FILE_LIMIT = 500 * 1024;
export const TOTAL_LIMIT = 3 * 1024 * 1024;

export const attachmentsOf = (state: ErpState, ref: string) => (state.books.attachments ?? []).filter(a => a.ref === ref);
export const attachmentBytes = (state: ErpState) => (state.books.attachments ?? []).reduce((t, a) => t + a.data.length, 0);

export function addAttachment(state: ErpState, ref: string, f: { name: string; type: string; data: string }) {
  if (!ref) throw Error('첨부할 기록을 찾을 수 없어요.');
  if (!/^data:(image\/|application\/pdf)/.test(f.data)) throw Error('사진(JPG · PNG)이나 PDF만 첨부할 수 있어요.');
  if (f.data.length > FILE_LIMIT) throw Error(`파일이 너무 커요. ${Math.round(FILE_LIMIT / 1024)}KB 이하로 올려 주세요. (사진은 자동으로 줄여요)`);
  if (attachmentBytes(state) + f.data.length > TOTAL_LIMIT) throw Error('이 브라우저에 저장할 수 있는 첨부 용량을 넘었어요. 오래된 첨부를 지워 주세요.');
  const u = currentUser(state);
  const a: Attachment = { id: id('AT'), ref, name: f.name.slice(0, 120), type: f.type, size: f.data.length, data: f.data, at: date(), by: u?.name ?? '' };
  (state.books.attachments ||= []).push(a);
  return a;
}

export function removeAttachment(state: ErpState, attachmentId: string) {
  const before = state.books.attachments?.length ?? 0;
  state.books.attachments = (state.books.attachments ?? []).filter(a => a.id !== attachmentId);
  if (state.books.attachments.length === before) throw Error('첨부를 찾을 수 없어요.');
}
