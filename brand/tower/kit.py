# Отель Mile High Club: подиум, площадь, козырёк, крыши, вертолётная площадка и буквы вывески с запечённым светом.
#   blender -b -P brand/tower/kit.py -- <папка public/img/tower> [сэмплы] [размер]
# Размеры те же, что в public/js/skyline3d.js (x вправо, z к фасаду, y вверх); в Blender это (x, -z, y).
# Каждая часть — своя сетка с одной текстурой: base (земля), roofA (над короной), roofB, roofC, sign (буквы).
import bpy, bmesh, math, random, sys, os
from mathutils import Vector
A = sys.argv[sys.argv.index('--') + 1:]; OUT = A[0]; SPP = int(A[1]) if len(A) > 1 else 64; RES = int(A[2]) if len(A) > 2 else 2048
HERE = os.path.dirname(os.path.abspath(__file__)); TMP = os.path.join(HERE, 'out'); os.makedirs(TMP, exist_ok=True)
PREVIEW = len(A) > 3
random.seed(26)
W, D, FH, POD = 4.4, 3.0, .46, 1.38
TOPY, TOPB, TOPC, CROWN = 44 * FH, 42 * FH, 33 * FH, 49 * FH
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.samples = SPP; cy.use_denoising = False; cy.max_bounces = 5; cy.sample_clamp_indirect = 3; cy.sample_clamp_direct = 8
try:
    pr = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        pr.compute_device_type = t; pr.get_devices()
        if any(d.type == t for d in pr.devices):
            for d in pr.devices: d.use = d.type == t
            cy.device = 'GPU'; print('GPU', t); break
except Exception as e: print(e)
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'

def lin(h):
    h = h.lstrip('#'); h = h if len(h) == 6 else ''.join(c * 2 for c in h); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + .055) / 1.055) ** 2.4 if x > .04045 else x / 12.92 for x in c)
MC = {}
def mat(n, col='#808080', rough=.7, metal=0, emit=None, k=0, noise=0, tex=None):
    if n in MC: return MC[n]
    m = bpy.data.materials.new(n); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']; c = (*lin(col), 1)
    b.inputs['Base Color'].default_value = c; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*lin(emit), 1); b.inputs['Emission Strength'].default_value = k
    if noise:
        g = nt.nodes.new('ShaderNodeNewGeometry'); t = nt.nodes.new('ShaderNodeTexNoise'); r = nt.nodes.new('ShaderNodeValToRGB'); t.inputs['Scale'].default_value = noise; t.inputs['Detail'].default_value = 7
        nt.links.new(g.outputs['Position'], t.inputs['Vector']); nt.links.new(t.outputs[0], r.inputs[0]); nt.links.new(r.outputs[0], b.inputs['Base Color'])
        e = r.color_ramp.elements; e[0].position, e[0].color = .32, tuple(v * .68 for v in c[:3]) + (1,); e[1].position, e[1].color = .66, c
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex); nt.links.new(t.outputs[0], b.inputs['Base Color']); nt.links.new(t.outputs[0], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = k
    MC[n] = m; return m
PART = {}; CUR = 'base'; OY = 0.
def add(me, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    o = bpy.data.objects.new('o', me); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot; o.scale = scale; PART.setdefault(CUR, []).append(o); return o
def P(x, y, z): return (x, -z, y + OY)
def mesh(v, f, m, smooth=False, uv=None):
    me = bpy.data.meshes.new('m'); me.from_pydata(v, [], f); me.materials.append(m); me.uv_layers.new(name='UVMap')
    if uv:
        for i, c in enumerate(uv): me.uv_layers[0].data[i].uv = c
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return me
BX = {}
def box(x, y, z, sx, sy, sz, m, ry=0):   # центр по x,z; y — низ
    a, b, c = sx / 2, sz / 2, sy
    v = [(i, j, k) for i in (-a, a) for j in (-b, b) for k in (0, c)]
    return add(mesh(v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)], m), P(x, y, z), (0, 0, ry))
def cyl(x, y, z, r, h, m, seg=20, r2=None, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h); bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    me = bpy.data.meshes.new('c'); bm.to_mesh(me); bm.free(); me.materials.append(m); me.uv_layers.new(name='UVMap'); return add(me, P(x, y, z), rot)
def rod(a, b, r, m, seg=6):
    a, b = Vector(P(*a)), Vector(P(*b)); d = b - a; o = cyl(0, 0, 0, r, d.length, m, seg); o.location = a; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o
