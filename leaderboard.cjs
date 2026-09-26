'use strict';
// All-time results by player name. In the Home Assistant app the file lives in
// /data, so it survives app restarts and updates; without a file it is in-memory only.
const fs=require('node:fs');
const limit=200;

class Leaderboard {
  constructor(file=null){
    this.file=file;this.entries=new Map();this.saveTimer=null;
    if(!file||!fs.existsSync(file))return;
    try{
      for(const entry of JSON.parse(fs.readFileSync(file,'utf8')).players||[])
        if(typeof entry?.name==='string'&&entry.name.trim())this.entries.set(entry.name.trim().toLowerCase(),{wins:0,matches:0,kills:0,deaths:0,lastPlayed:0,...entry});
    }catch(error){console.error('Tank Frenzy: ignoring unreadable leaderboard:',error.message);}
  }
  // Called once when a match has a winner. Bots are not ranked.
  record(room){
    const now=Date.now(),winner=room.winner;
    for(const p of room.players.values()){
      const name=String(p.name||'').trim();if(p.bot||!name)continue;
      const key=name.toLowerCase(),entry=this.entries.get(key)||{name,wins:0,matches:0,kills:0,deaths:0,lastPlayed:0};
      const won=room.settings.mode==='teams'?p.team!=null&&p.team===winner?.team:p.id===winner?.id;
      Object.assign(entry,{name,matches:entry.matches+1,wins:entry.wins+(won?1:0),kills:entry.kills+p.kills,deaths:entry.deaths+p.deaths,lastPlayed:now});
      this.entries.set(key,entry);
    }
    // Keep the file small: forget the players who have not played for longest.
    if(this.entries.size>limit)for(const [key] of [...this.entries].sort((a,b)=>a[1].lastPlayed-b[1].lastPlayed).slice(0,this.entries.size-limit))this.entries.delete(key);
    this.scheduleSave();
  }
  top(count=10){
    return [...this.entries.values()].sort((a,b)=>b.wins-a.wins||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name))
      .slice(0,count).map(({name,wins,matches,kills,deaths})=>({name,wins,matches,kills,deaths}));
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
      fs.writeFileSync(temp,JSON.stringify({players:[...this.entries.values()]}));fs.renameSync(temp,this.file);
    }catch(error){console.error('Tank Frenzy: could not save the leaderboard:',error.message);}
  }
}
module.exports={Leaderboard};
