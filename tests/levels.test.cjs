'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Progress}=require('../progress.cjs'),{Room,encodeState}=require('../game-server.cjs'),F=require('../shared.js');
const day=864e5,start=Date.parse('2026-11-16T04:00:00Z');
function fixture(file=null){
  let now=start;const store=new Progress(file,{now:()=>now}),profile=store.identify();store.ensure(profile.id);
  const room=new Room('LEVELS'),p=room.add('Rookie');room.settings={...room.settings};p.profileId=profile.id;p.activeSeconds=12;p.kills=0;p.deaths=1;room.add('',{bot:true});room.roundStarted=0;room.time=90;room.matchPlayers=new Map([[p.id,p]]);room.winner={id:'other'};
  return {store,profile,room,p,time:t=>now=t,win:()=>room.winner={id:p.id},lose:()=>room.winner={id:'other'},award:()=>{room.roundId=randomUUID();return store.record(room).get(p.id);}};
}
test('the level curve starts fast, grows by 40 XP a level and settles at 600',()=>{
  assert.deepEqual([1,2,3,13,14,15,60].map(F.levelNeed),[80,120,160,560,600,600,600]);
  assert.deepEqual(F.levelOf(0),{level:1,into:0,need:80,rank:'Recruit',nextRank:{level:3,name:'Private'}});
  assert.equal(F.levelOf(79).level,1);assert.equal(F.levelOf(80).level,2);assert.equal(F.levelOf(199).level,2);assert.deepEqual(F.levelOf(200),{level:3,into:0,need:160,rank:'Private',nextRank:{level:6,name:'Corporal'}});
  for(const bad of [-5,NaN,undefined,null,'x'])assert.equal(F.levelOf(bad).level,1);
  assert.equal(F.levelOf(1e6).rank,'Field Marshal');assert.equal(F.levelOf(1e6).nextRank,null);
  assert.deepEqual(F.ranks.map(r=>r.level),[...F.ranks.map(r=>r.level)].sort((a,b)=>a-b));assert.equal(F.ranks[0].level,1);
});
test('a first finished match always reaches Level 2; experience follows the published amounts',()=>{
  const f=fixture();let r=f.award();
  assert.deepEqual({...r.reward.xp,before:undefined,after:undefined},{completion:50,victory:0,kills:0,medals:0,streak:0,daily:30,total:80,before:undefined,after:undefined,levelUp:true,promotion:null});
  assert.equal(r.reward.xp.before.level,1);assert.equal(r.reward.xp.after.level,2);assert.equal(r.progress.level.level,2);assert.equal(r.progress.xp,80);
  f.win();f.p.kills=40;f.p.medals={'double-kill':3,'revenge':20,'made-up':99};r=f.award();
  assert.equal(r.reward.xp.kills,F.xp.killCap*F.xp.kill);assert.equal(r.reward.xp.medals,F.xp.medalCap*F.xp.medal,'medal experience is capped');assert.equal(r.reward.xp.daily,0,'first-match bonus once a day');
  assert.equal(r.reward.xp.total,50+40+90+80);assert.deepEqual(r.reward.medals,{'double-kill':3,'revenge':20},'unknown medal IDs are ignored');
  assert.deepEqual(r.progress.stats.medals,{'double-kill':3,'revenge':20});assert.equal(r.reward.xp.promotion,'Private');
});
test('levels never pay coins: the coin breakdown is exactly what it was before levels',()=>{
  const f=fixture();f.win();f.p.kills=3;const r=f.award();
  assert.equal(r.reward.total,20+30+9+20);assert.equal(r.progress.coins,79);assert.equal(r.reward.xp.levelUp,true);
});
test('win streaks add 10 XP per extra win up to four, and reset on a loss or on leaving',()=>{
  const f=fixture();f.win();const streak=[];
  for(let i=0;i<6;i++){const r=f.award();streak.push([r.reward.winStreak,r.reward.xp.streak]);}
  assert.deepEqual(streak,[[1,0],[2,10],[3,20],[4,30],[5,40],[6,40]]);
  f.lose();let r=f.award();assert.equal(r.reward.winStreak,0);assert.equal(r.reward.xp.streak,0);assert.equal(r.progress.stats.bestWinStreak,6);
  f.win();f.award();f.award();assert.equal(f.store.view(f.profile.id).stats.winStreak,2);
  f.p.left=true;r=f.award();assert(r.reward.reason);assert.equal(r.reward.xp,null);assert.equal(r.progress.stats.winStreak,0,'quitting cannot protect a streak');
  f.p.left=false;f.award();f.room.settings={...f.room.settings,targetScore:5};r=f.award();assert.match(r.reward.reason,/Practice/);assert.equal(r.progress.stats.winStreak,1,'practice matches leave the streak alone');
});
test('idle, disconnected, practice and vehicle-test finishes earn no experience',()=>{
  for(const change of [f=>f.p.activeSeconds=0,f=>f.p.connected=false,f=>f.room.settings={...f.room.settings,powers:false},f=>f.room.ruleset='vehicle-test']){
    const f=fixture();f.win();change(f);const r=f.award();assert.equal(r.reward.xp,null);assert.equal(r.progress.xp,0);assert.equal(r.progress.level.level,1);
  }
});
test('stat badges unlock once when a lifetime total is reached, and never unlock from one big match alone',()=>{
  const f=fixture();f.win();f.p.deaths=0;f.p.kills=10;f.p.medals={'double-kill':1,'trick-shot':4};let r=f.award();
  const ids=()=>Object.keys(f.store.view(f.profile.id).achievements).sort();
  assert.deepEqual(ids(),['double-trouble','first-win','flawless']);assert(r.reward.highlights.length<=2);assert.equal(r.reward.highlights[0].id,'first-win');
  f.p.deaths=2;r=f.award();assert(!r.reward.highlights.some(h=>['flawless','double-trouble'].includes(h.id)),'earned badges are not announced twice');
  r=f.award();assert(ids().includes('hot-streak'));assert(ids().includes('trickster'),'12 trick shots across three matches');assert(r.reward.highlights.some(h=>h.id==='hot-streak'||h.id==='trickster'));
  for(let i=0;i<7;i++)f.award();assert(ids().includes('centurion'),'100 kills');assert(!ids().includes('veteran'));
  assert.equal(F.statValue(f.store.view(f.profile.id).stats,'medal:trick-shot'),40);assert.equal(F.statValue({},'matches'),0);assert.equal(F.statValue({},'level',9),9);
});
test('reaching Level 10 unlocks its badge and promotion to Sergeant',()=>{
  const f=fixture();f.win();f.p.kills=15;f.p.medals={'first-blood':1,'double-kill':9};let last;
  for(let i=0;i<40&&f.store.view(f.profile.id).level.level<10;i++){f.time(start+i*day);last=f.award();}
  assert.equal(last.progress.level.level,10);assert.equal(last.reward.xp.promotion,'Sergeant');assert(last.progress.achievements.sergeant);
  assert.equal(last.progress.level.rank,'Sergeant');assert.deepEqual(last.progress.level.nextRank,{level:15,name:'Lieutenant'});
});
test('experience persists, existing players start with experience for past matches, and bad files are refused',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-levels-')),file=path.join(dir,'player-progress.json');
  try{
    const f=fixture(file);f.win();f.p.kills=5;f.award();const saved=f.store.view(f.profile.id);assert.equal(new Progress(file).view(f.profile.id).xp,saved.xp);
    const data=JSON.parse(fs.readFileSync(file,'utf8')),player=data.players[0][1];
    delete player.xp;delete player.stats.medals;delete player.stats.winStreak;player.stats.matches=10;player.stats.wins=4;player.stats.kills=400;player.coins=123;fs.writeFileSync(file,JSON.stringify(data));
    const migrated=new Progress(file).view(f.profile.id);assert.equal(migrated.xp,10*50+4*40+150*6,'kills are capped at 15 a match');assert.equal(migrated.coins,123,'no coins are added');assert.deepEqual(migrated.stats.medals,{});assert.equal(migrated.stats.winStreak,0);
    for(const bad of [-1,1.5,'9']){player.xp=bad;fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>new Progress(file),/Invalid player experience/);}
    player.xp=5;player.stats.medals=[];fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>new Progress(file),/Invalid player experience/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a failed save rolls experience, medals and streaks back with the coins',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-levels-')),file=path.join(dir,'player-progress.json');
  try{
    const f=fixture(file);f.win();f.award();const before=JSON.stringify(f.store.view(f.profile.id));
    f.store.save=()=>{throw Error('Progress could not be saved. Please try again.');};f.p.medals={'revenge':2};
    f.room.roundId=randomUUID();assert.throws(()=>f.store.record(f.room),/could not be saved/);assert.equal(JSON.stringify(f.store.view(f.profile.id)),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('levels and experience stay private in battle snapshots and public summaries',()=>{
  const f=fixture();f.win();f.award();const report=JSON.stringify(f.store.report());assert(!report.includes(f.profile.id));
  f.room.phase='playing';assert(!encodeState(f.room.snapshot()).includes('"xp"'));
});
test('a real server shows levels in the lobby and results, sends private experience and updates the level after a match',async t=>{
  const {once}=require('node:events'),{WebSocket}=require('ws'),{createGameServer}=require('../server.cjs');
  const game=createGameServer();game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;
  const load=await fetch(base+'/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1'},body:JSON.stringify({action:'load'})}).then(r=>r.json());
  assert.deepEqual(load.progress.level,{level:1,into:0,need:80,rank:'Recruit',nextRank:{level:3,name:'Private'}});
  game.progress.players.get(load.profile.id).xp=2160;
  const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));t.after(()=>ws.terminate());await once(ws,'open');
  ws.send(JSON.stringify({type:'join',mode:'create',room:'RANKED',name:'Ann',profile:load.profile.secret}));
  const wait=async find=>{for(let i=0;i<400;i++){const m=messages.find(find);if(m)return m;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out');};
  const welcome=await wait(m=>m.type==='welcome');assert.equal(welcome.progress.level.level,10);
  assert.equal((await wait(m=>m.type==='state'&&m.phase==='waiting')).players[0].level,10);
  const room=game.rooms.get('RANKED'),human=room.humans()[0];room.botCommand(human,{action:'add'});room.start(human);room.step(3.1);
  const bot=[...room.players.values()].find(p=>p.bot);human.activeSeconds=20;human.kills=9;human.shieldUntil=0;bot.shieldUntil=0;bot.hp=1;room.damage(bot,human.id,1,true);
  const result=await wait(m=>m.type==='result'&&m.reward);
  assert.equal(result.reward.xp.total,50+40+60+16+30);assert.deepEqual(result.reward.medals,{'first-blood':1,'trick-shot':1});assert.equal(result.progress.xp,2160+196);
  const ended=await wait(m=>m.type==='state'&&m.phase==='results');const me=ended.players.find(p=>p.id===welcome.id);
  assert.deepEqual(me.medals,{'first-blood':1,'trick-shot':1});assert.equal(me.level,10);assert.equal(ended.players.find(p=>p.bot).level,undefined,'AI tanks have no level');
  const others=JSON.stringify(ended);assert(!others.includes('"xp"'));assert(!others.includes(load.profile.secret));
});
