'use strict';
// Guest profiles use a hash of a secret kept only on the player's device. Legacy
// name records stay separate; typing a name can never claim someone else's stats.
const fs=require('node:fs');
const {randomBytes,createHash}=require('node:crypto');
const nameLimit=200,historyDays=62,matchLimit=20000,day=864e5;
const blank=name=>({name,wins:0,matches:0,kills:0,deaths:0,damageDealt:0,country:'',lastPlayed:0});
const keyOf=p=>p.profileId||p.name.toLowerCase();
function positionIn(rows,profileId){const i=rows.findIndex(p=>p.profileId===profileId);return i<0?null:{...rows[i],rank:i+1};}

// All boards reset together in Malaysia time, including standalone installs.
function periodStart(period,now=Date.now()){
  const offset=8*3600e3,d=new Date(now+offset);d.setUTCHours(0,0,0,0);
  if(period==='day')return d.getTime()-offset;
  if(period==='week'){d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.getTime()-offset;}
  if(period==='month'){d.setUTCDate(1);return d.getTime()-offset;}
  return 0;
}

class Leaderboard {
  constructor(file=null,now=Date.now){
    this.file=file;this.now=now;this.entries=new Map();this.matches=[];this.saveTimer=null;this.recorded=new WeakMap();
    if(!file||!fs.existsSync(file))return;
    try{
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!data.schema){const backup=file+'.legacy-v1.json';if(!fs.existsSync(backup)){try{fs.copyFileSync(file,backup);}catch(error){this.legacyBackupPending=true;console.error('Tank Frenzy: legacy backup pending; keeping the original file:',error.message);}}}
      for(const entry of data.players||[])if(typeof entry?.name==='string'&&entry.name.trim())this.entries.set(keyOf(entry),{...blank(entry.name.trim()),...entry,damageDealt:Number.isFinite(entry.damageDealt)?entry.damageDealt:0});
      this.matches=Array.isArray(data.matches)?data.matches.filter(m=>Number.isFinite(m?.t)&&Array.isArray(m.players)):[];
    }catch(error){console.error('Tank Frenzy: ignoring unreadable leaderboard:',error.message);}
  }
  identify(secret){
    const credential=typeof secret==='string'&&/^[a-f0-9]{48}$/.test(secret)?secret:randomBytes(24).toString('hex');
    return {secret:credential,id:createHash('sha256').update(credential).digest('hex')};
  }
  skill(players){
    const scores=players.map(p=>{
      const games=this.matches.filter(m=>m.players.some(t=>keyOf(t)===p.profileId&&t.completed!==false)).slice(-10);
      if(games.length<3)return 0;
      const stats=games.map(m=>({stats:m.players.find(t=>keyOf(t)===p.profileId),weight:m.humans>1?1:m.botSkill==='hard'?1:m.botSkill==='normal'?.85:.65}));
      const total=stats.reduce((n,t)=>n+t.weight,0),wins=stats.reduce((n,t)=>n+(t.stats.won?t.weight:0),0)/stats.length,kills=stats.reduce((n,t)=>n+t.stats.kills*t.weight,0),deaths=stats.reduce((n,t)=>n+t.stats.deaths*t.weight,0);
      return wins*.6+Math.min(2,kills/Math.max(1,deaths))/2*.4*(total/stats.length);
    });
    if(!scores.length)return 'easy';
    const strong=Math.max(...scores),average=scores.reduce((a,b)=>a+b,0)/scores.length,score=strong*.65+average*.35;
    if(scores.some(s=>s<.2)&&scores.length>1)return score>=.4?'normal':'easy';
    return score>=.72?'hard':score>=.4?'normal':'easy';
  }
  position(profileId,{period='week',country=''}={}){
    const rows=this.top({period,country,count:Infinity}),index=rows.findIndex(p=>p.profileId===profileId);
    return index<0?null:{...rows[index],rank:index+1};
  }
  record(room){
    const now=this.now(),winner=room.winner,players=[],round=room.roundId||room.map?.id;
    if(!winner||this.recorded.get(room)===round)return null;
    this.recorded.set(room,round);
    const participants=room.matchPlayers?.size?[...room.matchPlayers.values()]:[...room.players.values()];
    const beforeRows=this.top({period:'week',count:Infinity});
    const before=new Map(participants.filter(p=>p.profileId).map(p=>[p.id,positionIn(beforeRows,p.profileId)]));
    for(const p of participants){
      const name=String(p.name||'').trim();if(p.bot||!name)continue;
      const key=p.profileId||name.toLowerCase(),won=!p.left&&(room.settings.mode==='teams'?p.team!=null&&p.team===winner?.team:p.id===winner?.id);
      const entry=this.entries.get(key)||blank(name),country=p.country||entry.country||'';
      const damageDealt=Number.isFinite(p.damageDealt)?p.damageDealt:0;
      Object.assign(entry,{name,country,...(p.profileId?{profileId:p.profileId,slot:p.slot}:{}),matches:entry.matches+(p.left?0:1),wins:entry.wins+(won?1:0),kills:entry.kills+p.kills,deaths:entry.deaths+p.deaths,damageDealt:entry.damageDealt+damageDealt,lastPlayed:now});
      this.entries.set(key,entry);players.push({name,country,...(p.profileId?{profileId:p.profileId,slot:p.slot}:{}),completed:!p.left,won,kills:p.kills,deaths:p.deaths,damageDealt});
    }
    if(players.length)this.matches.push({t:now,round,mode:room.settings.mode,settings:room.settings,botSkill:room.botSkill,humans:participants.filter(p=>!p.bot).length,duration:Math.max(0,room.time-(room.roundStarted||0)),players});
    this.prune(now);this.scheduleSave();
    const afterRows=this.top({period:'week',count:Infinity});
    return new Map(participants.filter(p=>p.profileId&&!p.bot).map(p=>{
      const index=afterRows.findIndex(t=>t.profileId===p.profileId),nearby=index<0?[]:afterRows.slice(Math.max(0,index-1),index+2).map(t=>({...t,rank:afterRows.indexOf(t)+1,beforeRank:beforeRows.findIndex(v=>keyOf(v)===keyOf(t))+1||null}));
      return [p.id,{type:'result',roundId:round,saved:true,period:'week',country:'',before:before.get(p.id),after:positionIn(afterRows,p.profileId),nearby}];
    }));
  }
  prune(now){
    this.matches=this.matches.filter(m=>m.t>=now-historyDays*day).slice(-matchLimit);
    // Over 200 names, drop those with the fewest matches first (oldest first among equals), so a
    // burst of throwaway names pushes out other throwaway names, not established players.
    if(this.entries.size>nameLimit)for(const [key] of [...this.entries].sort((a,b)=>a[1].matches-b[1].matches||a[1].lastPlayed-b[1].lastPlayed).slice(0,this.entries.size-nameLimit))this.entries.delete(key);
  }
  // Admin: forget one name everywhere (all-time and recent matches), or everything.
  remove(name){
    const key=String(name).trim().toLowerCase(),seen=p=>p.name.toLowerCase()===key;
    const targets=[...this.entries].filter(([id,p])=>id===key||seen(p));
    if(!key||!targets.length&&!this.matches.some(m=>m.players.some(seen)))return false;
    for(const [id]of targets)this.entries.delete(id);
    this.matches=this.matches.map(m=>({...m,players:m.players.filter(p=>!seen(p))})).filter(m=>m.players.length);
    this.scheduleSave();return true;
  }
  reset(){this.entries.clear();this.matches=[];this.scheduleSave();}
  rows(period){
    if(period==='all')return [...this.entries.values()];
    const since=periodStart(period,this.now()),totals=new Map();
    for(const match of this.matches)if(match.t>=since)for(const p of match.players){
      const key=keyOf(p),entry=totals.get(key)||blank(p.name);
      Object.assign(entry,{name:p.name,country:p.country||entry.country,...(p.profileId?{profileId:p.profileId,slot:p.slot}:{}),matches:entry.matches+(p.completed===false?0:1),wins:entry.wins+(p.won?1:0),kills:entry.kills+p.kills,deaths:entry.deaths+p.deaths,damageDealt:entry.damageDealt+(Number.isFinite(p.damageDealt)?p.damageDealt:0)});
      totals.set(key,entry);
    }
    return [...totals.values()];
  }
  top({period='all',country='',count=10}={}){
    if(!['day','week','month','all'].includes(period))period='all';
    return this.rows(period).filter(p=>!country||p.country===country)
      .sort((a,b)=>b.wins-a.wins||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name)||(a.profileId||'').localeCompare(b.profileId||''))
      .slice(0,count).map(({name,country,wins,matches,kills,deaths,damageDealt,profileId,slot})=>({name,country,wins,matches,kills,deaths,damageDealt,...(profileId?{profileId,slot}:{})}));
  }
  // Countries seen in all-time results, most players first, for the region filter.
  countries(){
    const counts=new Map();for(const p of this.entries.values())if(p.country)counts.set(p.country,(counts.get(p.country)||0)+1);
    return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([code,players])=>({code,players}));
  }
  scheduleSave(){
    if(!this.file||this.saveTimer)return;
    this.saveTimer=setTimeout(()=>{this.saveTimer=null;this.save();},1000);
    this.saveTimer.unref?.();
  }
  // Write a temporary file, then rename it, so a power cut never leaves half a file.
  save(){
    if(!this.file)return;
    clearTimeout(this.saveTimer);this.saveTimer=null;
    try{
      if(this.legacyBackupPending){if(!fs.existsSync(this.file+'.legacy-v1.json'))fs.copyFileSync(this.file,this.file+'.legacy-v1.json');this.legacyBackupPending=false;}
      const temp=this.file+'.tmp';
      fs.writeFileSync(temp,JSON.stringify({schema:2,players:[...this.entries.values()],matches:this.matches}));fs.renameSync(temp,this.file);
    }catch(error){console.error('Tank Frenzy: could not save the leaderboard:',error.message);}
  }
}
module.exports={Leaderboard,periodStart};
