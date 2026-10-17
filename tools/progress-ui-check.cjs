#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs'),F=require('../shared.js');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/progress');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer({quickSearchSeconds:.5,quickReadySeconds:2});let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const pc=await browser.newPage({viewport:{width:1440,height:900}}),phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    for(const p of [pc,phone]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});}
    async function fits(p,selector){const b=await p.locator(selector).boundingBox(),v=p.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,selector+' fits '+JSON.stringify(v));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page has no horizontal overflow');}
    await Promise.all([pc.goto(base),phone.goto(base)]);
    for(const p of [pc,phone])await p.waitForFunction(()=>playerProgress!==null);
    const profile=await pc.evaluate(()=>({secret:profileSecret,id:profileId}));game.progress.commit(()=>{const value=game.progress.edit(profile.id);value.coins=1500;});
    await pc.locator('#garageButton').click();await pc.waitForFunction(()=>playerProgress.coins===1500);await fits(pc,'.garage-card');
    await pc.locator('[data-skin="desert"].skin-choice').click();await pc.locator('#garageAction').click();await pc.waitForFunction(()=>playerProgress.owned.includes('desert'));assert.equal(await pc.evaluate(()=>playerProgress.coins),1300);
    await pc.locator('#garageAction').click();await pc.waitForFunction(()=>playerProgress.equipped==='desert');assert.match(await pc.locator('#garageAction').textContent(),/Equipped/);
    await pc.screenshot({path:path.join(out,'garage-desktop.png')});await pc.locator('#closeGarage').click();await pc.reload();await pc.waitForFunction(()=>playerProgress?.equipped==='desert');
    await pc.locator('#profileButton').click();await pc.locator('.recovery-settings summary').click();await pc.locator('#showRecovery').click();await pc.locator('#recoveryPanel').waitFor({state:'visible'});const code=await pc.locator('#recoveryCode').inputValue();assert.match(code,/^TF-/);await pc.locator('#savedRecovery').click();await pc.locator('#closeProfile').click();
    await phone.locator('#profileButton').click();await phone.locator('.recovery-settings summary').click();await phone.locator('#restoreCode').fill(code);await phone.locator('#restorePlayer').click();await phone.waitForFunction(()=>document.getElementById('recoveryMessage').textContent.startsWith('Player restored'));assert.equal(await phone.evaluate(()=>profileId),profile.id);await phone.locator('#closeProfile').click();
    await phone.locator('#garageButton').click();assert.equal(await phone.evaluate(()=>playerProgress.coins),1300);
    for(const size of [{width:390,height:844},{width:320,height:640},{width:844,height:390},{width:1024,height:600}]){
      await phone.setViewportSize(size);await fits(phone,'.garage-card');await fits(phone,'#closeGarage');assert.equal(await phone.locator('.skin-choice').count(),7);await phone.locator('[data-skin="gold"].skin-choice').click();await phone.locator('#garageAction').scrollIntoViewIfNeeded();assert.equal(await phone.locator('#garageAction').isEnabled(),true);await phone.screenshot({path:path.join(out,'garage-'+size.width+'.png')});
    }
    await phone.locator('#closeGarage').click();await phone.setViewportSize({width:390,height:844});
    // Seed the last six qualifying days; the next actual match must grant a permanent skin.
    const owner=game.progress.players.get(profile.id);owner.daily={step:6,lastDay:Math.floor((Date.now()+8*3600e3)/864e5)-1,graceUsed:false,longest:6,streak:6};
    await pc.evaluate(()=>localStorage.removeItem('tank-frenzy-recovery-saved'));await pc.locator('#quickPlay').click();await pc.waitForFunction(()=>latest?.phase==='ready');await pc.locator('#readyButton').click();await pc.waitForFunction(()=>latest?.phase==='playing');
    const room=game.rooms.get(await pc.evaluate(()=>roomCode)),human=room.humans()[0],bot=[...room.players.values()].find(p=>p.bot);assert.equal(human.skin,'desert');assert.equal(await pc.evaluate(()=>tanks.find(t=>t.id===myId).skin),'desert');
    human.activeSeconds=15;human.kills=9;bot.shieldUntil=0;room.damage(bot,human.id,10);room.rematchUntil=room.time+120;
    await pc.waitForFunction(()=>lastResult?.reward?.daily?.day===7&&document.getElementById('rewardSkin').hidden===false);await fits(pc,'.results-card');assert.equal(await pc.evaluate(()=>lastResult.reward.total),180);const awarded=await pc.evaluate(()=>lastResult.reward.skin);assert.notEqual(awarded,'desert');assert(game.progress.view(profile.id).owned.includes(awarded));
    await pc.locator('#equipRewardSkin').scrollIntoViewIfNeeded();await pc.locator('#equipRewardSkin').click();await pc.waitForFunction(s=>playerProgress.equipped===s,awarded);await pc.screenshot({path:path.join(out,'day7-results-desktop.png')});
    // Recovery remains accessible in true fullscreen; closing it returns to the same results.
    await pc.locator('#rewardProtect').click();assert(await pc.locator('#profileDialog').isVisible());await pc.locator('#closeProfile').click();assert(await pc.locator('#results').isVisible());
    await pc.evaluate(()=>leave());await phone.reload();await phone.waitForFunction(s=>playerProgress?.equipped===s,awarded);await phone.locator('#dailyHome').click();await fits(phone,'.garage-card');await phone.waitForFunction(()=>{const b=document.getElementById('dailyTitle').getBoundingClientRect();return b.top>0&&b.bottom<innerHeight;});assert.equal(await phone.locator('.daily-day.completed').count(),7);await phone.screenshot({path:path.join(out,'day7-garage-phone.png')});await phone.locator('#closeGarage').click();
    const noMoney=await browser.newPage({viewport:{width:390,height:844}});noMoney.on('pageerror',e=>errors.push(e.message));await noMoney.goto(base);await noMoney.waitForFunction(()=>playerProgress!==null);await noMoney.locator('#garageButton').click();await noMoney.locator('[data-skin="gold"].skin-choice').click();assert.equal(await noMoney.locator('#garageAction').isDisabled(),true);assert.match(await noMoney.locator('#garageAction').textContent(),/Need 1000/);await noMoney.close();
    // Full collection substitution is checked in the server unit suite; portraits share the real catalogue.
    assert.equal(F.skins.length,7);assert.deepEqual(errors,[]);console.log('Progress browser checks passed: purchases, persistence, recovery, daily skin, shared appearance and responsive Garage.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
