import * as T from 'three';
import {loadCharacter} from './avatar-rig.js';
import {createItem,createCat,buildEnvironment,createPodium} from './props.js';

// V2 keeps the original Three.js scene/group loop, five-level progression,
// five lives, nearest-cat aiming, joystick and keyboard input.
const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp;
const scene=new T.Scene();scene.background=new T.Color('#d6e2d5');
const camera=new T.PerspectiveCamera(46,innerWidth/innerHeight,.08,110);
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.prepend(renderer.domElement);
scene.add(new T.HemisphereLight('#fff7e4','#758d6d',2.0));
const sun=new T.DirectionalLight('#fff0cf',2.5);sun.position.set(-7,12,8);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-19;
sun.shadow.camera.right=sun.shadow.camera.top=19;sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;
scene.add(sun);scene.add(sun.target);
const world=new T.Group(),preview=new T.Group(),player=new T.Group();scene.add(world,preview,player);
preview.add(createPodium());world.visible=false;player.visible=false;
const previews={sausage:createItem('sausage'),plane:createItem('plane')};
for(const [key,p] of Object.entries(previews)){p.visible=false;p.position.y=.90;p.scale.setScalar(key==='plane'?1.65:2.15);preview.add(p);}

const levels=[
  {name:'Солнечный двор',need:8,rate:2.2,speed:1.8,cap:7,color:'#d7e7d6'},
  {name:'Городская улица',need:12,rate:1.8,speed:2.2,cap:9,color:'#d5e3e8'},
  {name:'Зелёная аллея',need:16,rate:1.5,speed:2.6,cap:11,color:'#d8e8d3'},
  {name:'Лесопарк',need:20,rate:1.15,speed:3,cap:14,color:'#c7d9cc'},
  {name:'Кошачий фестиваль',need:25,rate:.9,speed:3.4,cap:17,color:'#e5dfd8'}];
const choices=[{key:'girl',name:'МИРА',description:'Смелость, косичка и отличный бросок.'},{key:'boy',name:'ЗАХАР',description:'Верный рюкзак. Точный бросок. Вперёд!'}];
const items=[{key:'sausage',name:'СОСИСКА',description:'Летит по дуге. Коты бегут за угощением.'},{key:'plane',name:'САМОЛЁТИК',description:'Плавно планирует навстречу приключениям.'}];
const rigs={},loading={},keys={},joy={x:0,y:0};
let heroIndex=0,itemIndex=0,step='hero',mode='select',environment=null,avatar=null;
let level=0,score=0,totalScore=0,lives=5,spawn=.6,shot=0,invul=0,time=0,pendingThrow=-1,transition=0;
let catList=[],shots=[],catPool=[],shotPools={sausage:[],plane:[]},firing=false;
let heading=0,cameraHeading=0,controlHeading=0,orbitYaw=0,orbitPitch=.27,wasMoving=false,noticeUntil=0;
let moveAmount=0,last=performance.now(),menuTime=0,stickPointer=null;
const temp=new T.Vector3(),temp2=new T.Vector3(),desiredCamera=new T.Vector3(),aimPoint=new T.Vector3();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const dampAngle=(a,b,rate,dt)=>a+wrap(b-a)*(1-Math.exp(-rate*dt));
function notice(text,seconds=2){$('notice').textContent=text;noticeUntil=time+seconds;}
function selectionText(){
  const hero=step==='hero',index=hero?heroIndex:itemIndex,choice=(hero?choices:items)[index];
  $('step-label').textContent=hero?'01 / ВЫБЕРИ ГЕРОЯ':'02 / ЧЕМ БУДЕМ БРОСАТЬСЯ?';
  $('choice-name').textContent=choice.name;$('choice-description').textContent=choice.description;
  $('select').innerHTML=hero?'ВЫБРАТЬ ПЕРСОНАЖА <span>→</span>':'НАЧАТЬ ИГРУ <span>↗</span>';
  $('back').hidden=hero;document.querySelector('.selection-footer').classList.toggle('item',!hero);
  Array.from($('dots').children).forEach((d,i)=>d.classList.toggle('active',i===index));
  const ready=!!rigs[choices[heroIndex].key];$('select').disabled=!ready;
  $('loading').textContent=ready?'':`Загружаем ${choices[heroIndex].name==='МИРА'?'Миру':'Захара'}…`;
  $('retry').hidden=true;
  for(const [key,p] of Object.entries(previews))p.visible=!hero&&key===items[itemIndex].key;
}
async function ensureCharacter(key){
  if(rigs[key])return rigs[key];if(loading[key])return loading[key];
  loading[key]=loadCharacter(key).then(rig=>{
    rigs[key]=rig;preview.add(rig.object);rig.object.position.x=(choices.findIndex(c=>c.key===key)-heroIndex)*2.35;
    if(mode==='select')selectionText();return rig;
  }).catch(e=>{
    delete loading[key];if(mode==='select'&&choices[heroIndex].key===key){$('loading').textContent='Не удалось загрузить 3D-модель. Повтори загрузку.';$('retry').hidden=false;$('select').disabled=true;}
    console.error('Character loading failed',e);return null;
  });return loading[key];
}
function switchChoice(delta){
  if(mode!=='select')return;
  if(step==='hero'){heroIndex=(heroIndex+delta+2)%2;ensureCharacter(choices[heroIndex].key);}
  else itemIndex=(itemIndex+delta+2)%2;
  selectionText();
}
$('previous').onclick=()=>switchChoice(-1);$('next').onclick=()=>switchChoice(1);
$('back').onclick=()=>{step='hero';selectionText();};
$('retry').onclick=()=>{selectionText();ensureCharacter(choices[heroIndex].key);};
$('select').onclick=()=>{if(step==='hero'){step='item';selectionText();}else startGame();};
let swipe=null;
$('carousel').addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;swipe={x:e.clientX,y:e.clientY,id:e.pointerId};$('carousel').setPointerCapture(e.pointerId);
});
$('carousel').addEventListener('pointerup',e=>{if(!swipe||swipe.id!==e.pointerId)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)*1.2)switchChoice(dx<0?1:-1);});
$('carousel').addEventListener('pointercancel',()=>swipe=null);