def panel(x, y, z, w, h, m, cell, n):     # вертикальная картинка лицом к улице
    u0, u1 = cell / n, (cell + 1) / n
    return add(mesh([(-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, h), (-w / 2, 0, h)], [(0, 1, 2, 3)], m, uv=[(u0, 0), (u1, 0), (u1, 1), (u0, 1)]), P(x, y, z))
def light(x, y, z, e, col, r=.1):
    L = bpy.data.lights.new('l', 'POINT'); L.energy = e; L.color = lin(col); L.shadow_soft_size = r; o = bpy.data.objects.new('l', L); sc.collection.objects.link(o); o.location = P(x, y, z); return o

stone = mat('stone', '#b9aea2', .8, noise=2.2); stone2 = mat('stone2', '#8d8278', .85, noise=2.6); joint = mat('joint', '#4a423e', .9); bronze = mat('bronze', '#8a6a3c', .32, .9); steel = mat('steel', '#707a86', .35, .9); darkm = mat('dark', '#14141a', .5, .3)
white = mat('white', '#f1ede6', .5, noise=1.4); glassd = mat('glassd', '#141d2a', .1, .6); warm = mat('warm', '#fff', .5, 0, '#ffc98a', 9); warm2 = mat('warm2', '#fff', .5, 0, '#ffcf98', 22); gold = mat('goldl', '#fff', .5, 0, '#ffb84a', 7); violet = mat('violet', '#fff', .5, 0, '#8f4dff', 9); violet2 = mat('violet2', '#301050', .5, 0, '#7a3cff', 1.6)
lobby = mat('lobby', '#000', .3, 0, None, 1.5, tex=os.path.join(os.path.dirname(HERE), 'vice', 'tex', 'store-night.png'))
leaf = mat('leaf', '#2c4a2c', .9, noise=9); leaf2 = mat('leaf2', '#3a5a34', .9, noise=9); bark = mat('bark', '#4a3a2c', .95); soil = mat('soil', '#2a221c', 1); asphalt = mat('asphalt', '#26262b', .45, noise=3); tileA, tileB = mat('tileA', '#8b8580', .6, noise=3), mat('tileB', '#4c4a4c', .55, noise=3); red = mat('red', '#6e1020', .9)

def palm(x, z, h, y=0.):
    n = 9
    for i in range(n):
        t = i / n; rod((x + .05 * math.sin(t * 2), y + h * t, z), (x + .05 * math.sin((t + 1 / n) * 2), y + h * (t + 1 / n) + .01, z), .055 - .022 * t, bark, 7)
    tx, ty = x + .05 * math.sin(2), y + h
    for k in range(12):
        a = k / 12 * math.tau + random.uniform(-.15, .15); L = random.uniform(.6, .78); dr = random.uniform(.25, .6); v, f = [], []
        for i in range(9):
            t = i / 8; r = t * L; yy = .3 * math.sin(t * 2.1) * L - dr * t * t * L; w = .105 * math.sin(math.pi * (.12 + .86 * t)) * (1 if i % 2 else .45)
            v += [(r, -w, yy - .03), (r, 0, yy), (r, w, yy - .03)]
            if i: b = i * 3; f += [(b - 3, b, b + 1, b - 2), (b - 2, b + 1, b + 2, b - 1)]
        add(mesh(v, f, leaf if k % 2 else leaf2), P(tx, ty, z), (0, 0, a))
def bush(x, y, z, r):
    for k in range(4):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r * random.uniform(.6, 1))
        for v in bm.verts: v.co *= random.uniform(.82, 1.12)
        me = bpy.data.meshes.new('b'); bm.to_mesh(me); bm.free(); me.materials.append(leaf if k % 2 else leaf2); me.uv_layers.new(name='UVMap'); me.polygons.foreach_set('use_smooth', [True] * len(me.polygons)); add(me, P(x + random.uniform(-r, r) * .6, y + r * .6, z + random.uniform(-r, r) * .4))
