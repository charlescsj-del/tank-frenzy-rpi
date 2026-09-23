const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function client(mobile=true,url='http://localhost:8765'){
  const elements=new Map(),windowEvents={},documentEvents={},sent=[];
  function element(){
    const events={},classes=new Set(),captures=new Set();
    return {events,children:[],hidden:false,textContent:'',style:{setProperty(){}},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){on?classes.add(n):classes.delete(n);},contains:n=>classes.has(n)},
      attributes:{},addEventListener(n,f){events[n]=f;},setAttribute(n,v){this.attributes[n]=v;},focus(){},
      getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),
      setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  }
  const media={matches:mobile,addEventListener(n,f){this.change=f;}};
  const sandbox={URL,FIELD:require('../shared.js'),performance:{now:()=>100},location:{href:url,origin:'http://localhost:8765'},
    document:{body:element(),createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(n,f){documentEvents[n]=f;}},
    window:{addEventListener(n,f){windowEvents[n]=f;}},matchMedia:q=>q.includes('pointer')?media:{matches:false},
    ResizeObserver:class{observe(){}},devicePixelRatio:1,setInterval(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),WebSocket:{OPEN:1},sent};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('client.js','utf8'),sandbox);
  const run=code=>vm.runInContext(code,sandbox);
  run("joined=true;myId='me';tanks=[{id:'me',x:100,y:100,aim:0}];socket={readyState:1,bufferedAmount:0,send:data=>sent.push(JSON.parse(data))};updateTouchControls();");
  const event=(id,x=50,y=50)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
  return {elements,windowEvents,documentEvents,media,sent,run,event,sandbox};
}

test('two thumbs move and aim independently, retain relative aim, and stop individually',()=>{
  const c=client(),move=c.elements.get('moveStick'),aim=c.elements.get('aimStick');
  move.events.pointerdown(c.event(1,82,50));
  aim.events.pointerdown(c.event(2,50,18));
  let input=c.sent.at(-1);
  assert.equal(input.x,1);assert.equal(input.y,0);assert.equal(input.fire,true);
  assert.equal(input.aimX,100);assert.equal(input.aimY,-50);
  // A third finger must not take over an occupied control.
  move.events.pointerdown(c.event(3,18,50));
  c.run('sendInput()');assert.equal(c.sent.at(-1).x,1);
  aim.events.pointerup(c.event(2));
  assert.equal(c.sent.at(-1).x,1);assert.equal(c.sent.at(-1).fire,false);
  c.run('tanks[0].x=200;tanks[0].y=200;sendInput()');
  assert.equal(c.sent.at(-1).aimX,200);assert.equal(c.sent.at(-1).aimY,50);
  move.events.pointercancel(c.event(1));
  assert.equal(c.sent.at(-1).x,0);
});

test('dead zone, captured pointer loss, blur, rotation and input mode changes clear controls',()=>{
  const c=client(),move=c.elements.get('moveStick'),aim=c.elements.get('aimStick');
  aim.events.pointerdown(c.event(2,52,50));assert.equal(c.sent.at(-1).fire,false);
  aim.events.pointermove(c.event(2,82,50));c.run('sendInput()');assert.equal(c.sent.at(-1).fire,true);
  aim.events.lostpointercapture(c.event(2));assert.equal(c.sent.at(-1).fire,false);
  for(const type of ['blur','resize']){
    move.events.pointerdown(c.event(1,82,50));aim.events.pointerdown(c.event(2,82,50));
    c.windowEvents[type]();assert.equal(c.sent.at(-1).x,0);assert.equal(c.sent.at(-1).fire,false);
  }
  move.events.pointerdown(c.event(1,82,50));c.media.matches=false;c.media.change();
  assert.equal(c.sent.at(-1).x,0);assert.equal(c.elements.get('thumbControls').hidden,true);
});

