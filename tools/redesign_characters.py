"""Build v2 from the restored v1 assets and the supplied photo references.

Python 3.12; numpy, scipy, trimesh, networkx, manifold3d, scikit-image.
Run: python assets/characters/restore_characters.py
     python tools/redesign_characters.py
No game files, old assets, animations, cameras or lights are exported.
Coordinates in metres: +Y up, +Z forward. Unrigged relaxed A pose.
"""
from pathlib import Path
import hashlib, json, math
import numpy as np
from scipy.interpolate import PchipInterpolator, CubicSpline
from scipy.spatial import Delaunay
from skimage.measure import marching_cubes
import trimesh as tm

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters'
PI=math.pi

PALETTE={
 'skinG':'edbea1','skinB':'edc5ae','blush':'e9988c','lip':'bf7672',
 'mouth':'95655e','nostril':'ad7b69','eyeWhite':'f5eee7','irisG':'69442b',
 'irisB':'645341','irisRim':'382b24','pupil':'151b1b','glint':'ffffff',
 'hairG':'583a29','hairHi':'785236','hairB':'514032','hairBHi':'72583e',
 'browG':'63402d','browB':'6d5140','lash':'473025','yellow':'f0dc8d',
 'rib':'e7cf7a','print':'252c2b','pink':'e86a86','pinkBand':'ddb0b4',
 'blue':'1267cf','blueHi':'2379dd','navy':'202c43','hood':'202532',
 'zip':'354052','pants':'e6e3db','sock':'edece3','shoe':'192639',
 'sole':'e8e9e7','glass':'30353a','metal':'858b94'
}

def rgb(key):
    h=PALETTE.get(key,key).lstrip('#')
    return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)])

def linear(c):
    c=np.asarray(c); return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)

def rgba(c):
    c=rgb(c) if isinstance(c,str) else np.asarray(c)
    return np.r_[np.clip(linear(c)*255,0,255).astype(np.uint8),255]

def mesh(v,f):
    m=tm.Trimesh(vertices=np.asarray(v),faces=np.asarray(f),process=True)
    m.update_faces(m.nondegenerate_faces())
    m.remove_unreferenced_vertices();m.fix_normals()
    return m

def ellipsoid(c,r,nu=32,nv=24):
    m=tm.creation.uv_sphere(radius=1,count=[nv,nu])
    m.vertices=np.array(c)+m.vertices*np.array(r)
    return m

def sweep(points,radii,depths=None,n=14,steps=24):
    p=np.asarray(points,float);t=np.linspace(0,1,len(p));u=np.linspace(0,1,steps)
    closed=np.linalg.norm(p[0]-p[-1])<1e-7
    if closed:u=np.linspace(0,1,steps,endpoint=False)
    p=CubicSpline(t,p,bc_type='periodic' if closed else 'natural')(u)
    r=PchipInterpolator(t,radii)(u)
    d=PchipInterpolator(t,depths if depths is not None else radii)(u)
    v=[];f=[]
    for k,c in enumerate(p):
        tangent=p[min(k+1,steps-1)]-p[max(k-1,0)];tangent/=np.linalg.norm(tangent)
        a=np.cross(tangent,[0,0,1.])
        if np.linalg.norm(a)<.02:a=np.cross(tangent,[0,1.,0])
        a/=np.linalg.norm(a);b=np.cross(a,tangent);b/=np.linalg.norm(b)
        for i in range(n):
            theta=2*PI*i/n
            v.append(c+r[k]*math.cos(theta)*a+d[k]*math.sin(theta)*b)
    for k in range(steps if closed else steps-1):
        for i in range(n):
            a=k*n+i;b=k*n+(i+1)%n;c=((k+1)%steps)*n+i;d=((k+1)%steps)*n+(i+1)%n
            f.extend([[a,b,c],[b,d,c]])
    if not closed:
        for k in (0,steps-1):
            v.append(p[k])
            for i in range(n):f.append([len(v)-1,k*n+i,k*n+(i+1)%n])
    return mesh(v,f)

def loft(rings,n=64,steps=42,folds=0,phase=0,cap=True):
    # y, centre x, centre z, half width, half depth.
    rings=np.asarray(rings);rr=PchipInterpolator(np.linspace(0,1,len(rings)),rings)(np.linspace(0,1,steps))
    v=[];f=[]
    for k,(y,x,z,rx,rz) in enumerate(rr):
        u=k/(steps-1)
        for i in range(n):
            t=2*PI*i/n
            # A few broad fabric folds; finer compressive folds near the hem.
            a=folds*(.55*math.sin(5*t+u*1.8+phase)+.3*math.sin(9*t-u*3.5+phase))
            a+=folds*.30*math.sin(24*u+3*t)*math.exp(-((u-.12)/.18)**2)
            v.append([x+(rx+a)*math.cos(t),y+.0005*math.sin(t*4+u*5),z+(rz+a*.65)*math.sin(t)])
    for k in range(steps-1):
        for i in range(n):
            a=k*n+i;b=k*n+(i+1)%n;f.extend([[a,b,a+n],[b,b+n,a+n]])
    if cap:
        for k in (0,steps-1):
            v.append([rr[k,1],rr[k,0],rr[k,2]])
            for i in range(n):f.append([len(v)-1,k*n+i,k*n+(i+1)%n])
    return mesh(v,f)

