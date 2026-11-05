import * as T from 'three';
import {loadCharacter} from './avatar-rig.js';
import {createItem,createCat,createExplosion,buildEnvironment,createPodium} from './props.js';
import {LEVELS,PLAYER_SPEED,BOMB_RADIUS,BOMB_FUSE,INVULNERABILITY,Progress,cameraMovement,assistedYaw,sausageVelocity,planeFlight,zoomDistance,insideExplosion} from './mechanics.mjs?v=body-hit-2';
import {intersectProjectileCat} from './cat-hits.js?v=body-hit-2';

// V2 keeps the original Three.js scene/group loop, five-level progression,
// five lives, original characters and menu. Complete adds bounded forward assist.
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

const levels=LEVELS;
const progress=new Progress();
const choices=[{key:'girl',name:'МИРА',description:'Смелость, косичка и отличный бросок.'},{key:'boy',name:'ЗАХАР',description:'Верный рюкзак. Точный бросок. Вперёд!'}];
const items=[{key:'sausage',name:'СОСИСКА',description:'Летит по дуге. Коты бегут за угощением.'},{key:'plane',name:'САМОЛЁТИК',description:'Плавно планирует навстречу приключениям.'}];
const rigs={},loading={},keys={},joy={x:0,y:0};
let heroIndex=0,itemIndex=0,step='hero',mode='select',environment=null,avatar=null,companion=null;
let level=0,score=0,totalScore=0,lives=5,spawn=.6,shot=0,invul=0,time=0,pendingThrow=null,transition=0;
let catList=[],shots=[],catPool=[],shotPools={sausage:[],plane:[],bomb:[]},firing=false;
let boss=null,bossDefeated=false;
let gift=null,giftTimer=12,rapidFireUntil=0,shieldCharges=0;
let interactives=[];
let levelStars=[],levelStartLives=5,levelStartTime=0,levelBombsUsed=0;
const achievements=[['first','Первый кот','Прогнать первого кота'],['ten','Кошачья гроза','Прогнать 10 котов'],['fifty','Гроза района','Прогнать 50 котов'],['sniper','Меткий бросок','Сделать 5 хедшотов'],['stars','Звёздный герой','Получить 3 звезды за уровень'],['gift','Сюрприз!','Подобрать подарок'],['boss','Победитель Котокороля','Победить финального босса'],['finish','Спасатели парка','Пройти все 5 уровней']];
let unlocked=new Set();
function unlockAchievement(id){
  if(unlocked.has(id))return;
  const item=achievements.find(a=>a[0]===id);if(!item)return;
  unlocked.add(id);reward('🏆 '+item[1],true);
  try{localStorage.setItem('cat-invasion-achievements',JSON.stringify([...new Set([...JSON.parse(localStorage.getItem('cat-invasion-achievements')||'[]'),id])]));}catch(e){console.warn('Achievement storage unavailable',e);}
}
function checkAchievements(){
  if(progress.totalKills>=1)unlockAchievement('first');
  if(progress.totalKills>=10)unlockAchievement('ten');
  if(progress.totalKills>=50)unlockAchievement('fifty');
  if(progress.headshots>=5)unlockAchievement('sniper');
}
let bombSelected=false,nextCatId=1,nextCatVariant=0,effects=[],effectPool=[],tutorialIndex=0,tutorialTimer=0;
let heading=0,cameraYaw=0,cameraPitch=.27,cameraDistance=5,noticeUntil=0;
const cameraAnchor=new T.Vector3(),cameraPointers=new Map();let pinch=null;
let moveAmount=0,last=performance.now(),menuTime=0,stickPointer=null;
let companionHeading=0,companionShot=3.5,companionPhase=0;
const companionGroup=new T.Group();world.add(companionGroup);
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
  score=progress.kills;totalScore=progress.totalKills;
  $('level-number').textContent=`0${level+1} / 05`;$('level-name').textContent=levels[level].name;
  $('hearts').textContent=Array.from({length:5},(_,i)=>i<lives?'♥':'♡').join(' ');
  $('score').textContent=`${score} / ${levels[level].need}`;$('points').textContent=`★ ${progress.points}`;
  $('progress-fill').style.width=Math.min(100,score/levels[level].need*100)+'%';
  if(progress.bombs<=0)bombSelected=false;
  $('bomb-count').textContent=`×${progress.bombs}`;$('bomb-select').disabled=progress.bombs<=0;
  $('bomb-select').classList.toggle('active',bombSelected);$('bomb-select').setAttribute('aria-pressed',String(bombSelected));
  $('item-symbol').textContent=bombSelected?'💣':items[itemIndex].key==='sausage'?'🌭':'✈️';
}
$('bomb-select').onclick=()=>{if(mode==='play'&&progress.bombs>0){bombSelected=!bombSelected;hud();tutorialAction(4);}};
function reward(text,bonus=false,point=null){
  const element=document.createElement('div');element.className='reward'+(bonus?' bonus':'');element.textContent=text;
  if(point&&!bonus){const screen=point.clone().project(camera);element.style.left=clamp((screen.x*.5+.5)*innerWidth,90,innerWidth-90)+'px';element.style.top=clamp((-screen.y*.5+.5)*innerHeight,155,innerHeight-220)+'px';}
  $('rewards').appendChild(element);setTimeout(()=>element.remove(),1100);
}
const tutorialHints=['Двигайся джойстиком','Поворачивай камеру пальцем','Бросай сосиски или самолётики','Убегай от котов','Нажми 💣, чтобы выбрать бомбочки','Попадай в голову котам и получай бонусы'];
function tutorialAction(index){if(level===0&&tutorialIndex===index){tutorialIndex++;tutorialTimer=0;}}
function tutorial(dt){
  if(level!==0||tutorialIndex>=tutorialHints.length){$('tutorial').hidden=true;return;}
  tutorialTimer+=dt;if(tutorialTimer>6.5){tutorialIndex++;tutorialTimer=0;}
  $('tutorial').hidden=tutorialIndex>=tutorialHints.length;
  $('tutorial').textContent=tutorialHints[tutorialIndex]||'';
}
function recycleCat(cat){world.remove(cat.o);cat.o.visible=false;catPool.push(cat);}
function recycleShot(s){world.remove(s.o);s.o.visible=false;shotPools[s.kind].push(s.o);}
function clearActors(){for(const prop of interactives)world.remove(prop.o);interactives=[];if(gift){world.remove(gift.o);gift=null;}if(boss){world.remove(boss.o);boss=null;}bossDefeated=false;catList.forEach(recycleCat);shots.forEach(recycleShot);effects.forEach(e=>{world.remove(e.o);effectPool.push(e.o);});catList=[];shots=[];effects=[];pendingThrow=null;}
function build(){
  clearActors();if(environment){world.remove(environment);environment.userData.dispose?.();}
  environment=buildEnvironment(level);world.add(environment);createInteractives();
  scene.background.set(levels[level].color);scene.fog=new T.Fog(levels[level].color,26,70);
}
function startLevel(){
  companionGroup.position.set(1.8,0,-4.4);companionGroup.rotation.y=0;companionHeading=0;companionShot=3.5;
  player.position.set(0,0,-3);heading=0;player.rotation.y=0;cameraYaw=0;cameraPitch=.27;
  cameraAnchor.copy(player.position);cameraPointers.clear();pinch=null;
  giftTimer=10+Math.random()*7;rapidFireUntil=0;shieldCharges=0;
  progress.startLevel(level);levelStartLives=lives;levelStartTime=time;levelBombsUsed=0;spawn=levels[level].rate;invul=1;transition=0;shot=0;build();hud();notice(`Уровень ${level+1} · ${levels[level].name}`,2.5);
  camera.position.set(0,1+Math.sin(cameraPitch)*cameraDistance,-3-Math.cos(cameraPitch)*cameraDistance);camera.lookAt(0,1,-3);
}
function startGame(){
  const key=choices[heroIndex].key;if(!rigs[key])return;
  avatar=rigs[key];player.add(avatar.object);avatar.object.position.set(0,0,0);avatar.object.rotation.set(0,0,0);avatar.object.visible=true;
  companion=rigs[key==='girl'?'boy':'girl']||null;
  if(companion){companionGroup.add(companion.object);companion.object.position.set(0,0,0);companion.object.rotation.set(0,0,0);companion.object.visible=true;}
  companionGroup.visible=!!companion;
  mode='play';preview.visible=false;world.visible=true;player.visible=true;$('selection').hidden=true;$('end').hidden=true;
  $('hud').hidden=false;$('controls').hidden=false;$('item-symbol').textContent=items[itemIndex].key==='sausage'?'🌭':'✈️';
  camera.fov=57;camera.updateProjectionMatrix();level=0;lives=5;levelStars=[];unlocked=new Set();totalScore=0;time=0;progress.reset();bombSelected=false;tutorialIndex=0;tutorialTimer=0;resetInput();startLevel();
}
function returnToMenu(){
  clearActors();resetInput();mode='select';step='hero';
  if(avatar){preview.add(avatar.object);avatar=null;}
  if(companion){preview.add(companion.object);companion=null;}companionGroup.visible=false;
  world.visible=false;preview.visible=true;player.visible=false;scene.fog=null;scene.background.set('#d6e2d5');
  $('end').hidden=true;$('pause-screen').hidden=true;$('hud').hidden=true;$('controls').hidden=true;$('selection').hidden=false;$('notice').textContent='';$('tutorial').hidden=true;
  camera.fov=46;camera.updateProjectionMatrix();selectionText();
}
function awardLevelStars(){
  if(levelStars[level])return;
  const lost=levelStartLives-lives,elapsed=time-levelStartTime;
  // One star for completion, second for survival, third for an efficient run.
  const stars=1+(lost<=1?1:0)+(lost===0&&elapsed<=120&&levelBombsUsed<=5?1:0);
  levelStars[level]=stars;
  if(stars===3)unlockAchievement('stars');
  progress.points+=stars*5;
  reward('УРОВЕНЬ ПРОЙДЕН: '+ '★'.repeat(stars)+'☆'.repeat(3-stars),true);
  hud();
}
function end(win){
  if(win)unlockAchievement('finish');
  mode='end';$('tutorial').hidden=true;if(avatar)avatar.object.visible=true;resetInput();$('controls').hidden=true;$('end').hidden=false;
  $('end-title').textContent=win?'Котокороль побеждён!':'Коты взяли верх';
  const starsText=levelStars.map((n,i)=>`У${i+1}: ${'★'.repeat(n)}${'☆'.repeat(3-n)}`).join(' · ');
  let saved=[];try{saved=JSON.parse(localStorage.getItem('cat-invasion-achievements')||'[]');}catch(e){}
  const earned=achievements.filter(a=>saved.includes(a[0])).map(a=>'🏆 '+a[1]).join(' · ');
  $('end-score').textContent=win?`Все пять уровней пройдены. ${totalScore} котов убежали довольными! Очки: ${progress.points}, HEADSHOT: ${progress.headshots}. ${starsText}`:`Пройдено уровней: ${level}. Убежавших котов: ${totalScore}. Попробуем ещё? ${starsText}`;
  $('end-score').textContent+=' | Достижения: '+(earned||'пока нет');
}
$('again').onclick=returnToMenu;
function pause(){if(mode!=='play')return;mode='pause';resetInput();$('pause-screen').hidden=false;$('controls').hidden=true;}
function resume(){if(mode!=='pause')return;mode='play';$('pause-screen').hidden=true;$('controls').hidden=false;last=performance.now();}
$('pause').onclick=pause;$('resume').onclick=resume;$('to-menu').onclick=returnToMenu;

