(function(root){
  'use strict';
  // Original arcade battle score, rendered once on the player's device, then looped.
  // One mono buffer source plays at a time; no server traffic or note timers.
  function compose(context,mode){
    const battle=mode==='battle',rate=22050,beat=60/(battle?128:112),duration=beat*64;
    const buffer=context.createBuffer(1,Math.ceil(duration*rate),rate),out=buffer.getChannelData(0);
    let seed=0x74616e6b;
    const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
    const note=(midi,start,length,level,kind='brass')=>{
      const frequency=440*2**((midi-69)/12),first=Math.round(start*rate),count=Math.round(length*rate);
      for(let i=0;i<count;i++){
        const t=i/rate,phase=2*Math.PI*frequency*t;
        const envelope=Math.min(1,t/(kind==='pad'?.025:.008))*Math.min(1,(length-t)/.045)*Math.exp(-t*(kind==='pad'?1.2:kind==='bass'?4:2));
        const wave=kind==='bass'?Math.sin(phase)+.3*Math.sin(phase*2)+.12*Math.sin(phase*3):
          kind==='pad'?Math.sin(phase)+.25*Math.sin(phase*2):Math.sin(phase)+.3*Math.sin(phase*3)+.12*Math.sin(phase*5);
        out[(first+i)%out.length]+=wave*envelope*level;
      }
    };
    const drum=(kind,at,level)=>{
      const length=kind==='kick'?.28:kind==='snare'?.18:.055,first=Math.round(at*rate);let previous=0;
      for(let i=0;i<Math.ceil(length*rate);i++){
        const t=i/rate,n=noise(),high=n-previous;previous=n;
        const wave=kind==='kick'?Math.sin(2*Math.PI*(48*t+110/35*(1-Math.exp(-35*t))))+.15*n*Math.exp(-t*150):
          kind==='snare'?.65*high+.3*Math.sin(2*Math.PI*185*t):high;
        const envelope=Math.min(1,t/.003)*Math.exp(-t*(kind==='kick'?18:kind==='snare'?24:80));
        out[(first+i)%out.length]+=wave*envelope*level;
      }
    };
    // D minor / B-flat / F / C: a heroic arcade theme with a contrasting second half.
    const roots=[38,34,41,36],thirds=[3,4,4,4];
    const motifs=[[12,12,19,15,17,15,14,10],[12,19,24,22,19,17,15,19],
      [24,22,19,17,19,15,14,12],[19,17,15,14,12,10,7,10]];
    for(let bar=0;bar<16;bar++){
      const chord=bar%4,root=roots[chord],secondHalf=bar>=8,motif=motifs[Math.floor(bar/4)];
      // Soft sustained chords support the tune; bass harmonics remain audible on phones.
      for(const interval of [0,thirds[chord],7])note(root+12+interval,bar*4*beat,beat*3.7,.027,'pad');
      for(let step=0;step<8;step++){
        const at=(bar*4+step*.5)*beat;
        if(battle||step%2===0)note(root+(step===3||step===7?7:0),at,beat*.38,.15,'bass');
        if(battle||step%2===0)note(50+motif[step]+(secondHalf&&bar%2===1?-12:0),at,beat*(battle?.42:.8),battle?.085:.065);
        if(step%2===0||battle)drum('hat',at,battle?.022:.012);
      }
      for(const pulse of battle?[0,1.5,2,3.5]:[0,2])drum('kick',(bar*4+pulse)*beat,battle?.24:.17);
      for(const pulse of [1,3])drum('snare',(bar*4+pulse)*beat,battle?.11:.065);
      if(battle&&bar%4===3)for(const pulse of [3.25,3.5,3.75])drum('snare',(bar*4+pulse)*beat,.045+(pulse-3)*.05);
    }
    let peak=0;for(const value of out)peak=Math.max(peak,Math.abs(value));
    const level=.55/Math.max(.55,peak);for(let i=0;i<out.length;i++)out[i]*=level;
    // A three-millisecond edge taper avoids a click when the buffer wraps.
    for(let i=0;i<66;i++){out[i]*=i/66;out[out.length-1-i]*=i/66;}
    return buffer;
  }
  class TankMusic{
    constructor(context){this.context=context;this.buffers=new Map();this.source=null;this.mode=null;this.gain=context.createGain();this.gain.gain.value=.10;this.gain.connect(context.destination);}
    play(mode){
      if(mode===this.mode&&this.source)return;
      this.stop();
      if(!this.buffers.has(mode))this.buffers.set(mode,compose(this.context,mode));
      const source=this.context.createBufferSource();source.buffer=this.buffers.get(mode);source.loop=true;source.connect(this.gain);
      this.gain.gain.setValueAtTime(0,this.context.currentTime);this.gain.gain.linearRampToValueAtTime(.10,this.context.currentTime+.25);
      this.source=source;this.mode=mode;source.start();
    }
    stop(){if(this.source){this.source.stop();this.source.disconnect();this.source=null;}this.mode=null;this.gain.gain.cancelScheduledValues(this.context.currentTime);this.gain.gain.setValueAtTime(0,this.context.currentTime);}
  }
  TankMusic.compose=compose;
  if(typeof module!=='undefined')module.exports=TankMusic;else root.TankMusic=TankMusic;
})(typeof globalThis!=='undefined'?globalThis:this);
