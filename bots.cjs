'use strict';
// Computer-controlled tanks. Bots drive through the same input as players, so the
// server's movement, cooldown, collision and power rules apply to them unchanged.
const F=require('./shared.js');

const skills={
  easy:{think:.22,aimError:.2,fireCone:.3,reaction:.7,lead:0,range:700},
  normal:{think:.12,aimError:.09,fireCone:.18,reaction:.4,lead:.5,range:850},
  hard:{think:.07,aimError:.035,fireCone:.1,reaction:.18,lead:1,range:1000}
};
const botNames=['Rusty','Bolt','Dozer','Sprocket','Tread','Gizmo','Rivet','Piston'];
const angleGap=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

// A shell-sized line from one tank to another that no wall interrupts.
function clearShot(room,from,to,rayBox){
  const dx=to.x-from.x,dy=to.y-from.y;
  return !room.map.walls.some(w=>rayBox(from.x,from.y,dx,dy,{x:w.x-6,y:w.y-6,w:w.w+12,h:w.h+12})!==null);
}

// Try the wanted direction first, then fan out until a direction is clear of walls and tanks.
function steer(room,p,dx,dy){
  const length=Math.hypot(dx,dy);if(length<1e-6)return {x:0,y:0};
  const base=Math.atan2(dy,dx);
  for(const turn of [0,.45,-.45,.9,-.9,1.4,-1.4,2.1,-2.1,Math.PI]){
    const a=base+turn,x=Math.cos(a),y=Math.sin(a);
    if(!room.blocked(p.x+x*22,p.y+y*22,p)&&!room.blocked(p.x+x*48,p.y+y*48,p))return {x,y};
  }
  return {x:0,y:0};
}

function think(room,p,rayBox){
  const skill=skills[room.botSkill]||skills.normal,now=room.time;
  const brain=p.brain??={next:0,sighted:null,sightedAt:0,seen:new Map(),strafe:Math.random()<.5?1:-1,strafeUntil:0,stuckCheck:0,lastX:p.x,lastY:p.y,detour:null,detourUntil:0};
  p.lastInput=now;
  if(room.phase!=='playing'||p.hp<=0){p.input={x:0,y:0,aimX:p.x+Math.cos(p.aim)*100,aimY:p.y+Math.sin(p.aim)*100,fire:false};return;}
  if(now<brain.next)return;
  const dt=Math.max(.01,now-(brain.last??now-skill.think));brain.last=now;brain.next=now+skill.think*(.8+Math.random()*.4);

  const enemies=[...room.players.values()].filter(t=>t!==p&&t.connected&&t.hp>0&&!room.friendly(p,t));
  const distance=t=>Math.hypot(t.x-p.x,t.y-p.y);
  const visible=enemies.filter(t=>distance(t)<skill.range&&clearShot(room,p,t,rayBox)).sort((a,b)=>distance(a)-distance(b));
  const target=visible[0]||enemies.sort((a,b)=>distance(a)-distance(b))[0]||null;

  // Aim: lead the target by its recent velocity, then add a skill-sized wobble.
  let aimX=p.x+Math.cos(p.aim)*100,aimY=p.y+Math.sin(p.aim)*100,fire=false;
  if(target){
    const before=brain.seen.get(target.id),vx=before?(target.x-before.x)/dt:0,vy=before?(target.y-before.y)/dt:0;
    brain.seen.set(target.id,{x:target.x,y:target.y});
    const flight=distance(target)/F.shellSpeed*skill.lead;
    const wanted=Math.atan2(target.y+vy*flight-p.y,target.x+vx*flight-p.x)+(Math.random()-.5)*2*skill.aimError;
    aimX=p.x+Math.cos(wanted)*200;aimY=p.y+Math.sin(wanted)*200;
    if(visible[0]===target){
      if(brain.sighted!==target.id){brain.sighted=target.id;brain.sightedAt=now;}
      fire=now-brain.sightedAt>=skill.reaction&&angleGap(p.aim,wanted)<skill.fireCone&&!room.invulnerable(target);
    }else brain.sighted=null;
  }

  // Movement: fetch a nearby token when safe, otherwise close in, circle at medium range, or back off.
  let goalX=0,goalY=0;
  const token=room.pickups.map(drop=>({drop,d:Math.hypot(drop.x-p.x,drop.y-p.y)})).sort((a,b)=>a.d-b.d)[0];
  const threat=visible[0]&&distance(visible[0])<380;
  if(token&&token.d<360&&!threat){goalX=token.drop.x-p.x;goalY=token.drop.y-p.y;}
  else if(target){
    const d=distance(target),tx=(target.x-p.x)/d,ty=(target.y-p.y)/d;
    if(now>brain.strafeUntil){brain.strafe*=-1;brain.strafeUntil=now+1.2+Math.random()*1.8;}
    if(!visible.includes(target)||d>480){goalX=tx;goalY=ty;}
    else if(d<240){goalX=-tx+ -ty*brain.strafe*.6;goalY=-ty+tx*brain.strafe*.6;}
    else{goalX=-ty*brain.strafe+tx*.15;goalY=tx*brain.strafe+ty*.15;}
  }
  // Unstick: if barely moved while trying to, take a random detour for a moment.
  if(now>=brain.stuckCheck){
    const moved=Math.hypot(p.x-brain.lastX,p.y-brain.lastY);
    if(moved<10&&(goalX||goalY)&&now>brain.detourUntil){const a=Math.random()*Math.PI*2;brain.detour={x:Math.cos(a),y:Math.sin(a)};brain.detourUntil=now+.7;}
    brain.lastX=p.x;brain.lastY=p.y;brain.stuckCheck=now+.8;
  }
  if(now<brain.detourUntil&&brain.detour){goalX=brain.detour.x;goalY=brain.detour.y;}
  const move=steer(room,p,goalX,goalY);
  p.input={x:move.x,y:move.y,aimX,aimY,fire};
}

module.exports={skills,botNames,think};
