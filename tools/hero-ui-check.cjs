// CI-only browser checks; the game has no extra runtime dependency.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..'),out=root+'/artifacts/hero';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const game=require(root+'/server.cjs').createGameServer();await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));
 let browser;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+game.server.address().port);await page.locator('.hero-art').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.hero-tank').getAnimations().length>0);
  assert.equal(await page.locator('#versionBadge').textContent(),'v'+require(root+'/shared.js').version);
  const motion=page.locator('#heroLayer-orange .hero-tank'),flash=page.locator('#heroLayer-orange .hero-burst'),ring=page.locator('#heroLayer-orange .hero-blast-ring');
  assert.equal(await page.locator('#heroBackdrop').getAttribute('href'),'./hero-quarry.webp');
  for(const asset of ['hero-quarry.webp','hero-tanks.webp'])assert(await page.evaluate(async asset=>{const response=await fetch('./'+asset);return response.ok&&response.headers.get('content-type')?.includes('image/webp');},asset),'layer asset loads: '+asset);
  assert.equal(await page.locator('use[href="#heroBackdrop"]').count(),0,'recoil never copies the background');
  assert(await page.evaluate(()=>!!(document.getElementById('heroLayer-purple').compareDocumentPosition(document.getElementById('heroLayer-blue'))&Node.DOCUMENT_POSITION_FOLLOWING)),'blue tank paints over distant purple shots');
  const alpha=await page.evaluate(async()=>{const bitmap=await createImageBitmap(await (await fetch('./hero-tanks.webp')).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return [[1000,300],[300,150],[300,300]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);});
  assert.equal(alpha[0],0);assert.equal(alpha[1],0);assert(alpha[2]>250,'tank is opaque but the surrounding quarry is transparent');
  const before=await motion.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(200);
  assert(await motion.evaluate(el=>el.getAnimations()[0].currentTime)>before,'tank animation advances');
  assert.equal(await page.locator('#heroMotion').count(),0,'the artwork has no visible playback control');
  await page.evaluate(()=>document.body.classList.add('hero-suspended'));
  await page.waitForFunction(()=>{const a=document.querySelector('.hero-tank').getAnimations()[0];return a.playState==='paused'&&!a.pending;});
  const paused=await motion.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(150);
  assert(Math.abs(await motion.evaluate(el=>el.getAnimations()[0].currentTime)-paused)<1,'hidden artwork stops animation');
  const shell=page.locator('#heroLayer-orange .hero-shell');
  await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=0)));
  assert.equal(await flash.evaluate(el=>getComputedStyle(el).opacity),'0','no flash between shots');
  assert.equal(await ring.evaluate(el=>getComputedStyle(el).opacity),'0','no muzzle shock ring between shots');
  assert.equal(await shell.evaluate(el=>getComputedStyle(el).opacity),'0','no shell between shots');
  const bulletAt=async(name,ms)=>page.evaluate(({name,ms})=>{const el=document.querySelector('#heroLayer-'+name+' .hero-shell');const delay=parseFloat(getComputedStyle(el).animationDelay)*1000;el.getAnimations()[0].currentTime=delay+ms;return {opacity:Number(getComputedStyle(el).opacity),x:new DOMMatrixReadOnly(getComputedStyle(el).transform).m41};},{name,ms});
  for(const name of ['orange','green','blue','purple']){
    const a=await bulletAt(name,1000),b=await bulletAt(name,1500),c=await bulletAt(name,2000);
    assert(a.opacity>.99&&c.opacity>.99);assert(Math.abs(b.x-a.x-100)<.1&&Math.abs(c.x-b.x-100)<.1,name+' shell travels at constant 200 art pixels/second');
    const startFade=await bulletAt(name,2400),endFade=await bulletAt(name,2880),end=await bulletAt(name,3120);
    assert(startFade.opacity>.6&&startFade.opacity<.9&&endFade.opacity>.1&&endFade.opacity<.4&&end.opacity<.01,name+' shell fades smoothly at the end');
    assert(Math.abs((endFade.x-startFade.x)-96)<.1&&Math.abs((end.x-endFade.x)-48)<.1,name+' shell keeps its speed while fading');
  }
  assert.equal(await shell.locator('use[href="#heroProjectile"]').count(),1,'shell uses the pointed shaded projectile');
  // Freeze a firing moment for repeatable responsive screenshots.
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=720)));
   assert(await flash.evaluate(el=>Number(getComputedStyle(el).opacity)>.3),'muzzle flash appears during the shot');
   assert(await ring.evaluate(el=>Number(getComputedStyle(el).opacity)>.1),'expanding muzzle ring appears during the shot');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
   await page.screenshot({path:out+'/lobby-'+width+'.png',fullPage:true});
   if(width===390){await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=0)));await page.screenshot({path:out+'/lobby-idle-390.png',fullPage:true});}
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=0));document.querySelectorAll('#heroLayer-purple .hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=6100));});
  await page.screenshot({path:out+'/lobby-purple-behind-blue.png',fullPage:true});
  await page.evaluate(()=>document.body.classList.remove('hero-suspended'));assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'running');
  await page.locator('#createRoom').click();assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'paused','animation pauses outside lobby');
  await page.waitForFunction(()=>joined);await page.evaluate(()=>leave());
  await page.evaluate(()=>{document.body.classList.add('hero-suspended');});assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
  await page.evaluate(()=>document.body.classList.remove('hero-suspended'));
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await flash.evaluate(el=>getComputedStyle(el).opacity),'0');assert.equal(await ring.evaluate(el=>getComputedStyle(el).opacity),'0');
  // Review the entire composition as well as the cropped responsive lobby.
  const review=await browser.newPage({viewport:{width:2048,height:768},reducedMotion:'no-preference'});
  const css=await page.locator('style').textContent(),svg=await page.locator('.hero-art').evaluate(el=>el.outerHTML);
  await review.setContent('<base href="'+page.url()+'"><style>'+css+' body{margin:0;padding:0;overflow:hidden}.hero-art{display:block!important;width:2048px!important;height:768px!important}</style><body class="in-lobby hero-suspended">'+svg+'</body>');
  await review.evaluate(async()=>{for(const path of ['hero-quarry.webp','hero-tanks.webp']){const img=new Image();img.src=path;await img.decode();}});
  for(const [name,time] of [['idle',0],['recoil',810],['fade',2880],['depth',6100]]){
    await review.evaluate(({name,time})=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=(name==='depth'&&!el.closest('#heroLayer-purple'))||(name==='fade'&&!el.closest('#heroLayer-orange'))?0:time)),{name,time});
    await review.screenshot({path:out+'/artwork-'+name+'.png'});
  }
  await review.close();
  assert.deepEqual(errors,[]);console.log('Hero movement, flashes, hidden-tab pause, lobby visibility, reduced motion, version badge and responsive layouts passed.');
 }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
