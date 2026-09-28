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
  // The Content-Security-Policy must not block anything the pages use.
  const blocked=message=>{if(/Content Security Policy|Refused to/i.test(message.text()))errors.push(message.text());};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',blocked);await page.goto(base+'/private-test');
  await page.waitForFunction(()=>document.getElementById('freshness').textContent.startsWith('Live'));
  await page.waitForTimeout(1200);
  const state=await page.evaluate(async()=>{const value=await fetch(adminRoot+'/state').then(r=>r.json());clearTimeout(timer);refreshing=true;return value;});
  assert(state.system.memory.totalBytes===null||state.system.memory.totalBytes>0);assert(state.system.game.rssBytes===null||state.system.game.rssBytes>0);console.log('Live authenticated endpoint passed.');
  const fixture={...state,version:'1.17.0',uptime:26780,system:{sampledAt:100000,cores:4,cpuPercent:36.4,memory:{usedPercent:61.2,totalBytes:4*1073741824,usedBytes:2.448*1073741824,availableBytes:1.552*1073741824,basis:'available'},load:[1.48,1.02,.86],game:{cpuPercent:16.2,rssBytes:72*1048576}}};
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
  game.rooms.delete(room.code);
  room.add('Rookie');// Matches count only with two people.
  const player=room.players.values().next().value;player.kills=3;player.deaths=2;player.damageDealt=27;room.winner={id:player.id,name:player.name};game.leaderboard.record(room);
  await page.goto(base+'/');await page.locator('#leaderboardButton').click();
  assert.deepEqual(await page.locator('#leaderboard thead th').allTextContents(),['#','Player','Wins','Matches','Kills','Damage','Deaths','K/D']);
  await page.waitForFunction(()=>document.querySelectorAll('#leaderboardRows tr').length>0);
  assert.deepEqual(await page.locator('#leaderboardRows tr:first-child td').allTextContents(),['🥇','Commander','1','1','3','27','2','1.5']);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone page must not overflow');
  assert(await page.locator('.leaderboard-body').evaluate(el=>el.scrollWidth>el.clientWidth),'wide leaderboard scrolls within the dialog on a phone');
  await page.screenshot({path:out+'/leaderboard-phone.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/private-test');
  await page.waitForFunction(()=>document.querySelectorAll('#boardRows tr').length===3);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#boardRows tr',{hasText:'Rookie'}).getByRole('button',{name:'Remove'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#boardRows tr').length===2);assert.match(await page.locator('#boardRows').textContent(),/Commander/);
  assert.equal(game.leaderboard.top().length,2,'Remove deletes the name on the server');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'admin leaderboard fits a phone');
  await page.locator('.board').screenshot({path:out+'/admin-leaderboard-phone.png'});await page.setViewportSize({width:1440,height:1000});await page.locator('.board').screenshot({path:out+'/admin-leaderboard.png'});console.log('Admin leaderboard lists and removes names.');
  const touch=await browser.newPage({viewport:{width:390,height:780},hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  touch.on('pageerror',e=>errors.push(e.message));touch.on('console',blocked);await touch.goto(base+'/');
  const combat={type:'state',room:'QUARRY',settings:{mode:'teams',bouncing:true,powers:true},phase:'playing',countdownIn:0,ownerId:null,teamScores:[4,3],pickups:[],map:{id:777,walls:[],spawns:[[90,90],[1510,950],[1510,90],[90,950]]},time:42,winner:null,rematchIn:0,rematchVotes:[],players:[
    {id:'me',name:'Commander',slot:0,team:0,x:800,y:520,a:0,aim:0,hp:10,kills:2,deaths:1,shots:10,hits:5,life:1,connected:true},
    {id:'ally',name:'Moss',slot:2,team:0,x:850,y:550,a:0,aim:0,hp:10,kills:2,deaths:1,shots:10,hits:5,life:1,connected:true},
    {id:'foe',name:'Glacier',slot:1,team:1,x:1500,y:520,a:0,aim:0,hp:10,kills:2,deaths:2,shots:10,hits:5,life:1,connected:true},
    {id:'foe2',name:'Orchid',slot:3,team:1,x:800,y:10,a:0,aim:0,hp:10,kills:1,deaths:2,shots:10,hits:5,life:1,connected:true}
  ],shells:[],events:[]};
  const view=await touch.evaluate(state=>{joined=true;myId='me';spectating=false;roomCode='QUARRY';$('overlay').classList.add('hidden');$('arena').classList.remove('lobby-open');document.body.classList.remove('in-lobby');applySnapshot(state);resize();draw();return {touch:touchMedia.matches,roles:tanks.map(teamRelation),markers:enemyMarkers()};},combat);
  assert.equal(view.touch,true);assert.deepEqual(view.roles,[null,'ally','enemy','enemy']);assert.deepEqual(view.markers.map(m=>m.id),['foe','foe2']);
  assert.equal(await touch.locator('#battleProgress strong').textContent(),'TEAM 4 / 10');
  assert.equal(await touch.locator('#battleProgress small').textContent(),'6 KILLS TO WIN');
  assert.deepEqual(await touch.locator('.battle-opponent-hp').allTextContents(),['10/10','10/10','10/10']);
  assert.equal(await touch.locator('.battle-opponent.ally').count(),1);
  assert(await touch.locator('#battleHud').isVisible());
  assert(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'battle HUD fits on a phone');
  await touch.screenshot({path:out+'/team-close-view-phone.png',fullPage:true});
  await touch.setViewportSize({width:844,height:390});
  assert(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'landscape battle HUD fits the viewport');
  await touch.screenshot({path:out+'/team-close-view-landscape.png',fullPage:true});
  await touch.evaluate(state=>{state.phase='results';state.winner={id:'me',team:0,name:'Orange team'};state.teamScores=[10,6];state.rematchIn=15;state.rematchNeeded=3;applySnapshot(state);draw();},{...combat});
  assert.deepEqual(await touch.locator('#resultsRows tr.team-heading th').allTextContents(),['ORANGE TEAM · 10 KILLS · WINNER ★','BLUE TEAM · 6 KILLS']);
  assert.equal(await touch.evaluate(()=>enemyMarkers().length),0);
  await touch.screenshot({path:out+'/team-results-phone.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: live endpoint, gauges, core-normalized high load, unknown values, bounded history, stale/recovery states and four responsive widths.');
 }finally{await browser?.close();await game.close();}
})().catch(e=>{console.error(e);process.exit(1)});
