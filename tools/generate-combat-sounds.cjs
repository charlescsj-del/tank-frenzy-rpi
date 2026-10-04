// Original designed effects, not field recordings. Requires ffmpeg; no runtime dependency.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),rate=44100;
function encode(name,samples){
  const peak=samples.reduce((p,x)=>Math.max(p,Math.abs(x)),0),pcm=Buffer.alloc(samples.length*2);
  samples.forEach((x,i)=>pcm.writeInt16LE(Math.round(x/Math.max(1,peak)*.78*32767),i*2));
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar',String(rate),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1',path.join(root,name)],{input:pcm});
  if(result.status!==0)throw Error(result.stderr?.toString()||result.error);
  console.log(name, samples.length/rate+'s');
}
for(const [name,duration,shot]of [['fire',.68,true],['hit',.46,false]]){
  let seed=314,low=0,bass=0;const samples=[];
  for(let i=0;i<rate*duration;i++){
    const t=i/rate;seed=(1664525*seed+1013904223)>>>0;const n=seed/2147483648-1;
    low+=.15*(n-low);bass+=.026*(n-bass);
    const attack=1-Math.exp(-t/.0008),fade=Math.min(1,(duration-t)/.04);
    // Cannon: pressure crack, low blast, outdoor diffuse tail and breech recoil.
    // Armour: abrupt contact, short resonances and loose mechanical debris.
    let x=shot?1.6*n*Math.exp(-t/.009)+3.8*low*Math.exp(-t/.085)+5*bass*Math.exp(-t/.18)
      +.45*Math.sin(2*Math.PI*(61*t+.9*(1-Math.exp(-t/.022))))*Math.exp(-t/.09)
      :1.5*n*Math.exp(-t/.005)+3.5*low*Math.exp(-t/.028)+.55*Math.sin(2*Math.PI*94*t)*Math.exp(-t/.047)
      +.15*Math.sin(2*Math.PI*431*t)*Math.exp(-t/.025)+.09*Math.sin(2*Math.PI*713*t)*Math.exp(-t/.017);
    const delay=shot?.105:.065,tail=Math.max(0,t-delay);
    if(t>delay)x+=(shot?.7:.45)*low*Math.exp(-tail/(shot?.12:.075));
    samples.push(Math.tanh(x)*attack*fade);
  }
  encode('audio/effects-'+name+'-v4.mp3',samples);
}
// A portable movement audition generated from the exact in-game loop recipe.
const code=fs.readFileSync(path.join(root,'client.js'),'utf8');
const source=code.slice(code.indexOf('function movementWave('),code.indexOf('function audioUnavailable('));
const wave=vm.runInNewContext(source+';movementWave');
const motor=wave(rate),tracks=wave(rate,true),preview=[];let m=0,r=0,filtered=0;
for(let i=0;i<rate*5;i++){
  const t=i/rate,throttle=Math.min(1,t/2),fade=Math.min(1,t/.12,(5-t)/.2);
  m+=.72+throttle*.38;r+=.35+throttle*1.05;
  filtered+=.22*(motor[Math.floor(m)%motor.length]+tracks[Math.floor(r)%tracks.length]-filtered);
  preview.push(filtered*fade);
}
fs.mkdirSync(path.join(root,'tools/previews'),{recursive:true});
encode('tools/previews/movement-v4.mp3',preview);