class Character:
    def __init__(self,boy):
        self.boy=boy;self.name='boy' if boy else 'girl';self.skin='skinB' if boy else 'skinG'
        self.hair='hairB' if boy else 'hairG';self.scene=tm.Scene()
        self.old=tm.load(OUT/(self.name+'_avatar.glb'),force='scene')
    def add(self,name,m,color,rough=.65,colors=None):
        if name.startswith(('Eye_sclera_','Detailed_iris_','Sculpted_eyelid_','Ear_bowl_','Tapered_eyebrow_')) or name in ('Upper_lip','Lower_lip'):
            if np.mean(m.face_normals[:,2])<0:m.invert()
        if name=='Rear_cranium' and np.mean(m.face_normals[:,2])>0:m.invert()
        mat=tm.visual.material.PBRMaterial(name=color,baseColorFactor=rgba(color) if colors is None else [255]*4,
            metallicFactor=0,roughnessFactor=rough,alphaMode='OPAQUE',doubleSided=False)
        m.visual=tm.visual.TextureVisuals(material=mat)
        if colors is not None:
            cs=np.asarray(colors);cs=linear(cs)
            m.visual.vertex_attributes['color']=np.column_stack([np.clip(cs*255,0,255).astype(np.uint8),np.full(len(cs),255,np.uint8)])
        # Recompute from the final winding. Cached imported normals can retain
        # the original sign after an orientation repair on an open surface.
        m._cache.clear()
        _=m.vertex_normals
        self.scene.add_geometry(m,geom_name=name,node_name=name)
        return m
    def curve(self,name,points,radii,color,depths=None,n=10,steps=28,rough=.6):
        return self.add(name,sweep(points,radii,depths,n,steps),color,rough)
    def ell(self,name,c,r,color,rough=.65):return self.add(name,ellipsoid(c,r),color,rough)

def head_profile(boy):
    # Independent jaw, cheek, forehead and occipital profiles interpreted from
    # the supplied photographs. These are deliberately not shared silhouettes.
    if boy:
        rows=[(1.071,.0005,.026,.024),(1.078,.027,.044,.034),
              (1.089,.054,.066,.047),(1.110,.081,.080,.066),
              (1.142,.102,.085,.088),(1.180,.114,.088,.103),
              (1.216,.115,.090,.108),(1.260,.111,.093,.109),
              (1.300,.098,.085,.096),(1.332,.062,.056,.062),
              (1.352,.0005,.001,.001)]
    else:
        rows=[(1.071,.0005,.026,.023),(1.078,.023,.043,.033),
              (1.091,.049,.065,.046),(1.114,.074,.081,.064),
              (1.149,.102,.089,.086),(1.181,.116,.090,.100),
              (1.216,.116,.091,.107),(1.260,.109,.092,.108),
              (1.300,.095,.083,.094),(1.332,.060,.055,.061),
              (1.352,.0005,.001,.001)]
    a=np.array(rows)
    return [PchipInterpolator(a[:,0],a[:,i]) for i in (1,2,3)]