def tree(x, y, z, h):
    rod((x, y, z), (x, y + h * .5, z), .03, bark)
    for k in range(6): bush(x + random.uniform(-.16, .16), y + h * (.42 + .09 * k), z + random.uniform(-.16, .16), .2)

# ---------- base: подиум, вход, площадь ----------
CUR = 'base'; FZ = 1.7; X0, X1 = -2.45, 7.3
box(X0 - .0 + (X1 - X0) / 2, 0, -.25, X1 - X0, POD, 3.9, stone)
for yy in (.46, .92, 1.2): box((X0 + X1) / 2, yy, -.25, X1 - X0 + .015, .014, 3.915, joint)                       # швы камня
box((X0 + X1) / 2, POD - .02, -.25, X1 - X0 + .16, .1, 4.06, stone2); box((X0 + X1) / 2, POD - .05, FZ + .06, X1 - X0 + .1, .03, .03, warm)  # карниз и световая нить под ним
nb = 12; st = (X1 - X0 - .3) / nb
for k in range(nb):                                                                                                  # остекление лобби между пилонами
    x = X0 + .15 + st * (k + .5); ent = 2.6 < x < 4.2
    panel(x, .06, FZ + .012, st - .2, .95, lobby, 3 if ent else [0, 2, 1][k % 3], 4)
    box(x - st / 2, 0, FZ + .06, .16, 1.18, .16, stone2); box(x, 1.02, FZ + .05, st - .16, .05, .06, bronze); cyl(x - st / 2, .62, FZ + .17, .025, .12, warm2, 8)
box(X1 - .15, 0, FZ + .06, .16, 1.18, .16, stone2)
for k in range(5):                                                                                                   # правый торец
    z = FZ - .4 - k * .8; box(X1 + .04, .06, z, .05, .95, .6, mat('sidew', '#5a3424', .3, 0, '#ffb070', .55)); box(X1 + .05, 0, z + .4, .12, 1.18, .14, stone2)
# козырёк: белая волна на тросах, снизу ряды светильников, как на референсе
cx0, cx1, N = 1.05, 5.55, 24; v, f = [], []
for i in range(N + 1):
    t = i / N; x = cx0 + (cx1 - cx0) * t; dep = .9 + 1.35 * math.sin(math.pi * t) ** .8; lift = .12 * math.sin(math.pi * t)
    for z, y in ((FZ, 1.02), (FZ + dep * .6, 1.02 + lift), (FZ + dep, 1.0 + lift * .7)): v += [(x, -z, y), (x, -z, y + .085 - .05 * (z > FZ + dep * .9))]
for i in range(N):
    a, b = i * 6, (i + 1) * 6
    for q in (0, 2): f += [(a + q, a + q + 2, b + q + 2, b + q), (a + q + 1, b + q + 1, b + q + 3, a + q + 3)]
    f += [(a + 4, a + 5, b + 5, b + 4)]
f += [(0, 1, 3, 2), (2, 3, 5, 4), (N * 6, N * 6 + 2, N * 6 + 3, N * 6 + 1), (N * 6 + 2, N * 6 + 4, N * 6 + 5, N * 6 + 3)]
me = mesh(v, f, white); bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free(); add(me, (0, 0, 0))
for i in range(2, N - 1, 2):
    t = i / N; x = cx0 + (cx1 - cx0) * t; dep = .9 + 1.35 * math.sin(math.pi * t) ** .8
    for q in (.3, .62, .9): cyl(x, 1.0, FZ + dep * q, .03, .02, warm2, 8)
for t in (.14, .32, .5, .68, .86):
    x = cx0 + (cx1 - cx0) * t; dep = .9 + 1.35 * math.sin(math.pi * t) ** .8; rod((x, 1.13, FZ + dep * .82), (x, 1.36, FZ + .05), .008, steel)
