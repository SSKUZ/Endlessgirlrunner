"""Reproducible stylized photo-reference characters. Python 3, numpy, scipy, trimesh.
Coordinates: metres, Y up, facing +Z. Static A pose; no rig or animations.
Run from this directory: python generate_characters.py
"""
import json, math, hashlib
from pathlib import Path
import numpy as np
import trimesh as tm
from scipy.interpolate import CubicSpline

OUT=Path(__file__).resolve().parent/'assets/characters'
OUT.mkdir(parents=True,exist_ok=True)
COLORS=dict(skin='#e9bb9d', skinBoy='#ebc7b2', lip='#bb7776', crease='#985c50',
 hair='#3b251e', hairLight='#50352a', boyHair='#423a32', boyLight='#574b3d',
 white='#f4efe4', iris='#513727', irisBoy='#686959', pupil='#151b20',
 brow='#493329', pink='#ef5e85', watchPink='#daa7ae', yellow='#f1df8b',
 trim='#e5cb71', navy='#162232', black='#151c25', blue='#0768dc', blueLight='#1879e8',
 pants='#e3e2db', sole='#f1f0e9', metal='#30333a')

def rgba(c):
    h=COLORS.get(c,c).lstrip('#'); return [int(h[i:i+2],16) for i in (0,2,4)]+[255]

class Model:
    def __init__(self,name): self.scene=tm.Scene(); self.name=name; self.count=0
    def add(self,name,v,f,color):
        mesh=tm.Trimesh(vertices=np.array(v), faces=np.array(f),process=True)
        mesh.fix_normals()
        mesh.visual=tm.visual.TextureVisuals(material=tm.visual.material.PBRMaterial(
            name=color,baseColorFactor=rgba(color),metallicFactor=0,roughnessFactor=.78,
            doubleSided=False))
        # Cache smooth normals for GLB export.
        _=mesh.vertex_normals
        self.scene.add_geometry(mesh,node_name=name,geom_name=name)
        self.count+=len(mesh.faces)
    def ell(self,name,c,r,color,nu=24,nv=16):
        v=[]; f=[]
        for j in range(nv+1):
            p=math.pi*j/nv
            for i in range(nu):
                t=2*math.pi*i/nu
                v.append(np.array(c)+np.array(r)*[math.sin(p)*math.cos(t),math.cos(p),math.sin(p)*math.sin(t)])
        for j in range(nv):
            for i in range(nu):
                a=j*nu+i;b=j*nu+(i+1)%nu;c1=a+nu;d=b+nu
                f.extend([[a,c1,b],[b,c1,d]])
        self.add(name,v,f,color)
    def tube(self,name,points,radii,color,n=12,steps=None):
        points=np.array(points,float)
        if steps:
            t=np.linspace(0,1,len(points)); u=np.linspace(0,1,steps)
            points=CubicSpline(t,points)(u)
            radii=np.interp(u,t,radii)
        v=[];f=[]
        for k,p in enumerate(points):
            tangent=points[min(k+1,len(points)-1)]-points[max(0,k-1)]
            tangent/=np.linalg.norm(tangent)
            axis=np.array([0,0,1.]) if abs(tangent[2])<.9 else np.array([1.,0,0])
            a=np.cross(tangent,axis);a/=np.linalg.norm(a);b=np.cross(tangent,a)
            for i in range(n):
                t=2*math.pi*i/n;v.append(p+radii[k]*(a*math.cos(t)+b*math.sin(t)))
        for k in range(len(points)-1):
            for i in range(n):
                a=k*n+i;b=k*n+(i+1)%n;f.extend([[a,b,a+n],[b,b+n,a+n]])
        v.extend([points[0],points[-1]])
        for i in range(n):f.extend([[len(v)-2,(i+1)%n,i],[len(v)-1,(len(points)-1)*n+i,(len(points)-1)*n+(i+1)%n]])
        self.add(name,v,f,color)
    def cloth(self,name,rings,color,n=40,steps=28,fold=.004):
        # rings: y, centre x, centre z, x radius, z radius.
        rr=np.array(rings); vals=CubicSpline(np.linspace(0,1,len(rr)),rr)(np.linspace(0,1,steps))
        v=[];f=[]
        for k,(y,x,z,rx,rz) in enumerate(vals):
            u=k/(steps-1)
            for i in range(n):
                t=2*math.pi*i/n
                w=fold*(math.sin(t*7+u*11)+.45*math.sin(t*11-u*19))*(.4+.6*math.sin(math.pi*u)**2)
                v.append([x+(rx+w)*math.cos(t),y+.0015*math.sin(t*4+u*9),z+(rz+w)*math.sin(t)])
        for k in range(steps-1):
            for i in range(n):
                a=k*n+i;b=k*n+(i+1)%n;f.extend([[a,b,a+n],[b,b+n,a+n]])
        for k in (0,steps-1):
            v.append([vals[k,1],vals[k,0],vals[k,2]])
            for i in range(n):f.append([len(v)-1,k*n+i,k*n+(i+1)%n])
        self.add(name,v,f,color)

