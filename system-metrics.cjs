'use strict';
const os=require('node:os'),fs=require('node:fs');
const percent=(used,total)=>total>0?Math.round(Math.max(0,Math.min(100,used/total*100))*10)/10:null;
const safe=read=>{try{return read();}catch{return null;}};
function cpuTotals(cpus){
  if(!Array.isArray(cpus)||!cpus.length)return null;
  let idle=0,total=0;
  for(const cpu of cpus){
    const times=cpu.times;if(!times)return null;
    for(const key of ['user','nice','sys','idle','irq']){
      if(!Number.isFinite(times[key])||times[key]<0)return null;
      total+=times[key];
    }
    idle+=times.idle;
  }
  return {idle,total,cores:cpus.length};
}
function memoryInfo(system,readFile){
  const info=safe(()=>readFile('/proc/meminfo','utf8'))||'';
  const value=key=>{const match=new RegExp('^'+key+':\\s+(\\d+) kB','m').exec(info);return match?Number(match[1])*1024:null;};
  const procTotal=value('MemTotal'),available=value('MemAvailable');
  const hasAvailable=procTotal>0&&Number.isFinite(available);
  const total=hasAvailable?procTotal:safe(()=>system.totalmem()),free=hasAvailable?available:safe(()=>system.freemem());
  if(!(total>0)||!Number.isFinite(free)||free<0)return {totalBytes:null,availableBytes:null,usedBytes:null,usedPercent:null,basis:null};
  const availableBytes=Math.min(total,free),usedBytes=total-availableBytes;
  return {totalBytes:total,availableBytes,usedBytes,usedPercent:percent(usedBytes,total),basis:hasAvailable?'available':'free'};
}
// Read only while an admin is watching; share each one-second sample across viewers.
function createMetrics({system=os,runtime=process,readFile=fs.readFileSync,now=Date.now}={}){
  let previous=null,cached=null;
  return function sample(){
    const at=now(),elapsed=previous?at-previous.at:0;
    if(cached&&elapsed>=0&&elapsed<1000)return cached;
    const cpus=cpuTotals(safe(()=>system.cpus())),usage=safe(()=>runtime.cpuUsage());
    let cpuPercent=null,gameCpuPercent=null;
    // Re-prime after a gap instead of labelling a long unattended average as current.
    if(previous&&elapsed>=1000&&elapsed<=5000){
      if(cpus&&previous.cpus&&cpus.cores===previous.cpus.cores){
        const total=cpus.total-previous.cpus.total,idle=cpus.idle-previous.cpus.idle;
        if(total>0&&idle>=0&&idle<=total)cpuPercent=percent(total-idle,total);
      }
      if(usage&&previous.usage){
        const micros=usage.user+usage.system-previous.usage.user-previous.usage.system;
        if(Number.isFinite(micros)&&micros>=0)gameCpuPercent=Math.round(micros/elapsed)/10;
      }
    }
    const load=safe(()=>system.platform()==='win32'?null:system.loadavg());
    const rss=safe(()=>runtime.memoryUsage().rss);
    cached={sampledAt:at,cores:cpus?.cores??null,cpuPercent,memory:memoryInfo(system,readFile),
      load:[0,1,2].map(i=>Number.isFinite(load?.[i])&&load[i]>=0?Math.round(load[i]*100)/100:null),
      game:{cpuPercent:gameCpuPercent,rssBytes:Number.isFinite(rss)&&rss>=0?rss:null}};
    previous={at,cpus,usage};return cached;
  };
}
module.exports={createMetrics};