class Face:
    def __init__(self,c):
        self.c=c;self.boy=c.boy;self.rx,self.df,self.db=head_profile(c.boy)
        self.eyeY=1.216 if c.boy else 1.217
        self.eyeX=.047 if c.boy else .0485
        self.a=.0285 if c.boy else .030
        self.b=.0142 if c.boy else .0170
        self.slant=.0007 if c.boy else .0021
        self.mouthY=1.1335 if c.boy else 1.134
        self.mouthW=.033 if c.boy else .0315
    def depth(self,x,y):
        x=np.asarray(x);y=np.asarray(y)
        q=np.clip(x/self.rx(y),-1,1)
        d=self.df(y)*np.sqrt(np.maximum(0,1-q*q))
        def g(cx,cy,wx,wy):return np.exp(-((x-cx)/wx)**2-((y-cy)/wy)**2)
        # Continuous bridge, alae, philtrum, muzzle, cheek pads and chin.
        front=np.maximum(0,1-q*q)**2
        d+=front*((.009 if self.boy else .0135)*(g(.068,1.175,.039,.029)+g(-.068,1.175,.039,.029))
            -.0075*(g(self.eyeX,self.eyeY,.033,.022)+g(-self.eyeX,self.eyeY,.033,.022))
            +(.018 if self.boy else .014)*g(0,1.202,.013,.029)+(.027 if self.boy else .028)*g(0,1.167,.018 if self.boy else .016,.013)
            +.005*(g(.014,1.161,.009,.008)+g(-.014,1.161,.009,.008))
            +.005*g(0,1.140,.032,.020)+.006*g(0,1.105,.037,.020)
            -.002*g(0,1.148,.004,.009))
        for s in (-1,1):d-=.002*g(s*self.mouthW, self.mouthY+.004,.009,.009)
        return d
    def eye_outline(self,s,t,a=None,b=None):
        a=self.a if a is None else a;b=self.b if b is None else b
        x=s*self.eyeX+a*np.cos(t)
        y=self.eyeY+b*np.sin(t)*(0.72+.28*np.abs(np.sin(t)))+s*self.slant*np.cos(t)
        return x,y
    def in_eye(self,x,y,s,expand=0):
        q=(x-s*self.eyeX)/(self.a+expand)
        dy=y-self.eyeY-s*self.slant*q
        limit=(self.b+expand)*np.sqrt(np.maximum(0,1-q*q))*(.72+.28*np.sqrt(np.maximum(0,1-q*q)))
        return (np.abs(q)<1)&(np.abs(dy)<limit)
    def skin_colors(self,v):
        x,y,z=v.T;base=np.tile(rgb(self.c.skin),(len(v),1))
        blush=np.zeros(len(v))
        for s in (-1,1):blush+=np.exp(-((x-s*.075)/.032)**2-((y-1.173)/.023)**2)
        blush+=.5*np.exp(-(x/.023)**2-((y-1.166)/.017)**2)
        blush*=np.clip(z/.08,0,1)
        base=base*(1-.15*blush[:,None])+rgb('blush')*.15*blush[:,None]
        base+=.002*np.sin(x[:,None]*1451+y[:,None]*321)*np.array([1,.7,.5])
        return np.clip(base,0,1)
    def build(self):
        c=self.c
        pts=[]
        # Sample the front surface, avoiding eyes. Exact eye contours are inserted.
        for y in np.linspace(1.0715,1.3515,116):
            width=float(self.rx(y))
            for u in np.linspace(-.997,.997,116):
                x=u*width
                if any(self.in_eye(x,y,s,.0009) for s in (-1,1)):continue
                pts.append([x,y])
        for s in (-1,1):
            x,y=self.eye_outline(s,np.linspace(0,2*PI,97)[:-1]);pts.extend(zip(x,y))
        yy=np.linspace(1.071,1.352,150)
        boundary=[]
        for s in (-1,1):boundary.extend([[s*float(self.rx(y)),y] for y in yy])
        pts.extend(boundary);pts=np.array(pts)
        tri=Delaunay(pts).simplices;center=pts[tri].mean(axis=1)
        keep=np.ones(len(tri),bool)
        for s in (-1,1):keep &= ~self.in_eye(center[:,0],center[:,1],s,-.00005)
        tri=tri[keep]
        v=np.column_stack([pts,self.depth(pts[:,0],pts[:,1])])
        front_mesh=mesh(v,tri)
        if front_mesh.face_normals[:,2].mean()<0:front_mesh.invert()
        # Rear cranium meets both facial side boundaries exactly.
        v=[];f=[];n=64
        for y in yy:
            for i in range(n+1):
                t=PI*i/n;v.append([float(self.rx(y))*math.cos(t),y,-float(self.db(y))*math.sin(t)])
        for j in range(len(yy)-1):
            for i in range(n):
                a=j*(n+1)+i;f.extend([[a,a+n+1,a+1],[a+1,a+n+1,a+n+2]])
        rear_mesh=mesh(v,f)
        if rear_mesh.face_normals[:,2].mean()>0:rear_mesh.invert()
        # Weld identical boundary samples so the head shares smooth normals
        # around both temples, the jaw and the nape. Eye sockets stay open.
        head=tm.util.concatenate([front_mesh,rear_mesh]);head.merge_vertices(digits_vertex=7)
        head.fix_normals()
        c.add('Sculpted_head_with_eye_sockets',head,c.skin,.61,self.skin_colors(head.vertices))
        self.ears();self.eyes();self.mouth()
        for s in (-1,1):
            pts=[]
            for t in np.linspace(0,PI,14):
                x=s*.0105+.004*math.cos(t);y=1.156-.0016*math.sin(t)
                pts.append([x,y,float(self.depth(x,y))+.0006])
            c.curve('Subtle_nostril_'+str(s),pts,[.00038]*14,'nostril',n=6,steps=16)
    def ears(self):
        c=self.c
        for side in (-1,1):
            # Closed softly cupped ear with a rolled rim and attached lobe.
            # It leans back toward the skull instead of facing the camera flat.
            nu,nv=64,32;v=[];f=[]
            height=.029 if c.boy else .0265
            for j in range(nv+1):
                p=PI*j/nv
                for i in range(nu):
                    t=2*PI*i/nu
                    x=.0145*math.sin(p)*math.cos(t)
                    y=height*math.cos(p)
                    z=.011*math.sin(p)*math.sin(t)
                    if z>0:
                        z-=.0055*math.exp(-(x/.009)**2-(y/.020)**2)*(z/.011)**2
                        z+=.0017*math.exp(-((y+.020)/.009)**2)
                    angle=side*.32
                    xx=side*.118+x*math.cos(angle)+z*math.sin(angle)
                    zz=-.001-x*math.sin(angle)+z*math.cos(angle)
                    v.append([xx,1.194+y,zz])
            for j in range(nv):
                for i in range(nu):
                    a=j*nu+i;b=j*nu+(i+1)%nu
                    f.extend([[a,b,a+nu],[b,b+nu,a+nu]])
            ear=mesh(v,f)
            c.add('Ear_soft_cup_'+str(side),ear,c.skin,.68,self.skin_colors(ear.vertices)*.97+rgb('blush')*.03)
            pp=[]
            for t in np.linspace(-1.45,1.55,22):
                x=side*(.120+.0075*math.cos(t));y=1.194+.019*math.sin(t)
                pp.append([x,y,.0075])
            c.curve('Ear_inner_fold_'+str(side),pp,[.0013]*len(pp),c.skin,n=8,steps=26,rough=.72)
            c.ell('Ear_attached_lobe_'+str(side),(side*.118,1.175,.000),(.010,.009,.009),c.skin,.7)
    def eye_depth(self,x,y,s):
        q=(x-s*self.eyeX)/self.a;dy=(y-self.eyeY-s*self.slant*q)/self.b
        r2=q*q+dy*dy
        return self.depth(x,y)+.0018+.010*np.maximum(0,1-r2)
    def eyes(self):
        c=self.c
        for s in (-1,1):
            # Lens-shaped sclera fitted into a real opening in the facial surface.
            v=[];f=[];n=72;nr=12
            for j in range(nr+1):
                r=j/nr;t=np.linspace(0,2*PI,n,endpoint=False)
                x,y=self.eye_outline(s,t,self.a*r,self.b*r)
                v.extend(zip(x,y,self.eye_depth(x,y,s)))
            for j in range(nr):
                for i in range(n):
                    a=j*n+i;b=j*n+(i+1)%n;f.extend([[a,b,a+n],[b,b+n,a+n]])
            c.add('Eye_sclera_'+str(s),mesh(v,f),'eyeWhite',.22)
            # Rolled eyelids are skin bands, continuous around each eye.
            v=[];f=[]
            for j in range(7):
                u=j/6;t=np.linspace(0,2*PI,n,endpoint=False)
                x,y=self.eye_outline(s,t,self.a+.0045*u,self.b+.0045*u)
                d=self.depth(x,y)+.0012+.0012*math.sin(PI*u)
                v.extend(zip(x,y,d))
            for j in range(6):
                for i in range(n):
                    a=j*n+i;b=j*n+(i+1)%n;f.extend([[a,b,a+n],[b,b+n,a+n]])
            lid=mesh(v,f);c.add('Sculpted_eyelid_'+str(s),lid,c.skin,.6,self.skin_colors(lid.vertices))
            # Radial iris fibres and limbal ring, no painted-on white highlight.
            radius=.0162 if not c.boy else .0139;v=[];f=[];colors=[]
            for j in range(15):
                r=j/14
                for i in range(96):
                    t=2*PI*i/96;x=s*self.eyeX+radius*r*math.cos(t);y=self.eyeY+radius*r*math.sin(t)
                    d=float(self.eye_depth(x,y,s))+.0008+.0015*(1-r*r)
                    v.append([x,y,d]);col=rgb('irisB' if c.boy else 'irisG')
                    fibre=.10*math.sin(t*51+math.sin(t*13)*2)+.06*math.sin(t*87+r*9)
                    col=np.clip(col*(1+fibre),0,1)
                    if r<.49:col=rgb('pupil')
                    elif r>.89:col=rgb('irisRim')*(.75+.25*(1-r)/.11)
                    elif r<.64:col=col*.85+rgb('hairHi')*.15
                    colors.append(col)
            for j in range(14):
                for i in range(96):
                    a=j*96+i;b=j*96+(i+1)%96;f.extend([[a,b,a+96],[b,b+96,a+96]])
            vv=np.asarray(v);cent=vv[np.asarray(f)].mean(axis=1)
            f=np.asarray(f)[self.in_eye(cent[:,0],cent[:,1],s,-.0002)].tolist()
            iris=tm.Trimesh(vertices=v,faces=f,process=False);iris.fix_normals()
            c.add('Detailed_iris_and_pupil_'+str(s),iris,'irisG',.16,colors)
            # Fine upper lash line, actual individual upper eyelashes on GIRL.
            pts=[]
            for t in np.linspace(.05,PI-.05,28):
                x,y=self.eye_outline(s,t);pts.append([float(x),float(y),float(self.depth(x,y))+.0022])
            c.curve('Upper_lashline_'+str(s),pts,[.00075]*28,'lash',n=6,steps=28)
            if not c.boy:
                for k,t in enumerate(np.linspace(.22,PI-.22,9)):
                    x,y=self.eye_outline(s,t);d=float(self.depth(x,y))+.0022
                    c.curve('Eyelash_'+str(s)+'_'+str(k),[[x,y,d],[x+.0015*math.cos(t),y+.003,d+.001],[x+.0028*math.cos(t),y+.005,d+.0005]], [.00045,.00033,.0001],'lash',n=5,steps=6)
            # Sculpted arched eyebrow patch with tapered ends, softly blended colour.
            v=[];f=[];width=.032 if not c.boy else .030
            for i in range(40):
                q=-1+2*i/39;x=s*self.eyeX+width*q
                y=(1.248 if c.boy else 1.250)+(.0028 if c.boy else .006)*(1-q*q)-s*.0017*q
                h=(.0029 if c.boy else .0021)*max(.05,(1-q*q)**.6)
                for a in (-1,1):
                    yy=y+a*h;v.append([x,yy,float(self.depth(x,yy))+.0012])
            for i in range(39):a=2*i;f.extend([[a,a+1,a+2],[a+1,a+3,a+2]])
            c.add('Tapered_eyebrow_'+str(s),mesh(v,f),'browB' if c.boy else 'browG',.85)
    def mouth(self):
        c=self.c
        def line(q):return self.mouthY+(.004 if c.boy else .0055)*q*q+.0005*q
        for top in (False,True):
            v=[];f=[];cs=[]
            for i in range(65):
                q=-1+2*i/64;x=self.mouthW*q;y=line(q)
                h=((.0022 if c.boy else .0028) if top else (-.0040 if c.boy else -.0046))*(1-q*q)
                if top:h*=1-.34*math.exp(-(q/.24)**2)
                for j in range(7):
                    u=j/6;yy=y+u*h
                    d=float(self.depth(x,yy))+.0004+.0021*math.sin(PI*u)*(1-q*q)
                    v.append([x,yy,d]);mix=.85*math.sin(PI*(.15+.7*u))
                    cs.append(rgb(c.skin)*(1-mix)+rgb('lip')*mix)
            for i in range(64):
                for j in range(6):a=i*7+j;f.extend([[a,a+7,a+1],[a+1,a+7,a+8]])
            lip=tm.Trimesh(vertices=v,faces=f,process=False);lip.fix_normals()
            c.add('Upper_lip' if top else 'Lower_lip',lip,'lip',.55,cs)
        points=[]
        for q in np.linspace(-1,1,35):
            x=self.mouthW*q;y=line(q);points.append([x,y,float(self.depth(x,y))+.001])
        c.curve('Closed_smile',points,[.0006]*35,'mouth',n=6,steps=35)

