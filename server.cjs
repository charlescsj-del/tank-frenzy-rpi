'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {Room,encodeState}=require('./game-server.cjs');
const {Leaderboard}=require('./leaderboard.cjs');
const {createMetrics}=require('./system-metrics.cjs');
const F=require('./shared.js'),{maxPlayers}=F;
const ingressRequest=Symbol('supervisor ingress');
function lanAddresses(){
  try{return Object.values(os.networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>n.address);}
  catch{return [];} // Some restricted containers do not expose interface enumeration.
}
function isSupervisor(req){return ['172.30.32.2','::ffff:172.30.32.2'].includes(req.socket?.remoteAddress);}
function ingressBase(req){
  const prefix=req.headers?.['x-ingress-path'];
  return typeof prefix==='string'&&/^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(prefix)?prefix.replace(/\/$/,'')+'/':null;
}
// Cloudflare adds the visitor's country; anything else (or unknown/Tor) is left blank.
function countryOf(req){const code=String(req?.headers?.['cf-ipcountry']||'').toUpperCase();return /^[A-Z]{2}$/.test(code)&&!['XX','T1'].includes(code)?code:'';}
const digest=value=>createHash('sha256').update(String(value)).digest();
// Messages are untrusted JSON: read text fields only when they really are text.
const text=value=>typeof value==='string'?value:'';
// One visitor = one address. Cloudflare's CF-Connecting-IP names the real player behind the tunnel.
function visitorOf(req){
  const forwarded=String(req?.headers?.['cf-connecting-ip']||'').trim();
  return /^[0-9A-Fa-f:.]{2,45}$/.test(forwarded)?forwarded:String(req?.socket?.remoteAddress||'local');
}
// Per-visitor limits leave room for a whole office behind one address (19 people = 5 arenas).
const limits={connections:32,pending:16,arenas:6,totalConnections:256,idleArenaSeconds:900,adminFailures:10,adminFailuresTotal:300};
// Browsers only run the game's own files; only the Home Assistant sidebar may frame it.
function securityHeaders(res,req,scriptHash=''){
  const framing=req[ingressRequest]?"'self'":"'none'";
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'${scriptHash?` '${scriptHash}'`:''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${framing}`);
  res.setHeader('X-Frame-Options',req[ingressRequest]?'SAMEORIGIN':'DENY');res.setHeader('Referrer-Policy','no-referrer');
}
function createGameServer({ingress=false,publicUrl='',leaderboardFile=null,onRoomCreated=null,adminPassword='',adminPath='admin',quickSearchSeconds=12,quickReadySeconds=5}={}){
  // The admin page lives at a private address of your choosing; nothing in the game links to it.
  const adminRoot='/'+(/^[A-Za-z0-9_-]{3,64}$/.test(adminPath)?adminPath:'admin');
  // Hidden spectators watch a room with a short-lived pass from the admin page. They are not
  // players: they never appear in snapshots, player counts or the room list.
  const spectators=new Map(),watchPasses=new Map();
  function closeRoom(room,title,message,watcherMessage=message){
    for(const [token,session] of sessions)if(session.room===room){send(session.ws,{type:'error',title,message});session.ws.close(1000,title);sessions.delete(token);}
    closeSpectators(room,title,watcherMessage);rooms.delete(room.code);
  }
  function closeSpectators(room,title,message){for(const [ws,watch] of spectators)if(watch.room===room){send(ws,{type:'error',title,message});ws.close(1000,title);spectators.delete(ws);}}
  const rooms=new Map(),sessions=new Map(),leaderboard=new Leaderboard(leaderboardFile);
  function finish(room){
    if(room.recorded||!room.winner)return;room.recorded=true;room.lastResults=leaderboard.record(room);
    for(const s of sessions.values())if(s.room===room&&s.player.connected){const result=room.lastResults?.get(s.player.id);if(result)send(s.ws,result);}
  }
  function prepare(room){room.onFinish=finish;room.chooseBotSkill=players=>leaderboard.skill(players);return room;}
  const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/qr.js':['qr.js','text/javascript'],'/client.js':['client.js','text/javascript'],'/shared.js':['shared.js','text/javascript'],'/sound-bank.js':['sound-bank.js','text/javascript'],'/music.js':['music.js','text/javascript'],'/audio/cartoon-v1.mp3':['audio/cartoon-v1.mp3','audio/mpeg'],'/mode-banner.webp':['mode-banner.webp','image/webp'],'/mode-banner-idle.webp':['mode-banner-idle.webp','image/webp'],'/hero-quarry.webp':['hero-quarry.webp','image/webp'],'/hero-tanks.webp':['hero-tanks.webp','image/webp']};
  for(const name of ['iron-advance','overdrive','steel-pressure'])files[`/audio/music-${name}-v1.mp3`]=[`audio/music-${name}-v1.mp3`,'audio/mpeg'];
  for(const name of ['fire-a','ricochet-c','pickup-a','explosion-c'])files[`/audio/effects-${name}-v1.mp3`]=[`audio/effects-${name}-v1.mp3`,'audio/mpeg'];
  for(const name of ['countdown','battle-start'])files[`/audio/${name}-v1.mp3`]=[`audio/${name}-v1.mp3`,'audio/mpeg'];
  files['/manifest.webmanifest']=['manifest.webmanifest','application/manifest+json'];
  for(const name of ['icon-192','icon-512','apple-touch-icon'])files[`/icons/${name}.png`]=[`icons/${name}.png`,'image/png'];
  for(const name of ['win','pc-controls','mobile-controls','find-tank','getting-hit','bouncing','power-ups'])files[`/tutorial/${name}.webp`]=[`tutorial/${name}.webp`,'image/webp'];
  // Admin: open through the Home Assistant sidebar (already signed in); on the
  // public game port only with the admin password (HTTP Basic, over HTTPS via Cloudflare).
  const started=Date.now(),readMetrics=createMetrics();
  // admin.html's one inline script is allowed by its hash, so the page needs no 'unsafe-inline'.
  const adminPage=fs.readFileSync(path.join(__dirname,'admin.html'),'utf8');
  const adminScript='sha256-'+createHash('sha256').update(/<script>([\s\S]*?)<\/script>/.exec(adminPage)?.[1]??'').digest('base64');
  function adminAllowed(req){
    if(req[ingressRequest])return true;
    const match=/^Basic (.+)$/.exec(req.headers.authorization||'');if(!adminPassword||!match)return false;
    const text=Buffer.from(match[1],'base64').toString('utf8');
    return timingSafeEqual(digest(text.slice(text.indexOf(':')+1)),digest(adminPassword));
  }
  function adminState(){
    const system=readMetrics();
    return {version:require('./package.json').version,board:{width:F.width,height:F.height},palette:F.palette.map(p=>p.body),uptime:Math.round((Date.now()-started)/1000),system,cpu:system.game.cpuPercent,
      memory:system.game.rssBytes===null?null:Math.round(system.game.rssBytes/1048576),load:system.load,sessions:sessions.size,
      rooms:[...rooms.values()].filter(room=>room.players.size).map(room=>({code:room.code,phase:room.phase,settings:room.settings,botSkill:room.botSkill,time:Math.round(room.time),
        winner:room.winner,teamScores:room.teamScores,walls:room.map.walls,
        players:[...room.players.values()].map(({id,name,slot,team,bot,connected,hp,kills,deaths,x,y,aim,country,power})=>({id,name,slot,team,bot:!!bot,connected,hp,kills,deaths,x:Math.round(x),y:Math.round(y),aim:Math.round(aim*100)/100,country:country||'',power:power||null}))}))};
  }
  // Slow down password guessing: 10 wrong passwords a minute per visitor (300 across everyone),
  // so a stranger guessing cannot lock you out of your own admin page.
  const adminFailures=new Map();let adminFailuresTotal=0,adminWindow=0;
  function admin(req,res,url){
    res.setHeader('Cache-Control','no-store');
    if(Date.now()-adminWindow>60000){adminWindow=Date.now();adminFailures.clear();adminFailuresTotal=0;}
    const visitor=visitorOf(req);
    if(!req[ingressRequest]&&((adminFailures.get(visitor)||0)>=limits.adminFailures||adminFailuresTotal>=limits.adminFailuresTotal)){res.writeHead(429,{'Retry-After':'60'});res.end('Too many attempts. Try again in a minute.');return;}
    if(!adminAllowed(req)){
      if(req.headers.authorization){adminFailures.set(visitor,(adminFailures.get(visitor)||0)+1);adminFailuresTotal++;}
      if(!req[ingressRequest]&&!adminPassword){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(401,{'WWW-Authenticate':'Basic realm="Tank Frenzy admin", charset="UTF-8"'});res.end('Admin password required');return;
    }
    const route=url.pathname.slice(adminRoot.length)||'/';
    if(req.method==='GET'&&route==='/'){securityHeaders(res,req,adminScript);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(adminPage);return;}
    if(req.method==='GET'&&route==='/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(adminState()));return;}
    if(req.method==='GET'&&route==='/leaderboard'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({players:leaderboard.top({period:'all',count:Infinity})}));return;}
    // Remove one name (for example an offensive one) or start the leaderboard over.
    if(req.method==='POST'&&route==='/leaderboard/remove'&&req.headers['x-tank-admin']==='1'){
      const removed=leaderboard.remove(String(url.searchParams.get('name')||''));res.writeHead(removed?204:404);res.end();return;
    }
    if(req.method==='POST'&&route==='/leaderboard/reset'&&req.headers['x-tank-admin']==='1'){leaderboard.reset();res.writeHead(204);res.end();return;}
    // Ending a room needs a custom header, which other websites cannot send without permission.
    if(req.method==='POST'&&route==='/watch'&&req.headers['x-tank-admin']==='1'){
      const room=rooms.get(String(url.searchParams.get('room')||''));
      if(!room){res.writeHead(404);res.end();return;}
      const pass=randomBytes(18).toString('hex');watchPasses.set(pass,{code:room.code,expires:Date.now()+10*60000});
      for(const [key,value] of watchPasses)if(value.expires<Date.now())watchPasses.delete(key);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pass,room:room.code}));return;
    }
    if(req.method==='POST'&&route==='/close'&&req.headers['x-tank-admin']==='1'){
      const room=rooms.get(String(url.searchParams.get('room')||''));
      if(!room){res.writeHead(404);res.end();return;}
      closeRoom(room,'Arena closed','The host closed this arena. Pick another arena or create a new one.','You ended this arena.');res.writeHead(204);res.end();return;
    }
    res.writeHead(404);res.end();
  }
  const server=http.createServer((req,res)=>{
    // A bad request must fail on its own, never take the game down for everyone.
    try{handle(req,res);}catch(error){console.error('Tank Frenzy: request failed:',error.message);if(!res.headersSent)res.writeHead(400);res.end();}
  });
  function handle(req,res){
    let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end('Bad request');return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');securityHeaders(res,req);
    if(url.pathname===adminRoot||url.pathname.startsWith(adminRoot+'/')){admin(req,res,url);return;}
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/health'){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok',version:require('./package.json').version}));return;
    }
    if(url.pathname==='/rooms'){
      const available=[...rooms.values()].filter(room=>room.players.size>0&&!room.private&&!room.quick).map(room=>({
        code:room.code,capacity:maxPlayers,available:room.phase==='postgame'?0:maxPlayers-room.humans().length,settings:room.settings,phase:room.phase,
        players:[...room.players.values()].map(({name,slot,connected,team,bot})=>({name,slot,connected,team,bot}))
      })).sort((a,b)=>a.code.localeCompare(b.code));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({rooms:available}));return;
    }
    if(url.pathname==='/leaderboard'){
      const period=url.searchParams.get('period')||'all',country=(url.searchParams.get('country')||'').toUpperCase().slice(0,2);
      res.setHeader('Content-Type','application/json');
      const profileId=url.searchParams.get('player')||'';
      res.end(JSON.stringify({players:leaderboard.top({period,country}),countries:leaderboard.countries(),you:leaderboard.position(profileId,{period,country}),period,country,timezone:'Asia/Kuala_Lumpur',persistent:!!leaderboardFile}));return;
    }
    if(url.pathname==='/network-info'){
      const port=server.address().port;
      const urls=ingress?[]:lanAddresses().map(address=>`http://${address}:${port}`);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({urls:ingress?[]:urls,publicUrl,ingress:!!req[ingressRequest]}));return;
    }
    const file=files[url.pathname];if(!file){res.writeHead(404);res.end('Not found');return;}
    if(req[ingressRequest]&&(url.pathname==='/'||url.pathname==='/index.html')){
      const base=ingressBase(req);
      if(!base){res.writeHead(400);res.end('Missing or invalid Home Assistant ingress path');return;}
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replace('<head>','<head>\n<base href="'+base+'">'));return;
    }
    if(file[1].startsWith('image/'))res.setHeader('Cache-Control','public, max-age=86400');
    if(file[1]==='audio/mpeg')res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('Content-Type',file[1]+(file[1].startsWith('text/')?'; charset=utf-8':''));
    fs.createReadStream(path.join(__dirname,file[0])).on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();}).pipe(res);
  }
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  // Connections per visitor: at most 32 open and 16 not yet in an arena (256 for the whole server).
  const visitors=new Map();
  const visitor=key=>{let v=visitors.get(key);if(!v)visitors.set(key,v={connections:0,pending:0});return v;};
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'){socket.destroy();return;}
    if(!req[ingressRequest]){const v=visitors.get(visitorOf(req));if(wss.clients.size>=limits.totalConnections||v&&(v.connections>=limits.connections||v.pending>=limits.pending)){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}}
    if(!req[ingressRequest]&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  // A separate, unexposed listener keeps Supervisor authentication separate
  // from the optional LAN game port. Never trust forwarded headers on the LAN.
  const ingressServer=ingress?http.createServer((req,res)=>{
    if(!isSupervisor(req)){res.writeHead(403);res.end('Forbidden');return;}
    req[ingressRequest]=true;server.emit('request',req,res);
  }):null;
  ingressServer?.on('upgrade',(req,socket,head)=>{
    if(!isSupervisor(req)){socket.destroy();return;}
    req[ingressRequest]=true;server.emit('upgrade',req,socket,head);
  });
  function send(ws,data){sendRaw(ws,JSON.stringify(data));}
  function sendRaw(ws,text){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256*1024)ws.send(text);}
  wss.on('connection',(ws,req)=>{
    const country=countryOf(req),key=req?.[ingressRequest]?null:visitorOf(req),mine=key&&visitor(key);
    if(mine){mine.connections++;mine.pending++;}
    let session=null,count=0,windowStart=Date.now(),pending=true;
    const settle=()=>{if(mine&&pending){pending=false;mine.pending--;}};
    ws.missedPongs=0;ws.on('pong',()=>{ws.missedPongs=0;});
    const joinTimeout=setTimeout(()=>{if(!session)ws.close(1008,'Join required');},10000);
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      // Anything unexpected closes this one connection instead of stopping the server.
      try{receive(raw);}catch(error){console.error('Tank Frenzy: dropped a bad message:',error.message);ws.close(1011,'Bad message');}
    });
    function receive(raw){
      if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>150){ws.close(1008,'Too many messages');return;}
      let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
      if(!msg||typeof msg!=='object')return;
      if(msg.type==='spectate'&&!session&&!spectators.has(ws)){
        const pass=watchPasses.get(text(msg.pass)),room=pass&&pass.expires>Date.now()&&rooms.get(pass.code);
        if(!room||room.code!==text(msg.room)){send(ws,{type:'error',title:'Cannot watch this arena',message:'The watch link expired or the arena has ended. Open a new one from the admin page.'});ws.close();return;}
        clearTimeout(joinTimeout);settle();spectators.set(ws,{room});send(ws,{type:'spectating',room:room.code});sendRaw(ws,encodeState(room.snapshot()));return;
      }
      if(spectators.has(ws))return;
      if((msg.type==='join'||msg.type==='quick')&&!session){
        let code=(text(msg.room)||'QUARRY').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'QUARRY';
        if(msg.type==='quick'){
          const mode=msg.settings?.mode==='teams'?'teams':'ffa';
          const waiting=[...rooms.values()].find(r=>r.quick&&r.phase==='searching'&&r.settings.mode===mode&&r.humans().length<maxPlayers);
          code=waiting?.code||'QUICK-'+randomBytes(4).toString('hex').toUpperCase();msg.settings={mode};msg.mode='quick';
        }
        const existing=typeof msg.token==='string'?sessions.get(msg.token):null;
        if(msg.token&&(!existing||existing.room.code!==code||!existing.room.players.has(existing.player.id))){send(ws,{type:'error',code:'session_expired',message:'Your arena reservation expired. Join a new match.'});ws.close();return;}
        if(existing&&existing.room.code===code&&existing.room.players.has(existing.player.id)){
          session=existing;const previous=session.ws;session.ws=ws;
          if(previous!==ws)previous.terminate();
          session.player.connected=true;session.player.disconnectedAt=0;session.player.pendingShot=false;session.player.input={x:0,y:0,aimX:session.player.x+100,aimY:session.player.y,fire:false};session.player.lastInput=session.room.time;
        }
        else{
          const profile=leaderboard.identify(msg.profile);
          if([...sessions.values()].some(s=>s.player.profileId===profile.id&&s.room.players.has(s.player.id))){send(ws,{type:'error',message:'This player is already in an arena. Return to that tab or leave it first.'});ws.close();return;}
          if(msg.mode==='create'&&rooms.has(code)&&rooms.get(code).players.size>0){send(ws,{type:'error',message:'That arena already exists. Choose another code or browse arenas to join it.'});ws.close();return;}
          if(msg.mode==='join'&&(!rooms.has(code)||rooms.get(code).players.size===0)){send(ws,{type:'error',message:'That arena is no longer available. Browse arenas or create a new one.'});ws.close();return;}
          if(rooms.has(code)&&rooms.get(code).players.size===0)rooms.delete(code);
          const created=!rooms.has(code);
          if(!rooms.has(code)){
            if(rooms.size>=32){send(ws,{type:'error',message:'Server is full. Try an existing room.'});ws.close();return;}
            if(key&&[...rooms.values()].filter(room=>room.creator===key).length>=limits.arenas){send(ws,{type:'error',title:'Too many arenas',message:'Your network already has '+limits.arenas+' open arenas. Join one of them, or wait for one to end.'});ws.close();return;}
            const room=prepare(Object.assign(new Room(code,msg.settings),{creator:key,private:msg.private===true}));
            if(msg.type==='quick')room.configureQuick(quickSearchSeconds,quickReadySeconds);rooms.set(code,room);
          }
          const room=rooms.get(code);const name=typeof msg.name==='string'?msg.name.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,16):'';
          if(room.quick&&msg.type!=='quick'){send(ws,{type:'error',message:'This Quick Play group is already assigned. Use Quick Play to find a new match.'});ws.close();return;}
          if(room.phase==='postgame'){send(ws,{type:'error',message:'This match has ended and its rematch window closed. Choose another arena or create a new one.'});ws.close();return;}
          const player=room.add(name);if(!player){send(ws,{type:'error',message:'Arena full (4 players). Choose another arena code.'});ws.close();return;}
          player.profileId=profile.id;player.country=country;session={room,player,profile,token:randomBytes(24).toString('hex'),ws};sessions.set(session.token,session);
          if(created)try{onRoomCreated?.({code,name:player.name,mode:room.settings.mode,url:publicUrl?publicUrl+'/?room='+encodeURIComponent(code):''});}catch{/* Notifications never block play. */}
        }
        session.ws=ws;clearTimeout(joinTimeout);settle();send(ws,{type:'welcome',id:session.player.id,token:session.token,profile:session.profile,slot:session.player.slot,room:code,seq:session.player.seq});sendRaw(ws,encodeState(session.room.snapshot()));const result=session.room.lastResults?.get(session.player.id);if(result)send(ws,result);return;
      }
      if(!session)return;
      if(session.ws!==ws)return;
      if(msg.type==='start')session.room.start(session.player);
      if(msg.type==='rematch')session.room.voteRematch(session.player);
      if(msg.type==='bot')session.room.botCommand(session.player,msg);
      if(msg.type==='ready')session.room.ready(session.player);
      if(msg.type==='lobby')session.room.lobby(session.player);
      if(msg.type==='room')session.room.roomCommand(session.player,msg);
      if(msg.type==='reaction')session.room.react(session.player,msg.reaction);
      if(msg.type==='input')session.room.setInput(session.player,msg);
      if(msg.type==='ping')send(ws,{type:'pong',sent:msg.sent});
      if(msg.type==='leave'){session.room.remove(session.player);if(session.room.players.size===0)rooms.delete(session.room.code);sessions.delete(session.token);ws.close(1000,'Left room');}
    }
    let closed=false;
    ws.on('close',()=>{
      clearTimeout(joinTimeout);spectators.delete(ws);if(session&&session.ws===ws)session.room.disconnect(session.player);
      if(mine&&!closed){closed=true;settle();mine.connections--;if(!mine.connections)visitors.delete(key);}
    });
  });
  let last=performance.now(),accumulator=0,tick=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min((now-last)/1000,.1);last=now;
    while(accumulator>=1/120){for(const room of rooms.values())room.step(1/120);accumulator-=1/120;}
    if(++tick%2===0){
      for(const room of rooms.values()){
        if(room.players.size===0){closeSpectators(room,'Match over','Everyone left this room.');rooms.delete(room.code);continue;}
        // Arenas left waiting or finished for 15 minutes close, so idle arenas cannot fill the server.
        if(room.phase==='waiting'||room.phase==='postgame'){room.idleSince??=room.time;if(room.time-room.idleSince>limits.idleArenaSeconds){closeRoom(room,'Arena closed','This arena was idle for 15 minutes. Pick another arena or create a new one.');continue;}}else room.idleSince=null;
        // Record each finished match once, when its winner first appears.
        if(room.winner&&!room.recorded)finish(room);else if(!room.winner)room.recorded=false;
        // Encode once per room, not once per player; include the map once a second or when it changes.
        const withMap=room.sentMapId!==room.map.id||tick%60===0;room.sentMapId=room.map.id;
        const snapshot=encodeState(room.snapshot({withMap}));for(const session of sessions.values())if(session.room===room&&session.player.connected)sendRaw(session.ws,snapshot);
        for(const [ws,watch] of spectators)if(watch.room===room)sendRaw(ws,snapshot);room.events=[];
      }
      for(const [token,s]of sessions)if(!s.room.players.has(s.player.id))sessions.delete(token);
    }
  },1000/60);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.missedPongs>=6){ws.terminate();continue;}ws.missedPongs++;ws.ping();}},5000);
  async function close(){leaderboard.save();clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));if(ingressServer)await new Promise(resolve=>ingressServer.close(resolve));}
  return {server,ingressServer,wss,rooms,leaderboard,close};
}
if(require.main===module){
  const game=createGameServer(),port=Number(process.env.PORT)||8765;
  game.server.on('error',error=>{console.error(`Cannot start game: ${error.message}`);process.exit(1);});
  game.server.listen(port,'0.0.0.0',()=>{console.log(`Tank Frenzy: http://localhost:${port}`);for(const address of lanAddresses())console.log(`Network: http://${address}:${port}`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>game.close().then(()=>process.exit(0)));
}
module.exports={createGameServer,countryOf,visitorOf};
