(function(root){
  'use strict';
  const skinOf=id=>FIELD.skins.find(s=>s.id===id)||FIELD.skins[0];
  function plate(ctx,id,x,y,w,h){
    const skin=skinOf(id);if(skin.pattern==='none')return;
    ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(7,h/3));ctx.clip();ctx.fillStyle=skin.accent;
    if(skin.pattern==='camo'){
      for(const [dx,dy,r]of [[.1,.2,.18],[.65,.8,.22],[.85,.1,.17],[.45,.4,.15]]){ctx.beginPath();ctx.ellipse(x+w*dx,y+h*dy,w*r,h*.22,-.5,0,Math.PI*2);ctx.fill();}
    }else if(skin.pattern==='stripe'){
      for(const dy of [.24,.62])ctx.fillRect(x,y+h*dy,w,h*.13);
    }else if(skin.pattern==='chevron'){
      for(const dx of [.25,.68]){ctx.beginPath();ctx.moveTo(x+w*(dx-.18),y);ctx.lineTo(x+w*dx,y+h*.5);ctx.lineTo(x+w*(dx-.18),y+h);ctx.lineTo(x+w*(dx-.04),y+h);ctx.lineTo(x+w*(dx+.14),y+h*.5);ctx.lineTo(x+w*(dx-.04),y);ctx.closePath();ctx.fill();}
    }else if(skin.pattern==='diamond'){
      for(const dx of [.18,.5,.82]){ctx.beginPath();ctx.moveTo(x+w*dx,y+h*.16);ctx.lineTo(x+w*(dx+.13),y+h*.5);ctx.lineTo(x+w*dx,y+h*.84);ctx.lineTo(x+w*(dx-.13),y+h*.5);ctx.closePath();ctx.fill();}
    }else if(skin.pattern==='circuit'){
      ctx.strokeStyle=skin.accent;ctx.lineWidth=Math.max(1.2,h*.055);ctx.lineJoin='round';
      for(const dy of [.25,.72]){ctx.beginPath();ctx.moveTo(x,y+h*dy);ctx.lineTo(x+w*.3,y+h*dy);ctx.lineTo(x+w*.45,y+h*(dy-.15));ctx.lineTo(x+w*.7,y+h*(dy-.15));ctx.lineTo(x+w*.82,y+h*dy);ctx.lineTo(x+w,y+h*dy);ctx.stroke();for(const dx of [.16,.88]){ctx.beginPath();ctx.arc(x+w*dx,y+h*dy,Math.max(1,h*.055),0,Math.PI*2);ctx.fill();}}
    }else{
      ctx.globalAlpha=.5;ctx.strokeStyle=skin.accent;ctx.lineWidth=1.3;
      for(let i=-h;i<w;i+=7){ctx.beginPath();ctx.moveTo(x+i,y);ctx.lineTo(x+i+h,y+h);ctx.stroke();}
    }
    ctx.restore();
  }
  function vehicleDetail(c,id,x=0,y=0){
    if(id!=='scout'&&id!=='heavy')return;
    c.save();c.translate(x,y);c.strokeStyle='#243d38';c.lineWidth=2;
    if(id==='scout'){c.beginPath();c.moveTo(-8,-5);c.lineTo(-15,-18);c.stroke();c.beginPath();c.arc(-15,-18,2,0,Math.PI*2);c.fillStyle='#fff1b0';c.fill();}
    else{c.fillStyle='#28483e';for(const y of [-10,8]){c.beginPath();c.roundRect(-10,y,23,4,2);c.fill();}}
    c.restore();
  }
  function draw(canvas,id,slot=0,width=560,vehicle='standard'){
    const c=canvas.getContext('2d'),skin=skinOf(id),body=skin.body||FIELD.palette[slot%4].body,ink='#253f39';
    canvas.width=width;canvas.height=Math.round(width*360/560);c.clearRect(0,0,canvas.width,canvas.height);c.scale(width/560,width/560);
    c.save();c.translate(265,190);c.scale(3.3,2.7);c.rotate(-.28);
    const box=(x,y,w,h,r,color,stroke=ink)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}};
    c.save();c.translate(3,13);c.scale(1,.5);c.beginPath();c.ellipse(0,0,38,27,0,0,Math.PI*2);c.fillStyle='#102a2960';c.fill();c.restore();
    for(const y of [-26,13]){box(-32,y,64,17,7,'#384b46');for(let x=-26;x<28;x+=9){box(x,y+2,7,12,2,'#6b7770');box(x+1,y+4,4,7,1,'#273b36',null);}}
    box(-29,-20,58,42,9,'#2d4940');box(-28,-24,56,42,9,body);plate(c,id,-27,-23,54,40);if(id!=='classic')box(-27,-17,4,25,1,FIELD.palette[slot%4].body);
    box(-23,-20,40,3,1,'#ffffff70',null);box(-23,10,44,4,2,'#18372f40',null);
    for(const y of [-17,9])box(23,y,5,7,2,'#fff1b0');
    box(-14,-22,33,30,8,'#26473b');box(6,-12,43,10,3,body);box(40,-15,10,16,3,'#263f3a');box(46,-11,4,8,1,'#728e81');
    box(-17,-27,34,31,8,body);plate(c,id,-16,-26,32,29);box(-11,-24,17,3,1,'#ffffff80',null);
    c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?3:7;c.lineTo(Math.cos(a)*r,Math.sin(a)*r-9);}c.closePath();c.fillStyle='#fff4cd';c.fill();
    vehicleDetail(c,vehicle,0,-9);c.restore();
  }
  function portrait(slot,id,vehicle='standard'){const art=document.createElement('span');art.className='tank-portrait skin-portrait';art.setAttribute('aria-hidden','true');art.setAttribute('data-skin',id);const canvas=document.createElement('canvas');draw(canvas,id,slot,160,vehicle);art.append(canvas);return art;}
  root.TankSkins={skinOf,plate,draw,portrait,vehicleDetail};
})(typeof globalThis!=='undefined'?globalThis:this);

