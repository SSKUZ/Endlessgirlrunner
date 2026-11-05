import * as T from 'three';

const cache=new Map();
const G={box:new T.BoxGeometry(1,1,1),ball:new T.SphereGeometry(1,14,10),
  cylinder:new T.CylinderGeometry(1,1,1,10),cone:new T.ConeGeometry(1,1,10),
  ear:new T.ConeGeometry(1,1,3),trunk:new T.CylinderGeometry(.55,1,1,10),sausage:new T.CapsuleGeometry(.095,.43,5,16),
  stripe:new T.TorusGeometry(1,.055,5,18),plane:new T.PlaneGeometry(1,1)};
export function material(color,roughness=.8){
  const key=`${color}:${roughness}`;if(!cache.has(key))cache.set(key,new T.MeshStandardMaterial({color,roughness}));return cache.get(key);
}
function add(parent,geometry,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1){
  const o=new T.Mesh(geometry,mat);o.position.set(x,y,z);o.scale.set(sx,sy,sz);
  o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function texture(kind){
  if(cache.has(kind))return cache.get(kind);
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  ctx.fillStyle=kind==='sausage'?'#d08b69':'#f4f1e9';ctx.fillRect(0,0,128,128);
  let seed=kind==='sausage'?71:19;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<750;i++){
    const x=rand()*128,y=rand()*128;
    ctx.strokeStyle=kind==='sausage'?`rgba(106,40,30,${rand()*.12})`:`rgba(90,73,54,${rand()*.08})`;
    ctx.lineWidth=kind==='sausage'?.6:.45;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*2,y+2+rand()*7);ctx.stroke();
  }
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;
  cache.set(kind,t);return t;
}

export function createItem(kind){
  const g=new T.Group();g.name=kind;
  if(kind==='bomb')return createBomb();
  if(kind==='sausage'){
    if(!cache.has('sausageMat'))cache.set('sausageMat',new T.MeshStandardMaterial({color:'#e8aa87',map:texture('sausage'),roughness:.36}));
    const meat=cache.get('sausageMat');const body=add(g,G.sausage,meat);body.rotation.z=Math.PI/2;
    for(const s of [-1,1]){
      const tip=add(g,G.ball,meat,s*.325,0,0,.035,.055,.055);tip.rotation.z=s*.3;
      const tie=add(g,G.cylinder,material('#b6684a',.48),s*.35,0,0,.018,.028,.018);tie.rotation.z=Math.PI/2;
    }
    for(let i=0;i<3;i++){
      const ring=add(g,G.stripe,material('#b96e50',.55),(i-1)*.12,0,0,.09,.09,.045);ring.rotation.y=Math.PI/2;
    }
  }else{
    if(!cache.has('paperGeometry')){
      // Each triangle is a real fold: raised spine, inner crease, swept wings,
      // sharp nose and a downward keel. Model forward is +Z throughout V2.
      const faces=[
        [0,.035,.53,-.12,.035,-.34,-.39,-.018,-.40],
        [0,.035,.53,.39,-.018,-.40,.12,.035,-.34],
        [0,.035,.53,0,.10,-.28,-.12,.035,-.34],
        [0,.035,.53,.12,.035,-.34,0,.10,-.28],
        [0,.035,.53,0,-.095,-.30,-.12,.035,-.34],
        [0,.035,.53,.12,.035,-.34,0,-.095,-.30]];
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(faces.flat(),3));geo.computeVertexNormals();
      cache.set('paperGeometry',geo);
      const paper=new T.MeshStandardMaterial({color:'#fffdf4',roughness:.72,side:T.DoubleSide});cache.set('paperMat',paper);
      const lines=[0,.035,.53,0,.10,-.28, 0,.035,.53,-.12,.035,-.34, 0,.035,.53,.12,.035,-.34,
        -.12,.035,-.34,-.39,-.018,-.40,.12,.035,-.34,.39,-.018,-.40];
      const crease=new T.BufferGeometry();crease.setAttribute('position',new T.Float32BufferAttribute(lines,3));cache.set('paperLines',crease);
      cache.set('creaseMat',new T.LineBasicMaterial({color:'#b5c4cb',transparent:true,opacity:.65}));
    }
    add(g,cache.get('paperGeometry'),cache.get('paperMat'));
    g.add(new T.LineSegments(cache.get('paperLines'),cache.get('creaseMat')));
  }
  return g;
}

