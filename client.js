'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const appBase=new URL('.',document.baseURI||location.href);
const appUrl=name=>new URL(name,appBase).href;
const W=FIELD.width,H=FIELD.height,boardScale=FIELD.viewScale,colors=FIELD.palette.map(p=>p.body);
const shellColors=FIELD.palette.map(p=>({body:p.bullet,glow:p.bullet,trail:p.bullet+'a0',rim:'#374332'}));
let walls=FIELD.walls,spawns=FIELD.spawns,mapId=null;
const keys=new Set(),moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD']);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchMedia=matchMedia('(pointer: coarse) and (hover: none)');
const sticks={move:{id:null,x:0,y:0},aim:{id:null,x:0,y:0}};
let touchAim=null,expanded=false,mapOverview=false;
let cssW=1120,cssH=610,scale=1,offsetX=0,offsetY=0;
let tanks=[],shells=[],particles=[],tracks=[],pickups=[],beams=[],pickupFlashes=[],floaters=[],rings=[],hurt=0,shake=0,last=0,sound=true,audioReady=false,audioContext,soundBank;
let socket=null,myId=null,token=null,joined=false,connecting=false,intentional=false,retry=0,retryTimer;
let latest=null,lastEvent=0,seq=0,rosterSignature='',pointer={x:500,y:330,active:false},firing=false,lastSnapshot=0;
let roomCode=(new URL(location.href).searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16),networkBase=appBase.href.replace(/\/$/,'');
let lobbyVisible=false,lobbyRooms=[],joinMode=null,roomRequest=0;
let selectedGameMode='ffa',leaveDialogOpen=false,tutorialOpen=false,tutorialReturn=null,leaderboardOpen=false;
let roundAudioMap=null,resultAudioKey=null,countdownAudioKey=null,activePower=null,lastMenuSound=-Infinity;
let music=true,musicPlayer,waitingSignature='',resultsSignature='',roomPhase=null,nextHeartbeat=0;
try{sound=localStorage.getItem('tank-frenzy-sfx')!=='off';music=localStorage.getItem('tank-frenzy-music')!=='off';}catch{/* Storage can be unavailable in private browsing. */}
const cueVoices=new Set();
$('roomInput').value=roomCode;$('roomCode').textContent=roomCode||'—';
$('versionBadge').textContent='v'+FIELD.version;
$('versionBadge').setAttribute('aria-label','Tank Frenzy version '+FIELD.version);
function status(text){$('status').textContent=text;}
function networkMessage(title,text,form=false){
  if(form)leaveFullscreen();
  $('waitingRoom').hidden=true;$('countdown').hidden=true;$('results').hidden=true;$('arena').classList.toggle('waiting-room',false);
  document.body.classList.toggle('in-lobby',false);document.body.classList.toggle('in-room-form',form);
  $('arena').classList.toggle('lobby-open',false);$('arena').classList.toggle('room-form-open',form);
  $('overlay').classList.remove('hidden');$('dialogTitle').textContent=title;$('dialogText').textContent=text;
  $('joinFields').hidden=!form;$('action').hidden=!form;$('action').disabled=false;
  lobbyVisible=false;$('roomBrowser').hidden=true;$('browseRooms').hidden=!form;
  $('roomSettings').hidden=!form||joinMode==='join';
}
function showRoomForm(code,mode=null){
  joinMode=mode;$('roomInput').value=code;$('roomInput').readOnly=mode==='join';
  networkMessage(mode==='create'?'Create a room.':'Join '+code+'.',mode==='create'?'Choose a room code and enter your callsign.':'Enter your callsign to join the battle.',true);
  $('action').textContent=mode==='create'?'CREATE & JOIN':'JOIN ARENA';
  $('gameMode').value=selectedGameMode;$('bounceOption').checked=true;$('powersOption').checked=true;
  window.scrollTo?.(0,0);
}
function selectGameMode(mode){selectedGameMode=mode;$('ffaMode').setAttribute('aria-pressed',String(mode==='ffa'));$('teamMode').setAttribute('aria-pressed',String(mode==='teams'));renderRooms();}
$('ffaMode').addEventListener('click',()=>selectGameMode('ffa'));
$('teamMode').addEventListener('click',()=>selectGameMode('teams'));
const phaseNames={waiting:'WAITING',countdown:'STARTING',results:'REMATCH VOTE',postgame:'MATCH ENDED'};
// One row per room: its players and rules are visible at once, and Join is a single tap.
function renderRooms(){
  $('roomList').replaceChildren();
  const rooms=lobbyRooms.filter(room=>(room.settings?.mode||'ffa')===selectedGameMode);
  for(const room of rooms){
    const row=document.createElement('div');row.className='room-row';
    const info=document.createElement('div');info.className='room-choice';
    const title=document.createElement('strong');title.textContent=room.code+' · '+room.players.filter(p=>p.connected).length+'/'+room.capacity+' · '+(phaseNames[room.phase]||'IN GAME');
    const players=document.createElement('small');players.textContent=room.players.map(p=>p.name+(p.team!=null?' ('+(p.team===0?'Orange':'Blue')+')':'')+(p.connected?'':' · reconnecting')).join(', ')||'Empty';
    const rules=document.createElement('small');rules.textContent='Bounce '+(room.settings?.bouncing===false?'off':'on')+' · Powers '+(room.settings?.powers===false?'off':'on');
    info.append(title,players,rules);
    const join=document.createElement('button');join.type='button';join.className='primary room-join';
    const open=room.available>0&&room.phase!=='postgame';
    join.textContent=open?'JOIN':room.phase==='postgame'?'ENDED':'FULL';join.disabled=!open;join.setAttribute('aria-label',open?'Join room '+room.code:'Room '+room.code+' cannot be joined');
    join.addEventListener('click',()=>joinRoomNow(room.code));
    row.append(info,join);$('roomList').append(row);
  }
  $('roomListStatus').textContent=rooms.length?'Tap Join, or Quick Play to jump into the best room.':'No rooms in this mode yet. Quick Play creates one.';
}
async function refreshRooms(){
  if(!lobbyVisible)return;
  const request=++roomRequest;
  try{
    const response=await fetch(appUrl('rooms'));if(!response.ok)throw Error();
    const data=await response.json();
    if(!lobbyVisible||request!==roomRequest)return;
    lobbyRooms=data.rooms;renderRooms();
  }catch{
    if(!lobbyVisible||request!==roomRequest)return;
    lobbyRooms=[];renderRooms();$('roomListStatus').textContent='Could not load rooms. Tap Refresh to try again.';
  }
}
function showLobby(){
  networkMessage('Find your battle.','Pick a room to see who is playing, or create your own.');
  lobbyVisible=true;joinMode=null;lobbyRooms=[];$('roomBrowser').hidden=false;
  document.body.classList.toggle('in-lobby',true);$('arena').classList.toggle('lobby-open',true);
  renderRooms();$('roomListStatus').textContent='Loading rooms…';refreshRooms();
}
$('refreshRooms').addEventListener('click',refreshRooms);
$('browseRooms').addEventListener('click',showLobby);
const newRoomCode=()=>'ROOM-'+Math.random().toString(36).slice(2,7).toUpperCase();
$('createRoom').addEventListener('click',()=>showRoomForm(newRoomCode(),'create'));
// The player's name is remembered on this device and shared by the lobby and the Create/Join form.
function rememberName(value){
  for(const id of ['lobbyName','callsign'])if($(id).value!==value)$(id).value=value;
  try{localStorage.setItem('tank-frenzy-name',value);}catch{}
}
try{rememberName(localStorage.getItem('tank-frenzy-name')||'');}catch{}
for(const id of ['lobbyName','callsign'])$(id).addEventListener('input',()=>rememberName($(id).value));
function joinRoomNow(code,mode='join'){
  enterFullscreen();audioReady=true;
  joinMode=mode;$('roomInput').value=code;$('roomInput').readOnly=mode==='join';
  if(mode==='create'){$('gameMode').value=selectedGameMode;$('bounceOption').checked=true;$('powersOption').checked=true;}
  connect();
}
// Quick Play prefers a waiting room, then the fullest open one, in the chosen mode; otherwise it makes a room.
async function quickPlay(){
  enterFullscreen();
  let rooms=lobbyRooms;
  try{const response=await fetch(appUrl('rooms'));if(response.ok)rooms=(await response.json()).rooms;}catch{/* Use the last list shown. */}
  const open=rooms.filter(room=>(room.settings?.mode||'ffa')===selectedGameMode&&room.available>0&&!['results','postgame'].includes(room.phase))
    .sort((a,b)=>(a.phase==='waiting'?0:1)-(b.phase==='waiting'?0:1)||a.available-b.available);
  if(open.length)joinRoomNow(open[0].code);else joinRoomNow(newRoomCode(),'create');
}
$('quickPlay').addEventListener('click',quickPlay);
setInterval(()=>{if(lobbyVisible&&!document.hidden)refreshRooms();},5000);
function send(data){if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<32768)socket.send(JSON.stringify(data));}
function sendInput(){
  if(!joined||(latest&&latest.phase!=='playing'))return;
  const me=tanks.find(t=>t.id===myId);
  const aim=touchAim?{x:(me?.x??500)+touchAim.x*150,y:(me?.y??330)+touchAim.y*150}:pointer.active?pointer:{x:(me?.x??500)+Math.cos(me?.aim||0)*150,y:(me?.y??330)+Math.sin(me?.aim||0)*150};
  send({type:'input',seq:++seq,x:Math.max(-1,Math.min(1,sticks.move.x+Number(keys.has('KeyD'))-Number(keys.has('KeyA')))),y:Math.max(-1,Math.min(1,sticks.move.y+Number(keys.has('KeyS'))-Number(keys.has('KeyW')))),aimX:aim.x,aimY:aim.y,fire:firing||Math.hypot(sticks.aim.x,sticks.aim.y)>0});
}
function release(){keys.clear();firing=false;for(const name of ['move','aim'])resetStick(name);stopMovementSound();sendInput();}
function connect(){
  if(connecting||joined)return;
  intentional=false;connecting=true;clearTimeout(retryTimer);
  if(retry===0){roomCode=$('roomInput').value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16);token=null;}
  if(!roomCode){connecting=false;networkMessage('Choose a room code.','Enter letters, numbers or hyphens.',true);return;}
  $('roomCode').textContent=roomCode;updateInvite();
  networkMessage(retry?'Reconnecting...':'Joining the field...',retry?'Your tank is reserved briefly while the connection returns.':'Connecting you to room '+roomCode+'.');
  status('CONNECTING');$('latency').textContent='CONNECTING';
  const wsUrl=new URL(appUrl('ws'));wsUrl.protocol=wsUrl.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(wsUrl.href);socket=ws;
  const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN)ws.close();},7000);
  ws.addEventListener('open',()=>{clearTimeout(timeout);ws.send(JSON.stringify({type:'join',room:roomCode,name:$('callsign').value,token,mode:joinMode,settings:{mode:$('gameMode').value,bouncing:$('bounceOption').checked,powers:$('powersOption').checked}}));});
  ws.addEventListener('message',event=>{
    if(socket!==ws)return;
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='welcome'){
      myId=data.id;token=data.token;joinMode=null;seq=Math.max(seq,data.seq+1);joined=true;connecting=false;retry=0;lastEvent=0;rosterSignature='';pointer.active=false;
      touchAim=null;$('overlay').classList.add('hidden');$('leave').hidden=false;updateTouchControls();canvas.focus({preventScroll:true});
      history.replaceState(null,'','?room='+encodeURIComponent(roomCode));sendInput();
    }else if(data.type==='state'){applySnapshot(data);}
    else if(data.type==='pong'){$('latency').textContent=Math.round(performance.now()-data.sent)+' MS';}
    else if(data.type==='error'){intentional=true;joined=false;connecting=false;networkMessage(data.title||'Cannot join this room.',data.message,true);status('CHOOSE A ROOM');}
  });
  ws.addEventListener('error',()=>{});
  ws.addEventListener('close',()=>{
    clearTimeout(timeout);if(socket!==ws)return;
    joined=false;connecting=false;closeLeaveDialog();release();updateTouchControls();$('latency').textContent='OFFLINE';
    if(intentional)return;
    status('CONNECTION LOST');
    if(++retry<=8){networkMessage('Reconnecting...','The connection dropped. Retrying automatically.');retryTimer=setTimeout(connect,Math.min(800*retry,4000));}
    else{retry=0;networkMessage('Server unavailable.','Start the game server on the host, then join again.',true);}
  });
}
function leave(){
  closeLeaveDialog();
  intentional=true;clearTimeout(retryTimer);release();send({type:'leave'});socket?.close();socket=null;joined=false;connecting=false;myId=null;token=null;retry=0;
  latest=null;tanks=[];shells=[];tracks=[];pickups=[];beams=[];pickupFlashes=[];floaters=[];rings=[];hurt=0;$('killFeed').replaceChildren();$('streakBanner').hidden=true;resultsSignature='';$('leave').hidden=true;$('respawn').textContent='';$('latency').textContent='OFFLINE';$('roster').replaceChildren();
  touchAim=null;updateTouchControls();
  roundAudioMap=null;resultAudioKey=null;countdownAudioKey=null;activePower=null;roomPhase=null;waitingSignature='';stopCueSounds();syncMusic();
  roomCode='';$('roomCode').textContent='—';$('roomCount').textContent='0 / 4 PLAYERS';$('powerStatus').hidden=true;history.replaceState(null,'',location.pathname);leaveFullscreen();showLobby();status('READY TO CONNECT');
}
function applySnapshot(data){
  latest=data;lastSnapshot=performance.now();
  updateMatchSounds(data);
  pickups=data.pickups||[];
  if(data.map&&data.map.id!==mapId){mapId=data.map.id;walls=data.map.walls;spawns=data.map.spawns;tracks=[];particles=[];shells=[];beams=[];pickupFlashes=[];floaters=[];rings=[];hurt=0;}
  const previous=new Map(tanks.map(t=>[t.id,t]));
  tanks=data.players.filter(p=>p.connected).map(p=>{
    const before=previous.get(p.id);
    return {...p,x:before&&before.life===p.life?before.x:p.x,y:before&&before.life===p.life?before.y:p.y,
      targetX:p.x,targetY:p.y,recoil:before?.recoil||0,flash:before?.flash||0,track:before?.track||0};
  });
  const oldShells=new Map(shells.map(s=>[s.id,s]));
  shells=data.shells.map(s=>({...s,trail:oldShells.get(s.id)?.trail||[]}));
  for(const e of data.events){if(e.id<=lastEvent)continue;lastEvent=e.id;
    if(e.type==='shot'){const t=tanks.find(t=>t.id===e.player);if(t)t.recoil=5;burst(e.x,e.y,22,shellColors[e.slot].glow,5);playShotSound(e);}
    if(e.type==='bounce'){burst(e.x,e.y,22,shellColors[e.slot].glow,4);if(!playEffect('ricochet',e,{volume:.5,interval:.075,vary:true}))beep(850,.09,'sine',.025);}
    if(e.type==='shell-clash'){burst(e.x,e.y,22,shellColors[e.slot].glow,8);burst(e.x,e.y,22,shellColors[e.otherSlot].glow,8);if(!playEffect('intercept',e,{volume:.5,interval:.075,vary:true}))beep(1050,.08,'triangle',.03);}
    if(e.type==='laser'){beams.push({...e,life:.18});if(!playEffect('laser',e,{volume:.7,interval:.08,key:'laser:'+e.player}))beep(760,.14,'sawtooth',.04);}
    if(e.type==='laser-clear')burst(e.x,e.y,FIELD.turretHeight,shellColors[e.slot].glow,6);
    if(e.type==='pickup'){
      burst(e.x,e.y,22,e.power==='restore'?'#ef5262':'#fff3a0',16);
      if(e.power==='restore'){pickupFlashes.push({...e,life:.8});pickupFlashes=pickupFlashes.slice(-8);}
      if(e.player===myId)playCue('pickup',e.power);
    }
    if(e.type==='hit'||e.type==='destroyed'){
      const dead=e.type==='destroyed',t=tanks.find(t=>t.id===e.player);if(t)t.flash=.16;
      burst(e.x,e.y,22,dead?'#ffbc6c':colors[e.slot],dead?40:14);burst(e.x,e.y,22,'#fff3a0',dead?12:6);
      if(dead){burst(e.x,e.y,30,'#6f6a5e',16);rings.push({x:e.x,y:e.y,life:.55,total:.55});}
      floaters.push({x:e.x,y:e.y,text:'-'+(e.damage||1),color:e.player===myId?'#d8322a':'#b85a1f',life:.9,total:.9});
      floaters=floaters.slice(-24);rings=rings.slice(-8);
      if(dead)playDestroySound(e);else if(!playEffect('hit',e,{volume:.75,priority:2,interval:.07,key:'hit:'+e.player})){beep(100,.22,'sawtooth',.045);rumble(.18,.07,1800);}
      if(e.player===myId)feelHit(dead,e.damage||1);
      if(dead)announceKill(e,data.players);
    }
    if(e.type==='restart'){tracks=[];particles=[];beams=[];pickupFlashes=[];floaters=[];rings=[];hurt=0;}
  }
  updateRoomPhase(data);updateHud(data);
}
function updateRoomPhase(data){
  const waiting=data.phase==='waiting',countdown=data.phase==='countdown',results=data.phase==='results',postgame=data.phase==='postgame';
  $('waitingRoom').hidden=!waiting;$('arena').classList.toggle('waiting-room',waiting);
  $('countdown').hidden=!countdown;
  $('results').hidden=!(results||postgame);
  if(countdown){const number=String(Math.max(1,Math.ceil(data.countdownIn)));if($('countdownNumber').textContent!==number)$('countdownNumber').textContent=number;}
  if(results||postgame){
    const won=data.settings?.mode==='teams'?data.players.find(p=>p.id===myId)?.team===data.winner.team:myId===data.winner.id;
    $('results').classList.toggle('is-blue',data.winner.team===1);
    $('resultsTitle').textContent=data.winner.name+' wins!';
    $('resultsOutcome').textContent=won?'VICTORY!':'GOOD BATTLE!';
    const connected=data.players.filter(p=>p.connected),votes=data.rematchVotes||[],voted=votes.includes(myId);
    const needed=data.rematchNeeded||connected.length,ready=votes.filter(id=>connected.some(p=>p.id===id)).length;
    $('resultsVotes').textContent=postgame?'The rematch window has closed.':ready+' / '+needed+' votes needed for a rematch';
    const board=JSON.stringify(data.players.map(p=>[p.id,p.kills,p.deaths,p.shots,p.hits]));
    if(board!==resultsSignature){
      resultsSignature=board;$('resultsRows').replaceChildren();
      for(const p of [...data.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)){
        const row=document.createElement('tr');if(p.id===myId)row.className='me';
        const cells=[p.name+(p.id===myId?' ★':''),p.kills,p.deaths,p.shots?Math.round(100*Math.min(p.hits,p.shots)/p.shots)+'%':'—'].map(value=>{const cell=document.createElement('td');cell.textContent=value;return cell;});
        cells[0].style.color=colors[p.slot];row.append(...cells);$('resultsRows').append(row);
      }
    }
    $('rematch').disabled=postgame||voted||!joined;
    $('rematch').textContent=postgame?'REMATCH CLOSED':voted?'READY ✓':'REMATCH';
    $('resultsTimer').textContent=postgame?'Leave the room to start or join a new battle.':'Rematch starts when most players vote. '+Math.ceil(data.rematchIn)+'s left.';
  }
  if(waiting){
    const signature=JSON.stringify([data.ownerId,data.players.map(p=>[p.id,p.name,p.connected,p.team])]);
    if(signature!==waitingSignature){
      waitingSignature=signature;$('waitingPlayers').replaceChildren();
      for(const p of data.players){
        const item=document.createElement('li');item.style.setProperty('--tank',colors[p.slot]);
        item.textContent=p.name+(p.id===myId?' · YOU':'')+(p.team!=null?' · '+(p.team===0?'Orange team':'Blue team'):'')+(p.id===data.ownerId?' · STARTER':'')+(p.connected?'':' · Reconnecting');
        $('waitingPlayers').append(item);
      }
    }
    const mine=data.ownerId===myId,owner=data.players.find(p=>p.id===data.ownerId);
    $('startGame').hidden=!mine;$('startGame').disabled=!mine;
    $('waitingTitle').textContent='Room '+data.room;
    const bots=data.players.filter(p=>p.bot).length,skill=data.botSkill||'normal';
    $('botControls').hidden=!mine;$('addBot').disabled=data.players.length>=FIELD.maxPlayers;$('removeBot').disabled=!bots;
    if($('botSkill').value!==skill)$('botSkill').value=skill;
    $('waitingMessage').textContent=mine?(data.players.length===1?'Playing alone? Add bots or invite friends, then press Start Game.':'Press Start Game when everyone is ready.')+(bots?' Bots: '+skill+'.':'')
      :'Waiting for '+(owner?.name||'a player')+' to start the game.'+(bots?' Bots: '+skill+'.':'');
  }
  if(roomPhase!==data.phase){roomPhase=data.phase;release();updateTouchControls();resize();syncMusic();}
}
$('addBot').addEventListener('click',()=>send({type:'bot',action:'add'}));
$('removeBot').addEventListener('click',()=>send({type:'bot',action:'remove'}));
$('botSkill').addEventListener('change',()=>send({type:'bot',action:'skill',skill:$('botSkill').value}));
$('startGame').addEventListener('click',()=>{if(joined&&latest?.phase==='waiting'&&latest.ownerId===myId){enterFullscreen();release();send({type:'start'});}});
$('rematch').addEventListener('click',()=>{if(joined&&latest?.phase==='results'&&latest.rematchIn>0&&!latest.rematchVotes?.includes(myId)){send({type:'rematch'});$('rematch').disabled=true;}});
// The round is over, so leaving from the result card needs no extra confirmation.
$('resultsLeave').addEventListener('click',leave);
function updateHud(data){
  const count=data.players.filter(p=>p.connected).length;
  $('roomCount').textContent=count+' / 4 PLAYERS';
  const signature=JSON.stringify(data.players.map(p=>[p.id,p.name,p.slot,p.hp,p.kills,p.deaths,p.connected,p.team]));
  if(signature!==rosterSignature){
    rosterSignature=signature;$('roster').replaceChildren();
    for(const p of [...data.players].sort((a,b)=>b.kills-a.kills||a.slot-b.slot)){
      const card=document.createElement('div');card.className='roster-card'+(p.id===myId?' me':'')+(!p.connected?' offline':'');card.style.setProperty('--tank',colors[p.slot]);
      const title=document.createElement('div');title.className='roster-name';title.textContent=(p.team!=null?(p.team===0?'ORANGE · ':'BLUE · '):'')+p.name+(p.id===myId?' / YOU':'');
      const health=document.createElement('div');health.className='health';health.setAttribute('aria-label',p.hp+' / '+FIELD.maxHealth+' health');health.title=p.hp+' / '+FIELD.maxHealth+' health';
      // Each of five pips holds two hits, preserving the single-row mobile header.
      for(let i=0;i<FIELD.maxHealth/2;i++){const pip=document.createElement('span');pip.className='pip'+(p.hp<=i*2?' empty':p.hp===i*2+1?' half':'');health.append(pip);}
      const stats=document.createElement('div');stats.className='roster-stats';stats.textContent=p.connected?p.kills+' KILLS / '+p.deaths+' DEATHS':'RECONNECTING';
      card.append(title,health,stats);$('roster').append(card);
    }
  }
  const me=data.players.find(p=>p.id===myId);
  if(data.phase==='waiting'){$('respawn').textContent='';status('WAITING ROOM / INVITE YOUR FRIENDS');}
  else if(data.phase==='countdown'){$('respawn').textContent='';status('GET READY');}
  else if(data.winner){$('respawn').textContent='';status(data.phase==='results'?'MATCH COMPLETE / REMATCH VOTE':'MATCH COMPLETE / REMATCH CLOSED');}
  else if(me?.hp<=0){$('respawn').textContent='Tank destroyed. Respawning in '+Math.ceil(me.respawnIn)+'s';status('REGROUPING');}
  else{$('respawn').textContent='';status(data.settings?.mode==='teams'?'ORANGE '+data.teamScores[0]+' — '+data.teamScores[1]+' BLUE / FIRST TO 10':count<2?'PRACTICE / WAITING FOR PLAYER 2':'LIVE BATTLE / FIRST TO 10 KILLS');}
  const power=me?.hp>0&&me?.powerRemaining>0&&FIELD.powers.includes(me.power)?me.power:null;
  const badge=$('powerStatus');badge.hidden=!power;
  if(power){
    const seconds=Math.ceil(me.powerRemaining),label=FpowerLabel(power)+' · '+seconds+' seconds remaining';
    badge.title=label;badge.setAttribute('aria-label',label);
    badge.style.setProperty('--power-color',powerColors[power]);
    badge.classList.toggle('expiring',me.powerRemaining<=3);
    if(activePower!==power)$('powerGlyph').setAttribute('href','#power-'+power);
    $('powerTime').textContent=seconds+'s';
    $('powerMeter').style.transform='scaleX('+Math.max(0,Math.min(1,me.powerRemaining/FIELD.powerDuration))+')';
  }
  activePower=power;
}
function FpowerLabel(power){return FIELD.powerLabels[power]||power;}
function updateInvite(){
  const invite=networkBase+'/'+(roomCode?'?room='+encodeURIComponent(roomCode):'');
  const link=document.createElement('a');link.href=invite;link.textContent=invite;
  $('networkLinks').replaceChildren('Friends on the same Wi-Fi: ',link,document.createElement('br'),'Use room '+roomCode+'. Keep the host server running.');
  return invite;
}
fetch(appUrl('network-info')).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  if(data.ingress)$('adminLink').hidden=false;
  if(data.publicUrl)networkBase=data.publicUrl.replace(/\/$/,'');
  else if(!data.ingress&&['localhost','127.0.0.1','[::1]'].includes(location.hostname))networkBase=data.urls.find(u=>u.startsWith('http://192.168.'))||data.urls[0]||location.origin;
  updateInvite();
}).catch(()=>{$('networkLinks').textContent='Start the network server with npm start, then open its address in each browser.';});
$('copy').addEventListener('click',async()=>{const invite=updateInvite();try{await navigator.clipboard.writeText(invite);$('copy').textContent='LINK COPIED';setTimeout(()=>$('copy').textContent='COPY INVITE',1800);}catch{$('networkNote').textContent='Invite link: '+invite;status('INVITE LINK SHOWN BELOW THE ARENA');}});
$('joinForm').addEventListener('submit',e=>{e.preventDefault();enterFullscreen();audioReady=true;playCue('menu');connect();});
function closeLeaveDialog(){leaveDialogOpen=false;$('leaveDialog').hidden=true;}
function requestLeave(){if(!joined)return;release();leaveDialogOpen=true;$('leaveDialog').hidden=false;$('cancelLeave').focus();}
$('leave').addEventListener('click',requestLeave);
$('cancelLeave').addEventListener('click',()=>{closeLeaveDialog();canvas.focus({preventScroll:true});});
$('confirmLeave').addEventListener('click',leave);
$('leaveDialog').addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();e.stopPropagation();closeLeaveDialog();canvas.focus({preventScroll:true});}
  if(e.code==='Tab'){e.preventDefault();(document.activeElement===$('cancelLeave')?$('confirmLeave'):$('cancelLeave')).focus();}
});
const tutorialPages=[['lessonWin','How to win'],['lessonPc','PC controls'],['lessonMobile','Phone controls'],['lessonFind','Find your tank'],['lessonHit','Getting hit'],['lessonBounce','Bouncing bullets'],['lessonTokens','Power-up tokens'],['lessonPowers','Power-up effects']];
let tutorialPage=0,tutorialSwipe=null;
const tutorialDots=tutorialPages.map(([,title],i)=>{
  const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','Page '+(i+1)+': '+title);
  dot.addEventListener('click',()=>showTutorialPage(i));$('tutorialDots').append(dot);return dot;
});
function showTutorialPage(page){
  const previous=tutorialPage,last=tutorialPages.length-1;
  tutorialPage=Math.max(0,Math.min(last,page));
  $('tutorialBody').setAttribute('data-dir',tutorialPage<previous?'back':'forward');
  tutorialPages.forEach(([id],i)=>{$(id).hidden=i!==tutorialPage;tutorialDots[i].setAttribute('aria-current',i===tutorialPage?'step':'false');});
  $('tutorialCount').textContent=(tutorialPage+1)+' / '+tutorialPages.length;
  $('tutorialPrev').disabled=tutorialPage===0;
  $('tutorialNext').textContent=tutorialPage===last?"LET'S PLAY ✓":'NEXT ›';
  $('tutorialNext').setAttribute('aria-label',tutorialPage===last?'Close how to play':'Next page');
}
function openTutorial(){
  release();tutorialOpen=true;tutorialReturn=document.activeElement;tutorialPage=0;showTutorialPage(0);
  $('tutorial').hidden=false;document.body.classList.add('tutorial-open');$('tutorialNext').focus();
}
function closeTutorial(){
  tutorialOpen=false;$('tutorial').hidden=true;document.body.classList.remove('tutorial-open');
  tutorialReturn?.focus?.({preventScroll:true});tutorialReturn=null;
}
$('howToPlay').addEventListener('click',openTutorial);
// Leaderboard kept by the server (saved on the Pi in the Home Assistant app): by period and region.
let leaderboardPeriod='all',leaderboardCountry='',leaderboardRequest=0;
const flagOf=code=>/^[A-Z]{2}$/.test(code||'')?String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0))):'';
function regionName(code){try{return new Intl.DisplayNames(['en'],{type:'region'}).of(code);}catch{return code;}}
async function loadLeaderboard(){
  const request=++leaderboardRequest;
  for(const button of $('leaderboardPeriods').children||[])button.setAttribute?.('aria-pressed',String(button.dataset?.period===leaderboardPeriod));
  $('leaderboardRows').replaceChildren();$('leaderboardNote').textContent='Loading…';
  try{
    const response=await fetch(appUrl('leaderboard?period='+leaderboardPeriod+'&country='+leaderboardCountry));if(!response.ok)throw Error();
    const data=await response.json();if(request!==leaderboardRequest)return;
    data.players.forEach((p,i)=>{
      const row=document.createElement('tr');
      for(const value of [i<3?['🥇','🥈','🥉'][i]:i+1,p.name+(p.country?' '+flagOf(p.country):''),p.wins,p.matches,p.kills,(p.kills/Math.max(1,p.deaths)).toFixed(1)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      $('leaderboardRows').append(row);
    });
    const regions=[['','All regions'],...(data.countries||[]).map(c=>[c.code,flagOf(c.code)+' '+regionName(c.code)+' ('+c.players+')'])];
    $('leaderboardRegion').replaceChildren(...regions.map(([code,label])=>{const option=document.createElement('option');option.value=code;option.textContent=label;return option;}));
    $('leaderboardRegion').value=leaderboardCountry;
    const when={day:'today',week:'this week',month:'this month',all:'yet'}[leaderboardPeriod];
    $('leaderboardNote').textContent=(data.players.length?'':'No finished matches '+when+(leaderboardCountry?' in this region':'')+'. ')+(data.persistent?'Saved on the Pi across restarts.':'Resets when the game server restarts.');
  }catch{if(request===leaderboardRequest)$('leaderboardNote').textContent='Could not load the leaderboard. Try again in a moment.';}
}
async function openLeaderboard(){
  release();leaderboardOpen=true;$('leaderboard').hidden=false;document.body.classList.add('tutorial-open');$('closeLeaderboard').focus();
  await loadLeaderboard();
}
$('leaderboardPeriods').addEventListener('click',e=>{const tab=e.target.closest?.('[data-period]');if(tab){leaderboardPeriod=tab.dataset.period;loadLeaderboard();}});
$('leaderboardRegion').addEventListener('change',()=>{leaderboardCountry=$('leaderboardRegion').value;loadLeaderboard();});
function closeLeaderboard(){leaderboardOpen=false;$('leaderboard').hidden=true;if(!tutorialOpen)document.body.classList.remove('tutorial-open');}
$('leaderboardButton').addEventListener('click',openLeaderboard);
$('closeLeaderboard').addEventListener('click',closeLeaderboard);
$('leaderboard').addEventListener('click',e=>{if(e.target===$('leaderboard'))closeLeaderboard();});
$('closeTutorial').addEventListener('click',closeTutorial);
$('tutorialPrev').addEventListener('click',()=>showTutorialPage(tutorialPage-1));
$('tutorialNext').addEventListener('click',()=>{if(tutorialPage===tutorialPages.length-1)closeTutorial();else showTutorialPage(tutorialPage+1);});
$('tutorial').addEventListener('click',e=>{if(e.target===$('tutorial'))closeTutorial();});
// A horizontal swipe turns the page on touch screens; vertical drags still scroll long text.
$('tutorialBody').addEventListener('pointerdown',e=>{tutorialSwipe=e.pointerType==='mouse'?null:{x:e.clientX,y:e.clientY};});
$('tutorialBody').addEventListener('pointercancel',()=>{tutorialSwipe=null;});
$('tutorialBody').addEventListener('pointerup',e=>{
  if(!tutorialSwipe)return;
  const dx=e.clientX-tutorialSwipe.x,dy=e.clientY-tutorialSwipe.y;tutorialSwipe=null;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)showTutorialPage(tutorialPage+(dx<0?1:-1));
});
function updateAudioButtons(){
  $('sound').textContent=sound?'EFFECTS ON':'EFFECTS OFF';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('data-icon',sound?'🔊':'🔇');
  $('music').textContent=music?'MUSIC ON':'MUSIC OFF';$('music').setAttribute('aria-pressed',String(music));$('music').setAttribute('data-icon',music?'🎵':'🔕');
}
function rememberAudio(){try{localStorage.setItem('tank-frenzy-sfx',sound?'on':'off');localStorage.setItem('tank-frenzy-music',music?'on':'off');}catch{}}
function syncMusic(){
  if(!music||!audioReady||document.hidden){musicPlayer?.stop();return;}
  const ac=getAudio(true);if(!ac||typeof TankMusic==='undefined')return;
  musicPlayer??=new TankMusic(ac);
  const key=`${roomCode}:${latest?.mapId??latest?.map?.id}`;
  musicPlayer.play(joined&&['playing','results'].includes(latest?.phase)?'battle':'lobby',key);
  if(joined&&latest?.phase==='countdown')musicPlayer.prepareBattle(key);
}
function unlockAudio(){audioReady=true;syncMusic();}
$('sound').addEventListener('click',()=>{sound=!sound;audioReady=true;updateAudioButtons();rememberAudio();if(sound)playCue('menu');else{stopMovementSound();stopCueSounds();}syncMusic();});
$('music').addEventListener('click',()=>{music=!music;audioReady=true;updateAudioButtons();rememberAudio();syncMusic();});
updateAudioButtons();
document.addEventListener('pointerdown',unlockAudio,{once:true});
document.addEventListener('keydown',unlockAudio,{once:true});
document.addEventListener('click',event=>{
  const control=event.target.closest?.('button, summary');
  if(!control||control.disabled||control.id==='sound'||control.id==='music')return;
  unlockAudio();
  if(performance.now()-lastMenuSound<80)return;
  lastMenuSound=performance.now();playCue('menu');
});
document.addEventListener('change',event=>{
  if(event.target.matches?.('input[type="checkbox"], select')){audioReady=true;playCue('menu');}
});
function aimAt(e){
  if(e.pointerType==='touch')return;
  touchAim=null;
  const rect=canvas.getBoundingClientRect();
  pointer={...FIELD.unproject((e.clientX-rect.left-offsetX)/scale,(e.clientY-rect.top-offsetY)/scale,22),active:true};
}
canvas.addEventListener('pointermove',aimAt);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||!joined)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);aimAt(e);audioReady=true;firing=true;sendInput();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{firing=false;sendInput();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.code==='Escape'){release();if(leaderboardOpen){closeLeaderboard();return;}if(tutorialOpen){closeTutorial();return;}if(leaveDialogOpen){closeLeaveDialog();return;}if(expanded)setExpanded(false);}if(tutorialOpen&&(e.code==='ArrowRight'||e.code==='ArrowLeft')){e.preventDefault();showTutorialPage(tutorialPage+(e.code==='ArrowRight'?1:-1));return;}if(leaderboardOpen||tutorialOpen||leaveDialogOpen||!joined||e.target instanceof HTMLInputElement)return;if(moveKeys.has(e.code)){e.preventDefault();keys.add(e.code);if(!e.repeat)sendInput();}});
window.addEventListener('keyup',e=>{if(moveKeys.has(e.code)){keys.delete(e.code);sendInput();}});
window.addEventListener('blur',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden){release();stopCueSounds();}syncMusic();});
window.addEventListener('pagehide',()=>{release();stopCueSounds();musicPlayer?.stop();send({type:'leave'});});
window.addEventListener('beforeunload',e=>{if(joined){e.preventDefault();e.returnValue='';}});

