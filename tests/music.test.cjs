'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Music=require('../music.js');
function context(){
  let allocations=0;const sources=[];
  const ac={currentTime:0,destination:{},createGain:()=>({connect(){},gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}}}),
    createBuffer(channels,length,rate){allocations++;const data=new Float32Array(length);return {duration:length/rate,length,sampleRate:rate,getChannelData:()=>data};},
    createBufferSource(){const source={connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;}};
  return {ac,sources,allocations:()=>allocations};
}
test('original lobby and battle music is bounded, non-silent and lower than effects',()=>{
  const c=context();let previous;
  for(const mode of ['lobby','battle']){
    const buffer=Music.compose(c.ac,mode),samples=buffer.getChannelData(0);let peak=0,energy=0;
    for(const value of samples){assert(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    assert(peak>.1&&peak<=.551);assert(energy/samples.length>.001);assert(buffer.duration>=30&&buffer.duration<35);
    assert(Math.abs(samples[0]-samples.at(-1))<.01,'loop boundary has no amplitude jump');
    if(previous){assert(buffer.duration<previous.duration,'battle arrangement has a faster tempo');assert((buffer.length+previous.length)*4<6*1024*1024,'two tracks stay below six MiB');}previous=buffer;
  }
  const music=new Music(c.ac);music.play('lobby');assert(music.gain.gain.value<=.10);
});

test('battle arrangement is deterministic and develops across its four phrases',()=>{
  const c=context(),a=Music.compose(c.ac,'battle').getChannelData(0),b=Music.compose(c.ac,'battle').getChannelData(0);
  const {createHash}=require('node:crypto'),hash=data=>createHash('sha256').update(Buffer.from(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
  assert.equal(hash(a),hash(b),'procedural percussion uses a stable seed');
  const phrases=Array.from({length:4},(_,i)=>hash(a.subarray(Math.floor(a.length*i/4),Math.floor(a.length*(i+1)/4))));
  assert.equal(new Set(phrases).size,4,'the four sections are not a repeated one-bar loop');
});
test('music maintains one looping source, caches both tracks, and stops immediately',()=>{
  const c=context(),music=new Music(c.ac);music.play('lobby');music.play('lobby');assert.equal(c.sources.length,1);assert(c.sources[0].loop);
  music.play('battle');assert(c.sources[0].stopped&&c.sources[0].disconnected);assert.equal(c.sources.length,2);
  music.stop();assert(c.sources[1].stopped);assert.equal(music.source,null);assert.equal(music.gain.gain.value,0);
  music.play('lobby');assert.equal(c.allocations(),2,'buffers reused when returning to splash screen');assert.equal(c.sources.length,3);
  music.stop();music.stop();assert.equal(c.sources.filter(s=>!s.stopped).length,0);
});
