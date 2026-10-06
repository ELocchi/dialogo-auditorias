import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/private/tmp/dialogo-safety-browser/node_modules/playwright/index.mjs');
const base = process.env.LIST_TEST_URL || 'http://127.0.0.1:3014';
const out = path.resolve(process.env.LIST_EVIDENCE || 'docs/evidence/lists-20261006');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const id = n => `a1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows = Array.from({ length: 1502 }, (_, i) => ({ id: id(10000-i), key: `work:${id(10000-i)}`, at: '2026-10-06T12:00:00+00:00', createdAt: '2026-10-06T12:00:00+00:00', workId: id(i%2+2), workName: `Obra de teste ${i%2 ? 'B' : 'A'}`, module: 'quality', source: 'work', description: `Apontamento ${String(i+1).padStart(4,'0')}`, location: 'Térreo', correction: 'Orientação fictícia para o teste', serious: false, photoFileName: `${id(10000-i)}_${id(11000)}.jpg` }));
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function shot(page, name) { await page.screenshot({ path: path.join(out,`${name}.png`), fullPage: true }); await writeFile(path.join(out,`${name}.aria.txt`), await page.locator('main').ariaSnapshot()); }
async function check(name, run, options = {}) {
 if (process.env.LIST_TEST_FILTER && !new RegExp(process.env.LIST_TEST_FILTER).test(name)) return;
 const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
 const page = await context.newPage(), errors = [], calls = [], control = { lag: 600, fail: false };
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', r => json(r,{ message: 'Unexpected API' },503));
 await page.route('**/revisao-listas*', r => r.request().method() === 'POST' ? r.abort() : r.fallback());
 await page.route('**/api/follow-up/list?*', async route => {
  const params = new URL(route.request().url()).searchParams; calls.push(Object.fromEntries(params));
  await delay(control.lag); if (control.fail) return json(route,{ available:false },503);
  const size = Number(params.get('size')), search = params.get('search')?.toLowerCase(), workId = params.get('workId');
  const filtered = rows.filter(r => (!search || r.description.toLowerCase().includes(search)) && (!workId || r.workId === workId));
  const cursor = params.has('cursor') ? JSON.parse(params.get('cursor')) : null;
  const remaining = cursor ? filtered.filter(r => r.key < cursor.key) : filtered;
  const items = remaining.slice(0,size), hasMore = remaining.length > size, last = items.at(-1);
  return json(route,{ available:true,items,hasMore,nextCursor:hasMore ? { at:last.at,key:last.key }:null });
 });
 const start = Date.now();
 try { const evidence = await run(page, control, calls); assert.deepEqual(errors,[]); results.push({ name, passed:true, elapsedMs:Date.now()-start,evidence }); }
 catch (e) { await shot(page,`FALHA-${results.length}`).catch(()=>{}); results.push({ name,passed:false,error:e.stack,errors,calls }); }
 finally { await context.close(); await writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)); console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`); }
}
const go = async (p, flow='lista') => { await p.goto(`${base}/revisao-listas?fluxo=${flow}`,{waitUntil:'domcontentloaded'}); await p.locator('main[data-hydrated="true"]').waitFor(); };
const ready = async p => p.locator('[data-testid="rows"] li').first().waitFor();
await check('Rede lenta, skeleton, limite e teclado', async (p,c,calls) => {
 c.lag=1800; await go(p); await p.getByRole('status',{name:'Carregando lista…'}).waitFor();
 assert.equal(await p.getByRole('navigation',{name:'Páginas: Apontamentos',exact:true}).count(),0); await shot(p,'01-loading');
 await ready(p); assert.equal(await p.locator('[data-testid="rows"] li').count(),20); assert.equal(calls.length,1);
 const button=p.getByRole('button',{name:'Próxima: Apontamentos',exact:true}); await button.focus(); await p.keyboard.press('Enter');
 await p.getByRole('status',{name:'Carregando lista…'}).waitFor(); assert.equal(await button.isDisabled(),true);
 await p.getByRole('link',{name:'Apontamento 0021',exact:true}).waitFor(); assert.equal(calls.length,2);
 await shot(p,'02-page-two'); return { initialRequests:1,initialRows:20,fixtureRows:1502,requestDelayMs:c.lag,keyboard:'Enter on focused next button' };
});
await check('Erro de API, retry e vazio', async (p,c,calls) => {
 c.fail=true; await go(p); await p.getByText('Não foi possível carregar a lista.',{exact:true}).waitFor(); await shot(p,'03-error'); c.fail=false;
 await p.getByRole('button',{name:'Tentar novamente',exact:true}).click(); await ready(p);
 await p.getByLabel('Buscar: Apontamentos',{exact:true}).fill('inexistente'); await p.getByText('Nenhum registro encontrado.',{exact:true}).waitFor();
 assert.equal(await p.getByRole('navigation',{name:'Páginas: Apontamentos',exact:true}).count(),0); await shot(p,'04-empty'); return { statuses:[503,200],requests:calls.length,empty:true };
});
await check('Tamanho, filtros e respostas fora de ordem', async (p,c,calls) => {
 await go(p); await ready(p); await p.getByLabel('Itens por página: Apontamentos',{exact:true}).selectOption('50'); await p.getByRole('link',{name:'Apontamento 0050',exact:true}).waitFor();
 assert.equal(await p.locator('[data-testid="rows"] li').count(),50);
 await p.getByRole('button',{name:'Próxima: Apontamentos',exact:true}).click(); await p.getByRole('link',{name:'Apontamento 0051',exact:true}).waitFor();
 await p.getByLabel('Obra: Apontamentos',{exact:true}).selectOption(id(2)); await p.getByRole('link',{name:'Apontamento 0001',exact:true}).waitFor(); assert.equal(calls.at(-1).cursor,undefined);
 c.lag=1800; await p.getByLabel('Buscar: Apontamentos',{exact:true}).fill('0001'); await delay(450); c.lag=200; await p.getByLabel('Buscar: Apontamentos',{exact:true}).fill('0003');
 await p.getByRole('link',{name:'Apontamento 0003',exact:true}).waitFor(); await delay(2100); assert.equal(await p.locator('[data-testid="rows"] li').count(),1); assert.equal(await p.getByRole('link',{name:'Apontamento 0001',exact:true}).count(),0);
 return { size:50,filterResetsCursor:true,staleResponseIgnored:true };
});
await check('Voltar preserva página, busca, tamanho e posição', async (p,c) => {
 c.lag=100; await go(p); await ready(p); await p.getByLabel('Itens por página: Apontamentos',{exact:true}).selectOption('10'); await delay(250);
 await p.getByLabel('Buscar: Apontamentos',{exact:true}).fill('Apontamento'); await delay(550); await p.getByRole('button',{name:'Próxima: Apontamentos',exact:true}).click(); await p.getByRole('link',{name:'Apontamento 0011',exact:true}).waitFor();
 await p.getByRole('link',{name:'Apontamento 0020',exact:true}).scrollIntoViewIfNeeded(); const before=await p.evaluate(()=>scrollY);
 await p.getByRole('link',{name:'Apontamento 0020',exact:true}).click(); await p.getByText('Documento fictício').waitFor(); await p.goBack(); await p.getByRole('link',{name:'Apontamento 0011',exact:true}).waitFor();
 await p.waitForFunction(y => Math.abs(scrollY-y)<100,before,{timeout:3000});
 assert.equal(await p.getByLabel('Itens por página: Apontamentos',{exact:true}).inputValue(),'10'); assert.equal(await p.getByLabel('Buscar: Apontamentos',{exact:true}).inputValue(),'Apontamento');
 const after=await p.evaluate(()=>scrollY); assert.ok(Math.abs(before-after)<100,`scroll before ${before}, after ${after}`); return { beforeScroll:before,afterScroll:after,page:2,searchPreserved:true };
});
await check('Seleção mantida entre páginas e limpa ao trocar obra', async (p,c) => {
 c.lag=100; await go(p,'selecao'); await p.getByRole('checkbox').first().waitFor(); await p.getByRole('checkbox').first().check();
 await p.getByRole('button',{name:'Próxima: Apontamentos para o relatório',exact:true}).click(); await delay(300); await p.getByRole('checkbox').first().check(); await p.getByText('2 de 30 selecionados',{exact:false}).waitFor();
 await p.getByRole('button',{name:'Anterior: Apontamentos para o relatório',exact:true}).click(); await delay(300); assert.equal(await p.getByRole('checkbox').first().isChecked(),true);
 await p.getByLabel('Obra',{exact:true}).selectOption(id(3)); await p.getByText('0 de 30 selecionados',{exact:true}).waitFor(); await shot(p,'05-selection'); return { selectedAcrossPages:2,workChangeClearsSelection:true };
});
await check('Mobile, foco visível, árvore de acessibilidade e reduced motion', async (p,c) => {
 c.lag=100; await go(p); await ready(p); const next=p.getByRole('button',{name:'Próxima: Apontamentos',exact:true}); await next.focus(); await p.keyboard.press('Tab'); await next.focus();
 const focus=await next.evaluate(el=>({outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth})); assert.notEqual(focus.outline,'none');
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await p.addScriptTag({content:await readFile('/private/tmp/dialogo-safety-browser/node_modules/axe-core/axe.min.js','utf8')});
 const axe=await p.evaluate(async()=>{const r=await window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description}));}); assert.deepEqual(axe,[]);
 await shot(p,'06-mobile-focus'); return { viewport:390,focus,axeViolations:axe,reducedMotion:await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches) };
},{viewport:{width:390,height:844},reducedMotion:'reduce'});
await check('Agenda busca somente o mês solicitado e recupera falha', async p => {
 const months=[]; let fail=false;
 await p.route('**/api/agenda?*',async route=>{const month=new URL(route.request().url()).searchParams.get('mes');months.push(month);await delay(800);if(fail)return json(route,{available:false},503); const revision='a'.repeat(32);return route.fulfill({status:200,contentType:'application/json',headers:{ETag:`"${revision}"`},body:JSON.stringify({available:true,month,revision,visits:[],auditors:[],notifications:[]})});});
 await go(p,'agenda'); await p.getByRole('status',{name:'Carregando calendário…'}).waitFor(); await p.getByRole('button',{name:'Próximo mês: calendário'}).click(); await delay(1100);
 assert.ok(months.length>=2); assert.notEqual(months[0],months.at(-1)); fail=true;await p.getByRole('button',{name:'Próximo mês: calendário'}).click();await p.getByText('Não foi possível atualizar a agenda.',{exact:false}).waitFor();fail=false;await p.getByRole('button',{name:'Tentar novamente'}).click();await delay(1100);assert.equal(await p.getByText('Não foi possível atualizar a agenda.',{exact:false}).count(),0); await shot(p,'07-calendar'); return {months,apiFailureRetried:true};
});
await check('Seletor de equipe paginado, busca e seleção preservada', async p => {
 const requests=[]; await p.route('**/api/access/list?*',async route=>{const q=new URL(route.request().url()).searchParams;requests.push(Object.fromEntries(q));await delay(400);const page=Number(q.get('page'));return json(route,{available:true,page,size:20,total:45,profiles:Array.from({length:page===3?5:20},(_,i)=>({id:id(200+(page-1)*20+i),nome:`Pessoa ${200+(page-1)*20+i}`,email:`pessoa${i}@example.invalid`,perfis:['ENGENHARIA'],modulos:['ENGENHARIA: QUALIDADE']}))});});
 await go(p,'usuarios'); await p.getByRole('status',{name:'Carregando usuários…'}).waitFor(); await p.getByRole('option',{name:/Pessoa 200/}).waitFor({state:'attached'});
 const select=p.locator('select').first();await select.selectOption(id(200));await p.getByRole('button',{name:/Adicionar/}).click();await p.getByRole('button',{name:/Próxima página:/}).click();await p.getByRole('option',{name:/Pessoa 220/}).waitFor({state:'attached'});
 assert.ok((await p.locator('input[name="team_accounts"]').inputValue()).includes(id(200)));await p.getByLabel('Buscar usuário').fill('Pessoa');await delay(850);assert.equal(requests.at(-1).page,'1');assert.equal(requests.at(-1).search,'Pessoa');await shot(p,'08-team');return {requests,selectionPreserved:true};
});
await check('Histórico da obra não perde formulário; loading, falha e retry', async p => {
 let failed=true, requests=0;
 await p.route('**/api/access/list?*',async route=>{requests++;const page=Number(new URL(route.request().url()).searchParams.get('page'));await delay(900);return failed ? json(route,{error:true},503) : json(route,{page,error:false,total:41,rows:[{id:'history-21',obra_id:id(2),changed_at:'2026-10-06T12:00:00Z',actor_snapshot:{nome:'Pessoa de teste'},before_snapshot:{nome:'Anterior'},after_snapshot:{nome:'Atualizado'}}]});});
 await go(p,'historico');await p.getByLabel('Nome em edição').fill('Texto ainda não salvo');await p.getByRole('button',{name:'Próxima página: Páginas do histórico da obra',exact:true}).click();
 await p.getByRole('status',{name:'Carregando alterações…'}).waitFor();await p.getByText('Não foi possível carregar o histórico.',{exact:false}).waitFor();assert.equal(await p.getByLabel('Nome em edição').inputValue(),'Texto ainda não salvo');
 failed=false;await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await p.getByText('Pessoa de teste',{exact:true}).waitFor();assert.equal(await p.getByLabel('Nome em edição').inputValue(),'Texto ainda não salvo');await shot(p,'09-work-history');return {requests,preservedUnsavedForm:true};
});
await check('Relatório da visita seleciona apontamentos em páginas distintas',async(p,c,calls)=>{
 c.lag=100;await go(p,'visita');await p.getByRole('checkbox').first().waitFor();await p.getByRole('checkbox').first().check();
 await p.getByRole('button',{name:'Próxima: Apontamentos do relatório',exact:true}).click();await delay(350);await p.getByRole('checkbox').first().check();await p.getByText('2 de 30 selecionados',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Anterior: Apontamentos do relatório',exact:true}).click();await delay(350);assert.equal(await p.getByRole('checkbox').first().isChecked(),true);assert.ok(calls.every(q=>q.visitId===id(4)&&q.workId===id(2)));await shot(p,'10-scheduled-selection');return {selected:2,visitScoped:true};
});

await check('Paginação: ocultar página única, setas, teclado, tamanho e posição', async p => {
 await go(p,'paginacao');
 const nav=p.getByRole('navigation',{name:'Auditorias de teste',exact:true});
 const total=p.getByLabel('Total de auditorias (teste)',{exact:true});
 await nav.waitFor();
 for(const count of ['0','1','10']) { await total.selectOption(count); assert.equal(await nav.count(),0); }
 await total.selectOption('24'); await nav.waitFor();
 const next=nav.getByRole('button',{name:'Próxima página: Auditorias de teste',exact:true});
 const previous=nav.getByRole('button',{name:'Página anterior: Auditorias de teste',exact:true});
 assert.equal(await previous.isDisabled(),true);
 assert.equal(await next.innerText(),''); assert.equal(await next.locator('svg[aria-hidden="true"]').count(),1);
 await next.focus(); await p.keyboard.press('Enter'); await nav.getByText('11–20 de 24 auditorias',{exact:false}).waitFor();
 await next.click(); await nav.getByText('21–24 de 24 auditorias',{exact:false}).waitFor(); assert.equal(await next.isDisabled(),true);
 await previous.focus(); await p.keyboard.press('Space'); await nav.getByText('11–20 de 24 auditorias',{exact:false}).waitFor();
 const size=nav.getByRole('combobox');
 await size.selectOption('20'); await nav.getByText('1–20 de 24 auditorias',{exact:false}).waitFor();
 await p.getByRole('button',{name:'Simular carregamento'}).click();
 assert.equal(await size.isDisabled(),true); assert.equal(await next.isDisabled(),true); assert.equal(await previous.isDisabled(),true);
 await p.getByRole('button',{name:'Simular carregamento'}).click();
 await size.selectOption('50'); assert.equal(await nav.count(),0);
 await total.selectOption('54'); await nav.waitFor(); await size.selectOption('10');
 const geometry=await nav.evaluate(el=>{const nav=el.getBoundingClientRect(),summary=el.querySelector('[role="status"]').getBoundingClientRect(),size=el.querySelector('label').getBoundingClientRect();return {centerDelta:Math.abs(summary.x+summary.width/2-nav.x-nav.width/2),rightDelta:Math.abs(size.right-nav.right),color:getComputedStyle(el.querySelector('button')).color};});
 assert.ok(geometry.centerDelta<2); assert.ok(geometry.rightDelta<2); assert.equal(geometry.color,'rgb(33, 62, 107)');
 await shot(p,'11-pagination-desktop');
 return { hiddenTotals:[0,1,10],sizeToSinglePageHides:true,keyboard:['Enter','Space'],geometry,loadingDisablesAllControls:true };
});
await check('Paginação compacta: 320 px, foco, área de toque e acessibilidade', async p => {
 await go(p,'paginacao');const nav=p.getByRole('navigation',{name:'Auditorias de teste',exact:true});await nav.waitFor();
 const next=nav.getByRole('button',{name:'Próxima página: Auditorias de teste'});await next.focus();
 const metrics=await nav.evaluate(el=>{const nav=el.getBoundingClientRect(),status=el.querySelector('[role="status"]').getBoundingClientRect(),select=el.querySelector('label').getBoundingClientRect();return {centerDelta:Math.abs(status.x+status.width/2-nav.x-nav.width/2),rightDelta:Math.abs(select.right-nav.right),buttons:[...el.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.ok(metrics.centerDelta<2);assert.ok(metrics.rightDelta<2);assert.equal(metrics.overflow,false);assert.ok(metrics.buttons.every(b=>b.width>=44&&b.height>=44));
 const focus=await next.evaluate(el=>getComputedStyle(el).outlineStyle);assert.notEqual(focus,'none');
 await p.addScriptTag({content:await readFile('/private/tmp/dialogo-safety-browser/node_modules/axe-core/axe.min.js','utf8')});
 const violations=await p.evaluate(async()=>{const r=await window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id);});assert.deepEqual(violations,[]);
 await shot(p,'12-pagination-mobile');return {viewport:320,metrics,focus,violations};
},{viewport:{width:320,height:800},reducedMotion:'reduce'});

await browser.close();
console.log(`${results.filter(r=>r.passed).length}/${results.length} browser scenarios passed`);
if(results.some(r=>!r.passed))process.exitCode=1;
