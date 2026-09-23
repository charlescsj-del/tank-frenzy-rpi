'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room}=require('../game-server.cjs');
function input(r,p){r.setInput(p,{seq:p.seq+1,x:1,y:0,aimX:1200,aimY:500,fire:true});}
function running(){const r=new Room('TEST'),a=r.add('A');r.start(a);r.step(3);r.map.walls=[];return {r,a};}

test('waiting rooms stay frozen indefinitely; only the connected starter can start',()=>{
  const r=new Room('WAIT'),a=r.add('A'),b=r.add('B'),x=a.x,y=a.y;
  assert.equal(r.snapshot().phase,'waiting');assert.equal(r.ownerId,a.id);
  input(r,a);a.cool=0;r.fire(a);r.damage(a,b.id,10);r.step(30);
  assert.deepEqual([a.x,a.y,a.hp],[x,y,10]);assert.equal(r.shells.length,0);assert.equal(r.pickups.length,0);
  assert.equal(r.start(b),false);assert.equal(r.start({id:'fake',connected:true}),false);
  assert.equal(r.start(a),true);assert.equal(r.ownerId,null);assert.equal(r.start(a),false);
});

test('countdown lasts three seconds and cannot queue movement, shots or damage',()=>{
  const r=new Room('COUNT'),a=r.add('A'),b=r.add('B');r.start(a);
  const [x,y,aim]=[a.x,a.y,a.aim];assert.equal(r.snapshot().countdownIn,3);
  for(let i=0;i<2;i++){input(r,a);a.cool=0;r.fire(a);r.damage(a,b.id);r.step(1);assert.equal(r.snapshot().countdownIn,2-i);}
  assert.deepEqual([a.x,a.y,a.aim,a.hp],[x,y,aim,10]);assert.equal(r.shells.length,0);
  input(r,a);r.step(1);assert.equal(r.phase,'playing');assert.equal(r.snapshot().countdownIn,0);
  r.step(.01);assert.equal(a.x,x);assert.equal(r.shells.length,0,'countdown input is discarded');
  r.map.walls=[];input(r,a);a.cool=0;r.step(.01);assert(a.x>x);assert.equal(r.shells.length,1);
});

test('starter transfers on leave or disconnection before start, never after start',()=>{
  const r=new Room('OWNER'),a=r.add('A'),b=r.add('B'),c=r.add('C');
  r.disconnect(a);assert.equal(r.ownerId,b.id);assert.equal(r.start(a),false);
  a.connected=true;r.refreshOwner();assert.equal(r.ownerId,b.id,'reconnection does not steal control');
  r.remove(b);assert.equal(r.ownerId,a.id);r.remove(a);assert.equal(r.ownerId,c.id);
  r.start(c);r.remove(c);const late=r.add('Late');assert.equal(r.ownerId,null);assert.equal(r.start(late),false);
});

test('all-disconnected waiting room recovers a starter on reconnect and expires reservations',()=>{
  const r=new Room('BACK'),a=r.add('A');r.disconnect(a);assert.equal(r.ownerId,null);
  a.connected=true;r.step(.01);assert.equal(r.ownerId,a.id);
  r.disconnect(a);r.step(16);assert.equal(r.players.size,0);assert.equal(r.ownerId,null);
});

test('later rounds reset scores and powers and repeat the frozen countdown automatically',()=>{
  const {r,a}=running(),b=r.add('B');b.shieldUntil=0;a.kills=9;
  r.damage(b,a.id,10);assert(r.winner);const oldMap=r.map.id;r.step(10);
  assert.equal(r.winner,null);assert.equal(r.phase,'countdown');assert.equal(r.snapshot().countdownIn,3);
  assert.notEqual(r.map.id,oldMap);assert.equal(a.kills,0);assert.equal(b.deaths,0);assert.equal(b.hp,10);assert.equal(r.ownerId,null);
  input(r,a);const x=a.x;r.step(2.9);assert.equal(a.x,x);assert.equal(r.phase,'countdown');r.step(.11);assert.equal(r.phase,'playing');
});

test('mid-match joins can move and fire while remaining immune for exactly three seconds',()=>{
  const {r,a}=running(),p=r.add('Late');p.x=500;p.y=500;p.cool=0;
  const deadline=p.shieldUntil;assert.equal(deadline-r.time,3);input(r,p);r.step(.1);
  assert(p.x>500);assert(r.shells.some(s=>s.owner===p.id));assert.equal(p.shieldUntil,deadline);assert(r.snapshot().players.find(t=>t.id===p.id).shield);
  r.damage(p,a.id,10);assert.equal(p.hp,10);
  a.x=100;a.y=p.y;a.aim=0;r.fireLaser(a);assert.equal(p.hp,10,'laser is blocked by join protection');
  r.time=deadline-.001;r.damage(p,a.id,10);assert.equal(p.hp,10);
  r.time=deadline;r.damage(p,a.id);assert.equal(p.hp,9);assert.equal(r.snapshot().players.find(t=>t.id===p.id).shield,false);
});

test('joining during countdown does not unfreeze the arena or delay its start',()=>{
  const r=new Room('JOIN'),a=r.add('A');r.start(a);r.step(2);const b=r.add('B');input(r,b);const x=b.x;
  r.step(.9);assert.equal(b.x,x);assert.equal(r.phase,'countdown');r.step(.11);assert.equal(r.phase,'playing');
});
