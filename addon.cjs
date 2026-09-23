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
  return {ingress:true,publicUrl};
}
if(require.main===module){
  try{
    const game=createGameServer(readOptions());
    for(const server of [game.server,game.ingressServer])server.on('error',error=>{
      console.error('Cannot start Tank Frenzy:',error.message);process.exit(1);
    });
    game.server.listen(8765,'0.0.0.0',()=>console.log('Tank Frenzy game server listening on port 8765'));
    game.ingressServer.listen(8099,'0.0.0.0',()=>console.log('Home Assistant ingress listening on internal port 8099'));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>game.close().then(()=>process.exit(0)));
  }catch(error){console.error('Tank Frenzy configuration error:',error.message);process.exit(1);}
}
module.exports={readOptions};