test('desktop hides thumb controls; touch controls wait for joining',()=>{
  const desktop=client(false);
  assert.equal(desktop.elements.get('thumbControls').hidden,true);
  assert.equal(desktop.elements.get('desktopHelp').hidden,false);
  const mobile=client();assert.equal(mobile.elements.get('thumbControls').hidden,false);
  mobile.run('joined=false;updateTouchControls()');assert.equal(mobile.elements.get('thumbControls').hidden,true);
});

test('leaving requires confirmation and cancellation keeps the player in the room',()=>{
  const c=client();c.sandbox.clearTimeout=()=>{};c.sandbox.history={replaceState(){}};
  c.elements.get('leave').events.click();assert.equal(c.elements.get('leaveDialog').hidden,false);
  assert.equal(c.sent.some(m=>m.type==='leave'),false);
  c.elements.get('cancelLeave').events.click();assert.equal(c.run('joined'),true);assert.equal(c.elements.get('leaveDialog').hidden,true);
  c.run('socket.close=()=>{}');c.elements.get('leave').events.click();c.elements.get('confirmLeave').events.click();
  assert.equal(c.run('joined'),false);assert(c.sent.some(m=>m.type==='leave'));
});

test('mode choice filters rooms and new room options default to enabled',()=>{
  const c=client();c.run('lobbyRooms=[{code:"SOLO",settings:{mode:"ffa"},players:[],capacity:4,available:4},{code:"TEAM",settings:{mode:"teams"},players:[],capacity:4,available:4}]');
  c.elements.get('teamMode').events.click();assert.equal(c.elements.get('roomList').children.length,1);
  assert.match(c.elements.get('roomList').children[0].textContent,/TEAM/);
  c.elements.get('createRoom').events.click();assert.equal(c.elements.get('gameMode').value,'teams');
  assert.equal(c.elements.get('bounceOption').checked,true);assert.equal(c.elements.get('powersOption').checked,true);
});

test('power HUD uses matching icons and time, replaces powers, and clears on death or expiry',()=>{
  const c=client();
  c.run(`var hudPlayer={id:'me',name:'Pilot',slot:0,hp:5,kills:0,deaths:0,connected:true,power:'laser',powerRemaining:9.2};var hudState={players:[hudPlayer],settings:{mode:'ffa'}};updateHud(hudState)`);
  const badge=c.elements.get('powerStatus'),glyph=c.elements.get('powerGlyph'),timer=c.elements.get('powerTime');
  assert.equal(badge.hidden,false);assert.equal(glyph.attributes.href,'#power-laser');assert.equal(timer.textContent,'10s');assert.match(badge.attributes['aria-label'],/LASER.*10 seconds/);
  c.run("hudPlayer.power='double';hudPlayer.powerRemaining=2.3;updateHud(hudState)");
  assert.equal(glyph.attributes.href,'#power-double');assert.equal(timer.textContent,'3s');assert.equal(badge.classList.contains('expiring'),true);
  const fraction=Number(c.elements.get('powerMeter').style.transform.match(/[\d.]+/)[0]);assert(Math.abs(fraction-.23)<.001);
  c.run('hudPlayer.hp=0;updateHud(hudState)');assert.equal(badge.hidden,true);
  c.run("hudPlayer.hp=5;hudPlayer.power='speed';hudPlayer.powerRemaining=5;updateHud(hudState)");assert.equal(glyph.attributes.href,'#power-speed');assert.equal(badge.hidden,false);
  c.run('hudPlayer.powerRemaining=0;updateHud(hudState)');assert.equal(badge.hidden,true);
  c.run("hudPlayer.power='immortal';hudPlayer.powerRemaining=10;updateHud(hudState)");assert.equal(glyph.attributes.href,'#power-immortal');assert.match(badge.attributes['aria-label'],/IMMORTAL/);
});

