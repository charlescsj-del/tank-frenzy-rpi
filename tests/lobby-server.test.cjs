'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const vm=require('node:vm');

// Exercise the production HTTP and WebSocket handlers without opening OS sockets.
function server(options={}){
  class Socket extends EventEmitter{
    readyState=1;bufferedAmount=0;messages=[];
    send(raw){this.messages.push(JSON.parse(raw));}
    close(){this.readyState=3;this.emit('close');}
    terminate(){this.close();}
  }
  class WSS extends EventEmitter{clients=new Set();close(cb){cb();}}
  const intervals=[];
  const sandbox={module:{exports:{}},__dirname:require('node:path').resolve(__dirname,'..'),URL,performance,process,Buffer,
    setInterval(fn){intervals.push(fn);},clearInterval(){},setTimeout(){},clearTimeout(){},
    require(name){
      if(name==='node:http')return {createServer(handler){const http=new EventEmitter();http.on('request',handler);http.close=cb=>cb();return http;}};
      if(name==='ws')return {WebSocketServer:WSS,WebSocket:{OPEN:1}};
      if(name.startsWith('./'))return require('../'+name.slice(2));
      return require(name);
    }};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../server.cjs'),'utf8'),sandbox);
  const game=sandbox.module.exports.createGameServer(options);
  function join(room,mode,name='Player',token,settings){const socket=new Socket();game.wss.emit('connection',socket);socket.emit('message',JSON.stringify({type:'join',room,mode,name,token,settings}));return socket;}
  function list(){let body,headers={};game.server.emit('request',{url:'/rooms',method:'GET'},{setHeader(k,v){headers[k]=v;},end(raw){body=JSON.parse(raw);}});return {body,headers};}
  function read(url,{method='GET',headers:requestHeaders={}}={}){return new Promise((resolve,reject)=>{
    const {Writable}=require('node:stream'),chunks=[],headers={};let status=200;
    const response=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
    response.setHeader=(key,value)=>{headers[key]=value;};response.writeHead=(code,extra={})=>{status=code;Object.assign(headers,extra);};
    response.on('finish',()=>resolve({status,headers,body:Buffer.concat(chunks)}));response.on('error',reject);
    game.server.emit('request',{url,method,headers:requestHeaders},response);
  });}
  function connect(){const socket=new Socket();game.wss.emit('connection',socket);return socket;}
  function watch(room,pass){const socket=connect();socket.emit('message',JSON.stringify({type:'spectate',room,pass}));return socket;}
  // Runs the 60 Hz loop once; snapshots and housekeeping happen every second call.
  const tick=()=>intervals[0]();
  return {game,join,list,read,watch,connect,tick};
}

function finishedGroup({mode='ffa',count=3}={}){
  const s=server(),sockets=Array.from({length:count},(_,i)=>s.join('GROUP',i?'join':'create','Human'+i,undefined,{mode})),room=s.game.rooms.get('GROUP');
  while(room.players.size<4)room.add('',{bot:true});const players=room.humans();room.start(players[0]);room.step(3);for(const p of players)p.activeSeconds=15;players[0].kills=9;if(mode==='teams')room.teamScores[players[0].team]=9;
  const victim=[...room.players.values()].find(p=>p!==players[0]&&(mode!=='teams'||p.team!==players[0].team));victim.shieldUntil=0;room.damage(victim,players[0].id,10);room.step(21);
  const message=(i,type,extra={})=>sockets[i].emit('message',JSON.stringify({type,roundId:room.roundId,...extra})),opt=(...indices)=>indices.forEach(i=>message(i,'group',{joined:true}));
  return {...s,sockets,room,players,message,opt,welcome:ws=>ws.messages.filter(m=>m.type==='welcome').at(-1)};
}

test('postgame group consent is explicit, round-bound, revocable and never counts bots',()=>{
  const f=finishedGroup(),outsider=f.connect();outsider.emit('message',JSON.stringify({type:'group',roundId:f.room.roundId,joined:true}));assert.deepEqual(f.room.snapshot().groupIds,[]);
  for(const extra of [{roundId:'older',joined:true},{joined:'yes'},{joined:{toString:1}},{roundId:{toString:1},joined:true}])f.message(0,'group',extra);assert.deepEqual(f.room.snapshot().groupIds,[]);
  f.message(0,'group',{joined:true,player:f.players[1].id});assert.deepEqual(f.room.snapshot().groupIds,[f.players[0].id],'a caller can only opt themselves in');f.message(0,'group',{joined:false});assert.deepEqual(f.room.snapshot().groupIds,[]);
  const bot=[...f.room.players.values()].find(p=>p.bot);assert.equal(f.room.groupConsent(bot,{roundId:f.room.roundId,joined:true}),false);assert.equal(f.room.groupConsent({...f.players[0]},{roundId:f.room.roundId,joined:true}),false);
  f.room.phase='results';f.opt(0,1);assert.deepEqual([...(f.room.groupIds||[])],[]);assert.equal(f.room.snapshot().groupIds,undefined);f.room.phase='postgame';f.opt(0,1,2);assert.equal(f.room.phase,'postgame','consenting never starts a search on its own');assert.equal(f.room.winner.id,f.players[0].id);
  f.room.resetRound();assert.equal(f.room.groupIds.size,0);
});

