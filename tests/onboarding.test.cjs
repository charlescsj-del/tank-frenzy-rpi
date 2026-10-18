'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function coach(mobile){
  const elements=new Map(),storage=new Map(),element=()=>({hidden:true,textContent:'',addEventListener(){}});
  const sandbox={document:{hidden:false},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},profileId:'player',joined:true,spectating:false,profileOpen:false,tutorialOpen:false,leaveDialogOpen:false,resultDetailsOpen:false,myId:'me',touchMedia:{matches:mobile},playerProgress:{stats:{matches:0}},$:(id)=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}};
  sandbox.$('arena').classList={contains:()=>false};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../onboarding.js'),'utf8'),sandbox);
  let time=10,round='one';const me={id:'me',hp:10,x:100,y:100,shots:0};
  const update=(extra={})=>sandbox.updateCoach({roundId:round,time,phase:'playing',settings:{bouncing:true,targetScore:10,mode:'ffa'},players:[me],...extra});
  return {sandbox,elements,storage,me,update,time:n=>time=n,round:r=>round=r};
}
test('first-match guidance adapts to device and follows actual movement/fire without changing input',()=>{
  for(const mobile of [false,true]){const c=coach(mobile);c.update();assert.match(c.elements.get('coachText').textContent,mobile?/left half/:/W A S D/);assert.equal(c.elements.get('matchCoach').hidden,false);
    c.me.x+=40;c.update();assert.match(c.elements.get('coachText').textContent,mobile?/right half/:/mouse/);c.me.shots=1;c.update();assert.match(c.elements.get('coachText').textContent,/bounce/);c.time(16);c.update();assert.match(c.elements.get('coachText').textContent,/First to 10/);c.time(22);c.update();assert.equal(c.elements.get('matchCoach').hidden,true);assert.equal(c.storage.size,1);}
});
test('Skip persists for this profile; veteran players, spectators, dead players and result screens have no tips',()=>{
  const c=coach(true);c.update();c.sandbox.dismissCoach();c.round('two');c.update();assert.equal(c.elements.get('matchCoach').hidden,true);
  for(const mutate of [c=>c.sandbox.spectating=true,c=>c.sandbox.playerProgress.stats.matches=1,c=>c.me.hp=0]){const f=coach(false);mutate(f);f.update();assert.equal(f.elements.get('matchCoach').hidden,true);}
  const f=coach(false);f.update({phase:'results'});assert.equal(f.elements.get('matchCoach').hidden,true);f.sandbox.playerProgress=null;f.update();assert.equal(f.elements.get('matchCoach').hidden,true);
});
