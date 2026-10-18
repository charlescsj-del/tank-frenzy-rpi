(function(root) {
  const data = {
    version:'3.6.0',maxHealth:10,laserDamage:4,laserRadius:6,barrelLength:40,doubleBarrelOffset:6,turretHeight:28,
    achievements:[
      {id:'first-win',name:'First victory',description:'Win your first standard match.'},
      {id:'sharpshooter',name:'Sharpshooter',description:'Land at least 10 hits with 50% accuracy in a standard match.'},
      {id:'comeback',name:'Comeback',description:'Win a standard match after trailing by at least 3 points.'}
    ],
    economy:{completion:20,win:30,kill:3,killCap:10,daily:[20,25,30,40,50,65,100],collectionBonus:200,timezone:'Asia/Kuala_Lumpur'},
    weeklyChallenges:[
      {id:'matches',name:'Keep rolling',description:'Finish 5 standard matches.',target:5,coins:75},
      {id:'wins',name:'Victory lap',description:'Win 3 standard matches.',target:3,coins:100},
      {id:'ricochetHits',name:'Around the corner',description:'Land 10 bounced-shell hits on opponents.',target:10,coins:125}
    ],
    skins:[
      {id:'classic',name:'Classic',price:0,pattern:'none',description:'Your original colours. Ready for anything.'},
      {id:'desert',name:'Desert Scout',price:200,pattern:'camo',body:'#dfb56c',accent:'#8c673e',description:'Sun-baked armour and desert camouflage.'},
      {id:'arctic',name:'Arctic Ghost',price:200,pattern:'camo',body:'#dbe9ee',accent:'#7c9faa',description:'Ice-white camouflage with cool steel details.'},
      {id:'forest',name:'Forest Ranger',price:500,pattern:'camo',body:'#87a76a',accent:'#365c43',description:'Woodland armour for a quarry explorer.'},
      {id:'sunset',name:'Sunset Racer',price:500,pattern:'stripe',body:'#db765e',accent:'#ffe4a0',description:'Bold racing stripes in warm sunset colours.'},
      {id:'carbon',name:'Carbon Night',price:1000,pattern:'grid',body:'#596674',accent:'#a0bdc1',description:'Dark woven armour with polished steel trim.'},
      {id:'gold',name:'Golden Ace',price:1000,pattern:'stripe',body:'#e6bc54',accent:'#fff0a3',description:'Golden armour for a tank worth remembering.'}
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
  data.muzzle=(x,y,aim,distance=data.barrelLength)=>({x:x+Math.cos(aim)*distance,y:y+Math.sin(aim)*distance});
  data.project=(x,y,z=0)=>({x:560+(x-data.width/2)*data.viewScale,y:319+(y-data.height/2-z*.35)*data.viewScale});
  data.unproject=(x,y,z=0)=>({x:data.width/2+(x-560)/data.viewScale,y:data.height/2+(y-319)/data.viewScale+z*.35});
  if(typeof module !== 'undefined') module.exports=data;
  else root.FIELD=data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
