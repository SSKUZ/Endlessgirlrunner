"""Render the exported GLB geometry, not a concept illustration.
Requirements: mitsuba 3.9, trimesh, numpy, pillow. CPU LLVM renderer.
python tools/render_character_qa.py [--character girl|boy] [--views front face ...]
"""
from pathlib import Path
import json, argparse
import numpy as np
import trimesh as tm
import mitsuba as mi
import drjit as dr
from PIL import Image,ImageDraw,ImageFont
mi.set_variant('llvm_ad_rgb');dr.set_thread_count(8)
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/characters/qa_v2';OUT.mkdir(exist_ok=True)

def geometry(g,name):
    factor=np.asarray(g.visual.material.baseColorFactor,dtype=float)/255
    rough=float(g.visual.material.roughnessFactor or .6)
    attrs=getattr(g.visual,'vertex_attributes',{})
    colors=attrs.get('color')
    if colors is not None:
        base={'type':'mesh_attribute','name':'vertex_color'}
    else:base={'type':'rgb','value':factor[:3].tolist()}
    props=mi.Properties()
    props['bsdf']=mi.load_dict({'type':'principled','base_color':base,'roughness':rough,
                               'specular':.35 if rough<.3 else .22})
    m=mi.Mesh(name,len(g.vertices),len(g.faces),props,has_vertex_normals=True)
    p=mi.traverse(m);p['vertex_positions']=np.asarray(g.vertices,np.float32).ravel()
    p['vertex_normals']=np.asarray(g.vertex_normals,np.float32).ravel();p['faces']=np.asarray(g.faces,np.uint32).ravel();p.update()
    if colors is not None:
        cs=np.asarray(colors)[:,:3].astype(np.float32)
        if cs.max()>1:cs/=255
        m.add_attribute('vertex_color',3,cs.ravel())
    return m

VIEWS={
 'front':([0,.77,3.15],[0,.694,0],18),
 'left':([-3.15,.77,0],[0,.694,0],18),
 'right':([3.15,.77,0],[0,.694,0],18),
 'back':([0,.77,-3.15],[0,.694,0],18),
 'face':([0,1.234,.87],[0,1.215,.015],24),
 'hair':([-.46,1.355,-.64],[0,1.225,-.015],28),
}

def studio_environment():
    # A smooth photographic light dome: no visible rectangles or black sky.
    u,v=np.meshgrid(np.linspace(0,1,256,endpoint=False),np.linspace(0,1,128))
    data=np.broadcast_to(np.array([.20,.22,.25]),(128,256,3)).copy()
    for cx,cy,wx,wy,power in [(.72,.22,.065,.080,[11,9.8,8.5]),(.25,.28,.080,.11,[3.5,4.5,6]),(.45,.19,.055,.075,[7,8,9])]:
        du=np.minimum(np.abs(u-cx),1-np.abs(u-cx))
        weight=np.exp(-(du/wx)**4-((v-cy)/wy)**4)
        data+=weight[:,:,None]*np.array(power)*.50
    return mi.Bitmap(data.astype(np.float32))

def render(name,views,spp=None,size=None):
    s=tm.load(ROOT/'assets/characters'/f'{name}_avatar_v2.glb',force='scene')
    spec={'type':'scene','integrator':{'type':'path','max_depth':7,'rr_depth':4,'hide_emitters':False},
          'environment':{'type':'envmap','bitmap':studio_environment()},
          'floor':{'type':'rectangle','to_world':mi.ScalarTransform4f.translate([0,-.003,0])@mi.ScalarTransform4f.rotate([1,0,0],-90)@mi.ScalarTransform4f.scale(200),
                   'bsdf':{'type':'diffuse','reflectance':{'type':'rgb','value':[.65,.68,.72]}}}}
    for k,g in s.geometry.items():spec[('mesh_'+k).replace('.','_')]=geometry(g,k)
    for i,v in enumerate(views):
        origin,target,fov=VIEWS[v];close=v in ['face','hair']
        spec['sensor_'+str(i)]={'type':'perspective','fov':fov,'fov_axis':'x','to_world':mi.ScalarTransform4f.look_at(origin=origin,target=target,up=[0,1,0]),
             'sampler':{'type':'independent','sample_count':spp or (256 if close else 128)},
             'film':{'type':'hdrfilm','width':size or (640 if close else 480),'height':size or (640 if close else 800),
                     'rfilter':{'type':'tent'}}}
    scene=mi.load_dict(spec)
    for i,v in enumerate(views):
        img=mi.render(scene,sensor=i,seed=19,spp=spp or (256 if v in ['face','hair'] else 128))
        mi.util.write_bitmap(str(OUT/f'{name}_{v}.png'),img)
        print(name,v,'rendered',flush=True)

def contact(name):
    files=[OUT/f'{name}_{v}.png' for v in VIEWS]
    if not all(p.exists() for p in files):return
    sheet=Image.new('RGB',(1440,1432),'#e5e9ef');draw=ImageDraw.Draw(sheet)
    try:font=ImageFont.truetype('DejaVuSans.ttf',21)
    except OSError:font=None
    for i,(view,p) in enumerate(zip(VIEWS,files)):
        tile=Image.open(p).convert('RGB');tile.thumbnail((470,650))
        x=(i%3)*480+(480-tile.width)//2;y=(i//3)*716+43
        sheet.paste(tile,(x,y));draw.text(((i%3)*480+20,(i//3)*716+12),name.upper()+' / '+view.upper(),font=font,fill='#283747')
    sheet.save(OUT/f'{name}_contact.jpg',quality=92)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--character',choices=['girl','boy']);ap.add_argument('--views',nargs='+',choices=list(VIEWS))
    ap.add_argument('--spp',type=int);ap.add_argument('--size',type=int);a=ap.parse_args()
    for name in ([a.character] if a.character else ['girl','boy']):render(name,a.views or list(VIEWS),a.spp,a.size);contact(name)
