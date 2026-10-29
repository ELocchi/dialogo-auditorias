import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
  if (specifier === '@/lib/audits/request-context') return { url: 'data:text/javascript,export const auditResponseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};export async function readAuditRequestContext(){return globalThis.__changeAccess;}', shortCircuit: true };
  if (specifier === '@/lib/supabase/server') return { url: 'data:text/javascript,export async function createClient(){return globalThis.__changeClient;}', shortCircuit: true };
  if (specifier === '@/lib/publications/admin') return { url: 'data:text/javascript,export function createPublicationClient(){return globalThis.__changeStorage;}', shortCircuit: true };
  if (specifier.startsWith('@/')) specifier = pathToFileURL(path.join(root, 'src', specifier.slice(2))).href;
  if (specifier.startsWith('file:') || specifier.startsWith('.')) {
    const url = new URL(specifier, context.parentURL); const file = fileURLToPath(url);
    if (!path.extname(file) && existsSync(file + '.ts')) return next(url.href + '.ts', context);
  }
  return next(specifier, context);
} });
process.env.APP_URL = 'https://auditorias.exemplo.com.br/';
const { applyItemNotes, rebuildPlanRows, auditChangeNotices, parseAuditChangeRequest, editableItem } = await import('../src/domain/audit-change.ts');
const service = await import('../src/lib/audits/change-requests.ts');

const auditId = '20000000-0000-4000-8000-000000000001';
const workId = '20000000-0000-4000-8000-000000000002';
const requestId = '20000000-0000-4000-8000-000000000003';
const admin = { user: { id: '20000000-0000-4000-8000-000000000004' }, profile: 'ADMINISTRATIVO', engineeringScope: null, administrativeScope: 'QUALIDADE' };
const auditor = { user: { id: '20000000-0000-4000-8000-000000000005' }, profile: 'AUDITOR_QUALIDADE', engineeringScope: null, administrativeScope: null };
const photo = 'a'.repeat(64) + '.jpg';
const criteria = [
  { id: 'item1', code: '01.03', title: 'Acompanhamento', text: 'Descrição', group: '01. Grupo', subgroup: '', source: 'F175', locator: '1', documentedWeight: 5, orientations: [], verificationRule: 'Conforme/Não Conforme' },
  { id: 'item2', code: '01.04', title: 'Armazenamento', text: 'Descrição', group: '01. Grupo', subgroup: '', source: 'F175', locator: '2', documentedWeight: 5, orientations: [], verificationRule: 'Dividido pela quantidade verificada' },
];
const responses = {
  item1: { answer: 'Não conforme', note: 'Texto original', photos: [photo] },
  item2: { note: '', checks: [{ id: 'c1', label: 'Cimento', compliant: false, note: 'Fora do especificado', photos: [] }, { id: 'c2', label: 'Aço', compliant: true, note: '', photos: [] }] },
};
const requestRow = (status = 'accepted', revision = 2) => ({ id: requestId, auditId, workId, workName: 'Obra teste', auditDate: '2026-10-26', module: 'quality',
  criterionId: 'item2', criterionCode: '01.04', criterionTitle: 'Armazenamento', reason: 'Observação do cimento incorreta', status,
  requestedBy: 'Auditor', requestedAt: '2026-10-29T12:00:00Z', decidedBy: status === 'pending' ? null : 'Administrativo', decidedAt: status === 'pending' ? null : '2026-10-29T13:00:00Z',
  refusalReason: status === 'refused' ? 'Está correta' : null, republishedBy: status === 'republished' ? 'Administrativo' : null,
  republishedAt: status === 'republished' ? '2026-10-29T14:00:00Z' : null, previousContentRevision: status === 'republished' ? 0 : null, revision });