const CAT_TYPES=[
  {coat:'#30343c',eye:'#b9d17b',head:1.0,body:.94,ears:1.12,tail:1.08,muzzle:.88},
  {coat:'#db8d42',eye:'#95ba77',head:1.07,body:1.03,ears:.96,tail:1.0,muzzle:1.04,stripes:true},
  {coat:'#d2ae5c',eye:'#77b4a1',head:1.10,body:1.06,ears:.90,tail:1.17,muzzle:1.08},
  {coat:'#8d99a5',eye:'#d2c57b',head:.95,body:.93,ears:1.16,tail:1.12,muzzle:.92},
  {coat:'#f1ece2',eye:'#91b7d0',head:1.02,body:1.0,ears:1.02,tail:.96,muzzle:1.0},
  {coat:'#e8dbc7',eye:'#b9b477',head:1.05,body:1.08,ears:.98,tail:.82,muzzle:1.05,patches:true}
];
export function createCat(variant=0){
  const cfg=CAT_TYPES[variant%6],root=new T.Group();
  const key='completeCoat'+variant;
  if(!cache.has(key))cache.set(key,new T.MeshStandardMaterial({color:cfg.coat,map:texture('fur'),roughness:.92}));
  const coat=cache.get(key),cream=material(variant===0?'#6f747d':'#f8ead8'),pink=material('#d89da0');
  add(root,G.ball,coat,0,.41,0,.26*cfg.body,.27,.43*cfg.body);
  if(cfg.patches){
    add(root,G.ball,material('#5a5758'),.22,.45,-.11,.075,.18,.23);
    add(root,G.ball,material('#ca8e4d'),-.21,.45,.15,.08,.18,.19);
  }
  if(cfg.stripes){for(let i=0;i<3;i++)add(root,G.stripe,material('#a86636'),0,.43,(i-1)*.17,.247,.247,.07);}
  const head=new T.Group();head.position.set(0,.69,.32);head.scale.setScalar(cfg.head);root.add(head);
  add(head,G.ball,coat,0,0,0,.277,.255,.24);
  if(cfg.patches)add(head,G.ball,material('#806852'),-.16,.04,.13,.125,.17,.14);
  for(const side of [-1,1]){
    const ear=add(head,G.ear,coat,side*.18,.257,0,.135,.22*cfg.ears,.135);ear.rotation.z=-side*.21;ear.rotation.y=Math.PI/4;
    const inner=add(head,G.ear,pink,side*.18,.266,.041,.078,.14*cfg.ears,.065);inner.rotation.z=-side*.21;inner.rotation.y=Math.PI/4;
    add(head,G.ball,cream,side*.078,-.079,.215,.10*cfg.muzzle,.074,.062);
    add(head,G.ball,material(cfg.eye,.33),side*.107,.046,.216,.073,.083,.026);
    add(head,G.ball,material('#20312e',.25),side*.107,.047,.240,variant===2?.027:.021,.059,.012);
    add(head,G.ball,material('#ffffff',.18),side*.092,.072,.252,.013,.014,.006);
    if(cfg.stripes){const mark=add(head,G.box,material('#a86636'),side*.12,.173,.159,.035,.063,.014);mark.rotation.z=-side*.38;}
  }
  add(head,G.ball,pink,0,-.045,.278,.038,.027,.021);
  const whiskers=[];for(const side of [-1,1])for(let j=0;j<3;j++)whiskers.push(side*.10,-.070-j*.017,.257,side*(variant===3?.36:.33),-.057+(j-1)*.041,.255);
  const lines=new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(whiskers,3));head.add(new T.LineSegments(lines,materialLine('#5f6466')));
  const smile=new T.BufferGeometry().setFromPoints([new T.Vector3(-.065,-.112,.258),new T.Vector3(0,-.124,.268),new T.Vector3(.065,-.112,.258)]);
  head.add(new T.Line(smile,materialLine('#9b7370')));
  const legs=[];
  for(const x of [-.17,.17])for(const z of [-.24,.24]){
    const hip=new T.Group();hip.position.set(x,.35,z);root.add(hip);
    add(hip,G.cylinder,coat,0,-.09,0,.062,.18,.062);
    const knee=new T.Group();knee.position.y=-.18;hip.add(knee);
    add(knee,G.cylinder,coat,0,-.09,0,.052,.18,.052);
    const paw=new T.Group();paw.position.y=-.18;knee.add(paw);
    add(paw,G.ball,variant===4||variant===5?cream:coat,0,.018,.026,.076,.055,.10);
    legs.push({hip,knee,paw,offset:x*z>0?0:.5});
  }
  const tail=new T.Group();tail.position.set(0,.46,-.35);tail.scale.setScalar(cfg.tail);root.add(tail);
  if(!G.tail)G.tail=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(),new T.Vector3(.10,.15,-.20),new T.Vector3(.18,.46,-.27),new T.Vector3(.08,.58,-.22)]),14,.045,7,false);
  add(tail,G.tail,coat);if(variant===2)tail.scale.multiplyScalar(1.08);
  let gait=0,reaction=0;
  root.userData.head=head;root.userData.headRadius=.235*cfg.head;
  root.userData.headCenter=out=>head.getWorldPosition(out);
  root.userData.hit=()=>{reaction=.32;};
  root.userData.animate=(dt,speed,time,scared=false)=>{
    const half=.115+Math.min(3,speed)*.018,cycleLength=2*half/.60;
    gait=(gait+dt*speed/cycleLength)%1;reaction=Math.max(0,reaction-dt);
    const bob=speed>.05?Math.abs(Math.sin(gait*Math.PI*2))*.010:0;root.position.y=bob;
    for(const leg of legs){
      const u=(gait+leg.offset)%1,stance=u<.60;
      const f=stance?u/.60:(u-.60)/.40;
      const z=stance?half*(1-2*f):-half+2*half*(f*f*(3-2*f));
      const y=-.29-bob+(stance?0:Math.sin(f*Math.PI)*.11);
      const reach=Math.min(.359,Math.hypot(y,z));
      const knee=Math.acos(T.MathUtils.clamp((reach*reach-2*.18*.18)/(2*.18*.18),-1,1));
      const upper=Math.atan2(-z,-y)-knee*.5;
      leg.hip.rotation.x=upper;leg.knee.rotation.x=knee;leg.paw.rotation.x=-upper-knee;
    }
    head.rotation.y=Math.sin(time*1.8+variant)*.055;head.rotation.z=Math.sin(time*2.4)*.025;
    head.rotation.x=scared?-.10:Math.sin(time*2)*.025;
    head.position.y=.69+Math.sin(reaction*28)*reaction*.07;
    tail.rotation.z=(scared?-.35:0)+Math.sin(time*3.8)*.16;tail.rotation.y=Math.sin(time*2.5)*.11;
  };
  return root;
}
function materialLine(color){const key='line'+color;if(!cache.has(key))cache.set(key,new T.LineBasicMaterial({color}));return cache.get(key);}

