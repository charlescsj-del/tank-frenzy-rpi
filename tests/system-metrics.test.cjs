'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createMetrics}=require('../system-metrics.cjs');
const GiB=1073741824;
function fixture(){
  const state={at:1000,cores:4,idle:3000,user:1000,processUser:50000,reads:0,mem:'MemTotal:       4194304 kB\nMemAvailable:   3145728 kB\nMemFree:         524288 kB\n'};
  const system={cpus:()=>Array.from({length:state.cores},()=>({times:{idle:state.idle,user:state.user,nice:0,sys:0,irq:0}})),totalmem:()=>4*GiB,freemem:()=>GiB/2,loadavg:()=>[6.123,3,1],platform:()=> 'linux'};
  const runtime={cpuUsage:()=>({user:state.processUser,system:0}),memoryUsage:()=>({rss:64*1048576})};
  const sample=createMetrics({system,runtime,now:()=>state.at,readFile:()=>{state.reads++;return state.mem;}});
  return {state,system,runtime,sample};
}
test('whole-host CPU uses all cores, game CPU uses one core, and all viewers share a one-second sample',()=>{
  const {state,sample}=fixture(),first=sample();
  assert.equal(first.cpuPercent,null);assert.equal(first.game.cpuPercent,null);assert.equal(first.cores,4);
  state.at+=500;assert.equal(sample(),first);assert.equal(state.reads,1);
  state.at+=500;state.idle+=750;state.user+=250;state.processUser+=200000;
  const second=sample();assert.equal(second.cpuPercent,25);assert.equal(second.game.cpuPercent,20);
  assert.deepEqual(second.load,[6.12,3,1],'high load is not capped to core count');assert.equal(second.game.rssBytes,64*1048576);
  assert.equal(sample(),second);assert.equal(state.reads,2);
});
test('Linux used memory excludes available cache; fallback explicitly reports its different basis',()=>{
  const {state,sample}=fixture();
  assert.deepEqual(sample().memory,{totalBytes:4*GiB,availableBytes:3*GiB,usedBytes:GiB,usedPercent:25,basis:'available'});
  state.mem='';state.at+=1000;
  assert.deepEqual(sample().memory,{totalBytes:4*GiB,availableBytes:GiB/2,usedBytes:3.5*GiB,usedPercent:87.5,basis:'free'});
});
test('long gaps, counter resets and CPU count changes re-prime instead of inventing usage',()=>{
  const {state,sample}=fixture();sample();state.at+=6000;state.idle+=1000;state.user+=1000;
  assert.equal(sample().cpuPercent,null);state.at+=1000;state.idle+=500;state.user+=500;assert.equal(sample().cpuPercent,50);
  state.at+=1000;state.cores=2;assert.equal(sample().cpuPercent,null);
  state.at+=1000;state.idle=0;state.user=0;state.processUser=0;
  const reset=sample();assert.equal(reset.cpuPercent,null);assert.equal(reset.game.cpuPercent,null);
});
test('missing host information is unavailable, not zero or non-finite JSON',()=>{
  const {system,runtime,sample}=fixture();
  system.cpus=()=>[];system.totalmem=()=>0;system.freemem=()=>0;system.platform=()=> 'win32';
  runtime.memoryUsage=()=>{throw Error('unavailable')};
  const read=createMetrics({system,runtime,readFile:()=>{throw Error('no proc')},now:()=>1000});
  const data=read();assert.equal(data.cores,null);assert.equal(data.cpuPercent,null);assert.equal(data.memory.usedPercent,null);
  assert.deepEqual(data.load,[null,null,null]);assert.equal(data.game.rssBytes,null);assert(!JSON.stringify(data).includes('NaN'));
  assert.equal(sample().cores,null);
});
