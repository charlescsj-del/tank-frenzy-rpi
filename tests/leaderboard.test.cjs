const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Leaderboard}=require('../leaderboard.cjs');
const {Room}=require('../game-server.cjs');

function finished(mode,winnerName){
  const r=new Room('LB',{mode}),a=r.add('Ann'),b=r.add('bo'),c=r.add('Cy');r.botCommand(a,{action:'add'});
  a.kills=10;a.deaths=2;a.damageDealt=73;b.kills=4;b.deaths=6;b.damageDealt=42;c.kills=1;c.deaths=5;c.damageDealt=11;
  const w=[a,b,c].find(p=>p.name===winnerName);r.winner={id:w.id,team:w.team,name:w.name};
  return r;
}

test('finished matches add wins, matches, kills, damage and deaths per person; bots are not ranked',()=>{
  const board=new Leaderboard();board.record(finished('ffa','Ann'));board.record(finished('ffa','bo'));
  const top=board.top();assert.deepEqual(top.map(p=>p.name),['Ann','bo','Cy']);
  assert.deepEqual(top[0],{name:'Ann',country:'',wins:1,matches:2,kills:20,deaths:4,damageDealt:146});
  assert(!top.some(p=>p.name.startsWith('🤖')));
  const teams=new Leaderboard(),r=finished('teams','Ann');teams.record(r);
  const winners=[...r.players.values()].filter(p=>!p.bot&&p.team===r.winner.team).map(p=>p.name).sort();
  assert.deepEqual(teams.top().filter(p=>p.wins).map(p=>p.name).sort(),winners,'the whole winning team gets the win');
});

test('names match regardless of case, the file survives a restart, and old names are pruned',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json');
  try{
    const board=new Leaderboard(file);board.record(finished('ffa','Ann'));
    const r=finished('ffa','Ann');r.players.get([...r.players.keys()][0]).name='ANN';board.record(r);board.save();
    const reloaded=new Leaderboard(file);assert.equal(reloaded.top()[0].matches,2);assert.equal(reloaded.top()[0].name,'ANN');assert.equal(reloaded.top()[0].damageDealt,146);
    for(let i=0;i<105;i++){const room=new Room('P'+i),p=room.add('Player'+i);room.add('Rival'+i);room.winner={id:p.id,name:p.name};reloaded.record(room);}
    assert.equal(reloaded.entries.size,200);assert(reloaded.entries.has('ann'),'a flood of one-match names cannot push out a regular');
    assert(!reloaded.entries.has('player0')&&reloaded.entries.has('player104'),'among one-match names the oldest go first');
    fs.writeFileSync(file,'{not json');assert.equal(new Leaderboard(file).top().length,0,'a damaged file starts fresh');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('today, this week and this month count only recent matches; regions filter by country',()=>{
  const {periodStart}=require('../leaderboard.cjs');
  let now=new Date(2026,8,23,15).getTime();// Wednesday
  const board=new Leaderboard(null,()=>now);
  const play=(winner,countries)=>{const r=finished('ffa',winner);[...r.players.values()].filter(p=>!p.bot).forEach((p,i)=>{p.country=countries[i];});board.record(r);};
  play('Ann',['MY','SG','MY']);
  now=new Date(2026,8,20,12).getTime();// the previous Sunday: last week
  const oldNow=now;now=oldNow;play('bo',['MY','SG','MY']);
  now=new Date(2026,8,23,18).getTime();
  assert.equal(periodStart('week',now),new Date(2026,8,21).getTime(),'weeks start on Monday');
  assert.deepEqual(board.top({period:'day'}).map(p=>[p.name,p.wins]),[['Ann',1],['bo',0],['Cy',0]]);
  assert.deepEqual(board.top({period:'day'}).map(p=>[p.name,p.damageDealt,p.deaths]),[['Ann',73,2],['bo',42,6],['Cy',11,5]]);
  assert.deepEqual(board.top({period:'week'}).map(p=>p.name)[0],'Ann');
  assert.deepEqual(board.top({period:'month'}).map(p=>[p.name,p.matches]),[['Ann',2],['bo',2],['Cy',2]]);
  assert.equal(board.top({period:'month'})[0].damageDealt,146);
  assert.deepEqual(board.top({period:'all',country:'SG'}).map(p=>p.name),['bo']);
  assert.deepEqual(board.countries(),[{code:'MY',players:2},{code:'SG',players:1}]);
  now=new Date(2026,11,1).getTime();board.record(finished('ffa','Cy'));
  assert(board.matches.every(m=>m.t>=now-62*864e5),'match history keeps about two months');
});

test('an old all-time file without match history still loads',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json');
  try{
    fs.writeFileSync(file,JSON.stringify({players:[{name:'Ann',wins:3,matches:4,kills:9,deaths:2,lastPlayed:1}]}));
    const board=new Leaderboard(file);assert.equal(board.top()[0].wins,3);assert.equal(board.top()[0].damageDealt,0);assert.deepEqual(board.top({period:'day'}),[]);
    board.record(finished('ffa','Ann'));assert.equal(board.top()[0].damageDealt,73);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('old recent match logs without damage still aggregate alongside new matches',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json');
  try{
    fs.writeFileSync(file,JSON.stringify({players:[{name:'Ann',wins:1,matches:1,kills:2,deaths:1}],matches:[{t:Date.now(),players:[{name:'Ann',country:'',won:true,kills:2,deaths:1}]}]}));
    const board=new Leaderboard(file);board.record(finished('ffa','Ann'));
    assert.equal(board.top({period:'day'})[0].damageDealt,73);
    assert.equal(board.top({period:'day'})[0].deaths,3);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('matches need two people: wins against bots alone are not ranked',()=>{
  const board=new Leaderboard(),r=new Room('SOLO'),a=r.add('Ann');r.botCommand(a,{action:'add'});r.botCommand(a,{action:'add'});
  a.kills=10;r.winner={id:a.id,name:'Ann'};board.record(r);
  assert.equal(board.top().length,0);assert.equal(board.matches.length,0);
});

test('the admin can remove one name everywhere or reset the whole leaderboard',()=>{
  const board=new Leaderboard();board.record(finished('ffa','Ann'));board.record(finished('ffa','bo'));
  assert.equal(board.remove('BO'),true,'names match regardless of case');assert.equal(board.remove('bo'),false);assert.equal(board.remove(''),false);
  for(const period of ['day','week','month','all'])assert.deepEqual(board.top({period}).map(p=>p.name),['Ann','Cy']);
  board.reset();assert.equal(board.top().length,0);assert.equal(board.matches.length,0);
});