test('group requeue atomically moves only consenting humans and preserves everyone else’s results and AI',()=>{
  for(const mode of ['ffa','teams']){
    const f=finishedGroup({mode}),before=f.players.map(p=>({id:p.id,kills:p.kills})),bot=[...f.room.players.values()].find(p=>p.bot),coins=f.game.progress.view(f.players[0].profileId).coins;
    f.opt(0,1);f.message(0,'requeue');const a=f.welcome(f.sockets[0]),b=f.welcome(f.sockets[1]),target=f.game.rooms.get(a.room);assert.notEqual(a.room,f.room.code);assert.equal(a.room,b.room);assert.equal(a.requeued,true);assert.equal(target.settings.mode,mode);assert.equal(target.phase,'searching');assert.equal(target.humans().length,2);assert(target.humans().every(p=>p.kills===0));assert.equal(target.private,false);
    assert.equal(a.profile.id,f.players[0].profileId);assert.equal(a.token,f.sockets[0].messages.find(m=>m.type==='welcome').token);assert.equal(f.welcome(f.sockets[2]).room,f.room.code);assert.equal(f.room.phase,'postgame');assert.equal(f.room.winner.id,before[0].id);assert(f.room.players.has(bot.id));assert.equal(f.players[2].kills,before[2].kills);assert.equal(f.room.players.size,2);assert.equal(f.game.progress.view(f.players[0].profileId).coins,coins,'moving groups never awards a second result');
    const size=f.game.rooms.size;f.message(0,'requeue');assert.equal(f.game.rooms.size,size,'a duplicate old-round request cannot move the group again');assert(!JSON.stringify(target.snapshot()).includes(a.profile.secret));assert.equal(target.snapshot().groupIds,undefined);
    target.step(12.1);assert.equal(target.phase,'ready');assert.equal(target.players.size,4);assert.equal(target.humans().length,2);for(const p of target.humans())target.ready(p);assert.equal(target.phase,'countdown');
  }
});

test('a group joins one matching search only if every member fits; locked AI groups are never displaced',()=>{
  for(const queued of [2,3]){
    const f=finishedGroup(),others=Array.from({length:queued},()=>{const ws=f.connect();ws.emit('message',JSON.stringify({type:'quick'}));return ws;}),waiting=f.game.rooms.get(f.welcome(others[0]).room),oldIds=[...waiting.players.keys()];
    f.opt(0,1);f.message(1,'requeue');const target=f.game.rooms.get(f.welcome(f.sockets[0]).room);assert.equal(f.welcome(f.sockets[1]).room,target.code);assert.equal(target===waiting,queued===2);assert(oldIds.every(id=>waiting.players.has(id)));assert.equal(waiting.players.size,queued===2?4:3);
  }
  const f=finishedGroup(),ws=f.connect();ws.emit('message',JSON.stringify({type:'quick'}));const locked=f.game.rooms.get(f.welcome(ws).room);locked.step(13);const ids=[...locked.players.keys()];f.opt(0,1);f.message(0,'requeue');assert.notEqual(f.welcome(f.sockets[0]).room,locked.code);assert.deepEqual([...locked.players.keys()],ids);
});

test('withdrawals and disconnects clear consent; consent is not silently restored by reconnecting',()=>{
  const f=finishedGroup(),original=f.welcome(f.sockets[1]);f.opt(0,1,2);f.message(2,'group',{joined:false});f.sockets[1].close();assert.deepEqual(f.room.snapshot().groupIds,[f.players[0].id]);
  f.message(0,'requeue');assert.equal(f.sockets[0].messages.at(-1).type,'queue-error');assert.equal(f.sockets[0].readyState,1);assert.equal(f.welcome(f.sockets[0]).room,'GROUP');
  const back=f.join('GROUP','join','Human1',original.token);assert.equal(f.welcome(back).id,original.id);assert.deepEqual(f.room.snapshot().groupIds,[f.players[0].id]);f.message(0,'group',{joined:false});assert.deepEqual(f.room.snapshot().groupIds,[]);
  back.emit('message',JSON.stringify({type:'group',roundId:f.room.roundId,joined:true}));back.emit('message',JSON.stringify({type:'leave'}));assert.deepEqual(f.room.snapshot().groupIds,[]);
});

test('group admission failures leave memberships, results, votes and wallets intact',()=>{
  for(const networkLimit of [false,true]){
    const f=finishedGroup(),{Room}=require('../game-server.cjs'),count=networkLimit?5:31;
    for(let i=0;i<count;i++){const busy=new Room('BUSY'+i);busy.add('Occupied');busy.creator=networkLimit?'local':'another-network';f.game.rooms.set(busy.code,busy);}
    f.opt(0,1);const before=JSON.stringify(f.room.snapshot()),coins=f.game.progress.view(f.players[0].profileId).coins;f.message(0,'requeue');assert.equal(f.sockets[0].messages.at(-1).type,'queue-error');assert.equal(f.sockets[0].readyState,1);assert.equal(f.welcome(f.sockets[0]).room,'GROUP');assert.equal(JSON.stringify(f.room.snapshot()),before);assert.equal(f.game.progress.view(f.players[0].profileId).coins,coins);assert.equal(f.game.rooms.size,count+1);
  }
});