test('ten health fits five pips with half pips for single hits',()=>{
  const c=client();c.run("var hpPlayer={id:'me',name:'Pilot',slot:0,hp:10,kills:0,deaths:0,connected:true};var hpState={players:[hpPlayer]};updateHud(hpState)");
  const health=()=>c.elements.get('roster').children[0].children[1];
  assert.equal(health().children.length,5);assert.equal(health().attributes['aria-label'],'10 / 10 health');
  assert(health().children.every(p=>p.className==='pip'));
  c.run('hpPlayer.hp=9;updateHud(hpState)');assert.equal(health().children[4].className,'pip half');assert.equal(health().attributes['aria-label'],'9 / 10 health');
  c.run('hpPlayer.hp=1;updateHud(hpState)');assert.equal(health().children[0].className,'pip half');assert(health().children.slice(1).every(p=>p.className==='pip empty'));
});

test('laser starts at the rendered muzzle despite movement and newer touch aim',()=>{
  const c=client();
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,.63]){
    c.run(`tanks=[{id:'me',life:7,hp:10,x:805,y:525}];touchAim={x:0,y:-1};var laserEvent={player:'me',tankLife:7,originX:800,originY:520,muzzleDistance:40,endX:800+Math.cos(${angle})*300,endY:520+Math.sin(${angle})*300};var geometry=laserGeometry(laserEvent)`);
    const start=JSON.parse(c.run('JSON.stringify(geometry.start)')),end=JSON.parse(c.run('JSON.stringify(geometry.end)'));
    assert(Math.abs(Math.hypot(start.x-805,start.y-525)-40)<1e-8);
    assert(Math.abs((start.x-805)*(end.y-525)-(start.y-525)*(end.x-805))<1e-7,'muzzle and impact share the rendered turret aim');
    assert(Math.abs(c.run('geometry.aim-Math.atan2(laserEvent.endY-tanks[0].y,laserEvent.endX-tanks[0].x)'))<1e-8);
  }
  c.run("tanks[0].life=8;laserEvent.endX=1200;laserEvent.endY=520;geometry=laserGeometry(laserEvent)");
  assert.equal(c.run('geometry.start.x'),840,'old beam does not attach to a respawned tank');assert.equal(c.run('geometry.start.y'),520);
  c.run("tanks=[];laserEvent.endX=826;laserEvent.muzzleDistance=26;geometry=laserGeometry(laserEvent)");
  assert.equal(c.run('geometry.start.x'),826);assert.equal(c.run('geometry.end.x'),826,'nearby cover clips both muzzle and beam');
});

test('one centerline for every weapon starts at the muzzle and follows every aim direction',()=>{
  const c=client();c.run('walls=[]');
  for(const power of [null,'double','machine','laser'])for(const aim of [0,Math.PI/2,Math.PI,-Math.PI/2,.63]){
    const {start,end}=JSON.parse(c.run(`JSON.stringify(aimGuideSegment({x:800,y:520,power:${JSON.stringify(power)}},${aim},35))`));
    const dx=Math.cos(aim),dy=Math.sin(aim);
    assert(Math.abs((start.x-800)*dx+(start.y-520)*dy-35)<1e-8);
    assert(Math.abs(-(start.x-800)*dy+(start.y-520)*dx)<1e-8);
    assert(Math.abs((end.x-start.x)*dy-(end.y-start.y)*dx)<1e-8);
    assert((end.x-start.x)*dx+(end.y-start.y)*dy>0);
    assert(end.x>=-1e-8&&end.x<=1600+1e-8&&end.y>=-1e-8&&end.y<=1040+1e-8);
  }
});

