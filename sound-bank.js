(function(root){
  'use strict';
  const ASSET='./audio/cartoon-v1.mp3';
  const CLIPS={"menu":{"start":0.0,"duration":0.17501133786848072},"start":{"start":0.21501133786848073,"duration":0.96},"shot":{"start":1.2150113378684808,"duration":0.28},"double":{"start":1.5350113378684807,"duration":0.3849886621315193},"machine":{"start":1.96,"duration":0.5249886621315193},"laser":{"start":2.5249886621315194,"duration":0.47},"ricochet":{"start":3.034988662131519,"duration":0.44},"intercept":{"start":3.514988662131519,"duration":0.19},"hit":{"start":3.744988662131519,"duration":0.32},"explosion":{"start":4.104988662131519,"duration":1.04},"immortal":{"start":5.184988662131519,"duration":1.08},"restore":{"start":6.304988662131519,"duration":1.1},"speed":{"start":7.444988662131519,"duration":0.59},"win":{"start":8.074988662131519,"duration":1.5},"lose":{"start":9.61498866213152,"duration":1.18},"machine-fire":{"start":1.96,"duration":0.08}};
  // Original approved auditions, stored separately so unaffected cues retain
  // their exact v1 waveforms. Machine fire shares the new normal cannon.
  const APPROVED_ASSETS=Object.freeze({start:'./audio/battle-start-v1.mp3',
    countdown3:'./audio/countdown-v1.mp3',countdown2:'./audio/countdown-v1.mp3',countdown1:'./audio/countdown-v1.mp3',
    shot:'./audio/effects-fire-a-v1.mp3',
    'machine-fire':'./audio/effects-fire-a-v1.mp3',ricochet:'./audio/effects-ricochet-c-v1.mp3',
    restore:'./audio/effects-pickup-a-v1.mp3',explosion:'./audio/effects-explosion-c-v1.mp3'});
  const APPROVED_CLIPS={start:{start:0,duration:1.06},
    countdown3:{start:0,duration:.26},countdown2:{start:.30,duration:.26},countdown1:{start:.60,duration:.26},
    shot:{start:0,duration:.29},'machine-fire':{start:0,duration:.11},
    ricochet:{start:0,duration:.36},restore:{start:0,duration:.67},explosion:{start:0,duration:1.26}};
  class TankSoundBank{
    constructor(context,fetcher=fetch){
      this.context=context;this.buffer=null;this.buffers=new Map();this.voices=new Set();this.lastPlayed=new Map();this.maxVoices=12;
      this.master=context.createGain();this.master.gain.value=.65;
      this.combat=context.createGain();this.cues=context.createGain();this.combat.connect(this.master);this.cues.connect(this.master);
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.18;
      this.master.connect(limiter);limiter.connect(context.destination);
      // Decode each distinct asset once. A failed new asset uses the original
      // recording for that cue, while other downloaded cues stay playable.
      const assets=[ASSET,...new Set(Object.values(APPROVED_ASSETS))];
      this.ready=Promise.all(assets.map(asset=>Promise.resolve().then(()=>fetcher(asset)).then(response=>{
        if(!response.ok)throw Error('Audio unavailable');return response.arrayBuffer();
      }).then(bytes=>context.decodeAudioData(bytes)).then(buffer=>{
        this.buffers.set(asset,buffer);if(asset===ASSET)this.buffer=buffer;return true;
      }).catch(()=>false))).then(results=>results.every(Boolean));
    }
    stopVoice(voice){
      if(!this.voices.delete(voice))return;
      voice.gain.gain.cancelScheduledValues(this.context.currentTime);voice.gain.gain.setValueAtTime(0,this.context.currentTime);
      voice.source.onended=null;try{voice.source.stop();}catch{/* Already ended. */}
      voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();
    }
    stop(){
      for(const voice of [...this.voices])this.stopVoice(voice);
      this.lastPlayed.clear();this.combat.gain.cancelScheduledValues(this.context.currentTime);this.combat.gain.setValueAtTime(1,this.context.currentTime);
    }
    play(name,{volume=1,pan=0,priority=1,channel='combat',interval=0,key=name,vary=false,duck=false}={}){
      const approved=APPROVED_ASSETS[name],buffer=approved&&this.buffers.get(approved)||this.buffer;
      const clip=approved&&this.buffers.has(approved)?APPROVED_CLIPS[name]:CLIPS[name];
      if(!clip||!buffer)return false;
      const ac=this.context,now=ac.currentTime;
      if(now-(this.lastPlayed.get(key)??-Infinity)<interval)return true;
      if(this.voices.size>=this.maxVoices){
        const oldest=[...this.voices].sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];
        if(oldest.priority>priority)return true;
        this.stopVoice(oldest);
      }
      this.lastPlayed.set(key,now);
      if(this.lastPlayed.size>64)for(const [id,time] of this.lastPlayed)if(now-time>2)this.lastPlayed.delete(id);
      while(this.lastPlayed.size>64)this.lastPlayed.delete(this.lastPlayed.keys().next().value);
      const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=buffer;
      source.playbackRate.value=vary?1+(Math.random()-.5)*.06:1;
      const duration=clip.duration/source.playbackRate.value;
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1.2,volume)),now+.004);
      gain.gain.setValueAtTime(Math.max(0,Math.min(1.2,volume)),now+Math.max(.004,duration-.008));gain.gain.linearRampToValueAtTime(0,now+duration);
      source.connect(gain);
      const panner=ac.createStereoPanner?.();if(panner){panner.pan.value=Math.max(-.55,Math.min(.55,pan));gain.connect(panner);panner.connect(channel==='cue'?this.cues:this.combat);}else gain.connect(channel==='cue'?this.cues:this.combat);
      const voice={source,gain,pan:panner,priority,started:now};this.voices.add(voice);
      source.onended=()=>this.stopVoice(voice);
      source.start(now,clip.start,clip.duration);source.stop(now+duration+.015);
      if(duck){this.combat.gain.cancelScheduledValues(now);this.combat.gain.setTargetAtTime(.35,now,.025);this.combat.gain.setTargetAtTime(1,now+duration,.12);}
      return true;
    }
  }
  TankSoundBank.asset=ASSET;TankSoundBank.approvedAssets=APPROVED_ASSETS;
  TankSoundBank.clips={...CLIPS,...APPROVED_CLIPS};TankSoundBank.legacyClips=CLIPS;
  if(typeof module!=='undefined')module.exports=TankSoundBank;else root.TankSoundBank=TankSoundBank;
})(typeof globalThis!=='undefined'?globalThis:this);