test('a failed group reservation rolls back every allocated seat before moving a session',()=>{
  const f=finishedGroup(),others=Array.from({length:2},()=>{const ws=f.connect();ws.emit('message',JSON.stringify({type:'quick'}));return ws;}),target=f.game.rooms.get(f.welcome(others[0]).room),ids=[...target.players.keys()],add=target.add;let calls=0;
  target.add=function(...args){return ++calls===2?null:add.apply(this,args);};f.opt(0,1);const before=JSON.stringify(f.room.snapshot());f.message(0,'requeue');assert.equal(f.sockets[0].messages.at(-1).type,'queue-error');assert.deepEqual([...target.players.keys()],ids);assert.equal(JSON.stringify(f.room.snapshot()),before);assert.equal(f.welcome(f.sockets[1]).room,'GROUP');
});

test('an entirely consenting group can recycle its empty source at room and network limits',()=>{
  for(const networkLimit of [false,true]){
    const f=finishedGroup({count:4}),{Room}=require('../game-server.cjs'),count=networkLimit?5:31;
    for(let i=0;i<count;i++){const busy=new Room('BUSY'+i);busy.add('Occupied');busy.creator=networkLimit?'local':'another-network';f.game.rooms.set(busy.code,busy);}
    f.opt(0,1,2,3);f.message(0,'requeue');const target=f.game.rooms.get(f.welcome(f.sockets[0]).room);assert.notEqual(target,f.room);assert.equal(f.game.rooms.has('GROUP'),false);assert.equal(target.players.size,4);assert.equal(f.game.rooms.size,count+1);assert(f.sockets.every(ws=>f.welcome(ws).room===target.code));target.step(.01);assert.equal(target.phase,'ready');assert(target.humans().every(p=>!p.bot));
  }
});

test('a missed transfer welcome reconnects with the prior room token without duplication or secret leaks',()=>{
  const f=finishedGroup(),old=f.welcome(f.sockets[0]);f.opt(0,1);f.message(1,'requeue');const transferred=f.welcome(f.sockets[0]),target=f.game.rooms.get(transferred.room),back=f.join('GROUP','join','Ignore rename',old.token),restored=f.welcome(back);assert.equal(restored.room,target.code);assert.equal(restored.id,transferred.id);assert.equal(restored.profile.id,old.profile.id);assert.equal(restored.requeued,true);assert.equal(target.humans().length,2);assert.equal(target.players.get(restored.id).connected,true);assert.equal(f.sockets[0].readyState,3);
  const snapshots=f.sockets[1].messages.filter(m=>m.type==='state');assert(snapshots.every(m=>!JSON.stringify(m).includes(old.profile.secret)));assert(!JSON.stringify(f.room.snapshot()).includes(old.token));
});

test('Quick Play groups same-mode arrivals, fills bots at the deadline, and excludes late joins',()=>{
  const s=server(),quick=(mode='ffa')=>{const ws=s.connect();ws.emit('message',JSON.stringify({type:'quick',name:'Guest',settings:{mode}}));return ws;};
  const a=quick(),b=quick(),team=quick('teams'),welcome=ws=>ws.messages.find(m=>m.type==='welcome');
  assert.equal(welcome(a).room,welcome(b).room);assert.notEqual(welcome(a).room,welcome(team).room);assert.equal(s.list().body.rooms.length,0);
  const room=s.game.rooms.get(welcome(a).room);room.step(8);assert.equal(room.phase,'searching','keep searching beyond the old eight-second window');room.step(3.9);assert.equal(room.phase,'searching');assert.equal(room.players.size,2);
  room.step(.11);assert.equal(room.phase,'ready');assert.equal(room.players.size,4);assert.equal(room.humans().length,2);assert.equal(room.botSkill,'easy');
  const late=quick();assert.notEqual(welcome(late).room,room.code);
  a.emit('message',JSON.stringify({type:'ready'}));assert.equal(room.phase,'ready');b.emit('message',JSON.stringify({type:'ready'}));assert.equal(room.phase,'countdown');room.step(3);assert.equal(room.phase,'playing');
  const other=s.game.rooms.get(welcome(late).room);late.emit('message',JSON.stringify({type:'leave'}));assert.equal(other.players.size,0);
});

test('full human groups reveal immediately; reconnect preserves the profile and duplicate tabs cannot rank twice',()=>{
  const s=server(),sockets=Array.from({length:4},()=>{const ws=s.connect();ws.emit('message',JSON.stringify({type:'quick'}));return ws;}),welcome=sockets[0].messages.find(m=>m.type==='welcome'),room=s.game.rooms.get(welcome.room);
  room.step(.01);assert.equal(room.phase,'ready');assert.equal(room.humans().length,4);
  const duplicate=s.connect();duplicate.emit('message',JSON.stringify({type:'quick',profile:welcome.profile.secret}));assert.match(duplicate.messages.at(-1).message,/already in an arena/);
  sockets[0].close();const again=s.join(welcome.room,'join','Rename',welcome.token);assert.equal(again.messages.find(m=>m.type==='welcome').profile.id,welcome.profile.id);
  room.step(5);assert.equal(room.phase,'countdown');room.step(3);assert.equal(room.phase,'playing');
});

test('expired reconnect credentials never create an unintended empty arena',()=>{
  const s=server(),ws=s.join('EXPIRED',undefined,'Guest','bad-token');assert.equal(ws.messages.at(-1).code,'session_expired');assert.equal(s.game.rooms.size,0);
});

