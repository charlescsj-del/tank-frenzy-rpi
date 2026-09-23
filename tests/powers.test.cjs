'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room:WaitingRoom,hitRect}=require('../game-server.cjs');
// Existing physics fixtures exercise an already running match. Lifecycle has separate tests.
class Room extends WaitingRoom{constructor(...args){super(...args);this.phase='playing';}}
const F=require('../shared.js');
function arena(options){const r=new Room('POWER',options);r.map.walls=[];return r;}
function power(r,p,type){p.power=type;p.powerUntil=r.time+10;p.cool=0;}

test('room defaults and balanced teams preserve reserved slots',()=>{
  const r=arena({mode:'teams'}),ps=Array.from({length:4},()=>r.add('P'));
  assert.deepEqual(r.settings,{mode:'teams',bouncing:true,powers:true});
  assert.deepEqual(ps.map(p=>p.team),[0,1,0,1]);r.disconnect(ps[0]);assert.equal(r.add('Full'),null);
  r.players.delete(ps[1].id);assert.equal(r.add('Replacement').team,1);
  assert.deepEqual(arena({mode:'invalid'}).settings,{mode:'ffa',bouncing:true,powers:true});
});

test('friendly shells pass teammates and team kills produce a shared victory',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),enemy=r.add('B'),friend=r.add('C');
  a.x=100;a.y=300;friend.x=200;friend.y=300;enemy.x=900;enemy.y=300;friend.shieldUntil=enemy.shieldUntil=0;
  r.shells=[{id:1,x:180,y:300,vx:410,vy:0,owner:a.id,team:0,slot:0,life:3,bounces:0}];
  r.step(.05);assert.equal(friend.hp,10);assert.equal(r.shells.length,1);
  r.teamScores[0]=9;r.damage(enemy,friend.id,10);
  assert.equal(r.teamScores[0],10);assert.equal(r.winner.name,'Orange team');
  r.step(11);assert.deepEqual(r.teamScores,[0,0]);assert.equal(r.winner,null);assert.equal(friend.power,null);
});

test('bouncing disabled absorbs shells at boundaries and walls',()=>{
  for(const wall of [false,true]){
    const r=arena({bouncing:false});if(wall)r.map.walls=[{x:500,y:200,w:50,h:200}];
    r.shells=[{id:1,x:wall?494:1594,y:300,vx:410,vy:0,owner:'a',slot:0,life:3,bounces:0}];
    r.step(1/120);assert.equal(r.shells.length,0);assert.equal(r.events.some(e=>e.type==='bounce'),false);
  }
});

test('pickups stay bounded, spawn clear of cover, expire and honor disabled powers',()=>{
  const r=new Room('DROPS');for(let i=0;i<50;i++)r.spawnPickup();
  assert.equal(r.pickups.length,2);
  for(const p of r.pickups){assert(F.powers.includes(p.type));assert(!r.map.walls.some(w=>hitRect(p.x,p.y,26,w)));}
  r.nextPickup=Infinity;r.step(21);assert.equal(r.pickups.length,0);
  const off=arena({powers:false});off.spawnPickup();off.step(30);assert.equal(off.pickups.length,0);
});

test('pickups collect equally from above, below, sides and diagonals with a forgiving radius',()=>{
  assert.equal(F.pickupRadius,60);
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4]){
    const r=arena(),p=r.add('Collector');r.nextPickup=Infinity;
    p.x=800+Math.cos(angle)*59;p.y=520+Math.sin(angle)*59;
    r.pickups=[{id:1,type:'speed',x:800,y:520,expiresAt:30}];r.step(1/120);
    assert.equal(p.power,'speed','approach angle '+angle);assert.equal(r.pickups.length,0);
    assert.equal(r.events.filter(e=>e.type==='pickup').length,1);
  }
  const r=arena(),p=r.add('Boundary');r.nextPickup=Infinity;p.x=860.1;p.y=520;
  r.pickups=[{id:1,type:'laser',x:800,y:520,expiresAt:30}];r.step(1/120);assert.equal(r.pickups.length,1);
  p.x=860;r.step(1/120);assert.equal(p.power,'laser');assert.equal(r.pickups.length,0);
});

