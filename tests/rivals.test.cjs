'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{once}=require('node:events');
const {Progress}=require('../progress.cjs'),{Leaderboard,periodStart}=require('../leaderboard.cjs'),{Room,encodeState}=require('../game-server.cjs'),F=require('../shared.js');
const day=864e5;
// A finished match between named humans (and one AI), all with saved profiles.
function match(store,names,{mode='ffa'}={}){
  const room=new Room('RIVALS',{mode}),players=names.map(name=>{const p=room.add(name),profile=store.profiles?.[name]||store.identify();(store.profiles??={})[name]=profile;store.ensure(profile.id);p.profileId=profile.id;p.activeSeconds=12;return p;});
  room.settings={...room.settings};if(names.length<4)room.add('',{bot:true});room.roundStarted=0;room.time=90;room.matchPlayers=new Map(players.map(p=>[p.id,p]));
  const finish=winner=>{room.roundId=randomUUID();room.winner=mode==='teams'?{team:winner.team}:{id:winner.id};return store.record(room);};
  return {room,players,finish,view:name=>store.view(store.profiles[name].id)};
}
test('head-to-head records count wins, losses and who destroyed whom, from each side',()=>{
  const store=new Progress(),m=match(store,['Ann','Bo','Cy']),[a,b,c]=m.players;
  a.killsOn={[b.id]:4,[c.id]:2};b.killsOn={[a.id]:3};let rewards=m.finish(a);
  assert.deepEqual(m.view('Ann').rivals.find(r=>r.name==='Bo'),{name:'Bo',matches:1,wins:1,losses:0,allied:0,kills:4,deaths:3});
  assert.deepEqual(m.view('Bo').rivals.find(r=>r.name==='Ann'),{name:'Ann',matches:1,wins:0,losses:1,allied:0,kills:3,deaths:4});
  assert.deepEqual(m.view('Cy').rivals.find(r=>r.name==='Bo'),{name:'Bo',matches:1,wins:0,losses:0,allied:0,kills:0,deaths:0},'neither won: no win or loss between them');
  assert.deepEqual(rewards.get(a.id).reward.rivals.map(r=>r.name).sort(),['Bo','Cy']);
  a.killsOn={[b.id]:1};b.killsOn={};rewards=m.finish(b);
  assert.deepEqual(m.view('Ann').rivals.find(r=>r.name==='Bo'),{name:'Bo',matches:2,wins:1,losses:1,allied:0,kills:5,deaths:3});
  assert.equal(rewards.get(b.id).reward.rivals.find(r=>r.name==='Ann').wins,1);
  assert.equal(m.finish.length,1);assert.equal(store.record(m.room).size,0,'the same round is never counted twice');assert.equal(m.view('Ann').rivals.find(r=>r.name==='Bo').matches,2);
});
test('AI tanks, players who left and vehicle tests are not rivals; custom rules still count between friends',()=>{
  const store=new Progress(),m=match(store,['Ann','Bo','Cy']),[a,b,c]=m.players;
  m.room.matchPlayers.set(c.id,{...c,left:true});m.finish(a);
  assert.deepEqual(m.view('Ann').rivals.map(r=>r.name),['Bo']);assert.deepEqual(m.view('Cy').rivals,[],'leaving records nothing for the leaver');
  assert(!JSON.stringify(m.view('Ann').rivals).includes('CopperFox'));
  const test=match(store,['Ann','Bo']);test.room.ruleset='vehicle-test';test.finish(test.players[0]);assert.equal(test.view('Ann').rivals.find(r=>r.name==='Bo').matches,1);
  const custom=match(store,['Ann','Bo']);custom.room.settings={...custom.room.settings,targetScore:5};const r=custom.finish(custom.players[1]);
  assert.match(r.get(custom.players[0].id).reward.reason,/Practice/);assert.equal(custom.view('Ann').rivals.find(r=>r.name==='Bo').matches,2);assert.equal(custom.view('Ann').rivals.find(r=>r.name==='Bo').losses,1);
});
test('team mates are counted as allies, opponents as wins and losses',()=>{
  const store=new Progress(),m=match(store,['Ann','Bo','Cy','Di'],{mode:'teams'}),[a,b,c,d]=m.players;
  assert.equal(a.team,c.team);assert.equal(b.team,d.team);a.killsOn={[b.id]:2,[d.id]:1};m.finish(a);
  assert.deepEqual(m.view('Ann').rivals.find(r=>r.name==='Cy'),{name:'Cy',matches:1,wins:0,losses:0,allied:1,kills:0,deaths:0});
  assert.deepEqual(m.view('Ann').rivals.find(r=>r.name==='Bo'),{name:'Bo',matches:1,wins:1,losses:0,allied:0,kills:2,deaths:0});
  assert.equal(m.view('Di').rivals.find(r=>r.name==='Cy').losses,1);
});
test('a renamed rival keeps one record under the newest name, and only the 30 most recent rivals are kept',()=>{
  let now=1e12;const store=new Progress(null,{now:()=>now}),m=match(store,['Ann','Bo']);m.finish(m.players[0]);
  m.players[1].name='Bobby';m.finish(m.players[0]);assert.deepEqual(m.view('Ann').rivals.map(r=>[r.name,r.matches]),[['Bobby',2]]);
  for(let i=0;i<35;i++){now+=1000;const other=match(store,['Ann','P'+i]);other.finish(other.players[0]);}
  const ann=store.players.get(store.profiles.Ann.id);assert.equal(Object.keys(ann.rivals).length,F.rivalLimit);assert(!Object.values(ann.rivals).some(r=>r.name==='Bobby'),'the oldest rival dropped out');
  assert.equal(m.view('Ann').rivals.length,10,'the player sees the ten met most');assert(!JSON.stringify(m.view('Ann').rivals).includes(store.profiles.P34.id),'rival profile IDs stay private');
});
test('real kills are tracked per opponent and reset each round',()=>{
  const room=new Room('PAIRS'),a=room.add('Ann'),b=room.add('Bo'),c=room.add('Cy');room.start(a);room.step(3.1);
  const kill=(attacker,victim)=>{victim.hp=1;victim.shieldUntil=0;room.damage(victim,attacker.id,1);victim.hp=10;victim.respawnAt=0;};
  kill(a,b);kill(a,b);kill(a,c);kill(b,a);assert.deepEqual(a.killsOn,{[b.id]:2,[c.id]:1});assert.deepEqual(b.killsOn,{[a.id]:1});
  assert(!encodeState(room.snapshot()).includes('killsOn'));room.resetRound();assert.deepEqual(a.killsOn,{});
});
// ---- Weekly champion ----
function board(now){
  const lb=new Leaderboard(null,()=>now.t),ids={};
  const play=(winner,others,kills=10)=>{const room=new Room('WEEK'),players=[winner,...others].map(name=>{const p=room.add(name);p.profileId=ids[name]??=lb.identify().id;return p;});players[0].kills=kills;room.roundId=randomUUID();room.matchPlayers=new Map(players.map(p=>[p.id,p]));room.winner={id:players[0].id};lb.record(room);};
  return {lb,ids,play};
}
test('last week’s number one is this week’s champion; nobody is champion without a win last week',()=>{
  const monday=periodStart('week',Date.parse('2026-11-18T04:00:00Z')),now={t:monday-3*day},{lb,ids,play}=board(now);
  assert.equal(lb.champion(),null);
  play('Ann',['Bo']);play('Ann',['Bo']);play('Bo',['Ann']);assert.equal(lb.champion(),null,'this week’s leader is not champion yet');
  now.t=monday+1000;assert.deepEqual(lb.champion(),{profileId:ids.Ann,name:'Ann',slot:1,wins:2,kills:20,skin:'classic'},'the tank colour is the one she last played');
  play('Bo',['Ann']);play('Bo',['Ann']);play('Bo',['Ann']);assert.equal(lb.champion().profileId,ids.Ann,'this week’s results do not change the crown');
  now.t=monday+7*day+1000;assert.equal(lb.champion().profileId,ids.Bo);assert.equal(lb.champion().wins,3);
  now.t=monday+14*day+1000;assert.equal(lb.champion(),null,'an empty week has no champion');
});
test('ties break like the leaderboard, vehicle tests and removed names do not count, and the skin follows the Garage',()=>{
  const monday=periodStart('week',Date.parse('2026-11-18T04:00:00Z')),now={t:monday-2*day},{lb,ids,play}=board(now);
  play('Ann',['Bo'],5);play('Bo',['Ann'],9);now.t=monday+1;assert.equal(lb.champion().name,'Bo','same wins: more kills');
  lb.skinOf=id=>id===ids.Bo?'gold':'classic';assert.equal(lb.champion().skin,'gold');
  assert.equal(lb.remove('Bo'),true);assert.equal(lb.champion().name,'Ann','removing a name passes the crown on');
  lb.reset();assert.equal(lb.champion(),null);
  const other=board({t:monday-2*day});const room=new Room('TEST',{vehicleTest:true}),p=room.add('Ann');p.profileId=other.lb.identify().id;room.roundId=randomUUID();room.winner={id:p.id};other.lb.record(room);other.lb.now=()=>monday+1;assert.equal(other.lb.champion(),null);
});
test('a real server marks the champion with a crown for everyone, reports it on the leaderboard and awards the badge',async t=>{
  const {WebSocket}=require('ws'),{createGameServer}=require('../server.cjs');
  const game=createGameServer();game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;
  const load=()=>fetch(base+'/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1'},body:JSON.stringify({action:'load'})}).then(r=>r.json());
  const ann=await load(),bo=await load();
  // Ann won twice last week.
  const lastWeek=periodStart('week')-2*day,real=game.leaderboard.now;game.leaderboard.now=()=>lastWeek;
  for(let i=0;i<2;i++){const room=new Room('OLD'),p=room.add('Ann'),q=room.add('Bo');p.profileId=ann.profile.id;q.profileId=bo.profile.id;p.kills=10;room.roundId=randomUUID();room.matchPlayers=new Map([[p.id,p],[q.id,q]]);room.winner={id:p.id};game.leaderboard.record(room);}
  game.leaderboard.now=real;
  const board=await fetch(base+'/leaderboard?period=week').then(r=>r.json());assert.deepEqual(board.champion,{name:'Ann',slot:0,skin:'classic',wins:2,kills:20});assert(!JSON.stringify(board.champion).includes(ann.profile.id));
  const join=async(profile,name,mode)=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));t.after(()=>ws.terminate());await once(ws,'open');ws.send(JSON.stringify({type:'join',mode,room:'CROWN',name,profile:profile.secret}));return {ws,messages,wait:async find=>{for(let i=0;i<400;i++){const m=messages.findLast(find);if(m)return m;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out');}};};
  const a=await join(ann.profile,'Ann','create');const aw=await a.wait(m=>m.type==='welcome');const b=await join(bo.profile,'Bo','join');await b.wait(m=>m.type==='welcome');
  const lobby=await b.wait(m=>m.type==='state'&&m.players.length===2);assert.equal(lobby.players.find(p=>p.name==='Ann').crown,true);assert.equal(lobby.players.find(p=>p.name==='Bo').crown,undefined,'no field for everyone else');
  const room=game.rooms.get('CROWN'),[pa,pb]=room.humans();room.start(pa);room.step(3.1);
  assert.equal(JSON.parse(encodeState(room.snapshot())).players.find(p=>p.id===pa.id).crown,true,'the crown shows in battle too');
  pa.activeSeconds=pb.activeSeconds=20;pa.kills=9;pa.shieldUntil=0;pb.shieldUntil=0;pb.hp=1;room.damage(pb,pa.id,1);
  const result=await a.wait(m=>m.type==='result'&&m.reward);assert(result.progress.achievements.champion,'badge for playing as champion');
  assert.deepEqual(result.reward.rivals,[{name:'Bo',matches:1,wins:1,losses:0,allied:0,kills:1,deaths:0}]);
  const other=await b.wait(m=>m.type==='result'&&m.reward);assert.equal(other.progress.achievements.champion,undefined);assert.deepEqual(other.progress.rivals,[{name:'Ann',matches:1,wins:0,losses:1,allied:0,kills:0,deaths:1}]);
  assert(Array.isArray(result.progress.missions.missions)&&result.progress.missions.missions.length===3);assert.equal(aw.progress.missions.missions.length,3);
});
