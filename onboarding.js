'use strict';
let matchCoach=null;
function coachSeen(){try{return localStorage.getItem('tank-frenzy-guidance:'+profileId)==='done';}catch{return false;}}
function dismissCoach(){
  if(matchCoach)matchCoach.done=true;$('matchCoach').hidden=true;
  try{localStorage.setItem('tank-frenzy-guidance:'+profileId,'done');}catch{}
}
$('skipCoach').addEventListener('click',dismissCoach);
function updateCoach(data){
  const me=data.players.find(p=>p.id===myId);
  if(!joined||spectating||data.phase!=='playing'||!me||!playerProgress||playerProgress.stats.matches>0){$('matchCoach').hidden=true;return;}
  const round=data.roundId||data.mapId||data.map?.id;
  if(matchCoach?.round!==round){
    matchCoach={round,step:0,x:me.x,y:me.y,moved:false,fired:false,at:data.time,done:coachSeen()};
  }
  const c=matchCoach;c.moved||=Math.hypot(me.x-c.x,me.y-c.y)>=36;c.fired||=me.shots>0;
  if(c.step===0&&c.moved){c.step=1;c.at=data.time;}
  if(c.step===1&&c.fired){c.step=data.settings?.bouncing===false?3:2;c.at=data.time;}
  if(c.step===2&&data.time-c.at>=6){c.step=3;c.at=data.time;}
  if(c.step===3&&data.time-c.at>=6){dismissCoach();return;}
  if(c.done||document.hidden||me.hp<=0||profileOpen||tutorialOpen||leaveDialogOpen||resultDetailsOpen||$('arena').classList.contains('menu-open')){$('matchCoach').hidden=true;return;}
  const mobile=touchMedia.matches,tip=[['Find your rhythm',mobile?'Drag the left half to move your tank.':'Use W A S D to move your tank.'],['Take your shot',mobile?'Drag the right half to aim and fire. Release to stop.':'Aim with the mouse. Hold left click to fire.'],['Try a ricochet','Shots bounce off walls. Use cover to line up a bank shot.'],['You’re ready to roll',data.settings?.mode==='teams'?'Work together. First team to '+(data.settings.targetScore||10)+' kills wins.':'First to '+(data.settings?.targetScore||10)+' kills wins. Grab power-ups along the way.']][c.step];
  const signature=tip.join('|');if($('matchCoach').signature!==signature){$('matchCoach').signature=signature;$('coachTitle').textContent=tip[0];$('coachText').textContent=tip[1];}
  $('matchCoach').hidden=false;
}
