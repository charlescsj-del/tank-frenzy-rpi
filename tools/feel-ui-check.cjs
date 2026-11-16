#!/usr/bin/env node
'use strict';
// Battle effects in a real browser against the real server: muzzle flash, dust, hit markers,
// explosions with debris and scorch marks, wreck smoke and the slow-motion final blow.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs');
const out=process.env.ARTIFACT_DIR||path.join(__dirname,'../artifacts/feel');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const game=createGameServer();let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const base='http://127.0.0.1:'+game.server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});};
    // One human and one frozen AI on an open field.
    const battle=async(page)=>{
      watch(page);await page.goto(base);await page.locator('#createRoom').click();await page.waitForFunction(()=>latest?.phase==='waiting');
      const room=game.rooms.get(await page.evaluate(()=>roomCode)),human=room.humans()[0];
      await page.locator('#addBot').click();await page.waitForFunction(()=>latest.players.length===2);
      await page.locator('#startGame').click();await page.waitForFunction(()=>latest?.phase==='playing');
      await page.evaluate(()=>{if(typeof dismissCoach==='function')dismissCoach();});if(await page.locator('#skipCoach').isVisible())await page.locator('#skipCoach').click();
      const bot=[...room.players.values()].find(p=>p.bot);bot.brain={next:Infinity};bot.input={x:0,y:0,aimX:bot.x+100,aimY:bot.y,fire:false};
      room.map={...room.map,walls:[]};human.x=600;human.y=500;bot.x=900;bot.y=500;human.shieldUntil=room.time+1000;bot.shieldUntil=0;
      await page.waitForFunction(()=>Math.abs(tanks.find(t=>t.id===myId).targetX-600)<1&&tanks.find(t=>t.id===myId).x>590);
      const kill=()=>{bot.hp=1;bot.shieldUntil=0;room.damage(bot,human.id,1);};
      return {room,human,bot,kill};
    };
    const pc=await browser.newPage({viewport:{width:1440,height:900}}),{room,human,bot,kill}=await battle(pc);
    // Aim at the AI and fire one real shell: a flash at the barrel, then a hit marker where it lands.
    const target=await pc.evaluate(()=>{const r=document.getElementById('game').getBoundingClientRect(),t=tanks.find(t=>t.id!==myId),p=FIELD.project(t.targetX,t.targetY);return {x:r.left+offsetX+p.x*scale,y:r.top+offsetY+p.y*scale};});
    await pc.mouse.move(target.x,target.y);await pc.waitForTimeout(120);
    await pc.evaluate(()=>{window.seen={muzzle:0,marker:0,shake:0};const tick=()=>{seen.muzzle=Math.max(seen.muzzle,muzzles.length);seen.marker=Math.max(seen.marker,hitMarks.length);seen.shake=Math.max(seen.shake,shake);requestAnimationFrame(tick);};tick();});
    const hp=bot.hp;await pc.mouse.down();await pc.waitForFunction(()=>seen.muzzle>0);await pc.mouse.up();
    assert(await pc.evaluate(()=>seen.shake)>0,'firing kicks the camera');
    await pc.waitForFunction(()=>seen.marker>0,null,{timeout:5000});assert(bot.hp<hp,'the real shell landed');
    // Freeze one flash and one marker so the screenshot shows them.
    await pc.evaluate(()=>{const me=tanks.find(t=>t.id===myId),foe=tanks.find(t=>t.id!==myId);muzzles.push({x:me.x+40,y:me.y,a:0,life:9,total:9});hitMarks.push({x:foe.x,y:foe.y,dead:false,life:9,total:9.5});});
    await pc.waitForTimeout(80);await pc.screenshot({path:path.join(out,'flash-marker-desktop.png')});await pc.evaluate(()=>{muzzles=[];hitMarks=[];});
    // Driving leaves dust and tracks.
    await pc.keyboard.down('KeyA');await pc.waitForFunction(()=>particles.filter(p=>p.kind==='dust').length>=3&&tracks.length>=3);await pc.screenshot({path:path.join(out,'dust-desktop.png')});await pc.keyboard.up('KeyA');
    // A kill: fireball, tumbling plates, a scorch mark, a red marker, then smoke from the wreck.
    await pc.evaluate(()=>{seen.marker=0;seen.fire=0;seen.chunks=0;const tick=()=>{seen.fire=Math.max(seen.fire,fireballs.length);seen.chunks=Math.max(seen.chunks,particles.filter(p=>p.kind==='chunk').length);requestAnimationFrame(tick);};tick();});
    kill();await pc.waitForFunction(()=>seen.fire>0&&seen.chunks>=6&&scorches.length===1&&seen.marker>0);
    await pc.waitForTimeout(120);await pc.screenshot({path:path.join(out,'explosion-desktop.png')});
    await pc.waitForFunction(()=>particles.some(p=>p.kind==='smoke'));await pc.screenshot({path:path.join(out,'wreck-smoke-desktop.png')});
    assert(await pc.evaluate(()=>particles.length<=420&&scorches.length<=14&&muzzles.length<=16),'effects stay bounded');
    // The winning kill: results wait about a second while the blast plays in slow motion.
    bot.hp=10;bot.respawnAt=0;human.kills=9;human.activeSeconds=30;await pc.waitForFunction(()=>tanks.find(t=>t.id!==myId).hp>0);
    kill();room.rematchUntil=room.time+600;const started=Date.now();
    await pc.waitForFunction(()=>latest?.phase==='results'&&finalBlow);assert.equal(await pc.locator('#results').isVisible(),false,'results wait for the final blow');
    await pc.waitForTimeout(350);await pc.screenshot({path:path.join(out,'final-blow-desktop.png')});
    await pc.locator('#results').waitFor({state:'visible',timeout:4000});const waited=Date.now()-started;assert(waited>900&&waited<2600,'final blow lasted '+waited+' ms');
    assert.equal(await pc.evaluate(()=>finalBlow),null);await pc.close();
    // Phone, landscape and reduced motion.
    for(const [name,options]of [['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],['landscape',{viewport:{width:844,height:390},isMobile:true,hasTouch:true}]]){
      const page=await browser.newPage(options),b=await battle(page);
      b.human.kills=9;b.human.activeSeconds=30;b.kill();b.room.rematchUntil=b.room.time+600;
      await page.waitForFunction(()=>latest?.phase==='results'&&finalBlow);await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'final-blow-'+name+'.png')});
      await page.locator('#results').waitFor({state:'visible',timeout:4000});await page.close();
    }
    const calm=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),quiet=await calm.newPage(),c=await battle(quiet);
    await quiet.keyboard.down('KeyA');await quiet.waitForFunction(()=>tracks.length>=3);await quiet.keyboard.up('KeyA');
    assert.equal(await quiet.evaluate(()=>particles.filter(p=>p.kind).length),0,'no dust with reduced motion');
    c.human.kills=9;c.human.activeSeconds=30;c.kill();c.room.rematchUntil=c.room.time+600;
    await quiet.waitForFunction(()=>latest?.phase==='results');assert.equal(await quiet.evaluate(()=>finalBlow),null);assert.equal(await quiet.locator('#results').isVisible(),true,'reduced motion shows results at once');
    assert.equal(await quiet.evaluate(()=>shake),0);assert.equal(await quiet.evaluate(()=>scorches.length),1,'the scorch mark is static, so it stays');
    assert.deepEqual(errors,[]);console.log('Battle feel passed: muzzle flash, camera kick, own-hit marker from a real shell, dust, explosion debris, scorch, wreck smoke, bounded effects, slow-motion final blow at 3 sizes and reduced motion.');
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>process.exit(process.exitCode||0));