def hair(c,face):
    # Closed two-layer cap, positioned outside the head at its actual height.
    # The old y-remapping folded the nape rim through the skull and made a
    # black ribbon. A monotone surface and a rolled 3 mm rim remove that fold.
    boy=c.boy;nt=128;nr=52;v=[];f=[];colors=[]
    def edge_angle(t):
        front=max(0,math.sin(t));back=max(0,-math.sin(t))
        if boy:
            return 1.92-.78*front+.10*back-.14*abs(math.cos(t))**8+.012*math.sin(11*t)
        return 2.05-.99*front+.24*back-.24*abs(math.cos(t))**8+.012*math.sin(5*t)
    def cap(p,t,inner=False):
        y=1.211+.163*math.cos(p)
        yy=float(np.clip(y,1.071,1.3519))
        front=math.sin(t)>0
        profile=float(face.df(yy) if front else face.db(yy))
        # Blend the scalp profile into a softly rounded crown above the skull.
        blend=float(np.clip((y-1.315)/.027,0,1));blend=blend*blend*(3-2*blend)
        rx=(float(face.rx(yy))+.009*math.sin(p))*(1-blend)+.130*math.sin(p)*blend
        rz=(profile+.010*math.sin(p))*(1-blend)+.122*math.sin(p)*blend
        strand=.00030*math.sin(73*t+8*p+2*math.sin(3*t))*math.sin(p)**2
        # The cap tapers at the nape instead of ending in a broad dark shelf.
        x=(rx+strand)*math.cos(t);z=(rz+strand)*math.sin(t)
        if p==0:x=z=0
        if inner:
            x*=.974;z*=.974;y=1.211+(y-1.211)*.981
        return [x,y,z]
    layers=[]
    for inner in (False,True):
        start=len(v);layers.append(start)
        v.append(cap(0,0,inner));colors.append(rgb(c.hair))
        for j in range(1,nr+1):
            for i in range(nt):
                t=2*PI*i/nt;p=j/nr*edge_angle(t)
                v.append(cap(p,t,inner))
                g=.025*math.sin(73*t+8*p)+.022*math.sin(137*t+5*p)+.025*math.sin(5*t-3*p)
                colors.append(np.clip(rgb(c.hair)*(1+g),0,1))
        for i in range(nt):f.append([start,start+1+i,start+1+(i+1)%nt])
        for j in range(nr-1):
            for i in range(nt):
                a=start+1+j*nt+i;b=start+1+j*nt+(i+1)%nt
                f.extend([[a,a+nt,b],[b,a+nt,b+nt]])
    outer,inside=layers
    for i in range(nt):
        a=outer+1+(nr-1)*nt+i;b=outer+1+(nr-1)*nt+(i+1)%nt
        c0=inside+1+(nr-1)*nt+i;d=inside+1+(nr-1)*nt+(i+1)%nt
        f.extend([[a,b,c0],[b,d,c0]])
    scalp=tm.Trimesh(vertices=v,faces=f,process=False);scalp.fix_normals()
    if scalp.volume<0:scalp.invert()
    assert scalp.is_watertight and scalp.is_winding_consistent
    c.add('Closed_opaque_hair_shell',scalp,c.hair,.64,colors)
    if not boy:
        # Broad overlapping swept locks, offset part on the child's left.
        for side in (-1,1):
            count=6 if side==-1 else 4
            for k in range(count):
                u=k/(count-1);x0=.022+.009*u
                if side==-1:
                    pts=[[x0,1.356-.009*u,.034],[-.032-.018*u,1.331-.011*u,.087],[-.080-.013*u,1.280-.014*u,.085],[-.111,1.226-.014*u,.039],[-.106,1.175-.006*u,.006]]
                else:
                    pts=[[x0,1.356-.008*u,.032],[.068+.013*u,1.326-.014*u,.073],[.103+.007*u,1.282-.009*u,.058],[.117,1.233,.018],[.108,1.195,-.009]]
                c.curve('Swept_hair_mass_'+str(side)+'_'+str(k),pts,[.010,.012,.010,.007,.0007],c.hair,depths=[.004,.005,.004,.003,.0006],n=14,steps=34,rough=.64)
                # Three fine grooves per lock; they are subordinate to the solid mass.
                pp=np.asarray(pts)
                for j in (-1,1):
                    fine=pp.copy();fine[:,0]+=j*.003;fine[:,2]+=.004
                    c.curve('Hair_strand_'+str(side)+'_'+str(k)+'_'+str(j),fine,[.0003,.0005,.00045,.00035,.0001],'hairHi' if k%3==0 else 'hairG',n=5,steps=28,rough=.67)
        # Gather the nape into the braid with three broad, tapered sections.
        # Their ends are hidden inside the existing braid instead of floating
        # at the side of the head or forming an abrupt separate sausage.
        for k in range(5):
            u=(k-2)/2
            pp=[[.045+.018*u,1.242,-.101],[-.018+.014*u,1.198,-.104],
                [-.075+.008*u,1.166,-.066],[-.108+.005*u,1.157,-.008],[-.113,1.151,.016]]
            c.curve('Nape_gathered_hair_'+str(k),pp,[.012,.014,.014,.012,.008],
                    c.hair,depths=[.003,.004,.005,.008,.008],n=14,steps=42,rough=.65)
        for k in range(3):
            pp=[];rr=[]
            for u in np.linspace(0,1,100):
                theta=u*PI*11+k*2*PI/3
                fade=.15+.85*min(1,u/.12)
                r=.0135*(1-.45*u)*fade
                pp.append([-.113-.024*u+r*math.cos(theta),1.156-.328*u,.015+.080*u+r*math.sin(theta)])
                rr.append(.0115*(1-.35*u))
            c.curve('Continuous_braided_lock_'+str(k),pp,rr,c.hair,n=12,steps=100,rough=.64)
        c.curve('Pink_elastic',[[-.137,.838,.094],[-.137,.825,.097]],[.018,.017],'pink',n=28,steps=6,rough=.8)
        for k in range(9):
            u=(k-4)/4
            pp=[[-.137+.009*u,.827,.096],[-.143+.013*u,.793,.099],[-.145+.013*u,.758,.101],[-.145+.010*u,.734+.009*abs(u),.097]]
            c.curve('Loose_braid_tail_'+str(k),pp,[.004,.005,.004,.0004],c.hair,depths=[.003,.004,.003,.0003],n=8,steps=22,rough=.65)
        # Short tapered wisps beside the ears.
        for s in (-1,1):
            c.curve('Face_framing_wisp_'+str(s),[[s*.105,1.279,.065],[s*.116,1.230,.036],[s*.121,1.186,.026],[s*.113,1.161,.033]], [.002,.002,.0014,.0002],c.hair,n=8,steps=30,rough=.5)
    else:
        # Short, forward swept locks sit over a closed cap, not on a flat crown.
        for k,x in enumerate(np.linspace(-.094,.094,15)):
            edge=abs(x)/.1
            pp=[[x*.55+.009,1.369-.016*edge,-.015],
                [x*.8+.010,1.352-.013*edge,.043],
                [x+.004,1.327-.012*edge,.090-.011*edge],
                [x-.007,1.300+.006*math.sin(k*1.7),.106-.026*edge]]
            c.curve('Short_swept_lock_'+str(k),pp,[.007,.010,.008,.0004],c.hair,depths=[.004,.006,.005,.0003],n=12,steps=24,rough=.66)
            for j in (-1,1):
                p=np.array(pp);p[:,0]+=j*.0028;p[:,2]+=.004
                c.curve('Fine_short_strand_'+str(k)+'_'+str(j),p,[.0003,.00045,.00035,.00005],'hairBHi',n=5,steps=20,rough=.69)