function spawnBoss(){
  if(boss||bossDefeated||level!==4)return;
  const o=createCat(1);o.scale.setScalar(2.65);o.position.set(player.position.x,0,player.position.z+12);
  // A crown attached to the animated head, not to the ground.
  const crown=new T.Group();crown.position.set(0,.31,0);o.userData.head.add(crown);
  const gold=new T.MeshStandardMaterial({color:'#ffce36',metalness:.45,roughness:.28});
  const band=new T.Mesh(new T.CylinderGeometry(.23,.23,.12,12),gold);band.position.y=.04;crown.add(band);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const tip=new T.Mesh(new T.ConeGeometry(.075,.24,4),gold);tip.position.set(Math.sin(a)*.17,.18,Math.cos(a)*.17);crown.add(tip);}
  boss={o,hp:6,maxHp:6,hitCooldown:0,phase:0,crown};world.add(o);
  spawn=999;notice('👑 КОТОКОРОЛЬ! 6 попаданий до победы',3);
}
function hitBoss(kind='body'){
  if(!boss||boss.hitCooldown>0)return false;
  boss.hp-=kind==='bomb'?2:1;boss.hitCooldown=.38;boss.o.userData.hit?.();
  boss.crown.rotation.z+=.35;reward('👑 '+Math.max(0,boss.hp)+'/6',true);
  if(boss.hp<=0){unlockAchievement('boss');awardLevelStars();world.remove(boss.o);boss=null;bossDefeated=true;transition=1.5;notice('КОТОКОРОЛЬ ПОБЕЖДЁН!',2);}
  return true;
}
function spawnCat(){
  if(boss||level===4&&progress.complete)return false;
  if(catList.length>=levels[level].cap)return false;
  // Early levels teach the basics; new behaviours appear gradually.
  const allowed=level===0?[1]:level===1?[1,0,4]:level===2?[1,0,4,3]:level===3?[1,0,4,3,5]:[0,1,2,3,4,5];
  const variant=allowed[nextCatVariant++%allowed.length];
  let cat=catPool.find(c=>c.variant===variant);
  if(cat)catPool.splice(catPool.indexOf(cat),1);
  else cat={o:createCat(variant),variant};
  cat.id=nextCatId++;cat.o.visible=true;
  // The first two levels approach through one stable sector, not a ring.
  const angle=level<2?(Math.random()-.5)*(level===0?1.2:2.1):Math.random()*Math.PI*2;
  const dist=12+Math.random()*4;
  cat.o.position.set(player.position.x+Math.sin(angle)*dist,0,player.position.z+Math.cos(angle)*dist);
  cat.speed=levels[level].speed;cat.phase=Math.random()*10;cat.flee=false;cat.life=0;cat.direction=new T.Vector3();
  cat.behaviourClock=Math.random()*2;cat.dodgeCooldown=1.5+Math.random()*2;cat.flankSign=Math.random()<.5?-1:1;
  cat.reaction=null;cat.o.rotation.set(0,0,0);cat.o.scale.setScalar(1);
  world.add(cat.o);catList.push(cat);return true;
}
function flee(cat,award=true,kind='body',point=null,fromCompanion=false,weapon='sausage'){
  if(cat.flee)return;cat.flee=true;cat.life=2.6;cat.o.userData.hit?.();
  cat.reaction={kind:kind==='explosion'?'blast':weapon==='plane'?'spin':weapon==='sausage'?'flip':'hop',age:0,baseY:cat.o.position.y,baseScale:1};
  cat.direction.subVectors(cat.o.position,player.position).setY(0);
  if(cat.direction.lengthSq()<.01)cat.direction.set(Math.sin(heading+1),0,Math.cos(heading+1));cat.direction.normalize();
  if(award){
    const result=progress.defeat(cat.id,!fromCompanion&&kind==='head');
    if(result.counted&&cat.variant===2){progress.points+=3;reward('ЗОЛОТОЙ КОТ! +3 ★',true);}
    if(result.counted&&kind==='head'&&!fromCompanion){reward('HEADSHOT! +2',false,point);tutorialAction(5);}
    else if(result.counted&&kind==='body'&&point)reward('+1',false,point);
    if(result.bonusBomb)reward('+1 БОМБОЧКА!',true);
    if(result.counted)checkAchievements();
    hud();if(progress.complete&&!transition){
      if(level===4){spawnBoss();}else{awardLevelStars();transition=1.25;notice('Отлично! Идём дальше…',1.2);}
    }
  }
}
function throwItem(){
  if(mode!=='play'||shot>0||pendingThrow||transition)return;
  const kind=bombSelected&&progress.bombs>0?'bomb':items[itemIndex].key;
  if(kind==='bomb'&&!progress.consumeBomb())return;
  if(kind==='bomb')levelBombsUsed++;
  if(kind!=='bomb'&&time<rapidFireUntil)shot=.12;
  shot=kind==='bomb'?.75:(time<rapidFireUntil?.23:.43);pendingThrow={delay:.17,kind};
  avatar.throw(kind,moveAmount>.15);if(kind!=='bomb')tutorialAction(2);hud();
}
function releaseItem(pending){
  const kind=pending.kind,ai=!!pending.companion,origin=ai?companionGroup.position:player.position,launchYaw=ai?companionHeading:heading;
  const forward=new T.Vector3(Math.sin(launchYaw),0,Math.cos(launchYaw));
  const targets=catList.map(c=>({position:c.o.position,flee:c.flee,cat:c}));
  // Direction is fixed once here at release. No target is followed in flight.
  const assist=kind==='bomb'?{yaw:heading,target:null,distance:null}:assistedYaw(launchYaw,origin,targets,ai?Math.min(levels[level].assist,0.17):levels[level].assist,kind==='plane'?15:8);
  const dir=new T.Vector3(Math.sin(assist.yaw),0,Math.cos(assist.yaw));
  const o=shotPools[kind].pop()||createItem(kind);o.visible=true;o.scale.setScalar(1);o.rotation.set(0,0,0);
  o.position.copy((ai?companion:avatar).handWorld(temp));o.position.y=Math.max(.65,o.position.y);
  let velocity,gravity=0;
  if(kind==='bomb'){
    const dropping=moveAmount>.15;
    if(dropping){const projection=temp2.subVectors(o.position,player.position).dot(forward);o.position.addScaledVector(forward,Math.min(0,-.25-projection));}
    velocity=forward.clone().multiplyScalar(dropping?-1.25:4.2);velocity.y=dropping?.8:2.0;gravity=9.8;
  }else if(kind==='sausage'){
    const launch=sausageVelocity(o.position.y,assist.distance,assist.target?.cat.speed||0);velocity=dir.clone().multiplyScalar(launch.speed);velocity.y=launch.up;gravity=launch.gravity;
  }else{velocity=dir.clone().multiplyScalar(9);velocity.y=.46;}
  world.add(o);o.lookAt(temp2.copy(o.position).add(dir));
  shots.push({o,v:velocity,companion:ai,kind,age:0,life:kind==='bomb'?20:3.5,startY:o.position.y,yaw:assist.yaw,seed:Math.random()*7,gravity,landed:false,fuse:BOMB_FUSE,distance:0,previous:o.position.clone()});
}
// Cartoon blast: broad area damage, visible knockback, and friendly fire.
const COOP_BLAST_RADIUS=5.5;
function detonate(bomb){
  const center=bomb.o.position;
  const o=effectPool.pop()||createExplosion();
  o.position.set(center.x,0,center.z);o.visible=true;o.scale.setScalar(COOP_BLAST_RADIUS/3);
  o.userData.tick(0);world.add(o);effects.push({o,age:0});
  for(const prop of interactives)if(insideExplosion(center,prop.o.position,COOP_BLAST_RADIUS))strikeInteractive(prop,1.8);
  if(boss&&insideExplosion(center,boss.o.position,COOP_BLAST_RADIUS+1.1))hitBoss('bomb');
  for(const cat of catList){
    if(cat.flee||!insideExplosion(center,cat.o.position,COOP_BLAST_RADIUS))continue;
    const away=cat.o.position.clone().sub(center).setY(0);
    if(away.lengthSq()<.001)away.set(Math.random()-.5,0,Math.random()-.5);
    away.normalize();
    cat.o.position.addScaledVector(away,Math.min(2.2,COOP_BLAST_RADIUS-cat.o.position.distanceTo(center)+.5));
    flee(cat,true,'explosion');
    cat.direction.copy(away);
  }
  // The player's own bomb is dangerous even during ordinary contact invulnerability.
  const playerDistance=Math.hypot(player.position.x-center.x,player.position.z-center.z);
  if(playerDistance<=COOP_BLAST_RADIUS){
    // Any single bomb explosion costs exactly one life, regardless of distance.
    lives=Math.max(0,lives-1);invul=INVULNERABILITY;avatar.hit();hud();
    notice('Взрыв! −1 жизнь',2);
    const away=player.position.clone().sub(center).setY(0);
    if(away.lengthSq()<.001)away.set(Math.sin(heading),0,Math.cos(heading));
    away.normalize();
    player.position.addScaledVector(away,Math.min(2.5,Math.max(.6,COOP_BLAST_RADIUS-playerDistance)*.5));
    if(lives<=0){end(false);return;}
  }
}