for t in (.08, .92): x = cx0 + (cx1 - cx0) * t; cyl(x, 0, FZ + .9, .05, 1.06, bronze, 12)
light(3.3, 2.6, 3.4, 9, '#ffe2bd', .4); light(0, 3.2, 6.5, 10, '#cdbcff', .6); light(6.5, 3.2, 6.5, 8, '#cdbcff', .6); light(2.3, .85, 2.6, 5, '#ffcf98'); light(3.3, .85, 2.9, 7, '#ffcf98'); light(4.3, .85, 2.6, 5, '#ffcf98')
# вращающиеся двери и ковёр с латунными стойками
cyl(3.3, 0, FZ + .16, .3, .86, mat('rev', '#5a3a22', .2, 0, '#ffb870', .9), 24); cyl(3.3, .86, FZ + .16, .33, .08, bronze, 24); cyl(3.3, .84, FZ + .16, .29, .02, warm2, 24)
for s in (-1, 1): box(3.3 + s * .02, .02, FZ + .16, .012, .82, .6, bronze, s * .8)
box(3.3, .016, 3.1, .62, .012, 2.6, red)
for k in range(5):
    for s in (-1, 1):
        z = 2.1 + k * .5; cyl(3.3 + s * .42, 0, z, .035, .012, bronze, 10); cyl(3.3 + s * .42, 0, z, .012, .3, bronze, 8); cyl(3.3 + s * .42, .3, z, .024, .03, bronze, 8)
        if k < 4: rod((3.3 + s * .42, .27, z), (3.3 + s * .42, .22, z + .25), .008, red); rod((3.3 + s * .42, .22, z + .25), (3.3 + s * .42, .27, z + .5), .008, red)
# каменный корпус слева: швы, окна под карнизом, зелёная крыша, гараж
SX, SZ, SH = -4.6, 1.2, 2.99
box(SX, 0, SZ, 3.6, SH, 3.2, stone)
for k in range(10): box(SX, .28 * (k + 1), SZ, 3.612, .012, 3.212, joint)
for k in range(3): box(SX - 1.1 + k * 1.1, 2.5, SZ + 1.6, .5, .16, .03, darkm)
box(SX, SH, SZ, 3.7, .12, 3.3, stone2)
for k in range(9): bush(SX - 1.6 + k * .4, SH + .08, SZ + 1.45, .17)
for k in range(5): box(SX - 1.5 + k * .75, .95, SZ + 1.615, .035, 1.4, .03, gold)                                     # вертикальные световые рейки вместо рекламы
gx, gz = SX + 1.0, SZ + 1.6
box(gx, 0, gz + .01, 1.5, .82, .03, darkm)
for s in (-1, 1): box(gx + s * .85, 0, gz + .12, .2, 1.0, .28, stone2)
box(gx, .9, gz + .12, 1.95, .22, .3, stone2); box(gx, .88, gz + .2, 1.5, .02, .03, warm2)
for k in range(3): box(gx - .4 + k * .4, .97, gz + .28, .1, .05, .01, mat('arrow', '#fff', .5, 0, '#54ff9a', 6))
box(gx, .004, gz + 1.1, 1.5, .01, 2.1, asphalt)
light(gx, .7, gz + .4, 2.2, '#ffd9a0')
# площадь: полосатая плитка, водное зеркало с подсветкой, клумбы, скамьи, деревья, фонари
PX0, PX1, PZ0, PZ1 = -6.6, 9.4, FZ, 7.6
box((PX0 + PX1) / 2, -.06, (PZ0 + PZ1) / 2 + .02, PX1 - PX0, .06, PZ1 - PZ0, tileB)
for k in range(14):
    z = PZ0 + .3 + k * .42; box((PX0 + PX1) / 2 + (k % 3 - 1) * .7, .001, z, PX1 - PX0 - 1.6, .006, .2, tileA)
