'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{WebSocket}=require('ws');
const {createGameServer}=require('../server.cjs'),F=require('../shared.js');
async function setup(t,enabled=true){
  const game=createGameServer({vehicleClassesEnabled:enabled,quickSearchSeconds:60});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;
  const action=async body=>{const res=await fetch(base+'/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1'},body:JSON.stringify(body)});return {status:res.status,...await res.json()};};
  const join=async message=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await once(ws,'open');const response=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Join timed out')),3000);ws.on('message',raw=>{const value=JSON.parse(raw);if(['welcome','error'].includes(value.type)){clearTimeout(timeout);resolve(value);}});});ws.send(JSON.stringify(message));return {ws,messages,response:await response};};
  const load=await action({action:'load'});return {game,base,action,join,profile:load.profile};
}
test('host gate, private directory boundary and old-client rejection happen before membership',async t=>{
  const {game,base,join,profile}=await setup(t),msg={type:'join',mode:'create',room:'TEST',profile:profile.secret,settings:{vehicleTest:true}};
  const old=await join(msg);assert.equal(old.response.type,'error');assert.match(old.response.message,/Reload/);assert(!game.rooms.has('TEST'));
  const owner=await join({...msg,vehicleRevision:F.vehicleRevision});assert.equal(owner.response.type,'welcome');const room=game.rooms.get('TEST');assert.equal(room.private,true);assert.equal(room.ruleset,'vehicle-test');assert.deepEqual((await fetch(base+'/rooms').then(r=>r.json())).rooms,[]);
  const guest=await join({type:'join',mode:'join',room:'TEST'});assert.equal(guest.response.type,'error');assert.equal(room.players.size,1);
  owner.ws.close();
});
test('disabled host and Quick Play cannot be turned into class rooms by client fields',async t=>{
  const {game,join,profile,action}=await setup(t,false);await action({action:'vehicle',profile:profile.secret,vehicle:'heavy',health:999,speed:999});
  const normal=await join({type:'join',mode:'create',room:'NORMAL',profile:profile.secret,vehicleRevision:F.vehicleRevision,settings:{vehicleTest:true}});assert.equal(game.rooms.get('NORMAL').ruleset,'standard');assert.equal(game.rooms.get('NORMAL').humans()[0].hp,10);normal.ws.close();
  const quick=await join({type:'quick',vehicleRevision:F.vehicleRevision,settings:{vehicleTest:true}});const room=game.rooms.get(quick.response.room);assert.equal(room.ruleset,'standard');assert.equal(room.players.size,1);quick.ws.close();
});
test('preference authentication and locks survive reconnect; results changes apply only at next countdown',async t=>{
  const {game,join,profile,action}=await setup(t);assert.equal((await action({action:'vehicle',profile:profile.id,vehicle:'heavy'})).status,400);assert.equal((await action({action:'vehicle',profile:profile.secret,vehicle:'bogus'})).status,400);
  await action({action:'vehicle',profile:profile.secret,vehicle:'scout'});const owner=await join({type:'join',mode:'create',room:'LOCK',profile:profile.secret,vehicleRevision:F.vehicleRevision,settings:{vehicleTest:true}}),room=game.rooms.get('LOCK'),p=room.humans()[0];assert.equal(p.vehicle,'scout');assert.equal(p.hp,8);
  const set=vehicle=>action({action:'vehicle',profile:profile.secret,vehicle});assert.equal((await set('heavy')).status,400);room.start(p);assert.equal((await set('heavy')).status,400);room.phase='playing';assert.equal((await set('heavy')).status,400);
  const reconnect=await join({type:'join',room:'LOCK',token:owner.response.token,vehicleRevision:F.vehicleRevision});assert.equal(reconnect.response.id,p.id);assert.equal(p.vehicle,'scout');
  room.phase='results';room.winner={id:p.id};assert.equal((await set('heavy')).status,200);assert.equal(p.vehicle,'scout');assert.equal(p.hp,8);room.beginCountdown();assert.equal(p.vehicle,'heavy');assert.equal(p.hp,12);assert.equal((await set('scout')).status,400);assert.equal(game.progress.vehicleOf(profile.id),'heavy');reconnect.ws.close();
});
test('departed human seats accept saved classes without removing AI; group queue restores Standard',async t=>{
  const {game,join,profile,action}=await setup(t);await action({action:'vehicle',profile:profile.secret,vehicle:'scout'});const a=await join({type:'join',mode:'create',room:'SEATS',profile:profile.secret,vehicleRevision:F.vehicleRevision,settings:{vehicleTest:true}}),room=game.rooms.get('SEATS');
  const second=(await action({action:'load'})).profile;await action({action:'vehicle',profile:second.secret,vehicle:'heavy'});
  const departed=await join({type:'join',mode:'join',room:'SEATS',vehicleRevision:F.vehicleRevision});room.add('',{bot:true});room.add('',{bot:true});room.start(room.humans()[0]);room.phase='playing';const full=await join({type:'join',mode:'join',room:'SEATS',profile:second.secret,vehicleRevision:F.vehicleRevision});assert.match(full.response.message,/full/);assert.equal([...room.players.values()].filter(p=>p.bot).length,2);
  departed.ws.send(JSON.stringify({type:'leave'}));for(let i=0;i<100&&room.players.size===4;i++)await new Promise(r=>setTimeout(r,10));assert.equal(room.players.size,3);departed.ws.close();
  const b=await join({type:'join',mode:'join',room:'SEATS',profile:second.secret,vehicleRevision:F.vehicleRevision});assert.equal(room.players.get(b.response.id).hp,12);
  room.phase='postgame';room.winner={id:a.response.id};room.groupIds=new Set([a.response.id,b.response.id]);a.ws.send(JSON.stringify({type:'requeue',roundId:room.roundId}));
  for(let i=0;i<100&&!a.messages.some(m=>m.requeued);i++)await new Promise(r=>setTimeout(r,10));const moved=a.messages.find(m=>m.requeued);assert(moved);const target=game.rooms.get(moved.room);assert.equal(target.players.size,2);assert([...target.players.values()].every(p=>p.vehicle==='standard'&&p.hp===10));assert.equal(game.progress.vehicleOf(profile.id),'scout');assert.equal(game.progress.vehicleOf(second.id),'heavy');a.ws.close();b.ws.close();
});
