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

test('guest profiles separate identical names, survive renames, and record each round once',()=>{
  const b=new Leaderboard(),first=b.identify(),second=b.identify();assert.notEqual(first.id,second.id);assert.equal(b.identify(first.secret).id,first.id);
  const room=new Room('IDENTITY'),a=room.add('Same'),other=room.add('Same');a.profileId=first.id;other.profileId=second.id;room.start(a);room.step(3);a.kills=10;room.winner={id:a.id,name:a.name};
  b.record(room);assert.equal(b.top().length,2);assert.equal(b.record(room),null);assert.equal(b.position(first.id).matches,1);
  room.phase='results';assert.equal(room.lobby(a),true);a.name='Changed';assert.equal(room.start(a),true);room.step(3);a.kills=10;room.winner={id:a.id,name:a.name};b.record(room);
  assert.equal(b.top().length,2);assert.equal(b.position(first.id).name,'Changed');assert.equal(b.position(first.id).matches,2);
});

test('leaving keeps earned statistics but grants no completed match or win',()=>{
  const board=new Leaderboard(),r=new Room('LEFT',{mode:'teams'}),a=r.add('A'),b=r.add('B'),c=r.add('C');a.profileId=board.identify().id;b.profileId=board.identify().id;c.profileId=board.identify().id;r.start(a);r.step(3);
  a.kills=4;a.damageDealt=37;a.deaths=2;r.remove(a);c.kills=10;r.winner={id:c.id,team:c.team,name:c.name};board.record(r);
  const left=board.position(a.profileId);assert.equal(left.kills,4);assert.equal(left.damageDealt,37);assert.equal(left.matches,0);assert.equal(left.wins,0);
  const pre=new Room('PRE',{mode:'teams'}),early=pre.add('Early'),rival=pre.add('Rival');early.profileId=board.identify().id;rival.profileId=board.identify().id;pre.start(early);pre.remove(early);pre.step(3);pre.winner={id:rival.id,team:rival.team,name:rival.name};board.record(pre);assert.equal(board.position(early.profileId),null,'leaving before battle earns no record');
});

test('adaptive difficulty discounts easy bot farming and caps mixed beginner groups',()=>{
  const b=new Leaderboard(),p={profileId:b.identify().id};assert.equal(b.skill([p]),'easy');
  for(let i=0;i<3;i++)b.matches.push({humans:1,botSkill:'easy',players:[{profileId:p.profileId,name:'A',won:true,kills:10,deaths:0}]});
  assert.equal(b.skill([p]),'normal');for(let i=0;i<10;i++)b.matches.push({humans:2,players:[{profileId:p.profileId,name:'A',won:true,kills:10,deaths:1}]});
  assert.equal(b.skill([p]),'hard');assert.equal(b.skill([p,{profileId:'new'}]),'normal');
});

test('personal ranks include players below the top ten and result movement reflects real standings',()=>{
  const b=new Leaderboard(),profile=b.identify();b.matches.push({t:Date.now(),players:[...Array.from({length:11},(_,i)=>({name:'Leader'+i,profileId:'leader-'+i,won:true,kills:1,deaths:0})),{name:'Guest',profileId:profile.id,won:false,kills:0,deaths:0}]});
  assert.equal(b.position(profile.id).rank,12);assert(!b.top({period:'week'}).some(p=>p.profileId===profile.id));
  const r=new Room('CLIMB'),p=r.add('Guest');p.profileId=profile.id;p.kills=10;r.winner={id:p.id};const result=b.record(r).get(p.id);
  assert.equal(result.before.rank,12);assert.equal(result.after.rank,1);assert.equal(result.nearby[0].beforeRank,12);
});

