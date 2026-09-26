'use strict';
const {randomUUID}=require('node:crypto');
const F=require('./shared.js');
const {generateMap}=require('./map-generator.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hitRect(x,y,r,w){return (x-clamp(x,w.x,w.x+w.w))**2+(y-clamp(y,w.y,w.y+w.h))**2<r*r;}
// First contact along a relative motion segment, as a fraction of one tick.
function contactTime(x,y,dx,dy,r){
  const c=x*x+y*y-r*r;if(c<=0)return 0;
  const a=dx*dx+dy*dy,b=2*(x*dx+y*dy),d=b*b-4*a*c;
  if(a===0||b>=0||d<0)return null;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:null;
}
const neutral=()=>({x:0,y:0,aimX:F.width/2,aimY:F.height/2,fire:false});
function rayBox(x,y,dx,dy,w){
  let near=0,far=1;
  for(const [p,d,min,max] of [[x,dx,w.x,w.x+w.w],[y,dy,w.y,w.y+w.h]]){
    if(Math.abs(d)<1e-9){if(p<min||p>max)return null;continue;}
    const a=(min-p)/d,b=(max-p)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(near>far)return null;
  }
  return near;
}
class Room {
  constructor(code,options={}){this.code=code;this.settings=Object.freeze({mode:options?.mode==='teams'?'teams':'ffa',bouncing:options?.bouncing!==false,powers:options?.powers!==false});this.phase='waiting';this.countdownUntil=0;this.ownerId=null;this.teamScores=[0,0];this.pickups=[];this.pickupId=0;this.nextPickup=6;this.map=generateMap();this.players=new Map();this.shells=[];this.events=[];this.time=0;this.eventId=0;this.shellId=0;this.winner=null;this.rematchUntil=0;this.rematchVotes=new Set();}
  emit(type,data){this.events.push({id:++this.eventId,type,...data});}
  add(name){
    if(this.players.size>=F.maxPlayers)return null;
    const slot=Array.from({length:F.maxPlayers},(_,i)=>i).find(i=>![...this.players.values()].some(p=>p.slot===i));
    const p={id:randomUUID(),slot,name:name||F.palette[slot].name,x:0,y:0,a:0,aim:0,hp:F.maxHealth,kills:0,deaths:0,cool:0,respawnAt:0,shieldUntil:0,connected:true,disconnectedAt:0,input:neutral(),lastInput:this.time,seq:-1,life:0};
    const teams=[0,1].map(team=>[...this.players.values()].filter(t=>t.team===team).length);
    p.team=this.settings.mode==='teams'?(teams[0]<=teams[1]?0:1):null;
    if(this.phase==='waiting')this.ownerId??=p.id;
    this.players.set(p.id,p);this.spawn(p);return p;
  }
  refreshOwner(){
    if(this.phase!=='waiting'){this.ownerId=null;return;}
    if(!this.players.get(this.ownerId)?.connected)this.ownerId=[...this.players.values()].find(p=>p.connected)?.id??null;
  }
  remove(p){this.players.delete(p.id);this.rematchVotes.delete(p.id);this.refreshOwner();}
  start(p){
    this.refreshOwner();
    if(this.phase!=='waiting'||!p?.connected||p.id!==this.ownerId||!this.players.has(p.id))return false;
    this.beginCountdown();return true;
  }
  voteRematch(p){
    if(this.phase!=='results'||this.time>=this.rematchUntil||!p?.connected||this.players.get(p.id)!==p||this.rematchVotes.has(p.id))return false;
    this.rematchVotes.add(p.id);
    const connected=[...this.players.values()].filter(player=>player.connected);
    if(connected.every(player=>this.rematchVotes.has(player.id))){
      this.winner=null;this.rematchUntil=0;this.rematchVotes.clear();this.teamScores=[0,0];this.map=generateMap();
      for(const player of this.players.values()){player.kills=0;player.deaths=0;}
      this.beginCountdown();this.emit('restart',{});
    }
    return true;
  }
  beginCountdown(){
    this.phase='countdown';this.ownerId=null;this.countdownUntil=this.time+3;
    this.shells=[];this.pickups=[];this.nextPickup=this.countdownUntil+6;
    for(const p of this.players.values())this.spawn(p);
  }
  spawn(p){
    p.power=null;p.powerUntil=0;
    const others=[...this.players.values()].filter(t=>t!==p&&t.connected&&t.hp>0);
    const choices=this.map.spawns.map((xy,i)=>({xy,score:others.length?Math.min(...others.map(t=>Math.hypot(t.x-xy[0],t.y-xy[1]))):i===p.slot?1:0})).sort((a,b)=>b.score-a.score);
    const free=choices.find(c=>!others.some(t=>Math.hypot(t.x-c.xy[0],t.y-c.xy[1])<55));
    if(!free){p.hp=0;p.respawnAt=this.time+.5;return;}
    [p.x,p.y]=free.xy;p.hp=F.maxHealth;p.life++;p.respawnAt=0;p.cool=.3;p.shieldUntil=this.phase==='playing'?this.time+3:0;p.input=neutral();p.pendingShot=false;p.a=p.x<F.width/2?0:Math.PI;p.aim=p.a;
  }
  setInput(p,m){
    if(!Number.isSafeInteger(m.seq)||m.seq<=p.seq||!Number.isFinite(m.x)||!Number.isFinite(m.y)||!Number.isFinite(m.aimX)||!Number.isFinite(m.aimY)||typeof m.fire!=='boolean')return;
    p.seq=m.seq;p.lastInput=this.time;
    if(this.phase!=='playing'){p.input=neutral();p.pendingShot=false;return;}
    if(m.fire&&!p.input.fire&&p.hp>0)p.pendingShot=true;
    p.input={x:clamp(m.x,-1,1),y:clamp(m.y,-1,1),aimX:clamp(m.aimX,-200,F.width+200),aimY:clamp(m.aimY,-200,F.height+200),fire:m.fire};
  }
  disconnect(p){p.connected=false;p.disconnectedAt=this.time;p.input=neutral();p.pendingShot=false;this.refreshOwner();}
  blocked(x,y,p){return x<26||x>F.width-26||y<26||y>F.height-26||this.map.walls.some(w=>hitRect(x,y,26,w))||[...this.players.values()].some(t=>t!==p&&t.connected&&t.hp>0&&Math.hypot(x-t.x,y-t.y)<50);}
  friendly(a,b){return this.settings.mode==='teams'&&a.team!=null&&a.team===b.team;}
  invulnerable(p){return p.shieldUntil>this.time||(this.settings.powers&&p.power==='immortal'&&p.powerUntil>this.time);}
  damage(p,owner,amount=1){
    if(this.phase!=='playing')return;
    const attacker=this.players.get(owner);
    if(p.hp<=0||this.invulnerable(p)||(attacker&&this.friendly(attacker,p)))return;
    p.hp=Math.max(0,p.hp-amount);const dead=p.hp===0;
    this.emit(dead?'destroyed':'hit',{x:p.x,y:p.y,slot:p.slot,player:p.id,damage:amount});
    if(!dead)return;
    p.deaths++;p.respawnAt=this.time+3;p.input=neutral();p.pendingShot=false;p.power=null;p.powerUntil=0;
    if(!attacker)return;
    attacker.kills++;
    const teams=this.settings.mode==='teams',score=teams?++this.teamScores[attacker.team]:attacker.kills;
    if(score>=F.targetScore){this.winner={id:attacker.id,team:attacker.team,name:teams?(attacker.team===0?'Orange team':'Blue team'):attacker.name};this.phase='results';this.rematchUntil=this.time+20;this.rematchVotes.clear();this.shells=[];this.pickups=[];}
  }
  spawnPickup(){
    if(!this.settings.powers||this.pickups.length>=2)return;
    for(let i=0;i<24;i++){
      const x=60+Math.random()*(F.width-120),y=60+Math.random()*(F.height-120);
      if(this.blocked(x,y,null)||this.pickups.some(p=>Math.hypot(p.x-x,p.y-y)<100))continue;
      this.pickups.push({id:++this.pickupId,type:F.powers[Math.floor(Math.random()*F.powers.length)],x,y,expiresAt:this.time+F.pickupLifetime});return;
    }
  }
  fireLaser(p){
    const length=Math.hypot(F.width,F.height),dx=Math.cos(p.aim)*length,dy=Math.sin(p.aim)*length;
    let end=1,target=null;
    // Four perimeter strips stop the beam at the board edge.
    const blockers=[...this.map.walls,{x:-10,y:-10,w:F.width+20,h:10},{x:-10,y:F.height,w:F.width+20,h:10},{x:-10,y:0,w:10,h:F.height},{x:F.width,y:0,w:10,h:F.height}];
    for(const w of blockers){const t=rayBox(p.x,p.y,dx,dy,w);if(t!==null)end=Math.min(end,t);}
    for(const enemy of this.players.values()){
      if(enemy===p||!enemy.connected||enemy.hp<=0||this.friendly(p,enemy))continue;
      const t=contactTime(p.x-enemy.x,p.y-enemy.y,dx,dy,26);
      if(t!==null&&t<end){end=t;target=enemy;}
    }
    // Trace from the hull first so a muzzle inside nearby cover cannot shoot through it.
    const endX=p.x+dx*end,endY=p.y+dy*end,muzzleDistance=Math.min(F.barrelLength,length*end);
    const muzzle=F.muzzle(p.x,p.y,p.aim,muzzleDistance),beamX=endX-muzzle.x,beamY=endY-muzzle.y;
    if(Math.hypot(beamX,beamY)>1e-6){
      for(const shell of this.shells){
        if(shell.life<=0||shell.owner===p.id||this.friendly(p,shell))continue;
        if(contactTime(muzzle.x-shell.x,muzzle.y-shell.y,beamX,beamY,F.laserRadius+5)!==null){
          shell.life=0;this.emit('laser-clear',{x:shell.x,y:shell.y,slot:shell.slot});
        }
      }
      this.shells=this.shells.filter(shell=>shell.life>0);
    }
    this.emit('laser',{...muzzle,endX,endY,originX:p.x,originY:p.y,muzzleDistance,tankLife:p.life,slot:p.slot,player:p.id});
    if(target)this.damage(target,p.id,F.laserDamage);
  }
  fire(p){
    if(this.phase!=='playing'||p.cool>0||this.winner)return;
    const power=this.settings.powers&&p.powerUntil>this.time?p.power:null;
    const count=power==='double'?2:1;
    if(power!=='laser'&&(this.shells.length+count>F.maxShells||this.shells.filter(s=>s.owner===p.id).length+count>F.maxShellsPerPlayer))return;
    p.cool=power==='machine'?.12:power==='laser'?.8:F.fireCooldown;
    if(power==='laser'){this.fireLaser(p);return;}
    const dx=Math.cos(p.aim),dy=Math.sin(p.aim);
    for(const offset of power==='double'?[-F.doubleBarrelOffset,F.doubleBarrelOffset]:[0]){
    // Separate barrel origins, identical velocity: a parallel double volley.
    const originX=p.x-dy*offset,originY=p.y+dx*offset;let x=originX,y=originY;
    // If the barrel intersects cover, start at its last clear point. The normal
    // collision step then produces a ricochet instead of deleting the shot.
    for(let d=1;d<=38;d++){
      const nx=originX+dx*d,ny=originY+dy*d;
      if(nx<5||nx>F.width-5||ny<5||ny>F.height-5||this.map.walls.some(w=>hitRect(nx,ny,5,w)))break;
      x=nx;y=ny;
    }
    this.emit('shot',{x,y,slot:p.slot,player:p.id,power});
    const life=Math.hypot(F.width,F.height)/F.shellSpeed+2;
    this.shells.push({id:++this.shellId,x,y,vx:dx*F.shellSpeed,vy:dy*F.shellSpeed,owner:p.id,team:p.team,slot:p.slot,life,bounces:0});
    }
  }
  step(dt){
    this.time+=dt;
    for(const p of this.players.values())if(!p.connected&&this.time-p.disconnectedAt>15)this.remove(p);
    this.refreshOwner();
    if(this.phase==='waiting')return;
    if(this.phase==='countdown'){
      if(this.time>=this.countdownUntil){this.phase='playing';for(const p of this.players.values()){p.input=neutral();p.pendingShot=false;p.lastInput=this.time;}this.emit('start',{});}
      return;
    }
    if(this.phase==='results'){if(this.time>=this.rematchUntil){this.phase='postgame';this.rematchVotes.clear();}return;}
    if(this.phase==='postgame')return;
    this.pickups=this.pickups.filter(p=>p.expiresAt>this.time);
    if(this.settings.powers&&this.time>=this.nextPickup){this.spawnPickup();this.nextPickup=this.time+F.pickupInterval;}
    for(const p of this.players.values()){
      if(!p.connected)continue;
      if(p.hp<=0){if(this.time>=p.respawnAt)this.spawn(p);continue;}
      if(p.powerUntil<=this.time){p.power=null;p.powerUntil=0;}
      p.cool=Math.max(0,p.cool-dt);
      if(this.time-p.lastInput>.5){p.input=neutral();p.pendingShot=false;}
      const input=p.input;p.aim=Math.atan2(input.aimY-p.y,input.aimX-p.x);
      let dx=input.x,dy=input.y;
      const length=Math.hypot(dx,dy);
      const speed=this.settings.powers&&p.power==='speed'?272:170;
      if(length){dx=dx/length*speed*dt;dy=dy/length*speed*dt;p.a=Math.atan2(dy,dx);if(!this.blocked(p.x+dx,p.y,p))p.x+=dx;if(!this.blocked(p.x,p.y+dy,p))p.y+=dy;}
      if(this.settings.powers){
        const index=this.pickups.findIndex(drop=>Math.hypot(drop.x-p.x,drop.y-p.y)<=F.pickupRadius&&
          !this.map.walls.some(w=>rayBox(p.x,p.y,drop.x-p.x,drop.y-p.y,w)!==null));
        if(index>=0){
          const [drop]=this.pickups.splice(index,1);
          if(drop.type==='restore')p.hp=F.maxHealth;
          else{p.power=drop.type;p.powerUntil=this.time+F.powerDuration;}
          this.emit('pickup',{x:p.x,y:p.y,slot:p.slot,player:p.id,power:drop.type});
        }
      }
      if(input.fire||p.pendingShot){this.fire(p);p.pendingShot=false;}
      if(this.winner)return;
    }
    const paths=new Map();
    for(const s of this.shells){
      const start={x:s.x,y:s.y};
      s.life-=dt;const nx=s.x+s.vx*dt,ny=s.y+s.vy*dt;let bx=nx<5||nx>F.width-5,by=ny<5||ny>F.height-5;
      if(s.life<=0)continue;
      for(const w of this.map.walls)if(hitRect(nx,ny,5,w)){let hx=hitRect(nx,s.y,5,w),hy=hitRect(s.x,ny,5,w);if(!hx&&!hy){hx=true;hy=true;}bx||=hx;by||=hy;}
      if(bx||by){if(!this.settings.bouncing){s.life=0;continue;}if(bx)s.vx*=-1;if(by)s.vy*=-1;s.bounces++;this.emit('bounce',{x:s.x,y:s.y,slot:s.slot});}else{s.x=nx;s.y=ny;}
      if(s.bounces>6)s.life=0;
      if(s.life>0)paths.set(s,{...start,dx:s.x-start.x,dy:s.y-start.y});
    }
    const active=[...paths.keys()],contacts=[];
    for(let i=0;i<active.length;i++){
      const s=active[i],a=paths.get(s);
      for(let j=i+1;j<active.length;j++){
        const other=active[j];if(s.owner===other.owner||this.friendly(s,other))continue;
        const b=paths.get(other),time=contactTime(a.x-b.x,a.y-b.y,a.dx-b.dx,a.dy-b.dy,10);
        if(time!==null)contacts.push({time,s,other});
      }
      for(const p of this.players.values()){
        if(!p.connected||p.hp<=0||p.id===s.owner||this.friendly(s,p)||p.shieldUntil>this.time)continue;
        const time=contactTime(a.x-p.x,a.y-p.y,a.dx,a.dy,26);
        if(time!==null)contacts.push({time,s,p});
      }
    }
    // Resolve the earliest impact first so an intercepted shell cannot also hit a tank.
    contacts.sort((a,b)=>a.time-b.time||Number(!!b.other)-Number(!!a.other));
    for(const {time,s,other,p} of contacts){
      if(s.life<=0)continue;
      if(other){
        if(other.life<=0)continue;
        const a=paths.get(s),b=paths.get(other);
        s.life=0;other.life=0;
        this.emit('shell-clash',{x:(a.x+a.dx*time+b.x+b.dx*time)/2,y:(a.y+a.dy*time+b.y+b.dy*time)/2,slot:s.slot,otherSlot:other.slot});
      }else{
        if(p.hp<=0)continue;
        s.life=0;this.damage(p,s.owner);
      }
      if(this.winner)break;
    }
    this.shells=this.shells.filter(s=>s.life>0);
  }
  snapshot(){return {type:'state',room:this.code,settings:this.settings,phase:this.phase,countdownIn:this.phase==='countdown'?Math.max(0,this.countdownUntil-this.time):0,ownerId:this.ownerId,teamScores:this.teamScores,pickups:this.pickups,map:this.map,time:this.time,winner:this.winner,rematchIn:this.phase==='results'?Math.max(0,this.rematchUntil-this.time):0,rematchVotes:[...this.rematchVotes],players:[...this.players.values()].map(({id,slot,name,x,y,a,aim,hp,kills,deaths,connected,respawnAt,shieldUntil,life,team,power,powerUntil})=>({id,slot,name,x,y,a,aim,hp,kills,deaths,connected,respawnIn:Math.max(0,respawnAt-this.time),shield:shieldUntil>this.time,life,team,power,powerRemaining:Math.max(0,powerUntil-this.time)})),shells:this.shells,events:this.events};}
}
module.exports={Room,hitRect};