test('larger pickup area does not collect through cover or skip during fast movement',()=>{
  const r=arena(),p=r.add('Blocked');r.nextPickup=Infinity;p.x=772;p.y=520;
  r.map.walls=[{x:799,y:480,w:2,h:80}];r.pickups=[{id:1,type:'restore',x:828,y:520,expiresAt:30}];p.hp=5;
  r.step(1/120);assert.equal(p.hp,5);assert.equal(r.pickups.length,1,'nearby pickup behind a wall remains');
  r.map.walls=[];r.step(1/120);assert.equal(p.hp,10);assert.equal(r.pickups.length,0);
  const fast=arena(),driver=fast.add('Fast');fast.nextPickup=Infinity;driver.x=800;driver.y=430;power(fast,driver,'speed');
  fast.pickups=[{id:1,type:'laser',x:800,y:520,expiresAt:30}];
  for(let i=0;i<20;i++){fast.setInput(driver,{seq:i,x:0,y:1,aimX:800,aimY:700,fire:false});fast.step(1/120);}
  assert.equal(driver.power,'laser');assert.equal(fast.events.filter(e=>e.type==='pickup').length,1);
});

test('pickup grants one timed power; replacement, expiry and death clear it correctly',()=>{
  const r=arena(),p=r.add('P');r.nextPickup=Infinity;
  for(const type of ['speed','laser']){
    r.pickups=[{id:1,type,x:p.x,y:p.y,expiresAt:20}];r.step(1/120);
    assert.equal(p.power,type);assert.equal(r.pickups.length,0);assert.equal(r.snapshot().players[0].powerRemaining,10);
  }
  r.step(10.01);assert.equal(p.power,null);
  power(r,p,'double');r.damage(p,'enemy',10);assert.equal(p.power,null);assert.equal(p.powerUntil,0);
});

test('speed moves 60 percent faster only while active',()=>{
  const r=arena(),p=r.add('P');p.x=500;p.y=500;
  const move=()=>{p.input={x:1,y:0,aimX:1000,aimY:500,fire:false};p.lastInput=r.time;r.step(.1);};
  move();const base=p.x-500;power(r,p,'speed');const start=p.x;move();assert(Math.abs((p.x-start)/base-1.6)<1e-8);
  p.powerUntil=r.time;const end=p.x;move();assert(Math.abs(p.x-end-base)<1e-8);
});

test('double cannon emits parallel shells; machine gun shoots faster within hard limits',()=>{
  const r=arena(),p=r.add('P');power(r,p,'double');r.fire(p);
  assert.equal(r.shells.length,2);assert.equal(r.shells[0].vx,r.shells[1].vx);assert.equal(r.shells[0].vy,r.shells[1].vy);
  r.shells=[];power(r,p,'machine');r.fire(p);assert.equal(p.cool,.12);
  for(let i=0;i<200;i++){p.cool=0;r.fire(p);}assert.equal(r.shells.length,F.maxShellsPerPlayer);
  const others=Array.from({length:3},()=>r.add('Other'));
  for(const other of others){power(r,other,'machine');for(let i=0;i<200;i++){other.cool=0;r.fire(other);}}
  assert.equal(r.shells.length,F.maxShells);
});

test('double cannon barrels stay parallel and equally spaced in every aim direction',()=>{
  for(const aim of [0,Math.PI/2,Math.PI,-Math.PI/2,.63,-2.2]){
    const r=arena(),p=r.add('P');p.x=800;p.y=520;p.aim=aim;power(r,p,'double');r.fire(p);
    const [a,b]=r.shells,dx=Math.cos(aim),dy=Math.sin(aim);
    for(const [shell,offset] of [[a,-F.doubleBarrelOffset],[b,F.doubleBarrelOffset]]){
      assert(Math.abs((shell.x-p.x)*dx+(shell.y-p.y)*dy-38)<1e-8);
      assert(Math.abs(-(shell.x-p.x)*dy+(shell.y-p.y)*dx-offset)<1e-8);
      assert(Math.abs(shell.vx-dx*F.shellSpeed)<1e-8);assert(Math.abs(shell.vy-dy*F.shellSpeed)<1e-8);
    }
    const gap={x:b.x-a.x,y:b.y-a.y};r.step(.25);
    assert.equal(r.shells.length,2);assert(Math.abs(b.x-a.x-gap.x)<1e-8);assert(Math.abs(b.y-a.y-gap.y)<1e-8);
    assert(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-F.doubleBarrelOffset*2)<1e-8);
  }
});

