/** Headless acceptance checks against the running Docker web app. All API calls are fixture-only. */
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_PATH || '/tmp/pulse-list-browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const f = require('./fixtures.cjs');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.PULSE_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(30000);const errors=[];page.on('pageerror',e=>console.error('PAGE ERROR',e.message));const apiCalls=[];
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
  const open=()=>page.getByRole('button',{name:/^Filter requests/}).click();
  const dialog=()=>page.getByRole('dialog',{name:'Filter requests'});
  console.log("Checking request popup");await page.goto(base+'/requests');await page.getByRole('button',{name:/^Filter requests/}).waitFor();
  await open();await dialog().getByRole('checkbox',{name:'No Bid',exact:true}).check();
  assert.match(await dialog().innerText(),/switch the view to All/);
  await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(new URL(page.url()).searchParams.has('status'),false);
  await open();assert.equal(await dialog().getByRole('checkbox',{name:'No Bid',exact:true}).isChecked(),false);
  await dialog().getByRole('checkbox',{name:'No Bid',exact:true}).check();
  await dialog().getByRole('button',{name:'Apply',exact:true}).click();
  assert.equal(new URL(page.url()).searchParams.get('view'),'all');
  assert.equal(new URL(page.url()).searchParams.get('status'),'No Bid');
  const trigger=page.getByRole('button',{name:'Filter requests, 1 active filters'});await trigger.waitFor();
  const bounds=await trigger.boundingBox();assert.equal(bounds.width,44);assert.equal(bounds.height,44);
  await open();assert.ok(await dialog().getByRole('checkbox',{name:'No Bid',exact:true}).isChecked());
  await dialog().getByRole('button',{name:'Clear filters',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(new URL(page.url()).searchParams.get('status'),'No Bid');assert.ok(await trigger.evaluate(el=>el===document.activeElement));
  await open();await dialog().getByRole('button',{name:'Reset view',exact:true}).click();await dialog().getByRole('button',{name:'Apply',exact:true}).click();
  assert.equal(new URL(page.url()).searchParams.get('view'),'open');assert.equal(new URL(page.url()).searchParams.has('status'),false);
  await open();await dialog().getByRole('button',{name:/^Date/}).click();await dialog().getByLabel('Range',{exact:true}).selectOption('custom');await dialog().getByLabel('From',{exact:true}).fill('2026-09-22');await dialog().getByLabel('Through',{exact:true}).fill('2026-09-21');
  assert.ok(await dialog().getByRole('button',{name:'Apply',exact:true}).isDisabled());
  await page.mouse.click(4,4);assert.equal(await dialog().count(),0);
  await page.getByRole('searchbox',{name:'Search requests',exact:true}).fill('Network');
  await page.reload();await page.getByRole('searchbox',{name:'Search requests',exact:true}).waitFor();assert.equal(await page.getByRole('searchbox',{name:'Search requests',exact:true}).inputValue(),'Network');
  fs.mkdirSync('/tmp/pulse-list-screens',{recursive:true});
  for(const width of [390,768,1440,1920]){
    await page.setViewportSize({width,height:1000});
    for(const [path,label]of [['requests','requests'],['quotes','quotes'],['projects','projects'],['billing','invoices'],['clients','clients'],['directory/contacts','contacts'],['directory/sites','sites'],['items','items'],['field','field'],['procurement','procurement'],['statistics','analytics'],['hub','prioritized work'],['clients/c1?tab=work','all work']]){
      console.log('Checking',path,width);await page.goto(base+'/'+path);const button=page.getByRole('button',{name:new RegExp('^Filter '+label)}).first();
      try{await button.waitFor({timeout:20000});}catch(e){throw new Error(`${path} ${width}: ${errors.join('; ')} ${await page.locator('body').innerText()}`);}
      const size=await button.boundingBox();assert.equal(size.width,44,`${path} icon width`);assert.equal(size.height,44,`${path} icon height`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} overflows viewport at ${width}`);
      await button.click();const popup=page.getByRole('dialog').last();const box=await popup.boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=1001,`${path} popup outside viewport at ${width}: ${JSON.stringify(box)}`);
      await page.screenshot({path:`/tmp/pulse-list-screens/${path.split('?')[0].replaceAll('/','-')}-${width}.png`});
      await page.keyboard.press('Escape');
    }
  }
  assert.deepEqual(errors,[]);console.log('PASS: popup draft/apply/cancel/escape/outside/reset/date validation/focus/URL refresh; 13 surfaces at four widths.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
