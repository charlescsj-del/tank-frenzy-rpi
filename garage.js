'use strict';
let playerProgress=null,progressLoading=null,garageOpen=false,garageSelected='classic',garageBusy=false,progressSerial=Promise.resolve(),rewardSignature='',weeklyTimer=null;
// These dialogs must remain available inside the fullscreen arena after a match.
$('arena').append($('garageDialog'),$('profileDialog'));
function savePlayerProfile(profile){profileSecret=profile.secret;profileId=profile.id;try{localStorage.setItem('tank-frenzy-profile',JSON.stringify(profile));}catch{}}
function receiveProgress(value){if(!value)return;playerProgress=value;renderProgressHome();if(garageOpen)renderGarage();clearTimeout(weeklyTimer);if(value.weekly)weeklyTimer=setTimeout(()=>loadPlayerProgress().catch(()=>{}),Math.max(1000,value.weekly.resetAt-Date.now()+100));}
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
  const daily=p.daily;$('dailyHome').textContent=p.enabled===false?'Daily rewards paused':daily.qualified?'Day '+daily.step+' complete · Tomorrow: Day '+daily.nextDay:'Daily reward · Day '+daily.nextDay;
  const weekly=p.weekly?.challenges||[];$('weeklyHome').textContent=p.enabled===false?'Weekly challenges paused':'Weekly challenges · '+weekly.filter(c=>c.completed).length+'/'+weekly.length+' complete →';
  $('progressHomeNote').textContent=p.persistent?'Play matches. Earn coins. Make it yours.':'Progress lasts for this server session. Ask the host to enable permanent storage.';
  $('progressHome').hidden=spectating;
  const level=p.level;$('levelHome').hidden=!level;
  if(level){$('levelHomeTitle').textContent='Level '+level.level+' · '+level.rank;$('levelHomeFill').style.width=xpPercent(level)+'%';$('levelHomeNote').textContent=(level.need-level.into)+' XP to Level '+(level.level+1);$('levelHome').setAttribute('aria-label','Level '+level.level+', '+level.rank+'. '+(level.need-level.into)+' experience to the next level. Open badges.');}
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
  renderVehicles();renderDaily();renderWeekly();
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
  $('rewardTotal').textContent='+'+r.total+' coins';
  $('rewardBreakdown').textContent=r.reason||['Completed +'+r.completion,r.victory?'Victory +'+r.victory:'',r.kills?'Kills +'+r.kills:'',r.daily?'Day '+r.daily.day+' +'+r.daily.coins:'',r.daily?.collectionBonus?'Full collection +'+r.daily.collectionBonus:''].filter(Boolean).join(' · ');
  $('rewardWeekly').hidden=!r.weekly?.length;$('rewardWeekly').textContent=(r.weekly||[]).map(c=>'Weekly: '+c.name+' +'+c.coins).join(' · ');
  showExperience(r);
  const medals=medalSummary(r.medals);$('rewardMedals').hidden=!medals;$('rewardMedals').textContent=medals?'Medals · '+medals:'';
  const next=nextGoals();$('rewardNext').hidden=!next;$('rewardNext').textContent=next?'Next · '+next:'';
  $('shareResult').hidden=!r.xp;$('shareResult').textContent='Share result';
  const skin=FIELD.skins.find(s=>s.id===r.skin);$('rewardSkin').hidden=!skin;$('equipRewardSkin').hidden=!skin;
  if(skin){$('rewardSkin').replaceChildren(TankSkins.portrait(lastTankSlot,skin.id));const text=document.createElement('span');text.textContent='Day 7 unlocked · '+skin.name+' · Yours forever';$('rewardSkin').append(text);$('equipRewardSkin').textContent=playerProgress?.equipped===skin.id?'Equipped ✓':'Equip '+skin.name;$('equipRewardSkin').disabled=playerProgress?.equipped===skin.id;}
  $('rewardProtect').hidden=!playerProgress?.stats.matches||Boolean(localStorageSafe('tank-frenzy-recovery-saved')); 
}
const medalSummary=medals=>FIELD.medals.filter(m=>medals?.[m.id]).map(m=>m.name+(medals[m.id]>1?' ×'+medals[m.id]:'')).join(' · ');
let xpTimer=null;
// Fill the bar from where the player stood to where they stand now; a new level refills from empty.
function showExperience(r){
  const xp=r.xp;$('rewardXp').hidden=!xp;clearTimeout(xpTimer);if(!xp)return;
  const fill=$('rewardXpFill'),set=level=>{fill.style.width=xpPercent(level)+'%';$('rewardXpBar').setAttribute('aria-valuenow',String(xpPercent(level)));};
  $('rewardXp').classList.toggle('level-up',xp.levelUp);
  $('rewardXpTitle').textContent=(xp.levelUp?'LEVEL UP! ':'')+'Level '+xp.after.level+' · '+xp.after.rank;$('rewardXpGain').textContent='+'+xp.total+' XP';
  const note=[xp.promotion?'Promoted to '+xp.promotion+'!':'',r.winStreak>=2?r.winStreak+' wins in a row · +'+xp.streak+' XP':''].filter(Boolean).join(' ');$('rewardXpNote').textContent=note;$('rewardXpNote').hidden=!note;
  $('rewardXpBar').setAttribute('aria-label','Experience towards Level '+(xp.after.level+1));
  if(reducedMotion||typeof requestAnimationFrame!=='function'){set(xp.after);return;}
  set(xp.before);
  requestAnimationFrame(()=>{
    if(!xp.levelUp){set(xp.after);return;}
    fill.style.width='100%';xpTimer=setTimeout(()=>{fill.style.transition='none';fill.style.width='0%';void fill.offsetWidth;fill.style.transition='';set(xp.after);},750);
  });
}
// One short line of what is closest: the next level and the nearest unfinished weekly goal.
function nextGoals(){
  const p=playerProgress;if(!p?.level)return'';
  const goals=[(p.level.need-p.level.into)+' XP to Level '+(p.level.level+1)];
  const weekly=(p.weekly?.challenges||[]).filter(c=>!c.completed).sort((a,b)=>(a.target-a.progress)/a.target-(b.target-b.progress)/b.target)[0];
  if(weekly&&p.enabled!==false)goals.push(weekly.name+' '+weekly.progress+'/'+weekly.target+' (+'+weekly.coins+' coins)');
  return goals.join(' · ');
}
function resultShareText(){
  const me=latest?.players.find(p=>p.id===myId),r=lastResult?.reward;if(!me||!latest?.winner)return'';
  const won=latest.settings?.mode==='teams'?me.team===latest.winner.team:me.id===latest.winner.id,medals=medalSummary(r?.medals);
  return (won?'🏆 Victory':'💥 Good battle')+' in Tank Frenzy! '+me.kills+(me.kills===1?' kill':' kills')+' · '+me.deaths+(me.deaths===1?' death':' deaths')+(me.shots?' · 🎯 '+Math.round(100*Math.min(me.hits,me.shots)/me.shots)+'%':'')+(medals?' · 🏅 '+medals:'')+(playerProgress?.level?' · Level '+playerProgress.level.level+' '+playerProgress.level.rank:'')+'\nCan you beat me?';
}
$('shareResult').addEventListener('click',async()=>{
  const text=resultShareText(),url=networkBase+'/';if(!text)return;
  try{
    if(navigator.share){await navigator.share({title:'Tank Frenzy',text,url});return;}
    await navigator.clipboard.writeText(text+' '+url);$('shareResult').textContent='Copied · Paste it anywhere ✓';
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

