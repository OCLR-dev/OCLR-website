import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = resolve(import.meta.dirname, '../../../..');
const server = createServer(async (req,res) => {
  const path = resolve(base, '.' + new URL(req.url,'http://localhost').pathname);
  if (!path.startsWith(base + '/') || !['.html','.css','.js','.avif','.md'].includes(extname(path))) {res.writeHead(404).end();return;}
  try {res.setHeader('Content-Type', {'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.md':'text/plain'}[extname(path)]);res.end(await readFile(path));} catch {res.writeHead(404).end();}
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const axe = await readFile(resolve(base,'node_modules/axe-core/axe.min.js'),'utf8');
const results=[];
try {
 for (const width of [320,390,768,1440]) for (const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/*', route=>route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(`${origin}/docs/design/season-themes/s3.html?theme=${theme}`);
  await page.locator('img').evaluate(img=>img.decode());
  assert.deepEqual(await page.locator('img').evaluate(img=>[img.naturalWidth,img.naturalHeight]),[995,621]);
  for (const panel of ['overview','schedule','mappools','admin']) {
   await page.locator(`#tab-${panel}`).click();
   assert(await page.locator(`#panel-${panel}`).isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.addScriptTag({content:axe});
   const audit=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
   assert.deepEqual(audit,[],JSON.stringify({width,theme,panel,audit}));
   if ([390,1440].includes(width) && ['overview','admin'].includes(panel)) {
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:resolve(import.meta.dirname,`${panel}-${width===390?'mobile':'desktop'}-${theme}.png`),fullPage:true});
   }
   results.push({width,theme,panel,axeViolations:0,overflow:false});
  }
  await page.locator('#name').fill(' ');await page.getByRole('button',{name:'預覽變更',exact:true}).click();
  assert.equal(await page.locator('#name').getAttribute('aria-invalid'),'true');
  await page.getByRole('button',{name:'重設',exact:true}).click();
  assert.equal(await page.locator('#name').inputValue(),'OCLR Season 3');
  await page.getByRole('button',{name:'預覽變更',exact:true}).click();
  assert.match(await page.locator('output').innerText(),/沒有儲存/);
  await page.locator('#tab-admin').focus();await page.keyboard.press('Home');
  assert.equal(await page.locator('#tab-overview').getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-schedule').getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:theme==='dark'?'明亮':'深色',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme==='dark'?'light':'dark');
  assert.deepEqual(await context.cookies(),[]);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.deepEqual(errors,[]);
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('.rings').evaluate(e=>getComputedStyle(e).display),'none');
  await context.close();
 }
 await writeFile(resolve(import.meta.dirname,'verification.json'),JSON.stringify({date:'2026-10-29',kind:'Offline specimen, not application or release acceptance',artworkSha256:createHash('sha256').update(await readFile(resolve(base,'public/archive/s3/key-visual.avif'))).digest('hex'),results,checks:['image 995x621 decoded','tabs and keyboard Home/ArrowRight','form invalid/reset/preview','mode switch','no cookies/localStorage','forced-colors rings hidden','reduced-motion enabled','no page errors']},null,2)+'\n');
 console.log(`${results.length} viewport/theme/panel checks passed`);
} finally {await browser.close();server.close();}
