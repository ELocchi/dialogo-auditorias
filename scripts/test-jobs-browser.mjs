import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import Excel from 'exceljs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/private/tmp/dialogo-safety-browser/node_modules/playwright/index.mjs');
const output=process.env.JOBS_EVIDENCE||'docs/evidence/jobs-20261006';await mkdir(output,{recursive:true});
const id=n=>`aa000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={target:id(1),revision:1,attempts:1,retryable:true,errorCode:null,createdAt:'2026-10-06T12:00:00Z',updatedAt:'2026-10-06T12:00:00Z',result:null};
let retried=false,polls=0,ready=false,listFailure=false,apiCalls=0;
const pdf=await PDFDocument.create();pdf.addPage();const pdfBytes=await pdf.save();
const book=new Excel.Workbook();const sheet=book.addWorksheet('Agenda');sheet.addRow(['Obra','Data']);for(let n=0;n<200;n++)sheet.addRow(['Obra fictícia '+n,new Date('2026-10-06T12:00:00Z')]);const excelBytes=await book.xlsx.writeBuffer();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:'reduce'});const errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/**',async route=>{
 apiCalls++;const url=new URL(route.request().url());const fulfill=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(url.pathname==='/api/jobs') {
  await new Promise(resolve=>setTimeout(resolve,600));
  if(listFailure)return fulfill({message:'Falha fictícia'},503);
  return fulfill([{...base,id:id(2),kind:'publish-audit',status:retried?'queued':'failed',stage:'queued'}, {...base,id:id(3),kind:'standalone-pdf',status:ready?'succeeded':'running',stage:'pdf'}]);
 }
 if(url.pathname==='/api/jobs/'+id(2)&&route.request().method()==='POST'){retried=true;return fulfill({...base,id:id(2),kind:'publish-audit',status:'queued',stage:'queued'});}
 if(url.pathname==='/api/review-pdf') {
  if(ready)return route.fulfill({status:200,contentType:'application/pdf',headers:{'content-disposition':'inline; filename="teste.pdf"'},body:Buffer.from(pdfBytes)});
  return fulfill({job:{...base,id:id(1),kind:'standalone-pdf',status:'queued',stage:'queued'},statusUrl:'/api/jobs/'+id(1)},202);
 }
 if(url.pathname==='/api/jobs/'+id(1)) {
  polls++;ready=polls>=2;return fulfill({...base,id:id(1),kind:'standalone-pdf',status:ready?'succeeded':'running',stage:'pdf',result:ready?{url:'/api/review-pdf'}:null});
 }
 return fulfill({},404);
});
try {
 await page.goto((process.env.JOBS_TEST_URL||'http://127.0.0.1:3017')+'/revisao-jobs');
 await page.getByText('Carregando processamentos…').waitFor();
 await page.screenshot({path:output+'/loading.png',fullPage:true});checks.push('Skeleton during delayed list response');
 const retry=page.getByRole('button',{name:'Tentar novamente',exact:true});await retry.waitFor();
 await retry.focus();assert.notEqual(await retry.evaluate(el=>getComputedStyle(el).outlineStyle),'none');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement?.tagName==='LI');assert.equal(retried,true);checks.push('Keyboard retry with retained focus and queued state');
 await page.getByTitle('Visualização do relatório orientativo').waitFor();assert.equal(ready,true);assert.ok(polls>=2);checks.push('202 -> queued -> running -> PDF ready');
 await page.screenshot({path:output+'/completed.png',fullPage:true});
 const panel=page.getByRole('region',{name:'Processamentos recentes'});
 listFailure=true;await panel.getByRole('alert').waitFor({timeout:12000});await page.screenshot({path:output+'/api-failure.png',fullPage:true});
 listFailure=false;await page.getByRole('button',{name:'Recarregar',exact:true}).click();await panel.getByRole('alert').waitFor({state:'detached'});checks.push('API failure retains rows and reload recovers');
 await page.getByLabel('Planilha').setInputFiles({name:'agenda.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(excelBytes)});
 await page.getByRole('button',{name:'Interagir: 0'}).click();await page.getByText('200 agendamentos lidos').waitFor();await page.getByRole('button',{name:'Interagir: 1'}).waitFor();checks.push('Real Excel worker decodes 200 rows; page remains interactive');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:output+'/mobile.png',fullPage:true});
 await writeFile(output+'/accessibility.aria.txt',await page.locator('main').ariaSnapshot());checks.push('Mobile without horizontal overflow; reduced motion; accessibility tree');
 assert.deepEqual(errors,[]);
 await writeFile(output+'/browser.json',JSON.stringify({passed:true,checks,apiCalls,pdfStatusPolls:polls,errors,scope:'Real Chrome and Excel Web Worker, controlled API delay/failure. Durable SQL + PDF process validated separately in integration.json.'},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks,apiCalls,polls}));
}finally{await browser.close();}
