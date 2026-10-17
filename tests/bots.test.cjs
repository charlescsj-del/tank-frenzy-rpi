const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room}=require('../game-server.cjs');
const F=require('../shared.js');
const step=(room,seconds)=>{for(let i=0;i<Math.round(seconds*120);i++)room.step(1/120);};

test('only the room starter adds, removes and tunes bots, and only while waiting',()=>{
  const r=new Room('BOTS'),owner=r.add('Owner'),guest=r.add('Guest');
  assert.equal(r.botCommand(guest,{action:'add'}),false);
  assert.equal(r.botCommand(owner,{action:'add'}),true);assert.equal(r.botCommand(owner,{action:'add'}),true);
  assert.equal(r.botCommand(owner,{action:'add'}),false,'four seats at most');
  const bots=[...r.players.values()].filter(p=>p.bot);
  assert.equal(bots.length,2);assert(bots.every(b=>b.bot&&!b.name.startsWith('🤖 ')));assert.equal(new Set(bots.map(b=>b.name)).size,2);assert.equal(r.ownerId,owner.id);
  assert.equal(r.botCommand(owner,{action:'skill',skill:'hard'}),true);assert.equal(r.botSkill,'hard');
  assert.equal(r.botCommand(owner,{action:'skill',skill:'godlike'}),false);assert.equal(r.snapshot().botSkill,'hard');
  assert.equal(r.botCommand(owner,{action:'remove'}),true);assert.equal(r.humans().length,2);assert.equal(r.players.size,3);
  r.start(owner);assert.equal(r.botCommand(r.players.get(owner.id),{action:'add'}),false,'no changes after the start');
});

test('bots never keep a room alive or vote',()=>{
  const r=new Room('SEAT'),owner=r.add('Owner');
  for(let i=0;i<2;i++)r.botCommand(owner,{action:'add'});
  const late=r.add('Late');assert(late,'an unused seat accepts a human');
  assert.equal(r.players.size,4);assert.equal([...r.players.values()].filter(p=>p.bot).length,2);
  r.start(owner);step(r,3.1);
  owner.kills=9;const bot=[...r.players.values()].find(p=>p.bot);bot.shieldUntil=0;r.damage(bot,owner.id,10);
  assert.equal(r.phase,'results');assert.equal(r.snapshot().rematchNeeded,2,'two humans: both must agree');
  assert.equal(r.voteRematch(bot),false,'bots do not vote');
  r.voteRematch(owner);r.voteRematch(late);assert.equal(r.phase,'countdown');
  r.remove(late);r.remove(owner);assert.equal(r.players.size,0,'bots leave with the last human');
});

test('full AI seats are never displaced; only a departed human opens a seat',()=>{
  for(const mode of ['ffa','teams'])for(const phase of ['waiting','ready','countdown','playing','results']){
    const r=new Room('LOCKED',{mode}),owner=r.add('Owner'),guest=r.add('Guest');
    r.add('',{bot:true});r.add('',{bot:true});r.phase=phase;
    const bots=[...r.players.values()].filter(p=>p.bot),before=[...r.players.keys()];
    assert.equal(r.add('Intruder'),null);assert.deepEqual([...r.players.keys()],before);
    r.disconnect(guest);assert.equal(r.add('Still full'),null,'a disconnected human retains their reservation');
    r.remove(guest);const replacement=r.add('Replacement');assert(replacement);assert.equal(replacement.slot,guest.slot);assert.equal(replacement.team,guest.team);
    r.remove(replacement);assert.equal(r.players.size,3);assert(bots.every(b=>r.players.get(b.id)===b),'joining then quitting never removes an AI');
    assert(r.add('Next'));assert.equal(r.players.size,4);assert(r.players.has(owner.id));
  }
});

test('bots hunt, aim and score against an idle player on a random map',()=>{
  let bestKills=0;
  for(let round=0;round<3&&bestKills===0;round++){
    const r=new Room('HUNT'),human=r.add('Target');
    for(let i=0;i<3;i++)r.botCommand(human,{action:'add'});
    r.botCommand(human,{action:'skill',skill:'hard'});r.start(human);step(r,3.1);
    const bots=[...r.players.values()].filter(p=>p.bot),start=bots.map(b=>[b.x,b.y]);
    for(let i=0;i<60*120;i++){human.lastInput=r.time;r.step(1/120);}
    assert(bots.every((b,i)=>b.deaths>0||Math.hypot(b.x-start[i][0],b.y-start[i][1])>50),'every bot moved');
    assert(bots.some(b=>b.shots>0),'bots fire');
    bestKills=Math.max(...bots.map(b=>b.kills));
  }
  assert(bestKills>0,'a hard bot scores within a minute');
});

test('bots stay still and hold fire outside active play',()=>{
  const r=new Room('WAIT'),human=r.add('Host');r.botCommand(human,{action:'add'});
  const bot=[...r.players.values()].find(p=>p.bot),x=bot.x;r.start(human);step(r,2);
  assert.equal(bot.x,x);assert.equal(r.shells.length,0);
});
