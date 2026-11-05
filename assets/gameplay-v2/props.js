import * as T from 'three';

const cache=new Map();
const G={box:new T.BoxGeometry(1,1,1),ball:new T.SphereGeometry(1,14,10),
  cylinder:new T.CylinderGeometry(1,1,1,10),cone:new T.ConeGeometry(1,1,10),
  ear:new T.ConeGeometry(1,1,3),sausage:new T.CapsuleGeometry(.095,.43,5,16),
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

const coats=['#d98b39','#282c34','#f2eee6','#9a9eaa','#b59478','#dc8a37'];
export function createCat(variant=0){
  const root=new T.Group(),fur=new T.MeshStandardMaterial({color:coats[variant%6],map:texture('fur'),roughness:.92});
  // Six cached coat materials; all instances share geometry and materials.
  const key='coat'+variant;if(cache.has(key))fur.dispose();else cache.set(key,fur);
  const coat=cache.get(key),cream=material(variant===1?'#737983':'#fff1dd'),pink=material('#d999a1');
  add(root,G.ball,coat,0,.43,0,.26,.28,.43);
  add(root,G.ball,coat,0,.68,.34,.28,.26,.24);
  const legs=[];
  for(const x of [-.17,.17])for(const z of [-.24,.24]){
    const hip=new T.Group();hip.position.set(x,.40,z);root.add(hip);
    add(hip,G.cylinder,coat,0,-.11,0,.065,.22,.065);
    const knee=new T.Group();knee.position.y=-.20;hip.add(knee);
    add(knee,G.cylinder,coat,0,-.065,0,.055,.13,.055);
    add(knee,G.ball,variant===5||variant===2?cream:coat,0,-.12,.035,.075,.055,.11);
    legs.push({hip,knee,phase:(x*z>0?0:Math.PI)});
  }
  for(const side of [-1,1]){
    const ear=add(root,G.ear,coat,side*.18,.945,.33,.14,.23,.13);ear.rotation.z=-side*.22;ear.rotation.y=Math.PI/4;
    const inner=add(root,G.ear,pink,side*.18,.95,.368,.08,.15,.064);inner.rotation.z=-side*.22;inner.rotation.y=Math.PI/4;
    add(root,G.ball,cream,side*.077,.59,.554,.10,.072,.061);
    add(root,G.ball,material(variant===1?'#dac36a':'#9bc675',.35),side*.106,.728,.552,.071,.085,.025);
    add(root,G.ball,material('#17272d',.28),side*.106,.729,.575,.020,.061,.012);
    add(root,G.ball,material('#ffffff',.2),side*.092,.757,.588,.013,.014,.006);
  }
  add(root,G.ball,pink,0,.626,.614,.040,.028,.020);
  if(variant===5)add(root,G.ball,cream,0,.42,.31,.20,.22,.16);
  if(variant===4||variant===0){
    const stripe=material(variant===4?'#66564c':'#a35f2c');
    for(let i=0;i<3;i++)add(root,G.stripe,stripe,0,.45,(i-1)*.17,.245,.25,.075);
    for(const side of [-1,1]){
      const mark=add(root,G.box,stripe,side*.14,.865,.46,.04,.065,.012);mark.rotation.z=-side*.4;
    }
  }
  const whiskers=[];
  for(const side of [-1,1])for(let j=0;j<3;j++)whiskers.push(side*.10,.602-j*.018,.60,side*.35,.61+(j-1)*.045,.60);
  const lines=new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(whiskers,3));
  root.add(new T.LineSegments(lines,materialLine('#555b60')));
  const tail=new T.Group();tail.position.set(0,.48,-.35);root.add(tail);
  if(!G.tail)G.tail=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(),new T.Vector3(.10,.15,-.20),new T.Vector3(.18,.46,-.27),new T.Vector3(.08,.58,-.22)]),14,.045,7,false);
  add(tail,G.tail,coat);
  root.userData.animate=(time,speed=1)=>{
    for(const l of legs){l.hip.rotation.x=Math.sin(time*10+ l.phase)*.64*speed;l.knee.rotation.x=Math.max(0,-Math.sin(time*10+l.phase))*.58*speed;}
    tail.rotation.z=Math.sin(time*4)*.18;root.position.y=Math.abs(Math.sin(time*10))*.035*speed;
  };
  return root;
}
function materialLine(color){const key='line'+color;if(!cache.has(key))cache.set(key,new T.LineBasicMaterial({color}));return cache.get(key);}

// Reused primitives are collected into instanced batches for the environment.
export function buildEnvironment(level){
  const root=new T.Group(),batches=new Map();let seed=391+level*719;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function put(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    const key=shape+color;if(!batches.has(key))batches.set(key,{shape,mat:material(color),matrices:[]});
    const o=new T.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();batches.get(key).matrices.push(o.matrix.clone());
  }
  const grasses=['#91c47c','#87b676','#77b96d','#72a762','#88bd77'];
  put('box',grasses[level],0,-.11,0,110,.2,110);
  const road=level===1?'#75828a':level===3?'#bda37e':'#d7c9a6',width=level===1?5:level===3?3.5:5.5;
  put('box',road,0,.005,0,width,.03,100);
  for(const side of [-1,1]){
    put('box',level===1?'#ddd7c9':'#afd28f',side*(width*.5+.45),.012,0,.90,.045,100);
  }
  if(level===1)for(let z=-44;z<45;z+=4)put('box','#eee7bd',0,.026,z,.10,.015,1.9);
  function tree(x,z,type=0){
    const h=1.8+rand()*.9;put('cylinder','#8c694b',x,h*.45,z,.13,h*.9,.13);
    if(type){for(let j=0;j<3;j++)put('cone',j%2?'#3c8058':'#4b9761',x,h*.65+j*.50,z,1.08-j*.17,1.4,1.08-j*.17);}
    else{
      put('ball',rand()>.5?'#63a65f':'#438f57',x,h+.20,z,.95,1.10,.88);
      put('ball','#78b965',x+.42,h+.48,z+.1,.69,.76,.65);
      put('ball','#539c5d',x-.40,h+.27,z-.12,.63,.72,.62);
    }
  }
  function bush(x,z){put('ball','#55905a',x,.33,z,.62,.40,.50);put('ball','#74b96a',x+.34,.39,z+.1,.39,.35,.38);}
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
