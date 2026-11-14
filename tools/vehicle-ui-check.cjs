#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs'),{generateMap}=require('../map-generator.cjs'),F=require('../shared.js');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/vehicles');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer({vehicleClassesEnabled:true,quickSearchSeconds:20});let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});
    const fits=async selector=>{const b=await page.locator(selector).boundingBox(),v=page.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' fits '+JSON.stringify(v));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');};
    const resize=async(width,height)=>{await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await page.setViewportSize({width,height});if(await page.evaluate(()=>joined))await page.evaluate(()=>setExpanded(true));};
    await page.goto(base);await page.waitForFunction(()=>playerProgress?.vehicleClassesEnabled);
    await page.locator('#garageButton').click();await page.waitForFunction(()=>!progressLoading);
    assert.equal(await page.locator('.vehicle-choice').count(),3);
    await page.locator('[data-vehicle="scout"]').click();await page.waitForFunction(()=>playerProgress.selectedVehicle==='scout'&&!garageBusy);
    assert.equal(await page.evaluate(()=>playerProgress.coins),0);assert.equal(await page.evaluate(()=>playerProgress.equipped),'classic');
    const profile=await page.evaluate(()=>({id:profileId,secret:profileSecret}));game.progress.players.get(profile.id).coins=200;
    await page.evaluate(()=>loadPlayerProgress());await page.locator('[data-skin="desert"].skin-choice').click();await page.locator('#garageAction').click();await page.waitForFunction(()=>playerProgress.owned.includes('desert')&&!garageBusy);await page.locator('#garageAction').click();await page.waitForFunction(()=>playerProgress.equipped==='desert'&&!garageBusy);assert.equal(await page.evaluate(()=>playerProgress.selectedVehicle),'scout');
    for(const [width,height]of [[1440,900],[320,740],[390,844],[844,390]]){
      await resize(width,height);await page.locator('#vehicleTitle').scrollIntoViewIfNeeded();await fits('.garage-card');await fits('#closeGarage');await fits('#vehicleChoices');await page.screenshot({path:path.join(out,'selection-'+width+'.png')});
      await page.locator('#closeGarage').click();assert.equal(await page.locator('#garageDialog').isVisible(),false);await page.locator('#garageButton').click();await page.waitForFunction(()=>!progressLoading);
    }
    await resize(1440,900);await page.locator('#createVehicleTest').click();await page.waitForFunction(()=>latest?.phase==='waiting');assert.equal(await page.evaluate(()=>latest.ruleset),'vehicle-test');assert.match(await page.locator('#waitingRewardNote').textContent(),/No coins or rankings/);assert.match(await page.locator('#waitingPlayers').textContent(),/Scout/);
    const room=game.rooms.get(await page.evaluate(()=>roomCode)),human=room.humans()[0];assert.equal(human.vehicle,'scout');assert.equal(human.hp,8);assert.equal(human.skin,'desert');
    await page.locator('#addBot').click();await page.waitForFunction(()=>latest.players.length===2);await page.locator('#addBot').click();await page.waitForFunction(()=>latest.players.length===3);await page.locator('#addBot').click();await page.waitForFunction(()=>latest.players.length===4);await page.screenshot({path:path.join(out,'lineup-desktop.png')});
    await page.locator('#startGame').click();await page.waitForFunction(()=>latest?.phase==='playing');await page.evaluate(()=>{if(typeof dismissCoach==='function')dismissCoach();});if(await page.locator('#skipCoach').isVisible())await page.locator('#skipCoach').click();
    assert.equal(await page.locator('.roster-card.me .pip').count(),4);assert.match(await page.locator('.roster-card.me .health').getAttribute('aria-label'),/\/ 8 health/);
    // Freeze input while inspecting real snapshots and the canvas at every viewport.
    for(const p of room.players.values())if(p.bot){p.brain={next:Infinity};p.input={x:0,y:0,aimX:p.x+100,aimY:p.y,fire:false};}human.shieldUntil=room.time+1000;
    for(const layout of ['quarry','crossroads']){
      room.map=generateMap(42,layout);for(const p of room.players.values())room.spawn(p);human.shieldUntil=room.time+1000;
      await page.waitForFunction(l=>mapLayout===l,layout);
      for(const [width,height]of [[1440,900],[320,740],[390,844],[844,390]]){await resize(width,height);await fits('#arenaHeader');await fits('.roster-card.me .health');await page.screenshot({path:path.join(out,layout+'-'+width+'.png')});}
    }
    await resize(1440,900);const bot=[...room.players.values()].find(p=>p.bot);bot.connected=true;bot.shieldUntil=0;human.kills=9;human.activeSeconds=20;room.damage(bot,human.id,12,true);room.rematchUntil=room.time+120;
    await page.waitForFunction(()=>latest?.phase==='results'&&lastResult?.ruleset==='vehicle-test');assert.equal(await page.locator('#rankChange').isVisible(),false);assert.match(await page.locator('#vehicleResultNote').textContent(),/No coins or rankings/);assert.equal(game.progress.view(profile.id).stats.matches,0);assert.equal(game.leaderboard.top().length,0);await page.screenshot({path:path.join(out,'results-desktop.png')});
    await page.locator('#changeTank').click();await page.waitForFunction(()=>!progressLoading);await page.locator('[data-vehicle="heavy"]').click();await page.waitForFunction(()=>playerProgress.selectedVehicle==='heavy'&&!garageBusy);assert.match(await page.locator('#vehicleNote').textContent(),/Next match/);assert.equal(human.vehicle,'scout');
    room.voteRematch(human);await page.waitForFunction(()=>latest?.phase==='countdown');assert.equal(await page.locator('#garageDialog').isVisible(),false);assert.equal(await page.locator('#countdown').isVisible(),true);assert.equal(human.vehicle,'heavy');assert.equal(human.hp,12);await page.screenshot({path:path.join(out,'next-match-countdown.png')});
    await page.waitForFunction(()=>latest?.phase==='playing');assert.equal(await page.locator('.roster-card.me .pip').count(),6);await page.screenshot({path:path.join(out,'heavy-health-desktop.png')});
    await page.evaluate(()=>leave());await page.locator('#quickPlay').click();await page.waitForFunction(()=>latest?.phase==='searching');assert.equal(game.rooms.get(await page.evaluate(()=>roomCode)).humans()[0].vehicle,'standard');assert.equal(game.progress.vehicleOf(profile.id),'heavy');await page.evaluate(()=>leave());
    assert.deepEqual(errors,[]);console.log('Vehicle pilot UI passed: free independent choices, 4 viewports, 2 maps, health capacity, results/rematch and Standard Quick Play.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
