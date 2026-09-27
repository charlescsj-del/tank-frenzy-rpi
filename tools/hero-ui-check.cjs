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
  const motion=page.locator('.hero-tank').first(),flash=page.locator('.hero-burst').first();
  assert.equal(await page.locator('#heroBackdrop').getAttribute('href'),'./mode-banner-idle.webp');
  assert(await page.evaluate(async()=>{const response=await fetch('./mode-banner-idle.webp');return response.ok&&response.headers.get('content-type')?.includes('image/webp');}),'clean artwork loads');
  const before=await motion.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(200);
  assert(await motion.evaluate(el=>el.getAnimations()[0].currentTime)>before,'tank animation advances');
  await page.locator('#heroMotion').click();assert.equal(await page.locator('#heroMotion').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>{const a=document.querySelector('.hero-tank').getAnimations()[0];return a.playState==='paused'&&!a.pending;});
  const paused=await motion.evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(150);
  assert(Math.abs(await motion.evaluate(el=>el.getAnimations()[0].currentTime)-paused)<1,'pause stops animation');
  const shell=page.locator('.hero-shell').first();
  await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=0)));
  assert.equal(await flash.evaluate(el=>getComputedStyle(el).opacity),'0','no flash between shots');
  assert.equal(await shell.evaluate(el=>getComputedStyle(el).opacity),'0','no shell between shots');
  const bulletAt=async ms=>page.evaluate(ms=>{const el=document.querySelector('.hero-shell');el.getAnimations()[0].currentTime=ms;return {opacity:Number(getComputedStyle(el).opacity),x:new DOMMatrixReadOnly(getComputedStyle(el).transform).m41};},ms);
  const early=await bulletAt(1400),late=await bulletAt(2400);
  assert(early.opacity>.8&&late.opacity>.8&&late.x>early.x+100,'large shell travels visibly for over a second');
  assert.equal(await shell.locator('circle[r="17"]').count(),1,'shell has a larger visible core');
  // Freeze a firing moment for repeatable responsive screenshots.
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=720)));
   assert(await flash.evaluate(el=>Number(getComputedStyle(el).opacity)>.3),'muzzle flash appears during the shot');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
   const button=await page.locator('#heroMotion').boundingBox();assert(button.width>=44&&button.height>=44,'touch sized pause control');
   await page.screenshot({path:out+'/lobby-'+width+'.png',fullPage:true});
   if(width===390){await page.evaluate(()=>document.querySelectorAll('.hero-motion-layer').forEach(el=>el.getAnimations().forEach(a=>a.currentTime=0)));await page.screenshot({path:out+'/lobby-idle-390.png',fullPage:true});}
  }
  await page.locator('#heroMotion').click();assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'running');
  await page.locator('#createRoom').click();assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'paused','animation pauses outside lobby');
  await page.locator('#browseRooms').click();
  await page.evaluate(()=>{document.body.classList.add('hero-suspended');});assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
  await page.evaluate(()=>document.body.classList.remove('hero-suspended'));
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await motion.evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await flash.evaluate(el=>getComputedStyle(el).opacity),'0');assert.equal(await page.locator('#heroMotion').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('Hero movement, flashes, pause, lobby visibility, reduced motion, version badge and responsive layouts passed.');
 }finally{await browser?.close();await game.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
