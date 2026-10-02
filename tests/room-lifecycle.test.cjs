'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room}=require('../game-server.cjs');
function input(r,p){r.setInput(p,{seq:p.seq+1,x:1,y:0,aimX:1200,aimY:500,fire:true});}
function running(){const r=new Room('TEST'),a=r.add('A');r.start(a);r.step(3);r.map.walls=[];return {r,a};}

test('Quick Play caps waiting, replaces disconnected pregame seats, and starts without another tap',()=>{
  const r=new Room('QUICK'),a=r.add('A');r.configureQuick();r.disconnect(a);r.step(.01);assert.equal(r.players.size,0,'abandoned queue never makes a bot-only match');
  const room=new Room('QUICK2'),human=room.add('A');room.configureQuick();room.step(8);assert.equal(room.phase,'ready');assert.equal(room.players.size,4);assert.equal(room.botSkill,'easy');
  const x=human.x;input(room,human);room.step(4.9);assert.equal(human.x,x);assert.equal(room.phase,'ready');room.step(.11);assert.equal(room.phase,'playing');
  const full=new Room('FULL');for(let i=0;i<4;i++)full.add('P'+i);full.configureQuick();full.step(.01);const leaver=full.humans()[0];full.disconnect(leaver);full.step(.01);assert.equal(full.players.size,4);assert.equal(full.humans().length,3);
  const peers=full.humans();full.ready(peers[0]);full.ready(peers[1]);full.disconnect(peers[2]);full.step(.01);assert.equal(full.phase,'playing','a departed unready human cannot hold back ready peers');
});

test('results reactions are authorized, rate-limited, short-lived, and confined to their room',()=>{
  const {r,a}=running(),b=r.add('B');assert.equal(r.react(a,'gg'),false);b.shieldUntil=0;a.kills=9;r.damage(b,a.id,10);
  assert.equal(r.react({...a},'gg'),false);assert.equal(r.react(a,'invalid'),false);assert.equal(r.react(a,'gg'),true);assert.equal(r.react(a,'wow'),false);
  assert.equal(r.snapshot().players.find(p=>p.id===a.id).reaction,'gg');r.step(1.51);assert.equal(r.react(a,'wow'),true);r.step(3.01);assert.equal(r.snapshot().players.find(p=>p.id===a.id).reaction,null);
  const other=new Room('OTHER');assert.equal(other.react(a,'gg'),false);assert.equal(other.events.length,0);
});

test('host team swaps preserve two seats per side and changed rules clear readiness',()=>{
  const r=new Room('TEAMS',{mode:'teams'}),a=r.add('A');for(let i=0;i<3;i++)r.add('P'+i);
  r.ready(a);assert.equal(r.roomCommand(a,{action:'team',player:a.id,team:1}),true);assert.equal(r.readyIds.size,0);assert.deepEqual([0,1].map(t=>[...r.players.values()].filter(p=>p.team===t).length),[2,2]);
  assert.equal(r.roomCommand(r.humans()[1],{action:'rules',settings:{mode:'ffa'}}),false);
});

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

test('damage totals reach clients only after a match ends and reset for a rematch',()=>{
  const r=new Room('DAMAGE'),a=r.add('A'),b=r.add('B');r.start(a);r.step(3);b.shieldUntil=0;
  r.damage(b,a.id,4);assert.equal(a.damageDealt,4);
  assert.equal(Object.hasOwn(r.snapshot().players[0],'damageDealt'),false);
  a.kills=r.settings.targetScore-1;r.damage(b,a.id,6);
  assert.equal(r.phase,'results');assert.equal(r.snapshot().players[0].damageDealt,10);
  r.voteRematch(a);r.voteRematch(b);
  assert.equal(a.damageDealt,0);assert.equal(Object.hasOwn(r.snapshot().players[0],'damageDealt'),false);
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
  r.disconnect(a);r.step(60);assert.equal(r.players.size,1,'a returning phone keeps its tank during a brief outage');
  r.step(31);assert.equal(r.players.size,0);assert.equal(r.ownerId,null);
});

