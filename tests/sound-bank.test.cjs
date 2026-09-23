'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const SoundBank=require('../sound-bank.js');
function context(){
  const nodes=[],starts=[];
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t]);},linearRampToValueAtTime(v,t){this.events.push([v,t]);},setTargetAtTime(v,t){this.events.push([v,t]);},cancelScheduledValues(){this.events=[];}});
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const ac={currentTime:0,destination:{},decodeAudioData:async()=>({duration:11}),
    createGain:()=>({...node(),gain:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
    createStereoPanner:()=>({...node(),pan:param()}),
    createBufferSource(){return {...node(),playbackRate:{value:1},start(...args){starts.push(args);},stop(when){if(when===undefined)this.cancelled=true;}};}};
  return {ac,nodes,starts};
}
const success=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});

test('sound bank fetches/decode once, uses sprite ranges, and never replays sounds queued during loading',async()=>{
  const {ac,starts}=context();let requests=0,resolve;
  const bank=new SoundBank(ac,()=>{requests++;return new Promise(r=>resolve=r);});
  assert.equal(bank.play('explosion'),false);await Promise.resolve();
  resolve(await success());assert.equal(await bank.ready,true);assert.equal(requests,1);assert.equal(starts.length,0);
  assert.equal(bank.play('explosion'),true);assert.deepEqual(starts[0],[0,SoundBank.clips.explosion.start,SoundBank.clips.explosion.duration]);
  assert.equal(bank.play('missing'),false);assert.equal(requests,1);
});

test('failed downloads and decoding leave graceful fallback available',async()=>{
  for(const broken of [async()=>({ok:false}),async()=>{throw Error('offline');}]){
    const {ac}=context(),bank=new SoundBank(ac,broken);assert.equal(await bank.ready,false);assert.equal(bank.play('shot'),false);
  }
  const {ac}=context();ac.decodeAudioData=async()=>{throw Error('decode');};const bank=new SoundBank(ac,success);assert.equal(await bank.ready,false);assert.equal(bank.play('start'),false);
});

test('sample voice budget preserves high-priority cues; stop cancels every voice and resets ducking',async()=>{
  const {ac}=context(),bank=new SoundBank(ac,success);await bank.ready;
  bank.play('win',{priority:3,channel:'cue',duck:true});const win=[...bank.voices][0];
  for(let i=0;i<40;i++)bank.play('shot',{priority:1});
  assert.equal(bank.voices.size,12);assert(bank.voices.has(win));assert.equal(bank.combat.gain.events[0][0],.35);
  const voices=[...bank.voices];bank.stop();assert.equal(bank.voices.size,0);assert.equal(bank.combat.gain.value,1);
  assert(voices.every(v=>v.source.cancelled&&v.gain.gain.value===0));
  for(let i=0;i<12;i++)bank.play('win',{priority:3});const before=[...bank.voices];
  assert.equal(bank.play('ricochet',{priority:0}),true,'dropped effects are handled, so no fallback bypasses the voice cap');assert.deepEqual([...bank.voices],before);
});

test('rate limits group paired shots and effect bursts while separating different players',async()=>{
  const {ac,starts}=context(),bank=new SoundBank(ac,success);await bank.ready;
  bank.play('double',{interval:.12,key:'shot:a'});bank.play('double',{interval:.12,key:'shot:a'});bank.play('double',{interval:.12,key:'shot:b'});assert.equal(starts.length,2);
  ac.currentTime=.42;bank.play('double',{interval:.12,key:'shot:a'});assert.equal(starts.length,3);
  for(let i=0;i<100;i++)bank.play('ricochet',{key:'new:'+i});assert(bank.lastPlayed.size<=64);
});

test('panning is bounded and ordinary endings release sample nodes',async()=>{
  const {ac}=context(),bank=new SoundBank(ac,success);await bank.ready;bank.play('laser',{pan:2});
  const voice=[...bank.voices][0];assert.equal(voice.pan.pan.value,.55);voice.source.onended();assert.equal(bank.voices.size,0);assert(voice.gain.disconnected);assert(voice.source.disconnected);
  delete ac.createStereoPanner;assert.doesNotThrow(()=>bank.play('laser',{pan:-1}));
});

test('every selected effect is present in the shipped audio asset and manifests',()=>{
  const file=path.join(__dirname,'..',SoundBank.asset);assert(fs.statSync(file).size>100000);
  for(const name of ['menu','start','shot','double','machine','machine-fire','laser','ricochet','intercept','hit','explosion','immortal','restore','speed','win','lose']){
    const clip=SoundBank.clips[name];assert(clip.start>=0&&clip.duration>0&&clip.start+clip.duration<=10.84);
  }
});