function hud(){
  $('level-number').textContent=`0${level+1} / 05`;$('level-name').textContent=levels[level].name;
  $('hearts').textContent=Array.from({length:5},(_,i)=>i<lives?'♥':'♡').join(' ');
  $('score').textContent=`${score} / ${levels[level].need}`;
  $('progress-fill').style.width=Math.min(100,score/levels[level].need*100)+'%';
}
function recycleCat(cat){world.remove(cat.o);cat.o.visible=false;catPool.push(cat);}
function recycleShot(s){world.remove(s.o);s.o.visible=false;shotPools[s.kind].push(s.o);}
function clearActors(){catList.forEach(recycleCat);shots.forEach(recycleShot);catList=[];shots=[];pendingThrow=-1;}
function build(){
  clearActors();if(environment){world.remove(environment);environment.userData.dispose?.();}
  environment=buildEnvironment(level);world.add(environment);
  scene.background.set(levels[level].color);scene.fog=new T.Fog(levels[level].color,26,70);
}
function startLevel(){
  player.position.set(0,0,-3);heading=0;player.rotation.y=0;cameraHeading=0;controlHeading=0;orbitYaw=0;orbitPitch=.27;wasMoving=false;
  score=0;spawn=.7;invul=1;transition=0;shot=0;build();hud();notice(`Уровень ${level+1} · ${levels[level].name}`,2.5);
  camera.position.set(0,2.35,-8.1);camera.lookAt(0,.97,-1.8);
}
function startGame(){
  const key=choices[heroIndex].key;if(!rigs[key])return;
  avatar=rigs[key];player.add(avatar.object);avatar.object.position.set(0,0,0);avatar.object.rotation.set(0,0,0);avatar.object.visible=true;
  mode='play';landingMarker.visible=true;preview.visible=false;world.visible=true;player.visible=true;$('selection').hidden=true;$('end').hidden=true;
  $('hud').hidden=false;$('controls').hidden=false;$('item-symbol').textContent=items[itemIndex].key==='sausage'?'🌭':'✈️';
  camera.fov=57;camera.updateProjectionMatrix();level=0;lives=5;totalScore=0;time=0;resetInput();startLevel();
}
function returnToMenu(){
  clearActors();resetInput();mode='select';landingMarker.visible=false;step='hero';
  if(avatar){preview.add(avatar.object);avatar=null;}
  world.visible=false;preview.visible=true;player.visible=false;scene.fog=null;scene.background.set('#d6e2d5');
  $('end').hidden=true;$('pause-screen').hidden=true;$('hud').hidden=true;$('controls').hidden=true;$('selection').hidden=false;$('notice').textContent='';
  camera.fov=46;camera.updateProjectionMatrix();selectionText();
}
function end(win){
  mode='end';if(avatar)avatar.object.visible=true;resetInput();$('controls').hidden=true;$('end').hidden=false;
  $('end-title').textContent=win?'Парк снова наш!':'Коты взяли верх';
  $('end-score').textContent=win?`Все пять уровней пройдены. ${totalScore} котов убежали довольными!`:`Пройдено уровней: ${level}. Убежавших котов: ${totalScore}. Попробуем ещё?`;
}
$('again').onclick=returnToMenu;
function pause(){if(mode!=='play')return;mode='pause';resetInput();$('pause-screen').hidden=false;$('controls').hidden=true;}
function resume(){if(mode!=='pause')return;mode='play';$('pause-screen').hidden=true;$('controls').hidden=false;last=performance.now();}
$('pause').onclick=pause;$('resume').onclick=resume;$('to-menu').onclick=returnToMenu;

