'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const SoundBank=require('../sound-bank.js');
function context(){
  const nodes=[],starts=[],sources=[];
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t]);},linearRampToValueAtTime(v,t){this.events.push([v,t]);},setTargetAtTime(v,t){this.events.push([v,t]);},cancelScheduledValues(){this.events=[];}});
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const ac={currentTime:0,destination:{},decodeAudioData:async asset=>({duration:11,asset}),
    createGain:()=>({...node(),gain:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
    createStereoPanner:()=>({...node(),pan:param()}),
    createBufferSource(){const source={...node(),playbackRate:{value:1},start(...args){starts.push(args);},stop(when){if(when===undefined)this.cancelled=true;}};sources.push(source);return source;}};
  return {ac,nodes,starts,sources};
}
const success=async asset=>({ok:true,arrayBuffer:async()=>asset});

test('sound bank decodes approved recordings once, uses their ranges, and never replays sounds queued during loading',async()=>{
  const {ac,starts,sources}=context(),requests=[];let resolve;
  const bank=new SoundBank(ac,asset=>{requests.push(asset);return asset===SoundBank.asset?new Promise(r=>resolve=r):success(asset);});
  assert.equal(bank.play('explosion'),false);await Promise.resolve();
  resolve(await success(SoundBank.asset));assert.equal(await bank.ready,true);assert.equal(requests.length,7);assert.equal(new Set(requests).size,7);assert.equal(starts.length,0);
  assert.equal(bank.play('explosion'),true);assert.deepEqual(starts[0],[0,SoundBank.clips.explosion.start,SoundBank.clips.explosion.duration]);
  assert.equal(sources[0].buffer.asset,SoundBank.approvedAssets.explosion);
  bank.play('shot');bank.play('machine-fire');
  assert.equal(sources[1].buffer.asset,SoundBank.approvedAssets.shot);
  assert.equal(sources[2].buffer.asset,SoundBank.approvedAssets.shot);
  assert.equal(bank.play('missing'),false);assert.equal(requests.length,7);
  for(const [name,offset] of [['countdown3',0],['countdown2',.3],['countdown1',.6]]){
    bank.play(name);assert.equal(starts.at(-1)[1],offset);
    assert.equal(sources.at(-1).buffer.asset,SoundBank.approvedAssets.countdown3);
  }
  bank.play('start');assert.equal(sources.at(-1).buffer.asset,SoundBank.approvedAssets.start);
  assert.notEqual(SoundBank.approvedAssets.start,SoundBank.approvedAssets.countdown3);
});

test('failed downloads and decoding leave graceful fallback available',async()=>{
  for(const broken of [async()=>({ok:false}),async()=>{throw Error('offline');}]){
    const {ac}=context(),bank=new SoundBank(ac,broken);assert.equal(await bank.ready,false);assert.equal(bank.play('shot'),false);
  }
  const {ac}=context();ac.decodeAudioData=async()=>{throw Error('decode');};const bank=new SoundBank(ac,success);assert.equal(await bank.ready,false);assert.equal(bank.play('start'),false);
});

test('a failed selected recording falls back to its prior cue without hiding other approved sounds',async()=>{
  const {ac,sources,starts}=context();
  const bank=new SoundBank(ac,asset=>asset===SoundBank.approvedAssets.explosion?Promise.resolve({ok:false}):success(asset));
  assert.equal(await bank.ready,false);
  assert.equal(bank.play('explosion'),true);assert.equal(sources[0].buffer.asset,SoundBank.asset);
  assert.equal(starts[0][1],SoundBank.legacyClips.explosion.start);
  bank.play('ricochet');assert.equal(sources[1].buffer.asset,SoundBank.approvedAssets.ricochet);
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
    const clip=SoundBank.legacyClips[name];assert(clip.start>=0&&clip.duration>0&&clip.start+clip.duration<=10.84);
  }
  for(const asset of new Set(Object.values(SoundBank.approvedAssets))){
    const mp3=fs.readFileSync(path.join(__dirname,'..',asset));
    assert(mp3.subarray(0,3).equals(Buffer.from('ID3')));assert(mp3.length>5000&&mp3.length<30000);
  }
  for(const name of Object.keys(SoundBank.approvedAssets)){
    const clip=SoundBank.clips[name];assert(clip.start>=0&&clip.start<=.6);assert(clip.duration>.1&&clip.duration<1.3);
  }
});