test('only the requested item notes change; unknown checks and long notes are rejected', () => {
  const next = applyItemNotes(responses, 'item2', ' Item sem ressalvas ', { c1: ' Cimento sem identificação ' });
  assert.equal(next.item2.note, 'Item sem ressalvas');
  assert.equal(next.item2.checks[0].note, 'Cimento sem identificação');
  assert.deepEqual({ ...next.item2.checks[0], note: '' }, { ...responses.item2.checks[0], note: '' });
  assert.deepEqual(next.item2.checks[1], responses.item2.checks[1]);
  assert.equal(next.item1, responses.item1);
  assert.throws(() => applyItemNotes(responses, 'item2', '', { other: 'x' }), /inexistente/);
  assert.throws(() => applyItemNotes(responses, 'item2', 'x'.repeat(2001), {}), /observação/);
  assert.throws(() => applyItemNotes(responses, 'missing', 'x', {}), /resposta/);
  assert.deepEqual(editableItem(criteria[1], responses.item2).checks, [{ id: 'c1', label: 'Cimento', note: 'Fora do especificado' }, { id: 'c2', label: 'Aço', note: '' }]);
});

test('plan draft keeps what the site team filled for the same finding and drops removed findings', () => {
  const rows = rebuildPlanRows([{ id: 'item1', item: '01.03' }, { id: 'item2:c1', item: '01.04' }],
    [{ id: 'item1', correctiveAction: 'Corrigir', responsible: 'Obra', startDate: '2026-10-01', dueDate: '2026-10-05' }, { id: 'gone', correctiveAction: 'x' }]);
  assert.deepEqual(rows, [
    { id: 'item1', item: '01.03', correctiveAction: 'Corrigir', responsible: 'Obra', startDate: '2026-10-01', dueDate: '2026-10-05' },
    { id: 'item2:c1', item: '01.04', correctiveAction: '', responsible: '', startDate: '', dueDate: '' },
  ]);
});

test('bell: the Administrativo sees what to decide or republish; the auditor sees each answer with the refusal reason', () => {
  const parsed = ['pending', 'accepted', 'refused', 'republished'].map((status) => parseAuditChangeRequest(requestRow(status)));
  assert.ok(parsed.every(Boolean));
  assert.deepEqual(auditChangeNotices(parsed, true).map((item) => item.type), ['audit_change_requested', 'audit_change_accepted']);
  const forAuditor = auditChangeNotices(parsed, false);
  assert.deepEqual(forAuditor.map((item) => item.type), ['audit_change_accepted', 'audit_change_refused', 'audit_change_republished']);
  assert.match(forAuditor[1].detail, /Motivo: Está correta/);
  assert.equal(parseAuditChangeRequest({ ...requestRow(), status: 'unknown' }), null);
  assert.equal(parseAuditChangeRequest({ ...requestRow(), auditId: 'not-a-uuid' }), null);
});

function fixture({ planPublished = false, planDraft = null, revision = 2, status = 'accepted' } = {}) {
  const state = { calls: [], uploads: new Map() };
  const client = { rpc: async (name, args) => {
    state.calls.push({ name, args });
    if (name === 'read_audit_change_source') return { data: { request: requestRow(status, revision),
      audit: { id: auditId, workId, workName: 'Obra teste', modelId: 'quality-f175', date: '2026-10-26', auditor: 'Auditor', criteria, responses,
        evidenceFiles: [photo], safetyClosure: null, reportFileName: 'b'.repeat(64) + '.pdf', contentRevision: 0 }, planPublished, planDraft }, error: null };
    if (name === 'republish_audit_change') return { data: { ...requestRow('republished', revision + 1) }, error: null };
    if (name === 'request_audit_change' && args.p_reason === 'Plano já publicado') return { data: null, error: { code: '55000', message: 'action_plan_already_published' } };
    if (name === 'request_audit_change') return { data: requestRow('pending', 1), error: null };
    throw new Error('Unexpected ' + name);
  } };
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const storage = { storage: { from: (bucket) => ({
    download: async (name) => { assert.equal(bucket, 'published-audits'); assert.equal(name, `${workId}/${auditId}/${photo}`); return { data: new Blob([png]), error: null }; },
    upload: async (name, bytes, options) => { assert.equal(options.upsert, false); state.uploads.set(`${bucket}/${name}`, Uint8Array.from(bytes)); return { error: null }; },
  }) } };
  return { state, client, storage };
}