box((PX0 + PX1) / 2, -.05, PZ1 + .15, PX1 - PX0, .075, .3, stone2); box((PX0 + PX1) / 2, -.06, PZ1 + 1.2, PX1 - PX0 + 4, .05, 1.8, asphalt)
for k in range(13): box(PX0 + 1 + k * 1.2, -.008, PZ1 + 1.2, .5, .004, .05, mat('mark', '#d8d2c0', .8))
wx, wz = .2, 4.7
cyl(wx, 0, wz, 1.15, .12, stone2, 48); cyl(wx, .115, wz, 1.04, .012, mat('water', '#0c2a38', .04, .2, '#1c86a4', .32), 48); cyl(wx, .1, wz, .34, .13, stone, 32)
for k in range(16): a = k / 16 * math.tau; cyl(wx + math.cos(a) * .95, .12, wz + math.sin(a) * .95, .018, .012, mat('wl', '#fff', .5, 0, '#8fe6ff', 18), 8)
for k in range(3):                                                                                                    # скульптура: три парящих латунных кольца
    r = .2 + .1 * k; bm = bmesh.new(); seg, sg = 40, 8
    vs = [[bm.verts.new(((r + .022 * math.cos(q / sg * math.tau)) * math.cos(i / seg * math.tau), (r + .022 * math.cos(q / sg * math.tau)) * math.sin(i / seg * math.tau), .022 * math.sin(q / sg * math.tau))) for q in range(sg)] for i in range(seg)]
    for i in range(seg):
        for q in range(sg): bm.faces.new((vs[i][q], vs[(i + 1) % seg][q], vs[(i + 1) % seg][(q + 1) % sg], vs[i][(q + 1) % sg]))
    me = bpy.data.meshes.new('ring'); bm.to_mesh(me); bm.free(); me.materials.append(bronze); me.uv_layers.new(name='UVMap')
    add(me, P(wx, .75 + .16 * k, wz), (1.0 + .5 * k, .5 * k, .9 * k))
light(wx, .8, wz, 3.2, '#ffc27a', .05); cyl(wx, .22, wz, .02, .55, bronze, 10)
for x, z, w in ((-2.6, 3.4, 1.6), (-2.6, 5.9, 1.6), (6.1, 3.2, 1.8), (6.1, 5.6, 1.8), (2.6, 6.3, 1.2)):
    box(x, 0, z, w, .16, .62, stone2); box(x, .15, z, w - .1, .02, .52, soil); box(x, .02, z + .33, w, .02, .02, warm)
    for k in range(int(w / .28)): bush(x - w / 2 + .2 + k * .28, .14, z, .13)
    tree(x, .16, z, .9); box(x, .1, z + .52, w * .8, .035, .2, mat('wood', '#6a4a30', .7))
for x in (-5.8, -1.0, 1.9, 4.8, 8.4):
    cyl(x, 0, 6.9, .03, 1.35, steel, 8); box(x, 1.33, 6.75, .06, .03, .36, steel); box(x, 1.315, 6.65, .05, .012, .14, warm2); light(x, 1.25, 6.6, 1.9, '#ffcf98', .05)
for k in range(6): palm(X1 + .65, FZ - .1 - k * .75, random.uniform(2.3, 2.9))
for k in range(3): palm(8.9, 3 + k * 1.5, random.uniform(1.9, 2.4))
# решётчатые мачты «песочные часы» с фиолетовыми кольцами (без логотипов)
for px, pz in ((-5.4, 5.6), (8.2, 6.4)):
    H, lv = 3.1, 9; pr_ = None
    for s in range(lv):
        y = s / (lv - 1) * H; t = abs(y - H / 2) / (H / 2); r = .12 + .25 * t * t; ring = [(px + math.cos(q / 4 * math.tau + .785 + (s % 2) * .4) * r, y, pz + math.sin(q / 4 * math.tau + .785 + (s % 2) * .4) * r) for q in range(4)]
        for q in range(4):
            rod(ring[q], ring[(q + 1) % 4], .009, steel, 4)
            if pr_: rod(pr_[q], ring[q], .012, steel, 4); rod(pr_[q], ring[(q + 1) % 4], .008, steel, 4)
        pr_ = ring
    for y in (.95, 1.5, 2.05): t = abs(y - H / 2) / (H / 2); r = .17 + .25 * t * t; cyl(px, y, pz, r, .05, violet2, 24)
    light(px, 1.5, pz + .5, 1.2, '#8f4dff')
def car(x, z, col, ry=0):
    m = mat('car' + col, col, .25, .5); c, s = math.cos(ry), math.sin(ry)
    f_ = lambda dx, dz: (x + dx * c - dz * s, z + dx * s + dz * c)
    box(*[f_(0, 0)[0], .05, f_(0, 0)[1]], .78, .12, .34, m, -ry); X, Z = f_(-.03, 0); box(X, .165, Z, .42, .1, .3, darkm, -ry)
    for dx in (-.26, .26):
        for dz in (-.16, .16): X, Z = f_(dx, dz); box(X, .0, Z, .13, .13, .05, darkm, -ry)
    for dz in (-.11, .11): X, Z = f_(.39, dz); box(X, .1, Z, .01, .03, .07, warm2, -ry); X, Z = f_(-.39, dz); box(X, .1, Z, .01, .03, .07, mat('tail', '#400', .5, 0, '#ff2030', 8), -ry)
