'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const WebSocket=require('ws');
const {createGameServer}=require('../server.cjs');
const {readOptions}=require('../addon.cjs');

async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
function supervisor(req){Object.defineProperty(req.socket,'remoteAddress',{value:'172.30.32.2',configurable:true});}
function connect(url,options={}){
  const ws=new WebSocket(url.replace('http:','ws:')+'/ws',options);
  return new Promise((resolve,reject)=>{ws.once('open',()=>resolve(ws));ws.once('error',reject);});
}

test('separate ingress listener rejects direct access and untrusted forwarded headers',async t=>{
  const game=createGameServer({ingress:true});t.after(()=>game.close());
  const base=await listen(game.server),ingress=await listen(game.ingressServer);
  const spoof={'X-Ingress-Path':'/api/hassio_ingress/test','X-Forwarded-For':'172.30.32.2'};
  assert.equal((await fetch(ingress+'/',{headers:spoof})).status,403);
  await assert.rejects(connect(ingress,{headers:spoof}));
  const direct=await fetch(base+'/',{headers:spoof}).then(r=>r.text());assert(!direct.includes('<base'));
  await assert.rejects(connect(base,{origin:'http://attacker.example',headers:{...spoof,'X-Forwarded-Host':'attacker.example'}}));
  const ws=await connect(base,{origin:base});ws.close();
});

test('ingress serves prefix-safe assets and shares live multiplayer rooms with LAN clients',async t=>{
  const game=createGameServer({ingress:true,publicUrl:'http://pi.local:8765'});t.after(()=>game.close());
  const base=await listen(game.server),ingress=await listen(game.ingressServer);
  // Supervisor strips the external prefix; emulate its trusted socket address.
  game.ingressServer.prependListener('request',supervisor);
  game.ingressServer.prependListener('upgrade',supervisor);
  const prefix='/api/hassio_ingress/test_token-123';
  const html=await fetch(ingress+'/',{headers:{'X-Ingress-Path':prefix}}).then(r=>r.text());
  assert(html.includes('<base href="'+prefix+'/">'));
  const assets=[...html.matchAll(/src="([^\"]+)"/g)].map(m=>m[1]);assert(assets.length>=5);
  for(const asset of [...assets,'./audio/cartoon-v1.mp3']){
    const external=new URL(asset,'https://ha.example'+prefix+'/');assert(external.pathname.startsWith(prefix+'/'));
    assert.equal((await fetch(ingress+external.pathname.slice(prefix.length))).status,200);
  }
  assert.equal((await fetch(ingress+'/',{headers:{'X-Ingress-Path':'//attacker.example/'}})).status,400);
  assert.equal((await fetch(ingress+'/',{headers:{'X-Ingress-Path':'/api/hassio_ingress/"bad'}})).status,400);
  const info=await fetch(ingress+'/network-info').then(r=>r.json());
  assert.deepEqual(info,{urls:[],publicUrl:'http://pi.local:8765',ingress:true});
  assert.equal((await fetch(base+'/health').then(r=>r.json())).status,'ok');
  assert.equal((await fetch(base+'/addon.cjs')).status,404);
  assert.equal((await fetch(base+'/config.yaml')).status,404);
  // HA's public Origin differs from the internal Host on this authenticated listener.
  const owner=await connect(ingress,{origin:'https://ha.example'});
  const welcome=once(owner,'message');owner.send(JSON.stringify({type:'join',room:'PITEST',mode:'create',name:'Owner'}));
  assert.equal(JSON.parse((await welcome)[0]).type,'welcome');
  const guest=await connect(base,{origin:base});
  const joined=once(guest,'message');guest.send(JSON.stringify({type:'join',room:'PITEST',mode:'join',name:'Guest'}));
  assert.equal(JSON.parse((await joined)[0]).type,'welcome');
  const rooms=await fetch(base+'/rooms').then(r=>r.json());assert.equal(rooms.rooms[0].players.length,2);
  owner.close();guest.close();
});

test('app options accept LAN and HTTPS addresses and reject unsafe or ambiguous invitations',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-options-')),file=path.join(dir,'options.json');
  try{
    assert.deepEqual(readOptions(file),{ingress:true,publicUrl:''});
    for(const value of ['http://192.168.1.50:8765/','https://game.example/']){
      fs.writeFileSync(file,JSON.stringify({public_url:value}));assert.equal(readOptions(file).publicUrl,value.slice(0,-1));
    }
    for(const value of ['javascript:alert(1)','https://user:password@example.com','http://pi/?room=ABC','http://pi/#x','pi.local:8765']){
      fs.writeFileSync(file,JSON.stringify({public_url:value}));assert.throws(()=>readOptions(file));
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
