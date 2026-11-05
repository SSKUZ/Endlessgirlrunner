// Execute the actual game modules with real Three.js geometry, GLB loading,
// skeletons and event handlers. Only the GPU renderer/DOM are replaced.
// THREE_ROOT=/path/to/node_modules/three MODEL_ROOT=/path/to/characters node tests/runtime-complete.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
process.on('uncaughtException',e=>{console.error(e.name+': '+e.message);process.exit(1);});
const project=path.resolve(new URL('..',import.meta.url).pathname),source=path.join(project,'assets/gameplay-complete');
const threeRoot=process.env.THREE_ROOT||path.join(project,'node_modules/three');
const modelRoot=process.env.MODEL_ROOT||path.join(project,'assets/characters');
const threeURL=pathToFileURL(path.join(threeRoot,'build/three.module.js')).href;
const loaderURL=pathToFileURL(path.join(threeRoot,'examples/jsm/loaders/GLTFLoader.js')).href;
let clock=0,frame=null,count=0;
class Element {
  constructor(id=''){this.id=id;this.style={};this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.attributes={};this.listeners={};this.children=[];this.classList={toggle(){},add(){},remove(){}};}
  setAttribute(k,v){this.attributes[k]=v;}appendChild(c){this.children.push(c);}prepend(c){this.children.unshift(c);}remove(){}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}setPointerCapture(){}
  getBoundingClientRect(){return {left:20,top:720,width:128,height:128};}
  emit(type,e={}){e.preventDefault??=()=>{};e.target??={closest:()=>null};for(const fn of this.listeners[type]||[])fn(e);}
  getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
}
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
element('dots').children=[new Element(),new Element()];
globalThis.document={getElementById:element,querySelector:()=>element('footer'),createElement:tag=>new Element(tag),body:new Element('body'),addEventListener(){},hidden:false};
globalThis.innerWidth=412;globalThis.innerHeight=915;globalThis.devicePixelRatio=3;
globalThis.performance={now:()=>clock*1000};globalThis.addEventListener=()=>{};
globalThis.requestAnimationFrame=fn=>{frame=fn;};
globalThis.ProgressEvent=class {constructor(type,options){Object.assign(this,{type,...options});}};
globalThis.__completeModels={};
for(const name of ['girl','boy']){const data=await readFile(path.join(modelRoot,`${name}_avatar_v2.glb`));globalThis.__completeModels[name]=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
globalThis.__FakeRenderer=class {
  constructor(){this.domElement=new Element('canvas');this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
};
const dataURL=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
let avatar=await readFile(path.join(source,'avatar-rig.js'),'utf8');
avatar=avatar.replace("from 'three'",`from '${threeURL}'`).replace("from 'three/addons/loaders/GLTFLoader.js'",`from '${loaderURL}'`);
avatar=avatar.replace(/const gltf=await loader\.loadAsync\([^\n]+\);/,"const gltf=await loader.parseAsync(globalThis.__completeModels[name], '');");
const avatarURL=dataURL(avatar);
const propsURL=dataURL((await readFile(path.join(source,'props.js'),'utf8')).replace("from 'three'",`from '${threeURL}'`));
const awaitThree=await import(threeURL);globalThis.__propsModule=await import(propsURL);
let game=await readFile(path.join(source,'game.js'),'utf8');
game=game.replace("import * as T from 'three';",`import * as THREE from '${threeURL}';const T={...THREE,WebGLRenderer:globalThis.__FakeRenderer};`)
  .replace("'./avatar-rig.js'",JSON.stringify(avatarURL)).replace("'./props.js'",JSON.stringify(propsURL))
  .replace("'./mechanics.mjs'",JSON.stringify(pathToFileURL(path.join(source,'mechanics.mjs')).href));
game+=`\nexport {ensureCharacter,startGame,startLevel,returnToMenu,switchChoice,throwItem,releaseItem,updateCats,updateShots,spawnCat,flee};
export const inspect=()=>({player,camera,rigs,avatar,progress,catList,shots,world,level,mode,lives,heading,cameraYaw,cameraDistance,moveAmount,heroIndex,itemIndex,step,pendingThrow});
export function fixture(v){if('heading'in v){heading=v.heading;player.rotation.y=heading;}if('moving'in v)moveAmount=v.moving;if('shot'in v)shot=v.shot;if('level'in v)level=v.level;if('invul'in v)invul=v.invul;}
export function input(x,y){joy.x=x;joy.y=y;}`;
const app=await import(dataURL(game));
await Promise.all([app.ensureCharacter('girl'),app.ensureCharacter('boy')]);
function check(name,fn){try{fn();count++;console.log('OK',name);}catch(e){console.error('FAIL',name,e.message);process.exit(1);}}
function advance(seconds){const steps=Math.ceil(seconds/.016);for(let i=0;i<steps;i++){clock+=seconds/steps;frame(clock*1000);}}
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
check('both original GLBs load and receive real skin attributes',()=>{
  const {rigs}=app.inspect();assert.ok(rigs.girl&&rigs.boy);
  for(const rig of Object.values(rigs)){assert.equal(rig.skeleton.bones.length,17);let meshes=0;rig.object.traverse(m=>{if(m.isSkinnedMesh){meshes++;const w=m.geometry.getAttribute('skinWeight');assert.ok(w);for(let i=0;i<w.count;i+=137)close(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i),1);}});assert.ok(meshes>80);}
});
check('character arrows and swipe retain the two original heroes',()=>{
  app.switchChoice(1);assert.equal(element('choice-name').textContent,'ЗАХАР');
  element('carousel').emit('pointerdown',{pointerId:1,clientX:200,clientY:300});element('carousel').emit('pointerup',{pointerId:1,clientX:90,clientY:305});assert.equal(element('choice-name').textContent,'МИРА');
});
check('main item selector contains sausage and plane only',()=>{
  element('select').onclick();assert.equal(app.inspect().step,'item');app.switchChoice(1);assert.equal(element('choice-name').textContent,'САМОЛЁТИК');app.switchChoice(1);assert.equal(element('choice-name').textContent,'СОСИСКА');
});
app.startGame();
check('game begins with five lives, ten bombs and the first difficulty',()=>{const s=app.inspect();assert.equal(s.lives,5);assert.equal(s.progress.bombs,10);assert.equal(s.level,0);assert.equal(s.mode,'play');});
check('camera can rotate during running without changing joystick ownership',()=>{
  app.input(0,-1);advance(.5);const before=app.inspect(),start=before.player.position.clone(),yaw=before.cameraYaw;
  const canvas=document.body.children.find(e=>e.id==='canvas');canvas.emit('pointerdown',{pointerId:11,clientX:200,clientY:300});canvas.emit('pointermove',{pointerId:11,clientX:260,clientY:300});canvas.emit('pointerup',{pointerId:11});advance(.5);
  const after=app.inspect();assert.notEqual(after.cameraYaw,yaw);assert.ok(after.player.position.distanceTo(start)>1.5);assert.ok(after.moveAmount>.9);
});
check('two-pointer zoom respects both limits',()=>{
  const canvas=document.body.children.find(e=>e.id==='canvas');
  canvas.emit('pointerdown',{pointerId:21,clientX:100,clientY:200});canvas.emit('pointerdown',{pointerId:22,clientX:200,clientY:200});
  canvas.emit('pointermove',{pointerId:22,clientX:800,clientY:200});close(app.inspect().cameraDistance,2.5);
  canvas.emit('pointermove',{pointerId:22,clientX:112,clientY:200});close(app.inspect().cameraDistance,9);
  canvas.emit('pointerup',{pointerId:21});canvas.emit('pointerup',{pointerId:22});
});
check('throw overlay preserves running and bent knees',()=>{
  app.input(0,-1);advance(.4);const start=app.inspect().player.position.clone();app.throwItem();advance(.22);
  const state=app.inspect();assert.ok(state.player.position.distanceTo(start)>.6);assert.ok(state.shots.length>0);assert.equal(state.avatar.state,'THROW');assert.ok(state.avatar.bones.some(b=>b.name.startsWith('shin')&&b.rotation.x>.15));
});
app.input(0,0);advance(.7);
check('skin matrices stay finite in idle, run, throw, hit and bomb states',()=>{
  for(const rig of Object.values(app.inspect().rigs)){
    for(const kind of ['normal','bomb']){rig.throw(kind,true);rig.hit();for(let i=0;i<45;i++){rig.update(.016,1);rig.object.updateMatrixWorld(true);rig.skeleton.update();assert.ok(Array.from(rig.skeleton.boneMatrices).every(Number.isFinite));}}
  }
});
check('the spawner obeys the level cap and safe initial distance',()=>{
  app.startLevel();for(let i=0;i<20;i++)app.spawnCat();const s=app.inspect();assert.equal(s.catList.length,3);for(const c of s.catList){assert.ok(c.o.position.distanceTo(s.player.position)>=12);assert.ok(c.o.position.z>s.player.position.z);close(c.speed,.8);}
});
check('ordinary throws cannot select cats behind the character',()=>{
  app.startLevel();app.fixture({heading:0,moving:0});app.spawnCat();const c=app.inspect().catList[0];c.o.position.copy(app.inspect().player.position).add({x:0,y:0,z:-3});
  app.releaseItem({kind:'sausage'});const shot=app.inspect().shots.at(-1);assert.ok(shot.v.z>0);close(shot.v.x,0);
});
check('bomb toggle reuses the attack button and switches back',()=>{
  element('bomb-select').onclick();assert.equal(element('bomb-select').attributes['aria-pressed'],'true');assert.equal(element('item-symbol').textContent,'💣');
  element('bomb-select').onclick();assert.equal(element('bomb-select').attributes['aria-pressed'],'false');assert.equal(element('item-symbol').textContent,'🌭');
});
check('using the last bomb preserves its pending throw and selects the primary',()=>{
  const s=app.inspect();s.progress.bombs=1;element('bomb-select').onclick();app.fixture({shot:0});app.throwItem();assert.equal(app.inspect().pendingThrow.kind,'bomb');assert.equal(s.progress.bombs,0);assert.equal(element('item-symbol').textContent,'🌭');
});
check('running leaves bombs behind; standing throws them forward',()=>{
  app.startLevel();app.fixture({heading:0,moving:1});app.releaseItem({kind:'bomb'});let shot=app.inspect().shots.at(-1);assert.ok(shot.o.position.z<app.inspect().player.position.z);assert.ok(shot.v.z<0);
  app.fixture({moving:0});app.releaseItem({kind:'bomb'});assert.ok(app.inspect().shots.at(-1).v.z>0);
});
check('bomb fuse starts on landing and an explosion counts multiple cats without HEADSHOT',()=>{
  app.startLevel();app.fixture({heading:0,moving:0});app.releaseItem({kind:'bomb'});let bomb=app.inspect().shots[0];
  for(let i=0;i<200&&!bomb.landed;i++)app.updateShots(.01);assert.equal(bomb.landed,true);
  for(let i=0;i<3;i++)app.spawnCat();const cats=app.inspect().catList;
  cats[0].o.position.copy(bomb.o.position);cats[1].o.position.copy(bomb.o.position).add({x:2,y:0,z:0});cats[2].o.position.copy(bomb.o.position).add({x:3.5,y:0,z:0});
  app.updateShots(1.99);assert.equal(app.inspect().progress.kills,0);app.updateShots(.02);assert.equal(app.inspect().progress.kills,2);assert.equal(app.inspect().progress.headshots,0);assert.equal(cats[2].flee,false);
});
check('the actual head collider awards HEADSHOT and its two-point bonus',()=>{
  app.startLevel();app.fixture({heading:0,moving:0});app.spawnCat();const s=app.inspect(),c=s.catList[0];c.o.position.set(s.player.position.x,0,s.player.position.z+4);c.o.rotation.y=Math.PI;
  const T=awaitThree;const head=c.o.userData.headCenter(new T.Vector3());app.releaseItem({kind:'sausage'});const shot=app.inspect().shots.at(-1);shot.o.position.set(head.x,head.y,head.z-1);shot.v.set(0,0,20);shot.gravity=0;
  const points=s.progress.points;app.updateShots(.1);assert.equal(c.flee,true);assert.equal(s.progress.headshots,1);assert.equal(s.progress.points-points,3);
});
check('contact cannot remove two lives during the protection window',()=>{
  app.startLevel();app.fixture({invul:0});app.spawnCat();app.spawnCat();const s=app.inspect();for(const c of s.catList)c.o.position.copy(s.player.position);const lives=s.lives;app.updateCats(.016);assert.equal(app.inspect().lives,lives-1);app.updateCats(.016);assert.equal(app.inspect().lives,lives-1);
});
check('all six cat variants have finite articulated poses and individual colliders',()=>{
  const props=globalThis.__propsModule;for(let i=0;i<6;i++){const cat=props.createCat(i);for(let k=0;k<120;k++)cat.userData.animate(.016,.8+i*.3,k*.016,k>80);cat.updateMatrixWorld(true);cat.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));assert.ok(cat.userData.headRadius>0);}
});
check('actual game loop completes all five levels and resets ten bombs each time',()=>{
  app.returnToMenu();app.startGame();
  for(let level=0;level<5;level++){
    assert.equal(app.inspect().level,level);assert.equal(app.inspect().progress.bombs,10);
    const needed=[5,8,12,16,20][level];for(let j=0;j<needed;j++){assert.equal(app.spawnCat(),true);const c=app.inspect().catList.find(c=>!c.flee);app.flee(c,true);app.updateCats(3);}
    advance(1.35);
  }
  assert.equal(app.inspect().mode,'end');assert.equal(app.inspect().progress.totalKills,61);
});
console.log(`PASS: ${count} actual-runtime checks (GPU rendering excluded)`);