const stick=$('stick'),nub=$('nub'),fire=$('fire');
function resetStick(){joy.x=joy.y=0;stickPointer=null;nub.style.transform='';}
function resetInput(){resetStick();firing=false;cameraPointers.clear();pinch=null;for(const key in keys)keys[key]=false;}
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
function pointerSpan(){const points=Array.from(cameraPointers.values());return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);}
renderer.domElement.addEventListener('pointerdown',e=>{
  if(mode!=='play')return;e.preventDefault();cameraPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);
  if(cameraPointers.size===2)pinch={span:pointerSpan(),distance:cameraDistance};
});
renderer.domElement.addEventListener('pointermove',e=>{
  const previous=cameraPointers.get(e.pointerId);if(!previous||mode!=='play')return;
  const dx=e.clientX-previous.x,dy=e.clientY-previous.y;cameraPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(cameraPointers.size>=2){if(pinch)cameraDistance=zoomDistance(pinch.distance,pinch.span,pointerSpan());}
  else{cameraYaw-=dx*.007;cameraPitch=clamp(cameraPitch+dy*.004,.055,.78);if(Math.abs(dx)+Math.abs(dy)>3)tutorialAction(1);}
});
function releaseCamera(e){cameraPointers.delete(e.pointerId);pinch=null;}
for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,releaseCamera);
renderer.domElement.addEventListener('wheel',e=>{if(mode!=='play')return;e.preventDefault();cameraDistance=clamp(cameraDistance*Math.exp(e.deltaY*.001),2.5,9);},{passive:false});