test('aim guides stop at cover, clip obstructed muzzles and never draw for opponents or frozen play',()=>{
  const c=client();c.run('walls=[{x:850,y:450,w:30,h:200}];var guide=aimGuideSegment({x:800,y:520},0)');
  assert.equal(c.run('guide.start.x'),840);assert.equal(c.run('guide.end.x'),845);
  c.run("guide=aimGuideSegment({x:800,y:520,power:'laser'},0)");assert.equal(c.run('guide.end.x'),850);
  c.run('guide=aimGuideSegment({x:824,y:520},0)');assert.equal(c.run('guide.start.x'),845);assert.equal(c.run('guide.end.x'),845);
  // The stub canvas deliberately has no drawing methods: these paths must return before drawing.
  c.run("drawAimGuide({id:'other',hp:10},0,40);drawAimGuide({id:'me',hp:0},0,40);latest={phase:'waiting'};drawAimGuide({id:'me',hp:10},0,40);latest={phase:'countdown'};drawAimGuide({id:'me',hp:10},0,40);latest={winner:{}};drawAimGuide({id:'me',hp:10},0,40);latest=null;joined=false;drawAimGuide({id:'me',hp:10},0,40)");
});

test('start and outcome sounds play once per round, including teammate wins and losses',()=>{
  const c=client();
  c.run(`var cues=[];playCue=kind=>cues.push(kind);var round={map:{id:11},players:[{id:'me',team:0}],settings:{mode:'teams'},winner:null};updateMatchSounds(round);updateMatchSounds(round)`);
  assert.equal(c.run('cues.join()'),'start');
  c.run("round.winner={id:'teammate',team:0};updateMatchSounds(round);updateMatchSounds(round)");assert.equal(c.run('cues.join()'),'start,win');
  c.run("round.map.id=12;round.winner=null;updateMatchSounds(round);round.winner={id:'other',team:1};updateMatchSounds(round);updateMatchSounds(round)");assert.equal(c.run('cues.join()'),'start,win,start,lose');
  c.run("round.map.id=13;round.settings.mode='ffa';round.winner=null;updateMatchSounds(round);round.winner={id:'me'};updateMatchSounds(round)");assert.equal(c.run('cues.at(-1)'),'win');
  c.run("round.map.id=14;round.winner={id:'other'};updateMatchSounds(round)");assert.equal(c.run('cues.at(-1)'),'lose');
});

test('waiting screen lists players, restricts Start, and gives way to the countdown',()=>{
  const c=client();c.run(`latest={room:'SQUAD',phase:'waiting',ownerId:'other',players:[{id:'me',name:'Me',connected:true,slot:0},{id:'other',name:'Friend',connected:true,slot:1}]};updateRoomPhase(latest)`);
  assert.equal(c.elements.get('waitingRoom').hidden,false);assert.equal(c.elements.get('waitingPlayers').children.length,2);
  assert.equal(c.elements.get('startGame').hidden,true);assert.equal(c.elements.get('thumbControls').hidden,true);
  c.elements.get('startGame').events.click();assert.equal(c.sent.filter(m=>m.type==='start').length,0);
  c.run("latest.ownerId='me';updateRoomPhase(latest)");assert.equal(c.elements.get('startGame').hidden,false);
  c.elements.get('startGame').events.click();assert.equal(c.sent.filter(m=>m.type==='start').length,1);
  c.run("latest.phase='countdown';latest.countdownIn=2.9;updateRoomPhase(latest)");
  assert.equal(c.elements.get('waitingRoom').hidden,true);assert.equal(c.elements.get('countdown').hidden,false);assert.equal(c.elements.get('countdownNumber').textContent,'3');
  const sent=c.sent.length;c.run('firing=true;sendInput()');assert.equal(c.sent.length,sent);
  c.run("latest.countdownIn=.8;updateRoomPhase(latest)");assert.equal(c.elements.get('countdownNumber').textContent,'1');
  c.run("latest.phase='playing';updateRoomPhase(latest)");assert.equal(c.elements.get('countdown').hidden,true);assert.equal(c.elements.get('thumbControls').hidden,false);
});

