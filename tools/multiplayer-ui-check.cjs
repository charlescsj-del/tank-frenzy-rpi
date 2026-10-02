#!/usr/bin/env node
// Real browser/HTTP/WebSocket regression check. Playwright is a CI-only dependency.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs');
const output=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const game=createGameServer({quickSearchSeconds:2,quickReadySeconds:5});
  let browser;
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
    const url='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const desktop=await browser.newContext({viewport:{width:1440,height:900}}),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const pc=await desktop.newPage(),phone=await mobile.newPage(),errors=[];
    for(const p of [pc,phone])p.on('pageerror',e=>errors.push(e.message));
    async function screenshot(p,name){await p.screenshot({path:path.join(output,name+'.png')});}
    async function fits(p,selector){
      const b=await p.locator(selector).boundingBox(),v=p.viewportSize();
      assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' must fit '+JSON.stringify(v)+'; got '+JSON.stringify(b));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
    }
    await Promise.all([pc.goto(url),phone.goto(url)]);
    await pc.locator('#lobbyName').fill('CopperCaptain');await phone.locator('#lobbyName').fill('MangoScout');
    await pc.locator('#quickPlay').click();await pc.waitForFunction(()=>joined);await phone.locator('#quickPlay').click();
    await Promise.all([pc.waitForFunction(()=>latest?.phase==='ready'),phone.waitForFunction(()=>latest?.phase==='ready')]);
    assert.equal(await pc.evaluate(()=>roomCode),await phone.evaluate(()=>roomCode));
    assert.equal(await pc.evaluate(()=>latest.players.filter(p=>p.bot).length),2);
    await fits(pc,'.matchmaking-card');await fits(phone,'.matchmaking-card');
    await screenshot(pc,'matchmaking-desktop');await screenshot(phone,'matchmaking-phone');
    await Promise.all([pc.locator('#readyButton').click(),phone.locator('#readyButton').click()]);
    await Promise.all([pc.waitForFunction(()=>latest?.phase==='playing'),phone.waitForFunction(()=>latest?.phase==='playing')]);
    const room=game.rooms.get(await pc.evaluate(()=>roomCode)),human=room.humans()[0],bot=[...room.players.values()].find(p=>p.bot);
    human.kills=9;bot.shieldUntil=0;room.damage(bot,human.id,10);
    await Promise.all([pc.waitForFunction(()=>!document.getElementById('rankChange').hidden),phone.waitForFunction(()=>!document.getElementById('rankChange').hidden)]);
    await phone.locator('#reactionToggle').click();await phone.locator('#reactionOptions button').first().click();
    await Promise.all([pc.waitForFunction(()=>document.querySelector('.reaction-bubble')?.textContent==='GG!'),phone.waitForFunction(()=>document.querySelector('.reaction-bubble')?.textContent==='GG!')]);
    await fits(pc,'.results-card');await fits(phone,'.results-card');
    await screenshot(pc,'results-desktop');await screenshot(phone,'results-phone');
    await phone.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();setExpanded(true);});
    for(const [width,height]of [[320,640],[844,390]]){
      await phone.setViewportSize({width,height});await fits(phone,'.results-card');for(const id of ['rematch','resultsLobby','resultsLeave'])await fits(phone,'#'+id);await screenshot(phone,'results-'+width);
    }
    await phone.setViewportSize({width:390,height:844});
    await phone.locator('#muteReactions').click();assert.equal(await phone.locator('.reaction-bubble').count(),0);
    await pc.locator('#resultsLobby').click();await Promise.all([pc.waitForFunction(()=>latest?.phase==='waiting'),phone.waitForFunction(()=>latest?.phase==='waiting')]);
    await pc.locator('#lobbyRules summary').click();await pc.locator('#lobbyMode').selectOption('teams');await pc.locator('#lobbyTarget').fill('25');await pc.locator('#lobbyPrivate').check();await pc.locator('#saveLobbyRules').click();
    await phone.waitForFunction(()=>latest.settings.mode==='teams'&&latest.settings.targetScore===25&&latest.private);
    assert.equal((await fetch(url+'/rooms').then(r=>r.json())).rooms.length,0);
    await pc.locator('#lobbyRules summary').click();await fits(phone,'.waiting-panel .dialog');await screenshot(phone,'lobby-phone');
    await phone.locator('#shareRoom').click();await fits(phone,'#shareDialog .tutorial-card');
    assert(await phone.locator('#shareLink').inputValue().then(v=>v.includes('?room='+room.code)));
    assert(await phone.locator('#shareQR').evaluate(c=>c.width>100));await fits(phone,'#shareQR');assert(await phone.locator('#shareQR').isVisible());
    const qr=await phone.locator('#shareQR').boundingBox(),card=await phone.locator('#shareDialog .tutorial-card').boundingBox();assert(qr.x>=card.x&&qr.y>=card.y&&qr.x+qr.width<=card.x+card.width&&qr.y+qr.height<=card.y+card.height,'QR fits its invitation card');assert(Math.abs(qr.width-qr.height)<2,'QR stays square');
    await screenshot(phone,'invite-phone');await phone.locator('#closeShare').click();
    const friend=await browser.newPage();friend.on('pageerror',e=>errors.push(e.message));await friend.goto(url+'/?room='+room.code);await friend.waitForFunction(()=>joined);assert.equal(room.humans().length,3);
    await friend.evaluate(()=>leave());await friend.close();
    await phone.evaluate(()=>leave());await pc.evaluate(()=>leave());
    await phone.locator('#leaderboardButton').click();await phone.waitForFunction(()=>document.querySelectorAll('#leaderboardRows tr').length>=4);await fits(phone,'.leaderboard-card');await screenshot(phone,'leaderboard-phone');
    await phone.keyboard.press('Escape');
    await phone.setViewportSize({width:844,height:390});await phone.locator('#createRoom').click();await phone.waitForFunction(()=>latest?.phase==='waiting');await fits(phone,'.waiting-panel .dialog');await screenshot(phone,'lobby-landscape');
    await phone.evaluate(()=>leave());await phone.locator('#quickPlay').click();await phone.waitForFunction(()=>latest?.phase==='ready');await fits(phone,'.matchmaking-card');await screenshot(phone,'matchmaking-landscape');
    const oldGroup=await phone.evaluate(()=>roomCode);await phone.evaluate(()=>socket.close());await phone.waitForFunction(old=>joined&&latest?.phase==='searching'&&roomCode!==old,oldGroup);assert.equal(await phone.evaluate(()=>latest.quick),true,'lost pregame reservation requeues automatically');
    await phone.locator('#cancelMatchmaking').click();assert.equal(await phone.evaluate(()=>joined),false);assert.deepEqual(errors,[]);
    console.log('Multiplayer browser check passed: desktop, phone, landscape, grouping, ready, reactions, ranking, privacy and invite joining.');
  }finally{await browser?.close();await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
