'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createGameServer}=require('../server.cjs');
async function setup(t,options){const game=createGameServer(options);game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());return {game,port:game.server.address().port};}
// fetch() cannot send a custom Host header, so use a plain request.
const get=(port,url,headers={})=>new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path:url,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject));
const meta=(html,key)=>new RegExp('<meta (?:property|name)="'+key+'" content="([^"]*)">').exec(html)?.[1];
test('the home page carries link-preview tags with absolute addresses from the public address',async t=>{
  const {port}=await setup(t,{publicUrl:'https://tanks.example'}),page=(await get(port,'/')).body.toString();
  assert.equal(meta(page,'og:title'),'Tank Frenzy — Cartoon Tank Battles');assert.equal(meta(page,'og:url'),'https://tanks.example/');assert.equal(meta(page,'og:image'),'https://tanks.example/og-image.jpg');
  assert.equal(meta(page,'og:image:width'),'1200');assert.equal(meta(page,'og:image:height'),'630');assert.equal(meta(page,'twitter:card'),'summary_large_image');assert.match(meta(page,'og:description'),/Nothing to install/);
  assert(page.indexOf('og:title')<page.indexOf('<style>'),'tags sit at the top of the head, where previewers stop reading early');
  assert.equal((await get(port,'/index.html')).body.toString().includes('og:image'),true);
});
test('an invitation link previews as an invitation, with the arena code cleaned',async t=>{
  const {port}=await setup(t,{publicUrl:'https://tanks.example'});
  let page=(await get(port,'/?room=office-1')).body.toString();assert.equal(meta(page,'og:title'),'Join my Tank Frenzy arena · OFFICE-1');assert.equal(meta(page,'og:url'),'https://tanks.example/?room=OFFICE-1');assert.match(meta(page,'og:description'),/Tap to join/);
  page=(await get(port,'/?room='+encodeURIComponent('"><script>alert(1)</script>'))).body.toString();assert(!page.includes('<script>alert'));assert.equal(meta(page,'og:title'),'Join my Tank Frenzy arena · SCRIPTALERT1SCRI');
  page=(await get(port,'/?room=%00%00')).body.toString();assert.equal(meta(page,'og:title'),'Tank Frenzy — Cartoon Tank Battles','an empty code is an ordinary link');
});
test('without a public address the requested host is used, HTTPS only when the tunnel says so, and odd hosts get no tags',async t=>{
  const {port}=await setup(t,{});
  let page=(await get(port,'/',{Host:'play.example.org','X-Forwarded-Proto':'https'})).body.toString();assert.equal(meta(page,'og:image'),'https://play.example.org/og-image.jpg');
  page=(await get(port,'/',{Host:'192.168.1.50:8765'})).body.toString();assert.equal(meta(page,'og:url'),'http://192.168.1.50:8765/');
  page=(await get(port,'/',{Host:'evil.example/"><b>'})).body.toString();assert(!page.includes('og:title'));assert(!page.includes('evil.example'));
  assert(page.includes('<title>Tank Frenzy'),'the game itself still loads');
});
test('the preview picture is a small cached 1200×630 JPEG and the Home Assistant sidebar copy keeps its base path instead',async t=>{
  const {port,game}=await setup(t,{publicUrl:'https://tanks.example',ingress:true}),image=await get(port,'/og-image.jpg');
  assert.equal(image.status,200);assert.equal(image.headers['content-type'],'image/jpeg');assert.match(image.headers['cache-control'],/max-age=86400/);assert(image.body.length>20000&&image.body.length<300000,'chat apps skip large pictures');
  // JPEG start-of-frame carries height then width.
  const sof=image.body.indexOf(Buffer.from([0xff,0xc0]));assert.equal(image.body.readUInt16BE(sof+5),630);assert.equal(image.body.readUInt16BE(sof+7),1200);
  assert(fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8').includes('og-image.jpg'),'the picture ships in the app image');
  let body='';const res={setHeader(){},writeHead(){},end(text){body=String(text);},headersSent:false};
  game.ingressServer.emit('request',{url:'/',method:'GET',headers:{'x-ingress-path':'/api/hassio_ingress/abc123',host:'homeassistant.local:8123'},socket:{remoteAddress:'172.30.32.2'}},res);
  assert(body.includes('<base href="/api/hassio_ingress/abc123/">'));assert(!body.includes('og:image'),'the signed-in sidebar address is never advertised');
});