function resetStick(name){
  const stick=sticks[name],pad=$(name+'Stick'),id=stick.id;
  stick.id=null;stick.x=0;stick.y=0;
  pad.style.setProperty('--stick-x','0px');pad.style.setProperty('--stick-y','0px');
  if(id!==null&&pad.hasPointerCapture(id))pad.releasePointerCapture(id);
}
function updateStick(name,e){
  const stick=sticks[name],pad=$(name+'Stick'),rect=pad.getBoundingClientRect();
  const radius=rect.width*.32,dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
  const distance=Math.hypot(dx,dy),amount=Math.min(1,distance/radius);
  // A small dead zone prevents firing or drifting from resting thumbs.
  const power=amount<.2?0:(amount-.2)/.8;
  stick.x=distance?dx/distance*power:0;stick.y=distance?dy/distance*power:0;
  pad.style.setProperty('--stick-x',(distance?dx/distance*amount*radius:0)+'px');
  pad.style.setProperty('--stick-y',(distance?dy/distance*amount*radius:0)+'px');
  if(name==='aim'&&power){touchAim={x:dx/distance,y:dy/distance};pointer.active=false;}
}
for(const name of ['move','aim']){
  const pad=$(name+'Stick');
  pad.addEventListener('pointerdown',e=>{
    if(leaveDialogOpen||!touchMedia.matches||!joined||e.pointerType!=='touch'||sticks[name].id!==null)return;
    e.preventDefault();sticks[name].id=e.pointerId;pad.setPointerCapture(e.pointerId);audioReady=true;updateStick(name,e);sendInput();
  });
  pad.addEventListener('pointermove',e=>{if(sticks[name].id===e.pointerId){e.preventDefault();updateStick(name,e);}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,e=>{
    if(sticks[name].id!==e.pointerId)return;
    resetStick(name);sendInput();
  });
  pad.addEventListener('contextmenu',e=>e.preventDefault());
}
function updateTouchControls(){
  const mobile=touchMedia.matches;
  setArenaMenu(false);
  $('arena').classList.toggle('mobile-active',mobile&&joined);
  document.body.classList.toggle('mobile-playing',mobile&&joined);
  $('viewMode').hidden=!mobile||!joined;
  $('thumbControls').hidden=!mobile||!joined||(latest?.phase!=null&&latest.phase!=='playing');
  document.body.classList.toggle('in-room',joined&&!mobile);
  $('introControls').textContent=mobile?'Left thumb to move. Right thumb to aim and fire.':'Move with WASD. Aim with your mouse. Click to fire.';
  $('networkNote').textContent=mobile?'LEFT THUMB / MOVE · RIGHT THUMB / AIM + FIRE':'WASD / MOVE · MOUSE / AIM · LEFT CLICK / FIRE';
  canvas.setAttribute('aria-label',mobile?'Tank arena. Use the left thumb control to move and the right thumb control to aim and fire.':'Tank arena. Use W A S D to move, point the mouse to aim, and hold left click to fire.');
}
touchMedia.addEventListener?.('change',()=>{release();updateTouchControls();});
updateTouchControls();
function setArenaMenu(open){
  $('arena').classList.toggle('menu-open',open);
  $('arenaMenu').setAttribute('aria-expanded',String(open));
}
$('arenaMenu').addEventListener('click',()=>{release();setArenaMenu(!$('arena').classList.contains('menu-open'));});
$('arenaActions').addEventListener('click',e=>{if(e.target.closest('button'))setArenaMenu(false);});
document.addEventListener('pointerdown',e=>{if(!$('arenaHeader').contains(e.target))setArenaMenu(false);});
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&$('arena').classList.contains('menu-open')){setArenaMenu(false);$('arenaMenu').focus();}});
$('viewMode').addEventListener('click',()=>{
  release();mapOverview=!mapOverview;
  $('viewMode').textContent=mapOverview?'CLOSE VIEW':'FULL MAP';
  $('viewMode').setAttribute('aria-pressed',String(mapOverview));
  updateCamera();
});