function spawnCat(){
  if(catList.filter(c=>!c.flee).length>=levels[level].cap||catList.length>=24)return;
  let cat=catPool.pop();if(!cat){const variant=Math.floor(Math.random()*6);cat={o:createCat(variant),variant};}
  cat.o.visible=true;const angle=Math.random()*Math.PI*2,dist=12+Math.random()*4;
  cat.o.position.set(player.position.x+Math.sin(angle)*dist,0,player.position.z+Math.cos(angle)*dist);
  cat.speed=levels[level].speed*(.87+Math.random()*.28);cat.phase=Math.random()*10;cat.flee=false;cat.life=0;cat.direction=new T.Vector3();
  world.add(cat.o);catList.push(cat);
}
function flee(cat,award=true){
  if(cat.flee)return;cat.flee=true;cat.life=2.6;
  cat.direction.subVectors(cat.o.position,player.position).setY(0);
  if(cat.direction.lengthSq()<.01)cat.direction.set(Math.sin(heading+1),0,Math.cos(heading+1));cat.direction.normalize();
  if(award){score++;totalScore++;hud();if(score>=levels[level].need&&!transition){transition=1.25;notice(level===4?'Все коты разбежались!':'Отлично! Идём дальше…',1.2);}}
}
function throwItem(){
  if(mode!=='play'||shot>0||pendingThrow>=0||transition)return;
  shot=items[itemIndex].key==='sausage'?.45:.36;pendingThrow=.17;avatar.throw();
}
// The landing marker and the projectile use the same world-space target.
const targetRange=7.0,flightTime=.76,gravity=8;
const landingMarker=new T.Group();
const markerRing=new T.Mesh(new T.RingGeometry(.43,.54,40),new T.MeshBasicMaterial({color:0xffdf55,side:T.DoubleSide,depthTest:false}));
markerRing.rotation.x=-Math.PI/2;markerRing.position.y=.035;landingMarker.add(markerRing);
const markerDot=new T.Mesh(new T.CircleGeometry(.10,20),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,depthTest:false}));
markerDot.rotation.x=-Math.PI/2;markerDot.position.y=.038;landingMarker.add(markerDot);
landingMarker.renderOrder=100;landingMarker.visible=false;scene.add(landingMarker);
function targetPoint(){return new T.Vector3(player.position.x+Math.sin(heading)*targetRange,.06,player.position.z+Math.cos(heading)*targetRange);}
function updateLandingMarker(){
  landingMarker.visible=mode==='play';if(!landingMarker.visible)return;
  landingMarker.position.copy(targetPoint());landingMarker.scale.setScalar(1+Math.sin(time*5)*.07);
}
function releaseItem(){
  const kind=items[itemIndex].key;
  const target=targetPoint(); // NEVER select a cat behind the player's back.
  const o=shotPools[kind].pop()||createItem(kind);o.visible=true;o.scale.setScalar(1);o.rotation.set(0,0,0);
  o.position.copy(avatar.handWorld(temp));o.position.y=Math.max(.86,o.position.y);
  world.add(o);
  const velocity=target.clone().sub(o.position).divideScalar(flightTime);
  velocity.y+=.5*gravity*flightTime;
  shots.push({o,v:velocity,kind,life:flightTime+.12,age:0,startY:o.position.y});
}

