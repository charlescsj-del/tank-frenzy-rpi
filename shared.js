(function(root) {
  const data = {
    version:'1.14.0',maxHealth:10,laserDamage:4,laserRadius:6,barrelLength:40,doubleBarrelOffset:6,turretHeight:28,
    width: 1600, height: 1040, maxPlayers: 4, targetScore: 10, fireCooldown: .42, shellSpeed: 410,
    maxShells:144,maxShellsPerPlayer:36,powerDuration:10,pickupInterval:12,pickupLifetime:20,pickupRadius:60,
    powers:['laser','double','speed','machine','immortal','restore'],
    powerLabels:{laser:'LASER',double:'DOUBLE CANNON',speed:'SPEED',machine:'MACHINE GUN',immortal:'IMMORTAL',restore:'RESTORE'},
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
