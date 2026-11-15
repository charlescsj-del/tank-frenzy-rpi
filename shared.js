(function(root) {
  const data = {
    version:'3.10.0',maxHealth:10,laserDamage:4,laserRadius:6,barrelLength:40,doubleBarrelOffset:6,turretHeight:28,
    mapLabels:{quarry:'Quarry',crossroads:'Crossroads'},
    // Badges with a stat and target unlock from lifetime totals and show progress in the Garage.
    achievements:[
      {id:'first-win',name:'First victory',description:'Win your first standard match.'},
      {id:'sharpshooter',name:'Sharpshooter',description:'Land at least 10 hits with 50% accuracy in a standard match.'},
      {id:'comeback',name:'Comeback',description:'Win a standard match after trailing by at least 3 points.'},
      {id:'flawless',name:'Flawless',description:'Win a standard match without being destroyed.'},
      {id:'double-trouble',name:'Double trouble',description:'Earn a Double Kill medal.',stat:'medal:double-kill',target:1},
      {id:'hot-streak',name:'Hot streak',description:'Win 3 standard matches in a row.',stat:'bestWinStreak',target:3},
      {id:'trickster',name:'Trickster',description:'Earn 10 Trick Shot medals.',stat:'medal:trick-shot',target:10},
      {id:'avenger',name:'Avenger',description:'Earn 10 Revenge medals.',stat:'medal:revenge',target:10},
      {id:'giant-slayer',name:'Giant slayer',description:'Earn 5 Shutdown medals.',stat:'medal:shutdown',target:5},
      {id:'veteran',name:'Veteran',description:'Finish 25 standard matches.',stat:'matches',target:25},
      {id:'centurion',name:'Centurion',description:'Destroy 100 tanks in standard matches.',stat:'kills',target:100},
      {id:'sergeant',name:'Earn your stripes',description:'Reach Level 10.',stat:'level',target:10}
    ],
    // Combat medals are decided by the server at the moment of a kill. They are praise, not power.
    medals:[
      {id:'first-blood',name:'First Blood',description:'The first kill of the match.'},
      {id:'double-kill',name:'Double Kill',description:'Two kills within four seconds.'},
      {id:'triple-kill',name:'Triple Kill',description:'Three or more kills within four seconds of each other.'},
      {id:'revenge',name:'Revenge',description:'Destroy the tank that last destroyed you.'},
      {id:'shutdown',name:'Shutdown',description:'End an opponent’s streak of three or more kills.'},
      {id:'trick-shot',name:'Trick Shot',description:'A kill with a bounced shell.'},
      {id:'clutch',name:'Clutch',description:'A kill while you are on your last point of health.'}
    ],
    multiKillWindow:4,
    // Experience is earned under the same rules as coins. Levels never change combat.
    xp:{completion:50,win:40,kill:6,killCap:15,medal:8,medalCap:10,firstOfDay:30,winStreak:10,winStreakCap:4},
    ranks:[{level:1,name:'Recruit'},{level:3,name:'Private'},{level:6,name:'Corporal'},{level:10,name:'Sergeant'},{level:15,name:'Lieutenant'},{level:20,name:'Captain'},{level:26,name:'Major'},{level:33,name:'Colonel'},{level:41,name:'General'},{level:50,name:'Field Marshal'}],
    economy:{completion:20,win:30,kill:3,killCap:10,daily:[20,25,30,40,50,65,100],collectionBonus:200,timezone:'Asia/Kuala_Lumpur'},
    weeklyChallenges:[
      {id:'matches',name:'Keep rolling',description:'Finish 5 standard matches.',target:5,coins:75},
      {id:'wins',name:'Victory lap',description:'Win 3 standard matches.',target:3,coins:100},
      {id:'ricochetHits',name:'Around the corner',description:'Land 10 bounced-shell hits on opponents.',target:10,coins:125}
    ],
    skinCollections:[
      {id:'originals',name:'Originals',description:'Six normal skins can unlock on Day 7. Classic is always free.'},
      {id:'showcase',name:'Showcase',description:'Special paintwork. Earned coins only. Same battle stats.'}
    ],
    skins:[
      {id:'classic',name:'Classic',collection:'originals',price:0,pattern:'none',description:'Your original colours. Ready for anything.'},
      {id:'desert',name:'Desert Scout',collection:'originals',dailyReward:true,price:200,pattern:'camo',body:'#dfb56c',accent:'#8c673e',description:'Sun-baked armour and desert camouflage.'},
      {id:'arctic',name:'Arctic Ghost',collection:'originals',dailyReward:true,price:200,pattern:'camo',body:'#dbe9ee',accent:'#7c9faa',description:'Ice-white camouflage with cool steel details.'},
      {id:'forest',name:'Forest Ranger',collection:'originals',dailyReward:true,price:500,pattern:'camo',body:'#87a76a',accent:'#365c43',description:'Woodland armour for a quarry explorer.'},
      {id:'sunset',name:'Sunset Racer',collection:'originals',dailyReward:true,price:500,pattern:'stripe',body:'#db765e',accent:'#ffe4a0',description:'Bold racing stripes in warm sunset colours.'},
      {id:'carbon',name:'Carbon Night',collection:'originals',dailyReward:true,price:1000,pattern:'grid',body:'#596674',accent:'#a0bdc1',description:'Dark woven armour with polished steel trim.'},
      {id:'gold',name:'Golden Ace',collection:'originals',dailyReward:true,price:1000,pattern:'stripe',body:'#e6bc54',accent:'#fff0a3',description:'Golden armour for a tank worth remembering.'},
      {id:'circuit',name:'Circuit Runner',collection:'showcase',price:1500,pattern:'circuit',body:'#52bfc2',accent:'#fff3ad',description:'Turquoise paint with crisp circuit-board lines. No glow or battle advantage.'},
      {id:'forge',name:'Ember Forge',collection:'showcase',price:1500,pattern:'chevron',body:'#e48662',accent:'#ffe6a5',description:'Copper-orange armour with bold workshop chevrons.'},
      {id:'royal',name:'Royal Crest',collection:'showcase',price:1500,pattern:'diamond',body:'#ab83c9',accent:'#ffdf86',description:'Royal purple paint finished with golden diamond crests.'}
    ],
    width: 1600, height: 1040, maxPlayers: 4, targetScore: 10, fireCooldown: .42, shellSpeed: 410,
    maxShells:144,maxShellsPerPlayer:36,powerDuration:10,pickupInterval:12,pickupLifetime:20,pickupRadius:60,
    powers:['laser','double','speed','machine','immortal','restore'],
    powerLabels:{laser:'LASER',double:'DOUBLE CANNON',speed:'SPEED',machine:'MACHINE GUN',immortal:'SHIELD',restore:'RESTORE'},
    palette: [
      {name:'Ember',body:'#ef934c',bullet:'#ff782e'},
      {name:'Glacier',body:'#59b9df',bullet:'#39bfff'},
      {name:'Moss',body:'#87bd58',bullet:'#8de445'},
      {name:'Orchid',body:'#b08be5',bullet:'#df8bff'},
      {name:'Gold',body:'#c1a64d',bullet:'#ffcf36'},
      {name:'Rose',body:'#c67494',bullet:'#ff72af'},
      {name:'Jade',body:'#49a799',bullet:'#42efd1'},
      {name:'Ivory',body:'#a3a393',bullet:'#faf2cf'}
    ],
    walls: [],
    spawns: [[90,90],[1510,950],[1510,90],[90,950]]
  };
  data.viewScale=Math.min(1000/data.width,520/data.height);
  data.vehicleRevision='vehicles-1';
  data.vehicleNotice='Vehicle test · Practice · No coins or rankings';
  data.vehicles=Object.freeze([
    Object.freeze({id:'standard',name:'Standard',health:10,speed:170,reload:.42,description:'Balanced and easy to learn.'}),
    Object.freeze({id:'scout',name:'Scout',health:8,speed:204,reload:.42,description:'Move fast. Stay out of the firing line.'}),
    Object.freeze({id:'heavy',name:'Heavy',health:12,speed:145,reload:.48,description:'Take more hits. Choose your shots.'})
  ]);
  data.vehicleOf=id=>data.vehicles.find(v=>v.id===id)||data.vehicles[0];
  // Level 2 needs 80 XP, each later level 40 more, up to 600 per level.
  data.levelNeed=level=>Math.min(600,80+40*(level-1));
  data.levelOf=xp=>{
    let level=1,into=Math.max(0,Math.floor(xp)||0);
    while(into>=data.levelNeed(level)){into-=data.levelNeed(level);level++;}
    const rank=[...data.ranks].reverse().find(r=>level>=r.level),next=data.ranks.find(r=>r.level>level);
    return {level,into,need:data.levelNeed(level),rank:rank.name,nextRank:next?{level:next.level,name:next.name}:null};
  };
  data.medalName=id=>data.medals.find(m=>m.id===id)?.name||id;
  // Lifetime value behind a stat badge, from a player's saved statistics.
  data.statValue=(stats,stat,level=1)=>stat==='level'?level:stat.startsWith('medal:')?stats?.medals?.[stat.slice(6)]||0:stats?.[stat]||0;
  data.muzzle=(x,y,aim,distance=data.barrelLength)=>({x:x+Math.cos(aim)*distance,y:y+Math.sin(aim)*distance});
  data.project=(x,y,z=0)=>({x:560+(x-data.width/2)*data.viewScale,y:319+(y-data.height/2-z*.35)*data.viewScale});
  data.unproject=(x,y,z=0)=>({x:data.width/2+(x-560)/data.viewScale,y:data.height/2+(y-319)/data.viewScale+z*.35});
  if(typeof module !== 'undefined') module.exports=data;
  else root.FIELD=data;
})(typeof globalThis !== 'undefined' ? globalThis : this);

