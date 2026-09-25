'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const WebSocket=require('ws');
const {Room:WaitingRoom}=require('../game-server.cjs');
// Existing physics fixtures exercise an already running match. Lifecycle has separate tests.
class Room extends WaitingRoom{constructor(...args){super(...args);this.phase='playing';}}
const {createGameServer}=require('../server.cjs');
const F=require('../shared.js');
const {generateMap}=require('../map-generator.cjs');
function input(room,p,overrides={}){room.setInput(p,{seq:p.seq+1,x:0,y:0,aimX:p.x+100,aimY:p.y,fire:false,...overrides});}
function step(room,seconds){for(let i=0;i<seconds*120;i++)room.step(1/120);}
test('random maps are reproducible, varied, and traversable with safe spawns',()=>{
  const {hitRect}=require('../game-server.cjs');
  assert.deepEqual(generateMap(42),generateMap(42));
  assert.notDeepEqual(generateMap(42).walls,generateMap(43).walls);
  assert(F.width*F.height>1000*660*2.5);
  for(let seed=0;seed<60;seed++){
    const map=generateMap(seed),free=new Set();
    assert(map.walls.length>=8);
    for(const [x,y]of map.spawns)assert(!map.walls.some(w=>hitRect(x,y,65,w)),'spawn clearance');
    for(let x=40;x<F.width-26;x+=20)for(let y=40;y<F.height-26;y+=20)if(!map.walls.some(w=>hitRect(x,y,28,w)))free.add(x+','+y);
    const visited=new Set(['40,40']),queue=[[40,40]];
    for(let i=0;i<queue.length;i++){
      const [x,y]=queue[i];for(const [dx,dy]of [[20,0],[-20,0],[0,20],[0,-20]]){const key=(x+dx)+','+(y+dy);if(free.has(key)&&!visited.has(key)){visited.add(key);queue.push([x+dx,y+dy]);}}
    }
    assert.equal(visited.size,free.size,'all tank-sized routes connect for seed '+seed);
  }
});
test('held mouse fire restores the original 0.42-second cooldown',()=>{
  const r=new Room('RATE'),p=r.add('One');r.map.walls=[];p.cool=0;
  const shots=[];
  for(let i=0;i<360;i++){input(r,p,{fire:true});const before=r.events.length;r.step(1/120);if(r.events.slice(before).some(e=>e.type==='shot'))shots.push(r.time);}
  assert.equal(shots.length,8);
  for(let i=1;i<shots.length;i++)assert(shots[i]-shots[i-1]>=.42-1e-8);
});
test('WASD moves along screen axes, normalized diagonals, independent turret, stale input stops',()=>{
  const r=new Room('TEST'),p=r.add('One');p.x=100;p.y=330;
  input(r,p,{x:1,aimX:p.x,aimY:0});const start={x:p.x,y:p.y};step(r,.1);
  assert(p.x>start.x);assert.equal(p.y,start.y);
  assert(p.aim<0&&p.a===0,'turret is independent from hull');
  const distance=Math.hypot(p.x-start.x,p.y-start.y);p.x=100;p.y=330;input(r,p,{x:1,y:1});step(r,.1);
  assert(Math.abs(Math.hypot(p.x-100,p.y-330)-distance)<.001);
  step(r,1);const stopped=p.x;step(r,.1);assert.equal(p.x,stopped);
  input(r,p,{x:Infinity});assert.equal(p.input.x,0,'nonfinite input rejected');
});
test('wall blocking, edge and concrete ricochets, mouse taps and ten-hit damage',()=>{
  const r=new Room('TEST'),a=r.add('One'),b=r.add('Two');r.map.walls=[{x:220,y:120,w:65,h:135,z:42}];a.x=180;a.y=180;
  input(r,a,{x:1});step(r,.4);assert(a.x<=194);
  r.shells=[{id:1,x:F.width-10,y:F.height-50,vx:410,vy:0,owner:a.id,slot:0,life:3,bounces:0}];step(r,.05);assert(r.shells[0].vx<0);
  r.shells=[{id:2,x:208,y:200,vx:410,vy:0,owner:a.id,slot:0,life:3,bounces:0}];step(r,.04);assert(r.shells[0].vx<0);
  a.x=100;a.y=330;a.cool=0;input(r,a,{fire:true});input(r,a,{fire:false});r.shells=[];r.step(1/120);assert.equal(r.shells.length,1,'short mouse click survives release between ticks');
  b.x=900;b.y=330;b.shieldUntil=0;
  assert.equal(b.hp,10);
  for(let i=0;i<10;i++){r.shells=[{id:10+i,x:b.x-24,y:b.y,vx:410,vy:0,owner:a.id,slot:0,life:1,bounces:0}];r.step(1/120);assert.equal(b.hp,9-i);}
  assert.equal(b.hp,0);assert.equal(a.kills,1);assert.equal(b.deaths,1);step(r,3.1);assert.equal(b.hp,10);assert(b.shieldUntil>r.time);
});
test('four unique slots, capacity, winner, voted rematch, disconnect expiry',()=>{
  const r=new Room('TEST');const ps=Array.from({length:4},(_,i)=>r.add('P'+i));assert.equal(new Set(ps.map(p=>p.slot)).size,4);assert.equal(r.add('Fifth'),null);
  ps[0].kills=9;ps[1].hp=1;ps[1].shieldUntil=0;
  r.shells=[{id:1,x:ps[1].x-24,y:ps[1].y,vx:410,vy:0,owner:ps[0].id,slot:0,life:1,bounces:0}];r.step(1/120);assert.equal(r.winner.id,ps[0].id);
  const previousMap=r.map.id;step(r,10.1);assert.equal(r.map.id,previousMap);assert.equal(r.phase,'results');
  for(const p of ps)assert.equal(r.voteRematch(p),true);
  assert.notEqual(r.map.id,previousMap);assert.equal(r.winner,null);assert.equal(ps[0].kills,0);
  r.disconnect(ps[3]);step(r,15.1);assert(!r.players.has(ps[3].id));
});
test('unrotated projection and mouse aiming match at all canvas sizes',()=>{
  for(const [x,y]of [[26,26],[800,520],[1574,1014]])for(const scale of [.32,.8,1.2]){
    const projected=F.project(x,y,22),offsetX=20,offsetY=70;
    const px=projected.x*scale+offsetX,py=projected.y*scale+offsetY;
    const aim=F.unproject((px-offsetX)/scale,(py-offsetY)/scale,22);
    assert(Math.abs(x-aim.x)<1e-8);assert(Math.abs(y-aim.y)<1e-8);
    assert.equal(F.project(x+100,y).y,F.project(x,y).y);
    assert.equal(F.project(x,y+100).x,F.project(x,y).x);
  }
});
test('shells reach the far arena edge horizontally, vertically, and diagonally',()=>{
  for(const [x,y,aim]of [[26,520,0],[800,26,Math.PI/2],[26,26,Math.atan2(F.height-52,F.width-52)]]){
    const r=new Room('RANGE'),p=r.add('Shooter');r.map.walls=[];p.x=x;p.y=y;p.aim=aim;p.cool=0;
    r.fire(p);const shell=r.shells[0];assert(shell.life>Math.hypot(F.width,F.height)/F.shellSpeed);
    for(let i=0;i<900&&shell.bounces===0&&r.shells.length;i++)r.step(1/120);
    assert(r.shells.includes(shell),'shell survives to the edge');assert(shell.bounces>=1,'shell reaches and bounces off the far edge');
  }
});
test('barrel against every wall and boundary spawns a visible ricochet',()=>{
  const wall={x:400,y:300,w:80,h:160,z:40};
  const cases=[[374,350,0],[506,350,Math.PI],[440,274,Math.PI/2],[440,486,-Math.PI/2],[26,520,Math.PI],[F.width-26,520,0],[800,26,-Math.PI/2],[800,F.height-26,Math.PI/2]];
  for(const [x,y,aim]of cases){
    const r=new Room('BARREL'),p=r.add('Shooter');r.map.walls=[wall];p.x=x;p.y=y;p.aim=aim;p.cool=0;
    r.fire(p);assert.equal(r.shells.length,1,'shot is never silently discarded');
    const s=r.shells[0];assert(!require('../game-server.cjs').hitRect(s.x,s.y,5,wall),'shell starts outside cover');
    step(r,.06);assert(r.shells.includes(s));assert(s.bounces>=1);
    assert(s.vx*Math.cos(aim)+s.vy*Math.sin(aim)<0,'shell reflects away from the obstacle');
  }
});
test('real network: independent sessions, shared state, isolation, validation, reconnect',async t=>{
  const game=createGameServer();game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
  t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;
  const clients=[];
  async function client(room,name,token){
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws');clients.push(ws);const queue=[],waiters=[];
    ws.on('message',raw=>{const data=JSON.parse(raw);queue.push(data);for(const w of [...waiters])if(w.predicate(data)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(data);}});
    function wait(predicate){const existing=queue.find(predicate);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const w={predicate,resolve,timer:setTimeout(()=>reject(Error('Timed out waiting for message')),5000)};waiters.push(w);});}
    await once(ws,'open');ws.send(JSON.stringify({type:'join',room,name,token}));return {ws,wait,queue};
  }
  const a=await client('ARENA','Alice'),aw=await a.wait(m=>m.type==='welcome');
  const b=await client('ARENA','Bob'),bw=await b.wait(m=>m.type==='welcome');
  assert.notEqual(aw.id,bw.id);assert.notEqual(aw.slot,bw.slot);
  const aState=await a.wait(m=>m.type==='state'&&m.players.length===2),bState=await b.wait(m=>m.type==='state'&&m.players.length===2);assert.deepEqual(aState.map,bState.map,'players receive the same generated map');
  const c=await client('OTHER','Charlie');await c.wait(m=>m.type==='welcome');const isolated=await c.wait(m=>m.type==='state');assert.equal(isolated.players.length,1);
  a.ws.send(JSON.stringify({type:'start'}));await a.wait(m=>m.type==='state'&&m.phase==='playing');
  const initial=game.rooms.get('ARENA').players.get(aw.id),startX=initial.x;
  a.ws.send(JSON.stringify({type:'input',seq:1,x:1,y:0,aimX:500,aimY:330,fire:true}));
  const shared=await b.wait(m=>m.type==='state'&&m.players.some(p=>p.id===aw.id&&p.x>startX+5));assert(shared.players.find(p=>p.id===bw.id));
  a.ws.send('{bad json');a.ws.send('null');a.ws.send(JSON.stringify({type:'input',seq:2,x:0,y:0,aimX:null,aimY:0,fire:false}));
  const priorSeq=initial.seq;a.ws.send(JSON.stringify({type:'input',seq:0,x:-1,y:0,aimX:0,aimY:0,fire:false}));
  const closeEvent=once(a.ws,'close');a.ws.close();await closeEvent;
  await b.wait(m=>m.type==='state'&&m.players.some(p=>p.id===aw.id&&!p.connected));assert.equal(initial.seq,priorSeq);
  const re=await client('ARENA','Alice',aw.token),rw=await re.wait(m=>m.type==='welcome');assert.equal(rw.id,aw.id);assert.equal(rw.token,aw.token);
  const takeover=await client('ARENA','Alice',aw.token),tw=await takeover.wait(m=>m.type==='welcome');assert.equal(tw.id,aw.id);assert.equal(game.rooms.get('ARENA').players.size,2,'reconnect replaces an old socket without adding a tank');
  const joinMore=[];for(let i=0;i<2;i++){const extra=await client('ARENA','Extra'+i);await extra.wait(m=>m.type==='welcome');joinMore.push(extra);}
  const full=await client('ARENA','Fifth');const error=await full.wait(m=>m.type==='error');assert.match(error.message,/full/);
  const info=await fetch(base+'/network-info').then(r=>r.json());assert(Array.isArray(info.urls));
  assert.equal((await fetch(base+'/server.cjs')).status,404);assert.equal((await fetch(base+'/package.json')).status,404);
  assert.match(await fetch(base+'/').then(r=>r.text()),/Tank Frenzy/);
  assert.equal((await fetch(base+'/client.js')).status,200);
  for(const ws of clients)ws.terminate();
});