function updateMovement(dt){
  const x=joy.x+(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
  const y=joy.y+(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);
  const movement=cameraMovement(x,y,cameraYaw);moveAmount=movement.amount;
  if(moveAmount>.08){
    const target=Math.atan2(movement.x,movement.z);heading=dampAngle(heading,target,17,dt);player.rotation.y=heading;
    const speed=PLAYER_SPEED*moveAmount,limit=level<=1?9.4:16.5;
    player.position.x=clamp(player.position.x+Math.sin(heading)*speed*dt,-limit,limit);
    player.position.z=clamp(player.position.z+Math.cos(heading)*speed*dt,-30,30);
    if(tutorialIndex===0)tutorialAction(0);if(tutorialIndex===3&&catList.some(c=>!c.flee))tutorialAction(3);
  }else moveAmount=0;
  // Yaw and zoom belong solely to the player. Running never recentres them.
  cameraAnchor.lerp(player.position,1-Math.exp(-dt*11));
  desiredCamera.set(cameraAnchor.x-Math.sin(cameraYaw)*cameraDistance*Math.cos(cameraPitch),1.0+Math.sin(cameraPitch)*cameraDistance,cameraAnchor.z-Math.cos(cameraYaw)*cameraDistance*Math.cos(cameraPitch));
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*13));aimPoint.set(cameraAnchor.x,1.0,cameraAnchor.z);camera.lookAt(aimPoint);
  avatar.update(dt,moveAmount);avatar.object.visible=invul<=0||Math.floor(invul*11)%2===0;
  sun.position.set(player.position.x-7,12,player.position.z+8);sun.target.position.copy(player.position);
}
function updateCompanion(dt){
  if(!companion)return;
  companionPhase+=dt;
  const side=new T.Vector3(Math.cos(heading),0,-Math.sin(heading));
  const behind=new T.Vector3(Math.sin(heading),0,Math.cos(heading));
  const target=player.position.clone().addScaledVector(side,1.65).addScaledVector(behind,-1.35);
  const delta=target.sub(companionGroup.position);const distance=delta.length();
  if(distance>13){companionGroup.position.copy(target);companionGroup.position.x+=.3;}
  else if(distance>.2){const speed=Math.min(distance*3.5,PLAYER_SPEED*1.22);companionGroup.position.addScaledVector(delta.normalize(),Math.min(distance,speed*dt));}
  let nearest=null,best=11;
  for(const cat of catList){if(cat.flee)continue;const d=cat.o.position.distanceTo(companionGroup.position);if(d<best){best=d;nearest=cat;}}
  const direction=nearest&&best<9?nearest.o.position.clone().sub(companionGroup.position):distance>.35?delta:null;
  if(direction&&direction.lengthSq()>.001)companionHeading=dampAngle(companionHeading,Math.atan2(direction.x,direction.z),9,dt);
  companionGroup.rotation.y=companionHeading;
  companion.update(dt,distance>.35?Math.min(1,distance):0);
  companionShot-=dt;
  if(companionShot<=0&&nearest&&best<9&&!transition){
    const toCat=nearest.o.position.clone().sub(companionGroup.position);const yaw=Math.atan2(toCat.x,toCat.z);
    if(Math.abs(wrap(yaw-companionHeading))<.25){
      const kind=items[itemIndex].key;companion.throw(kind,distance>.35);
      releaseItem({kind,companion:true});companionShot=4+Math.random()*2;
    }
  }
}
function makeGift(){
  const o=new T.Group();
  const box=new T.Mesh(new T.BoxGeometry(.65,.65,.65),new T.MeshStandardMaterial({color:'#ed5d91',roughness:.55}));
  box.position.y=.47;box.castShadow=true;o.add(box);
  const ribbon=new T.MeshStandardMaterial({color:'#ffe56a',metalness:.12,roughness:.4});
  const stripA=new T.Mesh(new T.BoxGeometry(.14,.67,.68),ribbon);
  stripA.position.y=.47;o.add(stripA);
  const stripB=new T.Mesh(new T.BoxGeometry(.68,.67,.14),ribbon);
  stripB.position.y=.47;o.add(stripB);
  const bow=new T.Mesh(new T.TorusGeometry(.15,.045,6,12),ribbon);
  bow.position.y=.88;bow.rotation.x=Math.PI/2;o.add(bow);
  return o;
}
function createInteractives(){
  const colors={box:'#c98b52',bin:'#668f92',bush:'#4d9c64'};
  for(let i=0;i<9;i++){
    const kind=['box','bin','bush'][i%3],o=new T.Group();
    const mat=new T.MeshStandardMaterial({color:colors[kind],roughness:.8});
    let body;
    if(kind==='bush'){body=new T.Mesh(new T.SphereGeometry(.58,9,7),mat);body.position.y=.52;}
    else{body=new T.Mesh(new T.BoxGeometry(kind==='bin'?.8:.95,kind==='bin'?1.05:.75,kind==='bin'?.8:.95),mat);body.position.y=kind==='bin'?.53:.39;}
    body.castShadow=true;o.add(body);
    let lid=null;
    if(kind==='bin'){
      lid=new T.Mesh(new T.BoxGeometry(.97,.12,.97),new T.MeshStandardMaterial({color:'#405c61'}));
      lid.position.y=1.1;o.add(lid);
    }
    const x=(i%2?1:-1)*(3.4+(i%3)*1.1),z=-19+i*5.1;
    o.position.set(x,0,z);world.add(o);
    interactives.push({o,body,lid,kind,react:0,spin:0,originY:0});
  }
}
function strikeInteractive(prop,force=1){
  prop.react=1;prop.spin=(Math.random()>.5?1:-1)*force;
}
function updateInteractives(dt){
  for(const p of interactives){
    p.react=Math.max(0,p.react-dt*1.65);
    const wave=Math.sin(p.react*Math.PI);
    p.body.rotation.z=p.spin*wave*(p.kind==='box'?.9:.35);
    p.body.rotation.x=wave*(p.kind==='bush'?.3:.12);
    if(p.lid){p.lid.position.y=1.1+wave*.7;p.lid.rotation.x=wave*.65;}
    if(p.kind==='box')p.body.position.y=.39+wave*.25;
    if(p.kind==='bush')p.body.scale.setScalar(1+wave*.22);
  }
}
function updateGifts(dt){
  if(gift){
    gift.age+=dt;gift.o.rotation.y+=dt*1.7;gift.o.position.y=Math.sin(gift.age*3)*.09;
    if(gift.o.position.distanceTo(player.position)<1.4){
      const choice=Math.floor(Math.random()*4);
      if(choice===0){lives=Math.min(5,lives+1);notice('🎁 +1 жизнь!',2);}
      else if(choice===1){progress.bombs+=3;notice('🎁 +3 бомбочки!',2);}
      else if(choice===2){rapidFireUntil=time+12;notice('🎁 Быстрые броски: 12 секунд!',2);}
      else{shieldCharges++;notice('🎁 Щит от одного удара!',2);}
      unlockAchievement('gift');hud();world.remove(gift.o);gift=null;giftTimer=14+Math.random()*8;
    }else if(gift.age>16){world.remove(gift.o);gift=null;giftTimer=10;}
    return;
  }
  if(transition||boss)return;
  giftTimer-=dt;
  if(giftTimer<=0){
    const o=makeGift(),angle=Math.random()*Math.PI*2,distance=3+Math.random()*4;
    o.position.set(clamp(player.position.x+Math.sin(angle)*distance,-8,8),0,clamp(player.position.z+Math.cos(angle)*distance,-27,27));
    world.add(o);gift={o,age:0};notice('🎁 Подарок рядом! Подбери его!',2);
  }
}
function updateBoss(dt){
  if(!boss)return;
  boss.hitCooldown=Math.max(0,boss.hitCooldown-dt);boss.phase+=dt;
  const direction=player.position.clone().sub(boss.o.position).setY(0);
  const distance=direction.length();if(distance>.01)direction.multiplyScalar(1/distance);
  const speed=1.55+(Math.sin(boss.phase*1.4)>.75?.8:0);
  if(distance>1.55)boss.o.position.addScaledVector(direction,speed*dt);
  if(distance<1.6&&invul<=0){if(shieldCharges>0){shieldCharges--;invul=INVULNERABILITY;notice('🛡️ Щит защитил!',1.5);return;}lives=Math.max(0,lives-1);invul=INVULNERABILITY;avatar.hit();hud();notice('Котокороль атакует! −1 жизнь',1.5);if(!lives){end(false);return;}}
  boss.o.rotation.y=dampAngle(boss.o.rotation.y,Math.atan2(direction.x,direction.z),6,dt);
  boss.o.userData.animate(dt,speed,time,false);
  boss.crown.rotation.z=T.MathUtils.damp(boss.crown.rotation.z,0,3,dt);
}
function updateCats(dt){
  for(let i=catList.length-1;i>=0;i--){
    const c=catList[i];let dir,speed=c.speed;
    if(c.flee){
      dir=c.direction;speed=Math.max(3,speed*1.9);c.life-=dt;
      if(c.life<=0){recycleCat(c);catList.splice(i,1);continue;}
    }else{
      c.behaviourClock+=dt;
      dir=temp.subVectors(player.position,c.o.position).setY(0);
      const distance=dir.length();if(distance>.001)dir.multiplyScalar(1/distance);
      switch(c.variant){
        case 0: // Black: sprints, then pauses briefly.
          speed*=1.45;
          if(c.behaviourClock%4.2<.55)speed=0;
          break;
        case 2: // Golden: rare, faster, worth extra stars.
          speed*=1.18;
          break;
        case 3: { // Grey: approaches from the side.
          const sideways=new T.Vector3(dir.z,0,-dir.x).multiplyScalar(c.flankSign*.65);
          dir.add(sideways).normalize();break;
        }
        case 4: // White: timid, runs away when approached.
          if(distance<5.5){dir.multiplyScalar(-1);speed*=1.35;}
          else speed*=.7;
          break;
        case 5: { // Spotted: occasional sideways dodges near flying projectiles.
          c.dodgeCooldown-=dt;
          if(c.dodgeCooldown<=0&&distance<8&&shots.some(p=>p.kind!=='bomb'&&p.o.position.distanceTo(c.o.position)<3.2)){
            c.dodgeCooldown=2.5+Math.random()*1.5;
            c.flankSign*=-1;c.behaviourClock=0;
          }
          if(c.behaviourClock<.35&&c.dodgeCooldown>1.5){
            dir.add(new T.Vector3(dir.z,0,-dir.x).multiplyScalar(c.flankSign*2.2)).normalize();
            speed*=1.35;
          }
          break;
        }
      }
      if(distance<.71&&invul<=0){if(shieldCharges>0){shieldCharges--;invul=INVULNERABILITY;notice('🛡️ Щит защитил!',1.5);flee(c,false);continue;}lives--;invul=INVULNERABILITY;avatar.hit();hud();flee(c,false);dir=c.direction;speed=Math.max(3,c.speed*1.9);if(lives<=0){end(false);return;}}
      else if(distance<.72&&invul>0)speed=0;
    }
    c.o.position.addScaledVector(dir,dt*speed);
    if(dir.lengthSq()>.001&&!c.reaction)c.o.rotation.y=dampAngle(c.o.rotation.y,Math.atan2(dir.x,dir.z),10,dt);
    c.o.userData.animate(dt,speed,time+c.phase,c.flee);
    if(c.reaction){
      const r=c.reaction;r.age+=dt;const u=Math.min(1,r.age/1.25),arc=Math.sin(Math.PI*u);
      if(r.kind==='flip'){c.o.rotation.x=u*Math.PI*2;c.o.position.y=r.baseY+arc*.85;}
      else if(r.kind==='spin'){c.o.rotation.y+=dt*13;c.o.rotation.z=arc*.35;c.o.position.y=r.baseY+arc*.45;}
      else if(r.kind==='blast'){c.o.rotation.z=u*Math.PI*2;c.o.rotation.x=arc*.7;c.o.position.y=r.baseY+arc*1.6;}
      else{c.o.rotation.z=arc*.3;c.o.position.y=r.baseY+arc*.55;}
      c.o.scale.setScalar(1+arc*.12);
      if(u>=1){c.o.position.y=0;c.o.rotation.x=0;c.o.rotation.z=0;c.o.scale.setScalar(1);c.reaction=null;}
    }
  }
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.previous.copy(s.o.position);const previousRotation=s.o.quaternion.clone();s.age+=dt;s.life-=dt;
    if(s.kind==='bomb'){
      if(!s.landed){s.o.position.addScaledVector(s.v,dt);s.o.position.y-=.5*s.gravity*dt*dt;s.v.y-=s.gravity*dt;s.o.rotation.x+=dt*4;
        if(s.o.position.y<=.17){s.o.position.y=.17;s.landed=true;s.fuse=BOMB_FUSE;s.o.rotation.set(0,s.yaw,0);}}
      else{s.fuse-=dt;if(s.fuse<=0){detonate(s);recycleShot(s);shots.splice(i,1);continue;}}
      s.o.userData.tick(time);continue;
    }
    if(s.kind==='sausage'){
      s.o.position.addScaledVector(s.v,dt);s.o.position.y-=.5*s.gravity*dt*dt;s.v.y-=s.gravity*dt;s.o.rotation.x+=dt*7;s.o.rotation.z+=dt*4;
    }else{
      const flight=planeFlight(s.age,s.seed),yaw=s.yaw+flight.yawOffset,speed=flight.speed*clamp((15-s.distance)/2,0,1);
      const step=speed*dt;s.o.position.x+=Math.sin(yaw)*step;s.o.position.z+=Math.cos(yaw)*step;s.distance+=step;
      s.o.position.y=s.startY+flight.height;
      s.o.lookAt(temp2.copy(s.o.position).add(new T.Vector3(Math.sin(yaw),-.08,Math.cos(yaw))));s.o.rotateZ(flight.bank);
    }
    let impact=null;
    for(const c of catList)if(!c.flee){
      const candidate=intersectProjectileCat(c.o,s.kind,s.previous,s.o.position,previousRotation,s.o.quaternion);
      if(candidate&&(!impact||candidate.fraction<impact.fraction))impact={cat:c,...candidate};
    }
    if(impact)flee(impact.cat,true,impact.head?'head':'body',impact.point,!!s.companion,s.kind);
    let propImpact=false;
    if(!impact){for(const prop of interactives){
      const p=prop.o.position,a=s.previous,b=s.o.position;
      const vx=b.x-a.x,vz=b.z-a.z,t=clamp(((p.x-a.x)*vx+(p.z-a.z)*vz)/Math.max(1e-8,vx*vx+vz*vz),0,1);
      if(Math.hypot(a.x+vx*t-p.x,a.z+vz*t-p.z)<.7&&Math.min(a.y,b.y)<1.5&&Math.max(a.y,b.y)>.15){strikeInteractive(prop);propImpact=true;break;}
    }}
    let bossImpact=false;
    if(!impact&&boss&&boss.hitCooldown<=0){
      const dx=s.o.position.x-boss.o.position.x,dz=s.o.position.z-boss.o.position.z;
      const px=s.previous.x-boss.o.position.x,pz=s.previous.z-boss.o.position.z;
      const vx=dx-px,vz=dz-pz;
      const t=Math.max(0,Math.min(1,-(px*vx+pz*vz)/Math.max(1e-8,vx*vx+vz*vz)));
      const horizontal=Math.hypot(px+vx*t,pz+vz*t);
      if(horizontal<1.1&&Math.min(s.previous.y,s.o.position.y)<2.6&&Math.max(s.previous.y,s.o.position.y)>.2){bossImpact=hitBoss('body');}
    }
    if(impact||propImpact||bossImpact||s.life<=0||s.o.position.y<.07){recycleShot(s);shots.splice(i,1);}
  }
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.age+=dt;e.o.userData.tick(e.age);if(e.age>=1.1){world.remove(e.o);e.o.visible=false;effectPool.push(e.o);effects.splice(i,1);}}
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
    time+=dt;shot=Math.max(0,shot-dt);invul=Math.max(0,invul-dt);updateMovement(dt);updateCompanion(dt);updateGifts(dt);updateInteractives(dt);
    if(firing)throwItem();if(pendingThrow){pendingThrow.delay-=dt;if(pendingThrow.delay<=0){const pending=pendingThrow;pendingThrow=null;releaseItem(pending);}}
    spawn-=dt;if(spawn<=0&&!transition){spawn=spawnCat()?levels[level].rate:.35;}
    updateCats(dt);updateBoss(dt);if(mode==='play')updateShots(dt);
    if(transition&&mode==='play'){transition-=dt;if(transition<=0){if(level===4){if(bossDefeated)end(true);}else{level++;startLevel();}}}
    tutorial(dt);if(time>noticeUntil)$('notice').textContent='';
  }else if(avatar&&mode==='end')avatar.update(dt,0);
  renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));});
camera.position.set(0,1.1,3.35);camera.lookAt(0,.8,0);selectionText();
ensureCharacter('girl');ensureCharacter('boy');requestAnimationFrame(animate);
