'use strict';
const fs=require('node:fs'),{randomBytes,createHash,randomInt}=require('node:crypto'),F=require('./shared.js');
const day=864e5,validSecret=value=>typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);
const dayNumber=now=>Math.floor((now+8*3600e3)/day);
const blank=()=>({coins:0,owned:['classic'],equipped:'classic',daily:{step:0,lastDay:null,graceUsed:false,longest:0,streak:0},credited:{},transactions:[],pending:null,stats:{matches:0,wins:0,kills:0,bestKills:0,earned:0,firstDay:null,nextDayReturn:false,day7Return:false,firstPurchaseMatches:null}});
class Progress {
  constructor(file=null,{now=Date.now,random=randomInt}={}){
    this.file=file;this.now=now;this.random=random;this.players=new Map();
    if(file&&fs.existsSync(file)){
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(data.schema!==1||!Array.isArray(data.players))throw Error('Unsupported player progress file. Restore a backup before starting.');
      for(const [id,p]of data.players){
        if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(p?.coins)||p.coins<0||!Array.isArray(p.owned)||!p.owned.includes('classic')||!p.owned.includes(p.equipped)||!p.daily||!p.credited)throw Error('Invalid player progress file. Restore a backup before starting.');
        this.players.set(id,{...blank(),...p,stats:{...blank().stats,...p.stats}});
      }
    }
  }
  identify(secret){
    if(secret&&!validSecret(secret))throw Error('Invalid player code.');
    secret=secret||randomBytes(24).toString('hex');return {secret,id:createHash('sha256').update(secret).digest('hex')};
  }
  commit(change){
    const before=new Map(this.players);this.players=new Map([...before].map(([id,p])=>[id,p]));
    try{const result=change();this.save();return result;}catch(error){this.players=before;throw error;}
  }
  edit(id){const p=JSON.parse(JSON.stringify(this.players.get(id)||blank()));this.players.set(id,p);return p;}
  ensure(id){if(!this.players.has(id))this.commit(()=>this.players.set(id,blank()));return this.view(id);}
  skinOf(id){return this.players.get(id)?.equipped||'classic';}
  dailyState(p){
    const d=p.daily,today=dayNumber(this.now()),gap=d.lastDay===null?0:today-d.lastDay;
    const reset=gap>1&&(gap!==2||d.graceUsed),nextCycle=d.step===7&&gap>0,step=reset||nextCycle?0:d.step;
    return {...d,step,qualified:d.lastDay===today,nextDay:step===7?1:step+1,graceAvailable:!d.graceUsed||reset||nextCycle,resetAt:(today+1)*day-8*3600e3,timezone:F.economy.timezone};
  }
  view(id){const p=this.players.get(id)||blank();return {coins:p.coins,owned:p.owned,equipped:p.equipped,daily:this.dailyState(p),pending:p.pending,stats:p.stats,persistent:!!this.file};}
  transaction(p,type,coins,extra={}){p.transactions.push({t:this.now(),type,coins,...extra});p.transactions=p.transactions.slice(-100);}
  buy(id,skinId){
    const skin=F.skins.find(s=>s.id===skinId);if(!skin)throw Error('Unknown skin.');
    const current=this.players.get(id);if(!current)throw Error('Load your player first.');
    if(current.owned.includes(skinId))return this.view(id);
    if(current.coins<skin.price)throw Error('You need more coins for this skin.');
    return this.commit(()=>{const p=this.edit(id);p.coins-=skin.price;p.owned.push(skinId);p.stats.firstPurchaseMatches??=p.stats.matches;this.transaction(p,'purchase',-skin.price,{skin:skinId});return this.view(id);});
  }
  equip(id,skin){
    if(!this.players.get(id)?.owned.includes(skin)||!F.skins.some(s=>s.id===skin))throw Error('You do not own this skin.');
    if(this.skinOf(id)===skin)return this.view(id);
    return this.commit(()=>{this.edit(id).equipped=skin;return this.view(id);});
  }
  acknowledge(id,round){
    if(this.players.get(id)?.pending?.round!==round)return this.view(id);
    return this.commit(()=>{this.edit(id).pending=null;return this.view(id);});
  }
  record(room){
    if(!room.winner||typeof room.roundId!=='string')return new Map();
    const participants=(room.matchPlayers?.size?[...room.matchPlayers.values()]:[...room.players.values()]).sort((a,b)=>Number(!!a.left)-Number(!!b.left));
    const candidates=participants.filter(p=>!p.bot&&p.profileId&&!this.players.get(p.profileId)?.credited[room.roundId]);
    if(!candidates.length)return new Map();
    return this.commit(()=>{
      const rewards=new Map(),seen=new Set();
      for(const player of candidates){
        if(seen.has(player.profileId))continue;seen.add(player.profileId);
        const p=this.edit(player.profileId),eligible=room.settings.targetScore===F.targetScore&&room.settings.bouncing&&room.settings.powers;
        const participated=(player.activeSeconds||0)>=Math.min(10,Math.max(2,(room.time-(player.joinedRoundAt??room.roundStarted??room.time))*.1));
        const reason=!eligible?'Practice match · Standard rules earn coins':player.left?'Left early · Finish the match to earn coins':!player.connected?'Disconnected at match end':!participated?'No coins · Participate in the battle':'';
        const won=!reason&&(room.settings.mode==='teams'?player.team!=null&&player.team===room.winner.team:player.id===room.winner.id);
        const reward={round:room.roundId,completion:reason?0:F.economy.completion,victory:won?F.economy.win:0,kills:reason?0:Math.max(0,Math.min(F.economy.killCap,Math.floor(player.kills)||0))*F.economy.kill,daily:null,skin:null,reason};
        if(!reason){
          const today=dayNumber(room.rewardAt??this.now()),d=p.daily,gap=d.lastDay===null?0:today-d.lastDay;
          if(d.lastDay===null||gap>0){
            if(gap>1){if(gap===2&&!d.graceUsed)d.graceUsed=true;else{d.step=0;d.graceUsed=false;d.streak=0;}}
            if(d.step===7){d.step=0;d.graceUsed=false;}
            d.step++;d.streak++;d.longest=Math.max(d.longest,d.streak);d.lastDay=today;
            reward.daily={day:d.step,coins:F.economy.daily[d.step-1],collectionBonus:0};
            if(d.step===7){const available=F.skins.filter(s=>s.id!=='classic'&&!p.owned.includes(s.id));if(available.length){reward.skin=available[this.random(available.length)].id;p.owned.push(reward.skin);}else reward.daily.collectionBonus=F.economy.collectionBonus;}
          }
          p.stats.firstDay??=today;p.stats.nextDayReturn||=today===p.stats.firstDay+1;p.stats.day7Return||=today===p.stats.firstDay+7;
          p.stats.matches++;p.stats.wins+=won?1:0;p.stats.kills+=Math.max(0,Math.floor(player.kills)||0);p.stats.bestKills=Math.max(p.stats.bestKills,player.kills||0);
        }
        reward.total=reward.completion+reward.victory+reward.kills+(reward.daily?.coins||0)+(reward.daily?.collectionBonus||0);
        p.coins+=reward.total;p.stats.earned+=reward.total;p.credited[room.roundId]=1;p.pending=reward;
        this.transaction(p,'match',reward.total,{round:room.roundId});rewards.set(player.id,{reward,progress:this.view(player.profileId)});
      }
      return rewards;
    });
  }
  report(){
    const rows=[...this.players.values()],played=rows.filter(p=>p.stats.matches>0),today=dayNumber(this.now()),next=played.filter(p=>p.stats.firstDay<today),seventh=played.filter(p=>p.stats.firstDay<=today-7),purchases=rows.filter(p=>p.stats.firstPurchaseMatches!==null);
    return {profiles:rows.length,played:played.length,secondMatch:played.filter(p=>p.stats.matches>=2).length,nextDay:{eligible:next.length,returned:next.filter(p=>p.stats.nextDayReturn).length},day7:{eligible:seventh.length,returned:seventh.filter(p=>p.stats.day7Return).length},matches:rows.reduce((n,p)=>n+p.stats.matches,0),earned:rows.reduce((n,p)=>n+p.stats.earned,0),coins:rows.reduce((n,p)=>n+p.coins,0),skins:rows.reduce((n,p)=>n+p.owned.length-1,0),buyers:purchases.length,firstPurchaseMatches:purchases.length?purchases.reduce((n,p)=>n+p.stats.firstPurchaseMatches,0)/purchases.length:null,persistent:!!this.file};
  }
  save(){
    if(!this.file)return;
    const temp=this.file+'.tmp';let fd;
    try{fd=fs.openSync(temp,'w',0o600);fs.writeFileSync(fd,JSON.stringify({schema:1,players:[...this.players]}));fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(temp,this.file);}
    catch(error){if(fd!==null&&fd!==undefined)fs.closeSync(fd);throw Error('Progress could not be saved. Please try again.');}
  }
}
module.exports={Progress,dayNumber};
