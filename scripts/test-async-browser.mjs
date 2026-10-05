import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/private/tmp/dialogo-safety-browser/node_modules/playwright/index.mjs');
const base = process.env.ASYNC_TEST_URL || 'http://127.0.0.1:3010';
const out = path.resolve(process.env.ASYNC_EVIDENCE || 'docs/evidence/async-flows-20261005');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const auditId = 'a1000000-0000-4000-8000-000000000002';
const actorId = 'a1000000-0000-4000-8000-000000000001';
const audit = { workName: 'Obra de teste', audit: { id: auditId, workId: auditId, modelId: 'quality-f175', date: '2026-10-05', auditor: 'Auditor de teste', auditorId: actorId, status: 'Em preenchimento', collectionStatus: 'Em preenchimento', calculationStatus: 'Aguardando configuração', finalScore: null, isDemo: false }, responses: {}, criteria: [], revision: 1, fvsServices: [] };
const row = { id: 'row-1', item: '01', description: 'Inspeção de teste', nonconformity: 'Correção pendente', correctiveAction: 'Corrigir execução', responsible: 'Engenharia', startDate: '2026-10-05', dueDate: '2026-10-08' };
const { PDFDocument } = await import('pdf-lib');
const pdf = await PDFDocument.create(); pdf.addPage().drawText('PDF de teste'); const pdfBytes = Buffer.from(await pdf.save());
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=', 'base64');
const visible = async (locator) => { await locator.waitFor({ state: 'visible', timeout: 15000 }); };
async function shot(page, name) { await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); await writeFile(path.join(out, `${name}.aria.txt`), await page.locator("main").first().ariaSnapshot()); }
async function check(name, work, options = {}) {
  if (process.env.ASYNC_TEST_FILTER && !name.includes(process.env.ASYNC_TEST_FILTER)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = []; const calls = []; const started = Date.now();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { calls.push({ url: new URL(route.request().url()).pathname, method: route.request().method() }); return json(route, { message: 'Endpoint não previsto no teste' }, 503); });
  // No real Server Action may reach a database during this test.
  await page.route('**/revisao-assincrona*', route => route.request().method() === 'POST' ? route.abort('failed') : route.fallback());
  try { const detail = await work(page); assert.deepEqual(errors.filter(message => !(name.startsWith('Erro de página:') && message.endsWith('Falha simulada na página de teste'))), [], 'No unexpected browser errors'); results.push({ name, passed: true, elapsedMs: Date.now() - started, detail, browserErrors: errors }); }
  catch (error) { await shot(page, `FALHA-${results.length + 1}`).catch(() => {}); results.push({ name, passed: false, error: error.stack, url: page.url(), calls, browserErrors: errors }); }
  finally { await context.close(); console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${name}`); await writeFile(path.join(out, 'progresso.json'), JSON.stringify(results, null, 2)); }
}
const go = async (page, flow) => { await page.goto(`${base}/revisao-assincrona?fluxo=${flow}`, { waitUntil: 'domcontentloaded' }); await page.locator('main[data-hydrated="true"]').waitFor(); };

await check('Plano: skeleton, API 503, retry, salvamento lento e dados preservados', async page => {
  let loads = 0, saves = 0, failLoad = true;
  await page.route('**/api/publications/*/plan?*', async route => { loads++; await pause(1600); return failLoad ? json(route, { message: 'Falha de API simulada' }, 503) : json(route, { published: false, revision: 1, rows: [row] }); });
  await page.route('**/api/publications/*/save-plan?*', async route => { saves++; await pause(1600); return saves === 1 ? json(route, { message: 'Falha ao salvar simulada' }, 503) : json(route, { revision: 2 }); });
  await go(page, 'plano'); await visible(page.getByRole('status', { name: 'Carregando plano de ação…' })); await shot(page, '01-plano-carregando');
  await visible(page.getByText('Falha de API simulada')); failLoad = false; await page.getByRole('button', { name: 'Recarregar plano de ação' }).click();
  await visible(page.getByRole('status', { name: 'Carregando plano de ação…' })); assert.equal(await page.getByRole('button', { name: 'Recarregar plano de ação' }).count(), 0);
  await visible(page.getByLabel('Ações corretivas', { exact: false })); await page.getByLabel('Ações corretivas', { exact: false }).fill('Correção mantida depois da falha');
  await visible(page.getByRole('button', { name: 'Salvando…', exact: true })); assert.equal(await page.getByRole('button', { name: 'Salvando…', exact: true }).isDisabled(), true);
  await visible(page.getByText('Falha ao salvar simulada')); assert.equal(await page.getByLabel('Ações corretivas', { exact: false }).inputValue(), 'Correção mantida depois da falha'); await shot(page, '02-plano-falha');
  await pause(2200); assert.equal(saves, 1, 'No automatic replay after failure');
  await page.getByRole('button', { name: 'Tentar salvar', exact: true }).click(); await visible(page.getByText('Rascunho salvo', { exact: true }));
  return { loads, saves, requestDelayMs: 1600, valuePreserved: true };
});

await check('Auditoria: autosave não repete falha; foto mantida no retry; publicação sem duplicação', async page => {
  let saves = 0, publishes = 0; const sizes = [];
  await page.route('**/api/publications?*', route => json(route, { drafts: [audit], plans: [] }));
  await page.route('**/api/publications/*/save-audit?*', async route => { saves++; sizes.push(route.request().postDataBuffer()?.length); await pause(1700); return saves === 1 ? json(route, { message: 'Falha de gravação simulada' }, 503) : json(route, { revision: 2 }); });
  await page.route('**/api/publications/*/publish-audit?*', async route => { publishes++; await pause(1700); return json(route, { ...audit, revision: 3, audit: { ...audit.audit, status: 'Publicada' } }); });
  await go(page, 'auditoria'); await page.getByLabel('Observação').fill('Resposta preservada'); await page.getByLabel('Foto', { exact: true }).setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: png });
  await visible(page.getByText('Enviando fotos e salvando…')); await shot(page, '03-auditoria-upload');
  await visible(page.getByText('Falha de gravação simulada')); await pause(3600); assert.equal(saves, 1, 'No autosave failure loop'); assert.equal(await page.getByLabel('Observação').inputValue(), 'Resposta preservada');
  await page.getByRole('button', { name: 'Tentar salvar', exact: true }).click(); await visible(page.getByText('Rascunho salvo', { exact: true })); assert.equal(sizes[0], sizes[1], 'Photo remains in the retried multipart body');
  await page.getByRole('button', { name: 'Publicar auditoria', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Publicando…' }).isDisabled(), true);
  await visible(page.getByText('Auditoria publicada', { exact: true })); assert.equal(publishes, 1);
  return { saves, publishes, multipartBytes: sizes, failureObservationMs: 3600 };
});

await check('Foto: skeleton, falha visível, retry por teclado, imagem carregada, reduced motion e mobile', async page => {
  let requests = 0;
  await page.route('**/api/revisao-assincrona/foto*', async route => { requests++; await pause(1500); return requests === 1 ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ status: 200, contentType: 'image/png', body: png }); });
  await go(page, 'foto'); await visible(page.getByText('Carregando foto…'));
  const animation = await page.getByText('Carregando foto…').evaluate(el => getComputedStyle(el).animationName); assert.equal(animation, 'none');
  await visible(page.getByText('Foto indisponível')); const retry = page.getByRole('button', { name: 'Recarregar foto: Evidência de teste' }); await retry.focus(); await shot(page, '04-foto-falha-mobile'); await page.keyboard.press('Enter');
  await visible(page.getByText('Carregando foto…')); await page.waitForFunction(() => { const img = document.querySelector('[data-evidence-thumbnail] img'); return img?.complete && img.naturalWidth > 0; });
  assert.equal(await page.getByText('Foto indisponível').count(), 0); const width = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(width <= 390, `No mobile overflow: ${width}`);
  return { requests, animation, viewportWidth: 390, documentWidth: width, naturalWidth: await page.locator('[data-evidence-thumbnail] img').evaluate(img => img.naturalWidth) };
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

await check('Consulta: rede lenta, erro, retry, vazio e resposta antiga não substitui filtro novo', async page => {
  let a = 0, failQuery = true;
  await page.route('**/api/follow-up/reports/a?*', async route => { a++; const failing = failQuery; await pause(failing ? 1500 : 2600); return failing ? json(route, { message: 'Falha' }, 503) : json(route, { available: true, reports: [{ id: 'old', visitId: 'old', title: 'Resposta antiga da obra A', updatedAt: '2026-10-05' }] }); });
  await page.route('**/api/follow-up/reports/b?*', async route => { await pause(400); return json(route, { available: true, reports: [] }); });
  await go(page, 'busca'); await visible(page.getByRole('status', { name: 'Carregando relatórios…' })); await visible(page.getByText('Não foi possível carregar os relatórios.'));
  failQuery = false; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await visible(page.getByRole('status', { name: 'Carregando relatórios…' })); await page.getByLabel('Obra', { exact: true }).selectOption('b');
  await visible(page.getByText('Nenhum relatório nesta obra.')); await pause(2800); assert.equal(await page.getByText('Resposta antiga da obra A').count(), 0); assert.equal(await page.getByLabel('Obra', { exact: true }).inputValue(), 'b'); await shot(page, '05-consulta-vazia');
  return { attemptsA: a, selectedWork: 'b', staleResultIgnored: true };
});

await check('Formulário real: falha da Server Action mantém todos os campos e permite retry', async page => {
  let submits = 0;
  await page.route('**/revisao-assincrona*', async route => { if (route.request().method() !== 'POST') return route.fallback(); submits++; await pause(1500); return route.fulfill({ status: 502, contentType: 'text/plain', body: 'Falha de gateway simulada' }); });
  await go(page, 'formulario'); await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de teste'); await page.getByLabel('E-mail corporativo').fill('teste@example.invalid'); await page.getByLabel('Crie sua senha').fill('Senha-ficticia-123'); await page.getByLabel('Confirme sua senha').fill('Senha-ficticia-123');
  await page.getByRole('button', { name: 'Solicitar acesso', exact: true }).click(); await visible(page.getByRole('button', { name: 'Enviando solicitação…' })); assert.equal(await page.getByLabel('Nome completo', { exact: true }).isDisabled(), true);
  await visible(page.getByText(/Não foi possível confirmar a operação/)); assert.equal(await page.getByLabel('Nome completo', { exact: true }).inputValue(), 'Pessoa de teste'); assert.equal(await page.getByLabel('E-mail corporativo').inputValue(), 'teste@example.invalid');
  await shot(page, '06-formulario-falha'); await page.getByRole('button', { name: 'Solicitar acesso', exact: true }).click(); await visible(page.getByRole('button', { name: 'Enviando solicitação…' })); await page.getByRole('button', { name: 'Solicitar acesso', exact: true }).waitFor(); assert.equal(submits, 2);
  return { submits, valuesPreserved: true, requestDelayMs: 1500 };
});

await check('Upload de acompanhamento: mantém arquivo após falha e desabilita envio', async page => {
  let uploads = 0;
  await page.route('**/api/follow-up/visits/*/photos?*', route => json(route, { available: true, photos: [] }));
  await page.route('**/api/revisao-assincrona/upload', async route => { uploads++; await pause(1500); return uploads === 1 ? json(route, { message: 'Falha' }, 503) : json(route, { ok: true }); });
  await go(page, 'upload'); await visible(page.getByRole('button', { name: 'Escolher foto', exact: true })); await page.locator('input[type=file]').first().setInputFiles({ name: 'acompanhamento.png', mimeType: 'image/png', buffer: png });
  await visible(page.getByText('Enviando foto…', { exact: true })); assert.equal(await page.getByRole('button', { name: 'Escolher foto', exact: true }).isDisabled(), true);
  await visible(page.getByText('Falha ao enviar. A foto foi mantida.')); await visible(page.getByText('acompanhamento.png')); await shot(page, '07-upload-falha'); await page.getByRole('button', { name: 'Tentar enviar' }).click(); await visible(page.getByText('Foto enviada', { exact: true })); assert.equal(uploads, 2);
  return { uploads, retainedFile: 'acompanhamento.png' };
});

await check('Download: feedback imediato, erro, retry e PDF real recebido', async page => {
  let downloads = 0;
  await page.route('**/api/revisao-assincrona/pdf', async route => { downloads++; await pause(1500); return downloads === 1 ? json(route, { message: 'Falha' }, 503) : route.fulfill({ contentType: 'application/pdf', body: pdfBytes, headers: { 'Content-Disposition': 'attachment; filename="teste.pdf"' } }); });
  await go(page, 'download'); await page.getByRole('button', { name: 'Baixar PDF de teste' }).click(); await visible(page.getByText('Baixando…')); assert.equal(await page.getByRole('button', { name: 'Baixar PDF de teste' }).isDisabled(), true);
  await visible(page.getByText('Falha no download. Clique para tentar novamente.')); const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar PDF de teste' }).click(); const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'teste.pdf'); await visible(page.getByText('Download iniciado')); await shot(page, '08-download-sucesso');
  return { downloads, downloadedFile: download.suggestedFilename() };
});

await check('Navegação: loading.tsx visível antes da página lenta', async page => {
  await go(page, 'download'); const started = Date.now(); await page.getByRole('link', { name: 'Página lenta' }).click(); await visible(page.getByRole('status', { name: 'Carregando página…' })); const loadingAfterMs = Date.now() - started; await shot(page, '09-pagina-skeleton'); await visible(page.getByRole('heading', { name: 'Página carregada' }));
  return { serverDelayMs: 2000, loadingAfterMs, completedAfterMs: Date.now() - started };
});

await check('Consulta sem resposta: prazo de 20 segundos libera retry', async page => {
  let calls = 0; const started = Date.now();
  await page.route('**/api/follow-up/reports/*', async route => { calls++; await pause(22_000); await json(route, { available: true, reports: [] }).catch(() => {}); });
  await go(page, 'busca'); await visible(page.getByRole('status', { name: 'Carregando relatórios…' }));
  await page.getByText('Não foi possível carregar os relatórios.').waitFor({ timeout: 25000 });
  assert.equal(await page.getByRole('button', { name: 'Tentar novamente' }).isEnabled(), true); await shot(page, '10-consulta-timeout');
  return { elapsedMs: Date.now() - started, calls, retryEnabled: true };
});

await check('Plano: edição durante salvamento não deixa ação presa', async page => {
  let saves = 0; const values = [];
  await page.route('**/api/publications/*/plan?*', route => json(route, { published: false, revision: 1, rows: [row] }));
  await page.route('**/api/publications/*/save-plan?*', async route => { saves++; values.push(JSON.parse(route.request().postData()).rows[0].correctiveAction); await pause(1400); return json(route, { revision: saves + 1 }); });
  await go(page, 'plano'); const field = page.getByLabel('Ações corretivas', { exact: false }); await field.fill('Primeira edição'); await visible(page.getByRole('button', { name: 'Salvando…', exact: true })); await field.fill('Edição mais recente');
  await visible(page.getByText('Rascunho salvo', { exact: true })); assert.equal(await field.inputValue(), 'Edição mais recente'); assert.equal(await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).isEnabled(), true); assert.deepEqual(values, ['Primeira edição', 'Edição mais recente']);
  return { saves, savedValues: values };
});

await check('Revisão da auditoria real: bloqueia controles enquanto salva e recupera de erro', async page => {
  let submits = 0;
  await page.route('**/api/revisao-assincrona/revisar', async route => { submits++; await pause(1600); return submits === 1 ? json(route, { message: 'Não foi possível salvar. Tente novamente.' }, 503) : json(route, { ok: true }); });
  await go(page, 'revisar'); await page.getByRole('button', { name: 'Revisar auditoria' }).click(); await visible(page.getByRole('button', { name: 'Salvando…', exact: true })); assert.equal(await page.getByRole('button', { name: 'Salvando…', exact: true }).isDisabled(), true); await shot(page, '11-revisao-salvando');
  await visible(page.getByText('Não foi possível salvar. Tente novamente.')); await page.getByRole('button', { name: 'Revisar auditoria' }).click(); await visible(page.getByText('Revisão aberta')); assert.equal(submits, 2); return { submits, failedThenRecovered: true };
});

await check('Erro de página: retry recupera a rota sem recarregar a aplicação inteira', async page => {
  await page.context().addCookies([{ name: 'async-review-fail', value: '1', url: base }]);
  await page.goto(`${base}/revisao-assincrona/falha`, { waitUntil: 'domcontentloaded' });
  await visible(page.getByRole('heading', { name: 'Não foi possível abrir a página' })); await shot(page, '12-pagina-erro');
  await page.context().clearCookies(); await page.getByRole('button', { name: 'Tentar novamente' }).click(); await visible(page.getByRole('heading', { name: 'Página recuperada' }));
  return { errorBoundaryRecovered: true };
});

await check('Foto fora da tela: não expira antes de iniciar o carregamento', async page => {
  let requests = 0;
  await page.clock.install();
  await page.route('**/api/revisao-assincrona/foto*', async route => { requests++; await pause(300); return route.fulfill({ status: 200, contentType: 'image/png', body: png }); });
  await go(page, 'foto-fora'); await page.clock.fastForward(21_000);
  assert.equal(requests, 0, 'Lazy image should not download before reaching the viewport');
  assert.equal(await page.getByText('Foto indisponível').count(), 0, 'No false timeout while offscreen');
  await page.locator('[data-evidence-thumbnail]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const img = document.querySelector('[data-evidence-thumbnail] img'); return img?.complete && img.naturalWidth > 0; });
  assert.equal(requests, 1); return { offscreenClockAdvanceMs: 21000, requestsAfterScroll: requests, noFalseTimeout: true };
});

await browser.close();
await writeFile(path.join(out, 'resultado.json'), JSON.stringify({ date: new Date().toISOString(), base, browser: 'Chrome / Playwright', apiPolicy: 'APIs intercepted; Server Actions blocked; isolated app has no credentials', results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