def face(m,boy):
    skin='skinBoy' if boy else 'skin'; cy=1.132; ry=.151 if boy else .156
    # Continuous skull/face. Front surface includes cheeks, sockets, bridge and nose.
    nu=64;nv=44;v=[];f=[]
    for j in range(nv+1):
        p=math.pi*j/nv;y=cy+ry*math.cos(p); q=(y-cy)/ry
        width=.111 if boy else .108
        jaw=1-(.10 if boy else .17)*max(0,-q)**.7
        # Shorten lower face into a child's rounded jaw rather than an adult oval.
        if q<-.35: y+=.024*((-q-.35)/.65)
        for i in range(nu):
            t=2*math.pi*i/nu;x=width*math.sin(p)*math.cos(t)*jaw
            z=.091*math.sin(p)*math.sin(t)
            if z>0:
                def g(xx,yy,sx,sy):return math.exp(-((x-xx)/sx)**2-((y-yy)/sy)**2)
                d=(.008 if boy else .014)*(g(.060,1.113,.040,.038)+g(-.060,1.113,.040,.038))
                d-=.006*(g(.046,1.16,.030,.019)+g(-.046,1.16,.030,.019))
                d+=(.014 if boy else .016)*g(0,1.145,.016,.044)+(.026 if boy else .030)*g(0,1.119,.025 if boy else .022,.014)
                d+=.006*g(0,1.075,.040,.018)
                z+=d*max(0,math.sin(t))**4
            v.append([x,y,z])
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu;f.extend([[a,a+nu,b],[b,a+nu,b+nu]])
    m.add('Head_sculpted_continuous_face',v,f,skin)
    for s in (-1,1):
        m.ell('Ear_'+str(s),(s*.105,1.133,-.002),(.017,.030,.013),skin,20,14)
        m.ell('Ear_concha_'+str(s),(s*.112,1.133,.008),(.007,.018,.003),'lip',16,12)
        # Almond eyes, limited vertical extent. No oversized eyeballs.
        ex=s*.047;ey=1.159; ez=.083
        v=[[ex,ey,ez+.008]];f=[]; n=32
        for i in range(n):
            t=2*math.pi*i/n
            v.append([ex+.029*math.cos(t),ey+.0115*math.sin(t)*(abs(math.sin(t))**.2),ez-.004*abs(math.cos(t))])
        for i in range(n):f.append([0,i+1,(i+1)%n+1])
        m.add('Eye_white_'+str(s),v,f,'white')
        m.ell('Iris_'+str(s),(ex,ey,.093),(.0108,.0108,.0024),'irisBoy' if boy else 'iris',24,14)
        m.ell('Pupil_'+str(s),(ex,ey,.095),(.0056,.0065,.0014),'pupil',20,12)
        m.ell('Eye_glint_'+str(s),(ex-.003,ey+.004,.0966),(.0023,.0023,.001),'white',12,8)
        for top in (True,False):
            pts=[]
            for t in np.linspace(0,math.pi,13):
                pts.append([ex+.029*math.cos(t),ey+(.012 if top else -.011)*math.sin(t),ez+.0005-.003*abs(math.cos(t))])
            m.tube(('Upper_lid' if top else 'Lower_lid')+str(s),pts,[.0019]*13,'brow' if top else skin,n=6)
        m.tube('Eyebrow_'+str(s),[[ex-.029,1.187,.081],[ex-.013,1.192,.086],[ex+.008,1.191,.087],[ex+.028,1.185,.080]], [.0028,.0036,.003,.0012],'boyHair' if boy else 'brow',n=8,steps=16)
        m.ell('Nostril_'+str(s),(s*.010,1.111,.122),(.004,.0018,.0015),'crease',12,8)
    # Closed, subtly upturned smile, separate thin vermilion surfaces.
    pts=[]
    mouth_width=.032 if boy else .034
    for x in np.linspace(-mouth_width,mouth_width,23):
        pts.append([x,1.082+(.0035 if boy else .006)*(x/mouth_width)**2,.087+.008*(1-(x/mouth_width)**2)])
    m.tube('Smile_line',pts,[.0011]*23,'crease',n=6)
    for off,rad in ((.0020,.0016),(-.0025,.0022)):
        pp=np.array(pts);pp[:,1]+=off;pp[:,2]-=.0005
        m.tube('Lip_'+str(off),pp,[rad*(.25+.75*math.sin(math.pi*i/22)) for i in range(23)],'lip',n=6)
    # Hair cap follows the skull and distinct hairline.
    v=[];f=[]; nu=56;nv=22
    for j in range(nv+1):
        u=j/nv
        for i in range(nu):
            t=2*math.pi*i/nu;front=max(0,math.sin(t))
            edge=(1.57-.65*front) if boy else (1.86-.90*front+.10*math.cos(t)*front)
            p=u*edge
            wave=(.0015 if boy else .0008)*math.sin(t*19+p*13)
            v.append([(.114+wave)*math.sin(p)*math.cos(t),cy+(.162+wave)*math.cos(p),(.098+wave)*math.sin(p)*math.sin(t)-.003])
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu;f.extend([[a,a+nu,b],[b,a+nu,b+nu]])
    m.add('Hair_fitted_cap',v,f,'boyHair' if boy else 'hair')
    if boy:
        for k in range(32):
            t=2*math.pi*k/32
            pts=[]
            for p in np.linspace(.14,.99 if math.sin(t)>0 else 1.5,8):
                pts.append([.116*math.sin(p)*math.cos(t),cy+.164*math.cos(p),.100*math.sin(p)*math.sin(t)-.003])
            m.tube('Short_hair_lock_'+str(k),pts,[.003,.004,.004,.004,.004,.004,.003,.0006],'boyLight' if k%4==0 else 'boyHair',n=6)
        # Round dark thin rims, bridge and temples; no opaque lens disks.
        for s in (-1,1):
            ex=s*.048; pts=[[ex+.037*math.cos(t),1.154+.036*math.sin(t),.111] for t in np.linspace(0,2*math.pi,41)]
            m.tube('Round_glasses_'+str(s),pts,[.0017]*41,'metal',n=7)
            m.tube('Glasses_temple_'+str(s),[[s*.084,1.163,.11],[s*.105,1.17,.03],[s*.111,1.155,-.015]],[.0016]*3,'metal',n=7,steps=10)
        m.tube('Glasses_bridge',[[-.012,1.166,.112],[0,1.171,.116],[.012,1.166,.112]],[.0016]*3,'metal',n=7,steps=9)
    else:
        # Swept strands define the offset part and frame both sides of the face.
        for s in (-1,1):
            for k in range(9):
                o=k*.005
                pts=[[-.019+s*o*.3,1.289,-.005],[s*(.047+o*.3),1.272,.060],[s*(.082+o*.25),1.222,.065],[s*(.105+o*.10),1.164,.018],[s*.092,1.095,-.012]]
                m.tube('Side_swept_hair_'+str(s)+'_'+str(k),pts,[.0055,.006,.0055,.004,.001],'hairLight' if k%4==0 else 'hair',n=7,steps=18)
        # Three interwoven continuous strands, ending in pink tie and hair tail.
        for k in range(3):
            pts=[];rr=[]
            for i,u in enumerate(np.linspace(0,1,45)):
                a=u*math.pi*10+k*2*math.pi/3;r=.016*(1-.52*u)
                pts.append([-.095-.035*u+r*math.cos(a),1.085-.270*u,.027+.058*u+r*math.sin(a)])
                rr.append(.010*(1-.42*u))
            m.tube('Braid_strand_'+str(k),pts,rr,'hairLight' if k==1 else 'hair',n=8)
        m.tube('Pink_hair_tie',[[-.126,.822,.084],[-.129,.810,.087]],[.014,.014],'pink',n=18)
        m.tube('Braid_tail',[[-.130,.811,.086],[-.134,.774,.089],[-.139,.734,.088]],[.011,.009,.001],'hair',n=12,steps=12)