function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
function updateFullscreen(){
  const active=expanded||fullscreenElement()===$('arena');
  $('fullscreen').textContent=active?'EXIT FULL SCREEN':'FULL SCREEN';
  $('fullscreen').setAttribute('aria-pressed',String(active));
}
function setExpanded(value){
  expanded=value;
  $('arena').classList.toggle('expanded',value);
  document.body.classList.toggle('arena-expanded',value);
  $('viewNote').textContent=value?'Expanded view. Your browser does not allow true fullscreen here. Rotate your phone for a wider field.':'';
  updateFullscreen();
}
// Create/Join and Start Game go fullscreen from the same tap. Without element
// fullscreen (iPhone Safari), touch play already fills the browser view.
function enterFullscreen(){
  if(expanded||fullscreenElement())return;
  const arena=$('arena'),request=arena.requestFullscreen||arena.webkitRequestFullscreen;
  try{
    Promise.resolve(request?.call(arena)).then(()=>{if(touchMedia.matches)return screen.orientation?.lock?.('landscape');}).catch(()=>{});
  }catch{/* Fullscreen was refused; keep the page layout. */}
}
function leaveFullscreen(){
  if(expanded)setExpanded(false);
  try{screen.orientation?.unlock?.();}catch{}
  if(fullscreenElement()===$('arena')){try{Promise.resolve((document.exitFullscreen||document.webkitExitFullscreen).call(document)).catch(()=>{});}catch{}}
}
$('fullscreen').addEventListener('click',async()=>{
  release();
  if(expanded){setExpanded(false);return;}
  if(fullscreenElement()){
    try{await (document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch{$('viewNote').textContent='Use your browser fullscreen control to exit.';}
    return;
  }
  const arena=$('arena'),request=arena.requestFullscreen||arena.webkitRequestFullscreen;
  if(request){
    try{await request.call(arena);$('viewNote').textContent='';updateFullscreen();return;}catch{/* Use an expanded browser view when fullscreen is unavailable. */}
  }
  setExpanded(true);
});
for(const type of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(type,()=>{release();updateFullscreen();});
window.addEventListener('resize',release);
setInterval(sendInput,1000/30);
setInterval(()=>{if(joined){send({type:'ping',sent:performance.now()});if(performance.now()-lastSnapshot>4000)socket?.close();}},2000);


let engine=null;
// Snapshot transitions trigger a cue once, even though the server repeats state.
function updateMatchSounds(data){
  const map=data.map?.id??mapId;
  if(data.phase==='countdown'){
    resultAudioKey=null;
    const number=Math.max(1,Math.min(3,Math.ceil(data.countdownIn)));
    const key=`${map}:${number}`;
    if(countdownAudioKey!==key){countdownAudioKey=key;playCue('countdown'+number);}
    return;
  }
  countdownAudioKey=null;
  if(data.phase==='waiting'){resultAudioKey=null;return;}
  if(roundAudioMap!==map){roundAudioMap=map;resultAudioKey=null;if(!data.winner)playCue('start');}
  if(!data.winner){resultAudioKey=null;return;}
  const key=String(map)+':'+(data.winner.team??data.winner.id);
  if(resultAudioKey===key)return;
  resultAudioKey=key;
  const me=data.players.find(p=>p.id===myId);if(!me)return;
  const won=data.settings?.mode==='teams'?me.team===data.winner.team:me.id===data.winner.id;
  playCue(won?'win':'lose');
}
// A short kill feed, plus a banner when a player reaches a streak without being destroyed.
const streakCalls={3:'is on fire! 🔥',5:'is unstoppable! ⚡',7:'is a tank legend! 👑'};
let streakTimer;
function announceKill(e,players){
  const killer=players.find(p=>p.id===e.by),victim=players.find(p=>p.id===e.player);
  const item=document.createElement('li');
  const tag=(player,fallback)=>{const name=document.createElement('b');name.textContent=player?.name||fallback;name.style.color=player?colors[player.slot]:'#6a765e';return name;};
  item.append(tag(killer,'Someone'),' 💥 ',tag(victim,'a tank'));
  if(e.by===myId||e.player===myId)item.className='mine';
  $('killFeed').prepend(item);
  while($('killFeed').children.length>4)$('killFeed').lastElementChild.remove();
  setTimeout(()=>item.remove(),4500);
  const call=streakCalls[e.streak];
  if(killer&&call){
    $('streakBanner').textContent=(killer.id===myId?'You':killer.name)+' '+(killer.id===myId?call.replace(/^is /,'are '):call);
    $('streakBanner').hidden=false;clearTimeout(streakTimer);streakTimer=setTimeout(()=>{$('streakBanner').hidden=true;},2600);
  }
}
// Your own hits: fiery screen edges, a harder shake and, on phones that support it, a buzz.
function feelHit(dead,damage){
  hurt=Math.min(1,hurt+(dead?1:.3+.15*damage));
  shake=reducedMotion?0:dead?12:4+damage;
  if(sound)window.navigator?.vibrate?.(dead?[90,50,160]:damage>1?70:35);
}
function stopCueSounds(){
  soundBank?.stop();
  for(const voice of cueVoices){voice.gain.gain.cancelScheduledValues(audioContext.currentTime);voice.gain.gain.setValueAtTime(0,audioContext.currentTime);voice.osc.stop();}
  cueVoices.clear();
}
function playEffect(name,event=null,options={}){
  // A suppressed effect counts as handled; don't invoke the fallback while muted.
  if(!sound||!audioReady||document.hidden)return true;
  if(!getAudio())return true;
  if(!soundBank)return false;
  const me=tanks.find(t=>t.id===myId);
  let volume=options.volume??1,pan=0;
  if(event&&me&&Number.isFinite(event.x)&&Number.isFinite(event.y)){
    const distance=Math.hypot(event.x-me.x,event.y-me.y);
    volume*=Math.max(.2,1/(1+distance/600));pan=Math.max(-.55,Math.min(.55,(event.x-me.x)/750));
  }
  return soundBank.play(name,{...options,volume,pan});
}
function playCue(kind,power){
  if(document.hidden)return;
  const sample=kind==='pickup'?'restore':kind;
  if(playEffect(sample,null,{channel:'cue',volume:kind==='menu'?.45:.85,priority:kind==='menu'?1:3,interval:kind==='menu'?.07:0,duck:kind==='win'||kind==='lose'}))return;
  const ac=getAudio();if(!ac)return;
  const melody={menu:[[660,0,.07],[880,.045,.08]],countdown3:[[330,0,.12]],countdown2:[[392,0,.12]],countdown1:[[440,0,.12]],start:[[392,0,.11],[523,.13,.11],[659,.26,.11],[784,.39,.26]],win:[[523,0,.14],[659,.15,.14],[784,.3,.16],[1047,.49,.4]],lose:[[392,0,.18],[330,.2,.18],[262,.4,.33]],pickup:[[659,0,.1],[988,.1,.12],[1319,.22,.18]]}[kind];
  if(!melody)return;
  // UI and celebratory sounds are short, local synth notes, with a fixed voice cap.
  if(cueVoices.size+melody.length>16)stopCueSounds();
  for(const [frequency,delay,duration] of melody){
    const osc=ac.createOscillator(),gain=ac.createGain(),at=ac.currentTime+delay,voice={osc,gain};
    osc.type='triangle';osc.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.setValueAtTime(.001,at);
    gain.gain.exponentialRampToValueAtTime(kind==='menu'?.035:.07,at+.008);
    gain.gain.exponentialRampToValueAtTime(.001,at+duration);
    osc.connect(gain);gain.connect(ac.destination);cueVoices.add(voice);
    osc.onended=()=>{cueVoices.delete(voice);osc.disconnect();gain.disconnect();};
    osc.start(at);osc.stop(at+duration+.02);
  }
}
function playDestroySound(event){if(playEffect('explosion',event,{priority:2,volume:1}))return;beep(90,.35,'sawtooth',.10);rumble(.8,.28,700);}
function playShotSound(event){
  const power=event.power!==undefined?event.power:tanks.find(t=>t.id===event.player)?.power;
  const sample=power==='double'?'double':'shot';
  if(playEffect(sample,event,{volume:power==='machine'?.4:.6,interval:sample==='double'?.12:.06,key:'shot:'+event.player,vary:sample!=='double'}))return;
  beep(160+event.slot*30,.15,'triangle',.065);rumble(.12,.065,1500);
}
// Low-health heartbeat: two soft low thumps ("lub-dub"), muted with Effects.
function playHeartbeat(){
  const ac=getAudio();if(!ac||document.hidden)return;
  for(const [delay,volume] of [[0,.16],[.17,.11]]){
    const osc=ac.createOscillator(),gain=ac.createGain(),at=ac.currentTime+delay;
    osc.type='sine';osc.frequency.setValueAtTime(70,at);osc.frequency.exponentialRampToValueAtTime(42,at+.14);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.16);
    osc.connect(gain);gain.connect(soundBank?.combat||ac.destination);trackFallback(osc,gain,()=>{osc.disconnect();gain.disconnect();});osc.start(at);osc.stop(at+.18);
  }
}
function stopMovementSound(){
  if(!engine)return;
  const now=audioContext.currentTime;
  engine.gain.gain.cancelScheduledValues(now);
  engine.gain.gain.setValueAtTime(0,now);
}
function updateMovementSound(speed){
  if(!joined||!sound||!audioReady||document.hidden||latest?.winner||latest?.phase==='waiting'||latest?.phase==='countdown'||performance.now()-lastSnapshot>500||speed<5){stopMovementSound();return;}
  const ac=getAudio();if(!ac)return;
  if(!engine){
    const motor=ac.createOscillator(),tracks=ac.createOscillator(),filter=ac.createBiquadFilter(),gain=ac.createGain();
    motor.type='sawtooth';tracks.type='triangle';filter.type='lowpass';filter.frequency.value=220;
    gain.gain.value=0;motor.connect(filter);tracks.connect(filter);filter.connect(gain);gain.connect(soundBank?.combat||ac.destination);
    motor.start();tracks.start();engine={motor,tracks,gain};
  }
  const throttle=Math.min(1,speed/170),now=ac.currentTime;
  engine.motor.frequency.setTargetAtTime(48+throttle*30,now,.08);
  engine.tracks.frequency.setTargetAtTime(23+throttle*15,now,.08);
  engine.gain.gain.setTargetAtTime(.012+throttle*.014,now,.05);
}

function audioUnavailable(){sound=false;music=false;stopMovementSound();stopCueSounds();musicPlayer?.stop();updateAudioButtons();}
function getAudio(forMusic=false){
  if(!audioReady||!(forMusic?music:sound))return null;
  try{
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();
    if(!soundBank&&typeof TankSoundBank!=='undefined')soundBank=new TankSoundBank(audioContext);
    if(audioContext.state==='suspended')audioContext.resume().catch(audioUnavailable);
    return audioContext;
  }catch{audioUnavailable();return null;}
}
function trackFallback(source,gain,cleanup){
  if(cueVoices.size>=16){const oldest=cueVoices.values().next().value;oldest.gain.gain.cancelScheduledValues(audioContext.currentTime);oldest.gain.gain.setValueAtTime(0,audioContext.currentTime);oldest.osc.stop();cueVoices.delete(oldest);}
  const voice={osc:source,gain};cueVoices.add(voice);
  source.onended=()=>{cueVoices.delete(voice);cleanup();};
}
function beep(freq,duration,type='sine',volume=.035){const ac=getAudio();if(!ac||document.hidden)return;const osc=ac.createOscillator(),gain=ac.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.3),ac.currentTime+duration);gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.connect(gain);gain.connect(ac.destination);trackFallback(osc,gain,()=>{osc.disconnect();gain.disconnect();});osc.start();osc.stop(ac.currentTime+duration);}
function rumble(duration,volume,frequency){const ac=getAudio();if(!ac||document.hidden)return;const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);source.connect(filter);filter.connect(gain);gain.connect(ac.destination);trackFallback(source,gain,()=>{source.disconnect();filter.disconnect();gain.disconnect();});source.start();source.stop(ac.currentTime+duration);}
function resize(){const rect=canvas.getBoundingClientRect();cssW=rect.width;cssH=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);updateCamera();}
function updateCamera(){
  const me=joined&&touchMedia.matches&&tanks.find(t=>t.id===myId);
  if(!me){
    scale=Math.min(cssW/1120,cssH/610);offsetX=(cssW-1120*scale)/2;offsetY=(cssH-610*scale)/2;
    return;
  }
  // Fit the board itself for overview, not the old presentation frame's empty margins.
  const margin=24,topLeft=project(0,0),bottomRight=project(W,H);
  const fit=Math.max(.01,Math.min((cssW-margin*2)/(W*boardScale),(cssH-margin*2)/(H*boardScale)));
  // At least 0.7 CSS pixels per world unit: a 48-unit tank is 34px wide.
  scale=mapOverview?fit:Math.max(fit,1.4,Math.min(cssW,cssH)/280);
  const focus=project(me.x,me.y);
  function axis(size,start,end,target,before=margin,after=margin){
    if((end-start)*scale<=size-before-after)return (size-(start+end)*scale)/2;
    return Math.max(size-after-end*scale,Math.min(before-start*scale,(size+before-after)/2-target*scale));
  }
  offsetX=axis(cssW,topLeft.x,bottomRight.x,focus.x);
  // Leave room for the top tools and bottom thumb pads near map boundaries.
  offsetY=axis(cssH,topLeft.y,bottomRight.y,focus.y,mapOverview?margin:64,mapOverview?margin:144);
}
function project(x,y,z=0){return FIELD.project(x,y,z);}
function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke();}}
function line3(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>{const s=project(...p);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function tint(hex,factor){const n=parseInt(hex.slice(1),16);return `rgb(${Math.min(255,Math.round((n>>16)*factor))},${Math.min(255,Math.round((n>>8&255)*factor))},${Math.min(255,Math.round((n&255)*factor))})`;}
function box(x,y,w,h,z,height,color,angle=0){const c=Math.cos(angle),s=Math.sin(angle);const verts=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([a,b])=>[x+a*c-b*s,y+a*s+b*c]);const base=verts.map(p=>project(...p,z)),top=verts.map(p=>project(...p,z+height));const faces=[];for(let i=0;i<4;i++){const j=(i+1)%4;const cross=(top[j].x-top[i].x)*(base[j].y-top[j].y);if(cross>0)faces.push({pts:[top[i],top[j],base[j],base[i]],depth:(base[i].y+base[j].y)/2,shade:i%2?.68:.83});}faces.sort((a,b)=>a.depth-b.depth).forEach(f=>poly(f.pts,tint(color,f.shade)));poly(top,color,'#26332118');}
function shadow(x,y,rx,ry,opacity=.15){const p=project(x,y);ctx.save();ctx.translate(p.x+8,p.y+8);ctx.transform(boardScale,0,0,boardScale,0,0);ctx.fillStyle=`rgba(33,48,24,${opacity})`;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function burst(x,y,z,color,n){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=30+Math.random()*120;particles.push({x,y,z,vx:Math.cos(a)*v,vy:Math.sin(a)*v,vz:30+Math.random()*110,life:.3+Math.random()*.5,total:.8,color,r:1+Math.random()*3});}}
function updateEffects(dt){shake=Math.max(0,shake-15*dt);for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=240*dt;if(p.z<0){p.z=0;p.vz*=-.3;}}particles=particles.filter(p=>p.life>0);}
const powerColors={laser:'#ef628b',double:'#a279f5',speed:'#f2b931',machine:'#3fb5cc',immortal:'#e8b933',restore:'#ffe0e4'};
function roundedRect(c,x,y,w,h,r,fill,stroke,width=2){
  r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
}
function star(c,x,y,r,fill){c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,s=i%2?r*.46:r;i?c.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s):c.moveTo(x+Math.cos(a)*s,y+Math.sin(a)*s);}c.closePath();c.fillStyle=fill;c.fill();}
function drawPowerIcon(c,type,x,y,size){
  c.save();c.translate(x,y);c.scale(size/32,size/32);c.lineCap='round';c.lineJoin='round';
  c.fillStyle='#fffdf1';c.strokeStyle='#fffdf1';c.lineWidth=3;
  if(type==='speed'){
    c.beginPath();c.moveTo(3,-13);c.lineTo(-10,2);c.lineTo(-2,2);c.lineTo(-4,13);c.lineTo(11,-4);c.lineTo(3,-4);c.closePath();c.fill();
  }else if(type==='laser'){
    c.beginPath();c.moveTo(-11,11);c.lineTo(5,-5);c.stroke();star(c,6,-6,9,'#fffdf1');
    c.lineWidth=2;c.beginPath();c.moveTo(-11,-5);c.lineTo(-8,-2);c.moveTo(4,10);c.lineTo(7,13);c.stroke();
  }else if(type==='double'){
    for(const side of [-1,1]){roundedRect(c,side*7-4,-9,8,21,3,'#fffdf1');roundedRect(c,side*7-2,-13,4,6,1,'#fffdf1');roundedRect(c,side*7-2,-6,4,7,1,powerColors.double);}
  }else if(type==='machine'){
    c.rotate(-.45);for(let i=-1;i<=1;i++){roundedRect(c,i*9-3,-7,6,16,3,'#fffdf1');c.beginPath();c.moveTo(i*9,12);c.lineTo(i*9,15);c.stroke();}
  }else if(type==='immortal'){
    star(c,0,0,14,'#fff5a1');
  }else if(type==='restore'){
    c.beginPath();c.moveTo(0,12);c.bezierCurveTo(-23,-2,-9,-19,0,-7);c.bezierCurveTo(9,-19,23,-2,0,12);c.fillStyle='#e94d5c';c.fill();
  }
  c.restore();
}
function drawGround(){
  const bg=ctx.createLinearGradient(0,0,1120,610);bg.addColorStop(0,'#d9edb7');bg.addColorStop(1,'#aad484');ctx.fillStyle=bg;ctx.fillRect(0,0,1120,610);
  const edge=project(0,0),width=W*boardScale,height=H*boardScale;
  roundedRect(ctx,edge.x-10,edge.y-7,width+20,height+25,14,'#82ad62','#52774c',2);
  roundedRect(ctx,edge.x-7,edge.y-7,width+14,height+14,12,'#ead9a1','#668653',2);
  roundedRect(ctx,edge.x,edge.y,width,height,5,'#b9da86','#f8f0bc',3);
  // Broad, soft tiles and small grass tufts keep paths easy to read.
  ctx.save();ctx.beginPath();ctx.rect(edge.x,edge.y,width,height);ctx.clip();
  for(let x=0;x<W;x+=200)for(let y=0;y<H;y+=200){if((x+y)%400===0){ctx.fillStyle='#c6e096';const p=project(x,y);ctx.fillRect(p.x,p.y,100,100);}}
  for(let i=0;i<55;i++){
    const x=(i*173+51)%(W-40)+20,y=(i*113+41)%(H-40)+20,p=project(x,y);
    ctx.strokeStyle='#86b36566';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-3,p.y);ctx.lineTo(p.x-5,p.y-3);ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+1,p.y-5);ctx.moveTo(p.x+3,p.y);ctx.lineTo(p.x+5,p.y-2);ctx.stroke();
  }
  for(const t of tracks){ctx.globalAlpha=t.life/9*.13;const p=project(t.x,t.y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t.a);ctx.fillStyle='#537e47';ctx.fillRect(-2,-10,4,3);ctx.fillRect(-2,7,4,3);ctx.restore();}ctx.globalAlpha=1;
  spawns.forEach(([x,y],i)=>{const p=project(x,y);ctx.globalAlpha=.28;ctx.beginPath();ctx.arc(p.x,p.y,22,0,Math.PI*2);ctx.fillStyle='#fff9db';ctx.fill();ctx.strokeStyle=colors[i];ctx.lineWidth=2;ctx.stroke();star(ctx,p.x,p.y,11,colors[i]);});
  ctx.restore();
  for(const [x,y] of [[0,0],[W,0],[0,H],[W,H]]){const p=project(x,y);roundedRect(ctx,p.x-5,p.y-5,10,10,3,'#fff1bb','#7c9860',1.5);}
}
function drawWall(w){
  const p=project(w.x,w.y,w.z),base=project(w.x,w.y),width=w.w*boardScale,height=w.h*boardScale,depth=base.y-p.y;
  roundedRect(ctx,p.x+5,p.y+depth+6,width,height,5,'#547a4530');
  roundedRect(ctx,p.x,p.y+4,width,height+depth-4,5,'#b69961','#736944',2);
  roundedRect(ctx,p.x,p.y,width,height,5,'#f4dda1','#83734d',2);
  roundedRect(ctx,p.x+3,p.y+3,width-6,Math.max(3,height-7),3,'#ffe9b3');
  ctx.strokeStyle='#c5a86b';ctx.lineWidth=1.5;
  for(let i=1;i<3;i++){ctx.beginPath();if(width>height){const x=p.x+width*i/3;ctx.moveTo(x,p.y+2);ctx.lineTo(x,p.y+height-2);}else{const y=p.y+height*i/3;ctx.moveTo(p.x+2,y);ctx.lineTo(p.x+width-2,y);}ctx.stroke();}
  roundedRect(ctx,p.x+5,p.y+5,Math.max(3,Math.min(13,width-10)),3,1.5,'#fff8d9');
}
function drawShell(s){const color=shellColors[s.slot];if(s.trail.length){ctx.beginPath();s.trail.forEach((t,i)=>{const p=project(t.x,t.y,22);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.strokeStyle=color.trail;ctx.lineWidth=4;ctx.stroke();}const p=project(s.x,s.y,22);ctx.shadowColor=color.glow;ctx.shadowBlur=12;ctx.fillStyle=color.body;ctx.strokeStyle=color.rim;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;}
function drawPickups(){
  for(const [i,drop] of pickups.entries()){
    // Center the token on its actual ground position, not an elevated projection.
    const phase=reducedMotion?0:last/450+i*2,bob=reducedMotion?0:Math.sin(phase)*2,p=project(drop.x,drop.y);
    shadow(drop.x,drop.y,22,14,.16);
    ctx.save();ctx.translate(p.x,p.y+bob);ctx.rotate(reducedMotion?0:Math.sin(phase)*.07);
    ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fillStyle='#fff9d788';ctx.fill();
    roundedRect(ctx,-13,-11,26,27,7,'#6b7655');roundedRect(ctx,-13,-14,26,27,7,powerColors[drop.type]||'#e9b642','#fffbea',2);
    drawPowerIcon(ctx,drop.type,0,-1,23);ctx.restore();
    star(ctx,p.x+21,p.y-15+bob,3+(reducedMotion?0:Math.sin(phase)*1.3),'#fff9d8');
  }
}
function aimGuideSegment(t,aim,barrelEnd=FIELD.barrelLength){
  const dx=Math.cos(aim),dy=Math.sin(aim),radius=t.power==='laser'?0:5;
  // One centerline for every weapon. Double cannon shells straddle this line.
  const x=t.x,y=t.y;
  let distance=Math.hypot(W,H);
  if(dx>1e-9)distance=Math.min(distance,(W-radius-x)/dx);else if(dx< -1e-9)distance=Math.min(distance,(radius-x)/dx);
  if(dy>1e-9)distance=Math.min(distance,(H-radius-y)/dy);else if(dy< -1e-9)distance=Math.min(distance,(radius-y)/dy);
  // Ray against expanded cover: ordinary shells have a five-unit collision radius.
  for(const wall of walls){
    let near=0,far=distance;
    for(const [p,d,min,max] of [[x,dx,wall.x-radius,wall.x+wall.w+radius],[y,dy,wall.y-radius,wall.y+wall.h+radius]]){
      if(Math.abs(d)<1e-9){if(p<min||p>max){far=-1;break;}continue;}
      const a=(min-p)/d,b=(max-p)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    }
    if(near<=far)distance=Math.min(distance,near);
  }
  distance=Math.max(0,distance);
  const muzzle=Math.min(Math.max(0,barrelEnd),distance);
  return {start:{x:x+dx*muzzle,y:y+dy*muzzle},end:{x:x+dx*distance,y:y+dy*distance}};
}
function drawAimGuide(t,aim,barrelEnd){
  if(!joined||t.id!==myId||t.hp<=0||latest?.winner||latest?.phase==='waiting'||latest?.phase==='countdown')return;
  const zoom=Math.max(.01,scale);
  ctx.save();ctx.globalAlpha=.6;ctx.setLineDash([6/zoom,5/zoom]);ctx.lineCap='round';
  const {start,end}=aimGuideSegment(t,aim,barrelEnd);
  const points=[[start.x,start.y,FIELD.turretHeight],[end.x,end.y,FIELD.turretHeight]];
  line3(points,'#294a42',2.5/zoom);line3(points,'#fff9ce',1/zoom);
  ctx.restore();
}
function laserGeometry(beam){
  const shooter=tanks.find(t=>t.id===beam.player&&t.life===beam.tankLife&&t.hp>0);
  const origin={x:shooter?.x??beam.originX,y:shooter?.y??beam.originY};
  // Use the interpolated hull and the actual impact point for both barrel and beam.
  const range=Math.hypot(beam.endX-origin.x,beam.endY-origin.y),aim=Math.atan2(beam.endY-origin.y,beam.endX-origin.x);
  const muzzleDistance=Math.max(0,Math.min(FIELD.barrelLength,beam.muzzleDistance,range));
  return {aim,muzzleDistance,start:FIELD.muzzle(origin.x,origin.y,aim,muzzleDistance),end:{x:beam.endX,y:beam.endY}};
}
function drawBeams(){
  for(const beam of beams){
    const {start,end}=laserGeometry(beam),points=[[start.x,start.y,FIELD.turretHeight],[end.x,end.y,FIELD.turretHeight]];
    ctx.save();ctx.globalAlpha=Math.min(1,beam.life/.08);ctx.lineCap='butt';
    line3(points,shellColors[beam.slot].glow,FIELD.laserRadius*2*boardScale);line3(points,'#fffde5',2);ctx.restore();
  }
  for(const flash of pickupFlashes){
    const p=project(flash.x,flash.y,60);ctx.save();ctx.globalAlpha=Math.min(1,flash.life/.2);
    if(!reducedMotion)p.y-=(.8-flash.life)*22;
    roundedRect(ctx,p.x-12,p.y-12,24,24,8,'#fff4f0');drawPowerIcon(ctx,'restore',p.x,p.y,23);ctx.restore();
  }
}
function draw(){const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#badc91';ctx.fillRect(0,0,cssW,cssH);ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.save();if(shake)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawGround();drawPickups();const objects=[...walls.map(w=>({depth:project(w.x+w.w/2,w.y+w.h/2).y,draw:()=>drawWall(w)})),...tanks.map(t=>({depth:project(t.x,t.y).y,draw:()=>drawTank(t)})),...shells.map(s=>({depth:project(s.x,s.y).y,draw:()=>drawShell(s)}))];objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());drawBeams();for(const p of particles){const v=project(p.x,p.y,p.z);ctx.globalAlpha=Math.min(1,p.life/.2);ctx.fillStyle=p.color;ctx.fillRect(v.x,v.y,p.r,p.r);}ctx.globalAlpha=1;drawImpacts();ctx.restore();drawHurtEdge();}

function drawImpacts(){
  for(const r of rings){
    const p=project(r.x,r.y),k=1-r.life/r.total;
    ctx.save();ctx.globalAlpha=(1-k)*.85;ctx.beginPath();ctx.ellipse(p.x,p.y,14+52*k,(14+52*k)*.8,0,0,Math.PI*2);
    ctx.strokeStyle='#ffbc6c';ctx.lineWidth=2+5*(1-k);ctx.stroke();ctx.restore();
  }
  // Damage numbers rise from the hit tank and fade out.
  ctx.save();ctx.font='900 17px ui-rounded,"Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.lineJoin='round';
  for(const f of floaters){
    const p=project(f.x+38,f.y,54),y=p.y-(reducedMotion?0:(1-f.life/f.total)*26);
    ctx.globalAlpha=Math.min(1,f.life/.3);ctx.lineWidth=4;ctx.strokeStyle='#fffbe6';ctx.strokeText(f.text,p.x,y);ctx.fillStyle=f.color;ctx.fillText(f.text,p.x,y);
  }
  ctx.restore();
}
// Flames lick in from the screen edges after a hit; at 3 health or less they keep smouldering.
function drawHurtEdge(){
  const me=joined&&latest?.phase==='playing'&&tanks.find(t=>t.id===myId);
  const smoulder=me&&me.hp>0&&me.hp<=3?.22+(reducedMotion?0:.08*Math.sin(last/200)):0,heat=Math.max(hurt,smoulder);
  if(heat<.02)return;
  const dpr=Math.min(devicePixelRatio||1,2),w=cssW,h=cssH,t=reducedMotion?0:last/1000,depth=Math.min(w,h)*(.06+.14*heat);
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  const glow=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.3,w/2,h/2,Math.hypot(w,h)/2);
  glow.addColorStop(0,'rgba(255,120,40,0)');glow.addColorStop(1,`rgba(220,48,20,${.5*heat})`);
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  for(const [x,y,angle,length] of [[0,0,0,w],[w,0,Math.PI/2,h],[w,h,Math.PI,w],[0,h,-Math.PI/2,h]]){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    // An outer red-orange layer and a shorter yellow core; widths, heights and lean vary per tongue.
    for(const [scale,phase,inner,outer] of [[1,0,`rgba(255,150,50,${.85*heat})`,'rgba(206,40,16,0)'],[.55,2.1,`rgba(255,246,190,${.95*heat})`,`rgba(255,176,60,0)`]]){
      const fire=ctx.createLinearGradient(0,0,0,depth*scale);fire.addColorStop(0,inner);fire.addColorStop(1,outer);
      ctx.beginPath();ctx.moveTo(0,0);
      for(let i=0,x0=0;x0<length;i++){
        const width=20+14*Math.abs(Math.sin(i*2.7+phase)),tip=depth*scale*(.4+.6*Math.abs(Math.sin(t*7.3+i*1.9+phase)*Math.cos(t*4.1+i*.7))),lean=width*.35*Math.sin(t*3.2+i*1.3+phase);
        ctx.bezierCurveTo(x0+width*.1,tip*.5,x0+width*.35+lean,tip*.85,x0+width*.5+lean,tip);
        ctx.bezierCurveTo(x0+width*.65+lean,tip*.85,x0+width*.9,tip*.5,x0+width,0);
        x0+=width*.8;
      }
      ctx.lineTo(length,0);ctx.closePath();ctx.fillStyle=fire;ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
function drawTank(t){
  const p=project(t.x,t.y),ink='#354e4b';
  const protectedTank=t.hp>0&&(t.shield||(t.power==='immortal'&&t.powerRemaining>0));
  if(t.id===myId&&t.hp>0){
    // A thick translucent halo, outside the spawn fade, so players spot their own tank at once.
    const pulse=reducedMotion?0:Math.sin(last/300)*.08;
    ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,48*boardScale,0,Math.PI*2);
    ctx.globalAlpha=.62+pulse;ctx.strokeStyle='#fffbe6';ctx.lineWidth=20*boardScale;ctx.stroke();
    ctx.globalAlpha=.72+pulse;ctx.strokeStyle=colors[t.slot];ctx.lineWidth=12*boardScale;ctx.stroke();ctx.restore();
  }
  ctx.save();if(protectedTank)ctx.globalAlpha=reducedMotion?.6:.25+.75*(.5+.5*Math.cos(last*Math.PI*2/1400));
  shadow(t.x,t.y,32,27,t.hp<=0?.2:.25);
  if(t.hp<=0){ctx.save();ctx.translate(p.x,p.y);ctx.scale(boardScale,boardScale);ctx.rotate(t.a);roundedRect(ctx,-22,-18,44,36,9,'#788378',ink,3);roundedRect(ctx,-10,-10,20,20,7,'#4a5f55');ctx.restore();ctx.restore();return;}
  if(t.id===myId||t.shield||t.power){
    ctx.beginPath();ctx.arc(p.x,p.y,35*boardScale,0,Math.PI*2);ctx.strokeStyle=t.power==='immortal'?powerColors.immortal:t.shield?'#fffceb':powerColors[t.power]||colors[t.slot];ctx.lineWidth=t.id===myId?2.5:1.5;ctx.stroke();
    if(t.power==='immortal')for(let i=0;i<3;i++){const a=i*Math.PI*2/3+(reducedMotion?0:last/650);star(ctx,p.x+Math.cos(a)*20,p.y+Math.sin(a)*20,3.5,'#fff5a1');}
  }
  const color=t.flash>0?'#fff7cf':colors[t.slot];
  ctx.save();ctx.translate(p.x,p.y-2);ctx.scale(boardScale,boardScale);ctx.rotate(t.a);
  for(const side of [-1,1]){
    roundedRect(ctx,-25,side*19-7,50,14,6,ink,'#253d39',2.5);
    for(let x=-17;x<=18;x+=8)roundedRect(ctx,x-2,side*19-4,4,8,1.5,'#8caaa0');
  }
  roundedRect(ctx,-23,-17,46,36,10,tint(color,.78),ink,3);
  roundedRect(ctx,-22,-19,44,32,9,color,ink,3);
  roundedRect(ctx,-16,-15,28,4,2,'#ffffff88');
  for(let y=-7;y<=7;y+=7)roundedRect(ctx,-18,y-1,8,2,1,tint(color,.65));
  roundedRect(ctx,16,-11,5,6,2,'#fff5ba');roundedRect(ctx,16,6,5,6,2,'#fff5ba');
  ctx.restore();
  const activeBeam=beams.find(b=>b.player===t.id&&b.tankLife===t.life),laser=activeBeam&&laserGeometry(activeBeam);
  const canAim=latest?.phase!=='waiting'&&latest?.phase!=='countdown';
  const aim=laser?laser.aim:canAim&&t.id===myId&&touchAim?Math.atan2(touchAim.y,touchAim.x):canAim&&t.id===myId&&pointer.active?Math.atan2(pointer.y-t.y,pointer.x-t.x):t.aim;
  const barrelEnd=laser?laser.muzzleDistance:FIELD.barrelLength-t.recoil;
  drawAimGuide(t,aim,barrelEnd);
  const turret=project(t.x,t.y,FIELD.turretHeight);ctx.save();ctx.translate(turret.x,turret.y);ctx.scale(boardScale,boardScale);ctx.rotate(aim);
  for(const y of t.power==='double'?[-FIELD.doubleBarrelOffset,FIELD.doubleBarrelOffset]:[0]){
    roundedRect(ctx,8,y-4,Math.max(1,barrelEnd-9),8,3,t.power==='laser'?'#ff829e':tint(color,.85),ink,2.5);
    roundedRect(ctx,barrelEnd-7,y-6,7,12,3,ink);roundedRect(ctx,barrelEnd-3,y-3,3,6,1,'#a9c2b5');
  }
  roundedRect(ctx,-11,-13,27,27,10,tint(color,.82),ink,3);
  roundedRect(ctx,-12,-16,27,26,10,color,ink,3);
  roundedRect(ctx,-6,-12,15,3,1.5,'#ffffff99');star(ctx,1,-2,7,'#fff4c5');
  ctx.restore();
  if(t.power&&powerColors[t.power]){const badge=project(t.x+34,t.y-16,30);ctx.beginPath();ctx.arc(badge.x,badge.y,7,0,Math.PI*2);ctx.fillStyle=powerColors[t.power];ctx.fill();drawPowerIcon(ctx,t.power,badge.x,badge.y,12);}
  ctx.restore();
  const top=project(t.x,t.y-42,28),label=(t.team==null?'':t.team===0?'O · ':'B · ')+t.name+(t.id===myId?' ★':'');
  ctx.font='bold 10px "Trebuchet MS", sans-serif';
  const width=(ctx.measureText(label)?.width??label.length*5.7)+12;
  roundedRect(ctx,top.x-width/2,top.y-11,width,15,5,t.id===myId?'#fff9e6ee':'#ffffffba');
  ctx.fillStyle=t.team==null?ink:t.team===0?'#ae4c1c':'#226ba5';ctx.textAlign='center';ctx.fillText(label,top.x,top.y);
}
function frame(time){
  const dt=Math.min((time-last)/1000||0,.05);last=time;
  const smoothing=1-Math.exp(-dt*25);let ownSpeed=0;
  for(const t of tanks){
    const x=t.x,y=t.y;t.x+=(t.targetX-t.x)*smoothing;t.y+=(t.targetY-t.y)*smoothing;
    if(t.id===myId&&t.hp>0&&(keys.size>0||Math.hypot(sticks.move.x,sticks.move.y)>0))ownSpeed=Math.hypot(t.x-x,t.y-y)/Math.max(dt,.001);
    t.recoil=Math.max(0,t.recoil-28*dt);t.flash=Math.max(0,t.flash-dt);
    if(Math.hypot(t.x-x,t.y-y)>.1&&t.hp>0){t.track+=dt;if(t.track>.08){tracks.push({x:t.x,y:t.y,a:t.a,life:9});t.track=0;}}
  }
  updateMovementSound(ownSpeed);
  const me=joined&&latest?.phase==='playing'&&tanks.find(t=>t.id===myId);
  if(me&&me.hp>0&&me.hp<=3){if(time>=nextHeartbeat){nextHeartbeat=time+(me.hp===1?650:900);playHeartbeat();}}else nextHeartbeat=0;
  beams=beams.filter(b=>(b.life-=dt)>0);
  pickupFlashes=pickupFlashes.filter(f=>(f.life-=dt)>0);
  floaters=floaters.filter(f=>(f.life-=dt)>0);rings=rings.filter(r=>(r.life-=dt)>0);hurt=Math.max(0,hurt-dt*1.1);
  for(const s of shells){s.trail.push({x:s.x,y:s.y});if(s.trail.length>7)s.trail.shift();}
  tracks=tracks.filter(t=>(t.life-=dt)>0).slice(-500);updateEffects(dt);updateCamera();draw();requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe(canvas);
resize();requestAnimationFrame(frame);
if(roomCode)showRoomForm(roomCode);else showLobby();