def soft_hand(side,center):
    # A single implicit skin surface connects palm, thumb and four articulated fingers.
    cx,cy,cz=center
    lo=np.array([cx-.042,cy-.075,cz-.022]);hi=np.array([cx+.042,cy+.032,cz+.028]);step=.0015
    axes=[np.arange(a,b+step,step) for a,b in zip(lo,hi)]
    grid=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1)
    def ell(c,r):return (np.linalg.norm((grid-np.array(c))/np.array(r),axis=-1)-1)*min(r)
    field=ell([cx,cy,cz],[.024,.032,.014])
    def blend(a,b,k=.003):
        h=np.maximum(k-np.abs(a-b),0)/k
        return np.minimum(a,b)-h*h*k*.25
    # Skin wrist is part of the same field.
    field=blend(field,ell([cx-side*.004,cy+.022,cz-.002],[.018,.025,.014]))
    lengths=[.031,.037,.035,.027]
    for k in range(4):
        x=cx+side*(-.014+k*.010);start=cy-.018;length=lengths[k]
        for u in np.linspace(0,1,7):
            pos=[x+side*.003*u,start-length*u,cz+.003+.004*u*u]
            rr=.0052-.0015*u
            field=blend(field,ell(pos,[rr,rr*1.5,rr]),.0018)
    for u in np.linspace(0,1,9):
        pos=[cx-side*(.019+.014*math.sin(u*PI*.65)),cy+.005-.033*u,cz+.005+.009*u]
        r=.007-.003*u;field=blend(field,ell(pos,[r,r*1.3,r]),.0025)
    v,f,_,_=marching_cubes(field,level=0,spacing=(step,step,step))
    hand=mesh(v+lo,f)
    tm.smoothing.filter_humphrey(hand,alpha=.1,beta=.5,iterations=2)
    return hand

