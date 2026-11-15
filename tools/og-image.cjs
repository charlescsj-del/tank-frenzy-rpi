#!/usr/bin/env node
'use strict';
// Renders og-image.jpg, the 1200×630 picture chat apps show beside a shared game link.
// Run after changing the home artwork: npx -y -p playwright node tools/og-image.cjs
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),art='data:image/webp;base64,'+fs.readFileSync(path.join(root,'mode-banner-idle.webp')).toString('base64');
const html=`<!doctype html><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;font-family:ui-rounded,"Trebuchet MS","Arial Rounded MT Bold",system-ui,sans-serif;background:#153b32}
img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 42%}
.shade{position:absolute;inset:0;background:linear-gradient(to top,#12281cf2 0%,#12281cb0 30%,#12281c00 62%),linear-gradient(to right,#12281c99 0%,#12281c00 55%)}
.brand{position:absolute;left:56px;top:44px;padding:10px 22px;border-radius:18px;background:#153b32e6;color:#fff6dd;font-weight:900;font-size:44px;letter-spacing:-1px}.brand b{color:#ffb54a}
.copy{position:absolute;left:56px;bottom:52px;color:#fff6dd;text-shadow:0 3px 10px #0b1a12}
h1{font-size:92px;line-height:.98;font-weight:900;letter-spacing:-3px}h1 span{display:block;color:#ffb54a}
p{margin-top:20px;font-size:32px;font-weight:800;color:#e9f2d6}
.play{position:absolute;right:56px;bottom:56px;padding:20px 40px;border-radius:26px;background:linear-gradient(#ffb04a,#ee7f35);box-shadow:0 8px 0 #b85a1f;color:#2c2414;font-size:40px;font-weight:900;letter-spacing:1px}
</style><img src="${art}" alt=""><div class="shade"></div><div class="brand">TANK <b>FRENZY</b></div><div class="copy"><h1>Small tanks.<span>Big rivalries.</span></h1><p>Free multiplayer tank battles · Nothing to install</p></div><div class="play">▶ PLAY</div>`;
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  try{const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});await page.setContent(html);await page.locator('img').evaluate(img=>img.decode());
    const file=process.argv[2]||path.join(root,'og-image.jpg');await page.screenshot({path:file,type:'jpeg',quality:84});console.log(file,fs.statSync(file).size,'bytes');}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
