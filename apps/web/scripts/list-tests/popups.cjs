/** Headless acceptance checks against the running Docker web app. All API calls are fixture-only. */
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_PATH || '/tmp/pulse-list-browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const f = require('./fixtures.cjs');
(async () => {
  // Long, authorized fixture options exercise wrapping and selector search.
  for(let index=2;index<=12;index++) f.quotes.push({...f.quotes[0],id:'extra'+index,quoteNumber:'Q-'+index,clientId:'c'+index,clientName:'Client '+index+' with a long organization name for layout checks'});
  f.quotes.forEach(quote => delete quote.companyName);
  const browser = await chromium.launch({executablePath:process.env.PULSE_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let debugPage;
  try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();debugPage=page;page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(30000);const errors=[];page.on('pageerror',e=>console.error('PAGE ERROR',e.message));const apiCalls=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());apiCalls.push(url.pathname+url.search);
    let body={};
    if(url.pathname==='/api/auth/session')body={user:f.user,csrfToken:'fixture',setupRequired:false};
    else if(url.pathname==='/api/settings/preferences')body={preferences:{themeMode:'light',accentTheme:'blue',motionMode:'subtle'}};
    else if(url.pathname==='/api/settings/workspace')body={workspace:{name:'Test workspace',timeZone:'America/Puerto_Rico',locale:'en-US',dateFormat:'MM/DD/YYYY',weekStartsOn:0,updatedAt:''}};
    else if(url.pathname==='/api/requests')body={requests:f.requests,assignees:[f.person]};
    else if(url.pathname==='/api/clients')body={clients:[f.client]};
    else if(url.pathname==='/api/clients/c1')body={client:f.client};
    else if(url.pathname.endsWith('/related-work'))body={requests:f.requests,quotes:f.quotes,projects:f.projects,invoices:f.invoices,summary:{activeRequests:2,activeQuotes:2,activeProjects:2,outstandingInvoiceBalance:2000,revisionRequests:0,revisedQuotes:0,revisionRate:null,averageRevisions:null}};
    else if(url.pathname==='/api/quotes')body={quotes:f.quotes};
    else if(url.pathname==='/api/projects')body={projects:f.projects};
    else if(url.pathname==='/api/invoices')body={invoices:f.invoices};
    else if(url.pathname.endsWith('team-members'))body={teamMembers:[f.person],assignees:[f.person]};
    else if(url.pathname==='/api/items/categories')body={categories:['Networking']};
    else if(url.pathname==='/api/items')body={items:f.items};
    else if(url.pathname==='/api/analytics')body=f.analytics;
    else if(url.pathname==='/api/analytics/details')body={metric:'request-volume',label:'Requests',total:26,summary:'Fixture detail',rows:[{id:'r0',kind:'Request',reference:'R-001',title:'Test request',client:'Acme Client',trades:['Networking'],status:'Received',owner:'Test Owner',date:'2026-09-21',value:100,href:'/requests/r0'}],nextCursor:'25'};
    else if(url.pathname==='/api/dashboard/preferences')body={preferences:{version:1,defaultScope:'all',widgets:['attention-summary','work-queue','upcoming-dates','recent-activity','module-health'].map(id=>({id,visible:true,width:'full'}))}};
    else if(url.pathname==='/api/dashboard')body={generatedAt:f.client.updatedAt,businessDate:'2026-09-21',scope:'all',scopeLabel:'All work',viewer:{id:'u1',name:'Test Owner',role:'Admin',roleName:'Admin'},widgets:{'attention-summary':{overdue:1,dueToday:0,dueNextSevenDays:1,needsAttention:1,unassigned:0},'work-queue':{items:[{id:'r0',kind:'request',reference:'R-001',title:'Test request',context:'Acme Client',owner:'Test Owner',status:'Received',timing:'overdue',timingDate:'2026-09-20',attentionReasons:[],href:'/requests/r0',canComplete:false}],total:1,options:{statuses:['Received'],owners:['Test Owner']}},'upcoming-dates':{items:[],total:0},'recent-activity':{items:[]},'module-health':{items:[]}}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const base=process.env.PULSE_TEST_URL || 'http://127.0.0.1:4300';
  const output=process.env.PULSE_SCREENSHOT_DIR || '/tmp/pulse-popup-screens';fs.mkdirSync(output,{recursive:true});
  const sortButton=()=>page.getByRole('button',{name:'Sort quotes',exact:true});
  const filterButton=()=>page.getByRole('button',{name:/^Filter quotes/});
  const sortDialog=()=>page.getByRole('dialog',{name:'Sort quotes',exact:true});
  const filterDialog=()=>page.getByRole('dialog',{name:'Filter quotes',exact:true});
  const apply=dialog=>dialog.getByRole('button',{name:'Apply',exact:true}).click();
  const cancel=dialog=>dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  const focused=locator=>locator.evaluate(el=>document.activeElement===el);
  const quoteCalls=()=>apiCalls.filter(url=>url==='/api/quotes').length;
  console.log('Checking sort draft, keyboard, reset, URL, and focus');
  await page.goto(base+'/quotes?view=all&q=Network&sort=value&dir=asc');await sortButton().waitFor();
  await sortButton().click();assert.ok(await focused(sortDialog().getByRole('radio',{name:'Value',exact:true})));
  const original=page.url();const requests=quoteCalls();
  await sortDialog().getByRole('radio',{name:'Send-by date',exact:true}).check();
  assert.ok(await sortDialog().getByRole('radio',{name:'Earliest first',exact:true}).isChecked());
  await sortDialog().getByRole('radio',{name:'Latest first',exact:true}).check();assert.equal(page.url(),original);assert.equal(quoteCalls(),requests);
  await cancel(sortDialog());assert.equal(page.url(),original);assert.ok(await focused(sortButton()));
  await sortButton().click();assert.ok(await sortDialog().getByRole('radio',{name:'Value',exact:true}).isChecked());
  await sortDialog().getByRole('radio',{name:'Created',exact:true}).check();await page.keyboard.press('Escape');assert.equal(page.url(),original);
  await sortButton().click();await sortDialog().getByRole('button',{name:'Reset sorting',exact:true}).click();assert.equal(page.url(),original);
  await apply(sortDialog());assert.equal(new URL(page.url()).searchParams.get('sort'),'activity');assert.equal(new URL(page.url()).searchParams.get('dir'),'desc');assert.equal(new URL(page.url()).searchParams.get('q'),'Network');assert.equal(new URL(page.url()).searchParams.get('view'),'all');
  await sortButton().click();await sortDialog().getByRole('radio',{name:'Created',exact:true}).check();await sortDialog().getByRole('radio',{name:'Oldest first',exact:true}).check();await apply(sortDialog());
  assert.equal(new URL(page.url()).searchParams.get('sort'),'created');assert.equal(new URL(page.url()).searchParams.get('dir'),'asc');
  await page.reload();await sortButton().click();assert.ok(await sortDialog().getByRole('radio',{name:'Created',exact:true}).isChecked());assert.ok(await sortDialog().getByRole('radio',{name:'Oldest first',exact:true}).isChecked());
  // Arrow navigation changes only a radio draft; Tab remains in the native modal.
  await sortDialog().getByRole('radio',{name:'Created',exact:true}).focus();const beforeArrow=page.url();await page.keyboard.press('ArrowDown');assert.equal(page.url(),beforeArrow);
  for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert.ok(await sortDialog().evaluate(el=>el.contains(document.activeElement)));}
  await page.mouse.click(4,4);assert.equal(await sortDialog().count(),0);assert.equal(page.url(),beforeArrow);
  console.log('Checking filter accordions, clear/reset, date error, and view widening');
  await page.goto(base+'/quotes?view=open');await filterButton().click();
  assert.ok(await focused(filterDialog().getByRole('heading',{name:'Filter quotes',exact:true})));
  assert.equal(await filterDialog().getByRole('button',{name:/^Status/}).getAttribute('aria-expanded'),'true');
  await filterDialog().getByRole('checkbox',{name:'Approved',exact:true}).check();assert.match(await filterDialog().innerText(),/switch the view to All/);
  await filterDialog().getByRole('button',{name:/^Client/}).click();assert.equal(await filterDialog().getByRole('button',{name:/^Status/}).getAttribute('aria-expanded'),'false');
  const search=filterDialog().getByRole('searchbox',{name:'Search client options'});await search.fill('Client 12');assert.equal(await filterDialog().getByRole('checkbox').count(),1);
  await filterDialog().getByRole('checkbox').check();await filterDialog().getByRole('button',{name:/^Assigned to/}).click();assert.equal(await filterDialog().getByRole('searchbox').count(),0);
  await filterDialog().getByRole('button',{name:'Clear filters',exact:true}).click();
  await filterDialog().getByRole('button',{name:/^Date/}).click();await filterDialog().getByLabel('Range',{exact:true}).selectOption('custom');await filterDialog().getByLabel('From',{exact:true}).fill('2026-09-22');await filterDialog().getByLabel('Through',{exact:true}).fill('2026-09-21');assert.ok(await filterDialog().getByRole('button',{name:'Apply',exact:true}).isDisabled());
  await filterDialog().getByRole('button',{name:/^Status/}).click();assert.match(await filterDialog().innerText(),/Start date must/);
  await cancel(filterDialog());assert.equal(new URL(page.url()).searchParams.has('status'),false);
  await filterButton().click();await filterDialog().getByRole('checkbox',{name:'Approved',exact:true}).check();await apply(filterDialog());assert.equal(new URL(page.url()).searchParams.get('view'),'all');assert.equal(new URL(page.url()).searchParams.get('status'),'Approved');assert.equal(await filterButton().getAttribute('aria-label'),'Filter quotes, 1 active filters');
  await filterButton().click();await filterDialog().getByRole('button',{name:'Clear filters',exact:true}).click();await page.keyboard.press('Escape');assert.equal(new URL(page.url()).searchParams.get('status'),'Approved');
  await filterButton().click();await filterDialog().getByRole('button',{name:'Reset view',exact:true}).click();await apply(filterDialog());assert.equal(new URL(page.url()).searchParams.get('view'),'open');assert.equal(new URL(page.url()).searchParams.has('status'),false);
  // Even a programmatic opening cannot leave two toolbar dialogs active.
  await sortButton().click();await filterButton().evaluate(el=>el.click());assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');
  for(const width of [390,768,1440]){
    console.log('Checking paired layouts',width);await page.setViewportSize({width,height:1000});
    for(const kind of ['sort','filter']){
      const button=kind==='sort'?sortButton():filterButton();const size=await button.boundingBox();assert.equal(size.width,kind==='sort'?88:44);assert.equal(size.height,44);
      await button.click();const dialog=kind==='sort'?sortDialog():filterDialog();
      const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=1001,JSON.stringify(box));
      if(width>=768)assert.equal(Math.round(box.width),kind==='sort'?360:480);
      const action=await dialog.getByRole('button',{name:'Apply',exact:true}).boundingBox();assert.ok(action.y>=box.y&&action.y+action.height<=box.y+box.height);
      await page.screenshot({path:`${output}/quotes-${kind}-${width}.png`});await page.keyboard.press('Escape');
    }
  }
  // Chromium's CSS zoom exercises doubled UI text/geometry; a halved desktop viewport
  // additionally covers the responsive layout viewport used by browser zoom.
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.zoom='2');
  for(const kind of ['sort','filter']){
    await(kind==='sort'?sortButton():filterButton()).click();const dialog=kind==='sort'?sortDialog():filterDialog();
    const action=await dialog.getByRole('button',{name:'Apply',exact:true}).boundingBox();assert.ok(action.y+action.height<=1001,`${kind} footer clipped at 200%`);
    await page.screenshot({path:`${output}/quotes-${kind}-zoom200.png`});await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>document.documentElement.style.zoom='1');
  await page.setViewportSize({width:720,height:500});
  for(const kind of ['sort','filter']){
    await(kind==='sort'?sortButton():filterButton()).click();const dialog=kind==='sort'?sortDialog():filterDialog();
    const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.width<=720&&box.y>=0&&box.y+box.height<=501);
    const action=await dialog.getByRole('button',{name:'Apply',exact:true}).boundingBox();assert.ok(action.y+action.height<=501);
    await page.screenshot({path:`${output}/quotes-${kind}-zoom-reflow.png`});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:1000});
  // A single-select report filter uses radios, with Any to clear that one field.
  await page.goto(base+'/statistics');await page.getByRole('button',{name:/^Filter analytics/}).click();
  const report=page.getByRole('dialog',{name:'Filter analytics',exact:true});assert.equal(await report.getByRole('radio',{name:'Any',exact:true}).count(),1);await report.getByRole('radio',{name:'Networking',exact:true}).check();await cancel(report);
  assert.deepEqual(errors,[]);console.log('PASS shared popup behavior, keyboard, filters, 390/768/1440 layouts and 200% zoom. Screenshots:',output);
  } catch(error) { if(debugPage) { console.error((await debugPage.locator("body").innerText()).slice(-6000)); await debugPage.screenshot({path:"/tmp/pulse-popup-failure.png"}); } throw error; } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
