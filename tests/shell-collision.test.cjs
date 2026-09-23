'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room:WaitingRoom}=require('../game-server.cjs');
// Existing physics fixtures exercise an already running match. Lifecycle has separate tests.
class Room extends WaitingRoom{constructor(...args){super(...args);this.phase='playing';}}

function arena(){const room=new Room('CLASH');room.map.walls=[];return room;}
function shell(id,x,y,vx,vy,owner='player-'+id){return {id,x,y,vx,vy,owner,slot:(id-1)%4,life:3,bounces:0};}
const clashes=room=>room.events.filter(e=>e.type==='shell-clash');

test('opposing shells collide head-on and disappear from the shared snapshot',()=>{
  const r=arena();r.shells=[shell(1,400,300,410,0),shell(2,420,300,-410,0)];
  r.step(1/120);assert.equal(r.shells.length,2);
  r.step(1/120);assert.equal(r.snapshot().shells.length,0);
  assert.equal(clashes(r).length,1);
  assert(Math.abs(clashes(r)[0].x-410)<1e-8);assert.equal(clashes(r)[0].y,300);
  assert.equal(clashes(r)[0].slot,0);assert.equal(clashes(r)[0].otherSlot,1);
});

test('fast crossing shells cannot tunnel through each other between ticks',()=>{
  for(const reverse of [false,true]){
    const r=arena();r.shells=[shell(1,400,300,410,0),shell(2,410,290,0,410)];
    if(reverse)r.shells.reverse();
    r.step(.05);assert.equal(r.shells.length,0);assert.equal(clashes(r).length,1);
  }
});

test('near misses, same-owner shells and expired shells do not intercept',()=>{
  for(const mode of ['miss','own','expired']){
    const r=arena(),a=shell(1,400,300,410,0),b=shell(2,420,mode==='miss'?311:300,-410,0);
    if(mode==='own')b.owner=a.owner;
    if(mode==='expired')b.life=0;
    r.shells=[a,b];r.step(.05);
    assert.equal(r.shells.length,mode==='expired'?1:2);assert.equal(clashes(r).length,0);
  }
});

test('intercepted shells cause no tank damage or kills',()=>{
  const r=arena(),a=r.add('Attacker'),b=r.add('Defender');
  a.x=200;a.y=300;b.x=455;b.y=300;a.shieldUntil=b.shieldUntil=0;
  r.shells=[shell(1,400,300,410,0,a.id),shell(2,415,300,-410,0,b.id)];
  r.step(.1);
  assert.equal(r.shells.length,0);assert.equal(clashes(r).length,1);
  assert.equal(a.hp,10);assert.equal(b.hp,10);assert.equal(a.kills,0);assert.equal(b.kills,0);
  assert.equal(r.events.some(e=>e.type==='hit'||e.type==='destroyed'),false);
});

test('a tank hit before a later shell crossing consumes only the incoming shell',()=>{
  const r=arena(),p=r.add('Target');p.x=430;p.y=300;p.shieldUntil=0;
  r.shells=[shell(1,400,300,410,0),shell(2,445,300,-410,0,p.id)];
  r.step(.05);
  assert.equal(p.hp,9);assert.equal(clashes(r).length,0);
  assert.deepEqual(r.shells.map(s=>s.id),[2]);
});

test('a shell is consumed once even when several collision candidates exist',()=>{
  const r=arena();r.shells=[shell(1,400,300,410,0),shell(2,420,300,-410,0),shell(3,435,300,-410,0)];
  r.step(.05);
  assert.equal(clashes(r).length,1);assert.deepEqual(r.shells.map(s=>s.id),[3]);
});

test('ricocheting shells can still intercept enemy fire',()=>{
  const r=arena();r.shells=[shell(1,1594,300,410,0),shell(2,1578,300,410,0)];
  r.step(1/120);assert(r.shells.some(s=>s.bounces===1));
  r.step(1/120);assert.equal(r.shells.length,0);assert.equal(clashes(r).length,1);
});
