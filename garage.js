'use strict';
let playerProgress=null,progressLoading=null,garageOpen=false,garageSelected='classic',garageBusy=false,progressSerial=Promise.resolve(),rewardSignature='',weeklyTimer=null;
// These dialogs must remain available inside the fullscreen arena after a match.
$('arena').append($('garageDialog'),$('profileDialog'));
function savePlayerProfile(profile){profileSecret=profile.secret;profileId=profile.id;try{localStorage.setItem('tank-frenzy-profile',JSON.stringify(profile));}catch{}}
function receiveProgress(value){if(!value)return;playerProgress=value;renderProgressHome();if(garageOpen)renderGarage();clearTimeout(weeklyTimer);const refreshAt=Math.min(value.weekly?.resetAt??Infinity,value.missions?.resetAt??Infinity);if(Number.isFinite(refreshAt))weeklyTimer=setTimeout(()=>loadPlayerProgress().catch(()=>{}),Math.min(2147483000,Math.max(1000,refreshAt-Date.now()+100)));}
async function playerAction(action,extra={}){
  const run=async()=>{
    const response=await fetch(appUrl('progress'),{method:'POST',headers:{'Content-Type':'application/json','X-Tank-Player':'1'},body:JSON.stringify({action,profile:profileSecret,...extra})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Progress is unavailable. Please try again.');
    savePlayerProfile(data.profile);receiveProgress(data.progress);return data;
  };
  const request=progressSerial.then(run);progressSerial=request.catch(()=>{});return request;
}
function loadPlayerProgress(){
  if(progressLoading)return progressLoading;
  progressLoading=playerAction('load').catch(error=>{$('progressHomeNote').textContent=error.message;throw error;}).finally(()=>{progressLoading=null;});return progressLoading;
}
function renderProgressHome(){
  const p=playerProgress;if(!p)return;
  $('coinBalance').textContent=p.coins.toLocaleString()+' coins';$('garageButton').setAttribute('aria-label','Garage · '+p.coins+' coins');
  const paused=p.enabled===false,daily=p.daily,missions=p.missions?.missions||[],weekly=p.weekly?.challenges||[],missionsDone=missions.filter(m=>m.completed).length,weeklyDone=weekly.filter(c=>c.completed).length;
  homeTile('dailyHome','Daily',paused?'Paused':'Day '+(daily.qualified?daily.step:daily.nextDay),daily.qualified?' complete →':' →',paused?0:daily.step/7,daily.qualified,paused?'Daily rewards are paused.':daily.qualified?'Daily reward: Day '+daily.step+' earned. Tomorrow is Day '+daily.nextDay+'.':'Daily reward: play one standard match for Day '+daily.nextDay+'.');
  $('missionsHome').hidden=!missions.length;homeTile('missionsHome','Missions',paused?'Paused':missionsDone+'/'+missions.length,' →',paused||!missions.length?0:missionsDone/missions.length,missions.length>0&&missionsDone===missions.length,paused?'Daily missions are paused.':'Daily missions: '+missionsDone+' of '+missions.length+' done.');
  homeTile('weeklyHome','Weekly',paused?'Paused':weeklyDone+'/'+weekly.length,' complete →',paused||!weekly.length?0:weeklyDone/weekly.length,weekly.length>0&&weeklyDone===weekly.length,paused?'Weekly challenges are paused.':'Weekly challenges: '+weeklyDone+' of '+weekly.length+' complete.');
  $('progressHomeNote').textContent=p.persistent?'Play matches. Earn coins. Make it yours.':'Progress lasts for this server session. Ask the host to enable permanent storage.';
  $('progressHome').hidden=spectating;
  const level=p.level;$('levelHome').hidden=!level;
  // The player's own tank, in the skin and class they will take into the next match.
  const look=[lastTankSlot,p.equipped,p.selectedVehicle].join();if($('homeTank').look!==look&&typeof tankPortrait==='function'){$('homeTank').look=look;$('homeTank').replaceChildren(tankPortrait(lastTankSlot,p.equipped||'classic',p.selectedVehicle||'standard'));}
  if(level){$('levelHomeTitle').textContent='Level '+level.level+' · '+level.rank;$('levelHomeFill').style.width=xpPercent(level)+'%';$('levelHomeNote').textContent=(level.need-level.into)+' XP to Level '+(level.level+1);$('levelHome').setAttribute('aria-label','Level '+level.level+', '+level.rank+'. '+(level.need-level.into)+' experience to the next level. Open badges.');}
}
// One progress tile on the home screen: a short label, the number that matters and a bar.
function homeTile(id,label,value,tail,ratio,done,description){
  const tile=$(id),part=(tag,name,text)=>{const e=document.createElement(tag);e.className=name;e.textContent=text;return e;},bar=part('i','tile-bar',''),fill=document.createElement('i');
  fill.style.width=Math.round(100*Math.max(0,Math.min(1,ratio||0)))+'%';bar.append(fill);bar.setAttribute('aria-hidden','true');
  tile.replaceChildren(part('span','tile-label',label),part('span','tile-join',' · '),part('b','tile-value',value),part('span','tile-join',tail),bar);tile.classList.toggle('tile-done',Boolean(done));tile.setAttribute('aria-label',description+' Open details.');
}
const xpPercent=level=>Math.max(0,Math.min(100,Math.round(100*level.into/level.need)));
function renderDaily(){
  const p=playerProgress;$('dailyDays').replaceChildren();if(!p)return;
  for(let i=1;i<=7;i++){
    const card=document.createElement('div');card.className='daily-day'+(i<=p.daily.step?' completed':'')+(i===p.daily.nextDay&&!p.daily.qualified?' current':'');
    const title=document.createElement('strong'),reward=document.createElement('span'),mark=document.createElement('small');title.textContent='Day '+i;reward.textContent='+'+FIELD.economy.daily[i-1];mark.textContent=i===7?'Permanent skin':i<=p.daily.step?'Complete ✓':'Coins';card.append(title,reward,mark);$('dailyDays').append(card);
  }
  const reset=new Date(p.daily.resetAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  $('dailyNote').textContent=(p.enabled===false?'Daily rewards are temporarily paused by the host.':p.daily.qualified?'Today’s reward earned.':'Complete one standard match to earn today’s reward.')+' Resets at '+reset+' your time (midnight Malaysia). '+(p.daily.graceAvailable?'One missed day is protected this cycle.':'Missed-day protection used this cycle.');
  $('dailyCollection').textContent='Day 7: a random unowned normal skin, yours permanently. All six normal skins owned? +'+FIELD.economy.collectionBonus+' bonus coins. Showcase skins are purchased separately. All skins are cosmetic.';
}
function renderWeekly(){
  const p=playerProgress;$('weeklyChallenges').replaceChildren();if(!p?.weekly)return;
  $('weeklyBudget').textContent='Play your way · +'+p.weekly.challenges.reduce((n,c)=>n+c.coins,0)+' coins';
  for(const challenge of p.weekly.challenges){
    const card=document.createElement('div'),heading=document.createElement('div'),title=document.createElement('strong'),coins=document.createElement('span'),detail=document.createElement('p'),bar=document.createElement('progress'),state=document.createElement('small');
    card.className='weekly-challenge'+(challenge.completed?' completed':'');heading.className='weekly-challenge-heading';title.textContent=challenge.name;coins.textContent='+'+challenge.coins+' coins';heading.append(title,coins);detail.textContent=challenge.description;
    bar.max=challenge.target;bar.value=challenge.progress;bar.setAttribute('aria-label',challenge.description+' '+challenge.progress+' of '+challenge.target);state.textContent=challenge.completed?'Reward added automatically ✓':challenge.progress+' / '+challenge.target;
    card.append(heading,detail,bar,state);$('weeklyChallenges').append(card);
  }
  const reset=new Date(p.weekly.resetAt).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  $('weeklyNote').textContent=(p.enabled===false?'Weekly earning is paused by the host.':'Finish standard matches to save progress, including solo vs AI. Rewards are automatic; no claiming needed.')+' Resets Monday 00:00 Malaysia ('+reset+' your time).';
}
// Today's three missions: the same for everyone, experience only, reset at midnight Malaysia.
function renderMissions(){
  const p=playerProgress;$('missionList').replaceChildren();if(!p?.missions)return;
  const done=p.missions.missions.filter(m=>m.completed).length;
  $('missionsBudget').textContent=p.missions.sweep.completed?'All three done ✓':'+'+p.missions.missions[0]?.xp+' XP each · +'+p.missions.sweep.xp+' XP for all three';
  for(const mission of p.missions.missions){
    const card=document.createElement('div'),heading=document.createElement('div'),title=document.createElement('strong'),xp=document.createElement('span'),detail=document.createElement('p'),bar=document.createElement('progress'),state=document.createElement('small');
    card.className='mission-card'+(mission.completed?' completed':'');card.setAttribute('data-mission',mission.id);heading.className='weekly-challenge-heading';title.textContent=mission.name;xp.textContent='+'+mission.xp+' XP';heading.append(title,xp);detail.textContent=mission.description;
    bar.max=mission.target;bar.value=mission.progress;bar.setAttribute('aria-label',mission.description+' '+mission.progress+' of '+mission.target);state.textContent=mission.completed?'Done ✓':mission.progress+' / '+mission.target;
    card.append(heading,detail,bar,state);$('missionList').append(card);
  }
  const reset=new Date(p.missions.resetAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  $('missionsNote').textContent=(p.enabled===false?'Missions are paused by the host. ':'')+done+' of '+p.missions.missions.length+' done today. Everyone gets the same three. Progress counts in standard matches you finish, including solo vs AI. New missions at '+reset+' your time (midnight Malaysia).';
}
// Head-to-head records against the people you have played most.
function rivalScore(r){return r.wins+' – '+r.losses;}
function renderRivals(){
  const rivals=playerProgress?.rivals||[];$('rivalList').replaceChildren();
  if(!rivals.length){const empty=document.createElement('p');empty.className='rival-empty';empty.textContent='Play a match with a friend and your record against them appears here: wins, losses and who destroyed whom.';$('rivalList').append(empty);return;}
  for(const r of rivals){
    const item=document.createElement('div'),name=document.createElement('strong'),score=document.createElement('span'),detail=document.createElement('small');
    item.className='rival-item'+(r.wins>r.losses?' ahead':r.wins<r.losses?' behind':'');name.textContent=r.name;score.textContent='You '+rivalScore(r);
    detail.textContent=r.matches+(r.matches===1?' match':' matches')+' together · You destroyed them '+r.kills+(r.kills===1?' time':' times')+' · They destroyed you '+r.deaths+(r.deaths===1?' time':' times')+(r.allied?' · '+r.allied+' as team mates':'');
    item.append(name,score,detail);$('rivalList').append(item);
  }
}
function renderGarage(){
  const p=playerProgress,skin=FIELD.skins.find(s=>s.id===garageSelected)||FIELD.skins[0];
  $('garageBalance').textContent=p?p.coins.toLocaleString()+' coins':'Loading…';$('garageSkinName').textContent=skin.name;$('garageSkinDescription').textContent=skin.description;
  $('garageSkinCollection').textContent=(FIELD.skinCollections.find(c=>c.id===skin.collection)?.name||'Originals')+' · Cosmetic · Same battle stats';
  TankSkins.draw($('garagePreview'),skin.id,lastTankSlot,560,p?.selectedVehicle);$('garagePreview').setAttribute('aria-label',skin.name+' tank preview');
  $('garageChoices').replaceChildren();
  for(const collection of FIELD.skinCollections){
    const options=FIELD.skins.filter(s=>s.collection===collection.id),section=document.createElement('section'),heading=document.createElement('div'),title=document.createElement('h4'),count=document.createElement('span'),note=document.createElement('p'),choices=document.createElement('div');
    section.className='skin-collection';section.setAttribute('data-collection',collection.id);heading.className='skin-collection-heading';title.textContent=collection.name;count.textContent=options.filter(s=>p?.owned.includes(s.id)).length+' / '+options.length+' owned';note.textContent=collection.description;choices.className='garage-choices';heading.append(title,count);section.append(heading,note,choices);
    for(const option of options){
    const button=document.createElement('button');button.type='button';button.className='skin-choice';button.setAttribute('aria-pressed',String(option.id===skin.id));button.setAttribute('data-skin',option.id);
    const name=document.createElement('strong'),state=document.createElement('small');name.textContent=option.name;state.textContent=p?.equipped===option.id?'Equipped':p?.owned.includes(option.id)?'Owned':option.price+' coins';button.append(TankSkins.portrait(lastTankSlot,option.id,p?.selectedVehicle),name,state);
    button.addEventListener('click',()=>{garageSelected=option.id;$('garageMessage').textContent='';renderGarage();if(innerWidth<=640||innerHeight<700)$('garageShowcase').scrollIntoView?.({block:'start'});else $('garageAction').scrollIntoView?.({block:'nearest'});});choices.append(button);
    }
    $('garageChoices').append(section);
  }
  const owned=p?.owned.includes(skin.id),equipped=p?.equipped===skin.id,need=skin.price-(p?.coins||0);
  $('garageAction').disabled=garageBusy||!p||equipped||!owned&&(need>0||p.enabled===false);
  $('garageAction').textContent=garageBusy?'Saving…':equipped?'Equipped ✓':owned?'Equip':p?.enabled===false?'Purchases paused':need>0?'Need '+need+' more coins':'Buy · '+skin.price+' coins';
  renderVehicles();renderMissions();renderDaily();renderWeekly();renderRivals();
  $('garageStats').textContent=p?p.stats.matches+' completed matches · '+p.stats.wins+' wins · Best: '+p.stats.bestKills+' kills · Longest streak: '+p.daily.longest+' days':'';
  const level=p?.level;$('garageLevel').hidden=!level;
  if(level){$('garageLevelTitle').textContent='Level '+level.level+' · '+level.rank;$('garageLevelNote').textContent=level.into+' / '+level.need+' XP'+(level.nextRank?' · '+level.nextRank.name+' at Level '+level.nextRank.level:'');$('garageLevelFill').style.width=xpPercent(level)+'%';$('garageLevelBar').setAttribute('aria-valuenow',String(xpPercent(level)));$('garageLevelBar').setAttribute('aria-label','Progress to Level '+(level.level+1));}
  renderAchievements();
}
function renderVehicles(){
  const p=playerProgress,locked=joined&&!['results','postgame'].includes(latest?.phase);
  $('vehicleChoices').replaceChildren();
  $('vehicleNote').textContent=locked?'Change vehicle after this match.':(joined?'Next match · ':'')+'All vehicles are free. Ordinary matches use Standard; your choice applies in private Vehicle tests.';
  $('createVehicleTest').hidden=!p?.vehicleClassesEnabled||joined||connecting;
  for(const v of FIELD.vehicles){
    const button=document.createElement('button'),name=document.createElement('strong'),stats=document.createElement('small'),description=document.createElement('span');
    button.type='button';button.className='vehicle-choice';button.setAttribute('data-vehicle',v.id);button.setAttribute('aria-pressed',String((p?.selectedVehicle||'standard')===v.id));button.disabled=!p||garageBusy||locked;
    name.textContent=v.name;stats.textContent=v.health+' HP · '+(v.id==='scout'?'+20% speed':v.id==='heavy'?'−15% speed':'Normal speed')+' · '+v.reload+'s reload';description.textContent=v.description;
    button.append(TankSkins.portrait(lastTankSlot,p?.equipped||'classic',v.id),name,stats,description);
    button.addEventListener('click',async()=>{
      if(garageBusy)return;garageBusy=true;renderGarage();
      try{await playerAction('vehicle',{vehicle:v.id});$('garageMessage').textContent=v.name+' saved'+(joined?' · Next match.':'.');}
      catch(error){$('garageMessage').textContent=error.message;}finally{garageBusy=false;renderGarage();}
    });$('vehicleChoices').append(button);
  }
}
$('createVehicleTest').addEventListener('click',()=>{if(joined||connecting)return;closeGarage();vehicleTestRequested=true;joinRoomNow(newRoomCode(),'create');});
function renderAchievements(){
  $('achievementList').replaceChildren();
  for(const badge of FIELD.achievements){
    const earned=Boolean(playerProgress?.achievements?.[badge.id]),item=document.createElement('div'),copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
    item.className='achievement-item'+(earned?'':' locked');name.textContent=badge.name+(earned?' · Earned ✓':'');detail.textContent=badge.description;copy.append(name,detail);
    if(document.createElementNS){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),use=document.createElementNS(ns,'use');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#ui-trophy');svg.append(use);item.append(svg);}
    if(!earned&&badge.stat&&badge.target>1&&playerProgress){const value=Math.min(badge.target,FIELD.statValue(playerProgress.stats,badge.stat,playerProgress.level?.level)),bar=document.createElement('progress');bar.max=badge.target;bar.value=value;bar.setAttribute('aria-label',badge.name+' '+value+' of '+badge.target);detail.textContent=badge.description+' · '+value+' / '+badge.target;copy.append(bar);}
    item.append(copy);$('achievementList').append(item);
  }
}
async function openGarage(){
  release();garageOpen=true;$('garageDialog').hidden=false;$('garageMessage').textContent=playerProgress?.pending?.skin?'Your Day 7 skin is permanently unlocked. Select Equip to use it.':'';garageSelected=playerProgress?.pending?.skin||playerProgress?.equipped||'classic';renderGarage();$('closeGarage').focus?.({preventScroll:true});
  try{await loadPlayerProgress();}catch(error){$('garageMessage').textContent=error.message;}
}
function closeGarage(){garageOpen=false;$('garageDialog').hidden=true;(joined&&['results','postgame'].includes(latest?.phase)?$('changeTank'):joined?$('game'):$('garageButton')).focus?.({preventScroll:true});}
$('changeTank').addEventListener('click',openGarage);
$('garageButton').addEventListener('click',openGarage);$('dailyHome').addEventListener('click',async()=>{await openGarage();if(garageOpen)$('dailyTitle').scrollIntoView({block:'start'});});$('closeGarage').addEventListener('click',closeGarage);
$('missionsHome').addEventListener('click',async()=>{await openGarage();if(garageOpen)$('missionsTitle').scrollIntoView({block:'start'});});
$('weeklyHome').addEventListener('click',async()=>{await openGarage();if(garageOpen)$('weeklyTitle').scrollIntoView({block:'start'});});
$('garageDialog').addEventListener('click',e=>{if(e.target===$('garageDialog'))closeGarage();});
$('garageDialog').addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();closeGarage();}else trapModalFocus(e,$('garageDialog'));});
$('garageAction').addEventListener('click',async()=>{
  if(garageBusy||!playerProgress)return;
  const skin=garageSelected,owned=playerProgress.owned.includes(skin);garageBusy=true;renderGarage();
  try{await playerAction(owned?'equip':'buy',{skin});$('garageMessage').textContent=owned?'Skin equipped. Ready to roll!':'Skin unlocked permanently. Select Equip to use it.';}
  catch(error){$('garageMessage').textContent=error.message;}finally{garageBusy=false;renderGarage();}
});
function showMatchRewards(result){
  const visible=!spectating&&result&&latest?.winner&&(!latest.roundId||latest.roundId===result.roundId);$('matchRewards').hidden=!visible;
  if(!visible)return;
  const signature=JSON.stringify([result.roundId,result.rewardError,result.reward,playerProgress?.equipped,localStorageSafe('tank-frenzy-recovery-saved')]);if(signature===rewardSignature)return;rewardSignature=signature;
  if(result.rewardError){$('rewardTotal').textContent='Saving rewards…';$('rewardBreakdown').textContent='Your result is saved. Coin rewards will retry automatically.';return;}
  const r=result.reward;if(!r){$('matchRewards').hidden=true;return;}
  $('matchHighlights').replaceChildren();
  for(const highlight of r.highlights||[]){const item=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');item.className='match-highlight';title.textContent=highlight.title;detail.textContent=highlight.detail;item.append(title,detail);$('matchHighlights').append(item);}
  $('matchHighlights').hidden=!(r.highlights?.length);
  $('rewardTotal').textContent='+'+r.total+' coins';$('rewardTotal').setAttribute('aria-label','+'+r.total+' coins');
  $('rewardBreakdown').textContent=r.reason||['Completed +'+r.completion,r.victory?'Victory +'+r.victory:'',r.kills?'Kills +'+r.kills:'',r.daily?'Day '+r.daily.day+' +'+r.daily.coins:'',r.daily?.collectionBonus?'Full collection +'+r.daily.collectionBonus:''].filter(Boolean).join(' · ');
  $('rewardWeekly').hidden=!r.weekly?.length;$('rewardWeekly').textContent=(r.weekly||[]).map(c=>'Weekly: '+c.name+' +'+c.coins).join(' · ');
  showExperience(r);
  const medals=FIELD.medals.filter(m=>r.medals?.[m.id]);$('rewardMedals').hidden=!medals.length;$('rewardMedals').setAttribute('aria-label','Medals: '+medalSummary(r.medals));
  $('rewardMedals').replaceChildren(...medals.map((m,i)=>{const chip=document.createElement('span'),count=r.medals[m.id];chip.className='medal-chip medal-'+m.id;chip.style.setProperty('--i',String(i));chip.title=m.description;chip.append(medalIcon(),m.name+(count>1?' ×'+count:''));return chip;}));
  const missionLine=[...(r.missions||[]).map(m=>'Mission: '+m.name+' +'+m.xp+' XP'),r.missionSweep?'All three missions +'+r.missionSweep+' XP':''].filter(Boolean).join(' · ');$('rewardMissions').hidden=!missionLine;$('rewardMissions').textContent=missionLine;
  $('rewardRivals').replaceChildren(...(r.rivals||[]).slice(0,3).map(rival=>{const line=document.createElement('p');line.textContent=!rival.wins&&!rival.losses&&rival.allied?'With '+rival.name+' · '+rival.allied+(rival.allied===1?' match':' matches')+' as team mates':'vs '+rival.name+' · '+(rival.wins===rival.losses?'Level at '+rivalScore(rival):rival.wins>rival.losses?'You lead '+rivalScore(rival):'You trail '+rivalScore(rival));return line;}));$('rewardRivals').hidden=!(r.rivals||[]).length;
  const next=nextGoals();$('rewardNext').hidden=!next;$('rewardNext').textContent=next?'Next · '+next:'';
  $('shareResult').hidden=!r.xp;$('shareResult').textContent='Share result';
  const skin=FIELD.skins.find(s=>s.id===r.skin);$('rewardSkin').hidden=!skin;$('equipRewardSkin').hidden=!skin;
  if(skin){$('rewardSkin').replaceChildren(TankSkins.portrait(lastTankSlot,skin.id));const text=document.createElement('span');text.textContent='Day 7 unlocked · '+skin.name+' · Yours forever';$('rewardSkin').append(text);$('equipRewardSkin').textContent=playerProgress?.equipped===skin.id?'Equipped ✓':'Equip '+skin.name;$('equipRewardSkin').disabled=playerProgress?.equipped===skin.id;}
  $('rewardProtect').hidden=!playerProgress?.stats.matches||Boolean(localStorageSafe('tank-frenzy-recovery-saved')); 
  playRewardReveal();
}
function medalIcon(){
  const holder=document.createElement('i');holder.className='medal-icon';holder.setAttribute('aria-hidden','true');
  if(document.createElementNS){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),use=document.createElementNS(ns,'use');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','100%');svg.setAttribute('height','100%');use.setAttribute('href','#ui-medal');svg.append(use);holder.append(svg);}
  return holder;
}
// When the results come into view: coins count up, then the experience bar fills. Once per round.
let revealKey='';
function playRewardReveal(){
  const result=lastResult,r=result?.reward;if(!r||$('matchRewards').hidden||$('results').hidden||revealKey===result.roundId)return;revealKey=result.roundId;
  if(reducedMotion||typeof requestAnimationFrame!=='function'){showExperience(r);return;}
  const started=performance.now(),key=revealKey,count=()=>{if(revealKey!==key||lastResult!==result)return;const k=Math.min(1,(performance.now()-started)/750);$('rewardTotal').textContent='+'+Math.round(r.total*(1-(1-k)**3))+' coins';if(k<1)requestAnimationFrame(count);};
  if(r.total>0)count();
  clearTimeout(xpTimer);xpTimer=setTimeout(()=>showExperience(r,true),420);
}
const medalSummary=medals=>FIELD.medals.filter(m=>medals?.[m.id]).map(m=>m.name+(medals[m.id]>1?' ×'+medals[m.id]:'')).join(' · ');
let xpTimer=null;
// Fill the bar from where the player stood to where they stand now; a new level refills from empty.
function showExperience(r,animate=false){
  const xp=r.xp;$('rewardXp').hidden=!xp;if(!animate)clearTimeout(xpTimer);if(!xp)return;
  const fill=$('rewardXpFill'),set=level=>{fill.style.width=xpPercent(level)+'%';$('rewardXpBar').setAttribute('aria-valuenow',String(xpPercent(level)));};
  $('rewardXp').classList.toggle('level-up',xp.levelUp);
  $('rewardXpTitle').textContent=(xp.levelUp?'LEVEL UP! ':'')+'Level '+xp.after.level+' · '+xp.after.rank;$('rewardXpGain').textContent='+'+xp.total+' XP';
  const note=[xp.promotion?'Promoted to '+xp.promotion+'!':'',r.winStreak>=2?r.winStreak+' wins in a row · +'+xp.streak+' XP':''].filter(Boolean).join(' ');$('rewardXpNote').textContent=note;$('rewardXpNote').hidden=!note;
  $('rewardXpBar').setAttribute('aria-label','Experience towards Level '+(xp.after.level+1));
  // Until the results are revealed the bar waits where the player stood before the match.
  if(!animate){set(reducedMotion||typeof requestAnimationFrame!=='function'||revealKey===lastResult?.roundId?xp.after:xp.before);return;}
  if(!xp.levelUp){set(xp.after);return;}
  fill.style.width='100%';xpTimer=setTimeout(()=>{fill.style.transition='none';fill.style.width='0%';void fill.offsetWidth;fill.style.transition='';set(xp.after);},750);
}
// One short line of what is closest: the next level and the nearest unfinished weekly goal.
function nextGoals(){
  const p=playerProgress;if(!p?.level)return'';
  const goals=[(p.level.need-p.level.into)+' XP to Level '+(p.level.level+1)];
  const mission=(p.missions?.missions||[]).filter(m=>!m.completed).sort((a,b)=>(a.target-a.progress)/a.target-(b.target-b.progress)/b.target)[0];
  if(mission&&p.enabled!==false)goals.push('Mission: '+mission.name+' '+mission.progress+'/'+mission.target);
  const weekly=(p.weekly?.challenges||[]).filter(c=>!c.completed).sort((a,b)=>(a.target-a.progress)/a.target-(b.target-b.progress)/b.target)[0];
  if(weekly&&p.enabled!==false)goals.push(weekly.name+' '+weekly.progress+'/'+weekly.target+' (+'+weekly.coins+' coins)');
  return goals.join(' · ');
}
function resultShareText(){
  const me=latest?.players.find(p=>p.id===myId),r=lastResult?.reward;if(!me||!latest?.winner)return'';
  const won=latest.settings?.mode==='teams'?me.team===latest.winner.team:me.id===latest.winner.id,medals=medalSummary(r?.medals);
  return (won?'🏆 Victory':'💥 Good battle')+' in Tank Frenzy! '+me.kills+(me.kills===1?' kill':' kills')+' · '+me.deaths+(me.deaths===1?' death':' deaths')+(me.shots?' · 🎯 '+Math.round(100*Math.min(me.hits,me.shots)/me.shots)+'%':'')+(medals?' · 🏅 '+medals:'')+(playerProgress?.level?' · Level '+playerProgress.level.level+' '+playerProgress.level.rank:'')+'\nCan you beat me?';
}
// A square picture of the result for chats and stories: outcome, the player's own tank, score, medals and level.
function drawResultCard(){
  const me=latest?.players.find(p=>p.id===myId),r=lastResult?.reward;if(!me||!latest?.winner||typeof document.createElement('canvas').getContext!=='function')return null;
  const canvas=document.createElement('canvas'),c=canvas.getContext('2d'),S=1080,font=(size,weight=900)=>weight+' '+size+'px ui-rounded,"Trebuchet MS",sans-serif';if(!c)return null;canvas.width=canvas.height=S;
  const won=latest.settings?.mode==='teams'?me.team===latest.winner.team:me.id===latest.winner.id,level=playerProgress?.level;
  const text=(value,x,y,size,color,{align='center',weight=900,max=S-120}={})=>{c.font=font(size,weight);c.textAlign=align;c.fillStyle=color;c.fillText(value,x,y,max);};
  const box=(x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=4;c.stroke();}};
  const sky=c.createLinearGradient(0,0,0,S);sky.addColorStop(0,'#3c7a5a');sky.addColorStop(1,'#163a31');c.fillStyle=sky;c.fillRect(0,0,S,S);
  c.fillStyle='#ffffff0a';for(let x=0;x<S;x+=180)for(let y=0;y<S;y+=180)if((x+y)%360===0)c.fillRect(x,y,180,180);
  box(30,30,S-60,S-60,54,null,'#c7d99455');
  c.font=font(64);c.textAlign='center';const tank=c.measureText('TANK ').width,frenzy=c.measureText('FRENZY').width,left=S/2-(tank+frenzy)/2;
  text('TANK ',left,128,64,'#fff8df',{align:'left'});text('FRENZY',left+tank,128,64,'#ffb347',{align:'left'});
  text(won?'VICTORY!':'GOOD BATTLE!',S/2,250,won?108:88,won?'#ffd45e':'#fff8df');
  // The player's tank in its own skin.
  if(typeof TankSkins!=='undefined'){const art=document.createElement('canvas');TankSkins.draw(art,me.skin||'classic',me.slot,900,me.vehicle||'standard');c.drawImage(art,S/2-426,165);}
  text(me.name+(level?'  ·  Level '+level.level+' '+level.rank:''),S/2,702,46,'#fff8df');
  const stats=[[String(me.kills),me.kills===1?'KILL':'KILLS'],[String(me.deaths),me.deaths===1?'DEATH':'DEATHS'],[me.shots?Math.round(100*Math.min(me.hits,me.shots)/me.shots)+'%':'—','HIT RATE']];
  stats.forEach(([value,label],i)=>{const x=96+i*306;box(x,738,276,150,30,'#102f2d99','#a9c79a55');text(value,x+138,820,76,'#ffd45e',{max:250});text(label,x+138,866,26,'#c4d9bf',{max:250});});
  const medals=FIELD.medals.filter(m=>r?.medals?.[m.id]).slice(0,4).map(m=>m.name+(r.medals[m.id]>1?' ×'+r.medals[m.id]:''));
  if(medals.length)text('★ '+medals.join('  ·  '),S/2,944,34,'#ffe9a8');
  let host='';try{host=new URL(networkBase).host;}catch{}
  text('Can you beat me?'+(host?'  '+host:''),S/2,medals.length?1004:980,medals.length?32:38,'#b6d7b5',{weight:700});
  return canvas;
}
async function resultCardFile(){
  let canvas=null;try{canvas=drawResultCard();}catch{}
  if(!canvas||typeof canvas.toBlob!=='function'||typeof File!=='function')return null;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return blob?new File([blob],'tank-frenzy-result.png',{type:'image/png'}):null;
}
// Share the picture where the device can; otherwise the text, and on a computer save the picture and copy the text.
$('shareResult').addEventListener('click',async()=>{
  const text=resultShareText(),url=networkBase+'/';if(!text)return;
  try{
    const file=await resultCardFile().catch(()=>null);
    if(file&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Tank Frenzy',text:text+' '+url});return;}
    if(navigator.share){await navigator.share({title:'Tank Frenzy',text,url});return;}
    await navigator.clipboard.writeText(text+' '+url);
    let saved=false;if(file&&typeof URL.createObjectURL==='function'){const link=document.createElement('a'),href=URL.createObjectURL(file);link.href=href;link.download=file.name;link.click?.();saved=Boolean(link.click);setTimeout(()=>URL.revokeObjectURL(href),10000);}
    $('shareResult').textContent=saved?'Copied · Picture saved too ✓':'Copied · Paste it anywhere ✓';
  }catch(error){if(error?.name!=='AbortError')$('shareResult').textContent='Sharing is unavailable here';}
});
$('levelHome').addEventListener('click',async()=>{await openGarage();if(garageOpen)$('garageLevel').scrollIntoView?.({block:'center'});});
function localStorageSafe(key){try{return localStorage.getItem(key);}catch{return null;}}
$('equipRewardSkin').addEventListener('click',async()=>{const skin=lastResult?.reward?.skin;if(!skin)return;try{await playerAction('equip',{skin});showMatchRewards(lastResult);}catch(error){$('rewardBreakdown').textContent=error.message;}});
$('rewardProtect').addEventListener('click',()=>{$('profileButton').click();});
$('showRecovery').addEventListener('click',async()=>{
  $('recoveryMessage').textContent='';try{if(!profileSecret||!playerProgress)await loadPlayerProgress();$('recoveryCode').value='TF-'+profileSecret.match(/.{1,8}/g).join('-');$('recoveryPanel').hidden=false;$('recoveryCode').focus();$('recoveryCode').select();}catch(error){$('recoveryMessage').textContent=error.message;}
});
$('savedRecovery').addEventListener('click',()=>{try{localStorage.setItem('tank-frenzy-recovery-saved','yes');}catch{}$('recoveryMessage').textContent='Keep your code somewhere private. It restores your coins, skins and scores on this server.';});
$('restorePlayer').addEventListener('click',async()=>{
  if(joined||connecting){$('recoveryMessage').textContent='Leave the arena before restoring a player.';return;}
  const button=$('restorePlayer');button.disabled=true;$('recoveryMessage').textContent='';
  try{await playerAction('recover',{code:$('restoreCode').value});$('restoreCode').value='';$('recoveryPanel').hidden=true;$('recoveryCode').value='';$('recoveryMessage').textContent='Player restored. Your coins, skins and scores are ready.';}
  catch(error){$('recoveryMessage').textContent=error.message;}finally{button.disabled=false;}
});
if(!watchRoom)loadPlayerProgress().catch(()=>{});

