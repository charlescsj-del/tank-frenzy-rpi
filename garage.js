'use strict';
let playerProgress=null,progressLoading=null,garageOpen=false,garageSelected='classic',garageBusy=false,progressSerial=Promise.resolve(),rewardSignature='';
// These dialogs must remain available inside the fullscreen arena after a match.
$('arena').append($('garageDialog'),$('profileDialog'));
function savePlayerProfile(profile){profileSecret=profile.secret;profileId=profile.id;try{localStorage.setItem('tank-frenzy-profile',JSON.stringify(profile));}catch{}}
function receiveProgress(value){if(!value)return;playerProgress=value;renderProgressHome();if(garageOpen)renderGarage();}
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
  $('progressHomeNote').textContent=p.persistent?'Play matches. Earn coins. Make it yours.':'Progress lasts for this server session. Ask the host to enable permanent storage.';
  $('progressHome').hidden=spectating;
}
function renderDaily(){
  const p=playerProgress;$('dailyDays').replaceChildren();if(!p)return;
  for(let i=1;i<=7;i++){
    const card=document.createElement('div');card.className='daily-day'+(i<=p.daily.step?' completed':'')+(i===p.daily.nextDay&&!p.daily.qualified?' current':'');
    const title=document.createElement('strong'),reward=document.createElement('span'),mark=document.createElement('small');title.textContent='Day '+i;reward.textContent='+'+FIELD.economy.daily[i-1];mark.textContent=i===7?'Permanent skin':i<=p.daily.step?'Complete ✓':'Coins';card.append(title,reward,mark);$('dailyDays').append(card);
  }
  const reset=new Date(p.daily.resetAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  $('dailyNote').textContent=(p.enabled===false?'Daily rewards are temporarily paused by the host.':p.daily.qualified?'Today’s reward earned.':'Complete one standard match to earn today’s reward.')+' Resets at '+reset+' your time (midnight Malaysia). '+(p.daily.graceAvailable?'One missed day is protected this cycle.':'Missed-day protection used this cycle.');
  $('dailyCollection').textContent='Day 7: a random unowned normal skin, yours permanently. Full collection? +'+FIELD.economy.collectionBonus+' bonus coins. All skins are cosmetic.';
}
function renderGarage(){
  const p=playerProgress,skin=FIELD.skins.find(s=>s.id===garageSelected)||FIELD.skins[0];
  $('garageBalance').textContent=p?p.coins.toLocaleString()+' coins':'Loading…';$('garageSkinName').textContent=skin.name;$('garageSkinDescription').textContent=skin.description;
  TankSkins.draw($('garagePreview'),skin.id,lastTankSlot);$('garagePreview').setAttribute('aria-label',skin.name+' tank preview');
  $('garageChoices').replaceChildren();
  for(const option of FIELD.skins){
    const button=document.createElement('button');button.type='button';button.className='skin-choice';button.setAttribute('aria-pressed',String(option.id===skin.id));button.setAttribute('data-skin',option.id);
    const name=document.createElement('strong'),state=document.createElement('small');name.textContent=option.name;state.textContent=p?.equipped===option.id?'Equipped':p?.owned.includes(option.id)?'Owned':option.price+' coins';button.append(TankSkins.portrait(lastTankSlot,option.id),name,state);
    button.addEventListener('click',()=>{garageSelected=option.id;$('garageMessage').textContent='';renderGarage();});$('garageChoices').append(button);
  }
  const owned=p?.owned.includes(skin.id),equipped=p?.equipped===skin.id,need=skin.price-(p?.coins||0);
  $('garageAction').disabled=garageBusy||!p||equipped||!owned&&(need>0||p.enabled===false);
  $('garageAction').textContent=garageBusy?'Saving…':equipped?'Equipped ✓':owned?'Equip':p?.enabled===false?'Purchases paused':need>0?'Need '+need+' more coins':'Buy · '+skin.price+' coins';
  renderDaily();
  $('garageStats').textContent=p?p.stats.matches+' completed matches · '+p.stats.wins+' wins · Best: '+p.stats.bestKills+' kills · Longest streak: '+p.daily.longest+' days':'';
  renderAchievements();
}
function renderAchievements(){
  $('achievementList').replaceChildren();
  for(const badge of FIELD.achievements){
    const earned=Boolean(playerProgress?.achievements?.[badge.id]),item=document.createElement('div'),copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
    item.className='achievement-item'+(earned?'':' locked');name.textContent=badge.name+(earned?' · Earned ✓':'');detail.textContent=badge.description;copy.append(name,detail);
    if(document.createElementNS){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),use=document.createElementNS(ns,'use');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#ui-trophy');svg.append(use);item.append(svg);}
    item.append(copy);$('achievementList').append(item);
  }
}
async function openGarage(){
  release();garageOpen=true;$('garageDialog').hidden=false;$('garageMessage').textContent=playerProgress?.pending?.skin?'Your Day 7 skin is permanently unlocked. Select Equip to use it.':'';garageSelected=playerProgress?.pending?.skin||playerProgress?.equipped||'classic';renderGarage();$('closeGarage').focus?.({preventScroll:true});
  try{await loadPlayerProgress();}catch(error){$('garageMessage').textContent=error.message;}
}
function closeGarage(){garageOpen=false;$('garageDialog').hidden=true;$('garageButton').focus?.({preventScroll:true});}
$('garageButton').addEventListener('click',openGarage);$('dailyHome').addEventListener('click',async()=>{await openGarage();if(garageOpen)$('dailyTitle').scrollIntoView({block:'start'});});$('closeGarage').addEventListener('click',closeGarage);
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
  const skin=FIELD.skins.find(s=>s.id===r.skin);$('rewardSkin').hidden=!skin;$('equipRewardSkin').hidden=!skin;
  if(skin){$('rewardSkin').replaceChildren(TankSkins.portrait(lastTankSlot,skin.id));const text=document.createElement('span');text.textContent='Day 7 unlocked · '+skin.name+' · Yours forever';$('rewardSkin').append(text);$('equipRewardSkin').textContent=playerProgress?.equipped===skin.id?'Equipped ✓':'Equip '+skin.name;$('equipRewardSkin').disabled=playerProgress?.equipped===skin.id;}
  $('rewardProtect').hidden=!playerProgress?.stats.matches||Boolean(localStorageSafe('tank-frenzy-recovery-saved')); 
}
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
