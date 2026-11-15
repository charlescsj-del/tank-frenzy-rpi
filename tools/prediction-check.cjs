#!/usr/bin/env node
'use strict';
// Measures how the player's own tank feels over a slow connection: a TCP relay delays every
// byte in both directions, a real browser holds a movement key, and each frame is sampled.
const assert=require('node:assert/strict'),net=require('node:net'),{once}=require('node:events'),{chromium}=require('playwright');
const {createGameServer}=require('../server.cjs'),{generateMap}=require('../map-generator.cjs');
const oneWay=Number(process.env.ONE_WAY_MS)||70;
function relay(port){
  return net.createServer(client=>{
    const upstream=net.connect(port,'127.0.0.1');client.setNoDelay(true);upstream.setNoDelay(true);// As browsers and the game server do: no 40 ms batching of small packets.
    const forward=(from,to)=>{from.on('data',chunk=>setTimeout(()=>{if(!to.destroyed)to.write(chunk);},oneWay));from.on('close',()=>setTimeout(()=>to.destroy(),oneWay));from.on('error',()=>to.destroy());};
    forward(client,upstream);forward(upstream,client);
  });
}
(async()=>{
  const game=createGameServer();let browser;const errors=[];
  try{
    game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
    const slow=relay(game.server.address().port);slow.listen(0,'127.0.0.1');await once(slow,'listening');
    const base='http://127.0.0.1:'+slow.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.waitForFunction(()=>typeof playerProgress!=='undefined'&&playerProgress);
    await page.locator('#createRoom').click();await page.waitForFunction(()=>latest?.phase==='waiting');
    const room=game.rooms.get(await page.evaluate(()=>roomCode)),human=room.humans()[0];
    // An empty field with one wall to the right, so the run and the stop are both predictable.
    room.map={...generateMap(7,'quarry'),walls:[{x:1000,y:300,w:80,h:440,z:40}]};
    await page.locator('#startGame').click();await page.waitForFunction(()=>latest?.phase==='playing'&&walls.length===1);
    await page.evaluate(()=>{if(typeof dismissCoach==='function')dismissCoach();});
    human.x=300;human.y=520;human.shieldUntil=room.time+1000;
    await page.waitForFunction(()=>Number.isFinite(pingMs)&&Math.abs(tanks.find(t=>t.id===myId).targetX-300)<1&&Math.abs(tanks.find(t=>t.id===myId).x-300)<1,null,{timeout:15000});
    const ping=await page.evaluate(()=>pingMs);assert(ping>=oneWay*2-10,'the relay delays the connection: '+ping+' ms');
    // Sample the drawn position and the latest server position on every frame.
    await page.evaluate(()=>{window.samples=[];const tick=now=>{const me=tanks.find(t=>t.id===myId);if(me)samples.push({t:now,x:me.x,y:me.y,sx:me.targetX,sy:me.targetY,a:me.a});requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    const mark=()=>page.evaluate(()=>performance.now());
    await page.locator('#game').focus();
    const pressed=await mark();await page.keyboard.down('KeyD');await page.waitForTimeout(1500);
    const released=await mark();await page.keyboard.up('KeyD');await page.waitForTimeout(900);
    let samples=await page.evaluate(()=>samples);
    const firstMove=samples.find(s=>s.t>=pressed&&s.x>300.5),firstServer=samples.find(s=>s.t>=pressed&&s.sx>300.5);
    const response=firstMove.t-pressed,serverResponse=firstServer.t-pressed;
    assert(response<60,'the tank answers the key within a few frames: '+response.toFixed(0)+' ms');
    assert(serverResponse>ping*.8,'the server copy still needs a round trip: '+serverResponse.toFixed(0)+' ms');
    // While driving, the drawn tank leads the delayed server copy by about speed × round trip and moves evenly.
    const cruise=samples.filter(s=>s.t>pressed+500&&s.t<released-50),lead=cruise.map(s=>s.x-s.sx);
    const average=lead.reduce((a,b)=>a+b,0)/lead.length;assert(average>170*ping/1000*.5&&average<170*(ping+70)/1000*1.5,'lead '+average.toFixed(1)+' units at '+ping+' ms');
    let backwards=0,worstStep=0;for(let i=1;i<cruise.length;i++){const step=cruise[i].x-cruise[i-1].x,expected=170*(cruise[i].t-cruise[i-1].t)/1000;if(step<-.05)backwards++;worstStep=Math.max(worstStep,Math.abs(step-expected));}
    assert.equal(backwards,0,'the tank never jerks backwards while driving');assert(worstStep<3,'frame-to-frame motion stays even: worst correction '+worstStep.toFixed(2)+' units');
    // After release it settles exactly on the server position.
    const rest=samples.at(-1);assert(Math.abs(rest.x-rest.sx)<1&&Math.abs(rest.y-rest.sy)<1,'settles on the server position: '+(rest.x-rest.sx).toFixed(2));
    assert(Math.abs(rest.x-human.x)<1,'and the server agrees: '+rest.x.toFixed(1)+' vs '+human.x.toFixed(1));
    // The server uses an input up to one 60 Hz loop after it arrives, and a busy machine adds timer delay,
    // so the two can differ by a few units when stopping. The limit is well under half a tank's radius
    // (26 units); what matters more is that the difference is eased away, never snapped.
    const stopped=samples.filter(s=>s.t>released+40),overshoot=Math.max(...stopped.map(s=>s.x))-human.x;assert(overshoot<10,'no visible overshoot after stopping: '+overshoot.toFixed(2));
    let worstSettle=0;for(let i=1;i<stopped.length;i++)worstSettle=Math.max(worstSettle,Math.abs(stopped[i].x-stopped[i-1].x));assert(worstSettle<1.5,'settling is gradual: '+worstSettle.toFixed(2)+' units in one frame');
    // Drive into the wall: the prediction stops where the server does, without rubber-banding.
    await page.evaluate(()=>{samples.length=0;});await page.keyboard.down('KeyD');await page.waitForTimeout(4200);await page.keyboard.up('KeyD');await page.waitForTimeout(700);
    samples=await page.evaluate(()=>samples);const wall=samples.at(-1),maxX=Math.max(...samples.map(s=>s.x));
    assert(Math.abs(human.x-974)<2,'the server stopped at the wall: '+human.x.toFixed(1));assert(Math.abs(wall.x-human.x)<1,'the drawn tank rests against the wall too');assert(maxX<976.5,'it never draws inside the wall: '+maxX.toFixed(1));
    // Diagonal travel is normalised like the server's.
    human.x=300;human.y=520;await page.waitForFunction(()=>Math.abs(tanks.find(t=>t.id===myId).x-300)<1.5);
    await page.evaluate(()=>{samples.length=0;});const from=await mark();await page.keyboard.down('KeyD');await page.keyboard.down('KeyS');await page.waitForTimeout(1000);const to=await mark();await page.keyboard.up('KeyD');await page.keyboard.up('KeyS');await page.waitForTimeout(700);
    samples=await page.evaluate(()=>samples);const diagonal=samples.filter(s=>s.t>from+300&&s.t<to-50),run=diagonal.at(-1),begin=diagonal[0];
    const speed=Math.hypot(run.x-begin.x,run.y-begin.y)/((run.t-begin.t)/1000);assert(Math.abs(speed-170)<10,'diagonal speed '+speed.toFixed(1));
    assert(Math.abs(run.a-Math.PI/4)<.01,'the hull turns at once');const end=samples.at(-1);assert(Math.hypot(end.x-human.x,end.y-human.y)<1);
    // A respawn or any other jump by the server is followed at once rather than eased.
    human.x=1300;human.y=200;await page.waitForFunction(()=>Math.hypot(tanks.find(t=>t.id===myId).x-1300,tanks.find(t=>t.id===myId).y-200)<1.5,null,{timeout:2000});
    assert.deepEqual(errors,[]);
    console.log('Prediction check passed at '+ping+' ms round trip: key-to-motion '+response.toFixed(0)+' ms (server copy '+serverResponse.toFixed(0)+' ms), lead '+average.toFixed(1)+' units, worst frame correction '+worstStep.toFixed(2)+', overshoot '+overshoot.toFixed(2)+', wall and diagonal exact.');
    await browser.close();browser=null;slow.close();
  }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>process.exit(process.exitCode||0));
