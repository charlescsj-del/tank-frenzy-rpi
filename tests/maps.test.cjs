'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {generateMap}=require('../map-generator.cjs'),{Room,hitRect,encodeState}=require('../game-server.cjs'),F=require('../shared.js');
function connected(map,radius=28){
  const free=new Set();for(let x=40;x<F.width-26;x+=20)for(let y=40;y<F.height-26;y+=20)if(!map.walls.some(w=>hitRect(x,y,radius,w)))free.add(x+','+y);
  const visited=new Set(['40,40']),queue=[[40,40]];
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy]of [[20,0],[-20,0],[0,20],[0,-20]]){const key=(x+dx)+','+(y+dy);if(free.has(key)&&!visited.has(key)){visited.add(key);queue.push([x+dx,y+dy]);}}}
  assert.equal(visited.size,free.size,'all tank-sized free space connects');return visited;
}
function arena(layout,mode='ffa'){const r=new Room('MAPS',{mode});r.map=generateMap(3701,layout);const before=r.map,a=r.add('A'),b=r.add('B');r.start(a);assert.equal(r.map,before,'the lineup geometry survives its first start');r.step(3);a.shieldUntil=b.shieldUntil=0;return {r,a,b};}
test('both layouts are reproducible, identifiable, bounded and clear around every spawn',()=>{
  for(const layout of Object.keys(F.mapLabels))for(let seed=0;seed<60;seed++){
    const map=generateMap(seed,layout);assert.equal(map.layout,layout);assert.deepEqual(map,generateMap(seed,layout));assert.equal(map.width,F.width);assert.equal(map.height,F.height);assert(map.walls.length>=8&&map.walls.length<=20);
    for(const w of map.walls){assert([w.x,w.y,w.w,w.h,w.z].every(Number.isFinite));assert(w.x>=65&&w.y>=65&&w.x+w.w<=F.width-65&&w.y+w.h<=F.height-65);}
    for(const [x,y]of map.spawns)assert(!map.walls.some(w=>hitRect(x,y,65,w)),'spawn clearance');
  }
  assert.notEqual(generateMap(42,'quarry').id,generateMap(42,'crossroads').id,'same seed with different walls cannot share a browser cache ID');assert.equal(generateMap(42).layout,'quarry');assert.equal(generateMap(43).layout,'crossroads');assert.equal(generateMap(42,'unknown').layout,'quarry');
  assert.notDeepEqual(generateMap(42,'quarry').walls,generateMap(43,'quarry').walls,'seeded Quarry still varies');
});
test('both layouts have connected tank routes and safe exits from all four corners',()=>{
  for(const layout of Object.keys(F.mapLabels))for(let seed=0;seed<24;seed++){
    const map=generateMap(seed,layout),reachable=connected(map);for(const [x,y]of map.spawns){const near=[...reachable].some(key=>{const [a,b]=key.split(',').map(Number);return Math.hypot(a-x,b-y)<20;});assert(near);}
  }
});
test('Crossroads cover mirrors both axes, with wide continuous central and perimeter lanes',()=>{
  const map=generateMap(1,'crossroads'),keys=new Set(map.walls.map(w=>[w.x,w.y,w.w,w.h,w.z].join(',')));assert.equal(map.walls.length,16);
  for(const w of map.walls){assert(keys.has([F.width-w.x-w.w,w.y,w.w,w.h,w.z].join(',')));assert(keys.has([w.x,F.height-w.y-w.h,w.w,w.h,w.z].join(',')));}
  for(let x=40;x<F.width-26;x+=10)for(const y of [80,F.height/2-55,F.height/2,F.height/2+55,F.height-80])assert(!map.walls.some(w=>hitRect(x,y,28,w)));
  for(let y=40;y<F.height-26;y+=10)for(const x of [80,F.width/2-100,F.width/2,F.width/2+100,F.width-80])assert(!map.walls.some(w=>hitRect(x,y,28,w)));
});
test('the lineup layout survives the first start; rematches alternate without changing rules or rewards',()=>{
  for(const layout of Object.keys(F.mapLabels))for(const mode of ['ffa','teams']){
    const {r,a,b}=arena(layout,mode),settings=r.settings;assert.equal(r.map.layout,layout);const other=layout==='quarry'?'crossroads':'quarry';
    a.kills=9;if(mode==='teams')r.teamScores[a.team]=9;b.hp=1;r.damage(b,a.id,10);const first=r.map.id;r.step(1);assert.equal(r.map.id,first);r.voteRematch(a);r.voteRematch(b);assert.equal(r.phase,'countdown');assert.equal(r.map.layout,other);assert.equal(r.settings,settings);assert.notEqual(r.map.id,first);r.step(3);
    a.kills=9;if(mode==='teams')r.teamScores[a.team]=9;b.shieldUntil=0;b.hp=1;r.damage(b,a.id,10);r.voteRematch(a);r.voteRematch(b);assert.equal(r.map.layout,layout);
  }
});
test('returning to a friend lobby cannot skip a map or alternate it twice before play',()=>{
  const {r,a,b}=arena('quarry');a.kills=9;b.hp=1;r.damage(b,a.id,10);r.step(21);r.lobby(a);assert.equal(r.map.layout,'crossroads');const next=r.map;r.start(a);assert.equal(r.map,next);assert.equal(r.map.layout,'crossroads');assert.equal(r.phase,'countdown');
});
test('Crossroads cover blocks movement and lasers while shells ricochet with normal damage',()=>{
  const {r,a,b}=arena('crossroads');a.x=230;a.y=230;b.x=500;b.y=230;
  for(let i=0;i<60;i++){r.setInput(a,{seq:i+1,x:1,y:0,aimX:500,aimY:230,fire:false});r.step(1/120);}assert(a.x<=234&&a.x>=230);assert.equal(b.hp,10);
  a.x=100;a.y=230;a.aim=0;a.power='laser';a.powerUntil=r.time+10;a.cool=0;r.fire(a);const laser=r.events.find(e=>e.type==='laser');assert(laser.endX<=260);assert.equal(b.hp,10);
  a.power=null;r.shells=[{id:1,x:254,y:230,vx:410,vy:0,owner:a.id,slot:a.slot,life:3,bounces:0}];for(let i=0;i<3;i++)r.step(1/120);assert(r.shells[0].vx<0);assert.equal(r.shells[0].bounces,1);assert.equal(b.hp,10);
});
test('map metadata uses existing full-map snapshots; lean battle updates add no map label bytes',()=>{
  const {r}=arena('crossroads'),full=r.snapshot(),lean=r.snapshot({withMap:false});assert.equal(full.map.layout,'crossroads');assert.equal(lean.map,undefined);assert.equal(lean.mapId,full.map.id);assert(!encodeState(lean).includes('"layout"'));assert(!encodeState(lean).includes('mapLabels'));
});
test('bots navigate and score on both layouts in both modes with bounded simulation state',()=>{
  const prior=Math.random;
  try{for(const layout of Object.keys(F.mapLabels))for(const mode of ['ffa','teams']){
    let state=3701;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};
    const r=new Room('BOT-MAP',{mode});r.map=generateMap(3701,layout);const human=r.add('Target');for(let i=0;i<3;i++)r.add('',{bot:true});r.start(human);r.step(3);
    for(let i=0;i<7200&&r.phase==='playing';i++){r.step(1/120);r.events=[];assert(r.shells.length<=F.maxShells);}
    assert([...r.players.values()].some(p=>p.bot&&p.kills>0),layout+' '+mode+' bots reach combat');for(const p of r.players.values()){assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.x>=26&&p.x<=F.width-26&&p.y>=26&&p.y<=F.height-26);}
  }}finally{Math.random=prior;}
});