def unify(parts):
    return tm.boolean.union(parts,engine='manifold')

def body(c):
    boy=c.boy;skin=c.skin
    c.add('Neck_contoured',loft([(1.013,0,-.003,.036,.033),(1.049,0,-.002,.034,.033),(1.097,0,-.004,.038,.032)],n=40,steps=22),skin,.63)
    # Existing costumes, rebuilt with broad folds, continuous shoulders and sewn edges.
    shirt=loft([(.596,0,.008,.127,.072),(.635,0,.004,.128,.075),(.741,0,0,.116,.066),(.88,0,-.001,.116,.063),(1.0,0,-.008,.104,.050),(1.032,0,-.004,.043,.035)],n=72,steps=54,folds=.0027)
    if not boy:
        sleeves=[]
        for s in (-1,1):
            sleeves.append(sweep([[s*.065,.975,-.005],[s*.115,.955,-.004],[s*.149,.883,-.002]], [.034,.047,.044],[.034,.046,.044],n=40,steps=22))
        shirt=unify([shirt]+sleeves)
        c.add('Tshirt_seamless_shoulders',shirt,'yellow',.88)
        c.add('Tshirt_sewn_hem',loft([(.593,0,.009,.129,.075),(.600,0,.009,.130,.076),(.603,0,.009,.129,.075)],n=72,steps=7,folds=.0025), 'rib',.88)
        collar=[[.043*math.cos(t),1.031-.009*math.sin(t),-.004+.035*math.sin(t)] for t in np.linspace(0,2*PI,81)]
        c.curve('Ribbed_crew_neck',collar,[.0026]*81,'rib',depths=[.0020]*81,n=10,steps=80,rough=.9)
        # Retain the original rabbit illustration, repositioned onto the new garment.
        for name,g in c.old.geometry.items():
            if name.startswith('Rabbit_'):
                g=g.copy();g.vertices[:,1]+=.047;g.vertices[:,2]+=.006
                c.add('Original_'+name,g,'print',.95)
    else:
        c.add('Black_hoodie_body',shirt,'hood',.92)
        # Open jacket shells with front/back separation from the inner hoodie.
        for s in (-1,1):
            v=[];f=[];nt=50;ny=52
            for j in range(ny):
                u=j/(ny-1);y=.590+.434*u
                rx=.141-.037*u**5;rz=.089-.037*u**5
                gap=.18+.34*u**3
                for i in range(nt):
                    t=PI/2+s*(gap+(PI-gap)*i/(nt-1))
                    fold=.0017*math.sin(t*5+u*2)+.001*math.sin(19*u+3*t)*math.exp(-((u-.15)/.18)**2)
                    yy=y-.026*u**8*abs(math.cos(t))**1.4
                    v.append([(rx+fold)*math.cos(t),yy,(rz+fold)*math.sin(t)-.004])
            for j in range(ny-1):
                for i in range(nt-1):
                    a=j*nt+i;tri=[[a,a+nt,a+1],[a+1,a+nt,a+nt+1]]
                    f.extend(tri if s==1 else [q[::-1] for q in tri])
            shell=mesh(v,f)
            # Explicitly orient each open panel outwards.
            radial=shell.triangles_center.copy();radial[:,1]=0
            if np.mean(np.einsum('ij,ij->i',shell.face_normals,radial))<0:shell.invert()
            shell.visual=tm.visual.TextureVisuals()
            shell=c.add('Blue_jacket_panel_'+str(s),shell,'blue',.84)
            # Solid thickness for the open front, including edge/zip tape.
            pp=[]
            for u in np.linspace(0,1,24):
                t=PI/2+s*(.18+.34*u**3)
                pp.append([(.141-.037*u**5)*math.cos(t),.590+.434*u-.026*u**8*abs(math.cos(t))**1.4,(.089-.037*u**5)*math.sin(t)-.003])
            c.curve('Jacket_zip_tape_'+str(s),pp,[.0032]*24,'zip',depths=[.0018]*24,n=8,steps=32,rough=.65)
            c.curve('Pocket_seam_'+str(s),[[s*.095,.685,.069],[s*.085,.747,.072],[s*.087,.772,.069]],[.001]*3,'navy',n=6,steps=18)
        # Interior hood follows the nape with a soft U opening.
        c.curve('Hood_cushioned_rim',[[.082,1.003,.020],[.103,1.060,-.025],[.066,1.081,-.071],[0,1.086,-.081],[-.066,1.081,-.071],[-.103,1.060,-.025],[-.082,1.003,.020]], [.020,.022,.026,.028,.026,.022,.020],'hood',depths=[.015,.020,.024,.025,.024,.020,.015],n=20,steps=58,rough=.92)
        c.ell('Hood_back_fabric',(0,1.037,-.060),(.095,.052,.032),'hood',.92)
        c.curve('Hoodie_zip',[[0,.61,.081],[0,.82,.069],[0,.944,.059],[0,.980,.036]],[.0018]*4,'zip',n=8,steps=35)
        c.ell('Hoodie_zip_pull',(0,.940,.067),(.004,.007,.002),'metal')
        # Backpack front straps and complete back body.
        c.ell('Backpack_main',(0,.822,-.119),(.109,.167,.052),'navy',.87)
        c.ell('Backpack_front_pocket',(0,.787,-.160),(.081,.089,.024),'hood',.87)
        for s in (-1,1):
            pp=[[s*.077,1.026,.028],[s*.099,.963,.065],[s*.106,.835,.079],[s*.106,.706,.066],[s*.098,.675,-.073]]
            c.curve('Backpack_flat_strap_'+str(s),pp,[.013,.014,.014,.013,.008],'hood',depths=[.004]*5,n=12,steps=36,rough=.9)
            c.ell('Strap_buckle_'+str(s),(s*.104,.862,.086),(.016,.015,.003),'zip')
            c.curve('Strap_red_accent_'+str(s),[[s*.101,.891,.085],[s*.101,.919,.081]],[.0017,.0017],'dca24b',n=6,steps=8)
    # Pants are an actual union with one hip volume, no overlapping centre seam.
    parts=[]
    for s in (-1,1):
        parts.append(loft([(.111,s*.065,-.001,.046,.039),(.144,s*.067,.0,.061,.050),(.25,s*.068,-.002,.066,.054),(.36,s*.069,-.007,.064,.053),(.48,s*.067,-.002,.068,.056),(.585,s*.061,0,.066,.057),(.633,s*.059,0,.063,.058)],n=64,steps=56,folds=.0036,phase=s*.7))
    parts.append(loft([(.522,0,-.003,.003,.004),(.550,0,-.001,.048,.030),(.60,0,0,.121,.058),(.649,0,0,.119,.058)],n=64,steps=24,folds=.0005))
    trousers=unify(parts);tm.smoothing.filter_humphrey(trousers,alpha=.02,beta=.3,iterations=1)
    c.add('Trousers_continuous_crotch',trousers,'pants' if boy else 'yellow',.93)
    # Low contrast stitched outside seams.
    for s in (-1,1):
        c.curve('Trouser_side_seam_'+str(s),[[s*.113,.13,0],[s*.132,.27,-.002],[s*.132,.45,-.002],[s*.119,.58,.01]], [.00065]*4,'cfcfc9' if boy else 'ddc87e',n=6,steps=40,rough=.95)
        upper=[[s*.067,.972,-.007],[s*.126,.934,-.004],[s*.181,.783,.003]]
        lower=[[s*.181,.783,.003],[s*.201,.704,.011],[s*.222,.628,.018]]
        if boy:
            c.add('Blue_sleeve_upper_'+str(s),sweep(upper,[.030,.047,.037],[.030,.046,.037],n=36,steps=30),'blue',.86)
            c.add('Dark_sleeve_lower_'+str(s),sweep(lower,[.038,.037,.026],[.038,.035,.025],n=36,steps=28),'navy',.9)
            c.curve('Sleeve_cuff_'+str(s),[[s*.217,.644,.016],[s*.223,.624,.018]],[.027,.025],'hood',depths=[.025,.024],n=30,steps=8,rough=.95)
        else:
            c.add('Continuous_arm_'+str(s),sweep([[s*.141,.900,-.002],[s*.163,.841,-.001],[s*.180,.779,.004],[s*.204,.699,.012],[s*.222,.624,.018]], [.029,.028,.026,.024,.018],[.029,.027,.025,.022,.015],n=32,steps=44),skin,.65)
        c.add('Unified_hand_fingers_'+str(s),soft_hand(s,[s*.232,.598,.020]),skin,.64)
        x=s*.065
        if boy:
            c.add('Shoe_white_sole_'+str(s),loft([(.012,x,.036,.041,.081),(.026,x,.039,.045,.088),(.035,x,.039,.045,.087)],n=56,steps=9),'sole',.88)
            shoe=ellipsoid([x,.058,.039],[.044,.041,.085],40,26)
            shoe.vertices[:,2]+=np.clip((.055-shoe.vertices[:,1])/.05,0,1)*.009
            c.add('Navy_slipon_'+str(s),shoe,'shoe',.9)
            c.add('Shoe_ankle_'+str(s),loft([(.057,x,.003,.032,.033),(.122,x,-.002,.033,.032)],n=40,steps=14),'shoe',.93)
            for off in (-.020,.020):
                c.curve('Slipon_stitch_'+str(s)+'_'+str(off),[[x+off,.070,.091],[x+off,.082,.056],[x+off,.078,.015]],[.0006]*3,'navy',n=5,steps=20)
        else:
            foot=unify([ellipsoid([x,.033,.039],[.035,.028,.078],36,22),loft([(.037,x,0,.031,.032),(.123,x,-.001,.033,.032)],n=40,steps=20)])
            c.add('White_sock_and_foot_'+str(s),foot,'sock',.93)
            for k in range(3):
                pp=[[x+.033*math.cos(t),.112+k*.003,-.001+.032*math.sin(t)] for t in np.linspace(0,2*PI,49)]
                c.curve('Sock_cuff_rib_'+str(s)+'_'+str(k),pp,[.0004]*49,'sock',n=5,steps=48,rough=.95)
    # Left wrist accessory, rebuilt around the new wrist instead of floating above it.
    x=.220;y=.638;z=.017
    pp=[[x+.020*math.cos(t),y+.004*math.cos(t),z+.024*math.sin(t)] for t in np.linspace(0,2*PI,65)]
    c.curve('Watch_band',pp,[.0065]*65,'blue' if boy else 'pinkBand',depths=[.005]*65,n=10,steps=64,rough=.85)
    c.ell('Watch_case',(x,y,.043),(.021,.023,.004),'blueHi' if boy else 'pinkBand',.6)
    c.ell('Watch_screen',(x,y,.047),(.0155,.0175,.001),'navy' if boy else 'sock',.2)