function createBomb(){
  const root=new T.Group();root.name='bomb';
  add(root,G.ball,material('#252b33',.39),0,0,0,.16,.16,.16);
  add(root,G.cylinder,material('#58534a',.65),0,.16,0,.037,.07,.037);
  if(!G.fuse)G.fuse=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0,.18,0),new T.Vector3(.025,.24,0),new T.Vector3(.06,.26,0)]),6,.012,5,false);
  add(root,G.fuse,material('#a78961'));
  const sparkMaterial=new T.MeshBasicMaterial({color:'#ffc954'}),spark=add(root,G.ball,sparkMaterial,.065,.265,0,.022,.022,.022);
  root.userData.tick=time=>{spark.scale.setScalar(.014+Math.abs(Math.sin(time*29))*.014);spark.position.y=.265+Math.sin(time*39)*.008;};
  return root;
}
export function createExplosion(){
  const root=new T.Group(),smoke=[];
  const flashMat=new T.MeshBasicMaterial({color:'#fff1ad',transparent:true,opacity:.9,depthWrite:false});
  const flash=add(root,G.ball,flashMat,0,.35,0,.1,.1,.1);flash.castShadow=false;
  const ringMat=new T.MeshBasicMaterial({color:'#efd6a3',transparent:true,opacity:.8,depthWrite:false});
  const ring=add(root,G.stripe,ringMat,0,.035,0,.1,.1,.1);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
  for(let i=0;i<7;i++){
    const mat=new T.MeshStandardMaterial({color:i%2?'#d2cdc1':'#e4ddca',roughness:1,transparent:true,opacity:.8,depthWrite:false});
    const puff=add(root,G.ball,mat);puff.castShadow=false;smoke.push(puff);
  }
  root.userData.tick=age=>{
    const u=Math.min(1,age/1.1);flash.visible=age<.17;flash.scale.setScalar(.2+age*5);flashMat.opacity=Math.max(0,1-age/.17);
    ring.scale.setScalar(.1+Math.min(1,age/.5)*3);ringMat.opacity=Math.max(0,.8*(1-age/.7));
    smoke.forEach((p,i)=>{const a=i*Math.PI*2/7;p.position.set(Math.cos(a)*u*1.2,.15+u*(.7+i%3*.15),Math.sin(a)*u*1.2);p.scale.setScalar(.16+u*.47);p.material.opacity=Math.max(0,.75*(1-u));});
  };
  return root;
}
function terrainTexture(kind){
  const key='terrain-'+kind;if(cache.has(key))return cache.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#eeeeeb';ctx.fillRect(0,0,128,128);let seed=347;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<900;i++){const x=rand()*128,y=rand()*128;ctx.strokeStyle=`rgba(60,66,57,${rand()*(kind==='grass'?.12:.07)})`;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rand()-.5)*3,y+(kind==='grass'?3:1));ctx.stroke();}
  if(kind==='path'){ctx.strokeStyle='#88888813';for(let i=0;i<=128;i+=32){ctx.strokeRect(0,i,64,32);ctx.strokeRect(64,i-16,64,32);}}
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='grass'?24:2,kind==='grass'?24:20);cache.set(key,t);return t;
}

