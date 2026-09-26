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
  assert.deepEqual(top[0],{name:'Ann',wins:1,matches:2,kills:20,deaths:4});
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
