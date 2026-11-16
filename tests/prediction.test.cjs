'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('../shared.js'),{Room}=require('../game-server.cjs');
// The real client in a sandbox with a clock the test controls.
function client(){
  let clock=1000;const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})},{get:(target,key)=>key in target?target[key]:()=>{},set:()=>true});
  const element=()=>({style:{setProperty(){}},classList:{add(){},remove(){},toggle(){},contains:()=>false},addEventListener(){},setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},prepend(){},remove(){},focus(){},children:[],getBoundingClientRect:()=>({width:1120,height:610,left:0,top:0}),getContext:()=>context});
  const elements=new Map();
  const sandbox={FIELD:F,URL,performance:{now:()=>clock},location:{href:'http://localhost:8765',origin:'http://localhost:8765',hostname:'localhost'},history:{replaceState(){}},navigator:{},document:{hidden:false,body:element(),documentElement:element(),getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){}},window:{addEventListener(){}},matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},devicePixelRatio:1,setInterval(){},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),WebSocket:{OPEN:1},HTMLInputElement:class{},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../client.js'),'utf8'),sandbox);
  const run=code=>vm.runInContext(code,sandbox);
  return {run,advance:ms=>{clock+=ms;return clock;},now:()=>clock,
    // Put the player's tank into a running match at a known place.
    play(x=300,y=520,extra={}){run(`joined=true;spectating=false;myId='me';walls=[];latest={phase:'playing',settings:{powers:true}};tanks=[Object.assign({id:'me',slot:0,x:${x},y:${y},targetX:${x},targetY:${y},a:0,aim:0,hp:10,life:1,recoil:0,flash:0,track:0},${JSON.stringify(extra)})];keys.clear();predicted.active=false;pingSamples.length=0;pingSamples.push(60);`);},
    me:()=>JSON.parse(run('JSON.stringify(tanks[0])')),
    // What the real key and stick handlers do: change the input, then announce it.
    press(...codes){run(codes.map(c=>`keys.add('${c}')`).join(';')+';sendInput()');},lift(...codes){run(codes.map(c=>`keys.delete('${c}')`).join(';')+';sendInput()');},
    // One display frame: the same call the animation loop makes for the player's own tank.
    frame(ms=1000/60){clock+=ms;return run(`predictOwnTank(tanks[0],${clock})`);}};
}
test('holding a key moves the tank on the very next frame at the server speed, normalised on diagonals',()=>{
  const c=client();c.play();assert.equal(c.frame(),true);assert.equal(c.me().x,300,'no input, no movement');
  c.press('KeyD');c.frame();assert(Math.abs(c.me().x-(300+170/60))<1e-6);
  for(let i=0;i<59;i++)c.frame();assert(Math.abs(c.me().x-470)<1e-6,'170 units in one second');assert.equal(c.me().a,0);
  c.press('KeyS');for(let i=0;i<60;i++)c.frame();const me=c.me();
  assert(Math.abs(me.x-(470+170*Math.SQRT1_2))<1e-6&&Math.abs(me.y-(520+170*Math.SQRT1_2))<1e-6);assert(Math.abs(me.a-Math.PI/4)<1e-9,'the hull turns with the keys');
});
test('the prediction follows the same wall, boundary and tank collisions as the server, sliding along a blocked axis',()=>{
  const c=client();c.play(900,520);c.run("walls=[{x:1000,y:300,w:80,h:440}]");c.frame(0);c.press('KeyD','KeyS');
  const room=new Room('SAME'),p=room.add('Human');room.start(p);room.step(3.01);room.map={...room.map,walls:[{x:1000,y:300,w:80,h:440,z:40}]};p.x=900;p.y=520;
  for(let i=0;i<180;i++){c.frame(1000/120);room.setInput(p,{seq:i+1,x:1,y:1,aimX:p.x+50,aimY:p.y,fire:false});room.step(1/120);}
  const me=c.me();assert(Math.abs(me.x-p.x)<.01&&Math.abs(me.y-p.y)<.01,'identical path: '+me.x+','+me.y+' vs '+p.x+','+p.y);assert(Math.abs(me.x-974)<1.5,'stopped at the wall');assert(me.y>700,'kept sliding down');
  c.play(1560,1000);c.press('KeyD','KeyS');for(let i=0;i<60;i++)c.frame();assert(c.me().x<=F.width-26&&c.me().y<=F.height-26,'stays inside the arena');
  c.play(300,520);c.run("tanks.push({id:'other',hp:10,targetX:400,targetY:520,x:400,y:520})");c.press('KeyD');for(let i=0;i<60;i++)c.frame();assert(c.me().x<=350.001,'cannot drive through another tank');
  c.run("tanks[1].hp=0");for(let i=0;i<30;i++)c.frame();assert(c.me().x>350,'a destroyed tank does not block');
});
test('Speed power and vehicle class change the predicted speed exactly as on the server',()=>{
  const run=(extra,powers=true)=>{const c=client();c.play(300,520,extra);if(!powers)c.run('latest.settings.powers=false');c.frame(0);c.press('KeyD');for(let i=0;i<60;i++)c.frame();return c.me().x-300;};
  assert(Math.abs(run({})-170)<1e-6);assert(Math.abs(run({power:'speed',powerRemaining:5})-272)<1e-6);assert(Math.abs(run({power:'speed',powerRemaining:0})-170)<1e-6);
  assert(Math.abs(run({power:'speed',powerRemaining:5},false)-170)<1e-6);assert(Math.abs(run({vehicle:'scout'})-204)<1e-6);assert(Math.abs(run({vehicle:'heavy'})-145)<1e-6);
});
test('a press or release between two frames counts to the millisecond',()=>{
  const c=client();c.play();c.frame();
  c.advance(10);c.run("keys.add('KeyD');sendInput()");c.advance(6.667);c.run(`predictOwnTank(tanks[0],${c.now()})`);assert(Math.abs(c.me().x-(300+170*.006667))<1e-3,'only the 6.7 ms after the press count');
  c.frame();c.advance(4);c.run("keys.delete('KeyD');sendInput()");c.advance(12.667);c.run(`predictOwnTank(tanks[0],${c.now()})`);
  assert(Math.abs(c.me().x-(300+170*(.006667+.016667+.004)))<1e-3,'movement ends at the release, not at the next frame');
});
test('snapshots ease the prediction toward the server and snap only for a jump such as a respawn',()=>{
  const c=client();c.play();c.run("keys.add('KeyD');sendInput()");for(let i=0;i<30;i++)c.frame();
  // The server copy is where the prediction was one delay ago (60 ms ping + 8 ms loop): no correction.
  const past=c.run(`(()=>{const at=${c.now()}-68,h=predicted.history;let i=0;while(i<h.length-1&&h[i+1].t<=at)i++;const a=h[i],b=h[i+1];return a.x+(b.x-a.x)*(at-a.t)/(b.t-a.t);})()`);
  let before=c.me().x;c.run(`tanks[0].targetX=${past};reconcileOwnTank(tanks[0],${c.now()})`);c.frame(0);assert.equal(c.run('predicted.x'),before,'agreeing snapshots change nothing');
  // The server is 10 units further on: a fifth of the gap is taken up per snapshot.
  c.run(`tanks[0].targetX=${past+10};reconcileOwnTank(tanks[0],${c.now()})`);assert(Math.abs(c.run('predicted.x')-(before+2))<1e-6);
  c.run(`reconcileOwnTank(tanks[0],${c.now()})`);assert(Math.abs(c.run('predicted.x')-(before+3.6))<1e-6,'the remembered path moved too, so the gap shrinks');
  // A large jump is adopted at once.
  before=c.run('predicted.x');c.run(`tanks[0].targetX=${past}+700;reconcileOwnTank(tanks[0],${c.now()})`);assert(Math.abs(c.run('predicted.x')-before-(700-3.6))<1e-6);
  // Differences under 0.4 units are left alone so a resting tank never shimmers.
  c.play();c.frame();c.frame();c.run(`tanks[0].targetX=300.3;reconcileOwnTank(tanks[0],${c.now()})`);assert.equal(c.run('predicted.x'),300);
});
test('prediction is off outside play, while destroyed and for spectators, and restarts cleanly on a new life',()=>{
  const c=client();c.play();c.run("keys.add('KeyD')");c.frame();
  for(const change of ["latest.phase='countdown'","latest.phase='results'","tanks[0].hp=0","spectating=true","joined=false"]){const d=client();d.play();d.run("keys.add('KeyD')");d.frame();d.run(change);assert.equal(d.frame(),false,change);assert.equal(d.run('predicted.active'),false);}
  for(let i=0;i<30;i++)c.frame();c.run('tanks[0].life=2;tanks[0].targetX=90;tanks[0].targetY=90');c.frame(0);assert.equal(c.me().x,90,'a respawn starts from the server position');assert.equal(c.run('predicted.history.length'),1);
});
test('a busy frame cannot inflate the delay: the lowest of the last five pings is used',()=>{
  const c=client();c.play();c.run("keys.add('KeyD');sendInput()");for(let i=0;i<40;i++)c.frame();
  const sample=at=>c.run(`(()=>{const at=${at},h=predicted.history;let i=0;while(i<h.length-1&&h[i+1].t<=at)i++;const a=h[i],b=h[i+1];return a.x+(b.x-a.x)*(at-a.t)/(b.t-a.t);})()`);
  c.run('pingSamples.push(400,60,55,300)');const before=c.run('predicted.x');c.run(`tanks[0].targetX=${sample(c.now()-63)};reconcileOwnTank(tanks[0],${c.now()})`);assert.equal(c.run('predicted.x'),before,'55 ms + 8 ms is the delay in use');
});
test('shells keep moving between 30 Hz snapshots, never past the arena edge, and stop being guessed after 50 ms',()=>{
  const c=client(),state=shells=>({type:'state',phase:'playing',settings:{mode:'ffa',powers:true},players:[],shells,events:[],pickups:[],mapId:1,time:1});
  c.run('updateRoomPhase=()=>{};updateHud=()=>{};updateMatchSounds=()=>{};draw=()=>{};updateCamera=()=>{};updateEffects=()=>{};updateMovementSound=()=>{}');
  const apply=shells=>c.run('applySnapshot('+JSON.stringify(state(shells))+')'),frame=()=>c.run(`frame(${c.now()})`),shell=()=>JSON.parse(c.run('JSON.stringify(shells[0])'));
  apply([{id:1,x:100,y:500,slot:0}]);c.advance(33.333);apply([{id:1,x:113.667,y:500,slot:0}]);assert(Math.abs(shell().vx-410)<1,'speed from two snapshots');
  c.advance(16.667);frame();assert(Math.abs(shell().x-(113.667+410*.016667))<.05,'halfway to the next snapshot');assert.equal(shell().sx,113.667,'the server position is kept');
  c.advance(100);frame();assert(Math.abs(shell().x-(113.667+410*.05))<.05,'no guessing beyond 50 ms');
  // A late snapshot (two intervals) does not double the speed.
  apply([{id:4,x:100,y:300,slot:0}]);c.advance(66.667);apply([{id:4,x:127.333,y:300,slot:0}]);assert(Math.abs(shell().vx-410)<1,'two intervals, same speed');
  apply([{id:2,x:1590,y:500,slot:1}]);c.advance(33.333);apply([{id:2,x:1594.9,y:500,slot:1}]);c.advance(40);frame();assert(shell().x<=F.width-5,'clamped inside the arena');
  apply([{id:3,x:400,y:400,slot:0}]);assert.equal(shell().vx,0,'a new shell starts where the server put it');
});
