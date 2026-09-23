'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const vm=require('node:vm');

// Exercise the production HTTP and WebSocket handlers without opening OS sockets.
function server(){
  class Socket extends EventEmitter{
    readyState=1;bufferedAmount=0;messages=[];
    send(raw){this.messages.push(JSON.parse(raw));}
    close(){this.readyState=3;this.emit('close');}
    terminate(){this.close();}
  }
  class WSS extends EventEmitter{clients=new Set();close(cb){cb();}}
  const sandbox={module:{exports:{}},__dirname:require('node:path').resolve(__dirname,'..'),URL,performance,
    setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
    require(name){
      if(name==='node:http')return {createServer(handler){const http=new EventEmitter();http.on('request',handler);http.close=cb=>cb();return http;}};
      if(name==='ws')return {WebSocketServer:WSS,WebSocket:{OPEN:1}};
      if(name.startsWith('./'))return require('../'+name.slice(2));
      return require(name);
    }};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../server.cjs'),'utf8'),sandbox);
  const game=sandbox.module.exports.createGameServer();
  function join(room,mode,name='Player',token,settings){const socket=new Socket();game.wss.emit('connection',socket);socket.emit('message',JSON.stringify({type:'join',room,mode,name,token,settings}));return socket;}
  function list(){let body,headers={};game.server.emit('request',{url:'/rooms',method:'GET'},{setHeader(k,v){headers[k]=v;},end(raw){body=JSON.parse(raw);}});return {body,headers};}
  function read(url){return new Promise((resolve,reject)=>{
    const {Writable}=require('node:stream'),chunks=[],headers={};let status=200;
    const response=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
    response.setHeader=(key,value)=>{headers[key]=value;};response.writeHead=code=>{status=code;};
    response.on('finish',()=>resolve({status,headers,body:Buffer.concat(chunks)}));response.on('error',reject);
    game.server.emit('request',{url,method:'GET'},response);
  });}
  return {game,join,list,read};
}

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
  assert.deepEqual(Object.keys(body.rooms[0].players[0]).sort(),['connected','name','slot','team']);
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
  const b=s.join('EXPIRE','create');b.close();s.game.rooms.get('EXPIRE').step(16);
  assert.equal(s.list().body.rooms.length,0);
});

test('the creator sets rules and later joiners cannot overwrite them',()=>{
  const s=server();s.join('TEAMS','create','Host',null,{mode:'teams',bouncing:false,powers:false});
  s.join('TEAMS','join','Guest',null,{mode:'ffa',bouncing:true,powers:true});
  const room=s.list().body.rooms[0];assert.deepEqual(room.settings,{mode:'teams',bouncing:false,powers:false});
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
