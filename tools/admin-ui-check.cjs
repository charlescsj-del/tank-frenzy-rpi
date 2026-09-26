// Run with the CI-only Playwright install; no additional game runtime dependency.
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..'),out=root+'/artifacts/admin';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const game=require(root+'/server.cjs').createGameServer({adminPassword:'review-only-password',adminPath:'private-test'});
 await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+game.server.address().port;
 const {Room}=require(root+'/game-server.cjs'),room=new Room('QUARRY');room.add('Commander');room.add('Glacier');game.rooms.set(room.code,room);
 let browser;
 const errors=[];
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},httpCredentials:{username:'admin',password:'review-only-password'},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/private-test');
  await page.waitForFunction(()=>document.getElementById('freshness').textContent.startsWith('Live'));
  await page.waitForTimeout(1200);
  const state=await page.evaluate(async()=>{const value=await fetch(adminRoot+'/state').then(r=>r.json());clearTimeout(timer);refreshing=true;return value;});
  assert(state.system.memory.totalBytes===null||state.system.memory.totalBytes>0);assert(state.system.game.rssBytes===null||state.system.game.rssBytes>0);console.log('Live authenticated endpoint passed.');
  const fixture={...state,version:'1.15.0',uptime:26780,system:{sampledAt:100000,cores:4,cpuPercent:36.4,memory:{usedPercent:61.2,totalBytes:4*1073741824,usedBytes:2.448*1073741824,availableBytes:1.552*1073741824,basis:'available'},load:[1.48,1.02,.86],game:{cpuPercent:16.2,rssBytes:72*1048576}}};
  await page.evaluate(state=>{for(let i=0;i<=65;i++){state.system.sampledAt=100000+i*1000;state.system.load[0]=i===65?1.48:.7+i*.01+Math.sin(i/7)*.3;render(state)}},fixture);
  assert.equal(await page.locator('#cpuValue').textContent(),'36%');assert.match(await page.locator('#gameCpu').textContent(),/16.2% of one core/);
  assert.equal(await page.locator('#memoryValue').textContent(),'61%');assert.equal(await page.locator('#loadRatio1').textContent(),'0.37 per core');
  assert.equal(await page.evaluate(()=>loadHistory.length),61);assert.equal(await page.locator('#cpuGauge').getAttribute('aria-valuenow'),'36.4');
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
    await page.screenshot({path:out+'/admin-'+width+'.png',fullPage:true});
  }
  console.log('Desktop, tablet and phone gauges rendered; history bounded.');
  const high=JSON.parse(JSON.stringify(fixture));Object.assign(high.system,{sampledAt:166000,cpuPercent:95.6,load:[8.4,5.1,3.7]});Object.assign(high.system.memory,{usedPercent:94,usedBytes:3.76*1073741824,availableBytes:.24*1073741824});high.system.game.cpuPercent=146;
  await page.evaluate(state=>render(state),high);assert.equal(await page.locator('#cpuResource').getAttribute('data-tone'),'high');assert.equal(await page.locator('#memoryResource').getAttribute('data-tone'),'high');
  assert.equal(await page.locator('#load1').textContent(),'8.40');assert.match(await page.locator('#gameCpu').textContent(),/146.0%/);
  assert.equal(await page.locator('#loadBar1').evaluate(e=>e.style.width),'100%');assert.equal(await page.locator('#loadRatio1').textContent(),'2.10 per core');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/admin-high.png',fullPage:true});
  const missing=JSON.parse(JSON.stringify(fixture));Object.assign(missing.system,{sampledAt:180000,cpuPercent:null,cores:null,load:[null,null,null],memory:{},game:{}});
  await page.evaluate(state=>render(state),missing);assert.equal(await page.locator('#cpuValue').textContent(),'—');assert.equal(await page.locator('#cpuGauge').getAttribute('aria-valuenow'),null);assert.equal(await page.locator('#loadLevel').textContent(),'Unavailable');assert.equal(await page.evaluate(()=>loadHistory.length),0);
  assert(!/NaN|Infinity/.test(await page.locator('#monitor').textContent()));
  await page.evaluate(state=>render(state),fixture);
  await page.route('**/private-test/state',route=>route.abort());await page.evaluate(async()=>{refreshing=false;await refresh();clearTimeout(timer);refreshing=true});
  assert.match(await page.locator('#freshness').textContent(),/Disconnected/);assert.equal(await page.locator('#cpuValue').textContent(),'36%');
  await page.screenshot({path:out+'/admin-disconnected.png',fullPage:true});
  await page.unroute('**/private-test/state');await page.evaluate(async()=>{refreshing=false;await refresh();clearTimeout(timer);refreshing=true});
  assert.equal(await page.locator('#freshness').getAttribute('data-stale'),'false');assert(await page.locator('.room').count()>0);
  assert.deepEqual(errors,[]);console.log('PASS: live endpoint, gauges, core-normalized high load, unknown values, bounded history, stale/recovery states and four responsive widths.');
 }finally{await browser?.close();await game.close();}
})().catch(e=>{console.error(e);process.exit(1)});
