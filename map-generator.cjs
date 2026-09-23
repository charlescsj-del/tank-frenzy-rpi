'use strict';
const {randomInt}=require('node:crypto');
const F=require('./shared.js');
function generateMap(seed=randomInt(0,0x100000000)){
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};
  const walls=[];
  // Each obstacle stays inside its cell. Wide lanes between cells and around
  // the perimeter remain connected, with all four spawns on that perimeter.
  for(let row=0;row<4;row++)for(let col=0;col<5;col++){
    if(random()<.18)continue;
    const w=80+Math.floor(random()*81),h=55+Math.floor(random()*46);
    const x=Math.round(100+(col+.5)*280-w/2+(random()-.5)*30);
    const y=Math.round(100+(row+.5)*210-h/2+(random()-.5)*30);
    walls.push({x,y,w,h,z:32+Math.floor(random()*24)});
  }
  return {id:seed>>>0,width:F.width,height:F.height,walls,spawns:F.spawns};
}
module.exports={generateMap};