const stick=$('stick'),nub=$('nub'),fire=$('fire');
function resetStick(){joy.x=joy.y=0;stickPointer=null;nub.style.transform='';}
function resetInput(){resetStick();firing=false;for(const key in keys)keys[key]=false;}
function moveStick(e){
  const r=stick.getBoundingClientRect(),limit=r.width*.34,dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,d=Math.hypot(dx,dy);
  const magnitude=Math.min(1,d/limit);joy.x=d>.1?dx/d*magnitude:0;joy.y=d>.1?dy/d*magnitude:0;
  nub.style.transform=`translate(${joy.x*limit}px,${joy.y*limit}px)`;
}
stick.addEventListener('pointerdown',e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});
stick.addEventListener('pointerup',resetStick);stick.addEventListener('pointercancel',resetStick);stick.addEventListener('lostpointercapture',resetStick);
fire.addEventListener('pointerdown',e=>{e.preventDefault();fire.setPointerCapture(e.pointerId);firing=true;throwItem();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fire.addEventListener(event,()=>firing=false);
addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(mode==='select'){if(e.code==='ArrowLeft')switchChoice(-1);if(e.code==='ArrowRight')switchChoice(1);return;}
  keys[e.code]=true;if(e.code==='Space')throwItem();if(e.code==='Escape'){if(mode==='play')pause();else if(mode==='pause')resume();}
});
addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{resetInput();if(mode==='play')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(mode==='play')pause();}});
let drag=null;
renderer.domElement.addEventListener('pointerdown',e=>{if(mode==='play'&&moveAmount<.06){drag={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId||moveAmount>.06)return;
  orbitYaw-= (e.clientX-drag.x)*.008;orbitPitch=clamp(orbitPitch+(e.clientY-drag.y)*.004,.03,.67);drag.x=e.clientX;drag.y=e.clientY;
});
for(const event of ['pointerup','pointercancel'])renderer.domElement.addEventListener(event,()=>drag=null);

function updateMovement(dt){
  let x=joy.x+(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
  let z=joy.y+(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);
  moveAmount=Math.min(1,Math.hypot(x,z));
  if(moveAmount>.08){
    const norm=Math.max(1,Math.hypot(x,z));x/=norm;z/=norm;
    // Capture the view basis for this stick gesture. Holding a direction does
    // not spin the camera; a new gesture steers relative to its new heading.
    if(!wasMoving)controlHeading=cameraHeading;
    const dx=-Math.cos(controlHeading)*x-Math.sin(controlHeading)*z;
    const dz=Math.sin(controlHeading)*x-Math.cos(controlHeading)*z;
    const target=Math.atan2(dx,dz),speed=4.0*moveAmount;
    heading=dampAngle(heading,target,13,dt);player.rotation.y=heading;
    const limit=level<=1?9.4:16.5;
    player.position.x=clamp(player.position.x+Math.sin(heading)*speed*dt,-limit,limit);
    player.position.z=clamp(player.position.z+Math.cos(heading)*speed*dt,-26,26);
    if(!wasMoving){orbitYaw=0;drag=null;}cameraHeading=dampAngle(cameraHeading,heading,9,dt);orbitYaw=T.MathUtils.damp(orbitYaw,0,14,dt);orbitPitch=T.MathUtils.damp(orbitPitch,.27,8,dt);
    wasMoving=true;
  }else{moveAmount=0;wasMoving=false;}
  const angle=cameraHeading+orbitYaw,distance=5.0;
  desiredCamera.set(player.position.x-Math.sin(angle)*distance*Math.cos(orbitPitch),1.12+Math.sin(orbitPitch)*distance,player.position.z-Math.cos(angle)*distance*Math.cos(orbitPitch));
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*9));aimPoint.set(player.position.x,.98,player.position.z);
  camera.lookAt(aimPoint);avatar.update(dt,moveAmount);
  avatar.object.visible=invul<=0||Math.floor(invul*13)%2===0;
  sun.position.set(player.position.x-7,12,player.position.z+8);sun.target.position.copy(player.position);
}
function updateCats(dt){
  for(let i=catList.length-1;i>=0;i--){
    const c=catList[i];let dir,speed=c.speed;
    if(c.flee){dir=c.direction;speed*=2.0;c.life-=dt;if(c.life<=0){recycleCat(c);catList.splice(i,1);continue;}}
    else{
      dir=temp.subVectors(player.position,c.o.position).setY(0);const distance=dir.length();if(distance>.001)dir.multiplyScalar(1/distance);
      if(distance<.71&&invul<=0){lives--;invul=1.4;avatar.hit();hud();flee(c,false);if(lives<=0){end(false);return;}}
      else if(distance<.72&&invul>0)speed=0;
    }
    c.o.position.addScaledVector(dir,dt*speed);c.o.rotation.y=dampAngle(c.o.rotation.y,Math.atan2(dir.x,dir.z),10,dt);
    c.o.userData.animate(time+c.phase,c.flee?1.25:1);
  }
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.age+=dt;s.life-=dt;
    // Integrate the same ballistic path for sausages and paper planes.
    const step=Math.min(dt,Math.max(0,flightTime-(s.age-dt)));
    s.o.position.addScaledVector(s.v,step);
    s.o.position.y-=.5*gravity*step*step;
    s.v.y-=gravity*step;
    if(s.kind==='sausage'){s.o.rotation.x+=dt*7;s.o.rotation.z+=dt*4;}
    else{s.o.lookAt(temp2.copy(s.o.position).add(s.v));s.o.rotateZ(Math.sin(s.age*5)*.12);}
    let hit=false;
    for(const c of catList)if(!c.flee){
      temp.copy(c.o.position);temp.y+=.58;
      if(s.o.position.distanceToSquared(temp)<.62*.62){flee(c);hit=true;break;}
    }
    if(hit||s.life<=0||s.age>=flightTime||s.o.position.y<.08){recycleShot(s);shots.splice(i,1);}
  }
}

