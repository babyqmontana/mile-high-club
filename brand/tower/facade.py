# Фасад башни Mile High Club: навесное стекло с комнатами за ним. blender -b -P brand/tower/facade.py -- <папка>
# Два кадра одной сетки 14×8 (панель × этаж): glass — стекло, переплёт и пояса под вечерним небом; lit — только свет комнат.
import bpy, random, math, sys, os
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]; RES = int(sys.argv[sys.argv.index('--') + 2]) if len(sys.argv) > sys.argv.index('--') + 2 else 2048
os.makedirs(OUT, exist_ok=True); random.seed(26)
C, R, CW, CH = 14, 8, 1.35, 2.3
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.samples = 160; cy.use_denoising = True; cy.max_bounces = 6; cy.sample_clamp_indirect = 3
try:
    pr = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        pr.compute_device_type = t; pr.get_devices()
        if any(d.type == t for d in pr.devices):
            for d in pr.devices: d.use = d.type == t
            cy.device = 'GPU'; break
except Exception as e: print(e)
sc.view_settings.view_transform = 'AgX'
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100; sc.render.image_settings.file_format = 'PNG'

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + .055) / 1.055) ** 2.4 if x > .04045 else x / 12.92 for x in c)
MC = {}
def mat(n, col, rough=.6, metal=0, emit=None, k=0):
    if n in MC: return MC[n]
    m = bpy.data.materials.new(n); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(col), 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*lin(emit), 1); b.inputs['Emission Strength'].default_value = k
    MC[n] = m; return m
def box(c, s, m, rot=(0, 0, 0)):
    x, y, z = (v / 2 for v in s); v = [(a, b, d) for a in (-x, x) for b in (-y, y) for d in (-z, z)]
    me = bpy.data.meshes.new('b'); me.from_pydata(v, [], [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]); me.materials.append(m)
    o = bpy.data.objects.new('b', me); sc.collection.objects.link(o); o.location = c; o.rotation_euler = rot; return o
LIT, GLASS = [], []
alu, dark = mat('alu', '#5a626d', .35, .9), mat('spandrel', '#141a24', .25, .5)
gl = bpy.data.materials.new('glass'); gl.use_nodes = True; nt = gl.node_tree; nt.nodes.clear()
o_ = nt.nodes.new('ShaderNodeOutputMaterial'); mx = nt.nodes.new('ShaderNodeMixShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); gs = nt.nodes.new('ShaderNodeBsdfGlossy')
gs.inputs['Roughness'].default_value = .03; gs.inputs['Color'].default_value = (.62, .74, .95, 1); tr.inputs['Color'].default_value = (.8, .86, .92, 1); mx.inputs[0].default_value = .34
nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gs.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o_.inputs[0])
W, H = C * CW, R * CH
walls = ['#7a5a48', '#6a5a5e', '#80684e', '#5c5064', '#74524a', '#8a7358', '#54565e']
def room(x0, n, r, on):
    w = n * CW; z = r * CH + .52; h = CH - .62; d = 2.6; cx = x0 + w / 2; key = random.choice(walls)
    wall = mat('w' + key, key, .9); fl = mat('floor', '#3a2a22', .5); ce = mat('ceil', '#8f8a86', .9); wood = mat('wood', '#4a2e20', .5); fab = mat('f' + str(random.randint(0, 3)), random.choice(['#6a3040', '#3a4658', '#7a6048', '#4a3a58']), .9)
    box((cx, d, z + h / 2), (w, .04, h), wall); box((cx, d / 2, z - .02), (w, d, .04), fl); box((cx, d / 2, z + h + .02), (w, d, .04), ce)
    for s in (0, 1): box((x0 + s * w, d / 2, z + h / 2), (.05, d, h), wall)
    if on:
        kind = random.random(); warm = random.choice(['#ffc27a', '#ffd09a', '#ffb868', '#ffdcb4'])
        for k in range(n):
            lx = x0 + CW * (k + .5)
            if kind < .55: o = box((lx, 1.2, z + h - .03), (.34, .34, .03), mat('dl' + warm, '#ffffff', .5, 0, warm, 34))
            else: o = box((lx, 1.5, z + h - .03), (CW * .8, .09, .03), mat('st' + warm, '#ffffff', .5, 0, warm, 26))
            LIT.append(o)
        if random.random() < .75:
            lx = x0 + random.uniform(.35, max(.4, w - .35)); box((lx, 1.7, z + .35), (.05, .05, .7), wood)
            LIT.append(box((lx, 1.7, z + .78), (.3, .3, .26), mat('lamp' + warm, '#ffffff', .8, 0, warm, 9)))
    for k in range(n):
        x = x0 + CW * (k + .5) + random.uniform(-.2, .2); q = random.random()
        if q < .3: box((x, 1.5, z + .2), (.95, .5, .4), fab); box((x, 1.75, z + .42), (.95, .14, .5), fab)                 # диван
        elif q < .55: box((x, 1.2, z + .4), (.9, .45, .05), wood); box((x, 1.05, z + .56), (.42, .03, .26), mat('scr', '#0d1118', .2))      # стол с экраном
        elif q < .75: box((x, 1.2, z + .16), (1.05, 1.2, .3), mat('bed', '#b8a898', .9)); box((x, 1.85, z + .4), (1.1, .12, .65), wood)      # кровать
        elif q < .88:                                                                                                                            # растение
            box((x, 1.1, z + .14), (.2, .2, .28), wood)
            for a in range(7): box((x + math.cos(a) * .12, 1.1 + math.sin(a) * .12, z + .55), (.05, .03, .6), mat('leaf', '#2c4a30', .8), (math.sin(a * 2) * .4, math.cos(a * 3) * .4, 0))
        if random.random() < .4: box((x, d - .05, z + h * .58), (.5, .03, .36), mat('art' + str(k % 3), ['#8a4a3a', '#3a5a6a', '#a08a50'][k % 3], .7))
    for k in range(n):                                                                                                                           # шторы и жалюзи
        q = random.random(); xa = x0 + CW * k
        if q < .28:
            cm = mat('cur' + str(r % 2), ['#a89484', '#8a7a84'][r % 2], .95)
            for s in (0, 1):
                for j in range(6): box((xa + (.07 + j * .045 if s == 0 else CW - .07 - j * .045), .22 + (j % 2) * .05, z + h / 2), (.05, .05, h), cm)
        elif q < .46:
            drop = random.uniform(.3, .95) * h
            for j in range(int(drop / .07)): box((xa + CW / 2, .18, z + h - .04 - j * .07), (CW - .12, .05, .012), mat('blind', '#9a948e', .8), (.5, 0, 0))