test('parallel barrels independently clip cover and still ricochet at every boundary',()=>{
  const r=arena(),p=r.add('P');p.x=500;p.y=500;p.aim=0;power(r,p,'double');
  const wall={x:530,y:501,w:40,h:100};r.map.walls=[wall];r.fire(p);
  const [clear,blocked]=r.shells;assert.equal(clear.x,538);assert(blocked.x<530);
  assert.equal(clear.vx,blocked.vx);assert.equal(clear.vy,blocked.vy);
  assert(r.shells.every(s=>!hitRect(s.x,s.y,5,wall)));r.step(1/120);
  assert(clear.vx>0);assert(blocked.vx<0,'only the obstructed barrel ricochets');
  for(const [x,y,aim] of [[26,520,Math.PI],[1574,520,0],[800,26,-Math.PI/2],[800,1014,Math.PI/2]]){
    const edge=arena(),tank=edge.add('P');Object.assign(tank,{x,y,aim});power(edge,tank,'double');edge.fire(tank);
    assert.equal(edge.shells.length,2);edge.step(.05);assert.equal(edge.shells.length,2);
    assert(edge.shells.every(s=>s.bounces===1&&s.vx*Math.cos(aim)+s.vy*Math.sin(aim)<0));
  }
});

test('50-percent higher limits allow 36 per player and 144 per room with atomic double volleys',()=>{
  assert.equal(F.maxShellsPerPlayer,36);assert.equal(F.maxShells,144);
  const r=arena(),players=Array.from({length:4},()=>r.add('P'));
  for(const p of players){power(r,p,'machine');for(let i=0;i<36;i++){p.cool=0;r.fire(p);}assert.equal(r.shells.filter(s=>s.owner===p.id).length,36);}
  assert.equal(r.shells.length,144);const p=players[0];p.cool=0;r.fire(p);assert.equal(r.shells.length,144);
  r.shells.shift();power(r,p,'double');r.fire(p);assert.equal(r.shells.length,143,'one free slot cannot split a volley');assert.equal(p.cool,0);
  r.shells.shift();r.fire(p);assert.equal(r.shells.length,144);assert.equal(p.cool,F.fireCooldown);
  const shots=r.events.filter(e=>e.type==='shot'&&e.player===p.id);assert.equal(shots.at(-1).power,'double');
});

test('laser damages enemies once, stops at cover, and ignores teammates',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),b=r.add('B'),c=r.add('C');
  a.x=100;a.y=300;a.aim=0;b.x=500;b.y=300;c.x=250;c.y=300;b.shieldUntil=c.shieldUntil=0;
  assert.equal(F.laserDamage,4);
  power(r,a,'laser');r.fire(a);assert.equal(b.hp,6);assert.equal(c.hp,10);assert.equal(r.shells.length,0);
  assert(r.events.some(e=>e.type==='laser'&&e.endX<500));
  r.map.walls=[{x:350,y:200,w:30,h:200}];a.cool=0;r.fire(a);assert.equal(b.hp,6);assert.equal(r.events.at(-1).endX,350);
  r.map.walls=[];b.shieldUntil=10;a.cool=0;r.fire(a);assert.equal(b.hp,6);
});

