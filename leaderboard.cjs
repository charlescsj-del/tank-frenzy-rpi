'use strict';
// Leaderboard by player name: all-time totals plus a log of recent matches for
// today / this week / this month, each filterable by country. In the Home Assistant
// app the file lives in /data, so it survives restarts, updates and reboots.
const fs=require('node:fs');
const nameLimit=200,historyDays=62,matchLimit=20000,day=864e5;
const blank=name=>({name,wins:0,matches:0,kills:0,deaths:0,country:'',lastPlayed:0});

// Period starts use the server's local time zone (the app gets Home Assistant's).
function periodStart(period,now=Date.now()){
  const d=new Date(now);d.setHours(0,0,0,0);
  if(period==='day')return d.getTime();
  if(period==='week'){d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime();}
  if(period==='month'){d.setDate(1);return d.getTime();}
  return 0;
}

class Leaderboard {
  constructor(file=null,now=Date.now){
    this.file=file;this.now=now;this.entries=new Map();this.matches=[];this.saveTimer=null;
    if(!file||!fs.existsSync(file))return;
    try{
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      for(const entry of data.players||[])if(typeof entry?.name==='string'&&entry.name.trim())this.entries.set(entry.name.trim().toLowerCase(),{...blank(entry.name.trim()),...entry});
      this.matches=Array.isArray(data.matches)?data.matches.filter(m=>Number.isFinite(m?.t)&&Array.isArray(m.players)):[];
    }catch(error){console.error('Tank Frenzy: ignoring unreadable leaderboard:',error.message);}
  }
  // Called once when a match has a winner. Bots are not ranked.
  record(room){
    const now=this.now(),winner=room.winner,players=[];
    for(const p of room.players.values()){
      const name=String(p.name||'').trim();if(p.bot||!name)continue;
      const key=name.toLowerCase(),won=room.settings.mode==='teams'?p.team!=null&&p.team===winner?.team:p.id===winner?.id;
      const entry=this.entries.get(key)||blank(name),country=p.country||entry.country||'';
      Object.assign(entry,{name,country,matches:entry.matches+1,wins:entry.wins+(won?1:0),kills:entry.kills+p.kills,deaths:entry.deaths+p.deaths,lastPlayed:now});
      this.entries.set(key,entry);players.push({name,country,won,kills:p.kills,deaths:p.deaths});
    }
    if(players.length)this.matches.push({t:now,mode:room.settings.mode,players});
    this.prune(now);this.scheduleSave();
  }
  prune(now){
    this.matches=this.matches.filter(m=>m.t>=now-historyDays*day).slice(-matchLimit);
    if(this.entries.size>nameLimit)for(const [key] of [...this.entries].sort((a,b)=>a[1].lastPlayed-b[1].lastPlayed).slice(0,this.entries.size-nameLimit))this.entries.delete(key);
  }
  rows(period){
    if(period==='all')return [...this.entries.values()];
    const since=periodStart(period,this.now()),totals=new Map();
    for(const match of this.matches)if(match.t>=since)for(const p of match.players){
      const key=p.name.toLowerCase(),entry=totals.get(key)||blank(p.name);
      Object.assign(entry,{name:p.name,country:p.country||entry.country,matches:entry.matches+1,wins:entry.wins+(p.won?1:0),kills:entry.kills+p.kills,deaths:entry.deaths+p.deaths});
      totals.set(key,entry);
    }
    return [...totals.values()];
  }
  top({period='all',country='',count=10}={}){
    if(!['day','week','month','all'].includes(period))period='all';
    return this.rows(period).filter(p=>!country||p.country===country)
      .sort((a,b)=>b.wins-a.wins||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name))
      .slice(0,count).map(({name,country,wins,matches,kills,deaths})=>({name,country,wins,matches,kills,deaths}));
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
      const temp=this.file+'.tmp';
      fs.writeFileSync(temp,JSON.stringify({players:[...this.entries.values()],matches:this.matches}));fs.renameSync(temp,this.file);
    }catch(error){console.error('Tank Frenzy: could not save the leaderboard:',error.message);}
  }
}
module.exports={Leaderboard,periodStart};
