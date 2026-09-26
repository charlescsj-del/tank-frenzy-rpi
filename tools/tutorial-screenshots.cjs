#!/usr/bin/env node
// Regenerates the How to Play screenshots in tutorial/ by staging scenes with the
// real game renderer in headless Chromium. Needs Playwright (not a game dependency):
//   npm start                                   # in one terminal
//   npx -y -p playwright node tools/tutorial-screenshots.cjs [baseUrl] [outDir]
// Set ONLY=<file>.webp to regenerate a single image.
const path=require('path'),fs=require('fs');
function loadPlaywright(){
  try{return require('playwright');}catch{}
  try{return require(path.join(require('child_process').execSync('npm root -g').toString().trim(),'playwright'));}
  catch{console.error('Playwright is required: npx -y -p playwright node tools/tutorial-screenshots.cjs');process.exit(1);}
}
const {chromium,devices}=loadPlaywright();
const BASE=process.argv[2]||'http://localhost:8765/';
const OUT=process.argv[3]||path.join(__dirname,'..','tutorial');fs.mkdirSync(OUT,{recursive:true});
const ONLY=process.env.ONLY;
const walls=[
  {x:300,y:170,w:130,h:70,z:44},{x:640,y:150,w:150,h:64,z:40},{x:1010,y:170,w:120,h:78,z:46},{x:1320,y:180,w:110,h:70,z:42},
  {x:260,y:420,w:120,h:90,z:50},{x:700,y:430,w:170,h:70,z:52},{x:1060,y:400,w:130,h:96,z:40},
  {x:320,y:700,w:140,h:62,z:44},{x:640,y:690,w:90,h:92,z:36},{x:980,y:700,w:150,h:70,z:48},{x:1290,y:680,w:120,h:80,z:42},
];
const map={id:0x5eed,walls,spawns:[[90,90],[1510,950],[1510,90],[90,950]]};
function player(o){return {kills:0,deaths:0,connected:true,respawnIn:0,shield:false,life:1,team:null,power:null,powerRemaining:0,a:0,aim:0,hp:10,...o};}
let mapSeq=1;
function state(o){return {type:'state',room:'QUARRY',settings:{mode:'ffa',bouncing:true,powers:true},phase:'playing',countdownIn:0,ownerId:null,teamScores:[0,0],pickups:[],map:{...map,id:++mapSeq},time:50,winner:null,rematchIn:0,rematchVotes:[],players:[],shells:[],events:[],...o};}
async function toWebp(page,png,file,quality=.84){
  if(ONLY&&ONLY!==file)return;
  const data=await page.evaluate(async({src,quality})=>{
    const img=new Image();img.src=src;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
    return {url:c.toDataURL('image/webp',quality),w:img.width,h:img.height};
  },{src:'data:image/png;base64,'+png.toString('base64'),quality});
  fs.writeFileSync(path.join(OUT,file),Buffer.from(data.url.split(',')[1],'base64'));
  console.log(file,data.w+'x'+data.h,Math.round(fs.statSync(path.join(OUT,file)).size/1024)+'KB');
}
async function stage(page,data,extra=''){
  // Stop the render loop first so a pending frame cannot redraw with the default camera.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;window.annotate=null;});
  await page.waitForTimeout(120);
  await page.evaluate(({data,extra})=>{
    if(window._aimGuide)drawAimGuide=window._aimGuide;pointer.active=false;touchAim=null;lobbyVisible=false;joined=true;myId='me';roomCode='QUARRY';
    document.body.classList.remove('in-lobby','in-room-form');$('arena').classList.remove('lobby-open','room-form-open');
    $('overlay').classList.add('hidden');$('roomBrowser').hidden=true;$('leave').hidden=false;$('roomCode').textContent='QUARRY';
    updateTouchControls();tanks=[];shells=[];beams=[];applySnapshot(data);$('latency').textContent='18 MS';
    particles=[];last=900;
    window.redraw=()=>{resize();(0,eval)(extra);draw();window.annotate?.();};
  },{data,extra});
  // Layout changes trigger a ResizeObserver pass that clears the canvas; redraw after it.
  await page.waitForTimeout(200);
  await page.evaluate(()=>redraw());
}
// Shared canvas annotation helpers, evaluated in the page.
const helpers=`
window.label=(text,x,y,color='#365c4c')=>{ctx.save();ctx.font='900 15px ui-rounded,"Trebuchet MS",sans-serif';const w=ctx.measureText(text).width+20;roundedRect(ctx,x-w/2,y-14,w,26,10,'#fffbe9f2',color,2.5);ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,x,y+5);ctx.restore();};
window.arrow=(pts,color='#e8702f',dash=true)=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';if(dash)ctx.setLineDash([9,7]);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);const a=pts.at(-1),b=pts.at(-2),ang=Math.atan2(a.y-b.y,a.x-b.x);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x-13*Math.cos(ang-.45),a.y-13*Math.sin(ang-.45));ctx.lineTo(a.x-13*Math.cos(ang+.45),a.y-13*Math.sin(ang+.45));ctx.closePath();ctx.fill();ctx.restore();};
window.cursor=(x,y)=>{ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,22);ctx.lineTo(6,16);ctx.lineTo(10,25);ctx.lineTo(14,23);ctx.lineTo(10,15);ctx.lineTo(18,15);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#1d2b22';ctx.lineWidth=2;ctx.stroke();ctx.restore();};
window.focusOn=(x,y,zoom)=>{const p=project(x,y);scale=zoom;offsetX=cssW/2-p.x*scale;offsetY=cssH/2-p.y*scale;};
`;
(async()=>{
  const browser=await chromium.launch();
  // Desktop scenes.
  const desk=await browser.newPage({viewport:{width:1240,height:860},deviceScaleFactor:1});
  await desk.goto(BASE);await desk.waitForTimeout(600);await desk.evaluate(helpers);
  const tanks=[player({id:'me',slot:0,name:'You',x:520,y:330,a:0.3,kills:6,deaths:2}),player({id:'b',slot:1,name:'Blue',x:1180,y:560,a:Math.PI,aim:Math.PI*1.1,kills:4,deaths:3,hp:6}),player({id:'c',slot:2,name:'Moss',x:880,y:880,a:-1.2,aim:-2.2,kills:3,deaths:4,hp:9}),player({id:'d',slot:3,name:'Orchid',x:1450,y:300,a:2.6,aim:2.8,kills:2,deaths:5,hp:4})];

  // 1. PC controls: aim line toward the mouse, WASD movement arrows.
  await stage(desk,state({players:tanks,shells:[{id:1,x:700,y:398,vx:380,vy:150,slot:0,owner:'me'},{id:2,x:1060,y:545,vx:-400,vy:-60,slot:1,owner:'b'}]}),`
    pointer={x:1120,y:560,active:true};
    window.annotate=()=>{const me=project(520,330,0),m=project(1120,560,22);
      arrow([{x:me.x-8,y:me.y+28},{x:me.x-70,y:me.y+60}],'#365c4c',false);
      label('W A S D  =  drive',me.x-60,me.y+84);
      cursor(m.x,m.y);label('Mouse  =  aim',m.x+20,m.y+48,'#b75226');label('Hold left click  =  fire',m.x+20,m.y+80,'#b75226');};`);
  await desk.evaluate(()=>{$('roster').scrollTop=0;});
  await toWebp(desk,await desk.locator('#arena').screenshot(),'pc-controls.webp');

  // 2. Find your tank: close-up on the halo.
  await stage(desk,state({players:[player({id:'me',slot:2,name:'You',x:760,y:560,a:0,aim:-.4}),player({id:'b',slot:1,name:'Blue',x:980,y:500,a:Math.PI,aim:Math.PI}),player({id:'c',slot:0,name:'Ember',x:560,y:420,a:.6,aim:.3}),player({id:'d',slot:3,name:'Orchid',x:900,y:700,a:2,aim:2.5})]}),`
    focusOn(790,590,2.1);window.annotate=()=>{const me=project(760,560);arrow([{x:me.x-78,y:me.y+44},{x:me.x-27,y:me.y+17}],'#e8702f',false);label('Your tank: thick ring + ★',me.x-95,me.y+62,'#b75226');};`);
  await toWebp(desk,await desk.locator('#game').screenshot(),'find-tank.webp');

  // 3. Bouncing bullets: a bank shot off the ceiling wall, over the cover, into the hidden tank.
  const coverWalls=[{x:520,y:330,w:380,h:40,z:48},{x:730,y:450,w:40,h:250,z:52},{x:1090,y:420,w:120,h:70,z:44},{x:300,y:760,w:140,h:62,z:44},{x:980,y:780,w:150,h:70,z:48}];
  await stage(desk,state({players:[player({id:'me',slot:0,name:'You',x:440,y:560,a:0,aim:-0.618}),player({id:'b',slot:1,name:'Blue',x:975,y:560,a:Math.PI,aim:Math.PI})],
    map:{id:0xb0,walls:coverWalls,spawns:map.spawns},
    shells:[{id:1,x:585,y:457,vx:300,vy:-214,slot:0,owner:'me'},{id:2,x:835,y:471,vx:300,vy:214,slot:0,owner:'me'}]}),`
    focusOn(720,500,1.8);
    window.annotate=()=>{const P=(x,y)=>project(x,y,22),a=P(470,539),b=P(700,375),c=P(940,546);
      arrow([a,b,c],'#e8702f');ctx.save();ctx.fillStyle='#fff3a0';ctx.strokeStyle='#e8702f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      label('Bounce!',b.x,b.y-30,'#b75226');const w=project(750,700,52);label('Cover blocks a straight shot',w.x,w.y+34,'#365c4c');const t=project(975,560);label('Hit!',t.x+52,t.y-2,'#b75226');};`);
  await toWebp(desk,await desk.locator('#game').screenshot(),'bouncing.webp');

  // 4. Power-ups: tokens, a laser beam and an Immortal tank.
  await stage(desk,state({players:[player({id:'me',slot:0,name:'You',x:520,y:560,a:0,aim:0,power:'laser',powerRemaining:6.4}),player({id:'b',slot:1,name:'Blue',x:1050,y:590,a:Math.PI,aim:Math.PI,power:'immortal',powerRemaining:7}),player({id:'c',slot:2,name:'Moss',x:780,y:860,a:0,aim:-1,power:'speed',powerRemaining:5})],
    pickups:[{id:1,x:460,y:830,type:'double'},{id:2,x:1000,y:330,type:'machine'},{id:3,x:660,y:300,type:'restore'}]}),`
    window._aimGuide??=drawAimGuide;drawAimGuide=()=>{};
    beams=[{player:'me',tankLife:1,slot:0,originX:520,originY:560,endX:1024,endY:586,muzzleDistance:40,life:.18}];
    focusOn(760,590,1.35);
    window.annotate=()=>{const L=project(760,572,28),I=project(1050,590),T=project(460,830);label('Laser',L.x,L.y-26,'#c2345d');label('Immortal: no damage',I.x,I.y+48,'#a0761a');label('Power-up token',T.x+90,T.y+6,'#5a3fb0');};`);
  await toWebp(desk,await desk.locator('#game').screenshot(),'power-ups.webp');

  // Getting hit: flame edges, damage numbers and sparks around your tank.
  await stage(desk,state({players:[player({id:'me',slot:0,name:'You',x:700,y:540,a:0.2,aim:0.1,hp:3}),player({id:'b',slot:1,name:'Blue',x:1000,y:470,a:Math.PI,aim:Math.PI*.93}),player({id:'c',slot:2,name:'Moss',x:560,y:760,a:-1,aim:-.9,hp:5})],
    shells:[{id:1,x:900,y:500,vx:-400,vy:40,slot:1,owner:'b'}]}),`
    focusOn(780,560,1.8);hurt=.95;tanks.find(t=>t.id==='me').flash=.1;
    particles=[];for(let i=0;i<24;i++){const a=i*2.4,v=18+i%5*9;particles.push({x:712+Math.cos(a)*v,y:540+Math.sin(a)*v,z:26+i%7*6,vx:0,vy:0,vz:0,life:.5,total:.8,color:i%3?'#fff3a0':colors[0],r:2+i%3});}
    floaters=[{x:700,y:540,text:'-1',color:'#d8322a',life:.55,total:.9},{x:560,y:760,text:'-4',color:'#b85a1f',life:.8,total:.9}];
    window.annotate=()=>{const me=project(700,540);label('Flames flare when you are hit',me.x+190,me.y+92,'#b75226');};`);
  await toWebp(desk,await desk.locator('#game').screenshot(),'getting-hit.webp');

  // 5. How to win: the result card with Rematch / Leave Room.
  await stage(desk,state({phase:'results',winner:{id:'me',team:null,name:'Alice'},rematchIn:14.2,rematchVotes:['b'],rematchNeeded:2,players:[player({id:'me',slot:0,name:'Alice',x:520,y:330,kills:10,deaths:3,shots:64,hits:29}),player({id:'b',slot:1,name:'Blue',x:1180,y:560,kills:7,deaths:6,shots:71,hits:24}),player({id:'c',slot:2,name:'Moss',x:880,y:880,kills:5,deaths:6,shots:40,hits:15})]}),``);
  await desk.evaluate(()=>{const c=document.querySelector('.results-card');c.style.animation='none';});
  await toWebp(desk,await desk.locator('#arena').screenshot({animations:'disabled'}),'win.webp');

  // Mobile: thumb sticks in landscape.
  const phone=await browser.newContext({...devices['Pixel 7 landscape'],deviceScaleFactor:1.5});
  const mob=await phone.newPage();await mob.goto(BASE);await mob.waitForTimeout(600);await mob.evaluate(helpers);
  await stage(mob,state({players:[player({id:'me',slot:0,name:'You',x:520,y:360,a:0.3}),player({id:'b',slot:1,name:'Blue',x:860,y:250,a:Math.PI,aim:Math.PI*.95,hp:6}),player({id:'c',slot:2,name:'Moss',x:300,y:600,a:-1.2,aim:-.5})],shells:[{id:1,x:660,y:315,vx:380,vy:-120,slot:0,owner:'me'}]}),`
    touchAim={x:.95,y:-.31};sticks.move.x=.7;sticks.move.y=-.3;
    $('moveStick').style.setProperty('--stick-x','22px');$('moveStick').style.setProperty('--stick-y','-10px');
    $('aimStick').style.setProperty('--stick-x','28px');$('aimStick').style.setProperty('--stick-y','-9px');
    updateCamera();`);
  await toWebp(mob,await mob.screenshot(),'mobile-controls.webp');
  await browser.close();
})();