test('Immortal absorbs shells and blocks laser damage for ten seconds, even while firing',()=>{
  const r=arena(),attacker=r.add('Attack'),p=r.add('Immortal'),behind=r.add('Behind');r.nextPickup=Infinity;
  attacker.x=100;attacker.y=300;attacker.aim=0;p.x=500;p.y=300;behind.x=700;behind.y=300;
  attacker.shieldUntil=p.shieldUntil=behind.shieldUntil=0;
  r.pickups=[{id:1,type:'immortal',x:p.x,y:p.y,expiresAt:20}];r.step(1/120);
  assert.equal(p.power,'immortal');assert.equal(r.snapshot().players.find(t=>t.id===p.id).powerRemaining,10);
  p.cool=0;r.fire(p);assert.equal(p.shieldUntil,0);assert.equal(r.invulnerable(p),true,'firing does not cancel Immortal');
  r.shells=[{id:99,x:p.x-24,y:p.y,vx:410,vy:0,owner:attacker.id,slot:0,life:2,bounces:0}];r.step(1/120);
  assert.equal(p.hp,10);assert.equal(r.shells.length,0,'incoming shell is absorbed');
  attacker.aim=0;power(r,attacker,'laser');r.fire(attacker);
  assert.equal(p.hp,10);assert.equal(behind.hp,10,'beam does not pierce an immortal tank');
  assert.equal(r.events.some(e=>e.type==='hit'||e.type==='destroyed'),false);assert.equal(attacker.kills,0);assert.equal(p.deaths,0);
  r.time=p.powerUntil;r.damage(p,attacker.id);assert.equal(p.hp,9,'protection ends at its deadline');
  power(r,p,'immortal');r.pickups=[{id:2,type:'machine',x:p.x,y:p.y,expiresAt:r.time+20}];r.step(1/120);
  r.damage(p,attacker.id);assert.equal(p.hp,8,'another timed power replaces protection');
});

test('Restore heals to ten immediately without replacing or extending an active power',()=>{
  const r=arena(),p=r.add('P');r.nextPickup=Infinity;power(r,p,'immortal');const deadline=p.powerUntil;p.hp=1;
  r.pickups=[{id:1,type:'restore',x:p.x,y:p.y,expiresAt:20}];r.step(.01);
  assert.equal(p.hp,10);assert.equal(p.power,'immortal');assert.equal(p.powerUntil,deadline);assert.equal(r.pickups.length,0);
  assert.equal(r.events.at(-1).power,'restore');assert.equal(r.snapshot().players[0].hp,10);
  p.power=null;p.powerUntil=0;r.pickups=[{id:2,type:'restore',x:p.x,y:p.y,expiresAt:20}];r.step(.01);
  assert.equal(p.hp,10,'no overheal');assert.equal(p.power,null,'Restore is not a timed power');assert.equal(p.powerUntil,0);
  p.hp=0;p.respawnAt=10;r.pickups=[{id:3,type:'restore',x:p.x,y:p.y,expiresAt:20}];r.step(.01);
  assert.equal(p.hp,0,'dead tanks cannot collect Restore');assert.equal(r.pickups.length,1);
});

test('disabled powers prevent Immortal protection and Restore collection',()=>{
  const r=arena({powers:false}),p=r.add('P');p.shieldUntil=0;power(r,p,'immortal');r.damage(p,'enemy');assert.equal(p.hp,9);
  r.pickups=[{id:1,type:'restore',x:p.x,y:p.y,expiresAt:20}];r.step(.01);assert.equal(p.hp,9);assert.equal(r.pickups.length,1);
});

