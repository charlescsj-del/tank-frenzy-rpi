#!/usr/bin/env node
'use strict';
// Daily missions, rivalries and the weekly champion's crown in real browsers against the real server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs'),{Room}=require('../game-server.cjs'),{periodStart}=require('../leaderboard.cjs'),{dayNumber}=require('../progress.cjs'),F=require('../shared.js');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/social');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer();let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});};
    const fits=async(p,selector)=>{const b=await p.locator(selector).boundingBox(),v=p.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' fits '+JSON.stringify(v)+' '+JSON.stringify(b));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');};
    const resize=async(p,width,height)=>{await p.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await p.setViewportSize({width,height});if(await p.evaluate(()=>joined))await p.evaluate(()=>setExpanded(true));};
    const ann=await browser.newPage({viewport:{width:1440,height:900}}),bo=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    for(const p of [ann,bo]){watch(p);await p.goto(base);await p.waitForFunction(()=>playerProgress?.missions);}
    const names={ann:'Ann',bo:'Bo'};
    for(const [p,name]of [[ann,names.ann],[bo,names.bo]])await p.evaluate(name=>{document.getElementById('callsign').value=name;rememberName?.(name);},name);
    const annId=await ann.evaluate(()=>profileId),boId=await bo.evaluate(()=>profileId);
    // Home and Garage: today's three missions, the same on both devices.
    const today=F.missionsFor(dayNumber(Date.now()));
    assert.equal(await ann.locator('#missionsHome').textContent(),'Missions · 0/3 →');assert.equal(await ann.locator('#missionsHome').getAttribute('aria-label'),'Daily missions: 0 of 3 done. Open details.');
    for(const [width,height]of [[1440,900],[390,844],[320,568],[844,390]]){await ann.setViewportSize({width,height});await fits(ann,'#quickPlay');await ann.locator('#missionsHome').scrollIntoViewIfNeeded();await fits(ann,'#missionsHome');await ann.screenshot({path:path.join(out,'home-'+width+'.png')});await ann.evaluate(()=>scrollTo(0,0));}
    await ann.setViewportSize({width:1440,height:900});
    await ann.locator('#missionsHome').click();await ann.waitForFunction(()=>garageOpen&&!progressLoading);
    assert.deepEqual(await ann.locator('#missionList [data-mission]').evaluateAll(cards=>cards.map(c=>c.getAttribute('data-mission'))),today.map(m=>m.id));
    assert.deepEqual(await ann.locator('#missionList .mission-card strong').allTextContents(),today.map(m=>m.name));
    assert.match(await ann.locator('#missionsBudget').textContent(),/^\+40 XP each · \+60 XP for all three$/);assert.match(await ann.locator('#missionsNote').textContent(),/^0 of 3 done today\. Everyone gets the same three\./);
    assert.match(await ann.locator('#rivalList').textContent(),/Play a match with a friend/);
    for(const [width,height]of [[1440,900],[390,844],[320,640],[844,390]]){await resize(ann,width,height);await ann.locator('#missionsTitle').scrollIntoViewIfNeeded();await fits(ann,'.garage-card');await ann.screenshot({path:path.join(out,'missions-'+width+'.png')});for(const mission of today){await ann.locator('[data-mission="'+mission.id+'"]').scrollIntoViewIfNeeded();await fits(ann,'[data-mission="'+mission.id+'"]');}}
    await resize(ann,1440,900);await ann.locator('#closeGarage').click();
    await bo.locator('#missionsHome').click();await bo.waitForFunction(()=>garageOpen&&!progressLoading);assert.deepEqual(await bo.locator('#missionList .mission-card strong').allTextContents(),today.map(m=>m.name),'everyone has the same missions');await bo.locator('#closeGarage').click();
    // Ann won twice last week, so she is this week's champion.
    const real=game.leaderboard.now;game.leaderboard.now=()=>periodStart('week')-2*864e5;
    for(let i=0;i<2;i++){const room=new Room('OLD'),p=room.add(names.ann),q=room.add(names.bo);p.profileId=annId;q.profileId=boId;p.kills=10;room.roundId=randomUUID();room.matchPlayers=new Map([[p.id,p],[q.id,q]]);room.winner={id:p.id};game.leaderboard.record(room);}
    game.leaderboard.now=real;
    await bo.locator('#leaderboardButton').click();await bo.locator('#leaderboardChampion').waitFor({state:'visible'});
    assert.match(await bo.locator('#leaderboardChampion').textContent(),/^Last week’s champion · Ann · 2 wins\. Wears the crown all week\.$/);assert.equal(await bo.locator('#leaderboardChampion .crown-icon').count(),1);
    await fits(bo,'#leaderboardChampion');await bo.screenshot({path:path.join(out,'leaderboard-champion-phone.png')});await bo.locator('#closeLeaderboard').click();
    // A friend arena: both see the crown beside Ann, in the lobby and in battle.
    await ann.locator('#createRoom').click();await ann.waitForFunction(()=>latest?.phase==='waiting');const code=await ann.evaluate(()=>roomCode);
    await bo.goto(base+'/?room='+code);await bo.waitForFunction(()=>latest?.phase==='waiting'&&latest.players.length===2);await ann.waitForFunction(()=>latest.players.length===2);
    for(const p of [ann,bo]){assert.equal(await p.locator('#waitingPlayers li',{hasText:'Ann'}).locator('.crown-icon').count(),1);assert.equal(await p.locator('#waitingPlayers li',{hasText:'Bo'}).locator('.crown-icon').count(),0);}
    await bo.screenshot({path:path.join(out,'lobby-crown-phone.png')});await ann.screenshot({path:path.join(out,'lobby-crown-desktop.png')});
    const room=game.rooms.get(code),pa=room.humans().find(p=>p.profileId===annId),pb=room.humans().find(p=>p.profileId===boId);
    await ann.locator('#startGame').click();for(const p of [ann,bo]){await p.waitForFunction(()=>latest?.phase==='playing');await p.evaluate(()=>{if(typeof dismissCoach==='function')dismissCoach();});}
    pa.x=700;pa.y=500;pb.x=900;pb.y=500;pa.shieldUntil=pb.shieldUntil=room.time+1000;
    await bo.waitForFunction(()=>Math.abs(tanks.find(t=>t.id!==myId).targetX-700)<1);assert.equal(await bo.evaluate(()=>tanks.find(t=>t.id!==myId).crown),true);
    await bo.waitForTimeout(400);await bo.screenshot({path:path.join(out,'battle-crown-phone.png')});await ann.waitForTimeout(200);await ann.screenshot({path:path.join(out,'battle-crown-desktop.png')});
    // Ann wins 10–2 with stats that finish every mission that one match can finish.
    const kill=(attacker,victim,ricochet=false)=>{victim.hp=1;victim.shieldUntil=0;victim.respawnAt=0;room.damage(victim,attacker.id,1,ricochet);victim.hp=10;victim.shieldUntil=room.time+1000;};
    kill(pb,pa);kill(pb,pa);for(let i=0;i<9;i++)kill(pa,pb,i<3);
    Object.assign(pa,{activeSeconds:40,shots:40,hits:24,damageDealt:60,ricochetHits:3,pickups:3});pb.activeSeconds=40;room.rematchUntil=room.time+900;kill(pa,pb);
    for(const p of [ann,bo])await p.waitForFunction(()=>latest?.phase==='results'&&lastResult?.reward?.rivals);
    const reward=await ann.evaluate(()=>lastResult.reward),expected=today.filter(m=>m.id!=='matches'&&m.id!=='survivor'||m.id==='survivor');
    const done=today.filter(m=>m.id!=='matches');assert.deepEqual(reward.missions.map(m=>m.id).sort(),done.map(m=>m.id).sort(),'every mission one match can finish');
    assert.equal(reward.missionSweep,done.length===3?60:0);assert.equal(reward.xp.missions,done.length*40+(done.length===3?60:0));assert(expected.length);
    assert.equal(await ann.locator('#rewardMissions').textContent(),[...done.map(m=>'Mission: '+m.name+' +40 XP'),done.length===3?'All three missions +60 XP':''].filter(Boolean).join(' · '));
    assert.equal(await ann.locator('#rewardRivals').textContent(),'vs Bo · You lead 1 – 0');assert.equal(await bo.locator('#rewardRivals').textContent(),'vs Ann · You trail 0 – 1');
    for(const p of [ann,bo])assert.equal(await p.locator('#resultsRows tr',{hasText:'Ann'}).locator('.crown-icon').count(),1);
    assert(await ann.evaluate(()=>Boolean(playerProgress.achievements.champion)),'the champion badge');
    await ann.locator('#rewardMissions').scrollIntoViewIfNeeded();await ann.screenshot({path:path.join(out,'results-desktop.png')});
    for(const [width,height]of [[390,844],[320,640],[844,390]]){await resize(bo,width,height);await bo.locator('#rewardRivals').scrollIntoViewIfNeeded();await fits(bo,'#rewardRivals');await bo.screenshot({path:path.join(out,'results-'+width+'.png')});}
    // Garage afterwards: missions ticked off, and the rival with both sides of the record.
    await ann.evaluate(()=>leave());await ann.locator('#missionsHome').waitFor({state:'visible'});
    assert.equal(await ann.locator('#missionsHome').textContent(),'Missions · '+done.length+'/3 →');assert.equal(await ann.locator('#missionsHome').evaluate(e=>e.classList.contains('tile-done')),done.length===3);
    await ann.locator('#missionsHome').click();await ann.waitForFunction(()=>garageOpen&&!progressLoading);
    assert.equal(await ann.locator('#missionList .mission-card.completed').count(),done.length);if(done.length===3)assert.equal(await ann.locator('#missionsBudget').textContent(),'All three done ✓');
    assert.equal(await ann.locator('.rival-item').count(),1);assert.equal(await ann.locator('.rival-item.ahead strong').textContent(),'Bo');assert.equal(await ann.locator('.rival-item span').textContent(),'You 1 – 0');
    assert.equal(await ann.locator('.rival-item small').textContent(),'1 match together · You destroyed them 10 times · They destroyed you 2 times');
    for(const [width,height]of [[1440,900],[390,844],[320,640],[844,390]]){await resize(ann,width,height);await ann.locator('#rivalsTitle').scrollIntoViewIfNeeded();await fits(ann,'.garage-card');await ann.locator('.rival-item').scrollIntoViewIfNeeded();await fits(ann,'.rival-item');await ann.screenshot({path:path.join(out,'rivals-'+width+'.png')});}
    await bo.evaluate(()=>leave());await bo.locator('#garageButton').click();await bo.waitForFunction(()=>garageOpen&&!progressLoading);
    assert.equal(await bo.locator('.rival-item.behind span').textContent(),'You 0 – 1');assert(!(await bo.locator('#rivalList').textContent()).includes(annId));
    assert.deepEqual(errors,[]);console.log('Social UI passed: daily missions on home, Garage and results, rivals from both sides, champion crown in leaderboard, lobby, battle and results, 4 viewports.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>process.exit(process.exitCode||0));