car(1.9, 3.3, '#16161c'); car(4.9, 3.0, '#7a1420', .15); car(-1.2, 8.4, '#c8c2b4'); car(3.6, 8.9, '#1c2a4a', math.pi); car(7.5, 8.4, '#3a3a40')

for k in range(9):                                                                                                   # задняя стена: окна служебного входа
    x = X0 + .7 + k * 1.1; box(x, .25, -2.21, .7, .5, .04, mat('sidew')); box(x, .2, -2.23, .8, .03, .06, stone2)
# ---------- roofA: мост над короной и вертолётная площадка ----------
CUR = 'roofA'; OY = CROWN
box(0, 0, 0, W * 1.02, .3, D * 1.02, mat('roofd', '#23262d', .8, noise=3)); box(0, .28, 0, W * 1.03, .05, D * 1.03, steel)
for k in range(22):
    x = -W / 2 + k * W / 21
    for s in (-1, 1): box(x, .31, s * D * .515, .1, .03, .02, warm2)
for k in range(14):
    z = -D / 2 + k * D / 13
    for s in (-1, 1): box(s * W * .515, .31, z, .02, .03, .1, warm2)
hx, hz = -.55, .1
for k in range(8): a = k / 8 * math.tau; rod((hx + math.cos(a) * .7, .3, hz + math.sin(a) * .7), (hx + math.cos(a) * 1.2, .74, hz + math.sin(a) * 1.2), .03, steel)
cyl(hx, .72, hz, 1.42, .07, mat('pad', '#3c4148', .8, noise=4), 56); cyl(hx, .792, hz, 1.3, .004, mat('padl', '#e8e2d0', .8), 56); cyl(hx, .796, hz, 1.2, .004, mat('pad', '#3c4148', .8), 56)
for s in (-1, 1): box(hx + s * .32, .8, hz, .14, .006, .95, mat('padl'))
box(hx, .8, hz, .6, .006, .14, mat('padl'))
for k in range(20): a = k / 20 * math.tau; cyl(hx + math.cos(a) * 1.36, .79, hz + math.sin(a) * 1.36, .028, .03, mat('gl', '#fff', .5, 0, '#5cffb0', 14), 8)
box(1.45, .3, -.6, 1.2, .55, 1.3, mat('mech', '#3a3e46', .7, noise=3))
for k in range(7): box(1.45, .36 + k * .06, .06, 1.1, .02, .02, darkm)
for x, z, h in ((1.2, -.9, 2.6), (1.75, -.5, 1.7)): cyl(x, .85, z, .035, h, steel, 8, .01); cyl(x, .85 + h, z, .04, .06, mat('rb', '#f00', .5, 0, '#ff3030', 20), 8)
light(hx, 1.5, hz + 1.2, 4, '#cfe8ff'); light(1.4, 1.2, .5, 2, '#ffcf98')
# ---------- roofB: техника и зелень ----------
CUR = 'roofB'; OY = TOPB; bx, bz = 3.0, -.55
box(bx, 0, bz, 2.9, .05, 2.9, mat('roofd'))
for s in (-1, 1): box(bx + s * 1.43, 0, bz, .06, .24, 2.9, steel); box(bx, 0, bz + s * 1.43, 2.9, .24, .06, steel)
for k in range(3):
    box(bx - .8 + k * .8, .05, bz - .8, .6, .36, .7, mat('mech')); cyl(bx - .8 + k * .8, .41, bz - .8, .22, .08, steel, 20); cyl(bx - .8 + k * .8, .44, bz - .8, .18, .06, darkm, 20)
