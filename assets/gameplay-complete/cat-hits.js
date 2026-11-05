import * as T from 'three';
import {segmentSphere,segmentBox} from './mechanics.mjs?v=body-hit-2';

// Follow the rendered anatomy, including articulated paws and the moving tail.
// There is no single small body sphere and no blanket headshot priority.
const cats=new WeakMap(),curveSamples=new WeakMap();
const inverse=new T.Matrix4(),scale=new T.Vector3(),rootScale=new T.Vector3();
const localStart=new T.Vector3(),localEnd=new T.Vector3(),center=new T.Vector3();
const minimum=new T.Vector3(),maximum=new T.Vector3(),origin=new T.Vector3();
const probeStart=new T.Vector3(),probeEnd=new T.Vector3();
const probes={
  sausage:[[-.22,0,0,.12],[0,0,0,.12],[.22,0,0,.12]],
  plane:[[0,0,.44,.10],[0,0,.20,.13],[0,0,-.13,.13],[-.25,0,-.28,.14],[.25,0,-.28,.14]]
};

function volumesFor(cat){
  if(cats.has(cat))return cats.get(cat);
  const volumes=[];
  cat.traverse(mesh=>{
    if(!mesh.isMesh)return;
    let head=false;
    for(let parent=mesh;parent&&parent!==cat;parent=parent.parent)if(parent===cat.userData.head){head=true;break;}
    const geometry=mesh.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const volume={mesh,head,box:geometry.boundingBox,type:geometry.type};
    if(geometry.type==='TubeGeometry'&&geometry.parameters.path){
      if(!curveSamples.has(geometry))curveSamples.set(geometry,geometry.parameters.path.getPoints(16));
      volume.points=curveSamples.get(geometry);volume.radius=geometry.parameters.radius;
    }
    volumes.push(volume);
  });
  cats.set(cat,volumes);return volumes;
}

function earlier(current,candidate){
  if(!current||candidate.fraction<current.fraction-1e-7||
    (Math.abs(candidate.fraction-current.fraction)<=1e-7&&!candidate.head))return candidate;
  return current;
}

export function intersectCatSegment(cat,start,end,projectileRadius,worldReady=false){
  if(!worldReady)cat.updateWorldMatrix(true,true);
  rootScale.setFromMatrixScale(cat.matrixWorld);center.set(0,.55,0).applyMatrix4(cat.matrixWorld);
  if(segmentSphere(start,end,center,1.25*Math.max(rootScale.x,rootScale.y,rootScale.z)+projectileRadius)===null)return null;
  let hit=null;
  for(const volume of volumesFor(cat)){
    const {mesh,head}=volume;scale.setFromMatrixScale(mesh.matrixWorld);
    inverse.copy(mesh.matrixWorld).invert();localStart.copy(start).applyMatrix4(inverse);localEnd.copy(end).applyMatrix4(inverse);
    // A little body-only tolerance makes grazing a leg fair for a child.
    const padding=projectileRadius+(head?0:.015);
    const px=padding/Math.max(scale.x,1e-7),py=padding/Math.max(scale.y,1e-7),pz=padding/Math.max(scale.z,1e-7);
    let fraction=null;
    if(volume.type==='SphereGeometry'){
      const r=mesh.geometry.parameters.radius;
      localStart.set(localStart.x/(r+px),localStart.y/(r+py),localStart.z/(r+pz));
      localEnd.set(localEnd.x/(r+px),localEnd.y/(r+py),localEnd.z/(r+pz));
      origin.set(0,0,0);fraction=segmentSphere(localStart,localEnd,origin,1);
    }else if(volume.points){
      const radius=volume.radius+Math.max(px,py,pz)+.02;
      for(const point of volume.points){const t=segmentSphere(localStart,localEnd,point,radius);if(t!==null&&(fraction===null||t<fraction))fraction=t;}
    }else{
      minimum.set(volume.box.min.x-px,volume.box.min.y-py,volume.box.min.z-pz);maximum.set(volume.box.max.x+px,volume.box.max.y+py,volume.box.max.z+pz);
      fraction=segmentBox(localStart,localEnd,minimum,maximum);
    }
    if(fraction!==null)hit=earlier(hit,{fraction,head});
  }
  if(hit)hit.point=new T.Vector3().lerpVectors(start,end,hit.fraction);
  return hit;
}

export function intersectProjectileCat(cat,kind,previous,next,previousRotation,nextRotation){
  cat.updateWorldMatrix(true,true);let hit=null;
  for(const [x,y,z,radius] of probes[kind]||probes.sausage){
    probeStart.set(x,y,z).applyQuaternion(previousRotation).add(previous);
    probeEnd.set(x,y,z).applyQuaternion(nextRotation).add(next);
    const candidate=intersectCatSegment(cat,probeStart,probeEnd,radius,true);
    if(candidate)hit=earlier(hit,candidate);
  }
  return hit;
}