for r in range(R):
    x = 0
    while x < C:
        n = min(C - x, random.choice([1, 2, 2, 3])); on = random.random() < (.36 if r % 4 != 1 else .22); room(x * CW, n, r, on); x += n
    z = r * CH
    for c in range(C):
        xm = CW * (c + .5)
        for zc, hh in ((z + .52 + .42, .84), (z + 1.4 + .42, .82)):                              # два стекла на панель, у каждого свой едва заметный наклон
            o = box((xm, .02, zc), (CW - .06, .02, hh), gl, (random.gauss(0, .022), 0, random.gauss(0, .03))); GLASS.append(o)
        tone = random.choice(['#141a24', '#10151d', '#1a212c', '#0d1118'])
        box((xm, .03, z + .25), (CW - .05, .04, .44), mat('sp' + tone, tone, random.uniform(.15, .3), .6), (random.gauss(0, .012), 0, 0))
    box((W / 2, -.03, z + .03), (W, .12, .06), alu); box((W / 2, -.02, z + .5), (W, .09, .035), alu); box((W / 2, -.01, z + 1.38), (W, .06, .03), alu)
for c in range(C + 1): box((c * CW, -.05, H / 2), (.055, .17, H), alu)

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); rp = nt.nodes.new('ShaderNodeValToRGB'); ns = nt.nodes.new('ShaderNodeTexNoise'); ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'
ns.inputs['Scale'].default_value = 9; ns.inputs['Detail'].default_value = 6; ad.inputs[1].default_value = .22
nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(tc.outputs['Generated'], ns.inputs['Vector']); nt.links.new(ns.outputs[0], ad.inputs[0]); nt.links.new(sep.outputs['Z'], ad.inputs[2]); nt.links.new(ad.outputs[0], rp.inputs[0]); nt.links.new(rp.outputs[0], bg.inputs['Color'])
el = rp.color_ramp.elements; el[0].position, el[0].color = .0, (*lin('#1d2740'), 1); el[1].position, el[1].color = .5, (*lin('#2a2350'), 1)
for p, c in ((.06, '#5a6f96'), (.11, '#c08a86'), (.16, '#7c6aa6'), (.26, '#3d4a80')): e = el.new(p); e.color = (*lin(c), 1)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = W; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (W / 2, -12, H / 2); co.rotation_euler = (math.pi / 2, 0, 0); sc.render.pixel_aspect_x = 1; sc.render.resolution_y = round(RES * H / W)
bg.inputs['Strength'].default_value = 1.15
for o in LIT: o.hide_render = True
sc.render.filepath = os.path.join(OUT, 'glass.png'); bpy.ops.render.render(write_still=True)
for o in LIT: o.hide_render = False
bg.inputs['Strength'].default_value = 0.
sc.render.filepath = os.path.join(OUT, 'lit.png'); bpy.ops.render.render(write_still=True)
print('FACADE DONE')