def make(boy=False):
    m=Model('BOY' if boy else 'GIRL');skin='skinBoy' if boy else 'skin'
    # Neck, torso and garments built from smoothly interpolated elliptical rings.
    m.cloth('Neck',[(.945,0,0,.034,.032),(1.027,0,0,.035,.033)],skin,n=24,steps=8,fold=0)
    if boy:
        m.cloth('Black_hoodie',[(.53,0,0,.135,.070),(.67,0,0,.132,.070),(.85,0,0,.128,.065),(.96,0,-.006,.112,.053),(.975,0,-.005,.045,.036)],'black',fold=.002)
        # Blue shell, split front exposes hoodie, back stays continuous.
        for side in (-1,1):
            v=[];f=[]; nr=26; nt=28
            for j in range(nr):
                u=j/(nr-1); y=.54+.43*u; rx=.145-.035*u**5;rz=.085-.024*u**5
                for i in range(nt):
                    t=(.19+(2*math.pi-.38)*i/(nt-1))
                    # Rotate open seam to +Z; half shells meet at rear.
                    t=math.pi/2+side*t/2
                    w=.003*math.sin(t*9+u*18)
                    v.append([(rx+w)*math.cos(t),y,(rz+w)*math.sin(t)])
            for j in range(nr-1):
                for i in range(nt-1):
                    a=j*nt+i;f.extend([[a,a+nt,a+1],[a+1,a+nt,a+nt+1]])
            if side==-1:f=[tri[::-1] for tri in f]
            m.add('Blue_shell_panel_'+str(side),v,f,'blue')
        for s in (-1,1):
            m.tube('Jacket_open_zip_'+str(s),[[s*.026,.55,.078],[s*.030,.74,.078],[s*.041,.88,.065],[s*.061,.964,.044]],[.003]*4,'navy',n=7,steps=20)
        m.tube('Hood_back',[[.095,.927,-.026],[.10,.985,-.048],[0,1.010,-.069],[-.10,.985,-.048],[-.095,.927,-.026]],[.025,.026,.026,.026,.025],'black',n=12,steps=28)
        m.tube('Hoodie_zip',[[0,.55,.071],[0,.75,.071],[0,.884,.062]],[.002]*3,'metal',n=6,steps=16)
        m.ell('Zip_pull',(0,.873,.076),(.006,.010,.002),'metal',12,8)
        # Backpack and flat shoulder straps visible in the reference.
        m.ell('Backpack',(0,.756,-.101),(.116,.167,.061),'navy',28,20)
        for s in (-1,1):
            m.tube('Backpack_strap_'+str(s),[[s*.086,.953,.045],[s*.105,.88,.079],[s*.108,.71,.075],[s*.104,.61,-.063]],[.016]*4,'black',n=10,steps=18)
        pants='pants'
    else:
        m.cloth('Yellow_tshirt',[(.567,0,.008,.123,.068),(.60,0,.003,.124,.068),(.72,0,0,.112,.065),(.86,0,0,.118,.062),(.945,0,-.004,.110,.052),(.972,0,-.003,.044,.037)],'yellow',fold=.0035)
        m.cloth('Tshirt_hem',[(.565,0,.008,.123,.069),(.576,0,.008,.124,.070)],'trim',steps=4,fold=.001)
        m.tube('Crew_neck',[[(.043*math.cos(t)),.969-.011*math.sin(t),.036*math.sin(t)-.003] for t in np.linspace(0,2*math.pi,41)],[.003]*41,'trim',n=8)
        # Small rabbit print on chest: flat tubes following the shirt surface.
        for k in range(2):
            x=.055+k*.029;z=.064
            pts=[[x+.012*math.cos(t),.816+.014*math.sin(t),z] for t in np.linspace(0,2*math.pi,25)]
            m.tube('Rabbit_print_face_'+str(k),pts,[.0008]*25,'navy',n=5)
            for s in (-1,1):
                xx=x+s*.006
                m.tube('Rabbit_ear_'+str(k)+str(s),[[xx-.003,.826,z],[xx-.003,.858,z],[xx+.003,.858,z],[xx+.003,.826,z]],[.0007]*4,'navy',n=5,steps=12)
                m.ell('Rabbit_eye_'+str(k)+str(s),(xx,.818,z+.001),(.0012,.0012,.0007),'navy',8,6)
        pants='yellow'
    for s in (-1,1):
        # Relaxed A pose keeps hands clear of clothes for later skinning.
        shoulder=[s*.094,.914,-.003];elbow=[s*.174,.748,.0];wrist=[s*.215,.611,.015]
        if boy:
            m.tube('Jacket_upper_sleeve_'+str(s),[shoulder,[s*.145,.86,0],elbow],[.054,.053,.044],'blue',n=24,steps=16)
            m.tube('Jacket_lower_sleeve_'+str(s),[elbow,[s*.197,.68,.005],wrist],[.045,.044,.028],'navy',n=24,steps=16)
            m.tube('Jacket_cuff_'+str(s),[[s*.211,.625,.014],wrist],[.029,.027],'black',n=20)
        else:
            m.tube('Short_sleeve_'+str(s),[shoulder,[s*.144,.867,0],[s*.156,.831,.001]],[.052,.050,.047],'yellow',n=24,steps=12)
            m.tube('Arm_'+str(s),[[s*.149,.850,0],elbow,[s*.193,.683,.009],wrist],[.031,.029,.025,.019],skin,n=20,steps=22)
        m.ell('Palm_'+str(s),(s*.221,.581,.018),(.023,.033,.014),skin,20,14)
        for k in range(4):
            x=s*(.205+k*.010)
            m.tube('Finger_'+str(s)+'_'+str(k),[[x,.571,.022],[x+s*.004,.548-(.004 if k in (1,2) else 0),.025],[x+s*.003,.539-(.004 if k in (1,2) else 0),.029]],[.0053,.0048,.0035],skin,n=8,steps=7)
        m.tube('Thumb_'+str(s),[[s*.202,.593,.025],[s*.192,.573,.034],[s*.195,.561,.038]],[.007,.006,.004],skin,n=8,steps=8)
        # Loose trousers taper to ankle with low amplitude vertical fabric folds.
        x=s*.063
        m.cloth('Trouser_leg_'+str(s),[(.105,x,0,.047,.043),(.137,x,0,.061,.051),(.25,s*.068,0,.067,.057),(.40,s*.066,0,.070,.058),(.55,s*.063,0,.066,.059),(.625,s*.060,0,.065,.060)],pants,n=36,steps=30,fold=.004)
        if boy:
            m.ell('Shoe_sole_'+str(s),(x,.025,.028),(.047,.019,.092),'sole',28,16)
            m.ell('Navy_slip_on_'+str(s),(x,.054,.025),(.044,.041,.085),'navy',28,18)
            m.cloth('Ankle_'+str(s),[(.064,x,0,.034,.034),(.125,x,0,.033,.032)],'black',n=20,steps=8,fold=0)
        else:
            m.cloth('Sock_ankle_'+str(s),[(.04,x,0,.032,.032),(.133,x,0,.034,.033)],'white',n=24,steps=12,fold=.001)
            m.ell('Sock_foot_'+str(s),(x,.034,.036),(.036,.030,.077),'white',28,16)
    # A watch on the left wrist, colored strap and inset face.
    x=.211;y=.627;z=.014
    m.tube('Watch_strap',[[x+.024*math.cos(t),y+.010*math.sin(t),z+.025*math.sin(t)] for t in np.linspace(0,2*math.pi,33)],[.007]*33,'blue' if boy else 'watchPink',n=8)
    m.ell('Watch_case',(x,y,.044),(.022,.025,.006),'blueLight' if boy else 'watchPink',20,12)
    m.ell('Watch_face',(x,y,.049),(.016,.019,.002),'navy' if boy else 'white',20,12)
    face(m,boy)
    path=OUT/('boy_avatar.glb' if boy else 'girl_avatar.glb')
    data=m.scene.export(file_type='glb',include_normals=True)
    path.write_bytes(data)
    # Reopen actual GLB; check finite geometry, triangle count and bounds.
    loaded=tm.load(path,force='scene'); triangles=sum(len(g.faces) for g in loaded.geometry.values())
    assert triangles==m.count and np.isfinite(loaded.bounds).all()
    return dict(file=path.name,bytes=len(data),triangles=triangles,sha256=hashlib.sha256(data).hexdigest(),bounds=loaded.bounds.tolist(),git_blob_sha=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest())

if __name__=='__main__':
    result=[make(False),make(True)]
    (OUT/'manifest.json').write_text(json.dumps({'units':'metres','up':'+Y','forward':'+Z','pose':'static relaxed A pose','rigged':False,'limitations':'Interpretive cartoon likeness from front photographs. Side and rear inferred. Separate meshes require skinning and joint topology preparation before deformation animation.','models':result},indent=2)+'\n')
    print(json.dumps(result,indent=2))
