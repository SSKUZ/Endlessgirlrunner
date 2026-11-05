// Shared deterministic gameplay rules. Rendering and input stay in the V2 loop.
export const LEVELS=[
  {name:'Солнечный двор',need:5,rate:4.5,speed:.8,cap:3,assist:15,color:'#d7e7d6'},
  {name:'Городская улица',need:8,rate:3.8,speed:1.1,cap:4,assist:12,color:'#d5e3e8'},
  {name:'Зелёная аллея',need:12,rate:3,speed:1.5,cap:6,assist:10,color:'#d8e8d3'},
  {name:'Лесопарк',need:16,rate:2.3,speed:1.9,cap:8,assist:8,color:'#c7d9cc'},
  {name:'Кошачий фестиваль',need:20,rate:1.7,speed:2.3,cap:11,assist:6,color:'#e5dfd8'}];
export const PLAYER_SPEED=4.0,BOMB_RADIUS=3,BOMB_FUSE=2,INVULNERABILITY=2.6;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function cameraMovement(x,y,yaw){
  const length=Math.hypot(x,y),n=Math.max(1,length);
  return {x:(-Math.cos(yaw)*x-Math.sin(yaw)*y)/n,z:(Math.sin(yaw)*x-Math.cos(yaw)*y)/n,amount:Math.min(1,length)};
}
export function assistedYaw(yaw,origin,targets,degrees,maxRange){
  const cone=degrees*Math.PI/180;let chosen=null,best=Infinity;
  for(const target of targets){
    if(target.flee||target.defeated)continue;
    const p=target.position,dx=p.x-origin.x,dz=p.z-origin.z,d=Math.hypot(dx,dz);
    if(d<.2||d>maxRange)continue;
    const angle=Math.atan2(dx,dz),difference=wrap(angle-yaw);
    if(Math.abs(difference)>cone)continue;
    const rank=Math.abs(difference)/cone+d/maxRange*.12;
    if(rank<best){chosen={yaw:yaw+difference,distance:d,target};best=rank;}
  }
  return chosen||{yaw,distance:null,target:null};
}
export function segmentSphere(a,b,c,r){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-c.x,oy=a.y-c.y,oz=a.z-c.z;
  const A=dx*dx+dy*dy+dz*dz,C=ox*ox+oy*oy+oz*oz-r*r;
  if(C<=0)return 0;if(A<1e-12)return null;
  const B=2*(ox*dx+oy*dy+oz*dz),disc=B*B-4*A*C;
  if(disc<0)return null;const t=(-B-Math.sqrt(disc))/(2*A);return t>=0&&t<=1?t:null;
}
export function sausageVelocity(height,targetDistance=null,catSpeed=0){
  const speed=9,gravity=9.8;
  let up=2.35;
  if(targetDistance!==null){
    const t=clamp(targetDistance/(speed+catSpeed),.22,.85);
    up=clamp((.76-height+.5*gravity*t*t)/t,-.65,2.9);
  }
  return {speed,up,gravity};
}
export function planeFlight(age,seed=0){
  const turn=Math.sin(seed*13.37),broad=Math.cos(seed*9.7)>.45;
  return {speed:Math.max(3.8,9.0*(1-.17*age)),
    yawOffset:Math.sin(age*1.3+seed)*.065+(broad?turn*.13*age:turn*.025*age),
    height:.28*(1-Math.exp(-3*age))-.38*age-.13*age*age,
    bank:Math.sin(age*1.3+seed)*.10+(broad?turn*.10:0)};
}
export function zoomDistance(original,initialSpan,currentSpan){return clamp(original*initialSpan/Math.max(12,currentSpan),2.5,9);}
export function insideExplosion(bomb,cat,radius=BOMB_RADIUS){return Math.hypot(bomb.x-cat.x,bomb.z-cat.z)<=radius;}
export class Progress {
  constructor(){this.reset();}
  reset(){this.level=0;this.kills=0;this.totalKills=0;this.points=0;this.headshots=0;this.bombs=10;this.defeated=new Set();}
  startLevel(index){this.level=index;this.kills=0;this.bombs=10;this.defeated.clear();}
  consumeBomb(){if(this.bombs<=0)return false;this.bombs--;return true;}
  defeat(id,headshot=false){
    if(this.defeated.has(id))return {counted:false,bonusBomb:false};this.defeated.add(id);
    this.kills++;this.totalKills++;this.points+=headshot?3:1;
    let bonusBomb=false;if(headshot){this.headshots++;if(this.headshots%3===0){this.bombs++;bonusBomb=true;}}
    return {counted:true,bonusBomb};
  }
  get complete(){return this.kills>=LEVELS[this.level].need;}
}