test('countdown sounds once per number, start is distinct, and music/effects switches operate independently',()=>{
  const c=client();c.run(`var cues=[];playCue=kind=>cues.push(kind);var state={map:{id:15},phase:'waiting',players:[]};updateMatchSounds(state);state.phase='countdown';state.countdownIn=3;updateMatchSounds(state);updateMatchSounds(state)`);
  assert.equal(c.run('cues.join()'),'countdown3');
  c.run('state.countdownIn=2.6;updateMatchSounds(state);state.countdownIn=1.8;updateMatchSounds(state);updateMatchSounds(state);state.countdownIn=.7;updateMatchSounds(state)');
  assert.equal(c.run('cues.join()'),'countdown3,countdown2,countdown1');
  c.run("state.phase='playing';updateMatchSounds(state);updateMatchSounds(state)");assert.equal(c.run('cues.join()'),'countdown3,countdown2,countdown1,start');
  c.run("state.phase='countdown';state.map.id=16;state.countdownIn=3;updateMatchSounds(state)");assert.equal(c.run('cues.at(-1)'),'countdown3','next round starts new countdown');
  c.run("var musicEvents=[];musicPlayer={play:mode=>musicEvents.push(mode),prepareBattle:key=>musicEvents.push('preload:'+key),stop:()=>musicEvents.push('stop')};getAudio=()=>({});TankMusic=function(){};audioReady=true;joined=false;syncMusic()");
  assert.equal(c.run('musicEvents.at(-1)'),'lobby');
  c.elements.get('sound').events.click();assert.equal(c.run('sound'),false);assert.equal(c.run('music'),true);assert.equal(c.run('musicEvents.at(-1)'),'lobby');
  c.elements.get('music').events.click();assert.equal(c.run('music'),false);assert.equal(c.run('musicEvents.at(-1)'),'stop');
  c.elements.get('sound').events.click();assert.equal(c.run('sound'),true);assert.equal(c.run('music'),false);
  c.run("joined=true;latest={phase:'playing'}");c.elements.get('music').events.click();assert.equal(c.run('musicEvents.at(-1)'),'battle');
  c.run('document.hidden=true');c.documentEvents.visibilitychange();assert.equal(c.run('musicEvents.at(-1)'),'stop');
  c.run('document.hidden=false');c.documentEvents.visibilitychange();assert.equal(c.run('musicEvents.at(-1)'),'battle');
  c.run("latest={phase:'countdown',map:{id:77},players:[]};updateRoomPhase(latest)");assert.equal(c.run('musicEvents.at(-2)'),'lobby');assert.equal(c.run('musicEvents.at(-1)'),'preload::77');
  c.run("musicPlayer.play=(mode,key)=>musicEvents.push(mode+':'+key);roomCode='BATTLE';latest.phase='playing';updateRoomPhase(latest)");
  assert.equal(c.run('musicEvents.at(-1)'),'battle:BATTLE:77');
});

test('plain URLs open the room browser while room links keep the prefilled join form',()=>{
  const plain=client();assert.equal(plain.elements.get('roomBrowser').hidden,false);assert.equal(plain.elements.get('joinFields').hidden,true);
  const linked=client(false,'http://localhost:8765/?room=quarry');
  assert.equal(linked.elements.get('roomBrowser').hidden,true);assert.equal(linked.elements.get('roomInput').value,'QUARRY');
  assert.equal(linked.elements.get('joinFields').hidden,false);
});

test('room selection previews names before joining and create opens a separate editable form',async()=>{
  const c=client();c.run('joined=false');
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[{code:'ALPHA',capacity:4,available:2,players:[{name:'Alice',connected:true},{name:'Bob',connected:false}]}]})});
  await c.run('refreshRooms()');c.elements.get('roomList').children[0].events.click();
  assert.equal(c.elements.get('roomDetails').hidden,false);
  assert.deepEqual(c.elements.get('roomPlayers').children.map(p=>p.textContent),['Alice','Bob (reconnecting)']);
  c.elements.get('joinSelected').events.click();
  assert.equal(c.run('joinMode'),'join');assert.equal(c.elements.get('roomInput').value,'ALPHA');assert.equal(c.elements.get('roomInput').readOnly,true);
  c.elements.get('createRoom').events.click();
  assert.equal(c.run('joinMode'),'create');assert.equal(c.elements.get('roomInput').readOnly,false);assert.match(c.elements.get('roomInput').value,/^ROOM-/);
});

