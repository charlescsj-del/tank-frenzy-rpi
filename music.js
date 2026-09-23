(function(root){
  'use strict';
  // The approved recordings are downloaded/decoded once on demand. Only one
  // looping source plays; selection and playback never use game-server messages.
  const tracks=Object.freeze({
    A:'./audio/music-iron-advance-v1.mp3',
    B:'./audio/music-overdrive-v1.mp3',
    C:'./audio/music-steel-pressure-v1.mp3'
  });
  // Align the loop with the active phrase, skipping the intro and faded tail.
  const LOOP_START=.12;
  const LOOP_END=Object.freeze({A:25.84356,B:21.935057,C:27.820635});
  const VOLUME=.30;
  class TankMusic{
    constructor(context,{fetcher=url=>fetch(url),random=Math.random}={}){
      this.context=context;this.fetcher=fetcher;this.random=random;this.buffers=new Map();
      this.source=null;this.mode=null;this.track=null;this.request=0;this.pending=null;
      this.battleRound=null;this.battleTrack=null;
      this.gain=context.createGain();this.gain.gain.value=VOLUME;this.gain.connect(context.destination);
    }
    load(track){
      if(!this.buffers.has(track)){
        const loading=Promise.resolve().then(()=>this.fetcher(tracks[track])).then(response=>{
          if(!response.ok)throw new Error('Music download failed');
          return response.arrayBuffer();
        }).then(data=>this.context.decodeAudioData(data)).catch(error=>{
          this.buffers.delete(track);throw error;
        });
        this.buffers.set(track,loading);
      }
      return this.buffers.get(track);
    }
    prepareBattle(roundKey){
      if(this.battleTrack===null||this.battleRound!==roundKey){
        this.battleRound=roundKey;this.battleTrack=this.random()<.5?'A':'C';
      }
      return this.load(this.battleTrack).catch(()=>false);
    }
    play(mode,roundKey='battle'){
      if(mode==='battle'&&(this.battleTrack===null||this.battleRound!==roundKey))this.prepareBattle(roundKey);
      const track=mode==='battle'?this.battleTrack:'B';
      if(track===this.track&&(this.source||this.pending))return this.pending||Promise.resolve(true);
      this.stop();this.mode=mode;this.track=track;
      const request=this.request;
      this.pending=this.load(track).then(buffer=>{
        // Mute, hiding the page or a phase change must cancel a delayed start.
        if(request!==this.request)return false;
        const source=this.context.createBufferSource();this.source=source;
        source.buffer=buffer;source.loop=true;
        source.loopStart=LOOP_START;source.loopEnd=LOOP_END[track];source.connect(this.gain);
        this.gain.gain.setValueAtTime(0,this.context.currentTime);
        this.gain.gain.linearRampToValueAtTime(VOLUME,this.context.currentTime+.25);
        source.start(this.context.currentTime,LOOP_START);this.pending=null;return true;
      }).catch(()=>{
        if(request===this.request)this.stop();
        // A missing file/decoder failure must not interrupt gameplay or effects.
        // A later audio/phase interaction can retry instead of a retry timer.
        return false;
      });
      return this.pending;
    }
    stop(){
      this.request++;this.pending=null;
      if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}
      this.mode=null;this.track=null;
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setValueAtTime(0,this.context.currentTime);
    }
  }
  TankMusic.tracks=tracks;TankMusic.loopStart=LOOP_START;TankMusic.loopEnd=LOOP_END;
  if(typeof module!=='undefined')module.exports=TankMusic;else root.TankMusic=TankMusic;
})(typeof globalThis!=='undefined'?globalThis:this);
