'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {Room,encodeState}=require('./game-server.cjs');
const {Leaderboard}=require('./leaderboard.cjs');
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
function createGameServer({ingress=false,publicUrl='',leaderboardFile=null,onRoomCreated=null,adminPassword=''}={}){
  const rooms=new Map(),sessions=new Map(),leaderboard=new Leaderboard(leaderboardFile);
  const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/client.js':['client.js','text/javascript'],'/shared.js':['shared.js','text/javascript'],'/sound-bank.js':['sound-bank.js','text/javascript'],'/music.js':['music.js','text/javascript'],'/audio/cartoon-v1.mp3':['audio/cartoon-v1.mp3','audio/mpeg'],'/mode-banner.webp':['mode-banner.webp','image/webp']};
  for(const name of ['iron-advance','overdrive','steel-pressure'])files[`/audio/music-${name}-v1.mp3`]=[`audio/music-${name}-v1.mp3`,'audio/mpeg'];
  for(const name of ['fire-a','ricochet-c','pickup-a','explosion-c'])files[`/audio/effects-${name}-v1.mp3`]=[`audio/effects-${name}-v1.mp3`,'audio/mpeg'];
  for(const name of ['countdown','battle-start'])files[`/audio/${name}-v1.mp3`]=[`audio/${name}-v1.mp3`,'audio/mpeg'];
  files['/manifest.webmanifest']=['manifest.webmanifest','application/manifest+json'];
  for(const name of ['icon-192','icon-512','apple-touch-icon'])files[`/icons/${name}.png`]=[`icons/${name}.png`,'image/png'];
  for(const name of ['win','pc-controls','mobile-controls','find-tank','getting-hit','bouncing','power-ups'])files[`/tutorial/${name}.webp`]=[`tutorial/${name}.webp`,'image/webp'];
  // Admin: open through the Home Assistant sidebar (already signed in); on the
  // public game port only with the admin password (HTTP Basic, over HTTPS via Cloudflare).
  const started=Date.now();let cpuMark={usage:process.cpuUsage(),at:performance.now()};
  function adminAllowed(req){
    if(req[ingressRequest])return true;
    const match=/^Basic (.+)$/.exec(req.headers.authorization||'');if(!adminPassword||!match)return false;
    const text=Buffer.from(match[1],'base64').toString('utf8');
    return timingSafeEqual(digest(text.slice(text.indexOf(':')+1)),digest(adminPassword));
  }
  function adminState(){
    const usage=process.cpuUsage(cpuMark.usage),elapsed=performance.now()-cpuMark.at;cpuMark={usage:process.cpuUsage(),at:performance.now()};
    return {version:require('./package.json').version,board:{width:F.width,height:F.height},palette:F.palette.map(p=>p.body),uptime:Math.round((Date.now()-started)/1000),cpu:elapsed>0?Math.round((usage.user+usage.system)/10/elapsed):0,
      memory:Math.round(process.memoryUsage().rss/1048576),load:os.loadavg().map(v=>Math.round(v*100)/100),sessions:sessions.size,
      rooms:[...rooms.values()].filter(room=>room.players.size).map(room=>({code:room.code,phase:room.phase,settings:room.settings,botSkill:room.botSkill,time:Math.round(room.time),
        winner:room.winner,teamScores:room.teamScores,walls:room.map.walls,shells:room.shells.map(({x,y,slot})=>({x:Math.round(x),y:Math.round(y),slot})),
        players:[...room.players.values()].map(({id,name,slot,team,bot,connected,hp,kills,deaths,x,y,aim,country,power})=>({id,name,slot,team,bot:!!bot,connected,hp,kills,deaths,x:Math.round(x),y:Math.round(y),aim:Math.round(aim*100)/100,country:country||'',power:power||null}))}))};
  }
  // Slow down password guessing: at most 20 wrong passwords a minute, across all visitors.
  let adminFailures=0,adminWindow=0;
  function admin(req,res,url){
    res.setHeader('Cache-Control','no-store');
    if(Date.now()-adminWindow>60000){adminWindow=Date.now();adminFailures=0;}
    if(adminFailures>=20&&!req[ingressRequest]){res.writeHead(429,{'Retry-After':'60'});res.end('Too many attempts. Try again in a minute.');return;}
    if(!adminAllowed(req)){
      if(req.headers.authorization)adminFailures++;
      if(!req[ingressRequest]&&!adminPassword){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(401,{'WWW-Authenticate':'Basic realm="Tank Frenzy admin", charset="UTF-8"'});res.end('Admin password required');return;
    }
    if(req.method==='GET'&&(url.pathname==='/admin'||url.pathname==='/admin/')){res.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(path.join(__dirname,'admin.html')).pipe(res);return;}
    if(req.method==='GET'&&url.pathname==='/admin/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(adminState()));return;}
    // Ending a room needs a custom header, which other websites cannot send without permission.
    if(req.method==='POST'&&url.pathname==='/admin/close'&&req.headers['x-tank-admin']==='1'){
      const room=rooms.get(String(url.searchParams.get('room')||''));
      if(!room){res.writeHead(404);res.end();return;}
      for(const [token,session] of sessions)if(session.room===room){send(session.ws,{type:'error',title:'Room closed',message:'The host closed this room. Pick another room or create a new one.'});session.ws.close(1000,'Room closed');sessions.delete(token);}
      rooms.delete(room.code);res.writeHead(204);res.end();return;
    }
    res.writeHead(404);res.end();
  }
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')){admin(req,res,url);return;}
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/health'){
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok',version:require('./package.json').version}));return;
    }
    if(url.pathname==='/rooms'){
      const available=[...rooms.values()].filter(room=>room.players.size>0).map(room=>({
        code:room.code,capacity:maxPlayers,available:room.phase==='postgame'?0:maxPlayers-room.humans().length,settings:room.settings,phase:room.phase,
        players:[...room.players.values()].map(({name,slot,connected,team,bot})=>({name,slot,connected,team,bot}))
      })).sort((a,b)=>a.code.localeCompare(b.code));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({rooms:available}));return;
    }
    if(url.pathname==='/leaderboard'){
      const period=url.searchParams.get('period')||'all',country=(url.searchParams.get('country')||'').toUpperCase().slice(0,2);
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({players:leaderboard.top({period,country}),countries:leaderboard.countries(),period,country,persistent:!!leaderboardFile}));return;
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
    res.setHeader('Content-Type',file[1]+(file[1].startsWith('text/')?'; charset=utf-8':''));fs.createReadStream(path.join(__dirname,file[0])).pipe(res);
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'){socket.destroy();return;}
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
    const country=countryOf(req);
    let session=null,count=0,windowStart=Date.now();
    ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
    const joinTimeout=setTimeout(()=>{if(!session)ws.close(1008,'Join required');},10000);
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>150){ws.close(1008,'Too many messages');return;}
      let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
      if(!msg||typeof msg!=='object')return;
      if(msg.type==='join'&&!session){
        const code=String(msg.room||'QUARRY').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'QUARRY';
        const existing=typeof msg.token==='string'?sessions.get(msg.token):null;
        if(existing&&existing.room.code===code&&existing.room.players.has(existing.player.id)){
          session=existing;const previous=session.ws;session.ws=ws;
          if(previous!==ws)previous.terminate();
          session.player.connected=true;session.player.pendingShot=false;session.player.input={x:0,y:0,aimX:session.player.x+100,aimY:session.player.y,fire:false};session.player.lastInput=session.room.time;
        }
        else{
          if(msg.mode==='create'&&rooms.has(code)&&rooms.get(code).players.size>0){send(ws,{type:'error',message:'That room already exists. Choose another code or browse rooms to join it.'});ws.close();return;}
          if(msg.mode==='join'&&(!rooms.has(code)||rooms.get(code).players.size===0)){send(ws,{type:'error',message:'That room is no longer available. Browse rooms or create a new one.'});ws.close();return;}
          if(rooms.has(code)&&rooms.get(code).players.size===0)rooms.delete(code);
          const created=!rooms.has(code);
          if(!rooms.has(code)){if(rooms.size>=32){send(ws,{type:'error',message:'Server is full. Try an existing room.'});ws.close();return;}rooms.set(code,new Room(code,msg.settings));}
          const room=rooms.get(code);const name=typeof msg.name==='string'?msg.name.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,16):'';
          if(room.phase==='postgame'){send(ws,{type:'error',message:'This match has ended and its rematch window closed. Choose another room or create a new one.'});ws.close();return;}
          const player=room.add(name);if(!player){send(ws,{type:'error',message:'Room full (4 players). Choose another room code.'});ws.close();return;}
          player.country=country;session={room,player,token:randomBytes(24).toString('hex'),ws};sessions.set(session.token,session);
          if(created)try{onRoomCreated?.({code,name:player.name,mode:room.settings.mode,url:publicUrl?publicUrl+'/?room='+encodeURIComponent(code):''});}catch{/* Notifications never block play. */}
        }
        session.ws=ws;clearTimeout(joinTimeout);send(ws,{type:'welcome',id:session.player.id,token:session.token,slot:session.player.slot,room:code,seq:session.player.seq});sendRaw(ws,encodeState(session.room.snapshot()));return;
      }
      if(!session)return;
      if(session.ws!==ws)return;
      if(msg.type==='start')session.room.start(session.player);
      if(msg.type==='rematch')session.room.voteRematch(session.player);
      if(msg.type==='bot')session.room.botCommand(session.player,msg);
      if(msg.type==='input')session.room.setInput(session.player,msg);
      if(msg.type==='ping')send(ws,{type:'pong',sent:msg.sent});
      if(msg.type==='leave'){session.room.remove(session.player);if(session.room.players.size===0)rooms.delete(session.room.code);sessions.delete(session.token);ws.close(1000,'Left room');}
    });
    ws.on('close',()=>{clearTimeout(joinTimeout);if(session&&session.ws===ws)session.room.disconnect(session.player);});
  });
  let last=performance.now(),accumulator=0,tick=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min((now-last)/1000,.1);last=now;
    while(accumulator>=1/120){for(const room of rooms.values())room.step(1/120);accumulator-=1/120;}
    if(++tick%2===0){
      for(const room of rooms.values()){
        if(room.players.size===0){rooms.delete(room.code);continue;}
        // Record each finished match once, when its winner first appears.
        if(room.winner&&!room.recorded){room.recorded=true;leaderboard.record(room);}else if(!room.winner)room.recorded=false;
        // Encode once per room, not once per player; include the map once a second or when it changes.
        const withMap=room.sentMapId!==room.map.id||tick%60===0;room.sentMapId=room.map.id;
        const snapshot=encodeState(room.snapshot({withMap}));for(const session of sessions.values())if(session.room===room&&session.player.connected)sendRaw(session.ws,snapshot);room.events=[];
      }
      for(const [token,s]of sessions)if(!s.room.players.has(s.player.id))sessions.delete(token);
    }
  },1000/60);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
  async function close(){leaderboard.save();clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));if(ingressServer)await new Promise(resolve=>ingressServer.close(resolve));}
  return {server,ingressServer,wss,rooms,leaderboard,close};
}
if(require.main===module){
  const game=createGameServer(),port=Number(process.env.PORT)||8765;
  game.server.on('error',error=>{console.error(`Cannot start game: ${error.message}`);process.exit(1);});
  game.server.listen(port,'0.0.0.0',()=>{console.log(`Tank Frenzy: http://localhost:${port}`);for(const address of lanAddresses())console.log(`Network: http://${address}:${port}`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>game.close().then(()=>process.exit(0)));
}
module.exports={createGameServer,countryOf};
