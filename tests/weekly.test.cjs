'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Progress,weekNumber}=require('../progress.cjs'),{Room}=require('../game-server.cjs'),{Leaderboard}=require('../leaderboard.cjs'),F=require('../shared.js');
const monday=Date.parse('2026-10-18T16:00:00Z');
function fixture(){
  let now=monday;const store=new Progress(null,{now:()=>now}),profile=store.identify();store.ensure(profile.id);
  const room=new Room('WEEKLY'),p=room.add('Human');room.settings={...room.settings};p.profileId=profile.id;p.activeSeconds=12;p.kills=1;p.ricochetHits=2;room.add('',{bot:true});room.roundStarted=0;room.time=90;room.matchPlayers=new Map([[p.id,p]]);room.winner={id:p.id};
  return {store,profile,room,p,time:t=>now=t,award:()=>{room.roundId=randomUUID();return store.record(room).get(p.id);}};
}
test('weekly catalogue gives 300 automatic coins and counts eligible solo-AI wins and hits',()=>{
  const f=fixture();assert.equal(F.weeklyChallenges.reduce((n,c)=>n+c.coins,0),300);
  for(let i=1;i<=5;i++){
    const r=f.award();assert.equal(r.progress.weekly.challenges[0].progress,i);
    assert.deepEqual(r.reward.weekly.map(c=>c.id),i===3?['wins']:i===5?['matches','ricochetHits']:[]);
    assert.equal(r.reward.total,53+(i===1?20:0)+(i===3?100:i===5?200:0));
    assert.equal(f.store.record(f.room).size,0);
  }
  const r=f.award();assert.equal(r.reward.weekly.length,0);assert(r.progress.weekly.challenges.every(c=>c.completed));assert.equal(r.progress.stats.weeklyCoins,300);assert.equal(r.progress.stats.weeklyCompleted,3);
  const report=f.store.report();assert.equal(report.weeklyCoins,300);assert.equal(report.weeklyCompleted,3);assert(!JSON.stringify(report).includes(f.profile.id));
});
test('losses advance completion and ricochet goals without a win; both winning team mates count',()=>{
  const f=fixture();f.room.winner={id:'other'};let r=f.award();assert.deepEqual(r.progress.weekly.challenges.map(c=>c.progress),[1,0,2]);
  f.room.settings.mode='teams';f.room.winner={team:1};f.p.team=1;const mate=f.room.add('Team mate');mate.profileId=f.store.identify().id;mate.activeSeconds=12;mate.team=1;f.room.matchPlayers.set(mate.id,mate);f.room.roundId=randomUUID();const results=f.store.record(f.room);r=results.get(f.p.id);assert.equal(r.progress.weekly.challenges[1].progress,1);assert.equal(results.get(mate.id).progress.weekly.challenges[1].progress,1);assert.equal(f.store.players.size,2,'bots never get wallets');
});
test('practice, idle, left and disconnected finishes cannot advance weekly goals',()=>{
  for(const change of [f=>f.p.left=true,f=>f.p.connected=false,f=>f.p.activeSeconds=0,f=>f.room.settings.targetScore=5,f=>f.room.settings.bouncing=false,f=>f.room.settings.powers=false]){
    const f=fixture();change(f);const r=f.award();assert.equal(r.reward.total,0);assert.deepEqual(r.reward.weekly,[]);assert(r.progress.weekly.challenges.every(c=>c.progress===0&&!c.completed));
  }
});
test('Monday Malaysia reset is based on match completion, not reward retry or page time',()=>{
  const f=fixture();f.time(monday-1);f.room.rewardAt=monday-1;f.award();const sunday=f.store.view(f.profile.id).weekly;assert.equal(sunday.resetAt,monday);
  f.time(monday);let view=f.store.view(f.profile.id).weekly;assert(view.challenges.every(c=>c.progress===0));assert.equal(view.resetAt,monday+7*864e5);assert.equal(view.week,sunday.week+7);
  f.room.rewardAt=monday;f.award();assert.equal(f.store.view(f.profile.id).weekly.challenges[0].progress,1);
  // A delayed earlier-week match must not erase or advance the current week.
  f.room.rewardAt=monday-1;f.award();view=f.store.view(f.profile.id).weekly;assert.equal(view.challenges[0].progress,1);assert.equal(f.store.players.get(f.profile.id).weekly[sunday.week].matches,2);
  assert.equal(weekNumber(monday),weekNumber(monday+6*864e5));assert.equal(weekNumber(monday-1)+7,weekNumber(monday));
  assert.equal(weekNumber(0),-3,'week arithmetic handles dates before the first epoch Monday');
});
test('failed saves roll back weekly credit; retry credits its original week exactly once',()=>{
  const f=fixture();f.p.ricochetHits=9;f.award();f.p.ricochetHits=1;f.room.roundId=randomUUID();f.room.rewardAt=monday;const before=JSON.stringify(f.store.view(f.profile.id)),save=f.store.save;f.store.save=()=>{throw Error('disk full');};
  assert.throws(()=>f.store.record(f.room),/disk full/);assert.equal(JSON.stringify(f.store.view(f.profile.id)),before);
  f.store.save=save;f.time(monday+7*864e5);const result=f.store.record(f.room).get(f.p.id);assert.equal(result.reward.weekly[0].id,'ricochetHits');assert.equal(result.reward.weekly[0].week,weekNumber(monday));assert(result.progress.weekly.challenges.every(c=>c.progress===0));assert.equal(f.store.record(f.room).size,0);
});
test('a new week can award each goal again without removing coins or cosmetic ownership',()=>{
  const f=fixture();for(let i=0;i<5;i++)f.award();const earned=f.store.view(f.profile.id).coins;f.store.players.get(f.profile.id).owned.push('desert');f.time(monday+7*864e5);f.p.ricochetHits=500;
  let r=f.award();assert.deepEqual(r.progress.weekly.challenges.map(c=>c.progress),[1,1,10]);assert.deepEqual(r.reward.weekly.map(c=>c.id),['ricochetHits']);for(let i=0;i<4;i++)r=f.award();assert(r.progress.weekly.challenges.every(c=>c.completed));assert.equal(r.progress.stats.weeklyCoins,600);assert(r.progress.coins>earned);assert(r.progress.owned.includes('desert'));
});
test('weekly history survives restart, profile recovery and independent leaderboard resets',t=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-weekly-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'progress.json'),f=fixture();f.store.file=file;
  for(let i=0;i<5;i++)f.award();const expected=f.store.view(f.profile.id),restored=new Progress(file,{now:()=>monday});assert.equal(restored.identify(f.profile.secret).id,f.profile.id);assert.deepEqual(restored.view(f.profile.id),expected);assert.equal(restored.record(f.room).size,0);
  const board=new Leaderboard(path.join(dir,'leaderboard.json'));board.record(f.room);board.reset();board.save();assert.deepEqual(new Progress(file,{now:()=>monday}).view(f.profile.id),expected);
  assert(!JSON.stringify(f.room.snapshot()).includes('ricochetHits'));assert(!JSON.stringify(f.room.snapshot()).includes('weekly'));
});
test('pre-weekly wallets load without losing coins, skins, badges, daily streak or credit history',t=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-weekly-migrate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'progress.json'),f=fixture();f.award();const old=f.store.players.get(f.profile.id);delete old.weekly;delete old.stats.weeklyCoins;delete old.stats.weeklyCompleted;fs.writeFileSync(file,JSON.stringify({schema:1,players:[[f.profile.id,old]]}));
  const restored=new Progress(file,{now:()=>monday}),view=restored.view(f.profile.id);assert.equal(view.coins,old.coins);assert.deepEqual(view.owned,old.owned);assert.deepEqual(view.achievements,old.achievements);assert.equal(view.daily.step,1);assert.equal(view.stats.weeklyCoins,0);assert(view.weekly.challenges.every(c=>c.progress===0));assert.equal(restored.record(f.room).size,0,'older credited games are never awarded retroactively');
  old.weekly={bad:{}};fs.writeFileSync(file,JSON.stringify({schema:1,players:[[f.profile.id,old]]}));assert.throws(()=>new Progress(file),/Invalid weekly/);
});
test('only actual bounced-shell enemy damage counts and the winning hit is counted before rewards',()=>{
  const room=new Room('BOUNCE'),a=room.add('A'),b=room.add('B');room.settings={...room.settings};room.start(a);room.step(3);room.map.walls=[];a.x=100;a.y=300;b.x=200;b.y=300;a.shieldUntil=b.shieldUntil=0;
  const shoot=bounces=>{room.shells=[{id:1,x:b.x-24,y:b.y,vx:410,vy:0,owner:a.id,slot:a.slot,life:1,bounces}];room.step(1/120);};
  shoot(0);assert.equal(a.ricochetHits,0);shoot(1);assert.equal(a.ricochetHits,1);shoot(5);assert.equal(a.ricochetHits,2,'multiple bounces still count as one hit');
  b.power='immortal';b.powerUntil=room.time+10;shoot(1);assert.equal(a.ricochetHits,2);b.power=null;b.shieldUntil=room.time+10;shoot(1);assert.equal(a.ricochetHits,2);b.shieldUntil=0;
  room.damage(b,a.id,1);assert.equal(a.ricochetHits,2,'laser/direct damage is not a ricochet');
  room.settings.mode='teams';a.team=b.team=0;shoot(1);assert.equal(a.ricochetHits,2);room.damage(a,a.id,1,true);assert.equal(a.ricochetHits,2,'self damage never advances the skill goal');
  room.settings.mode='ffa';room.setInput(a,{seq:100,x:0,y:0,aimX:500,aimY:300,fire:false,ricochetHits:9999});assert.equal(a.ricochetHits,2);
  a.kills=9;b.hp=1;let atFinish;room.onFinish=()=>atFinish=a.ricochetHits;shoot(1);assert.equal(atFinish,3);room.resetRound();assert.equal(a.ricochetHits,0);
});
test('a shell bouncing off a real wall advances the skill counter on its return hit',()=>{
  const room=new Room('WALL'),a=room.add('A'),b=room.add('B');room.start(a);room.step(3);a.x=100;a.y=300;b.x=400;b.y=300;a.shieldUntil=b.shieldUntil=0;room.map.walls=[{x:600,y:200,w:40,h:200}];
  const shell={id:1,x:590,y:300,vx:410,vy:0,owner:a.id,slot:a.slot,life:3,bounces:0};room.shells=[shell];for(let i=0;i<120&&b.hp===10;i++)room.step(1/120);assert.equal(shell.bounces,1);assert.equal(b.hp,9);assert.equal(a.ricochetHits,1);
});
