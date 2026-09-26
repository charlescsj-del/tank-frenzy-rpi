const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Leaderboard}=require('../leaderboard.cjs');
const {Room}=require('../game-server.cjs');

function finished(mode,winnerName){
  const r=new Room('LB',{mode}),a=r.add('Ann'),b=r.add('bo'),c=r.add('Cy');r.botCommand(a,{action:'add'});
  a.kills=10;a.deaths=2;b.kills=4;b.deaths=6;c.kills=1;c.deaths=5;
  const w=[a,b,c].find(p=>p.name===winnerName);r.winner={id:w.id,team:w.team,name:w.name};
  return r;
}

test('finished matches add wins, matches, kills and deaths per person; bots are not ranked',()=>{
  const board=new Leaderboard();board.record(finished('ffa','Ann'));board.record(finished('ffa','bo'));
  const top=board.top();assert.deepEqual(top.map(p=>p.name),['Ann','bo','Cy']);
  assert.deepEqual(top[0],{name:'Ann',country:'',wins:1,matches:2,kills:20,deaths:4});
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
    const reloaded=new Leaderboard(file);assert.equal(reloaded.top()[0].matches,2);assert.equal(reloaded.top()[0].name,'ANN');
    for(let i=0;i<210;i++){const room=new Room('P'+i),p=room.add('Player'+i);room.winner={id:p.id,name:p.name};reloaded.record(room);}
    assert.equal(reloaded.entries.size,200);assert(!reloaded.entries.has('ann'),'the least recently seen names go first');
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
  assert.deepEqual(board.top({period:'week'}).map(p=>p.name)[0],'Ann');
  assert.deepEqual(board.top({period:'month'}).map(p=>[p.name,p.matches]),[['Ann',2],['bo',2],['Cy',2]]);
  assert.deepEqual(board.top({period:'all',country:'SG'}).map(p=>p.name),['bo']);
  assert.deepEqual(board.countries(),[{code:'MY',players:2},{code:'SG',players:1}]);
  now=new Date(2026,11,1).getTime();board.record(finished('ffa','Cy'));
  assert(board.matches.every(m=>m.t>=now-62*864e5),'match history keeps about two months');
});

test('an old all-time file without match history still loads',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json');
  try{
    fs.writeFileSync(file,JSON.stringify({players:[{name:'Ann',wins:3,matches:4,kills:9,deaths:2,lastPlayed:1}]}));
    const board=new Leaderboard(file);assert.equal(board.top()[0].wins,3);assert.deepEqual(board.top({period:'day'}),[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
