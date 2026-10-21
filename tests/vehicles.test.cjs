'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os={tmpdir:()=>__dirname};
const F=require('../shared.js'),{Room}=require('../game-server.cjs'),{Progress}=require('../progress.cjs'),{Leaderboard}=require('../leaderboard.cjs'),{generateMap}=require('../map-generator.cjs');
function arena(vehicle='standard',options={}){const room=new Room('PILOT',{vehicleTest:true,...options});room.map.walls=[];const p=room.add('Pilot',{vehicle,profileId:'a'.repeat(64)});room.phase='playing';room.nextPickup=Infinity;p.shieldUntil=0;return {room,p};}
test('classes are immutable, unknown preferences fall back and ordinary rooms force Standard',()=>{
  assert(Object.isFrozen(F.vehicles));for(const v of F.vehicles)assert(Object.isFrozen(v));
  for(const vehicle of [undefined,'invalid',{},'scout','heavy']){const r=new Room('NORMAL'),p=r.add('A',{vehicle});assert.equal(p.vehicle,'standard');assert.equal(p.hp,10);assert.equal(r.snapshot().players[0].vehicle,undefined);}
  assert.equal(arena('unknown').p.vehicle,'standard');
});
test('every class has its own spawn and Restore capacity while keeping the current power',()=>{
  for(const v of F.vehicles){const {room,p}=arena(v.id);assert.equal(p.hp,v.health);p.hp=1;p.power='laser';p.powerUntil=10;room.pickups=[{id:1,type:'restore',x:p.x,y:p.y,expiresAt:20}];room.step(1/120);assert.equal(p.hp,v.health);assert.equal(p.power,'laser');p.hp=0;room.spawn(p);assert.equal(p.hp,v.health);assert.equal(p.power,null);}
});
test('normal and boosted movement use class speed with identical bounds',()=>{
  for(const v of F.vehicles)for(const boost of [false,true]){const {room,p}=arena(v.id);p.x=500;p.y=500;p.input={x:1,y:0,aimX:800,aimY:500,fire:false};if(boost){p.power='speed';p.powerUntil=10;}room.step(.1);assert(Math.abs(p.x-500-v.speed*(boost?1.6:1)*.1)<1e-9);assert(room.blocked(25,500,p));assert(!room.blocked(27,500,p));}
});
test('reload trade-off applies to all weapons and Double retains parallel shell damage',()=>{
  for(const v of F.vehicles)for(const power of [null,'double','machine','laser']){const {room,p}=arena(v.id);p.power=power;p.powerUntil=10;p.cool=0;room.fire(p);const expected=(power==='machine'?.12:power==='laser'?.8:.42)*v.reload/.42;assert(Math.abs(p.cool-expected)<1e-12);assert.equal(p.shots,power==='double'?2:1);const shots=p.shots;room.fire(p);assert.equal(p.shots,shots);assert.equal(room.shells.length,power==='laser'?0:power==='double'?2:1);}
});
test('class health gives exact shell and laser thresholds, same protection and team rules',()=>{
  for(const v of F.vehicles)for(const damage of [1,4]){const {room,p}=arena(v.id,{mode:'teams'}),enemy=room.add('Enemy'),friend=room.add('Friend');room.damage(p,friend.id,damage);assert.equal(p.hp,v.health);p.power='immortal';p.powerUntil=5;room.damage(p,enemy.id,damage);assert.equal(p.hp,v.health);p.power=null;let hits=0;while(p.hp>0){room.damage(p,enemy.id,damage);hits++;}assert.equal(hits,Math.ceil(v.health/damage));assert.equal(p.respawnAt,room.time+3);}
});
test('round boundaries resolve preferences; respawn, rule edits and snapshots keep actual class',()=>{
  const {room,p}=arena('scout');let pref='scout';room.vehiclePreference=()=>pref;pref='heavy';room.spawn(p);assert.equal(p.vehicle,'scout');room.phase='waiting';room.ownerId=p.id;room.roomCommand(p,{action:'rules',settings:{mode:'teams'},private:false});assert.equal(room.private,true);assert.equal(room.ruleset,'vehicle-test');room.beginCountdown();assert.equal(p.vehicle,'heavy');assert.equal(p.hp,12);const s=room.snapshot();assert.equal(s.ruleset,'vehicle-test');assert.equal(s.balanceRevision,F.vehicleRevision);assert.equal(s.players[0].vehicle,'heavy');assert.equal(s.players[0].vehicleStats,undefined);assert.equal(s.players[0].profileId,undefined);
});
test('bots rotate classes independently of difficulty and remain bounded across maps and modes',()=>{
  for(const layout of ['quarry','crossroads'])for(const mode of ['ffa','teams'])for(const skill of ['easy','normal','hard']){const r=new Room('BOTS',{vehicleTest:true,mode,targetScore:50});r.map=generateMap(84,layout);r.botSkill=skill;for(let i=0;i<4;i++)r.add('',{bot:true});assert.deepEqual([...r.players.values()].map(p=>p.vehicle),['standard','scout','heavy','standard']);r.beginCountdown();for(let i=0;i<1800;i++)r.step(1/120);for(const p of r.players.values()){assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.x>=26&&p.y>=26&&p.x<=F.width-26&&p.y<=F.height-26);assert(p.hp<=F.vehicleOf(p.vehicle).health);}assert(r.shells.length<=F.maxShells);}
});
test('vehicle preference survives recovery, defaults for older profiles and rolls back failed saves',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tf-vehicle-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'progress.json'),progress=new Progress(file),id=progress.identify().id;progress.ensure(id);assert.equal(progress.view(id).selectedVehicle,'standard');progress.selectVehicle(id,'scout');assert.equal(new Progress(file).view(id).selectedVehicle,'scout');assert.equal(progress.view(id).coins,0);assert.deepEqual(progress.view(id).owned,['classic']);assert.throws(()=>progress.selectVehicle(id,'invalid'),/Unknown/);progress.save=()=>{throw Error('storage failed');};assert.throws(()=>progress.selectVehicle(id,'heavy'));assert.equal(progress.view(id).selectedVehicle,'scout');
});
test('test rounds save tagged admin history but never rankings, adaptation or progression',()=>{
  const {room,p}=arena('heavy'),progress=new Progress(),board=new Leaderboard();progress.ensure(p.profileId);const bot=room.add('',{bot:true});p.kills=10;p.activeSeconds=20;room.time=60;room.roundStarted=3;room.winner={id:p.id};
  for(let i=0;i<4;i++){room.roundId='vehicle-'+i;const results=board.record(room);assert.equal(results.get(p.id).ruleset,'vehicle-test');assert.equal(results.get(p.id).after,null);assert.equal(progress.record(room).get(p.id).reward.total,0);}
  assert.equal(board.entries.size,0);for(const period of ['day','week','month','all'])assert.deepEqual(board.rows(period),[]);assert.equal(board.skill([p]),'easy');assert.equal(board.matches.length,4);const history=board.history().matches[0];assert.equal(history.ruleset,'vehicle-test');assert.equal(history.balanceRevision,F.vehicleRevision);assert.equal(history.mapLayout,room.map.layout);assert.equal(history.players.find(t=>t.name===p.name).vehicle,'heavy');assert.equal(history.players.find(t=>t.name===bot.name).vehicle,bot.vehicle);
  const view=progress.view(p.profileId);assert.equal(view.stats.matches,0);assert.equal(view.stats.bestKills,0);assert.equal(view.daily.step,0);assert.deepEqual(view.achievements,{});assert(view.weekly.challenges.every(c=>c.progress===0));assert.equal(progress.report().played,0);
});
test('test rounds preserve existing rank totals and cannot change difficulty after reload',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tf-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'board.json'),board=new Leaderboard(file),{room,p}=arena('heavy');room.ruleset='standard';room.winner={id:p.id};room.roundId='normal';p.kills=2;board.record(room);const before=JSON.stringify(board.rows('all'));room.ruleset='vehicle-test';room.roundId='test';p.kills=100;board.record(room);board.save();const restored=new Leaderboard(file);assert.equal(JSON.stringify(restored.rows('all')),before);assert.equal(restored.rows('week')[0].kills,2);assert.equal(restored.history().matches[0].ruleset,'vehicle-test');assert.equal(restored.skill([p]),'easy');
});
