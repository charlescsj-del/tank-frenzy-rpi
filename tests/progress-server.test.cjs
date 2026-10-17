'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{WebSocket}=require('ws'),{createGameServer}=require('../server.cjs');
async function setup(t){const game=createGameServer();game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;return {game,base,action:async(body,headers={})=>{const res=await fetch(base+'/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1',...headers},body:JSON.stringify(body)});return {status:res.status,...await res.json()};}};}
test('player API authenticates by private code, restores identity and keeps internal files private',async t=>{
  const {action,game,base}=await setup(t),first=await action({action:'load'});assert.equal(first.status,200);assert.equal(first.progress.coins,0);assert.match(first.profile.secret,/^[a-f0-9]{48}$/);
  const same=await action({action:'load',profile:first.profile.secret});assert.equal(same.profile.id,first.profile.id);
  const restored=await action({action:'recover',code:'TF-'+first.profile.secret.match(/.{8}/g).join('-')});assert.equal(restored.profile.id,first.profile.id);
  assert.equal((await action({action:'load',profile:first.profile.id})).status,400,'public profile id is not an authentication credential');
  assert.equal((await action({action:'recover',code:'TF-'+'a'.repeat(48)})).status,400);assert.equal(game.progress.players.size,1);
  assert.equal((await action({action:'load'},{Origin:'https://other.example'})).status,403);
  assert.equal((await fetch(base+'/progress')).status,405);for(const name of ['progress.cjs','data/player-progress.json','garage.js','skin-art.js'])assert.equal((await fetch(base+'/'+name)).status,name.endsWith('.js')?200:404);
});
test('purchases are idempotent over HTTP and recovery cannot bypass live arena membership',async t=>{
  const {action,game,base}=await setup(t),first=await action({action:'load'}),profile=first.profile;
  game.progress.players.get(profile.id).coins=500;
  const bought=await action({action:'buy',profile:profile.secret,skin:'desert'});assert.equal(bought.progress.coins,300);
  assert.equal((await action({action:'buy',profile:profile.secret,skin:'desert'})).progress.coins,300);
  assert.equal((await action({action:'equip',profile:profile.secret,skin:'desert'})).progress.equipped,'desert');
  const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await once(ws,'open');ws.send(JSON.stringify({type:'join',room:'SKINS',mode:'create',profile:profile.secret}));
  while(!messages.some(m=>m.type==='welcome'))await new Promise(resolve=>setTimeout(resolve,5));
  const room=game.rooms.get('SKINS'),p=room.humans()[0];assert.equal(p.skin,'desert');assert.equal(room.snapshot().players[0].skin,'desert');
  assert.equal((await action({action:'recover',code:profile.secret})).status,400);
  room.start(p);assert.equal((await action({action:'equip',profile:profile.secret,skin:'classic'})).status,400);assert.equal(p.skin,'desert');
  room.phase='results';assert.equal((await action({action:'equip',profile:profile.secret,skin:'classic'})).status,200);assert.equal(p.skin,'classic');assert.equal(room.snapshot().players[0].skin,undefined,'default skin adds no snapshot bytes');
  ws.close();
});
test('a real server result carries private rewards and spectators/public rankings cannot see wallets',async t=>{
  const {action,game,base}=await setup(t),first=await action({action:'load'}),ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await once(ws,'open');ws.send(JSON.stringify({type:'join',mode:'create',room:'REWARDS',profile:first.profile.secret}));
  while(!messages.some(m=>m.type==='welcome'))await new Promise(resolve=>setTimeout(resolve,5));
  const room=game.rooms.get('REWARDS'),p=room.humans()[0],bot=room.add('',{bot:true});room.start(p);room.step(3);p.activeSeconds=12;p.kills=9;bot.shieldUntil=0;room.damage(bot,p.id,10);
  while(!messages.some(m=>m.type==='result'))await new Promise(resolve=>setTimeout(resolve,5));
  const result=messages.find(m=>m.type==='result');assert.equal(result.reward.total,100);assert.equal(result.progress.coins,100);assert.equal(result.progress.daily.step,1);
  assert.equal(JSON.stringify(room.snapshot()).includes('coins'),false);const publicBoard=await fetch(base+'/leaderboard').then(r=>r.json());assert.equal(JSON.stringify(publicBoard).includes('coins'),false);assert.equal(JSON.stringify(publicBoard).includes(first.profile.secret),false);
  ws.close();
});
test('reward pause retains inventory and rejects purchases; admin progress requires authentication',async t=>{
  const game=createGameServer({rewardsEnabled:false,adminPassword:'test-password'});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());const base='http://127.0.0.1:'+game.server.address().port;
  const request=body=>fetch(base+'/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1'},body:JSON.stringify(body)});
  const loaded=await (await request({action:'load'})).json();assert.equal(loaded.progress.enabled,false);assert.equal((await request({action:'buy',profile:loaded.profile.secret,skin:'desert'})).status,400);
  assert.equal((await fetch(base+'/admin/economy')).status,401);const report=await fetch(base+'/admin/economy',{headers:{Authorization:'Basic '+Buffer.from('admin:test-password').toString('base64')}}).then(r=>r.json());assert.equal(report.profiles,1);assert.equal(report.enabled,false);assert(!JSON.stringify(report).includes(loaded.profile.secret));
});