test('AI-filled friend rooms advertise full and retain bots through join/quit attempts',()=>{
  const s=server(),host=s.join('LOCKED','create','Host'),guest=s.join('LOCKED','join','Guest'),room=s.game.rooms.get('LOCKED');
  for(let i=0;i<2;i++)host.emit('message',JSON.stringify({type:'bot',action:'add'}));
  const bots=[...room.players.values()].filter(p=>p.bot).map(p=>p.id);
  assert.equal(s.list().body.rooms[0].available,0);assert.match(s.join('LOCKED','join').messages[0].message,/AI seats cannot be replaced/);
  host.emit('message',JSON.stringify({type:'start'}));room.step(3);guest.close();
  assert.equal(s.list().body.rooms[0].available,0);assert.match(s.join('LOCKED','join').messages[0].message,/full/);
  const welcome=guest.messages.find(m=>m.type==='welcome'),back=s.join('LOCKED','join','Guest',welcome.token);
  assert.equal(back.messages.find(m=>m.type==='welcome').id,welcome.id);
  back.emit('message',JSON.stringify({type:'leave'}));assert.equal(s.list().body.rooms[0].available,1);
  const replacement=s.join('LOCKED','join','Replacement');assert(replacement.messages.some(m=>m.type==='welcome'));
  replacement.emit('message',JSON.stringify({type:'leave'}));assert.equal(s.list().body.rooms[0].available,1);assert(bots.every(id=>room.players.has(id)));assert.equal(room.players.size,3);
});

test('Quick Play invitations only fill a human vacancy after the lineup is locked',()=>{
  for(const mode of ['ffa','teams']){
    const s=server(),quick=()=>{const ws=s.connect();ws.emit('message',JSON.stringify({type:'quick',settings:{mode}}));return ws;};
    const host=quick(),guest=quick(),welcome=guest.messages.find(m=>m.type==='welcome'),room=s.game.rooms.get(welcome.room);
    room.step(12);const bots=[...room.players.values()].filter(p=>p.bot).map(p=>p.id);assert.equal(bots.length,2);
    assert.match(s.join(room.code,'join').messages[0].message,/no open human seat/);
    host.emit('message',JSON.stringify({type:'ready'}));guest.emit('message',JSON.stringify({type:'ready'}));room.step(3);
    assert.match(s.join(room.code,'join').messages[0].message,/AI seats cannot be replaced/);
    guest.close();assert.match(s.join(room.code,'join').messages[0].message,/no open human seat/);
    const back=s.join(room.code,'join','Guest',welcome.token);assert(back.messages.some(m=>m.type==='welcome'));
    back.emit('message',JSON.stringify({type:'leave'}));
    const next=s.join(room.code,'join','Next');assert(next.messages.some(m=>m.type==='welcome'));assert.equal(room.players.size,4);
    next.emit('message',JSON.stringify({type:'leave'}));assert.equal(room.players.size,3);assert(bots.every(id=>room.players.has(id)));
    const queued=quick();assert.notEqual(queued.messages.find(m=>m.type==='welcome').room,room.code,'Quick Play still groups fresh arrivals, not mid-round replacements');
  }
});

test('friends-only rooms accept invitations but stay out of the directory; only hosts edit rules',()=>{
  const s=server(),host=s.join('FRIENDS','create','Host'),guest=s.join('FRIENDS','join','Guest'),room=s.game.rooms.get('FRIENDS');
  guest.emit('message',JSON.stringify({type:'room',action:'rules',settings:{mode:'teams'},private:true}));assert.equal(room.settings.mode,'ffa');
  host.emit('message',JSON.stringify({type:'room',action:'rules',settings:{mode:'teams',targetScore:25,bouncing:false,powers:false},private:true}));
  assert.equal(room.settings.targetScore,25);assert.equal(s.list().body.rooms.length,0);assert(s.join('FRIENDS','join','Friend').messages.some(m=>m.type==='welcome'));
});

test('results save before an immediate rematch and the endpoint returns the player rank',async()=>{
  const s=server(),ws=s.join('SAVE','create','Ann'),welcome=ws.messages.find(m=>m.type==='welcome'),room=s.game.rooms.get('SAVE'),human=room.players.get(welcome.id);
  ws.emit('message',JSON.stringify({type:'bot',action:'add'}));ws.emit('message',JSON.stringify({type:'start'}));room.step(3);
  const bot=[...room.players.values()].find(p=>p.bot);human.kills=9;bot.shieldUntil=0;room.damage(bot,human.id,10);
  const result=ws.messages.find(m=>m.type==='result');assert.equal(result.after.rank,1);assert.equal(result.after.wins,1);
  ws.emit('message',JSON.stringify({type:'rematch'}));assert.equal(room.phase,'countdown');assert.equal(s.game.leaderboard.top()[0].matches,1);
  const board=JSON.parse((await s.read('/leaderboard?period=week&player='+welcome.profile.id)).body.toString());assert.equal(board.you.rank,1);assert.equal(board.players.length,1);
  assert.equal((await s.read('/qr.js')).status,200);
});

