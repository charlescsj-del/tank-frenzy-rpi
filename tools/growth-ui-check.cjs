#!/usr/bin/env node
'use strict';
// Levels, combat medals and sharing in a real browser against the real server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs'),F=require('../shared.js');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/growth');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer({publicUrl:'https://tanks.example'});let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});};
    const fits=async(p,selector)=>{const b=await p.locator(selector).boundingBox(),v=p.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' fits '+JSON.stringify(v)+' '+JSON.stringify(b));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');};
    const resize=async(p,width,height)=>{await p.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await p.setViewportSize({width,height});if(await p.evaluate(()=>joined))await p.evaluate(()=>setExpanded(true));};
    // Capture what the page hands to the system share sheet.
    const shareStub=()=>{window.shared=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared.push(data);}});};
    const pc=await browser.newPage({viewport:{width:1440,height:900}});watch(pc);await pc.addInitScript(shareStub);
    await pc.goto(base);await pc.waitForFunction(()=>playerProgress?.level);
    // Home: a new player sees Level 1 and how far the next level is.
    assert.equal(await pc.locator('#levelHomeTitle').textContent(),'Level 1 · Recruit');assert.equal(await pc.locator('#levelHomeNote').textContent(),'80 XP to Level 2');
    for(const [width,height]of [[1440,900],[390,844],[320,568],[844,390]]){await pc.setViewportSize({width,height});await fits(pc,'#quickPlay');await pc.locator('#levelHome').scrollIntoViewIfNeeded();await fits(pc,'#levelHome');await pc.screenshot({path:path.join(out,'home-'+width+'.png')});await pc.evaluate(()=>scrollTo(0,0));}
    await pc.setViewportSize({width:1440,height:900});
    const profile=await pc.evaluate(()=>({id:profileId}));
    // A friend arena with one AI: the level chip shows in the lobby.
    await pc.locator('#createRoom').click();await pc.waitForFunction(()=>latest?.phase==='waiting');
    assert.equal(await pc.locator('#waitingPlayers .level-chip').textContent(),'LV 1');
    const room=game.rooms.get(await pc.evaluate(()=>roomCode)),human=room.humans()[0];
    await pc.locator('#addBot').click();await pc.waitForFunction(()=>latest.players.length===2);
    await pc.locator('#startGame').click();await pc.waitForFunction(()=>latest?.phase==='playing');
    await pc.evaluate(()=>{if(typeof dismissCoach==='function')dismissCoach();});if(await pc.locator('#skipCoach').isVisible())await pc.locator('#skipCoach').click();
    const bot=[...room.players.values()].find(p=>p.bot);bot.brain={next:Infinity};bot.input={x:0,y:0,aimX:bot.x+100,aimY:bot.y,fire:false};human.shieldUntil=room.time+1000;
    const kill=(ricochet=false)=>{bot.hp=1;bot.shieldUntil=0;bot.respawnAt=0;room.damage(bot,human.id,1,ricochet);bot.hp=10;};
    // First kill: First Blood and Trick Shot appear as a toast and as a tag in the kill feed.
    kill(true);await pc.locator('#medalToast').waitFor({state:'visible'});
    assert.equal(await pc.locator('#medalToast').textContent(),'FIRST BLOOD · TRICK SHOT');assert.equal(await pc.locator('#killFeed li em').first().textContent(),'First Blood');
    await fits(pc,'#medalToast');await pc.screenshot({path:path.join(out,'medal-toast-desktop.png')});
    await pc.waitForTimeout(300);kill();await pc.waitForFunction(()=>document.getElementById('medalToast').textContent==='DOUBLE KILL');
    for(const [width,height]of [[390,844],[844,390]]){await resize(pc,width,height);await pc.waitForTimeout(200);kill(true);await pc.waitForFunction(()=>!document.getElementById('medalToast').hidden&&/TRICK SHOT/.test(document.getElementById('medalToast').textContent));await fits(pc,'#medalToast');await pc.screenshot({path:path.join(out,'medal-toast-'+width+'.png')});}
    await resize(pc,1440,900);
    // The toast clears itself and other players' medals never raise it.
    await pc.waitForFunction(()=>document.getElementById('medalToast').hidden,null,{timeout:6000});
    human.hp=1;human.shieldUntil=0;room.damage(human,bot.id,1);await pc.waitForTimeout(250);assert.equal(await pc.locator('#medalToast').isVisible(),false,'an opponent’s medal is not my toast');
    human.hp=10;human.respawnAt=0;human.shieldUntil=room.time+1000;
    // Win the match: experience, a level-up, medals, the next goal and a shareable summary.
    human.activeSeconds=30;human.kills=9;kill();room.rematchUntil=room.time+600;
    await pc.waitForFunction(()=>latest?.phase==='results'&&lastResult?.reward?.xp);await pc.locator('#rewardXp').waitFor({state:'visible'});
    const reward=await pc.evaluate(()=>lastResult.reward);assert.equal(reward.xp.levelUp,true);assert(reward.medals['double-kill']>=1&&reward.medals['first-blood']===1&&reward.medals.revenge>=1);
    assert.match(await pc.locator('#rewardXpTitle').textContent(),/^LEVEL UP! Level \d+ · /);assert.equal(await pc.locator('#rewardXpGain').textContent(),'+'+reward.xp.total+' XP');
    assert.equal(await pc.locator('#rewardXpNote').textContent(),'Promoted to Private!');assert.match(await pc.locator('#rewardMedals').textContent(),/^Medals · First Blood · Double Kill/);
    assert.match(await pc.locator('#rewardNext').textContent(),/^Next · \d+ XP to Level \d+ · /);
    assert.equal(await pc.locator('#rewardTotal').textContent(),'+'+reward.total+' coins');assert.equal(reward.total,20+30+30+20,'levels add no coins');
    await pc.waitForTimeout(1700);const level=await pc.evaluate(()=>playerProgress.level);
    assert.equal(await pc.locator('#rewardXpFill').evaluate(e=>e.style.width),Math.round(100*level.into/level.need)+'%','the bar settles on the saved progress');
    await pc.locator('#matchRewards').scrollIntoViewIfNeeded();await pc.screenshot({path:path.join(out,'results-desktop.png')});
    await pc.locator('#shareResult').click();const shared=await pc.evaluate(()=>window.shared);assert.equal(shared.length,1);
    assert.equal(shared[0].title,'Tank Frenzy');assert.equal(shared[0].url,'https://tanks.example/');
    assert.match(shared[0].text,/^🏆 Victory in Tank Frenzy! 10 kills · 1 death · /);assert.match(shared[0].text,/🏅 First Blood/);assert.match(shared[0].text,new RegExp('Level '+level.level+' '+level.rank));assert.match(shared[0].text,/Can you beat me\?$/);
    assert(!shared[0].text.includes(profile.id),'no private identifiers are shared');
    for(const [width,height]of [[390,844],[320,640],[844,390]]){await resize(pc,width,height);await pc.locator('#rewardXp').scrollIntoViewIfNeeded();await fits(pc,'#rewardXp');await pc.screenshot({path:path.join(out,'results-'+width+'.png')});await pc.locator('#shareResult').scrollIntoViewIfNeeded();await fits(pc,'#shareResult');}
    // Without a share sheet the summary is copied instead.
    await resize(pc,1440,900);await pc.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});window.copied=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});});
    await pc.locator('#shareResult').click();await pc.waitForFunction(()=>window.copied);assert.match(await pc.evaluate(()=>window.copied),/Can you beat me\? https:\/\/tanks\.example\/$/);assert.match(await pc.locator('#shareResult').textContent(),/Copied/);
    // Garage: level bar, all badges, progress on the counted ones.
    await pc.evaluate(()=>leave());await pc.locator('#levelHome').click();await pc.waitForFunction(()=>!progressLoading&&garageOpen);
    assert.equal(await pc.locator('#garageLevelTitle').textContent(),'Level '+level.level+' · '+level.rank);assert.equal(await pc.locator('.achievement-item').count(),F.achievements.length);
    assert.equal(await pc.locator('.achievement-item:not(.locked)').count(),Object.keys(await pc.evaluate(()=>playerProgress.achievements)).length);
    assert(await pc.locator('.achievement-item.locked progress').count()>=5);assert.match(await pc.locator('.achievement-item',{hasText:'Veteran'}).textContent(),/1 \/ 25/);
    for(const [width,height]of [[1440,900],[390,844],[320,640],[844,390]]){await resize(pc,width,height);await pc.locator('#garageLevel').scrollIntoViewIfNeeded();await fits(pc,'.garage-card');await fits(pc,'#garageLevel');await pc.locator('#achievementTitle').scrollIntoViewIfNeeded();await pc.screenshot({path:path.join(out,'garage-badges-'+width+'.png')});}
    await resize(pc,1440,900);await pc.locator('#closeGarage').click();
    assert.equal(await pc.locator('#levelHomeTitle').textContent(),'Level '+level.level+' · '+level.rank);
    // Quick Play lineup: everyone sees each human's level; AI tanks have none.
    const friend=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(friend);await friend.goto(base);await friend.waitForFunction(()=>playerProgress?.level);
    await pc.locator('#quickPlay').click();await pc.waitForFunction(()=>latest?.phase==='searching');await friend.locator('#quickPlay').click();await friend.waitForFunction(()=>latest?.players.length>=2);
    await friend.waitForFunction(()=>document.querySelectorAll('#matchmakingPlayers .level-chip').length===2);
    assert.deepEqual((await friend.locator('#matchmakingPlayers .level-chip').allTextContents()).sort(),['LV 1','LV '+level.level].sort());
    await fits(friend,'#matchmakingPlayers');await friend.screenshot({path:path.join(out,'lineup-phone.png')});await pc.screenshot({path:path.join(out,'lineup-desktop.png')});
    // The invitation dialog offers the system share sheet when the browser has one.
    await pc.evaluate(()=>leave());await friend.evaluate(()=>leave());await pc.evaluate(()=>{window.shared=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared.push(data);}});});
    await pc.locator('#createRoom').click();await pc.waitForFunction(()=>latest?.phase==='waiting');await pc.locator('#shareRoom').click();await pc.locator('#nativeShare').click();
    const invite=(await pc.evaluate(()=>window.shared))[0];assert.match(invite.url,/^https:\/\/tanks\.example\/\?room=/);assert.match(invite.text,/Join my Tank Frenzy arena/);
    assert.deepEqual(errors,[]);console.log('Growth UI passed: home level, lobby and lineup chips, medal toasts, results experience and level-up, next goal, share sheet and copy fallback, badges with progress, 4 viewports.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