for k in range(8): bush(bx - 1.15 + k * .33, .05, bz + 1.15, .14)
box(bx + .3, .05, bz + .3, 1.2, .03, .9, mat('wood')); light(bx, .9, bz + .6, 2, '#ffcf98')
# ---------- roofC: терраса с бассейном ----------
CUR = 'roofC'; OY = TOPC; bx, bz = 5.65, .05
box(bx, 0, bz, 2.8, .06, 2.9, mat('wood2', '#5a3f2a', .7, noise=6))
for k in range(18): box(bx - 1.36 + k * .16, .06, bz, .01, .004, 2.86, darkm)
for s in (-1, 1): box(bx + s * 1.39, 0, bz, .03, .3, 2.9, glassd); box(bx, 0, bz + s * 1.44, 2.8, .3, .03, glassd); box(bx + s * 1.39, .29, bz, .05, .02, 2.9, warm); box(bx, .29, bz + s * 1.44, 2.8, .02, .05, warm)
box(bx - .35, .06, bz + .55, 1.6, .07, 1.15, stone); box(bx - .35, .125, bz + .55, 1.45, .012, 1.0, mat('pool', '#0a3a4a', .05, 0, '#1fb4cc', 1.0))
for k in range(4):
    z = bz - .1 + k * .42; box(bx + .85, .06, z, .55, .07, .2, white); box(bx + 1.08, .1, z, .14, .12, .2, white)
for x, z in ((.85, .12), (.85, .96)): cyl(bx + x, .06, bz + z, .012, .55, bronze, 8); cyl(bx + x, .55, bz + z, .36, .12, mat('umb', '#d8b48a', .9), 10, .02)
box(bx - .1, .06, bz - .95, 1.7, .34, .34, mat('bar', '#3a2018', .5)); box(bx - .1, .4, bz - .95, 1.8, .03, .42, bronze); box(bx - .1, .1, bz - .77, 1.6, .02, .015, gold); box(bx - .1, .06, bz - 1.3, 1.8, .8, .06, mat('barw', '#2a1a1a', .6))
for k in range(3): box(bx - .1, .3 + k * .18, bz - 1.25, 1.5, .015, .06, gold)
box(bx - .1, .86, bz - 1.05, 2.0, .04, .7, mat('mech'))
for s in (-1, 1): box(bx - .1 + s * .9, .06, bz - .75, .04, .82, .04, bronze)
for k in range(5): cyl(bx - .8 + k * .36, .06, bz - .62, .05, .2, bronze, 10)
for x, z in ((-1.2, -.3), (-1.2, 1.2), (1.2, -1.2), (1.2, 1.25)): box(bx + x, .06, bz + z, .22, .16, .22, stone2); palm(bx + x, bz + z, .55, .2)
for a, b in (((-1.3, 1.35), (1.3, 1.35)), ((-1.3, -.5), (1.3, -.5)), ((1.3, -.5), (1.3, 1.35))):
    for k in range(13): t = k / 12; cyl(bx + a[0] + (b[0] - a[0]) * t, .95 - .16 * math.sin(math.pi * t), bz + a[1] + (b[1] - a[1]) * t, .014, .028, warm2, 6)
light(bx, 1.0, bz, 2.4, '#ffcf98'); light(bx - .35, .5, bz + .55, 1.6, '#35d6e8'); light(bx - .1, .75, bz - .8, 2, '#ffb868')
# ---------- sign: объёмные буквы ----------
CUR = 'sign'; OY = 0.
cu = bpy.data.curves.new('t', 'FONT'); cu.body = 'The Mile High Club'; cu.size = .46; cu.extrude = .028; cu.align_x = 'LEFT'; cu.align_y = 'CENTER'; cu.resolution_u = 4
try: cu.font = bpy.data.fonts.load(r'C:\Windows\Fonts\georgia.ttf')
except Exception: pass
cu.materials.append(mat('sign', '#fff')); o = bpy.data.objects.new('t', cu); sc.collection.objects.link(o); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (-1.05, 0, 0); PART.setdefault('sign', []).append(o)

# ---------- макет башни: закрывает свет и отражает светодиоды ----------
proxy = []
def prox(x, y, z, sx, sy, sz, m):
    global CUR; c = CUR; CUR = '_'; o = box(x, y, z, sx, sy, sz, m); CUR = c; proxy.append(o)
