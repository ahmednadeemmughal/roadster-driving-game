/* ROADSTER STUNT RUN — self-contained side-view canvas game */
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var container=$("game-container"); if(!container)return;
var canvas=document.createElement("canvas"); canvas.id="roadster-scene";
Object.assign(canvas.style,{position:"absolute",inset:"0",width:"100%",height:"100%",display:"block",zIndex:"0",pointerEvents:"none"});
container.prepend(canvas);
var ctx=canvas.getContext("2d"); if(!ctx)return;
var ui={loading:$("loading-screen"),progress:$("loading-progress"),start:$("start-menu"),pause:$("pause-menu"),startBtn:$("start-button"),pauseBtn:$("pause-button"),resumeBtn:$("resume-button"),restartBtn:$("restart-button"),status:$("game-status"),speed:$("speed-value"),speedFill:$("speed-fill"),distance:$("distance-value"),best:$("best-speed-value"),boostFill:$("boost-fill"),boostValue:$("boost-value"),center:$("center-message")};
var S={running:false,paused:false,started:false,speed:0,maxSpeed:325,distance:0,bestSpeed:0,boost:100,boostHeld:false,brake:false,throttle:false,left:false,right:false,world:0,carX:0,carY:0,airborne:false,airTime:0,flip:0,jumpPower:0,cameraMode:0,cameraShake:0,particles:[],messageTimer:0,landingFlash:0,lastTime:0,stuntScore:0};
var W=320,H=500,DPR=1,keys={},rand=function(a,b){return a+Math.random()*(b-a);},clamp=function(v,a,b){return Math.max(a,Math.min(b,v));},lerp=function(a,b,t){return a+(b-a)*t;};
function resize(){var r=container.getBoundingClientRect();W=Math.max(320,r.width);H=Math.max(320,r.height);DPR=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);}
window.addEventListener("resize",resize,{passive:true});resize();
function msg(t,ms){if(!ui.center)return;ui.center.textContent=t;ui.center.classList.add("visible");S.messageTimer=(ms||1200)/1000;}
function start(){S.started=true;S.running=true;S.paused=false;ui.start&&ui.start.classList.add("hidden");ui.pause&&ui.pause.classList.add("hidden");if(ui.status)ui.status.textContent="THRUSTERS READY";msg("BUILD SPEED · HIT THE RAMP",1800);S.lastTime=performance.now();}
function pause(){if(!S.started)return;S.paused=true;S.running=false;ui.pause&&ui.pause.classList.remove("hidden");if(ui.status)ui.status.textContent="SESSION PAUSED";}
function resume(){S.paused=false;S.running=true;ui.pause&&ui.pause.classList.add("hidden");if(ui.status)ui.status.textContent="READY TO DRIVE";S.lastTime=performance.now();}
function reset(){S.speed=0;S.distance=0;S.boost=100;S.world=0;S.carX=0;S.carY=0;S.airborne=false;S.airTime=0;S.flip=0;S.jumpPower=0;S.particles=[];S.cameraShake=0;S.landingFlash=0;start();}
if(ui.startBtn)ui.startBtn.addEventListener("click",start);
if(ui.pauseBtn)ui.pauseBtn.addEventListener("click",function(){S.paused?resume():pause();});
if(ui.resumeBtn)ui.resumeBtn.addEventListener("click",resume);
if(ui.restartBtn)ui.restartBtn.addEventListener("click",reset);
window.addEventListener("keydown",function(e){var k=e.key.toLowerCase();keys[k]=true;if(["arrowup","arrowdown","arrowleft","arrowright"," "].indexOf(k)>=0)e.preventDefault();if((k==="p"||k==="escape")&&S.started)S.paused?resume():pause();if(k==="enter"&&!S.started)start();if(k==="r"&&S.started)reset();if(k==="c")S.cameraMode=(S.cameraMode+1)%3;});
window.addEventListener("keyup",function(e){keys[e.key.toLowerCase()]=false;});
function bind(id,p){var el=$(id);if(!el)return;var on=function(e){e.preventDefault();S[p]=true;el.classList.add("active");},off=function(e){if(e)e.preventDefault();S[p]=false;el.classList.remove("active");};el.addEventListener("pointerdown",on);["pointerup","pointercancel","pointerleave","lostpointercapture"].forEach(function(v){el.addEventListener(v,off);});el.addEventListener("contextmenu",function(e){e.preventDefault();});}
bind("accelerate-button","throttle");bind("brake-button","brake");bind("boost-button","boostHeld");bind("steer-left","left");bind("steer-right","right");
function poly(points,fill,stroke,lw){ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke();}}
function rr(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function rampY(x){var st=W*.50,en=W*1.20,base=H*.755,peak=H*.22;if(x<st||x>en)return base;var t=(x-st)/(en-st);return base-(base-peak)*Math.sin(t*Math.PI*.72);}
function background(){
var sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,"#050811");sky.addColorStop(.55,"#101e31");sky.addColorStop(1,"#080b12");ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
var glow=ctx.createRadialGradient(W*.53,H*.48,10,W*.53,H*.48,Math.max(W,H)*.68);glow.addColorStop(0,"rgba(53,105,157,.20)");glow.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
var horizon=H*.64;for(var i=0;i<34;i++){var bw=W/26+(i%4)*5,x=((i*97-S.world*.08)%(W+bw)+W+bw)%(W+bw)-bw,bh=H*(.07+((i*17)%9)/100);ctx.fillStyle=i%3===0?"#111d2b":"#0b1422";ctx.fillRect(x,horizon-bh,bw,bh);ctx.fillStyle="rgba(112,174,218,.22)";for(var wy=horizon-bh+8;wy<horizon-5;wy+=12)for(var wx=x+6;wx<x+bw-4;wx+=11)if(Math.floor(wx+wy+i)%3!==0)ctx.fillRect(wx,wy,2,3);}
poly([[0,H*.68],[W*.08,H*.52],[W*.18,H*.64],[W*.29,H*.48],[W*.42,H*.65],[W*.55,H*.51],[W*.69,H*.65],[W*.81,H*.50],[W,H*.65],[W,H],[0,H]],"#0a1420");
ctx.fillStyle="#111a25";ctx.fillRect(0,H*.72,W,H*.28);ctx.strokeStyle="rgba(102,151,190,.18)";for(var gx=-((S.world*.35)%80);gx<W;gx+=80){ctx.beginPath();ctx.moveTo(gx,H*.72);ctx.lineTo(gx-60,H);ctx.stroke();}
}
function drawRamp(){
var base=H*.755;ctx.beginPath();ctx.moveTo(-30,base);for(var x=-30;x<=W+40;x+=4)ctx.lineTo(x,rampY(x));ctx.lineTo(W+40,H*.84);ctx.lineTo(-30,H*.84);ctx.closePath();var g=ctx.createLinearGradient(0,H*.52,0,H*.84);g.addColorStop(0,"#657789");g.addColorStop(.28,"#263a4c");g.addColorStop(1,"#0d1722");ctx.fillStyle=g;ctx.fill();
ctx.beginPath();for(var rx=-30;rx<=W+40;rx+=4){if(rx===-30)ctx.moveTo(rx,rampY(rx));else ctx.lineTo(rx,rampY(rx));}ctx.strokeStyle="#b5e7ff";ctx.lineWidth=3;ctx.shadowColor="#4dbfff";ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0;
for(var lx=W*.5+20;lx<W*1.2;lx+=48){ctx.fillStyle="#7de4ff";ctx.shadowColor="#39baff";ctx.shadowBlur=10;ctx.fillRect(lx,rampY(lx)+7,16,3);ctx.shadowBlur=0;}
ctx.fillStyle="#b9ff76";ctx.font="800 "+Math.max(9,W*.009)+"px system-ui";ctx.fillText("STUNT LAUNCH",W*.51,base-18);
}
function otherCar(x,y,scale,color){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);poly([[-38,-12],[-27,-25],[4,-27],[22,-17],[37,-14],[43,-5],[40,0],[-38,0]],color,"#e0e8ef",1);poly([[-20,-23],[-7,-23],[3,-17],[-27,-17]],"#182838");poly([[1,-23],[15,-17],[7,-17],[-4,-23]],"#172b3c");for(var wx of [-24,24]){ctx.fillStyle="#05070b";ctx.beginPath();ctx.arc(wx,-2,8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#8c9baa";ctx.beginPath();ctx.arc(wx,-2,4,0,Math.PI*2);ctx.fill();}ctx.fillStyle="#ff394d";ctx.fillRect(34,-13,5,4);ctx.restore();}
function drawCars(){var base=H*.755,start=W*.67;for(var i=0;i<7;i++){var x=start+i*76-(S.world*.65%(W+600));if(x>-100&&x<W+100)otherCar(x,base-2,clamp(W/1100,.55,1),["#c9d1db","#697c8d","#e8e9e9","#9c1829"][i%4]);}}
function car(x,y,scale,angle){
ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle="rgba(0,0,0,.48)";ctx.beginPath();ctx.ellipse(0,3,70,12,0,0,Math.PI*2);ctx.fill();
rr(-58,-27,117,20,7,"#5b0d18","#e23a4b");
poly([[-68,-27],[-59,-43],[-39,-49],[-19,-66],[19,-66],[39,-54],[55,-45],[67,-41],[73,-29],[65,-20],[-58,-20]],"#e31932","#ff6675",1.5);
poly([[-48,-27],[43,-27],[58,-32],[49,-23],[-44,-23]],"#7b0d1c");
poly([[-28,-49],[-12,-62],[14,-61],[31,-49]],"#12273a","#83d9ff",1.3);poly([[-22,-49],[-11,-59],[-1,-59],[-1,-49]],"#31526b");poly([[2,-59],[13,-59],[27,-49],[2,-49]],"#183448");
ctx.strokeStyle="rgba(255,255,255,.55)";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(35,-43);ctx.lineTo(61,-37);ctx.stroke();
for(var wx of [-43,42]){ctx.fillStyle="#05070a";ctx.beginPath();ctx.arc(wx,-22,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#aeb9c5";ctx.lineWidth=3;ctx.beginPath();ctx.arc(wx,-22,8,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="#546574";ctx.lineWidth=1;for(var j=0;j<6;j++){var a=j*Math.PI/3;ctx.beginPath();ctx.moveTo(wx,-22);ctx.lineTo(wx+7*Math.cos(a),-22+7*Math.sin(a));ctx.stroke();}}
ctx.fillStyle="#d8f7ff";ctx.shadowColor="#b9f3ff";ctx.shadowBlur=12;ctx.fillRect(63,-38,7,3);ctx.shadowBlur=0;ctx.fillStyle="#ff263c";ctx.shadowColor="#ff2038";ctx.shadowBlur=10;ctx.fillRect(-65,-38,6,5);ctx.shadowBlur=0;
for(var ty of [-38,-29]){ctx.fillStyle="#1d2631";ctx.beginPath();ctx.ellipse(-66,ty+5,7,5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#7e9caf";ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(-66,ty+5,5,3.5,0,0,Math.PI*2);ctx.stroke();}
if((S.boostHeld||keys.shift||keys[" "])&&S.boost>0&&S.started&&!S.paused){for(var f=0;f<2;f++){var yy=-34+f*9,len=rand(22,55),fg=ctx.createLinearGradient(-66,yy,-66-len,yy);fg.addColorStop(0,"#fff8be");fg.addColorStop(.25,"#65edff");fg.addColorStop(1,"rgba(0,126,255,0)");poly([[-67,yy-3],[-67-len,yy],[-67,yy+3]],fg);ctx.fillStyle="rgba(95,215,255,.55)";ctx.beginPath();ctx.arc(-68-len*.35,yy,rand(2,5),0,Math.PI*2);ctx.fill();}if(Math.random()<.3)S.particles.push({x:x-68,y:y-32,vx:rand(-90,-30),vy:rand(-30,30),life:.35,max:.35,r:rand(2,5),smoke:true});}
ctx.restore();
}
function particles(dt){for(var i=S.particles.length-1;i>=0;i--){var p=S.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0){S.particles.splice(i,1);continue;}ctx.globalAlpha=clamp(p.life/p.max,0,1)*.55;ctx.fillStyle=p.smoke?"#8da0b3":"#5ce4ff";ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+(1-p.life/p.max)),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
function update(dt){
var throttle=S.throttle||keys.arrowup||keys.w,brake=S.brake||keys.arrowdown||keys.s,left=S.left||keys.arrowleft||keys.a,right=S.right||keys.arrowright||keys.d,boost=(S.boostHeld||keys.shift||keys[" "])&&S.boost>0;
if(throttle)S.speed+=110*dt;else S.speed-=13*dt;if(brake)S.speed-=170*dt;if(boost){S.speed+=260*dt;S.boost=Math.max(0,S.boost-31*dt);}else S.boost=Math.min(100,S.boost+8*dt);
S.speed=clamp(S.speed,0,S.maxSpeed);S.carX=clamp(S.carX+((left?-1:0)+(right?1:0))*dt*200,-W*.22,W*.22);if(S.speed>0)S.distance+=S.speed/3.6*dt;S.world+=S.speed*dt*.45;S.bestSpeed=Math.max(S.bestSpeed,S.speed);
var phase=S.world%(W*3.8);if(!S.airborne&&phase>W*1.55&&phase<W*1.55+S.speed*dt*.6&&S.speed>115){S.airborne=true;S.airTime=0;S.flip=0;S.jumpPower=clamp(S.speed/230,.5,1.25);msg("STUNT LAUNCH!",900);}
if(S.airborne){S.airTime+=dt;var airtime=1.65+S.jumpPower*.8;if(boost)S.flip+=dt*5.2;else S.flip+=dt*.9;S.carY=-Math.sin(Math.min(1,S.airTime/airtime)*Math.PI)*H*.24*S.jumpPower;if(S.airTime>airtime){S.airborne=false;S.carY=0;var turns=Math.floor(S.flip/(Math.PI*2));if(turns>0){S.stuntScore+=turns*1000;msg(turns+"× 360° FLIP · +"+(turns*1000),1500);}else msg("CLEAN LANDING",900);S.landingFlash=.6;}}
else S.carY=lerp(S.carY,0,Math.min(1,dt*8));
S.cameraShake=Math.max(0,S.cameraShake-dt*2.5);S.landingFlash=Math.max(0,S.landingFlash-dt);if(S.messageTimer>0){S.messageTimer-=dt;if(S.messageTimer<=0&&ui.center)ui.center.classList.remove("visible");}
if(ui.speed)ui.speed.textContent=String(Math.round(S.speed)).padStart(2,"0");if(ui.speedFill)ui.speedFill.style.width=(S.speed/S.maxSpeed*100)+"%";if(ui.distance)ui.distance.textContent=S.distance<1000?String(Math.round(S.distance)):(S.distance/1000).toFixed(2);if(ui.best)ui.best.textContent=String(Math.round(S.bestSpeed));if(ui.boostFill)ui.boostFill.style.width=S.boost+"%";if(ui.boostValue)ui.boostValue.textContent=boost?"THRUSTERS ON":"BOOST";if(ui.status&&S.started&&!S.paused)ui.status.textContent=S.airborne?"AERIAL STUNT":boost?"THRUSTERS ENGAGED":"READY TO DRIVE";
}
function render(dt){
ctx.save();if(S.cameraShake>0)ctx.translate(rand(-4,4)*S.cameraShake,rand(-3,3)*S.cameraShake);background();drawRamp();drawCars();
var x=W*.28+S.carX*.12;if(S.cameraMode===1)x=W*.42+S.carX*.1;if(S.cameraMode===2)x=W*.22+S.carX*.12;var y=H*.755-12+S.carY,angle=S.airborne?S.flip:0;
if(S.airborne){ctx.strokeStyle="rgba(96,207,255,.35)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,H*.755-20);ctx.quadraticCurveTo(x+50,H*.755-100,x+95,y+15);ctx.stroke();}
car(x,y,clamp(W/1000,.62,1.15),angle);if(S.started&&S.speed>30&&!S.airborne&&Math.random()<.18)S.particles.push({x:x-60,y:y-22,vx:rand(-35,-8),vy:rand(-10,12),life:.45,max:.45,r:rand(2,4),smoke:true});particles(dt);
if(S.landingFlash>0){ctx.fillStyle="rgba(115,224,255,"+(S.landingFlash*.14)+")";ctx.fillRect(0,0,W,H);}if(S.speed>100&&!S.airborne){ctx.strokeStyle="rgba(127,211,255,"+((S.speed-100)/900)+")";for(var i=0;i<10;i++){var sx=(i*W/10+S.world*2)%(W+80)-40,sy=H*.78+(i%4)*13;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-25-S.speed*.12,sy);ctx.stroke();}}ctx.restore();
}
function frame(now){var dt=clamp((now-S.lastTime)/1000||0,0,.04);S.lastTime=now;if(S.running&&!S.paused)update(dt);render(dt);requestAnimationFrame(frame);}
if(ui.progress)ui.progress.style.width="100%";if(ui.loading){ui.loading.classList.add("hidden");ui.loading.style.display="none";}
S.lastTime=performance.now();requestAnimationFrame(frame);
window.addEventListener("blur",function(){S.throttle=S.brake=S.boostHeld=S.left=S.right=false;});
})();