// Reused primitives are collected into instanced batches for the environment.
export function buildEnvironment(level){
  const root=new T.Group(),batches=new Map();let seed=391+level*719;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function put(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    const key=shape+color;if(!batches.has(key)){let mat=material(color);if(shape==='box'&&sx>2&&sy<.25){mat=mat.clone();mat.map=terrainTexture(sx>80?'grass':color==='#75828a'?'road':'path');}batches.set(key,{shape,mat,matrices:[]});}
    const o=new T.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();batches.get(key).matrices.push(o.matrix.clone());
  }
  const grasses=['#91c47c','#87b676','#77b96d','#72a762','#88bd77'];
  put('box',grasses[level],0,-.11,0,110,.2,110);
  const road=level===1?'#75828a':level===3?'#bda37e':'#d7c9a6',width=level===1?5:level===3?3.5:5.5;
  put('box',road,0,.005,0,width,.03,100);
  for(const side of [-1,1]){
    put('box',level===1?'#ddd7c9':'#afd28f',side*(width*.5+.45),.012,0,.90,.045,100);
  }
  if(level!==1)for(let z=-44;z<45;z+=2.3)for(const side of [-1,1])put('ball',grasses[level],side*(width/2+.10+rand()*.22),.01,z,.30+rand()*.20,.03,.70+rand()*.40);
  if(level===1)for(let z=-44;z<45;z+=4)put('box','#eee7bd',0,.026,z,.10,.015,1.9);
  function tree(x,z,type=0){
    const h=1.8+rand()*1.1,lean=(rand()-.5)*.11;
    put('trunk',type?'#80725e':'#8d7155',x,h*.45,z,.15,h*.9,.15,lean,rand(),lean*.5);
    if(type){for(let j=0;j<3;j++)put('cone',j%2?'#40835c':'#55996a',x+lean*h,h*.68+j*.52,z,1.14-j*.18,1.50,1.14-j*.18);}
    else{
      for(const side of [-1,1])put('trunk','#8d7155',x+side*.20,h*.70,z,.065,h*.43,.065,0,0,-side*.56);
      const green=['#6aa663','#4e925c','#87b66b'][Math.floor(rand()*3)];
      put('ball',green,x+lean*h,h+.22,z,.89+rand()*.19,1.02+rand()*.18,.87+rand()*.15);
      for(let k=0;k<3;k++){const a=k*2.1+rand()*.4;put('ball',k%2?'#79b26d':'#579b60',x+Math.cos(a)*.46,h+.19+rand()*.40,z+Math.sin(a)*.43,.60+rand()*.20,.66+rand()*.18,.60+rand()*.15);}
    }
  }
  function bush(x,z){
    for(let k=0;k<4;k++){const a=k*1.8;put('ball',k%2?'#6aa964':'#548c59',x+Math.cos(a)*.30,.25+rand()*.16,z+Math.sin(a)*.28,.37+rand()*.23,.30+rand()*.15,.35+rand()*.16);}
  }
  function bench(x,z,side=1){
    for(let j=0;j<3;j++){put('box','#bd8554',x,.48,z+(j-1)*.17,1.55,.09,.13);put('box','#c99461',x,.79+j*.13,z-side*.28,1.55,.10,.07);}
    for(const s of [-1,1])put('box','#3a5551',x+s*.55,.23,z,.075,.48,.48);
  }
  function flower(x,z){
    put('cylinder','#5e9557',x,.17,z,.014,.33,.014);
    put('ball',['#f5d773','#e89bad','#eee7ec','#b4a5dd'][Math.floor(rand()*4)],x,.35,z,.09,.045,.09);
    put('ball','#ecba4e',x,.39,z,.032,.02,.032);
  }
  if(level<=1){
    for(const side of [-1,1])for(let z=-25;z<=25;z+=10){
      const x=side*13,h=4+rand()*3,paint=['#e6bc99','#d6b8b1','#b9cace','#e8d2a6'][Math.floor(rand()*4)];
      put('box',paint,x,h/2,z,4.8,h,5.8);put('box','#9b8b87',x,h+.12,z,5,.24,6);
      for(let floor=0;floor<3;floor++)for(let w=0;w<3;w++){
        put('box','#eae8df',x+(w-1)*1.35,1+floor*1.65,z+2.93,.92,1.05,.08);
        put('box','#82b4c6',x+(w-1)*1.35,1+floor*1.65,z+2.98,.72,.83,.04);
      }
      if(level===1){
        put('cylinder','#506871',side*4.7,1.6,z,.055,3.2,.055);
        put('box','#f9e0a1',side*4.7,3.2,z,.48,.12,.38);
      }
    }
  }
  if(level===2){for(let z=-30;z<=30;z+=5.8)for(const side of [-1,1]){tree(side*6,z);if(Math.abs(z)<24)bench(side*4.6,z+1.3,side);}}
  else{
    const count=level===3?48:level===4?26:22;
    for(let i=0;i<count;i++){const side=rand()>.5?1:-1,x=side*(4.8+rand()*(level<=1?4.5:14)),z=(rand()-.5)*65;tree(x,z,level===3&&rand()>.48?1:0);}
  }
  for(let i=0;i<(level===3?30:17);i++){const x=(rand()>.5?1:-1)*(4+rand()*12),z=(rand()-.5)*62;bush(x,z);}
  if(level!==3)for(let z=-19;z<=20;z+=10)for(const side of [-1,1]){
    if(level!==2)bench(side*5,z,side);
    put('box','#ab8b6a',side*4.3,.17,z+3,1.4,.32,1.1);
    put('box','#635c43',side*4.3,.34,z+3,1.26,.04,.98);
    for(let i=0;i<9;i++)flower(side*4.3+(rand()-.5)*1.1,z+3+(rand()-.5)*.8);
  }
  if(level===3)for(let i=0;i<22;i++){
    const x=(rand()>.5?1:-1)*(3+rand()*13),z=(rand()-.5)*60;
    put('ball','#a9ada4',x,.2,z,.3+rand()*.4,.2+rand()*.3,.3+rand()*.25,rand(),rand(),rand());
  }
  if(level===4){
    if(!G.flag){G.flag=new T.BufferGeometry();G.flag.setAttribute('position',new T.Float32BufferAttribute([-.5,0,0,.5,0,0,0,-1,0],3));G.flag.computeVertexNormals();}
    for(let z=-24;z<=24;z+=7){
      for(const side of [-1,1])put('cylinder','#ac8560',side*4,1.7,z,.05,3.4,.05);
      const points=[];
      for(let i=0;i<=12;i++){
        const x=-4+i*2/3,y=3.35-.35*(1-(x/4)**2);points.push(new T.Vector3(x,y,z));
        if(i<12)put('flag',['#f0b258','#e796ae','#92c6c0','#a9a4da'][i%4],x+.3,y-.02,z,.42,.50,.42);
      }
      root.add(new T.Line(new T.BufferGeometry().setFromPoints(points),materialLine('#ddd4b7')));
    }
  }
  for(const {shape,mat,matrices} of batches.values()){
    const m=new T.InstancedMesh(G[shape],mat,matrices.length);
    if(shape==='flag')m.material=new T.MeshStandardMaterial({color:mat.color,roughness:.9,side:T.DoubleSide});
    matrices.forEach((a,i)=>m.setMatrixAt(i,a));m.instanceMatrix.needsUpdate=true;
    m.receiveShadow=true;m.castShadow=shape!=='box'||matrices.length<50;root.add(m);
  }
  root.userData.dispose=()=>root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.isLine)o.geometry.dispose();});
  return root;
}

export function createPodium(){
  const g=new T.Group();add(g,G.cylinder,material('#e7d7bc'),0,-.075,0,.78,.13,.78);
  add(g,G.cylinder,material('#a7ba9b'),0,-.15,0,.85,.07,.85);return g;
}
