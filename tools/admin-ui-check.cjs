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
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}:{})});
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
  assert.equal(await page.locator('#cpuValue').textContent(),'36%');assert.match(await page.locator('#cpuGauge').getAttribute('aria-valuetext'),/16.2 percent of one core/);
  assert.equal(await page.locator('#memoryValue').textContent(),'61%');assert.equal(await page.locator('#loadRatio1').textContent(),'0.37 per core');
  const gameCpuArc=Number((await page.locator('#cpuGameArc').getAttribute('stroke-dasharray')).split(' ')[0]);
  const gameMemoryArc=Number((await page.locator('#memoryGameArc').getAttribute('stroke-dasharray')).split(' ')[0]);
  assert(Math.abs(gameCpuArc-16.2/4)<.001,'game CPU uses the whole Pi as the gauge denominator');
  assert(Math.abs(gameMemoryArc-72/4096*100)<.001,'game RSS uses total RAM as the gauge denominator');
  assert.equal(await page.locator('#cpuGameValue').textContent(),'Game 4.0%');
  assert.equal(await page.locator('#memoryGameValue').textContent(),'Game 1.8% (72 MiB)');
  assert.equal(await page.locator('#memoryAvailable').textContent(),'1.55 GiB available');
  assert.equal(await page.locator('#gameMemory').count(),0,'no duplicate game memory line below the gauge');
  assert.equal(await page.locator('#cpuGameArc').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.equal(await page.evaluate(()=>loadHistory.length),61);assert.equal(await page.locator('#cpuGauge').getAttribute('aria-valuenow'),'36.4');
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
    if(width<=390)assert(await page.evaluate(()=>['cpuGameValue','memoryGameValue'].every(id=>{const text=document.getElementById(id),box=text.getBoundingClientRect(),scale=text.parentNode.querySelector('.scale').getBoundingClientRect();return box.bottom+2<scale.top&&box.width<text.ownerSVGElement.getBoundingClientRect().width*.85})),'mobile gauge labels clear the scale and fit their arcs');
    await page.screenshot({path:out+'/admin-'+width+'.png',fullPage:true});
  }
  console.log('Desktop, tablet and phone gauges rendered; history bounded.');
  const high=JSON.parse(JSON.stringify(fixture));Object.assign(high.system,{sampledAt:166000,cpuPercent:95.6,load:[8.4,5.1,3.7]});Object.assign(high.system.memory,{usedPercent:94,usedBytes:3.76*1073741824,availableBytes:.24*1073741824});high.system.game.cpuPercent=146;
  await page.evaluate(state=>render(state),high);assert.equal(await page.locator('#cpuResource').getAttribute('data-tone'),'high');assert.equal(await page.locator('#memoryResource').getAttribute('data-tone'),'high');
  assert.equal(await page.locator('#load1').textContent(),'8.40');assert.match(await page.locator('#cpuGauge').getAttribute('aria-valuetext'),/146.0 percent of one core/);
  assert.equal(await page.locator('#loadBar1').evaluate(e=>e.style.width),'100%');assert.equal(await page.locator('#loadRatio1').textContent(),'2.10 per core');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/admin-high.png',fullPage:true});
  const missing=JSON.parse(JSON.stringify(fixture));Object.assign(missing.system,{sampledAt:180000,cpuPercent:null,cores:null,load:[null,null,null],memory:{},game:{}});
  await page.evaluate(state=>render(state),missing);assert.equal(await page.locator('#cpuValue').textContent(),'—');assert.equal(await page.locator('#cpuGauge').getAttribute('aria-valuenow'),null);assert.equal(await page.locator('#loadLevel').textContent(),'Unavailable');assert.equal(await page.evaluate(()=>loadHistory.length),0);
  assert.equal(await page.locator('#cpuGameArc').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await page.locator('#memoryGameArc').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert(!/NaN|Infinity/.test(await page.locator('#monitor').textContent()));
  await page.evaluate(state=>render(state),fixture);
  await page.route('**/private-test/state',route=>route.abort());await page.evaluate(async()=>{refreshing=false;await refresh();clearTimeout(timer);refreshing=true});
  assert.match(await page.locator('#freshness').textContent(),/Disconnected/);assert.equal(await page.locator('#cpuValue').textContent(),'36%');
  await page.screenshot({path:out+'/admin-disconnected.png',fullPage:true});
  await page.unroute('**/private-test/state');await page.evaluate(async()=>{refreshing=false;await refresh();clearTimeout(timer);refreshing=true});
  assert.equal(await page.locator('#freshness').getAttribute('data-stale'),'false');assert(await page.locator('.room').count()>0);
  game.rooms.delete(room.code);
  room.add('Rookie');
  const player=room.players.values().next().value;player.kills=3;player.deaths=2;player.damageDealt=27;room.winner={id:player.id,name:player.name};game.leaderboard.record(room);
  await page.goto(base+'/');await page.locator('#leaderboardButton').click();
  assert.deepEqual(await page.locator('#leaderboard thead th').allTextContents(),['#','Player','Wins','Matches','Kills','Damage','Deaths','K/D']);
  await page.waitForFunction(()=>document.querySelectorAll('#leaderboardRows tr').length>0);
  assert.deepEqual(await page.locator('#leaderboardRows tr:first-child td').allTextContents(),['1','Commander','1','1','3','27','2','1.5']);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone page must not overflow');
  assert(await page.locator('.leaderboard-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'compact leaderboard fits the phone');
  await page.locator('#leaderboardRows tr:first-child').click();assert(await page.locator('.leaderboard-details').first().isVisible(),'tapping reveals secondary statistics');
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
  await touch.locator('#createRoom').click();
  await touch.waitForFunction(()=>joined&&latest?.phase==='waiting');
  await touch.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();setExpanded(true);});
  for(const [width,height] of [[390,780],[844,390]]){
    await touch.setViewportSize({width,height});
    const form=await touch.evaluate(()=>({scroll:document.documentElement.scrollHeight,viewport:innerHeight,lobby:$('waitingRoom').querySelector('.dialog').getBoundingClientRect().bottom,start:$('startGame').getBoundingClientRect().bottom}));
    assert(form.scroll<=form.viewport+2&&form.lobby<=form.viewport&&form.start<=form.viewport,'one-tap creation opens a usable lobby at '+width+'×'+height+': '+JSON.stringify(form));
    await touch.screenshot({path:out+'/create-arena-'+width+'.png'});
  }
  await touch.setViewportSize({width:390,height:780});await touch.evaluate(()=>leave());
  const combat={type:'state',room:'QUARRY',settings:{mode:'teams',bouncing:true,powers:true},phase:'playing',countdownIn:0,ownerId:null,teamScores:[4,3],pickups:[],map:{id:777,walls:[],spawns:[[90,90],[1510,950],[1510,90],[90,950]]},time:42,winner:null,rematchIn:0,rematchVotes:[],players:[
    {id:'me',name:'Commander',slot:0,team:0,x:800,y:520,a:0,aim:0,hp:10,kills:2,deaths:1,shots:10,hits:5,life:1,connected:true},
    {id:'ally',name:'Moss',slot:2,team:0,x:1510,y:520,a:0,aim:0,hp:10,kills:2,deaths:1,shots:10,hits:5,life:1,connected:true},
    {id:'foe',name:'Glacier',slot:1,team:1,x:1500,y:520,a:0,aim:0,hp:10,kills:2,deaths:2,shots:10,hits:5,life:1,connected:true},
    {id:'foe2',name:'Orchid',slot:3,team:1,x:875,y:550,a:0,aim:0,hp:7,kills:1,deaths:2,shots:10,hits:5,life:1,connected:true}
  ],shells:[],events:[]};
  await touch.evaluate(state=>{joined=true;myId='me';spectating=false;roomCode='QUARRY';$('overlay').classList.add('hidden');$('arena').classList.remove('lobby-open');document.body.classList.remove('in-lobby');applySnapshot(state);}, {...combat,phase:'waiting',ownerId:'me',players:combat.players.map((p,i)=>({...p,bot:i>0}))});
  for(const [width,height] of [[390,780],[844,390]]){
    await touch.setViewportSize({width,height});
    const waiting=await touch.evaluate(()=>({scroll:document.documentElement.scrollHeight,viewport:innerHeight,panel:$('waitingRoom').getBoundingClientRect().bottom,start:$('startGame').getBoundingClientRect().bottom,bots:$('botControls').getBoundingClientRect().bottom}));
    assert(waiting.scroll<=waiting.viewport+2&&waiting.panel<=waiting.viewport+2&&waiting.start<=waiting.viewport&&waiting.bots<=waiting.viewport,'four-player waiting room fits one '+width+'×'+height+' screen: '+JSON.stringify(waiting));
    await touch.screenshot({path:out+'/waiting-bots-'+width+'.png'});
  }
  await touch.setViewportSize({width:390,height:780});
  await touch.evaluate(state=>applySnapshot(state),{...combat,phase:'countdown',countdownIn:3});
  for(const [width,height] of [[390,780],[844,390]]){
    await touch.setViewportSize({width,height});
    const frame=await touch.evaluate(()=>({arena:$('arena').getBoundingClientRect(),stage:document.querySelector('.stage').getBoundingClientRect(),header:$('arenaHeader').getBoundingClientRect(),viewport:innerHeight,scroll:document.documentElement.scrollHeight}));
    assert(frame.arena.height>=frame.viewport-2&&frame.stage.top<frame.header.bottom-10&&frame.scroll<=frame.viewport+2,'countdown map fills '+width+'×'+height+' screen');
    await touch.screenshot({path:out+'/countdown-'+width+'.png'});
  }
  await touch.setViewportSize({width:390,height:780});
  const view=await touch.evaluate(state=>{joined=true;myId='me';spectating=false;roomCode='QUARRY';$('overlay').classList.add('hidden');$('arena').classList.remove('lobby-open');document.body.classList.remove('in-lobby');applySnapshot(state);resize();draw();return {touch:touchMedia.matches,roles:tanks.map(teamRelation),markers:enemyMarkers()};},combat);
  assert.equal(view.touch,true);assert.deepEqual(view.roles,[null,'ally','enemy','enemy']);assert.deepEqual(view.markers.map(m=>[m.id,m.relation]),[['ally','ally'],['foe','enemy']]);
  assert.equal(await touch.locator('#battleProgress strong').textContent(),'TEAM 4 / 10');
  assert.equal(await touch.locator('#battleProgress small').textContent(),'6 KILLS TO WIN');
  assert.equal(await touch.locator('.battle-opponent').count(),3);
  assert.equal(await touch.locator('.battle-opponent-name').count(),0,'no player names cover the map in the top header');
  assert.equal(await touch.locator('.battle-opponent.ally').getAttribute('aria-label'),'Teammate Moss: 2 kills');
  assert.equal(await touch.locator('.battle-health,.battle-opponent-hp').count(),0,'health is shown by each tank, not repeated in the header');
  assert.equal(await touch.locator('.battle-opponent.ally').count(),1);
  assert.equal(await touch.locator('.roster-card.me .roster-name').isVisible(),false,'own name does not crowd the health bar');
  const ownHealth=await touch.locator('.roster-card.me .health').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,label:el.getAttribute('aria-label')}));
  assert(ownHealth.width>=100&&ownHealth.height>=14&&ownHealth.label==='10 / 10 health','own health is a large accessible bar');
  assert(await touch.locator('#battleHud').isVisible());
  const layout=await touch.evaluate(()=>({stage:document.querySelector('.stage').getBoundingClientRect(),header:document.querySelector('#arenaHeader').getBoundingClientRect(),progress:document.querySelector('#battleProgress').getBoundingClientRect(),background:getComputedStyle(document.querySelector('#arenaHeader')).backgroundColor}));
  assert(layout.stage.top<layout.header.bottom-20,'the map extends behind the floating HUD');
  assert(layout.progress.left>=layout.stage.left+17,'the kill counter stays clear of the screen edge');
  assert.equal(layout.background,'rgba(0, 0, 0, 0)','the floating header does not cover the map with an opaque band');
  await touch.evaluate(()=>announceKill({by:'me',player:'foe',streak:1},latest.players));
  const notification=await touch.evaluate(()=>({menu:$('arenaMenu').getBoundingClientRect(),feed:$('killFeed').getBoundingClientRect()}));
  assert(notification.feed.top>=notification.menu.bottom+4,'kill notifications sit below the menu button');
  assert(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'battle HUD fits on a phone');
  await touch.screenshot({path:out+'/team-close-view-phone.png',fullPage:true});
  await touch.setViewportSize({width:844,height:390});
  assert(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'landscape battle HUD fits the viewport');
  assert(await touch.evaluate(()=>document.querySelector('.stage').getBoundingClientRect().top<document.querySelector('#arenaHeader').getBoundingClientRect().bottom-20),'landscape map extends behind the HUD');
  await touch.screenshot({path:out+'/team-close-view-landscape.png',fullPage:true});
  await touch.evaluate(state=>{state.phase='results';state.winner={id:'me',team:0,name:'Orange team'};state.teamScores=[10,6];state.rematchIn=15;state.rematchNeeded=3;applySnapshot(state);draw();},{...combat});
  assert.equal(await touch.locator('#battleHud').isVisible(),false,'opponent health disappears after the match');
  const resultsFrame=await touch.evaluate(()=>({arena:$('arena').getBoundingClientRect(),stage:document.querySelector('.stage').getBoundingClientRect(),header:$('arenaHeader').getBoundingClientRect(),viewport:innerHeight,scroll:document.documentElement.scrollHeight}));
  assert(resultsFrame.arena.height>=resultsFrame.viewport-2&&resultsFrame.stage.top<resultsFrame.header.bottom-10&&resultsFrame.scroll<=resultsFrame.viewport+2,'results retain the full-screen map');
  assert.deepEqual(await touch.locator('#resultsRows tr.team-heading th').allTextContents(),['ORANGE TEAM · 10 KILLS · WINNER ★','BLUE TEAM · 6 KILLS']);
  assert.equal(await touch.evaluate(()=>enemyMarkers().length),0);
  for(const [width,height] of [[390,780],[844,390]]){
    await touch.setViewportSize({width,height});
    const result=await touch.evaluate(()=>({arena:$('arena').getBoundingClientRect(),stage:document.querySelector('.stage').getBoundingClientRect(),header:$('arenaHeader').getBoundingClientRect(),viewport:innerHeight,scroll:document.documentElement.scrollHeight,leave:$('resultsLeave').getBoundingClientRect()}));
    assert(result.arena.height>=result.viewport-2&&result.stage.top<result.header.bottom-10&&result.scroll<=result.viewport+2&&result.leave.bottom<=result.viewport,'results fill '+width+'×'+height+' screen with Leave visible');
    await touch.screenshot({path:out+'/team-results-'+width+'.png'});
  }
  await touch.evaluate(()=>{joined=false;showLobby();updateTouchControls();});
  assert.equal(await touch.locator('#battleHud').isVisible(),false,'live health is hidden in the lobby');
  assert.equal(await touch.locator('#battleOpponents').locator('.battle-opponent').count(),0,'old opponent chips are cleared in the lobby');
  await touch.screenshot({path:out+'/lobby-after-battle-phone.png',fullPage:true});
  const resume=await browser.newPage({viewport:{width:390,height:780},hasTouch:true,isMobile:true});
  resume.on('pageerror',e=>errors.push(e.message));resume.on('dialog',dialog=>dialog.accept());
  const recoverRoom=new Room('RECOVER');recoverRoom.add('Host');game.rooms.set('RECOVER',recoverRoom);
  await resume.addInitScript(()=>localStorage.setItem('tank-frenzy-name','Returning'));await resume.goto(base+'/?room=RECOVER');
  await resume.waitForFunction(()=>joined&&myId&&token);const originalId=await resume.evaluate(()=>myId);
  await resume.reload();await resume.waitForFunction(id=>joined&&myId===id,originalId);
  assert.equal(await resume.locator('#waitingRoom').isVisible(),true,'same-tab reload recovers the reserved tank');
  await resume.close();
  assert.deepEqual(errors,[]);console.log('PASS: live endpoint, gauges, core-normalized high load, unknown values, bounded history, stale/recovery states and four responsive widths.');
 }finally{await browser?.close();await game.close();}
})().catch(e=>{console.error(e);process.exit(1)});