function updateSelection(dt){
  menuTime+=dt;
  for(let i=0;i<choices.length;i++){
    const rig=rigs[choices[i].key];if(!rig)continue;
    rig.object.visible=step==='hero';rig.object.position.x=T.MathUtils.damp(rig.object.position.x,(i-heroIndex)*2.35,9,dt);
    rig.object.rotation.y=Math.sin(menuTime*.48)*.075;rig.update(dt,0);
  }
  for(const p of Object.values(previews))if(p.visible){p.rotation.set(.13,menuTime*.45,.12);p.position.y=.94+Math.sin(menuTime*1.6)*.045;}
  camera.position.lerp(desiredCamera.set(0,1.10,3.35),1-Math.exp(-dt*8));camera.lookAt(0,.80,0);
}
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min(.04,(now-last)/1000);last=now;
  if(mode==='select')updateSelection(dt);
  else if(mode==='play'){
    time+=dt;shot=Math.max(0,shot-dt);invul=Math.max(0,invul-dt);updateMovement(dt);updateLandingMarker();
    if(firing)throwItem();if(pendingThrow>=0){pendingThrow-=dt;if(pendingThrow<=0){pendingThrow=-1;releaseItem();}}
    spawn-=dt;if(spawn<=0&&!transition){spawnCat();spawn=levels[level].rate*(.80+Math.random()*.35);}
    updateCats(dt);if(mode==='play')updateShots(dt);
    if(transition&&mode==='play'){transition-=dt;if(transition<=0){if(level===4)end(true);else{level++;startLevel();}}}
    if(time>noticeUntil)$('notice').textContent='';
  }else if(avatar&&mode==='end')avatar.update(dt,0);
  renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));});
camera.position.set(0,1.1,3.35);camera.lookAt(0,.8,0);selectionText();
ensureCharacter('girl');ensureCharacter('boy');requestAnimationFrame(animate);