OY = 0.
tower = mat('tw', '#10151f', .12, .7)
prox(0, POD, 0, W, TOPY - POD, D, tower); prox(3.0, POD, -.55, 2.9, TOPB - POD, 2.9, tower); prox(5.65, POD, .05, 2.8, TOPC - POD, 2.9, tower)
prox(-1.2, TOPY, 0, 2, CROWN - TOPY, D, tower); prox(1.1, TOPY, 0, 1.8, CROWN - TOPY, D, tower)
prox(-5 + 14, 0, -1, 3.4, 14 * FH, 3.4, tower)
for x, z, t in ((-W / 2, D / 2, TOPY), (W / 2, D / 2, TOPY), (4.25, 1.5, TOPC), (7.05, 1.5, TOPC), (7.05, -1.4, TOPC), (-W / 2, -D / 2, TOPY)): prox(x, POD, z, .07, t - POD, .07, violet)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#4c4a72'), 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
L = bpy.data.lights.new('moon', 'SUN'); L.energy = .8; L.color = lin('#aab8ff'); L.angle = .03; o = bpy.data.objects.new('moon', L); sc.collection.objects.link(o); o.rotation_euler = (math.radians(50), 0, math.radians(-35))

if PREVIEW:
    cam = bpy.data.cameras.new('c'); cam.lens = 34; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    cy.use_denoising = True; cy.samples = 64; sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    for n, loc, tg in (('plaza', (7, 3.4, 13), (1.6, 1.0, 2)), ('roofs', (9.5, 18.6, 9), (5.2, 15.2, 0)), ('crown', (6, 27, 10), (0, 22.4, 0))):
        co.location = P(*loc); d = Vector(P(*tg)) - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); sc.render.filepath = os.path.join(TMP, f'pv-{n}.png'); bpy.ops.render.render(write_still=True)
    print('PREVIEW DONE'); raise SystemExit(0)

# ---------- запекание ----------
SIZE = {'base': RES, 'roofA': RES // 2, 'roofB': RES // 4, 'roofC': RES // 2}; dg = bpy.context.evaluated_depsgraph_get(); BASEY = {'roofA': CROWN, 'roofB': TOPB, 'roofC': TOPC}
res = []
for part, lst in list(PART.items()):
    if part == '_': continue
    mats, bm = [], bmesh.new()
    for o in lst:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world); m = o.material_slots[0].material
        if m not in mats: mats.append(m)
        k = len(bm.faces); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        for f in bm.faces[k:]: f.material_index = mats.index(m)
    if part != 'sign':
        bm.normal_update()
        dead = [f for f in bm.faces if f.normal.z < -.95 and len(f.verts) == 4 and f.calc_center_median().z < BASEY.get(part, 0) + .02]
        bmesh.ops.delete(bm, geom=list(set(dead)), context='FACES')
    out = bpy.data.meshes.new(part); bm.to_mesh(out); bm.free()
    for m in mats: out.materials.append(m)
    ob = bpy.data.objects.new(part, out); sc.collection.objects.link(ob); res.append((part, ob))
    for o in lst: bpy.data.objects.remove(o)
for part, ob in res:
    if part == 'sign': continue
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    uv = ob.data.uv_layers.new(name='bake'); ob.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=.0008, area_weight=0.); bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('b' + part, SIZE[part], SIZE[part], float_buffer=True, alpha=False)
    for m in ob.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; m.node_tree.nodes.active = n; n.select = True
    sc.render.bake.margin = 4; print('BAKE', part, len(ob.data.polygons), flush=True); bpy.ops.object.bake(type='COMBINED')
    p = os.path.join(TMP, f'kit-{part}.png'); img.save_render(p, scene=sc)
    for l in [l for l in ob.data.uv_layers if l.name != 'bake']: ob.data.uv_layers.remove(l)
    m = bpy.data.materials.new('b_' + part); m.use_nodes = True; t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); m.node_tree.links.new(t.outputs[0], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    ob.data.materials.clear(); ob.data.materials.append(m); ob.data.polygons.foreach_set('material_index', [0] * len(ob.data.polygons))
from mathutils import Matrix
for part, ob in res: ob.data.transform(Matrix.Translation((0, 0, -BASEY.get(part, 0)))); ob.name = part
keep = {ob for _, ob in res}
for o in list(sc.objects):
    if o not in keep: bpy.data.objects.remove(o)
p = os.path.join(OUT, 'hotel.glb'); bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', export_apply=True, export_yup=True, export_normals=False, export_cameras=False, export_lights=False, export_image_format='WEBP', export_image_quality=80)
print('KIT DONE', round(os.path.getsize(p) / 1e6, 2), 'MB', sum(len(o.data.polygons) for o in keep))