def glasses(c,face):
    for s in (-1,1):
        pp=[]
        for t in np.linspace(0,2*PI,81):
            x=s*.049+.036*math.cos(t);y=1.211+.033*math.sin(t)
            # Slightly curved frame follows the rounded face.
            z=.118-.013*(abs(x)/.09)**2
            pp.append([x,y,z])
        c.curve('Round_glasses_rim_'+str(s),pp,[.0015]*81,'glass',n=10,steps=80,rough=.35)
        c.curve('Glasses_temple_'+str(s),[[s*.084,1.221,.106],[s*.109,1.229,.045],[s*.120,1.216,-.008],[s*.119,1.201,-.015]],[.0018,.0018,.002,.0016],'glass',n=10,steps=32,rough=.4)
        c.ell('Glasses_hinge_'+str(s),(s*.084,1.222,.107),(.004,.0022,.0022),'metal',.35)
    c.curve('Glasses_bridge',[[-.013,1.222,.119],[0,1.228,.126],[.013,1.222,.119]],[.0016]*3,'glass',n=10,steps=20,rough=.35)

def main():
    manifest={'version':2,'units':'metres','up':'+Y','forward':'+Z','rigged':False,'animations':False,
              'source_branch':'feature/high-fidelity-girl-character','models':[]}
    for boy in (False,True):
        c=Character(boy);body(c);face=Face(c);face.build();hair(c,face)
        if boy:glasses(c,face)
        target=OUT/(c.name+'_avatar_v2.glb')
        c.scene.metadata.update({'character':c.name,'version':2,'pose':'relaxed A pose','rigged':False,'source':'photo interpretation; rear and profile inferred'})
        target.write_bytes(c.scene.export(file_type='glb',include_normals=True))
        loaded=tm.load(target,force='scene')
        assert np.isfinite(loaded.bounds).all()
        for g in loaded.geometry.values():
            alignment=np.einsum('ij,ij->i',g.vertex_normals[g.faces].mean(axis=1),g.face_normals)
            assert np.mean(alignment)>.2, 'Vertex/face normal mismatch'
        data=target.read_bytes()
        item={'file':target.name,'bytes':len(data),'triangles':sum(len(g.faces) for g in loaded.geometry.values()),
              'meshes':len(loaded.geometry),'sha256':hashlib.sha256(data).hexdigest(),
              'source_sha256':hashlib.sha256((OUT/(c.name+'_avatar.glb')).read_bytes()).hexdigest(),
              'bounds':loaded.bounds.tolist()}
        manifest['models'].append(item);print(json.dumps(item),flush=True)
    (OUT/'manifest_v2.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__':main()
