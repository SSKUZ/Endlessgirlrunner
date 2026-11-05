import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
const loader=new GLTFLoader();
const MODEL_VERSION='b3ac37b';

// The immutable V2 GLBs have no skins. Bake their existing node transforms,
// then add a small runtime skeleton and normalized four-influence skin weights.
// No vertices, faces, materials or facial features are replaced.
export async function loadCharacter(name){
  const gltf=await loader.loadAsync(`assets/characters/${name}_avatar_v2.glb?v=${MODEL_VERSION}`);
  const source=gltf.scene;source.updateMatrixWorld(true);
  const root=new T.Group(),bones=[],ids={},rest={};
  function bone(key,parent,xyz){
    const b=new T.Bone();b.name=key;ids[key]=bones.length;bones.push(b);
    const point=new T.Vector3(...xyz),parentPoint=parent?rest[parent]:new T.Vector3();
    b.position.copy(point).sub(parentPoint);rest[key]=point;
    if(parent)bones[ids[parent]].add(b);else root.add(b);
    return b;
  }
  bone('hips',null,[0,.64,0]);bone('spine','hips',[0,.82,0]);
  bone('chest','spine',[0,.99,-.004]);bone('neck','chest',[0,1.055,-.002]);
  bone('head','neck',[0,1.195,0]);
  for(const side of [-1,1]){
    const s=side===1?'L':'R';
    bone(`thigh${s}`,'hips',[side*.066,.585,0]);
    bone(`shin${s}`,`thigh${s}`,[side*.069,.35,-.006]);
    bone(`foot${s}`,`shin${s}`,[side*.066,.11,0]);
    bone(`arm${s}`,'chest',[side*.108,.968,-.004]);
    bone(`forearm${s}`,`arm${s}`,[side*.18,.782,.003]);
    bone(`hand${s}`,`forearm${s}`,[side*.228,.619,.020]);
  }
  root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);
  const allBounds=new T.Box3();
  function bodyWeights(y){
    if(y<.70)return [['hips',1]];
    if(y<.90){const w=smooth(.70,.90,y);return [['hips',1-w],['spine',w]];}
    const w=smooth(.90,1.01,y);return [['spine',1-w],['chest',w]];
  }
  function armWeights(y,s){
    if(y<.655){const w=smooth(.608,.665,y);return [[`hand${s}`,1-w],[`forearm${s}`,w]];}
    const w=smooth(.742,.823,y);return [[`forearm${s}`,1-w],[`arm${s}`,w]];
  }
  function legWeights(x,y){
    const s=x>=0?'L':'R';
    if(y>.53){const w=smooth(.53,.625,y);return [[`thigh${s}`,1-w],['hips',w]];}
    if(y<.15){const w=smooth(.095,.16,y);return [[`foot${s}`,1-w],[`shin${s}`,w]];}
    const w=smooth(.302,.405,y);return [[`shin${s}`,1-w],[`thigh${s}`,w]];
  }
  const headPattern=/head|cranium|ear_|eye|iris|lash|brow|(?:^|_)lip(?:_|$)|smile|nostril|hair|braid|elastic|glasses|lock|strand|wisp|gathering/;
  source.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);
    geometry.computeBoundingBox();allBounds.union(geometry.boundingBox);
    const p=geometry.getAttribute('position'),indices=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);
    const label=o.name.toLowerCase();
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),side=x>=0?'L':'R';let w;
      if(headPattern.test(label))w=[['head',1]];
      else if(label.includes('neck_contoured')){const a=smooth(1.032,1.09,y);w=[['chest',1-a],['head',a]];}
      else if(/hand|watch/.test(label))w=[[`hand${side}`,1]];
      else if(/continuous_arm|sleeve/.test(label))w=armWeights(y,side);
      else if(/trouser|shoe|slipon|sock|sole|foot/.test(label))w=legWeights(x,y);
      else if(label.includes('tshirt_seamless')&&Math.abs(x)>.105&&y>.855){
        const a=smooth(.105,.157,Math.abs(x));w=[['chest',1-a],[`arm${side}`,a]];
      }else w=bodyWeights(y);
      let total=0;for(const [,v] of w)total+=v;
      for(let k=0;k<w.length;k++){indices[i*4+k]=ids[w[k][0]];weights[i*4+k]=w[k][1]/total;}
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const skinned=new T.SkinnedMesh(geometry,o.material);skinned.name=o.name;
    skinned.castShadow=true;skinned.receiveShadow=true;skinned.frustumCulled=false;
    root.add(skinned);root.updateMatrixWorld(true);skinned.bind(skeleton);
  });
  const size=allBounds.getSize(new T.Vector3()),center=allBounds.getCenter(new T.Vector3());
  const scale=1.65/size.y;root.scale.setScalar(scale);
  root.position.set(-center.x*scale,-allBounds.min.y*scale,-center.z*scale);
  const container=new T.Group();container.add(root);container.name=name;
  let phase=0,elapsed=0,throwTime=-1,hitTime=0;
  const b=key=>bones[ids[key]],target={};
  function rotation(key,x=0,y=0,z=0){target[key]=[x,y,z];}
  const rig={object:container,skeleton,bones,state:'IDLE',
    throw(){throwTime=0;},hit(){hitTime=.38;},
    handWorld(out=new T.Vector3()){container.updateMatrixWorld(true);return b('handR').getWorldPosition(out);},
    update(dt,speed=0){
      elapsed+=dt;const moving=speed>.05,run=speed>.58;
      phase+=dt*(moving?(run?10.8:6.6):1.2);
      const a=moving?(run?.70:.36):0,cycle=Math.sin(phase);
      for(const key in ids)rotation(key);
      rotation('spine',moving?(run?.115:.045):Math.sin(elapsed*1.7)*.008,0,moving?cycle*.025:0);
      rotation('chest',0,moving?cycle*.045:0,0);
      rotation('head',Math.sin(elapsed*1.3)*.012,Math.sin(elapsed*.72)*.05,0);
      for(const side of [-1,1]){
        const s=side===1?'L':'R',p=phase+(side===1?0:Math.PI),swing=Math.sin(p);
        rotation(`thigh${s}`,swing*a);
        rotation(`shin${s}`,moving?.10+Math.max(0,-swing)*(run?1.05:.48):.025);
        rotation(`foot${s}`,moving?-Math.max(0,swing)*.20:0);
        rotation(`arm${s}`,-swing*a*.88,0,-side*(moving?.22:.04));
        rotation(`forearm${s}`,moving?(run?-.94:-.35)+swing*.12:-.08);
      }
      rig.state=moving?(run?'RUN':'WALK'):'IDLE';
      if(throwTime>=0){
        throwTime+=dt;rig.state='THROW';
        if(throwTime<.17){const q=throwTime/.17;rotation('armR',.45*q,-.12,-.10);rotation('forearmR',-.95);rotation('chest',.03,-.15*q,0);}
        else{const q=Math.min(1,(throwTime-.17)/.34);rotation('armR',-1.55+q*.85,.08,.08);rotation('forearmR',-.12-q*.35);rotation('chest',.05,.13*(1-q),0);}
        if(throwTime>.54)throwTime=-1;
      }
      if(hitTime>0){hitTime-=dt;rig.state='HIT';const q=Math.max(0,hitTime/.38);rotation('spine',-.12*q,0,Math.sin(q*Math.PI)*.15);rotation('head',.12*q);}
      const alpha=1-Math.exp(-dt*22);
      for(const [key,angles] of Object.entries(target)){
        const r=b(key).rotation;r.x=T.MathUtils.lerp(r.x,angles[0],alpha);r.y=T.MathUtils.lerp(r.y,angles[1],alpha);r.z=T.MathUtils.lerp(r.z,angles[2],alpha);
      }
      b('hips').position.y=.64+(moving?Math.abs(Math.cos(phase))*(run?.027:.013):Math.sin(elapsed*2)*.003);
    }
  };
  return rig;
}
