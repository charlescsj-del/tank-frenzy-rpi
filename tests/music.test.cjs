'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Music=require('../music.js');
function context(){
  const sources=[],downloads=[],decoded=[];
  const ac={currentTime:0,destination:{},createGain:()=>({connect(){},gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}}}),
    async decodeAudioData(data){decoded.push(data);return {data,duration:{[Music.tracks.A]:27.91,[Music.tracks.B]:24.02,[Music.tracks.C]:29.89}[data]};},
    createBufferSource(){const source={connect(){},disconnect(){this.disconnected=true;},start(...args){this.started=true;this.startArgs=args;},stop(){this.stopped=true;}};sources.push(source);return source;}};
  const fetcher=async url=>{downloads.push(url);return {ok:true,arrayBuffer:async()=>url};};
  return {ac,sources,downloads,decoded,fetcher};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
test('B plays before battle, caches its MP3, and loops without its faded tail',async()=>{
  const c=context(),music=new Music(c.ac,{fetcher:c.fetcher});
  const first=music.play('lobby');assert.equal(music.play('lobby'),first,'pending requests are shared');
  assert.equal(await first,true);await music.play('lobby');
  assert.deepEqual(c.downloads,[Music.tracks.B]);assert.equal(c.sources.length,1);assert(c.sources[0].loop);
  assert.equal(music.gain.gain.value,.30);
  assert.equal(c.sources[0].loopStart,.12);
  assert.equal(c.sources[0].loopEnd,Music.loopEnd.B);
  assert.deepEqual(c.sources[0].startArgs,[0,.12]);
  assert(c.sources[0].loopEnd<c.sources[0].buffer.duration-1.5,'loop excludes the recorded fade-out');
  music.stop();assert(c.sources[0].stopped&&c.sources[0].disconnected);assert.equal(music.gain.gain.value,0);
  await music.play('lobby');assert.equal(c.downloads.length,1);assert.equal(c.decoded.length,1);
  music.stop();music.stop();assert.equal(c.sources.filter(s=>!s.stopped).length,0);
});
test('A/C are chosen once per battle, retained across mute/return, with a three-track cache',async()=>{
  const c=context();let choices=0;
  const music=new Music(c.ac,{fetcher:c.fetcher,random:()=>choices++%2?.9:.1});
  await music.play('lobby');await music.play('battle','ROOM:1');assert.equal(music.track,'A');
  await music.play('battle','ROOM:1');music.stop();await music.play('battle','ROOM:1');
  assert.equal(music.track,'A');assert.equal(choices,1);
  await music.play('lobby');await music.play('battle','ROOM:2');assert.equal(music.track,'C');assert.equal(choices,2);
  await music.play('battle','OTHER:2');assert.equal(music.track,'A');assert.equal(choices,3);
  assert.deepEqual(c.downloads,[Music.tracks.B,Music.tracks.A,Music.tracks.C]);assert.equal(c.decoded.length,3);
  assert.equal(music.buffers.size,3);assert.equal(c.sources.filter(s=>!s.stopped).length,1);
  for(const source of c.sources){assert.equal(source.loopStart,Music.loopStart);assert(source.loopEnd<source.buffer.duration-1.5);}
});
test('countdown preloads the battle selection without changing lobby music or choosing twice',async()=>{
  const c=context();let choices=0;
  const music=new Music(c.ac,{fetcher:c.fetcher,random:()=>{choices++;return .8;}});
  await music.play('lobby');await music.prepareBattle('ROOM:5');await music.prepareBattle('ROOM:5');
  assert.equal(music.track,'B');assert.equal(c.sources.length,1);assert.equal(choices,1);
  assert.deepEqual(c.downloads,[Music.tracks.B,Music.tracks.C]);
  await music.play('battle','ROOM:5');assert.equal(music.track,'C');assert.equal(c.downloads.length,2);
  assert.equal(choices,1);assert.equal(c.sources[1].loopEnd,Music.loopEnd.C);
});
test('random selection may repeat on consecutive rounds without restarting the same track',async()=>{
  const c=context();let choices=0;
  const music=new Music(c.ac,{fetcher:c.fetcher,random:()=>{choices++;return .5;}});
  await music.play('battle','one');await music.play('battle','two');
  assert.equal(music.track,'C');assert.equal(choices,2);assert.equal(c.sources.length,1);
});
test('mute during downloading prevents any delayed playback; resume reuses the download',async()=>{
  const c=context(),gate=deferred();let downloads=0;
  const music=new Music(c.ac,{fetcher:()=>{downloads++;return gate.promise;}});
  const loading=music.play('lobby');music.stop();
  gate.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  assert.equal(await loading,false);assert.equal(c.sources.length,0);
  await music.play('lobby');assert.equal(downloads,1);assert.equal(c.sources.length,1);
});
test('mute during decoding prevents late starts, even if playback was requested again',async()=>{
  const c=context(),gate=deferred();c.ac.decodeAudioData=()=>gate.promise;
  const music=new Music(c.ac,{fetcher:c.fetcher});
  const stale=music.play('lobby');await new Promise(setImmediate);music.stop();const current=music.play('lobby');
  gate.resolve({});assert.equal(await stale,false);assert.equal(await current,true);
  assert.equal(c.downloads.length,1);assert.equal(c.sources.length,1);
});
test('a slow lobby download cannot replace the battle song',async()=>{
  const c=context(),gate=deferred();
  const music=new Music(c.ac,{random:()=>0,fetcher:url=>url===Music.tracks.B?gate.promise:c.fetcher(url)});
  const lobby=music.play('lobby');await music.play('battle','ROOM:1');
  gate.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  assert.equal(await lobby,false);assert.equal(music.track,'A');assert.equal(c.sources.length,1);
});
test('HTTP, network and decode failures are contained and can retry on a later interaction',async()=>{
  for(const failure of ['http','network','decode']){
    const c=context();let attempts=0;
    const decode=c.ac.decodeAudioData;c.ac.decodeAudioData=async data=>{if(failure==='decode'&&attempts===1)throw Error('decode');return decode(data);};
    const music=new Music(c.ac,{fetcher:url=>{
      attempts++;
      if(attempts===1&&failure==='http')return Promise.resolve({ok:false});
      if(attempts===1&&failure==='network')return Promise.reject(Error('offline'));
      return c.fetcher(url);
    }});
    assert.equal(await music.play('lobby'),false);assert.equal(c.sources.length,0);assert.equal(music.buffers.size,0);
    assert.equal(await music.play('lobby'),true);assert.equal(attempts,2);assert.equal(c.sources.length,1);
  }
});