test('approved audio is served with the right type/cache policy and unrelated files stay private',async()=>{
  const s=server(),asset=await s.read('/audio/cartoon-v1.mp3');
  assert.equal(asset.status,200);assert.equal(asset.headers['Content-Type'],'audio/mpeg');assert.match(asset.headers['Cache-Control'],/immutable/);assert(asset.body.length>100000);
  for(const url of Object.values(require('../music.js').tracks)){
    const music=await s.read(new URL(url,'http://localhost/').pathname);
    assert.equal(music.status,200);assert.equal(music.headers['Content-Type'],'audio/mpeg');
    assert.match(music.headers['Cache-Control'],/immutable/);
    assert.deepEqual(music.body,fs.readFileSync(require('node:path').join(__dirname,'..',url)));
    assert(music.body.length>500000&&music.body.length<800000);
  }
  for(const url of new Set(Object.values(require('../sound-bank.js').approvedAssets))){
    const effect=await s.read(new URL(url,'http://localhost/').pathname);
    assert.equal(effect.status,200);assert.equal(effect.headers['Content-Type'],'audio/mpeg');
    assert.match(effect.headers['Cache-Control'],/immutable/);
    assert.deepEqual(effect.body,fs.readFileSync(require('node:path').join(__dirname,'..',url)));
  }
  const script=await s.read('/sound-bank.js');assert.equal(script.status,200);assert.match(script.headers['Content-Type'],/text\/javascript/);assert.equal(script.headers['Cache-Control'],'no-store');
  assert.equal((await s.read('/audio/README.md')).status,404);assert.equal((await s.read('/audio/current.mp3')).status,404);
});

test('room directory starts empty and lists only public player details',()=>{
  const s=server();assert.deepEqual(s.list().body,{rooms:[]});
  s.join('ZETA','create','Zed');s.join('ALPHA','create','Alice');s.join('ALPHA','join','Bob');
  const {body,headers}=s.list();
  assert.deepEqual(body.rooms.map(r=>r.code),['ALPHA','ZETA']);
  assert.equal(body.rooms[0].available,2);assert.equal(body.rooms[0].capacity,4);
  assert.deepEqual(body.rooms[0].players.map(p=>p.name),['Alice','Bob']);
  assert.deepEqual(Object.keys(body.rooms[0].players[0]).sort(),['bot','connected','name','slot','team']);
  assert.equal(headers['Cache-Control'],'no-store');
});

test('creating an existing room or joining a vanished room returns a useful error',()=>{
  const s=server();s.join('ALPHA','create');
  assert.match(s.join('ALPHA','create').messages[0].message,/already exists/);
  assert.match(s.join('MISSING','join').messages[0].message,/no longer available/);
  assert.equal(s.game.rooms.get('ALPHA').players.size,1);assert.equal(s.game.rooms.has('MISSING'),false);
});

test('full rooms include reserved reconnecting players and reject extra joins',()=>{
  const s=server(),owner=s.join('FULL','create','Alice');
  for(let i=0;i<3;i++)s.join('FULL','join','Guest'+i);
  owner.close();const room=s.list().body.rooms[0];
  assert.equal(room.available,0);assert.equal(room.players[0].connected,false);
  assert.match(s.join('FULL','join').messages[0].message,/full/);
});

test('legacy room links still create rooms and reconnect tokens retain the player',()=>{
  const s=server(),first=s.join('LINK',undefined,'Alice'),welcome=first.messages[0];first.close();
  const again=s.join('LINK','create','Alice',welcome.token);
  assert.equal(again.messages[0].id,welcome.id);
  assert.equal(s.list().body.rooms[0].players.length,1);
});

test('leaving or expired reservations remove rooms from discovery',()=>{
  const s=server(),a=s.join('LEAVE','create');a.emit('message',JSON.stringify({type:'leave'}));
  assert.equal(s.list().body.rooms.length,0);
  const b=s.join('EXPIRE','create');b.close();s.game.rooms.get('EXPIRE').step(91);
  assert.equal(s.list().body.rooms.length,0);
});

test('the creator sets rules and later joiners cannot overwrite them',()=>{
  const s=server();s.join('TEAMS','create','Host',null,{mode:'teams',bouncing:false,powers:false,targetScore:25});
  s.join('TEAMS','join','Guest',null,{mode:'ffa',bouncing:true,powers:true,targetScore:5});
  const room=s.list().body.rooms[0];assert.deepEqual(room.settings,{mode:'teams',bouncing:false,powers:false,targetScore:25});
  assert.deepEqual(room.players.map(p=>p.team),[0,1]);
});

test('start messages are server-authorized, transfer before start, and cannot restart a running room',()=>{
  const s=server(),a=s.join('START','create','Alice'),b=s.join('START','join','Bob'),room=s.game.rooms.get('START');
  assert.equal(s.list().body.rooms[0].phase,'waiting');
  b.emit('message',JSON.stringify({type:'start',ownerId:a.messages[0].id}));assert.equal(room.phase,'waiting');
  a.emit('message',JSON.stringify({type:'leave'}));assert.equal(room.ownerId,b.messages[0].id);
  b.emit('message',JSON.stringify({type:'start'}));assert.equal(room.phase,'countdown');assert.equal(room.ownerId,null);
  room.step(3);b.emit('message',JSON.stringify({type:'start'}));assert.equal(room.phase,'playing');
  b.emit('message',JSON.stringify({type:'leave'}));assert.equal(s.game.rooms.has('START'),false);
});

test('rematch messages are accepted only from joined players during a live vote',()=>{
  const s=server(),a=s.join('AGAIN','create','Alice'),b=s.join('AGAIN','join','Bob'),room=s.game.rooms.get('AGAIN');
  a.emit('message',JSON.stringify({type:'rematch'}));assert.equal(room.rematchVotes.size,0);
  a.emit('message',JSON.stringify({type:'start'}));room.step(3);
  const [alice,bob]=[...room.players.values()];bob.shieldUntil=0;alice.kills=9;room.damage(bob,alice.id,10);
  assert.equal(s.list().body.rooms[0].phase,'results');
  a.emit('message',JSON.stringify({type:'rematch'}));assert.equal(room.phase,'results');
  assert.deepEqual(room.snapshot().rematchVotes,[alice.id]);
  b.emit('message',JSON.stringify({type:'rematch'}));assert.equal(room.phase,'countdown');
  a.emit('message',JSON.stringify({type:'rematch'}));assert.deepEqual(room.snapshot().rematchVotes,[]);
});

