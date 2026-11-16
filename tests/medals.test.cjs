'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Room,encodeState}=require('../game-server.cjs'),F=require('../shared.js');
// Four tanks in a running round, far apart so only the scripted damage matters.
function battle(mode='ffa'){
  const room=new Room('MEDALS',{mode}),players=['Ann','Bo','Cy','Di'].map(name=>room.add(name));room.start(players[0]);room.step(3.1);assert.equal(room.phase,'playing');
  for(const p of players)p.shieldUntil=0;
  const kill=(attacker,victim,{ricochet=false,later=0}={})=>{room.time+=later;victim.hp=1;victim.shieldUntil=0;room.events=[];room.damage(victim,attacker.id,1,ricochet);const e=room.events.find(e=>e.type==='destroyed');victim.hp=10;victim.respawnAt=0;return e.medals||[];};
  return {room,players,kill};
}
test('every medal has a name and description, and the client can label any ID',()=>{
  assert.deepEqual(F.medals.map(m=>m.id),['first-blood','double-kill','triple-kill','revenge','shutdown','trick-shot','clutch']);
  for(const m of F.medals){assert(m.name&&m.description);assert.equal(F.medalName(m.id),m.name);}
  assert.equal(F.medalName('unknown'),'unknown');
});
test('first blood is awarded once per round and again after a rematch',()=>{
  const {room,players:[a,b,c],kill}=battle();
  assert.deepEqual(kill(a,b,{later:10}),['first-blood']);assert.deepEqual(kill(c,b,{later:10}),[]);
  room.resetRound();room.phase='playing';assert.deepEqual(kill(b,a,{later:10}),['first-blood']);assert.deepEqual(b.medals,{'first-blood':1});assert.deepEqual(a.medals,{},'medal counts restart each round');
});
test('double and triple kills need kills within four seconds of each other and end when the attacker dies',()=>{
  const {players:[a,b,c,d],kill}=battle();
  kill(d,c,{later:10});// first blood out of the way
  assert.deepEqual(kill(a,b,{later:10}),[]);assert.deepEqual(kill(a,c,{later:F.multiKillWindow}),['double-kill']);assert.deepEqual(kill(a,d,{later:3}),['triple-kill']);
  assert.deepEqual(kill(a,b,{later:3.9}),['triple-kill'],'the chain keeps going while kills stay close together');
  assert.deepEqual(kill(a,c,{later:4.1}),[],'a late kill starts a new chain');
  assert.deepEqual(kill(a,d,{later:1}),['double-kill']);
  kill(b,a,{later:1});assert.deepEqual(kill(a,c,{later:1}).filter(m=>m.endsWith('-kill')),[],'being destroyed ends the chain');
  assert.equal(a.medals['double-kill'],2);assert.equal(a.medals['triple-kill'],2);
});
test('revenge needs the latest killer, shutdown a streak of three, trick shot a bounce and clutch one health',()=>{
  const {players:[a,b,c,d],kill}=battle();
  kill(a,b,{later:10});assert.deepEqual(kill(b,a,{later:10}),['revenge']);assert.deepEqual(kill(b,a,{later:10}),[],'revenge is used up');
  kill(a,b,{later:10});kill(c,b,{later:10});assert.deepEqual(kill(b,a,{later:10}),[],'only the most recent killer counts');assert.deepEqual(kill(b,c,{later:10}),['revenge']);
  for(const victim of [a,c,a])kill(d,victim,{later:10});assert.equal(d.streak,3);
  assert.deepEqual(kill(b,d,{later:10}),['shutdown']);assert.equal(d.streak,0);
  assert.deepEqual(kill(b,d,{later:10,ricochet:true}),['trick-shot']);
  b.hp=1;assert.deepEqual(kill(b,c,{later:10}),['clutch']);
  c.hp=1;assert.deepEqual(kill(c,b,{later:10,ricochet:true}),['revenge','shutdown','trick-shot','clutch'],'one kill can earn several medals');
});
test('team mates never earn medals from each other and a destroyed tank cannot be hit twice',()=>{
  const {room,players:[a,b,c],kill}=battle('teams');
  assert.equal(a.team,c.team);c.hp=1;room.events=[];room.damage(c,a.id,1);assert.equal(c.hp,1);assert.equal(room.events.length,0);
  assert.deepEqual(kill(a,b,{later:10}),['first-blood']);b.hp=0;room.events=[];room.damage(b,a.id,1);assert.equal(room.events.length,0);assert.equal(a.kills,1);
});
test('medal counts reach clients only after the match; levels only outside the battle',()=>{
  const {room,players:[a,b],kill}=battle();a.level=7;kill(a,b,{later:10});
  let view=JSON.parse(encodeState(room.snapshot())).players.find(p=>p.id===a.id);assert.equal(view.medals,undefined);assert.equal(view.level,undefined,'no extra bytes in the 30 Hz battle snapshots');
  a.kills=9;kill(a,b,{later:10});assert.equal(room.phase,'results');
  view=JSON.parse(encodeState(room.snapshot())).players.find(p=>p.id===a.id);assert.deepEqual(view.medals,{'first-blood':1});assert.equal(view.level,7);
  assert.equal(JSON.parse(encodeState(room.snapshot())).players.find(p=>p.id===b.id).medals,undefined,'players without medals carry no field');
  const waiting=new Room('LOBBY'),host=waiting.add('Host');host.level=12;assert.equal(waiting.snapshot().players[0].level,12);
});
test('real shells award a trick shot for a bounced kill and the event names the medals',()=>{
  const room=new Room('BOUNCE'),a=room.add('Ann'),b=room.add('Bo');room.start(a);room.step(3.1);room.map={...room.map,walls:[]};
  a.x=800;a.y=500;b.x=800;b.y=120;b.hp=1;a.shieldUntil=0;b.shieldUntil=0;
  // Fire down at the bottom edge; the shell returns along the same column and passes Ann without hitting her.
  const events=[];for(let i=0;i<120*6&&b.hp>0;i++){room.setInput(a,{seq:i+1,x:0,y:0,aimX:800,aimY:1000,fire:i<40});room.step(1/120);events.push(...room.events);room.events=[];}
  const destroyed=events.find(e=>e.type==='destroyed');assert(destroyed,'the bounced shell reaches Bo');assert(destroyed.medals.includes('trick-shot'));assert(destroyed.medals.includes('first-blood'));assert.equal(a.medals['trick-shot'],1);
});