test('full and vanished rooms cannot be joined; request failures provide a retry message',async()=>{
  const c=client();c.run('joined=false;selectedRoom="FULL"');
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[{code:'FULL',capacity:4,available:0,players:[]}]})});
  await c.run('refreshRooms()');assert.equal(c.elements.get('joinSelected').disabled,true);
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[]})});
  await c.run('refreshRooms()');assert.equal(c.elements.get('roomDetails').hidden,true);assert.equal(c.elements.get('joinSelected').disabled,true);
  c.sandbox.fetch=async()=>{throw Error('offline');};await c.run('refreshRooms()');
  assert.match(c.elements.get('roomListStatus').textContent,/Tap Refresh/);
});

test('mobile play uses a compact viewport and restores the page on leaving or switching input',()=>{
  const c=client(),arena=c.elements.get('arena');
  assert.equal(arena.classList.contains('mobile-active'),true);
  assert.equal(c.sandbox.document.body.classList.contains('mobile-playing'),true);
  assert.equal(c.elements.get('viewMode').hidden,false);
  c.run('joined=false;updateTouchControls()');
  assert.equal(arena.classList.contains('mobile-active'),false);
  assert.equal(c.sandbox.document.body.classList.contains('mobile-playing'),false);
  assert.equal(c.elements.get('viewMode').hidden,true);
  c.run('joined=true');c.media.matches=false;c.media.change();
  assert.equal(arena.classList.contains('mobile-active'),false);
});

test('mobile menu releases controls and closes on action, outside tap, Escape and leaving',()=>{
  const c=client(),arena=c.elements.get('arena'),menu=c.elements.get('arenaMenu');
  c.elements.get('moveStick').events.pointerdown(c.event(1,82,50));
  menu.events.click();
  assert.equal(arena.classList.contains('menu-open'),true);
  assert.equal(c.sent.at(-1).x,0);
  c.elements.get('arenaActions').events.click({target:{closest:()=>({})}});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.sandbox.document.getElementById('arenaHeader').contains=()=>false;
  c.documentEvents.pointerdown({target:{}});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.documentEvents.keydown({code:'Escape'});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.run('joined=false;updateTouchControls()');
  assert.equal(arena.classList.contains('menu-open'),false);
});

test('mobile camera enlarges tanks, follows them, and keeps every corner visible',()=>{
  const c=client();
  for(const [width,height] of [[874,290],[390,620],[667,240],[320,430]]){
    c.run(`cssW=${width};cssH=${height};tanks[0].x=800;tanks[0].y=520;updateCamera()`);
    assert(c.run('48*boardScale*scale')>=33.59,'tank width stays readable in CSS pixels');
    assert.equal(c.run('project(tanks[0].x,tanks[0].y).x*scale+offsetX'),width/2);
    assert.equal(c.run('project(tanks[0].x,tanks[0].y).y*scale+offsetY'),height/2-40);
    const before=c.run('offsetX');
    c.run('tanks[0].x+=50;updateCamera()');assert(c.run('offsetX')<before);
    for(const [x,y] of [[0,0],[1600,0],[0,1040],[1600,1040]]){
      c.run(`tanks[0].x=${x};tanks[0].y=${y};updateCamera()`);
      const screenX=c.run('project(tanks[0].x,tanks[0].y).x*scale+offsetX');
      const screenY=c.run('project(tanks[0].x,tanks[0].y).y*scale+offsetY');
      assert(screenX>=23.99&&screenX<=width-23.99);
      assert(screenY>=23.99&&screenY<=height-23.99);
      assert(screenY>=63.99&&screenY<=height-143.99,'tank stays clear of tools and thumb pads');
    }
  }
});