test('ended rooms retain results and reject new joins after the vote closes',()=>{
  const s=server(),a=s.join('FINISH','create','Alice'),room=s.game.rooms.get('FINISH');
  a.emit('message',JSON.stringify({type:'start'}));room.step(3);
  const b=s.join('FINISH','join','Bob'),[alice,bob]=[...room.players.values()];
  bob.shieldUntil=0;alice.kills=9;room.damage(bob,alice.id,10);room.step(20);
  assert.equal(s.list().body.rooms[0].available,0);
  const c=s.join('FINISH','join','Charlie');assert(c.messages.some(m=>m.type==='error'));assert(!c.messages.some(m=>m.type==='welcome'));
  assert.equal(room.players.size,2);assert.equal(room.phase,'postgame');assert.equal(room.winner.id,alice.id);
  b.emit('message',JSON.stringify({type:'rematch'}));assert.equal(room.phase,'postgame');assert.equal(alice.kills,10);
});

test('tutorial screenshots are served as cached WebP images',async()=>{
  const s=server(),root=require('node:path').join(__dirname,'..');
  const images=[...fs.readFileSync(require('node:path').join(root,'index.html'),'utf8').matchAll(/src="\.\/(tutorial\/[^"]+\.webp)"/g)].map(m=>m[1]);
  assert.equal(images.length,7);
  for(const image of images){
    const response=await s.read('/'+image);
    assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],'image/webp');
    assert.match(response.headers['Cache-Control'],/max-age=86400/);
    assert.deepEqual(response.body,fs.readFileSync(require('node:path').join(root,image)));
  }
  assert.equal((await s.read('/tutorial/missing.webp')).status,404);
});

test('the home-screen app manifest and icons are served with the right types',async()=>{
  const s=server(),manifest=await s.read('/manifest.webmanifest');
  assert.equal(manifest.status,200);assert.equal(manifest.headers['Content-Type'],'application/manifest+json');
  const data=JSON.parse(manifest.body.toString());
  assert.equal(data.start_url,'./');assert.equal(data.display,'fullscreen');
  for(const icon of [...data.icons.map(i=>i.src),'icons/apple-touch-icon.png']){
    const response=await s.read('/'+icon);assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],'image/png');
    assert.deepEqual(response.body.subarray(1,4).toString(),'PNG');
  }
});

test('the leaderboard endpoint lists the top ten, and creating a room triggers the notifier once',async()=>{
  const created=[],sandboxServer=server({onRoomCreated:room=>created.push(room),publicUrl:'http://pi.local:8765'});
  sandboxServer.join('ALPHA','create','Ann');sandboxServer.join('ALPHA','join','Bo');
  assert.equal(created.length,1);assert.equal(created[0].code,'ALPHA');assert.equal(created[0].name,'Ann');assert.equal(created[0].url,'http://pi.local:8765/?room=ALPHA');
  const board=await sandboxServer.read('/leaderboard');assert.equal(board.status,200);
  assert.deepEqual(JSON.parse(board.body.toString()),{players:[],countries:[],period:'all',country:'',persistent:false,you:null,timezone:'Asia/Kuala_Lumpur'});
});

