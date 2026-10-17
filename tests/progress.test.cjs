'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Progress,dayNumber}=require('../progress.cjs'),{Leaderboard}=require('../leaderboard.cjs'),{Room}=require('../game-server.cjs'),F=require('../shared.js');
function fixture(options={}){
  const store=new Progress(null,options),profile=store.identify();store.ensure(profile.id);
  const room=new Room('COINS'),p=room.add('Rookie');p.profileId=profile.id;p.activeSeconds=12;p.kills=10;room.add('',{bot:true});room.roundId=randomUUID();room.roundStarted=0;room.time=90;room.matchPlayers=new Map([[p.id,p]]);room.winner={id:p.id,name:p.name};
  return {store,profile,room,p,award:()=>store.record(room).get(p.id)};
}
test('server rewards completion, victory and capped kills; repeated delivery is idempotent',()=>{
  const {store,profile,p,room,award}=fixture();p.kills=500;const result=award();assert.equal(result.reward.completion,20);assert.equal(result.reward.victory,30);assert.equal(result.reward.kills,30);assert.equal(result.reward.daily.coins,20);assert.equal(result.progress.coins,100);
  assert.equal(store.record(room).size,0);assert.equal(store.view(profile.id).coins,100);assert.equal(store.view(profile.id).stats.matches,1);
  assert.equal(JSON.stringify(result).includes(profile.secret),false);
});
test('team mates share victory bonuses and solo AI matches earn coins',()=>{
  const {store,profile,room,p,award}=fixture();room.settings={mode:'teams',targetScore:10,bouncing:true,powers:true};p.team=0;room.winner={team:0};assert.equal(award().reward.victory,30);
  room.roundId=randomUUID();room.winner={team:1};assert.equal(award().reward.victory,0);assert.equal(store.view(profile.id).coins,150);
});
test('leaving, idling, disconnected finish and practice rules earn no coins or daily progress',()=>{
  for(const change of [p=>p.left=true,p=>p.activeSeconds=0,p=>p.connected=false]){const f=fixture();change(f.p);const r=f.award();assert.equal(r.reward.total,0);assert(r.reward.reason);assert.equal(r.progress.daily.step,0);}
  for(const settings of [{targetScore:5},{bouncing:false},{powers:false}]){const f=fixture();f.room.settings={...f.room.settings,...settings};assert.match(f.award().reward.reason,/Practice/);}
});
test('real input tracks participation only while playing; stats cannot be set by clients',()=>{
  const room=new Room('ACTIVE'),p=room.add('Human');room.start(p);room.setInput(p,{seq:1,x:1,y:0,aimX:500,aimY:500,fire:true,activeSeconds:1000});room.step(1);assert.equal(p.activeSeconds,0);room.step(2);assert.equal(room.phase,'playing');
  for(let i=0;i<240;i++){room.setInput(p,{seq:i+2,x:1,y:0,aimX:500,aimY:500,fire:false});room.step(1/120);}assert(Math.abs(p.activeSeconds-2)<.01);room.disconnect(p);room.step(2);assert(Math.abs(p.activeSeconds-2)<.01);
});
test('Malaysia day boundaries use completion time, with at most one daily credit',()=>{
  let now=Date.parse('2026-10-17T15:59:59Z');const f=fixture({now:()=>now});assert.equal(f.award().reward.daily.day,1);
  f.room.roundId=randomUUID();assert.equal(f.award().reward.daily,null);now+=1000;f.room.roundId=randomUUID();assert.equal(f.award().reward.daily.day,2);assert.equal(f.store.view(f.profile.id).daily.qualified,true);
  now-=864e5;f.room.roundId=randomUUID();assert.equal(f.award().reward.daily,null,'a clock moving backwards never duplicates a daily reward');
  assert.equal(dayNumber(Date.parse('2026-10-17T16:00:00Z'))-dayNumber(Date.parse('2026-10-17T15:59:59Z')),1);
});
test('Day 7 permanently unlocks a random unowned skin, then starts a new cycle',()=>{
  let now=Date.parse('2026-10-17T04:00:00Z');const f=fixture({now:()=>now,random:()=>0});
  for(let i=1;i<=7;i++){f.room.roundId=randomUUID();const r=f.award();assert.equal(r.reward.daily.day,i);if(i===7){assert.equal(r.reward.skin,'desert');assert(r.progress.owned.includes('desert'));assert.equal(r.reward.daily.coins,100);}now+=864e5;}
  f.room.roundId=randomUUID();assert.equal(f.award().reward.daily.day,1);assert.equal(f.store.view(f.profile.id).daily.longest,8);
});
test('one missed day is protected per cycle; a second or longer absence resets it',()=>{
  let now=0;const f=fixture({now:()=>now});f.award();now+=2*864e5;f.room.roundId=randomUUID();let r=f.award();assert.equal(r.reward.daily.day,2);assert.equal(r.progress.daily.graceUsed,true);
  now+=2*864e5;assert.equal(f.store.view(f.profile.id).daily.nextDay,1);f.room.roundId=randomUUID();r=f.award();assert.equal(r.reward.daily.day,1);assert.equal(r.progress.daily.graceUsed,false);
  now+=3*864e5;f.room.roundId=randomUUID();assert.equal(f.award().reward.daily.day,1);
});
test('full collections receive the coin substitute instead of a duplicate skin',()=>{
  const f=fixture({now:()=>0});const p=f.store.players.get(f.profile.id);p.owned=F.skins.map(s=>s.id);p.daily={step:6,lastDay:-1,graceUsed:false,longest:6,streak:6};
  const r=f.award();assert.equal(r.reward.skin,null);assert.equal(r.reward.daily.collectionBonus,200);assert.equal(r.reward.total,380);assert.equal(r.progress.owned.length,7);
});
test('purchases and equipping validate ownership; repeated buying cannot charge twice',()=>{
  const f=fixture();assert.throws(()=>f.store.buy(f.profile.id,'gold'),/more coins/);assert.throws(()=>f.store.equip(f.profile.id,'gold'),/not own/);
  for(let i=0;i<3;i++){f.room.roundId=randomUUID();f.award();}
  const before=f.store.view(f.profile.id).coins;f.store.buy(f.profile.id,'desert');assert.equal(f.store.view(f.profile.id).coins,before-200);f.store.buy(f.profile.id,'desert');assert.equal(f.store.view(f.profile.id).coins,before-200);
  assert.equal(f.store.equip(f.profile.id,'desert').equipped,'desert');assert.throws(()=>f.store.buy(f.profile.id,{toString:1}),/Unknown/);assert.throws(()=>f.store.identify('invalid'),/Invalid/);
});
test('save failure rolls back coins, purchases and daily skin awards',()=>{
  const f=fixture({now:()=>0});f.store.players.get(f.profile.id).coins=1000;const before=JSON.stringify(f.store.view(f.profile.id));f.store.save=()=>{throw Error('disk full');};
  assert.throws(()=>f.store.buy(f.profile.id,'gold'),/disk full/);assert.equal(JSON.stringify(f.store.view(f.profile.id)),before);
  assert.throws(()=>f.award(),/disk full/);assert.equal(JSON.stringify(f.store.view(f.profile.id)),before);assert.equal(Object.keys(f.store.players.get(f.profile.id).credited).length,0);
});
test('wallet, inventory and idempotence survive restart and leaderboard reset',t=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-progress-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'player-progress.json'),f=fixture();f.store.file=file;f.award();f.room.roundId=randomUUID();f.award();f.room.roundId=randomUUID();f.award();f.store.buy(f.profile.id,'desert');f.store.equip(f.profile.id,'desert');
  const restored=new Progress(file);assert.equal(restored.identify(f.profile.secret).id,f.profile.id);assert.equal(restored.skinOf(f.profile.id),'desert');assert.equal(restored.record(f.room).size,0);assert.deepEqual(restored.view(f.profile.id),f.store.view(f.profile.id));
  const leaderboard=new Leaderboard(path.join(dir,'leaderboard.json'));leaderboard.record(f.room);leaderboard.reset();leaderboard.save();assert.equal(new Progress(file).skinOf(f.profile.id),'desert');
  assert.equal(fs.readFileSync(file,'utf8').includes(f.profile.secret),false,'only profile hashes are stored');
});
test('unreadable progress fails safely rather than overwriting player purchases',t=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-progress-bad-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'progress.json');fs.writeFileSync(file,'broken');assert.throws(()=>new Progress(file));assert.equal(fs.readFileSync(file,'utf8'),'broken');
});
test('late countdown arrivals enter the same reward roster and departed identities cannot suppress them',()=>{
  const room=new Room('LATE'),host=room.add('Host');room.start(host);const guest=room.add('Guest');assert.equal(room.matchPlayers.get(guest.id),guest);assert.equal(guest.joinedRoundAt,room.roundStarted);
  const f=fixture(),left={...f.p,id:'old',left:true};f.room.matchPlayers=new Map([[left.id,left],[f.p.id,f.p]]);assert.equal(f.award().reward.total,100);assert.equal(f.store.view(f.profile.id).stats.matches,1);
});
test('admin reports aggregate progression without exposing identities or credentials',()=>{
  let now=0;const f=fixture({now:()=>now});f.award();now+=864e5;f.room.roundId=randomUUID();f.award();f.store.buy(f.profile.id,'desert');
  const report=f.store.report();assert.equal(report.profiles,1);assert.equal(report.secondMatch,1);assert.equal(report.nextDay.returned,1);assert.equal(report.firstPurchaseMatches,2);assert.equal(report.skins,1);assert.equal(report.earned,205);assert(!JSON.stringify(report).includes(f.profile.id));assert(!JSON.stringify(report).includes(f.profile.secret));
});
