import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LEVELS,PLAYER_SPEED,BOMB_RADIUS,BOMB_FUSE,INVULNERABILITY,Progress,assistedYaw,cameraMovement,segmentSphere,segmentBox,sausageVelocity,planeFlight,zoomDistance,insideExplosion} from '../assets/gameplay-complete/mechanics.mjs';
let count=0;
function check(name,test){test();count++;console.log('OK',name);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
check('five requested difficulty curves',()=>{
  assert.deepEqual(LEVELS.map(x=>x.speed),[.8,1.1,1.5,1.9,2.3]);assert.deepEqual(LEVELS.map(x=>x.cap),[3,4,6,8,11]);
  assert.deepEqual(LEVELS.map(x=>x.rate),[4.5,3.8,3,2.3,1.7]);assert.deepEqual(LEVELS.map(x=>x.need),[5,8,12,16,20]);
});
check('running increases separation from every cat speed',()=>{for(const level of LEVELS)assert.ok(10+10*PLAYER_SPEED-10*level.speed>10);});
check('movement follows camera in all four directions',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){const v=cameraMovement(0,-1,yaw);close(v.x,Math.sin(yaw));close(v.z,Math.cos(yaw));const reverse=cameraMovement(0,1,yaw);close(reverse.x,-v.x);close(reverse.z,-v.z);}
  const diagonal=cameraMovement(1,-1,.8);close(Math.hypot(diagonal.x,diagonal.z),1);
});
check('pinch zoom clamps to 2.5–9 metres',()=>{close(zoomDistance(5,100,200),2.5);close(zoomDistance(5,100,20),9);close(zoomDistance(5,100,125),4);});
check('assist never targets a cat behind or outside its cone',()=>{
  for(const level of LEVELS){
    assert.equal(assistedYaw(0,{x:0,z:0},[{position:{x:0,z:-3}}],level.assist,15).target,null);
    assert.equal(assistedYaw(0,{x:0,z:0},[{position:{x:3,z:0}}],level.assist,15).target,null);
    const angle=level.assist*.5*Math.PI/180,hit=assistedYaw(0,{x:0,z:0},[{position:{x:Math.sin(angle)*5,z:Math.cos(angle)*5}}],level.assist,15);close(hit.yaw,angle);
  }
});
check('fleeing cats and distant cats do not attract assist',()=>{assert.equal(assistedYaw(0,{x:0,z:0},[{position:{x:0,z:4},flee:true},{position:{x:0,z:22}}],15,8).target,null);});
check('default sausage trajectory lands at six to eight metres',()=>{
  for(const height of [.8,1,1.3]){const p=sausageVelocity(height),t=(p.up+Math.sqrt(p.up*p.up+2*p.gravity*height))/p.gravity;assert.ok(p.speed*t>=6&&p.speed*t<=8);}
});
check('planes rise then glide down farther than sausages',()=>{
  assert.ok(planeFlight(.06).height>0);assert.ok(planeFlight(1).height<planeFlight(.3).height);
  for(let seed=0;seed<12;seed++){
    let d=0,t=0;while(t<3&&1+planeFlight(t,seed).height>.07){const p=planeFlight(t,seed);assert.ok(Math.abs(p.yawOffset)<Math.PI/2);d+=p.speed*Math.max(0,Math.min(1,(15-d)/2))*.005;t+=.005;}
    assert.ok(d>10&&d<=15.01,`range ${d}`);
  }
});
check('swept collision catches fast shots and rejects misses',()=>{
  assert.notEqual(segmentSphere({x:0,y:1,z:0},{x:0,y:1,z:10},{x:0,y:1,z:5},.25),null);
  assert.equal(segmentSphere({x:0,y:1,z:0},{x:0,y:1,z:10},{x:1,y:1,z:5},.25),null);
});
check('swept boxes include limbs and reject empty surrounding space',()=>{
  const boxMin={x:-.06,y:0,z:-.05},boxMax={x:.06,y:.2,z:.05};
  assert.notEqual(segmentBox({x:-1,y:.1,z:0},{x:1,y:.1,z:0},boxMin,boxMax),null);
  assert.equal(segmentBox({x:-1,y:.3,z:0},{x:1,y:.3,z:0},boxMin,boxMax),null);
  assert.equal(segmentBox({x:0,y:.1,z:0},{x:0,y:.1,z:.01},boxMin,boxMax),0);
});
check('head and body volumes distinguish precise high hits',()=>{
  const a={x:0,y:.75,z:0},b={x:0,y:.75,z:2};assert.notEqual(segmentSphere(a,b,{x:0,y:.75,z:1},.23),null);
  assert.equal(segmentSphere(a,b,{x:0,y:.32,z:1},.32),null);
});
check('bombs affect all cats within three metres',()=>{
  close(BOMB_RADIUS,3);close(BOMB_FUSE,2);
  const targets=[{x:0,z:0},{x:2.9,z:0},{x:0,z:3},{x:3.1,z:0}];assert.equal(targets.filter(c=>insideExplosion({x:0,z:0},c)).length,3);
});
check('ten bombs per level, no negative stock',()=>{
  const p=new Progress();for(let i=0;i<10;i++)assert.equal(p.consumeBomb(),true);assert.equal(p.consumeBomb(),false);close(p.bombs,0);p.startLevel(1);close(p.bombs,10);
});
check('headshot is two bonus points, one kill, every third gives a bomb',()=>{
  const p=new Progress();p.defeat('a',true);close(p.points,3);close(p.kills,1);assert.equal(p.defeat('a',true).counted,false);p.defeat('b',true);assert.equal(p.defeat('c',true).bonusBomb,true);close(p.bombs,11);close(p.kills,3);
});
check('headshot progress persists between levels; old bomb stock does not',()=>{
  const p=new Progress();p.defeat('a',true);p.defeat('b',true);p.bombs=17;p.startLevel(1);close(p.headshots,2);close(p.bombs,10);p.defeat('c',true);close(p.bombs,11);
});
check('explosions count each cat once without headshots',()=>{
  const p=new Progress();for(const id of [1,2,3,1,2])p.defeat(id,false);close(p.kills,3);close(p.points,3);close(p.headshots,0);
});
check('all five levels complete by kills, not bonus points',()=>{
  const p=new Progress();for(let i=0;i<5;i++){p.startLevel(i);for(let j=0;j<LEVELS[i].need-1;j++)p.defeat(`${i}-${j}`,true);assert.equal(p.complete,false);p.defeat(`${i}-last`,true);assert.equal(p.complete,true);}close(p.totalKills,61);
});
check('contact protection is between two and three seconds',()=>{assert.ok(INVULNERABILITY>=2&&INVULNERABILITY<=3);});
const html=await readFile(new URL('../game_complete.html',import.meta.url),'utf8');
check('bomb control belongs to gameplay, not the two-item main selector',()=>{
  const selection=html.slice(html.indexOf('<main'),html.indexOf('</main>'));assert.ok(!selection.includes('bomb-select'));assert.ok(html.includes('id="bomb-select"'));assert.ok(!/reticle|crosshair|landing-marker|trajectory-marker/.test(html));
});
console.log(`PASS: ${count} complete-game checks`);