test('migration backs up legacy statistics and new profiles cannot claim them by typing the name',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json'),original=JSON.stringify({players:[{name:'Same',wins:9,matches:10,kills:90,deaths:5}]});
  try{fs.writeFileSync(file,original);const b=new Leaderboard(file),r=new Room('NEW'),p=r.add('Same');p.profileId=b.identify().id;p.kills=10;r.winner={id:p.id};b.record(r);b.save();
    assert.equal(fs.readFileSync(file+'.legacy-v1.json','utf8'),original);assert.equal(b.top().length,2);assert.equal(b.position(p.profileId).wins,1);assert.equal(JSON.parse(fs.readFileSync(file)).schema,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a failed migration backup keeps legacy data loaded and blocks overwrite until backup succeeds',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'tank-board-')),file=path.join(dir,'leaderboard.json'),original=JSON.stringify({players:[{name:'Legacy',wins:9,matches:10,kills:90,deaths:5}]}),copy=fs.copyFileSync;
  try{fs.writeFileSync(file,original);fs.copyFileSync=()=>{throw Error('backup unavailable');};const b=new Leaderboard(file);assert.equal(b.top()[0].wins,9);b.save();assert.equal(fs.readFileSync(file,'utf8'),original);
    fs.copyFileSync=copy;b.save();assert.equal(fs.readFileSync(file+'.legacy-v1.json','utf8'),original);assert.equal(JSON.parse(fs.readFileSync(file)).schema,2);
  }finally{fs.copyFileSync=copy;fs.rmSync(dir,{recursive:true,force:true});}
});

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
  let now=Date.parse('2026-09-23T15:00:00+08:00');// Wednesday
  const board=new Leaderboard(null,()=>now);
  const play=(winner,countries)=>{const r=finished('ffa',winner);[...r.players.values()].filter(p=>!p.bot).forEach((p,i)=>{p.country=countries[i];});board.record(r);};
  play('Ann',['MY','SG','MY']);
  now=Date.parse('2026-09-20T12:00:00+08:00');// the previous Sunday: last week
  const oldNow=now;now=oldNow;play('bo',['MY','SG','MY']);
  now=Date.parse('2026-09-23T18:00:00+08:00');
  assert.equal(periodStart('week',now),Date.parse('2026-09-21T00:00:00+08:00'),'weeks start on Monday in Malaysia time');
  assert.deepEqual(board.top({period:'day'}).map(p=>[p.name,p.wins]),[['Ann',1],['bo',0],['Cy',0]]);
  assert.deepEqual(board.top({period:'day'}).map(p=>[p.name,p.damageDealt,p.deaths]),[['Ann',73,2],['bo',42,6],['Cy',11,5]]);
  assert.deepEqual(board.top({period:'week'}).map(p=>p.name)[0],'Ann');
  assert.deepEqual(board.top({period:'month'}).map(p=>[p.name,p.matches]),[['Ann',2],['bo',2],['Cy',2]]);
  assert.equal(board.top({period:'month'})[0].damageDealt,146);
  assert.deepEqual(board.top({period:'all',country:'SG'}).map(p=>p.name),['bo']);
  assert.deepEqual(board.countries(),[{code:'MY',players:2},{code:'SG',players:1}]);
  now=Date.parse('2026-12-01T00:00:00+08:00');board.record(finished('ffa','Cy'));
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

test('a solo human earns a saved result against bots; bots are excluded from rankings',()=>{
  const board=new Leaderboard(),r=new Room('SOLO'),a=r.add('Ann');r.botCommand(a,{action:'add'});r.botCommand(a,{action:'add'});
  a.kills=10;r.winner={id:a.id,name:'Ann'};board.record(r);
  assert.equal(board.top().length,1);assert.equal(board.matches.length,1);assert.equal(board.top()[0].wins,1);assert.equal(board.top()[0].kills,10);
});

test('the admin can remove one name everywhere or reset the whole leaderboard',()=>{
  const board=new Leaderboard();board.record(finished('ffa','Ann'));board.record(finished('ffa','bo'));
  assert.equal(board.remove('BO'),true,'names match regardless of case');assert.equal(board.remove('bo'),false);assert.equal(board.remove(''),false);
  for(const period of ['day','week','month','all'])assert.deepEqual(board.top({period}).map(p=>p.name),['Ann','Cy']);
  board.reset();assert.equal(board.top().length,0);assert.equal(board.matches.length,0);
});
