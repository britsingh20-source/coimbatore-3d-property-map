import { chromium } from 'playwright';

const url = process.env.LIVE_URL || 'https://britsingh20-source.github.io/coimbatore-3d-property-map/';
const tcPin = process.env.TC01_PIN;
const adminPin = process.env.AD01_PIN;
const directorPin = process.env.DR01_PIN;
if (!tcPin || !adminPin || !directorPin) throw new Error('TC01_PIN, AD01_PIN and DR01_PIN are required');

const browser = await chromium.launch({ headless: true });
const results = {};

async function baseCheck(page){
  const started=Date.now();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForSelector('#admin-open',{state:'visible',timeout:8000});
  await page.waitForTimeout(1600);
  const blocked=await page.locator('#loading').evaluate(el=>{
    const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&s.pointerEvents!=='none';
  }).catch(()=>false);
  if(blocked) throw new Error('Loading overlay is still blocking after 1.6s');
  results.page_ready_ms=Date.now()-started;
}

async function login(page, employeeId, pin){
  await page.click('#admin-open');
  await page.waitForSelector('#admin-panel:not([hidden])',{timeout:5000});
  await page.waitForSelector('#staff-login-gate.show',{timeout:8000});
  await page.fill('#tc-employee-id',employeeId);
  await page.fill('#tc-pin',pin);
  await page.click('#tc-login-form button[type="submit"]');
  await page.waitForFunction(()=>document.body.classList.contains('staff-session-active'),null,{timeout:10000});
  await page.waitForSelector('[data-admin-section="leads"]',{state:'visible',timeout:10000});
}

async function openLeads(page){
  await page.click('[data-admin-section="leads"]');
  await page.waitForSelector('#admin-leads.active',{timeout:8000});
  await page.waitForFunction(()=>document.querySelector('#crm-live-indicator')?.textContent?.includes('Live D1'),null,{timeout:10000});
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await baseCheck(page);
  await login(page,'TC01',tcPin);
  await openLeads(page);
  await page.waitForSelector('#crm-dual-queue',{state:'visible',timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll('#queue-active-batch .queue-batch-list article').length>0,null,{timeout:12000});
  await page.waitForTimeout(800);
  const count=await page.locator('#queue-active-batch .queue-batch-list article').count();
  const phoneCount=await page.locator('#queue-active-batch .queue-visible-phone').count();
  const title=await page.locator('#admin-person-name').textContent();
  if(count!==10) throw new Error(`Telecaller batch expected 10 leads, got ${count}`);
  if(phoneCount!==10) throw new Error(`Expected 10 visible phone numbers, got ${phoneCount}`);
  if(!String(title).includes('Telecaller 1')) throw new Error(`Profile title incorrect: ${title}`);
  results.telecaller_batch=count;
  results.telecaller_visible_phones=phoneCount;
  results.telecaller_profile=title?.trim();
  results.telecaller_console_errors=consoleErrors.filter(x=>!x.includes('favicon')).slice(0,5);
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await baseCheck(page);
  await login(page,'AD01',adminPin);
  await openLeads(page);
  const title=await page.locator('#admin-person-name').textContent();
  const live=await page.locator('#crm-live-indicator').textContent();
  const leadRows=await page.locator('#crm-lead-list .crm-lead-row').count();
  if(!String(title).includes('Administrator')) throw new Error(`Admin profile incorrect: ${title}`);
  if(!String(live).includes('Live D1')) throw new Error(`CRM not live: ${live}`);
  if(leadRows<1) throw new Error('Administrator lead list is empty');
  results.admin_profile=title?.trim();
  results.crm_indicator=live?.trim();
  results.admin_visible_leads=leadRows;
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await baseCheck(page);
  await login(page,'DR01',directorPin);
  await page.waitForSelector('#admin-leads.active',{timeout:8000});
  await page.waitForFunction(()=>document.querySelector('#crm-live-indicator')?.textContent?.includes('Live D1'),null,{timeout:10000});
  const title=await page.locator('#admin-person-name').textContent();
  const live=await page.locator('#crm-live-indicator').textContent();
  const leadRows=await page.locator('#crm-lead-list .crm-lead-row').count();
  if(!String(title).includes('Director')) throw new Error(`Director profile incorrect: ${title}`);
  if(!String(live).includes('Live D1')) throw new Error(`Director CRM not live: ${live}`);
  if(leadRows<1) throw new Error('Director lead list is empty');
  results.director_profile=title?.trim();
  results.director_crm_indicator=live?.trim();
  results.director_visible_leads=leadRows;
  await context.close();
}

await browser.close();
console.log(JSON.stringify({ok:true,url,results},null,2));
