'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),WebSocket=require('ws');
const {Room,encodeState}=require('../game-server.cjs'),{createGameServer}=require('../server.cjs'),F=require('../shared.js');
const input=(seq,extra={})=>({seq,x:0,y:0,aimX:800,aimY:500,fire:false,...extra});
test('searching is a warm-up: tanks drive and shoot, but nothing is damaged, collected or counted',()=>{
  const room=new Room('WARM');room.configureQuick(12,5);const a=room.add('Ann'),b=room.add('Bo');room.map={...room.map,walls:[]};
  a.x=400;a.y=500;b.x=700;b.y=500;const health=b.hp;
  room.setInput(a,input(1,{x:1}));for(let i=0;i<60;i++)room.step(1/120);assert(a.x>400+F.vehicleOf('standard').speed*.45,'the tank drove');
  room.setInput(a,input(2,{aimX:700,aimY:500,fire:true}));for(let i=0;i<5;i++)room.step(1/120);assert.equal(room.shells.length,1,'the tank fired');
  for(let i=0;i<240&&room.shells.length;i++)room.step(1/120);
  assert.equal(b.hp,health,'no damage in the warm-up');assert.equal(a.kills,0);assert.equal(a.hits,0);assert.equal(a.damageDealt,0);assert.equal(room.winner,null);assert.equal(room.pickups.length,0);
  room.step(8);assert.equal(room.pickups.length,0,'no pickups appear while searching');assert.equal(room.phase,'searching');
  assert.equal(JSON.parse(encodeState(room.snapshot())).players.find(p=>p.id===a.id).kills,0);
});
test('the line-up ends the warm-up cleanly and the battle starts from fresh spawns and statistics',()=>{
  const room=new Room('WARM');room.configureQuick(2,5);const a=room.add('Ann');room.map={...room.map,walls:[]};a.x=800;a.y=500;
  room.setInput(a,input(1,{x:1,fire:true}));for(let i=0;i<120;i++)room.step(1/120);assert(a.shots>0);assert(room.shells.length>0);
  for(let i=0;i<125;i++)room.step(1/120);assert.equal(room.phase,'ready');assert.equal(room.shells.length,0,'warm-up shells are cleared');assert.equal(room.players.size,4);
  const x=a.x;room.setInput(a,input(2,{x:1,fire:true}));for(let i=0;i<30;i++)room.step(1/120);assert.equal(a.x,x,'no driving during the line-up');assert.equal(room.shells.length,0);
  room.ready(a);assert.equal(room.phase,'countdown');assert.equal(a.shots,0);assert.equal(a.activeSeconds,0);assert(room.map.spawns.some(([sx,sy])=>sx===a.x&&sy===a.y),'everyone starts from a spawn');
  for(const p of room.players.values())assert.equal(p.hp,F.vehicleOf(p.vehicle).health);
});
test('friend lobbies, countdowns and results still ignore the controls',()=>{
  const room=new Room('LOBBY'),a=room.add('Ann');room.add('Bo');const x=a.x;
  room.setInput(a,input(1,{x:1,fire:true}));room.step(.5);assert.equal(a.x,x);assert.equal(room.shells.length,0);
  room.start(a);room.setInput(a,input(2,{x:1,fire:true}));room.step(1);assert.equal(room.phase,'countdown');assert.equal(room.shells.length,0);
});
// The real server: who gets an instant first match.
async function setup(t,options){const game=createGameServer(options);game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());return {game,url:'ws://127.0.0.1:'+game.server.address().port+'/ws'};}
async function quick(url,profile){
  const ws=new WebSocket(url,{headers:{origin:url.replace('ws:','http:').replace('/ws','')}}),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await once(ws,'open');
  ws.send(JSON.stringify({type:'quick',name:'Guest',profile,settings:{mode:'ffa'}}));while(messages.filter(m=>m.type==='state').length<1)await once(ws,'message');
  return {ws,welcome:messages.find(m=>m.type==='welcome'),state:messages.find(m=>m.type==='state')};
}
test('a brand-new player searching alone starts at once against three AI tanks',async t=>{
  const {game,url}=await setup(t),a=await quick(url);t.after(()=>a.ws.close());
  assert.equal(a.state.phase,'countdown','the first snapshot is already the countdown');assert.equal(a.state.quick,true);assert.equal(a.state.players.length,4);assert.equal(a.state.players.filter(p=>p.bot).length,3);
  const room=game.rooms.get(a.welcome.room);assert.equal(room.botSkill,'easy');assert.equal(room.matchPlayers.size,1);
  // A second newcomer a moment later cannot land in that locked match and gets their own.
  const b=await quick(url);t.after(()=>b.ws.close());assert.notEqual(b.welcome.room,a.welcome.room);assert.equal(b.state.phase,'countdown');
});
test('a newcomer joins people who are already searching, and returning players queue as before',async t=>{
  const {game,url}=await setup(t);
  // Someone who has finished a match before: recorded on the leaderboard.
  const veteran=game.leaderboard.identify(''),past=new Room('PAST'),p=past.add('Vet');p.profileId=veteran.id;past.roundId='r1';past.matchPlayers=new Map([[p.id,p]]);past.winner={id:p.id};game.leaderboard.record(past);
  assert.equal(game.leaderboard.known(veteran.id),true);
  const a=await quick(url,veteran.secret);t.after(()=>a.ws.close());assert.equal(a.state.phase,'searching');assert.equal(a.state.players.length,1);
  const b=await quick(url);t.after(()=>b.ws.close());assert.equal(b.welcome.room,a.welcome.room,'the newcomer joins the waiting human');assert.equal(b.state.phase,'searching');assert.equal(b.state.players.length,2);
});
test('the host can keep the ordinary queue for everyone',async t=>{
  const {url}=await setup(t,{quickFirstMatch:false}),a=await quick(url);t.after(()=>a.ws.close());assert.equal(a.state.phase,'searching');
});
test('a finished standard match in the progress file also ends newcomer status',()=>{
  const {Progress}=require('../progress.cjs'),{randomUUID}=require('node:crypto'),store=new Progress(null),profile=store.identify();store.ensure(profile.id);assert.equal(store.played(profile.id),false);assert.equal(store.played('unknown'),false);
  const room=new Room('DONE'),p=room.add('Rookie');room.settings={...room.settings};p.profileId=profile.id;p.activeSeconds=12;room.add('',{bot:true});room.roundStarted=0;room.time=90;room.matchPlayers=new Map([[p.id,p]]);room.winner={id:'other'};room.roundId=randomUUID();
  store.record(room);assert.equal(store.played(profile.id),true);
});