test('republication builds a new PDF stored by hash and sends only the edited notes', async () => {
  const planDraft = { revision: 1, rows: [{ id: 'item1', correctiveAction: 'Corrigir', responsible: 'Obra', startDate: '2026-10-01', dueDate: '2026-10-05' }] };
  const { state, client, storage } = fixture({ planDraft });
  const result = await service.republishChange(client, admin, requestId, { revision: 2, note: '', checkNotes: { c1: 'Cimento sem identificação' } }, storage);
  assert.equal(result.status, 'republished');
  const [key, pdf] = [...state.uploads][0];
  assert.equal(key, `published-audits/${workId}/${auditId}/${createHash('sha256').update(pdf).digest('hex')}.pdf`);
  const document = await PDFDocument.load(pdf);
  assert.ok(document.getPageCount() >= 3, 'republished PDF has cover, summary and details');
  const call = state.calls.find((entry) => entry.name === 'republish_audit_change').args;
  assert.equal(call.p_administrative_scope, 'QUALIDADE');
  assert.equal(call.p_expected_revision, 2);
  assert.equal(call.p_report_file_name, key.split('/').at(-1));
  assert.equal(call.p_responses.item2.checks[0].note, 'Cimento sem identificação');
  assert.deepEqual(call.p_responses.item1, responses.item1);
  assert.deepEqual(call.p_plan_rows.map((row) => [row.id, row.correctiveAction]), [['item1', 'Corrigir'], ['item2:c1', '']]);
});

test('republication is refused before any upload when the plan is published or the request moved on', async () => {
  for (const options of [{ planPublished: true }, { revision: 3 }, { status: 'pending' }]) {
    const { state, client, storage } = fixture(options);
    await assert.rejects(service.republishChange(client, admin, requestId, { revision: 2, note: '', checkNotes: {} }, storage), (error) => error.status === 409);
    assert.equal(state.uploads.size, 0);
  }
  const { client, storage } = fixture();
  await assert.rejects(service.republishChange(client, auditor, requestId, { revision: 2, note: '' }, storage), (error) => error.status === 403);
});

test('requests validate the reason locally and map database refusals to clear messages', async () => {
  const { client } = fixture();
  await assert.rejects(service.requestChange(client, auditor, auditId, { criterionId: 'item1', reason: ' ab ' }), /pelo menos 5/);
  await assert.rejects(service.requestChange(client, admin, auditId, { criterionId: 'item1', reason: 'Motivo válido' }), (error) => error.status === 403);
  await assert.rejects(service.requestChange(client, auditor, auditId, { criterionId: 'item1', reason: 'Plano já publicado' }),
    (error) => error.status === 409 && /plano de ação desta auditoria já foi publicado/.test(error.message));
  assert.equal((await service.requestChange(client, auditor, auditId, { criterionId: 'item1', reason: 'Motivo válido' })).status, 'pending');
  await assert.rejects(service.decideChange(client, admin, requestId, { revision: 1, accept: false, refusalReason: '' }), /motivo da recusa/);
});

test('routes require a session and the same origin for changes', async () => {
  globalThis.__changeAccess = { context: null, status: 401 };
  let response = await service.changeRequestRoute(new Request('https://auditorias.exemplo.com.br/api/audits/change-requests'), async () => ({}));
  assert.equal(response.status, 401);
  globalThis.__changeAccess = { context: admin, status: 200 };
  globalThis.__changeClient = {};
  response = await service.changeRequestRoute(new Request('https://auditorias.exemplo.com.br/api/x', { method: 'POST', headers: { origin: 'https://outro.exemplo' } }), async () => ({}));
  assert.equal(response.status, 403);
  response = await service.changeRequestRoute(new Request('https://auditorias.exemplo.com.br/api/x', { method: 'POST', headers: { origin: 'https://auditorias.exemplo.com.br' } }), async () => ({ ok: true }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