test('/admin is hidden without a password, asks for one, and shows and ends rooms with it',async()=>{
  const closed=server();assert.equal((await closed.read('/admin')).status,404);assert.equal((await closed.read('/admin/state')).status,404);
  const s=server({adminPassword:'tank-secret'}),auth=password=>({authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')});
  const challenge=await s.read('/admin');assert.equal(challenge.status,401);assert.match(challenge.headers['WWW-Authenticate'],/Basic/);
  assert.equal((await s.read('/admin/state',{headers:auth('wrong-pass')})).status,401);
  const page=await s.read('/admin',{headers:auth('tank-secret')});assert.equal(page.status,200);assert.match(page.body.toString(),/Tank Frenzy Admin/);
  const ann=s.join('ALPHA','create','Ann');s.join('BETA','create','Bo');
  s.game.rooms.get('ALPHA').shells.push({x:100,y:100,slot:0});
  const state=JSON.parse((await s.read('/admin/state',{headers:auth('tank-secret')})).body.toString());
  assert.deepEqual(state.rooms.map(r=>r.code).sort(),['ALPHA','BETA']);assert.equal(state.rooms.find(r=>r.code==='ALPHA').players[0].name,'Ann');
  assert.equal(Object.hasOwn(state.rooms.find(r=>r.code==='ALPHA'),'shells'),false,'admin snapshots omit live bullet coordinates');
  assert((state.cpu===null||Number.isFinite(state.cpu))&&(state.memory===null||state.memory>0)&&state.palette.length>=4);
  assert(Number.isFinite(state.system.sampledAt));assert(state.system.game.rssBytes===null||state.system.game.rssBytes>0);
  assert.equal(state.system.load.length,3);assert(state.system.memory.totalBytes===null||state.system.memory.totalBytes>0);
  const again=JSON.parse((await s.read('/admin/state',{headers:auth('tank-secret')})).body.toString());
  assert.equal(again.system.sampledAt,state.system.sampledAt,'admin viewers share a stable resource sample');
  assert.equal((await s.read('/admin/close?room=ALPHA',{method:'POST',headers:auth('tank-secret')})).status,404,'needs the admin header');
  assert.equal((await s.read('/admin/close?room=ALPHA',{method:'POST',headers:{...auth('tank-secret'),'x-tank-admin':'1'}})).status,204);
  assert(!s.game.rooms.has('ALPHA'));assert.equal(ann.messages.at(-1).title,'Arena closed');assert.equal(ann.readyState,3);
  assert.equal((await s.read('/admin/close?room=ALPHA',{method:'POST',headers:{...auth('tank-secret'),'x-tank-admin':'1'}})).status,404);
});

test('players get the country Cloudflare reports, and the leaderboard filters by period and region',async()=>{
  const {countryOf}=require('../server.cjs');
  assert.equal(countryOf({headers:{'cf-ipcountry':'my'}}),'MY');
  for(const bad of ['XX','T1','','Malaysia'])assert.equal(countryOf({headers:{'cf-ipcountry':bad}}),'');
  const s=server(),board=s.game.leaderboard,{Room}=require('../game-server.cjs');
  const r=new Room('LB'),a=r.add('Ann'),b=r.add('Bo');a.country='MY';b.country='SG';a.kills=10;a.damageDealt=83;a.deaths=2;r.winner={id:a.id,name:'Ann'};board.record(r);
  const read=async query=>JSON.parse((await s.read('/leaderboard'+query)).body.toString());
  assert.deepEqual((await read('?period=day')).players.map(p=>p.name),['Ann','Bo']);
  assert.equal((await read('?period=day')).players[0].damageDealt,83);
  assert.equal((await read('?period=day')).players[0].deaths,2);
  assert.deepEqual((await read('?period=week&country=sg')).players.map(p=>p.name),['Bo']);
  assert.deepEqual((await read('')).countries,[{code:'MY',players:1},{code:'SG',players:1}]);
});

test('/admin slows each guesser after 10 wrong passwords a minute without locking out anyone else',async()=>{
  const s=server({adminPassword:'tank-secret'}),auth=(password,ip)=>({authorization:'Basic '+Buffer.from('x:'+password).toString('base64'),'cf-connecting-ip':ip});
  for(let i=0;i<10;i++)assert.equal((await s.read('/admin/state',{headers:auth('guess'+i,'203.0.113.9')})).status,401);
  assert.equal((await s.read('/admin/state',{headers:auth('tank-secret','203.0.113.9')})).status,429,'the guesser waits out the minute');
  assert.equal((await s.read('/admin/state',{headers:auth('tank-secret','198.51.100.4')})).status,200,'the owner elsewhere still gets in');
});

test('malformed messages and requests close one connection without stopping the server',async()=>{
  const s=server({adminPassword:'tank-secret'}),evil={toString:1};
  for(const message of [{type:'join',room:evil,name:'x'},{type:'spectate',room:'A',pass:evil},{type:'spectate',room:evil,pass:'x'}]){
    const socket=s.connect();assert.doesNotThrow(()=>socket.emit('message',JSON.stringify(message)));
  }
  const owner=s.join('BOTS','create','Ann');
  assert.doesNotThrow(()=>owner.emit('message',JSON.stringify({type:'bot',action:'skill',skill:evil})));
  assert.equal(owner.readyState,1,'an unknown skill is simply ignored');assert.equal(s.game.rooms.get('BOTS').botSkill,'normal');
  assert.equal((await s.read('http://[/')).status,400,'an unparsable address gets 400');
  assert.equal((await s.read('/health')).status,200);
});

test('one network can hold at most six arenas; idle arenas close after 15 minutes',()=>{
  const s=server();
  for(let i=0;i<6;i++)assert.equal(s.join('MINE'+i,'create').messages[0].type,'welcome');
  const seventh=s.join('MINE6','create');assert.equal(seventh.messages[0].title,'Too many arenas');assert.equal(seventh.readyState,3);
  assert.equal(s.join('MINE0','join','Friend').messages[0].type,'welcome','joining existing arenas still works');
  const room=s.game.rooms.get('MINE1'),ann=[...s.game.rooms.get('MINE1').players.values()][0];assert(ann);
  room.idleSince=room.time-901;s.tick();s.tick();
  assert(!s.game.rooms.has('MINE1'),'the idle arena closed');assert(s.game.rooms.has('MINE2'));
  assert.equal(s.join('MINE6','create').messages[0].type,'welcome','closing one frees a slot');
});

test('pages send security headers; only the Home Assistant sidebar may frame the game',async()=>{
  const s=server({adminPassword:'tank-secret'}),page=await s.read('/');
  const csp=page.headers['Content-Security-Policy'];
  assert.match(csp,/default-src 'self'/);assert.match(csp,/script-src 'self';/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);
  assert.equal(page.headers['X-Frame-Options'],'DENY');assert.equal(page.headers['Referrer-Policy'],'no-referrer');
  const admin=await s.read('/admin',{headers:{authorization:'Basic '+Buffer.from('x:tank-secret').toString('base64')}});
  const script=/<script>([\s\S]*?)<\/script>/.exec(admin.body.toString())[1],hash=require('node:crypto').createHash('sha256').update(script).digest('base64');
  assert(admin.headers['Content-Security-Policy'].includes(`script-src 'self' 'sha256-${hash}'`),'the admin script is allowed by its exact hash');
  assert.doesNotMatch(admin.headers['Content-Security-Policy'],/unsafe-eval|script-src[^;]*unsafe-inline/);
});

test('match history is admin-only and filtered without exposing credentials',async()=>{
  const s=server({adminPassword:'tank-secret'}),auth={authorization:'Basic '+Buffer.from('x:tank-secret').toString('base64')};
  s.game.leaderboard.matches.push({t:Date.now(),mode:'ffa',players:[{name:'Ann',profileId:'secret-id',kills:2,deaths:1}]});
  assert.equal((await s.read('/admin/history')).status,401);assert.equal((await s.read('/history')).status,404);
  const response=await s.read('/admin/history?name=Ann&mode=ffa',{headers:auth}),data=JSON.parse(response.body);assert.equal(data.total,1);assert(!response.body.includes('secret-id'));assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(JSON.parse((await s.read('/admin/history?name=Nobody',{headers:auth})).body).total,0);
});

test('the admin can list, remove and reset leaderboard names',async()=>{
  const s=server({adminPassword:'tank-secret'}),auth={authorization:'Basic '+Buffer.from('x:tank-secret').toString('base64')},post={...auth,'x-tank-admin':'1'};
  const {Room}=require('../game-server.cjs'),r=new Room('LB'),a=r.add('Ann');r.add('Bo');r.add('Cy');r.winner={id:a.id,name:'Ann'};s.game.leaderboard.record(r);
  assert.equal((await s.read('/admin/leaderboard')).status,401);
  assert.deepEqual(JSON.parse((await s.read('/admin/leaderboard',{headers:auth})).body.toString()).players.map(p=>p.name),['Ann','Bo','Cy']);
  assert.equal((await s.read('/admin/leaderboard/remove?name=bo',{method:'POST',headers:auth})).status,404,'needs the admin header');
  assert.equal((await s.read('/admin/leaderboard/remove?name=bo',{method:'POST',headers:post})).status,204);
  assert.equal((await s.read('/admin/leaderboard/remove?name=bo',{method:'POST',headers:post})).status,404);
  assert.deepEqual(JSON.parse((await s.read('/leaderboard')).body.toString()).players.map(p=>p.name),['Ann','Cy']);
  assert.equal((await s.read('/admin/leaderboard/reset',{method:'POST',headers:post})).status,204);
  assert.deepEqual(JSON.parse((await s.read('/leaderboard')).body.toString()).players,[]);
});

test('the admin page can live at a private address, and /admin then does not exist',async()=>{
  const s=server({adminPassword:'tank-secret',adminPath:'hq-7f3k'}),auth={authorization:'Basic '+Buffer.from('x:tank-secret').toString('base64')};
  assert.equal((await s.read('/admin',{headers:auth})).status,404);assert.equal((await s.read('/admin/state',{headers:auth})).status,404);
  assert.equal((await s.read('/hq-7f3k',{headers:auth})).status,200);assert.equal((await s.read('/hq-7f3k/state',{headers:auth})).status,200);
  assert.equal((await s.read('/hq-7f3k')).status,401);
});

test('hidden spectators watch a room without appearing to its players, and leave when it ends',async()=>{
  const s=server({adminPassword:'tank-secret'}),auth={authorization:'Basic '+Buffer.from('x:tank-secret').toString('base64'),'x-tank-admin':'1'};
  const ann=s.join('ALPHA','create','Ann');s.join('ALPHA','join','Bo');
  assert.equal((await s.read('/admin/watch?room=ALPHA',{method:'POST',headers:{authorization:auth.authorization}})).status,404,'needs the admin header');
  const {pass}=JSON.parse((await s.read('/admin/watch?room=ALPHA',{method:'POST',headers:auth})).body.toString());
  const bad=s.watch('ALPHA','wrong');assert.equal(bad.messages[0].type,'error');assert.equal(bad.readyState,3);
  const spy=s.watch('ALPHA',pass);
  assert.equal(spy.messages[0].type,'spectating');const view=spy.messages[1];
  assert.equal(view.type,'state');assert.deepEqual(view.players.map(p=>p.name).sort(),['Ann','Bo'],'sees the players');assert(view.map,'gets the map');
  const room=s.game.rooms.get('ALPHA');assert.equal(room.players.size,2,'not added as a player');
  assert.equal(s.list().body.rooms[0].available,2,'open seats unchanged');
  assert.equal(JSON.parse(JSON.stringify(room.snapshot())).players.length,2,'players never receive the spectator');
  spy.emit('message',JSON.stringify({type:'join',room:'ALPHA',name:'Sneaky'}));assert.equal(room.players.size,2,'a spectator socket cannot also join');
  room.phase='postgame';room.roundId='spectator-round';spy.emit('message',JSON.stringify({type:'group',roundId:room.roundId,joined:true}));spy.emit('message',JSON.stringify({type:'requeue',roundId:room.roundId}));assert.deepEqual(room.snapshot().groupIds,[]);assert.equal(s.game.rooms.size,1,'spectators cannot consent or move players');
  await s.read('/admin/close?room=ALPHA',{method:'POST',headers:auth});
  assert.equal(spy.messages.at(-1).title,'Arena closed');assert.equal(spy.readyState,3);assert.equal(ann.messages.at(-1).title,'Arena closed');
});
