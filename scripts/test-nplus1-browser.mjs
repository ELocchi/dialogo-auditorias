import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"/private/tmp/dialogo-safety-browser/node_modules/playwright/index.mjs");
const output=path.resolve(process.env.NPLUS_EVIDENCE||"docs/evidence/nplus1-20261006");await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1200},reducedMotion:"reduce"});
const calls=[],errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("**/api/**",r=>r.fulfill({status:503,body:"Unexpected request"}));
await page.route("**/api/follow-up/photos?*",async route=>{
 const visitIds=new URL(route.request().url()).searchParams.getAll("visitId");calls.push(visitIds);
 await new Promise(resolve=>setTimeout(resolve,500));
 await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({available:true,visitIds,photos:[]})});
});
try {
 await page.goto(`${process.env.NPLUS_TEST_URL||"http://127.0.0.1:3016"}/revisao-nplus1`);
 await page.locator('li[data-status="ready"]').first().waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('li[data-status="ready"]').length===42);
 assert.equal(calls.length,1,"Separate observer callbacks must share one request");assert.equal(calls[0].length,42);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(output,"browser-42-visits.png"),fullPage:true});
 await writeFile(path.join(output,"browser-42-visits.aria.txt"),await page.locator("main").ariaSnapshot());
 await writeFile(path.join(output,"browser.json"),JSON.stringify({passed:true,visibleVisits:42,metadataRequests:calls.length,batchSizes:calls.map(v=>v.length),apiDelayMs:500,errors,scope:"Real Chrome + IntersectionObserver + production-built hooks, mocked metadata API"},null,2));
 console.log("PASS: 42 actual IntersectionObserver rows, 1 request, no JavaScript errors");
}finally{await browser.close();}