test('laser clears all enemy bullets on its path but stops at the first enemy tank',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),enemy=r.add('B'),friend=r.add('C'),behind=r.add('D');
  for(const p of [a,enemy,friend,behind]){p.y=500;p.shieldUntil=0;}
  a.x=100;friend.x=240;enemy.x=600;behind.x=900;a.aim=0;
  const shot=(id,x,y,owner)=>({id,x,y,vx:0,vy:0,owner:owner.id,team:owner.team,slot:owner.slot,life:3,bounces:0});
  r.shells=[shot(1,260,500,enemy),shot(2,350,500,behind),shot(3,430,510,enemy),shot(4,400,512,enemy),shot(5,650,500,enemy),shot(6,300,500,a),shot(7,320,500,friend),shot(8,90,500,enemy)];
  power(r,a,'laser');r.fire(a);
  assert.deepEqual(r.shells.map(s=>s.id),[4,5,6,7,8]);assert.equal(r.events.filter(e=>e.type==='laser-clear').length,3);
  assert.equal(enemy.hp,6);assert.equal(friend.hp,10);assert.equal(behind.hp,10);assert.equal(a.kills,0);
  const beam=r.events.find(e=>e.type==='laser');assert.equal(beam.x,140);assert.equal(beam.y,500);assert.equal(beam.endX,574);
  a.cool=0;r.fire(a);assert.equal(enemy.hp,2);assert.equal(a.kills,0);assert.equal(enemy.deaths,0);assert.equal(behind.hp,10);
  a.cool=0;r.fire(a);assert.equal(enemy.hp,0);assert.equal(a.kills,1);assert.equal(enemy.deaths,1);assert.equal(behind.hp,10,'killing the first tank still stops that beam');
});

test('laser does not clear bullets behind cover or pierce spawn shields',()=>{
  const r=arena(),a=r.add('A'),b=r.add('B');a.x=100;a.y=300;a.aim=0;b.x=500;b.y=300;
  const shot=(id,x)=>({id,x,y:300,vx:0,vy:0,owner:b.id,slot:b.slot,life:3,bounces:0});
  r.map.walls=[{x:350,y:250,w:40,h:100}];r.shells=[shot(1,250),shot(2,450)];power(r,a,'laser');r.fire(a);
  assert.deepEqual(r.shells.map(s=>s.id),[2]);assert.equal(b.hp,10);assert.equal(r.events.at(-1).endX,350);
  r.map.walls=[];a.cool=0;r.fire(a);assert.equal(b.hp,10,'spawn shield protects from damage');assert(Math.abs(r.events.at(-1).endX-474)<1e-8);
});

test('laser muzzle follows all aim directions, clips nearby cover, and ends at arena bounds',()=>{
  for(const aim of [0,Math.PI/2,Math.PI,-Math.PI/2,.63]){
    const r=arena(),p=r.add('P');p.x=800;p.y=520;p.aim=aim;power(r,p,'laser');r.fire(p);
    const beam=r.events.at(-1),muzzle=F.muzzle(p.x,p.y,aim);
    assert(Math.abs(beam.x-muzzle.x)<1e-8);assert(Math.abs(beam.y-muzzle.y)<1e-8);assert.equal(beam.tankLife,p.life);
    assert(beam.endX>=-1e-8&&beam.endX<=F.width+1e-8&&beam.endY>=-1e-8&&beam.endY<=F.height+1e-8);
    assert(Math.min(Math.abs(beam.endX),Math.abs(beam.endX-F.width),Math.abs(beam.endY),Math.abs(beam.endY-F.height))<1e-8);
  }
  const r=arena(),p=r.add('P');p.x=374;p.y=350;p.aim=0;r.map.walls=[{x:400,y:300,w:80,h:160}];power(r,p,'laser');r.fire(p);
  const clipped=r.events.at(-1);assert.equal(clipped.x,400);assert.equal(clipped.endX,400);assert.equal(clipped.muzzleDistance,26);
});

test('team bullets cross teammate hulls and bullets, then still hit an opponent',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),b=r.add('B'),c=r.add('C');r.nextPickup=Infinity;
  a.x=100;c.x=250;b.x=400;for(const p of [a,b,c]){p.y=300;p.shieldUntil=0;}
  r.shells=[{id:1,x:180,y:300,vx:410,vy:0,owner:a.id,team:a.team,slot:a.slot,life:3,bounces:0},
    {id:2,x:300,y:300,vx:-410,vy:0,owner:c.id,team:c.team,slot:c.slot,life:3,bounces:0}];
  for(let i=0;i<64;i++)r.step(1/120);
  assert.equal(c.hp,10);assert.equal(a.hp,10);assert.equal(b.hp,9);
  assert.equal(r.events.some(e=>e.type==='shell-clash'),false);
});