test('a win freezes play and requires every connected player to vote for a rematch within 20 seconds',()=>{
  const {r,a}=running(),b=r.add('B');b.shieldUntil=0;a.kills=9;
  r.damage(b,a.id,10);assert(r.winner);assert.equal(r.phase,'results');assert.equal(r.snapshot().rematchIn,20);
  assert.equal(a.damageDealt,10);
  const oldMap=r.map.id,x=a.x;input(r,a);r.step(10);assert.equal(a.x,x);assert.equal(r.phase,'results');assert.equal(r.winner.id,a.id);
  assert.equal(r.voteRematch(a),true);assert.equal(r.voteRematch(a),false,'duplicate votes are ignored');
  assert.equal(r.phase,'results');assert.deepEqual(r.snapshot().rematchVotes,[a.id]);
  assert.equal(r.voteRematch(b),true);assert.equal(r.phase,'countdown');assert.equal(r.winner,null);
  assert.equal(r.snapshot().countdownIn,3);assert.equal(r.snapshot().rematchIn,0);assert.equal(r.snapshot().rematchVotes.length,0);
  assert.notEqual(r.map.id,oldMap);assert.equal(a.kills,0);assert.equal(a.damageDealt,0);assert.equal(b.deaths,0);assert.equal(b.hp,10);assert.equal(r.ownerId,null);
  input(r,a);const nextX=a.x;r.step(2.9);assert.equal(a.x,nextX);assert.equal(r.phase,'countdown');r.step(.11);assert.equal(r.phase,'playing');
});

test('an expired rematch returns everyone to a usable lobby without auto-starting',()=>{
  const {r,a}=running(),b=r.add('B');b.shieldUntil=0;a.kills=9;r.damage(b,a.id,10);
  assert.equal(r.voteRematch(a),true);r.step(20);assert.equal(r.phase,'waiting');assert.equal(r.winner,null);
  assert.equal(r.snapshot().rematchIn,0);assert.deepEqual(r.snapshot().rematchVotes,[]);
  assert.equal(r.voteRematch(b),false);r.step(200);assert.equal(r.phase,'waiting');assert.equal(r.start(a),true);
});

test('rematch authorization excludes disconnected players but admits late joins and reconnects',()=>{
  const {r,a}=running(),b=r.add('B'),c=r.add('C');b.shieldUntil=0;a.kills=9;r.damage(b,a.id,10);
  assert.equal(r.voteRematch({id:a.id,connected:true}),false);
  assert.equal(r.voteRematch(a),true);assert.equal(r.phase,'results','one of three is not a majority');
  r.disconnect(b);assert.equal(r.voteRematch(b),false);
  const late=r.add('Late');b.connected=true;assert.equal(r.snapshot().rematchNeeded,3);
  assert.equal(r.voteRematch(c),true);assert.equal(r.phase,'results','two of four is not a majority');
  assert.equal(r.voteRematch(late),true);assert.equal(r.phase,'countdown');
});

test('a majority starts the rematch, and a non-voter leaving can complete it',()=>{
  const {r,a}=running(),b=r.add('B'),c=r.add('C'),d=r.add('D');b.shieldUntil=0;a.kills=9;r.damage(b,a.id,10);
  assert.equal(r.voteRematch(a),true);assert.equal(r.voteRematch(c),true);assert.equal(r.phase,'results');
  r.disconnect(d);r.step(.01);assert.equal(r.phase,'countdown','two of three connected players now agree');
  for(const p of [a,b,c,d])assert.equal(p.kills+p.shots+p.hits+p.streak,0,'match stats reset');
});

test('kills report the attacker and streak; shots and hits count per match',()=>{
  const {r,a}=running(),b=r.add('B');b.shieldUntil=0;a.cool=0;a.aim=0;
  r.fire(a);assert.equal(a.shots,1);
  r.damage(b,a.id,4);assert.equal(a.hits,1);
  r.damage(b,a.id,10);const kill=r.events.findLast(e=>e.type==='destroyed');
  assert.equal(kill.by,a.id);assert.equal(kill.streak,1);assert.equal(b.streak,0);
  const view=r.snapshot().players.find(p=>p.id===a.id);assert.deepEqual([view.shots,view.hits,view.streak],[1,2,1]);
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
