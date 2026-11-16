'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Progress,dayNumber}=require('../progress.cjs'),{Room,encodeState}=require('../game-server.cjs'),F=require('../shared.js');
const day=864e5;
// Find a Malaysia day whose three missions are exactly the wanted ones (any order).
function dayWith(...ids){for(let d=20700;d<24000;d++){const today=F.missionsFor(d).map(m=>m.id);if(ids.every(id=>today.includes(id)))return d;}throw Error('no day with '+ids);}
const noon=d=>d*day-8*3600e3+12*3600e3;
function fixture(d,file=null){
  let now=noon(d);const store=new Progress(file,{now:()=>now}),profile=store.identify();store.ensure(profile.id);
  const room=new Room('MISSIONS'),p=room.add('Rookie');room.settings={...room.settings};p.profileId=profile.id;Object.assign(p,{activeSeconds:12,kills:0,deaths:9,shots:0,hits:0,damageDealt:0,ricochetHits:0,pickups:0,medals:{}});room.add('',{bot:true});room.roundStarted=0;room.time=90;room.matchPlayers=new Map([[p.id,p]]);room.winner={id:'other'};
  return {store,profile,room,p,time:t=>now=t,win:()=>room.winner={id:p.id},lose:()=>room.winner={id:'other'},view:()=>store.view(profile.id),award:()=>{room.roundId=randomUUID();return store.record(room).get(p.id);}};
}
test('every day has three different missions, the same for everyone, and each pool entry appears',()=>{
  const seen=new Set();
  for(let d=20700;d<21100;d++){const today=F.missionsFor(d);assert.equal(today.length,3);assert.equal(new Set(today.map(m=>m.id)).size,3);assert.deepEqual(F.missionsFor(d),today,'deterministic');for(const m of today)seen.add(m.id);}
  assert.equal(seen.size,F.dailyMissions.length);for(const m of F.dailyMissions)assert(m.name&&m.description&&m.target>=1);
  assert.notDeepEqual(F.missionsFor(20700).map(m=>m.id),F.missionsFor(20701).map(m=>m.id));
});
test('progress adds up across the day’s matches and each mission pays 40 experience once',()=>{
  const d=dayWith('kills','matches'),f=fixture(d);f.p.kills=5;let r=f.award();
  const state=()=>Object.fromEntries(f.view().missions.missions.map(m=>[m.id,[m.progress,m.completed]]));
  assert.deepEqual(state().kills,[5,false]);assert.deepEqual(state().matches,[1,false]);assert.deepEqual(r.reward.missions.filter(m=>['kills','matches'].includes(m.id)),[]);
  r=f.award();assert.deepEqual(state().kills,[8,true],'progress stops at the target');assert.deepEqual(state().matches,[2,true]);
  assert.deepEqual(r.reward.missions.filter(m=>['kills','matches'].includes(m.id)).map(m=>[m.id,m.xp]).sort(),[['kills',40],['matches',40]]);assert(r.reward.xp.missions>=80);
  r=f.award();assert.deepEqual(r.reward.missions.filter(m=>['kills','matches'].includes(m.id)),[],'no second payout');
  assert.equal(r.reward.xp.total,r.reward.xp.completion+r.reward.xp.victory+r.reward.xp.kills+r.reward.xp.medals+r.reward.xp.streak+r.reward.xp.daily+r.reward.xp.missions);
});
test('each kind of mission counts what it says',()=>{
  const cases={wins:f=>f.win(),hits:f=>f.p.hits=20,damage:f=>f.p.damageDealt=30,medals:f=>f.p.medals={'first-blood':1,'revenge':1},ricochetHits:f=>f.p.ricochetHits=3,pickups:f=>f.p.pickups=3,sharp:f=>{f.p.shots=10;f.p.hits=4;},survivor:f=>f.p.deaths=3,kills:f=>f.p.kills=8};
  for(const [id,setup]of Object.entries(cases)){
    const f=fixture(dayWith(id));let r=f.award();assert(!r.reward.missions.some(m=>m.id===id),id+' is not free');
    setup(f);r=f.award();assert(r.reward.missions.some(m=>m.id===id),id+' completes');
  }
  const near={sharp:f=>{f.p.shots=9;f.p.hits=9;},survivor:f=>f.p.deaths=4,hits:f=>f.p.hits=19,pickups:f=>f.p.pickups=2};
  for(const [id,setup]of Object.entries(near)){const f=fixture(dayWith(id));setup(f);assert(!f.award().reward.missions.some(m=>m.id===id),id+' needs the full target');}
});
test('finishing all three adds a 60 experience sweep once, and the badge counts completed missions',()=>{
  const d=dayWith('wins','survivor','matches'),f=fixture(d);f.win();f.p.deaths=0;let r=f.award();
  assert.deepEqual(r.reward.missions.map(m=>m.id).sort(),['survivor','wins']);assert.equal(r.reward.missionSweep,0);assert.equal(f.view().missions.sweep.completed,false);
  r=f.award();assert.deepEqual(r.reward.missions.map(m=>m.id),['matches']);assert.equal(r.reward.missionSweep,60);assert.equal(r.reward.xp.missions,100);assert.equal(f.view().missions.sweep.completed,true);
  r=f.award();assert.equal(r.reward.xp.missions,0);assert.equal(r.reward.missionSweep,0);assert.equal(f.view().stats.missions,3);
  const badge=F.achievements.find(a=>a.id==='dutiful');assert.equal(badge.stat,'missions');assert.equal(F.statValue(f.view().stats,'missions'),3);
});
test('missions reset at midnight Malaysia and use the time the match finished',()=>{
  // Two days in a row that both include "Finish 2 standard matches".
  let d=20700;while(!F.missionsFor(d).some(m=>m.id==='matches')||!F.missionsFor(d+1).some(m=>m.id==='matches'))d++;
  const f=fixture(d);f.award();assert.equal(f.view().missions.missions.find(m=>m.id==='matches').progress,1);
  assert.equal(f.view().missions.resetAt,(d+1)*day-8*3600e3);assert.equal(dayNumber(f.view().missions.resetAt),d+1);
  f.time((d+1)*day-8*3600e3+1000);const tomorrow=f.view().missions;assert.equal(tomorrow.day,d+1);assert(tomorrow.missions.every(m=>m.progress===0&&!m.completed),'a new day starts empty');assert.equal(tomorrow.sweep.completed,false);
  // A reward saved late still belongs to the day the match ended.
  f.room.rewardAt=noon(d);f.award();f.room.rewardAt=undefined;assert(f.view().missions.missions.every(m=>m.progress===0),'yesterday’s late save does not leak into today');
  f.award();const today=JSON.stringify(f.view().missions);assert.equal(f.view().missions.missions.find(m=>m.id==='matches').progress,1);
  f.room.rewardAt=noon(d);const late=f.award();f.room.rewardAt=undefined;assert.equal(JSON.stringify(f.view().missions),today,'and never wipes today’s progress');assert.deepEqual(late.reward.missions,[]);
});
test('practice, idle, left and vehicle-test matches make no mission progress',()=>{
  const d=dayWith('matches','kills');
  for(const change of [f=>f.p.activeSeconds=0,f=>f.p.left=true,f=>f.p.connected=false,f=>f.room.settings={...f.room.settings,targetScore:5},f=>f.room.ruleset='vehicle-test']){
    const f=fixture(d);f.p.kills=8;change(f);const r=f.award();assert.equal(r.reward.xp,null);assert(f.view().missions.missions.every(m=>m.progress===0));assert.equal(f.view().stats.missions,0);
  }
});
test('missions survive a restart, roll back with a failed save, old files load, and bad files are refused',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-missions-')),file=path.join(dir,'player-progress.json'),d=dayWith('matches','kills');
  try{
    const f=fixture(d,file);f.p.kills=3;f.award();const reloaded=new Progress(file,{now:()=>noon(d)}).view(f.profile.id);assert.equal(reloaded.missions.missions.find(m=>m.id==='kills').progress,3);
    const before=JSON.stringify(f.view());const save=f.store.save;f.store.save=()=>{throw Error('Progress could not be saved. Please try again.');};f.room.roundId=randomUUID();assert.throws(()=>f.store.record(f.room));assert.equal(JSON.stringify(f.view()),before);f.store.save=save;
    const data=JSON.parse(fs.readFileSync(file,'utf8')),player=data.players[0][1];delete player.missions;delete player.rivals;delete player.stats.missions;fs.writeFileSync(file,JSON.stringify(data));
    const old=new Progress(file,{now:()=>noon(d)}).view(f.profile.id);assert(old.missions.missions.every(m=>m.progress===0));assert.deepEqual(old.rivals,[]);assert.equal(old.stats.missions,0);
    for(const bad of [{missions:[]},{missions:{progress:[],completed:[]}},{missions:{progress:{},completed:{}}},{rivals:[]},{rivals:{x:{name:1}}},{rivals:{x:{name:'a',matches:-1,wins:0,losses:0,allied:0,kills:0,deaths:0,last:0}}}]){Object.assign(player,{missions:undefined,rivals:undefined},bad);fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>new Progress(file),/Invalid missions or rivals/);}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real play counts power-ups collected, and nothing about missions travels in shared snapshots',()=>{
  const room=new Room('PICKUP'),p=room.add('Human');room.start(p);room.step(3.1);room.map={...room.map,walls:[]};p.x=400;p.y=400;
  room.pickups=[{id:1,type:'speed',x:420,y:400,expiresAt:room.time+20},{id:2,type:'restore',x:430,y:410,expiresAt:room.time+20}];room.step(1/120);room.step(1/120);
  assert.equal(p.pickups,2);assert(!encodeState(room.snapshot()).includes('pickups":2'));
  room.resetRound();assert.equal(p.pickups,0);assert.deepEqual(p.killsOn,{});
});
