'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const F=require('../shared.js'),{Progress}=require('../progress.cjs'),{Room}=require('../game-server.cjs'),{generateMap}=require('../map-generator.cjs');
function fixture(){
  const store=new Progress(null,{now:()=>0,random:n=>n-1}),profile=store.identify();store.ensure(profile.id);
  const room=new Room('COLLECTION'),p=room.add('Collector');p.profileId=profile.id;p.activeSeconds=12;p.kills=10;room.time=90;room.roundStarted=0;room.roundId=randomUUID();room.winner={id:p.id};room.matchPlayers=new Map([[p.id,p]]);
  store.players.get(profile.id).daily={step:6,lastDay:-1,graceUsed:false,longest:6,streak:6};return {store,profile,room,p,award:()=>store.record(room).get(p.id)};
}
test('cosmetic collections have unique IDs, fixed coin prices and no gameplay modifiers',()=>{
  assert.equal(new Set(F.skins.map(s=>s.id)).size,F.skins.length);assert.equal(F.skinCollections.length,2);
  const allowed=['id','name','price','pattern','body','accent','description','collection','dailyReward'];
  for(const skin of F.skins){assert(F.skinCollections.some(c=>c.id===skin.collection));assert(Number.isSafeInteger(skin.price)&&skin.price>=0);assert(Object.keys(skin).every(key=>allowed.includes(key)));}
  assert.equal(F.skins.filter(s=>s.dailyReward).length,6);const showcase=F.skins.filter(s=>s.collection==='showcase');assert.equal(showcase.length,3);assert(showcase.every(s=>s.price===1500&&!s.dailyReward));
});
test('Day 7 draws only unowned normal skins, never Showcase skins',()=>{
  const f=fixture(),p=f.store.players.get(f.profile.id);p.owned=F.skins.filter(s=>s.id==='classic'||s.dailyReward&&s.id!=='gold').map(s=>s.id);
  const result=f.award();assert.equal(result.reward.skin,'gold');assert.equal(result.reward.daily.collectionBonus,0);assert(result.progress.owned.includes('gold'));
});
test('all normal skins award the full-collection substitute even with Showcase unowned',()=>{
  const f=fixture(),p=f.store.players.get(f.profile.id);p.owned=F.skins.filter(s=>s.id==='classic'||s.dailyReward).map(s=>s.id);
  const result=f.award();assert.equal(result.reward.skin,null);assert.equal(result.reward.daily.collectionBonus,200);assert.equal(result.progress.owned.length,7);
});
test('Showcase purchase is permanent, exact-price and idempotent across recovery',t=>{
  const f=fixture(),skin=F.skins.find(s=>s.collection==='showcase'),dir=fs.mkdtempSync(path.join(__dirname,'tank-collections-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));f.store.file=path.join(dir,'progress.json');
  assert.throws(()=>f.store.buy(f.profile.id,skin.id),/more coins/);assert.throws(()=>f.store.equip(f.profile.id,skin.id),/not own/);f.store.players.get(f.profile.id).coins=skin.price;
  assert.equal(f.store.buy(f.profile.id,skin.id).coins,0);assert.equal(f.store.buy(f.profile.id,skin.id).coins,0);assert.equal(f.store.equip(f.profile.id,skin.id).equipped,skin.id);
  const restored=new Progress(f.store.file,{now:()=>0});assert.equal(restored.identify(f.profile.secret).id,f.profile.id);assert.equal(restored.skinOf(f.profile.id),skin.id);assert.equal(restored.view(f.profile.id).coins,0);assert.equal(restored.view(f.profile.id).owned.filter(id=>id===skin.id).length,1);
});
test('failed Showcase purchases roll back wallet and inventory',()=>{
  const f=fixture(),skin=F.skins.find(s=>s.collection==='showcase');f.store.players.get(f.profile.id).coins=skin.price;const before=JSON.stringify(f.store.view(f.profile.id));f.store.save=()=>{throw Error('disk full');};assert.throws(()=>f.store.buy(f.profile.id,skin.id),/disk full/);assert.equal(JSON.stringify(f.store.view(f.profile.id)),before);
});
test('every Showcase skin preserves health, damage, movement and firing statistics',()=>{
  function battle(skin){const room=new Room('FAIR');room.map=generateMap(7,'quarry');const p=room.add('Player'),enemy=room.add('Enemy');p.skin=skin;room.start(p);room.step(3);p.shieldUntil=0;room.damage(p,enemy.id,3);
    for(let i=0;i<120;i++){room.setInput(p,{seq:i+1,x:1,y:0,aimX:800,aimY:520,fire:true});room.step(1/120);}
    assert.equal(room.snapshot().players.find(row=>row.id===p.id).skin,skin==='classic'?undefined:skin);return [p.x,p.y,p.hp,p.shots,p.kills,p.damageDealt,room.shells.length];}
  const baseline=battle('classic');for(const skin of F.skins.filter(s=>s.collection==='showcase'))assert.deepEqual(battle(skin.id),baseline);
});
test('collection patterns use bounded static paint operations in preview and combat',()=>{
  const calls=[],ctx=new Proxy({},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),set:(target,key,value)=>{target[key]=value;return true;}}),sandbox={FIELD:F};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../skin-art.js'),'utf8'),sandbox);
  for(const skin of F.skins.filter(s=>s.collection==='showcase')){calls.length=0;sandbox.TankSkins.plate(ctx,skin.id,-21,-18,42,30);assert(calls.length>8&&calls.length<150);assert.equal(calls.filter(c=>c[0]==='save').length,calls.filter(c=>c[0]==='restore').length);assert(calls.every(c=>c.slice(1).every(v=>typeof v!=='number'||Number.isFinite(v))));}
});