test('overview fits the whole board and toggles back without changing touch aim',()=>{
  const c=client();c.run('cssW=874;cssH=290;touchAim={x:0,y:-1};updateCamera()');
  const closeScale=c.run('scale');
  c.elements.get('viewMode').events.click();
  assert.equal(c.elements.get('viewMode').textContent,'CLOSE VIEW');
  assert(c.run('scale')<closeScale);
  assert(c.run('project(0,0).x*scale+offsetX')>=23.99);
  assert(c.run('project(0,0).y*scale+offsetY')>=23.99);
  assert(c.run('project(W,H).x*scale+offsetX')<=850.01);
  assert(c.run('project(W,H).y*scale+offsetY')<=266.01);
  c.run('sendInput()');assert.equal(c.sent.at(-1).aimY,-50);
  c.elements.get('viewMode').events.click();assert.equal(c.run('scale'),closeScale);
  assert.equal(c.elements.get('viewMode').textContent,'FULL MAP');
});

test('desktop camera and mouse unprojection remain unchanged',()=>{
  const c=client(false);c.run('cssW=1120;cssH=610;updateCamera()');
  assert.equal(c.run('scale'),1);assert.equal(c.run('offsetX'),0);assert.equal(c.run('offsetY'),0);
  c.run('aimAt({pointerType:"mouse",clientX:560,clientY:319})');
  assert.equal(c.run('pointer.x'),800);assert.equal(c.run('pointer.y'),527.7);
});

test('fullscreen enters/exits and unavailable or rejected requests use a reversible expanded view',async()=>{
  for(const mode of ['supported','unavailable','rejected']){
    const c=client(),doc=c.sandbox.document,arena=doc.getElementById('arena');
    if(mode==='supported'){
      arena.requestFullscreen=async()=>{doc.fullscreenElement=arena;};
      doc.exitFullscreen=async()=>{doc.fullscreenElement=null;c.documentEvents.fullscreenchange();};
    }else if(mode==='rejected')arena.requestFullscreen=async()=>{throw new Error('Denied');};
    const toggle=c.elements.get('fullscreen').events.click;
    await toggle();assert.equal(c.elements.get('fullscreen').textContent,'EXIT FULL SCREEN');
    assert.equal(arena.classList.contains('expanded'),mode!=='supported');
    await toggle();assert.equal(c.elements.get('fullscreen').textContent,'FULL SCREEN');
    assert.equal(arena.classList.contains('expanded'),false);
    assert.equal(doc.body.classList.contains('arena-expanded'),false);
  }
});

test('Home Assistant prefix is retained for room fetches, WebSockets and invitations',async()=>{
  const c=client(false,'https://ha.example/api/hassio_ingress/token-123/?room=TEST');
  const fetched=[],sockets=[];
  c.sandbox.fetch=async url=>{fetched.push(url);return {ok:true,json:async()=>({rooms:[]})};};
  c.sandbox.clearTimeout=()=>{};c.sandbox.setTimeout=()=>{};
  c.sandbox.WebSocket=class{static OPEN=1;constructor(url){sockets.push(url);}addEventListener(){}close(){}};
  c.run("joined=false;connecting=false;lobbyVisible=true;refreshRooms();connect();");
  await Promise.resolve();
  assert.equal(fetched[0],'https://ha.example/api/hassio_ingress/token-123/rooms');
  assert.equal(sockets[0],'wss://ha.example/api/hassio_ingress/token-123/ws');
  assert.equal(c.run('updateInvite()'),'https://ha.example/api/hassio_ingress/token-123/?room=TEST');
  c.run("networkBase='http://pi.local:8765'");
  assert.equal(c.run('updateInvite()'),'http://pi.local:8765/?room=TEST');
});
