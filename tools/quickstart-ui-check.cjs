#!/usr/bin/env node
'use strict';
// A newcomer's instant first match and the warm-up while Quick Play searches, in real browsers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/quickstart');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer({quickSearchSeconds:60,quickReadySeconds:3});let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});};
    const fits=async(p,selector)=>{const b=await p.locator(selector).boundingBox(),v=p.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' fits '+JSON.stringify(v)+' '+JSON.stringify(b));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');};
    const resize=async(p,width,height)=>{await p.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await p.setViewportSize({width,height});if(await p.evaluate(()=>joined))await p.evaluate(()=>setExpanded(true));};
    const roomOf=async p=>game.rooms.get(await p.evaluate(()=>roomCode));
    // A brand-new player on a phone presses Play and is on the field at once, with the countdown running.
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(phone);await phone.goto(base);await phone.waitForFunction(()=>playerProgress);
    await phone.evaluate(()=>{window.sawSearch=false;const tick=()=>{if(!document.getElementById('matchmaking').hidden)sawSearch=true;requestAnimationFrame(tick);};tick();});
    const pressed=Date.now();await phone.locator('#quickPlay').click();await phone.waitForFunction(()=>latest?.phase==='countdown');const toField=Date.now()-pressed;
    assert(toField<2500,'on the field in '+toField+' ms');assert.equal(await phone.evaluate(()=>sawSearch),false,'no search or line-up screen for a first match');
    assert.equal(await phone.evaluate(()=>latest.players.filter(p=>p.bot).length),3);assert(await phone.locator('#countdown').isVisible());await phone.screenshot({path:path.join(out,'first-match-countdown-phone.png')});
    await phone.waitForFunction(()=>latest?.phase==='playing');const toBattle=Date.now()-pressed;assert(toBattle<6500,'fighting in '+toBattle+' ms');
    assert.equal((await roomOf(phone)).botSkill,'easy');
    // Finish that match. From now on this player queues like everyone else.
    {const room=await roomOf(phone),human=room.humans()[0],bot=[...room.players.values()].find(p=>p.bot);human.activeSeconds=20;human.kills=9;human.shieldUntil=room.time+100;bot.hp=1;bot.shieldUntil=0;room.damage(bot,human.id,1);room.rematchUntil=room.time+60;}
    await phone.locator('#results').waitFor({state:'visible'});await phone.evaluate(()=>leave());
    await phone.locator('#quickPlay').click();await phone.waitForFunction(()=>latest?.phase==='searching');
    // The search is a compact bar over the live field, with the thumb controls ready.
    assert.equal(await phone.evaluate(()=>document.getElementById('matchmaking').classList.contains('warm-up')),true);assert.match(await phone.locator('#matchmakingNote').textContent(),/Drive and shoot to warm up\.$/);
    assert.equal(await phone.locator('#thumbControls').isVisible(),true);await fits(phone,'.matchmaking-card');
    const bar=await phone.locator('.matchmaking-card').boundingBox();assert(bar.height<260,'the bar leaves the field visible ('+Math.round(bar.height)+' px)');await phone.screenshot({path:path.join(out,'warm-up-phone.png')});
    // A second, brand-new player on a desktop joins the person already searching instead of starting alone.
    const pc=await browser.newPage({viewport:{width:1440,height:900}});watch(pc);await pc.goto(base);await pc.locator('#quickPlay').click();await pc.waitForFunction(()=>latest?.phase==='searching'&&latest.players.length===2);
    assert.equal(await pc.evaluate(()=>roomCode),await phone.evaluate(()=>roomCode));await fits(pc,'.matchmaking-card');
    const room=await roomOf(pc),me=room.humans().find(p=>p.id!==room.humans()[0].id),other=room.humans()[0],startX=me.x,health=other.hp;
    // Drive with the keyboard and fire with the mouse: the server moves the tank and launches shells.
    await pc.keyboard.down(me.x<800?'KeyD':'KeyA');await pc.waitForFunction(x=>Math.abs(tanks.find(t=>t.id===myId).targetX-x)>60,startX);await pc.keyboard.up(me.x<800?'KeyD':'KeyA');
    assert(Math.abs(me.x-startX)>60,'the server moved the tank');
    await phone.waitForFunction(id=>{const t=tanks.find(t=>t.id===id);return t&&Math.abs(t.x-t.targetX)<30&&t.targetX!==undefined;},me.id);assert(Math.abs(await phone.evaluate(id=>tanks.find(t=>t.id===id).targetX,me.id)-me.x)<80,'the other player sees the tank move');
    const box=await pc.locator('#game').boundingBox();await pc.mouse.move(box.x+box.width/2,box.y+box.height*.7);await pc.mouse.down();await pc.waitForFunction(()=>shells.length>0);await pc.mouse.up();
    assert(me.shots>0);await pc.screenshot({path:path.join(out,'warm-up-desktop.png')});await pc.waitForFunction(()=>shells.length===0,null,{timeout:15000});
    // Point straight at the other tank and fire: a warm-up shell never hurts.
    me.x=other.x+(other.x<800?140:-140);me.y=other.y;const target=await pc.evaluate(id=>{const r=document.getElementById('game').getBoundingClientRect(),t=tanks.find(t=>t.id===id),p=FIELD.project(t.targetX,t.targetY);return {x:r.left+offsetX+p.x*scale,y:r.top+offsetY+p.y*scale};},other.id);
    await pc.mouse.move(target.x,target.y);await pc.waitForTimeout(150);const shots=me.shots;await pc.mouse.down();for(let i=0;i<40&&me.shots===shots;i++)await pc.waitForTimeout(50);await pc.mouse.up();assert(me.shots>shots,'the aimed shot was fired');await pc.waitForFunction(()=>shells.length===0,null,{timeout:15000});
    assert.equal(other.hp,health,'no damage while warming up');assert.equal(me.kills,0);assert.equal(me.hits,0);
    for(const [width,height]of [[844,390],[320,568],[390,844]]){await resize(phone,width,height);await phone.waitForTimeout(120);await fits(phone,'.matchmaking-card');await phone.screenshot({path:path.join(out,'warm-up-'+width+'.png')});}
    // When the search ends the usual line-up takes over, the controls stop and the battle starts clean.
    room.searchUntil=room.time;await Promise.all([pc,phone].map(p=>p.waitForFunction(()=>latest?.phase==='ready',null,{timeout:15000})));
    assert.equal(await pc.evaluate(()=>document.getElementById('matchmaking').classList.contains('warm-up')),false);assert.equal(await phone.locator('#thumbControls').isVisible(),false);assert.equal(room.shells.length,0);
    await fits(pc,'.matchmaking-card');await pc.screenshot({path:path.join(out,'line-up-desktop.png')});
    await Promise.all([pc,phone].map(p=>p.locator('#readyButton').click()));await Promise.all([pc,phone].map(p=>p.waitForFunction(()=>latest?.phase==='countdown')));
    assert.equal(me.shots,0,'warm-up shots are not counted');assert.equal(me.activeSeconds,0);
    await Promise.all([pc,phone].map(p=>p.waitForFunction(()=>latest?.phase==='playing')));assert.equal(await phone.locator('#thumbControls').isVisible(),true);
    // Another newcomer, with nobody searching, also starts at once.
    const solo=await browser.newPage({viewport:{width:1440,height:900}});watch(solo);await solo.goto(base);
    await solo.locator('#quickPlay').click();await solo.waitForFunction(()=>latest?.phase==='countdown');assert.equal(await solo.evaluate(()=>latest.players.filter(p=>p.bot).length),3,'another newcomer alone also starts at once');
    assert.deepEqual(errors,[]);console.log('Quick start passed: newcomer on the field in '+toField+' ms and fighting in '+toBattle+' ms, compact warm-up bar at 4 sizes, driving and firing while searching without damage or statistics, newcomer joins a waiting player, clean line-up and battle.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>process.exit(process.exitCode||0));
