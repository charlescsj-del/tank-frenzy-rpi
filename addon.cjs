'use strict';
const fs=require('node:fs');
const {createGameServer}=require('./server.cjs');
function readOptions(file='/data/options.json'){
  const options=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  let publicUrl=String(options.public_url||'').trim();
  if(publicUrl){
    const url=new URL(publicUrl);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)
      throw Error('public_url must be an http(s) URL without credentials, query or fragment');
    publicUrl=url.href.replace(/\/$/,'');
  }
  // Optional Home Assistant notify service, written as notify.mobile_app_phone or mobile_app_phone.
  const notifyService=String(options.notify_service||'').trim().replace(/^notify\./,'');
  if(notifyService&&!/^[a-z0-9_]+$/.test(notifyService))throw Error('notify_service must look like notify.mobile_app_your_phone');
  // Password for /admin on the public game port; the Home Assistant sidebar never needs it.
  const adminPassword=String(options.admin_password||'');
  if(adminPassword&&adminPassword.length<8)throw Error('admin_password must be at least 8 characters');
  // Private address of the admin page, for example hq-7f3k for /hq-7f3k. Letters, digits, - and _.
  const adminPath=String(options.admin_path||'admin').trim().replace(/^\/+|\/+$/g,'')||'admin';
  if(!/^[A-Za-z0-9_-]{3,64}$/.test(adminPath))throw Error('admin_path must be 3-64 letters, digits, - or _ (for example hq-7f3k)');
  if(['audio','icons','tutorial','rooms','ws','health','leaderboard','network-info'].includes(adminPath.toLowerCase()))throw Error('admin_path must not reuse a game address');
  return {ingress:true,publicUrl,notifyService,adminPassword,adminPath};
}
// Sends "room opened" notifications through the Supervisor's Home Assistant API,
// at most one a minute so a busy evening does not flood phones.
function homeAssistantNotifier(service,{token=process.env.SUPERVISOR_TOKEN,fetchImpl=globalThis.fetch,now=Date.now,log=console}={}){
  if(!service||!token)return null;
  let last=-Infinity;
  return async({code,name,mode,url})=>{
    if(now()-last<60000)return false;
    last=now();
    try{
      const response=await fetchImpl(`http://supervisor/core/api/services/notify/${service}`,{method:'POST',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({title:'Tank Frenzy',message:`${name} opened room ${code} (${mode==='teams'?'2 vs 2':'Free-for-All'}). Join the battle!`,data:url?{url,clickAction:url}:{}})});
      if(!response.ok)log.error(`Tank Frenzy: notify.${service} returned ${response.status}`);
      return response.ok;
    }catch(error){log.error('Tank Frenzy: notification failed:',error.message);return false;}
  };
}
if(require.main===module){
  try{
    const options=readOptions();
    const game=createGameServer({...options,leaderboardFile:'/data/leaderboard.json',onRoomCreated:homeAssistantNotifier(options.notifyService)});
    for(const server of [game.server,game.ingressServer])server.on('error',error=>{
      console.error('Cannot start Tank Frenzy:',error.message);process.exit(1);
    });
    game.server.listen(8765,'0.0.0.0',()=>console.log('Tank Frenzy game server listening on port 8765'));
    game.ingressServer.listen(8099,'0.0.0.0',()=>console.log('Home Assistant ingress listening on internal port 8099'));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>game.close().then(()=>process.exit(0)));
  }catch(error){console.error('Tank Frenzy configuration error:',error.message);process.exit(1);}
}
module.exports={readOptions,homeAssistantNotifier};
