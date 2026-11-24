# Сцена «Mile High Club в Вайс-Сити» для первого экрана в теме «Горячие туры».
# Отель ар-деко на набережной в духе Ocean Drive: пастельная штукатурка, «брови» над окнами, неоновый
# вертикальный пилон MILE HIGH, соседние отели, улица с фонарями, пальмы, закатное ретро-солнце.
# Всё строится кодом — никаких чужих моделей и текстур.
#
#   blender -b -P brand/vice/vice_scene.py -- <day|night> <out_dir> [scale]
#   blender -b -P brand/vice/vice_scene.py -- model public/img/vice   — только главный отель с площадкой → hotel.glb (витрина «Номеров»)
#
# Рендерит четыре прохода: full (кадр), far (без среднего и ближнего планов), mn (альфа среднего+ближнего),
# n (альфа ближнего). build_vice.py собирает из них img/vice/<day|night>.webp, -far.webp и -mask.webp.
import bpy, bmesh, math, random, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
VAR = argv[0] if argv else 'night'
OUT = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), 'out')
SCALE = float(argv[2]) if len(argv) > 2 else 1.0
MODEL = VAR == 'model'
NIGHT = VAR in ('night', 'model')  # в модели неон и окна с эмиссией, яркость дня/ночи регулирует сайт
os.makedirs(OUT, exist_ok=True)
random.seed(306)

# ---------- сцена ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = eng; break
    except Exception: pass
sc.render.resolution_x = int(2880 * SCALE); sc.render.resolution_y = int(1608 * SCALE); sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
except Exception:
    try: sc.view_settings.view_transform = 'Filmic'
    except Exception: pass
ee = sc.eevee
for k, v in (('taa_render_samples', 48), ('use_raytracing', True), ('use_shadows', True), ('use_gtao', True), ('shadow_resolution_scale', 1.0)):
    try: setattr(ee, k, v)
    except Exception: pass

COLS = {}
def coll(name):
    c = bpy.data.collections.new(name); sc.collection.children.link(c); COLS[name] = c; return c
FAR, MID, NEAR = coll('FAR'), coll('MID'), coll('NEAR')

# ---------- материалы ----------
MATS = {}
def mat(name, color, rough=.6, metal=0., emit=None, estr=0., alpha=1.):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    b = m.node_tree.nodes.get('Principled BSDF')
    def S(k, v):
        if k in b.inputs: b.inputs[k].default_value = v
    S('Base Color', (*color, 1)); S('Roughness', rough); S('Metallic', metal)
    if emit: S('Emission Color', (*emit, 1)); S('Emission Strength', estr)
    MATS[name] = m; return m
def hexc(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + .055) / 1.055) ** 2.4 if x > .04045 else x / 12.92 for x in c)

NEON_K = 14 if NIGHT else 2.2
PINK, CYAN, VIOLET, AMBER = hexc('#ff2d95'), hexc('#3ef2e0'), hexc('#b65cff'), hexc('#ffb65c')
M = {
    'stucco_pink': mat('stucco_pink', hexc('#f4b6c8'), .85),
    'stucco_mint': mat('stucco_mint', hexc('#a8e6d4'), .85),
    'stucco_lav': mat('stucco_lav', hexc('#cdb8f0'), .85),
    'stucco_cream': mat('stucco_cream', hexc('#f6e7cf'), .85),
    'stucco_peach': mat('stucco_peach', hexc('#ffc9a3'), .85),
    'trim': mat('trim', hexc('#fbf6ee'), .7),
    'glass': mat('glass', hexc('#1b3a4a'), .06, .4),
    'glass_lit': mat('glass_lit', hexc('#3a2a20'), .2, 0, hexc('#ffc58a'), 3.2 if NIGHT else .0),
    'glass_pink': mat('glass_pink', hexc('#1a2a3a'), .2, 0, hexc('#7fe8ff'), 2.2 if NIGHT else .0),
    'glass_rose': mat('glass_rose', hexc('#2a1a2a'), .2, 0, hexc('#ff9ad0'), 2.0 if NIGHT else .0),
    'store': mat('store', hexc('#2a1a22'), .25, 0, hexc('#ffb48a'), 1.1 if NIGHT else 0),
    'neon_pink': mat('neon_pink', PINK, .4, 0, PINK, NEON_K),
    'neon_cyan': mat('neon_cyan', CYAN, .4, 0, CYAN, NEON_K),
    'neon_violet': mat('neon_violet', VIOLET, .4, 0, VIOLET, NEON_K),
    'lamp': mat('lamp', hexc('#fff1d6'), .3, 0, hexc('#ffd59a'), 9 if NIGHT else .5),
    'asphalt': mat('asphalt', hexc('#2a2530'), .32 if NIGHT else .55, .1),
    'walk': mat('walk', hexc('#d9c7b8'), .7),
    'sand': mat('sand', hexc('#e9cfa7'), .95),
    'metal': mat('metal', hexc('#2b2730'), .35, .8),
    'trunk': mat('trunk', hexc('#5b4636') if not NIGHT else hexc('#1d1420'), .9),
    'frond': mat('frond', hexc('#2f6b4a') if not NIGHT else hexc('#0f1a1c'), .7),
    'far': mat('far', hexc('#f2a28f') if not NIGHT else hexc('#2a1440'), .9, 0, hexc('#ffb38a') if not NIGHT else hexc('#3a1858'), .25),
    'far_win': mat('far_win', hexc('#ffd2a8'), .5, 0, hexc('#ffc58a'), 1.6 if NIGHT else 0),
    'chrome': mat('chrome', hexc('#e8e6ee'), .15, 1),
    'car': mat('car', hexc('#ff5fa2'), .25, .3),
    'water': mat('water', hexc('#1fb3b3') if not NIGHT else hexc('#0b3a4a'), .05, .2, hexc('#3ef2e0'), .6 if NIGHT else .1),
}

# ---------- примитивы ----------
def _mesh_box():
    me = bpy.data.meshes.new('box'); bm = bmesh.new(); bm.loops.layers.uv.new(); bmesh.ops.create_cube(bm, size=1, calc_uvs=True); bm.to_mesh(me); bm.free(); me.materials.append(None); return me
def _mesh_cyl(seg=32):
    me = bpy.data.meshes.new('cyl'); bm = bmesh.new(); bm.loops.layers.uv.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=1, radius2=1, depth=1, calc_uvs=True); bm.to_mesh(me); bm.free(); me.materials.append(None)
    for p in me.polygons: p.use_smooth = True
    return me
BOX, CYL = _mesh_box(), _mesh_cyl()
def put(me, loc, size, m, col, rot=(0, 0, 0)):
    o = bpy.data.objects.new('o', me); col.objects.link(o)
    o.location = loc; o.scale = size; o.rotation_euler = rot
    o.material_slots[0].link = 'OBJECT'; o.material_slots[0].material = m; return o
def box(c, s, m, col=MID, rot=(0, 0, 0)):
    return put(BOX, c, s, m, col, rot)  # c — центр, s — размеры
def cyl(c, r, h, m, col=MID, rot=(0, 0, 0)):
    return put(CYL, c, (r, r, h), m, col, rot)
def text(body, loc, size, m, col=MID, rot=(math.pi / 2, 0, 0), extrude=.08, align='CENTER'):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = align; cu.align_y = 'CENTER'
    o = bpy.data.objects.new('txt', cu); col.objects.link(o); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m); return o

# ---------- отель ар-деко ----------
# фасад смотрит на камеру (−Y), здание стоит от y=0 вглубь
def deco_hotel(x0, w, floors, body, accent, neon, col=MID, tower=None, round_left=False, sign=None, portholes=False):
    fh = 3.2; h = floors * fh + 1.2; d = 11
    box((x0 + w / 2, d / 2, h / 2), (w, d, h), body, col)
    if round_left:  # скруглённый угол — визитная карточка Майами ар-деко
        r = 2.6
        cyl((x0, r, h / 2), r, h, body, col)
    # первый этаж: витрины, колонны, козырёк
    box((x0 + w / 2, -.15, 1.9), (w - .4, .2, 3.4), M['store'] if NIGHT else M['glass'], col)
    for k in range(int(w // 3) + 1):
        box((x0 + .3 + k * (w - .6) / max(1, int(w // 3)), -.3, 1.9), (.45, .5, 3.6), M['trim'], col)
    # этажи: ленточные окна, над каждым — «бровь»-козырёк, по кромке неон
    for f in range(1, floors):
        y = f * fh + .9
        if portholes:
            for k in range(int(w // 2.2)):
                cyl((x0 + 1.4 + k * 2.2, -.05, y + .9), .55, .2, random.choice([M['glass'], M['glass_lit'], M['glass_lit']]) if NIGHT else M['glass'], col, rot=(math.pi / 2, 0, 0))
        else:
            n = max(2, int(w // 2.6))
            for k in range(n):
                ww = (w - 1.2) / n
                lit = random.random() < (.38 if NIGHT else 0)
                box((x0 + .6 + ww * (k + .5), -.05, y + .9), (ww - .45, .2, 1.7), random.choice([M['glass_lit'], M['glass_lit'], M['glass_pink'], M['glass_rose']]) if lit else M['glass'], col)
        box((x0 + w / 2, -.55, y + 2.05), (w + .3, 1.1, .18), M['trim'], col)                       # бровь
        box((x0 + w / 2, -1.08, y + 2.0), (w + .3, .06, .06), M[neon] if f == floors - 1 else M['trim'], col)
    # парапет ступенями и неоновая кромка крыши
    box((x0 + w / 2, -.2, h + .45), (w + .2, .6, .9), M['trim'], col)
    box((x0 + w / 2, -.52, h + .92), (w + .2, .07, .07), M[neon], col)
    for k, s in enumerate((.6, .35)):
        box((x0 + w / 2, 1.2, h + .9 + (k + 1) * .9), (w * s, 2.4, .9), accent, col)
        box((x0 + w / 2, -.02, h + .9 + (k + 1) * .9 + .47), (w * s, .06, .06), M[neon], col)
    # вертикальные пилястры с акцентным цветом
    for k in (0, 1):
        box((x0 + (.35 if k == 0 else w - .35), -.35, h / 2 + .5), (.5, .6, h + .8), accent, col)
    if sign:
        box((x0 + w / 2, -2.1, 4.0), (w * .7, 3.2, .25), M['trim'], col)                             # козырёк входа
        box((x0 + w / 2, -3.72, 4.0), (w * .7, .06, .06), M[neon], col)
        text(sign, (x0 + w / 2, -3.75, 4.75), .78, M[neon], col, extrude=.06)
    return h

# главный отель: центральная башня со ступенчатой короной и неоновым пилоном
def main_hotel(x0=-3.0, w=19.0):
    col = MID
    h = deco_hotel(x0, w, 5, M['stucco_cream'], M['stucco_mint'], 'neon_cyan', col, round_left=True, sign='MILE HIGH CLUB')
    cx = x0 + w * .62
    tw, th = 6.2, h + 9
    box((cx, 2.8, th / 2), (tw, 6, th), M['stucco_pink'], col)  # чуть вперёд: совпавшие плоскости рябят
    for k, (s, dz) in enumerate(((1.0, 0), (.78, 1.6), (.56, 3.0), (.34, 4.2))):   # ступени короны
        z = th + dz
        box((cx, 3.0, z + .75), (tw * s, 6 * s, 1.5), M['stucco_cream'] if k % 2 == 0 else M['stucco_mint'], col)
        box((cx, 3.0 - 3 * s - .03, z + 1.5), (tw * s, .07, .07), M['neon_pink'], col)
    cyl((cx, 3.0, th + 8.2), .12, 4.5, M['chrome'], col)                                     # шпиль
    cyl((cx, 3.0, th + 10.5), .22, .22, M['neon_pink'], col)
    # окна башни: вертикальные ленты
    for k in (-1, 0, 1):
        for f in range(int(h // 3.2), int(th // 3.2)):
            box((cx + k * 1.7, -.22, f * 3.2 + 1.6), (1.1, .1, 2.2), M['glass_lit'] if (NIGHT and random.random() < .6) else M['glass'], col)
    # вертикальный неоновый пилон MILE HIGH: белая лопатка, буквы по одной сверху вниз
    fx, fz0 = cx, th - 1.2
    box((fx, -1.2, fz0 - 7.5), (1.7, 2.4, 15.5), M['trim'], col)
    box((fx, -2.42, fz0 - 7.5), (.08, .06, 15.5), M['neon_pink'], col).location.x = fx - .86
    box((fx + .86, -2.42, fz0 - 7.5), (.08, .06, 15.5), M['neon_pink'], col)
    for i, ch in enumerate('MILE HIGH'):
        if ch == ' ': continue
        text(ch, (fx, -2.45, fz0 - .6 - i * 1.62), 1.35, M['neon_pink'], col, extrude=.05)
    # бассейн на крыше крыла слева и полосатые зонтики не нужны в кадре — вместо них неоновые «волны» на фасаде
    return h

# ---------- окружение ----------
def ground():
    box((0, 30, -.5), (400, 400, 1), M['asphalt'], FAR)
    box((0, -1.3, .07), (200, 2.6, .14), M['walk'], FAR)        # тротуар у отелей
    box((0, -15.5, .07), (200, 7, .14), M['walk'], FAR)         # набережная у камеры
    box((0, -26, .02), (200, 14, .04), M['sand'], FAR)
    for k in range(-40, 41):                                     # разметка
        box((k * 5, -8.6, .01), (2.4, .18, .02), M['trim'], FAR)

def far_city():
    random.seed(7)
    for k in range(26):
        x = -120 + k * 10 + random.uniform(-3, 3); w = random.uniform(5, 9); h = random.uniform(10, 34)
        y = random.uniform(45, 80)
        box((x, y, h / 2), (w, 6, h), M['far'], FAR)
        if NIGHT:
            for r in range(3, int(h), 3):
                if random.random() < .5: box((x + random.uniform(-w / 3, w / 3), y - 3.05, r), (1.2, .1, .8), M['far_win'], FAR)

def retro_sun():
    if NIGHT: return
    # закатное солнце в полоску позади отелей
    sun = bpy.data.materials.new('sun')
    try: sun.use_nodes = True
    except Exception: pass
    nt = sun.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    wave = nt.nodes.new('ShaderNodeTexWave'); mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; tr = nt.nodes.new('ShaderNodeBsdfTransparent'); ms = nt.nodes.new('ShaderNodeMixShader')
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (*hexc('#ff2d95'), 1); ramp.color_ramp.elements[1].color = (*hexc('#ffd27a'), 1)
    nt.links.new(ramp.outputs[0], em.inputs['Color']); em.inputs['Strength'].default_value = .85
    wave.wave_type = 'BANDS'; wave.bands_direction = 'Y'; wave.inputs['Scale'].default_value = 5.0; wave.inputs['Distortion'].default_value = 0
    nt.links.new(tc.outputs['Generated'], wave.inputs['Vector'])
    # полосы только в нижней половине диска
    nt.links.new(wave.outputs['Fac'], gt.inputs[0]); gt.inputs[1].default_value = 2.0  # без полос: спокойный мягкий диск
    m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'LESS_THAN'; nt.links.new(sep.outputs['Y'], m2.inputs[0]); m2.inputs[1].default_value = .55
    m3 = nt.nodes.new('ShaderNodeMath'); m3.operation = 'MULTIPLY'; nt.links.new(gt.outputs[0], m3.inputs[0]); nt.links.new(m2.outputs[0], m3.inputs[1])
    m4 = nt.nodes.new('ShaderNodeMath'); m4.operation = 'SUBTRACT'; m4.inputs[0].default_value = 1; nt.links.new(m3.outputs[0], m4.inputs[1])
    nt.links.new(m4.outputs[0], ms.inputs['Fac']); nt.links.new(tr.outputs[0], ms.inputs[1]); nt.links.new(em.outputs[0], ms.inputs[2]); nt.links.new(ms.outputs[0], out.inputs['Surface'])
    try: sun.blend_method = 'BLEND'
    except Exception: pass
    me = bpy.data.meshes.new('sun'); bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=1); bm.to_mesh(me); bm.free(); me.materials.append(sun)
    o = bpy.data.objects.new('sun', me); FAR.objects.link(o); o.location = (-95, 260, 92); o.scale = (24, 24, 24); o.rotation_euler = (math.pi / 2, 0, 0)

def lamp(x, y, col=MID):
    cyl((x, y, 2.6), .07, 5.2, M['metal'], col)
    box((x, y - .35, 5.15), (.08, .8, .08), M['metal'], col)
    o = cyl((x, y - .75, 5.0), .22, .26, M['lamp'], col)
    if NIGHT:
        L = bpy.data.lights.new('l', 'POINT'); L.use_shadow = False; L.energy = 380; L.color = hexc('#ffc890'); L.shadow_soft_size = .3
        lo = bpy.data.objects.new('l', L); col.objects.link(lo); lo.location = (x, y - .75, 4.7)

def frond_mesh(L=3.6, wmax=.55, droop=.55, seg=14):
    me = bpy.data.meshes.new('frond'); bm = bmesh.new(); vs = []
    for i in range(seg + 1):
        t = i / seg; x = t * L; z = -droop * (t ** 2) * L * .5; w = wmax * math.sin(math.pi * min(1, t * 1.08)) * (1.0 if i % 2 == 0 else .55)
        vs.append((bm.verts.new((x, -w, z - .05 * w)), bm.verts.new((x, 0, z + .04)), bm.verts.new((x, w, z - .05 * w))))
    for i in range(seg):
        a, b = vs[i], vs[i + 1]
        bm.faces.new((a[0], b[0], b[1], a[1])); bm.faces.new((a[1], b[1], b[2], a[2]))
    bm.to_mesh(me); bm.free(); me.materials.append(None); return me
FROND = frond_mesh()

def palm(x, y, h, col, lean=0., rot=0., fs=1.):
    # ствол — изогнутая труба из колец, крона — 11 перистых листьев
    n = 14; top = Vector((x, y, 0))
    for i in range(n):
        t = i / n; t2 = (i + 1) / n
        p1 = Vector((x + lean * h * t * t, y, h * t)); p2 = Vector((x + lean * h * t2 * t2, y, h * t2))
        mid = (p1 + p2) / 2; d = p2 - p1; r = .32 - .14 * t
        o = put(CYL, mid, (r, r, d.length * 1.02), M['trunk'], col)
        o.rotation_euler = (0, math.atan2(d.x, d.z), 0)
        top = p2
    for k in range(11):
        a = rot + k / 11 * math.tau + random.uniform(-.15, .15)
        o = put(FROND, top, ((1 + random.uniform(-.1, .2)) * fs,) * 3, M['frond'], col)
        o.rotation_euler = (random.uniform(-.1, .1), -random.uniform(.05, .45), a)
    cyl(top + Vector((0, 0, -.1)), .38 * fs, .5 * fs, M['trunk'], col)

def car(x, y):
    # кабриолет у входа: простые объёмы, хромированные диски
    box((x, y, .75), (4.6, 1.9, .7), M['car'], MID); box((x - .3, y, 1.25), (2.2, 1.8, .35), M['car'], MID)
    box((x + .55, y, 1.55), (.08, 1.7, .5), M['glass'], MID, rot=(0, -.5, 0))
    for dx in (-1.5, 1.5):
        for dy in (-.95, .95): cyl((x + dx, y + dy, .42), .42, .3, M['metal'], MID, rot=(math.pi / 2, 0, 0)); cyl((x + dx, y + dy * 1.02, .42), .24, .32, M['chrome'], MID, rot=(math.pi / 2, 0, 0))
    if NIGHT: box((x - 2.32, y, .8), (.05, 1.6, .06), M['neon_pink'], MID)


# ---------- модель для сайта: главный отель на площадке ----------
def tex_image(name, size, fn):
    import numpy as np
    img = bpy.data.images.new(name, size, size, alpha=False)
    px = np.clip(fn(np, size), 0, 1); px = np.where(px <= .0031308, px * 12.92, 1.055 * px ** (1 / 2.4) - .055).astype('float32')  # картинка хранится в sRGB
    a = np.ones((size, size, 1), 'float32')
    img.pixels.foreach_set(np.concatenate([px, a], axis=2).ravel()); img.file_format = 'PNG'; img.pack(); return img
def stucco(col):
    def f(np, n):
        rng = np.random.default_rng(len(col) * 7 + int(col[0] * 100))
        big = np.kron(rng.random((16, 16)), np.ones((n // 16, n // 16))); fine = rng.random((n, n))
        k = (.93 + .05 * big + .04 * fine)[..., None]
        return np.clip(np.array(col)[None, None, :] * k, 0, 1)
    return f
def glass_tex(np, n):
    y = np.linspace(0, 1, n)[:, None, None]
    top, bot = np.array(hexc('#7fd3e0')), np.array(hexc('#1b3a4a'))
    c = bot + (top - bot) * y ** 1.6
    x = np.linspace(0, 1, n)[None, :, None]; c = c + .18 * np.exp(-((x - y * .6 - .2) ** 2) / .004)  # блик по диагонали
    c[:4], c[-4:], c[:, :4], c[:, -4:] = .9, .9, .9, .9                                              # белая рама
    return np.clip(c * np.ones((n, n, 3)), 0, 1)
def use_tex(m, img):
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF'); t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
def build_model():
    from mathutils import Matrix
    for k, h in (('stucco_pink', '#f4b6c8'), ('stucco_mint', '#a8e6d4'), ('stucco_cream', '#f6e7cf'), ('stucco_lav', '#cdb8f0'), ('stucco_peach', '#ffc9a3'), ('trim', '#fbf6ee')):
        use_tex(M[k], tex_image(k, 256, stucco(hexc(h))))
    use_tex(M['glass'], tex_image('glass', 128, glass_tex))
    # та же улица, что на картинке первого экрана: пять отелей, дорога, набережная, пляж, фонари, пальмы, машина, город позади
    random.seed(306)
    box((0, 30, -.5), (220, 220, 1), M['asphalt'], FAR)
    box((0, -1.3, .07), (120, 2.6, .14), M['walk'], FAR)
    box((0, -15.5, .07), (120, 7, .14), M['walk'], FAR)
    box((0, -30, .02), (160, 22, .04), M['sand'], FAR)
    for k in range(-22, 23): box((k * 5, -8.6, .01), (2.4, .18, .02), M['trim'], FAR)
    far_city()
    deco_hotel(-27, 10, 3, M['stucco_mint'], M['stucco_lav'], 'neon_pink', MID, portholes=True)
    deco_hotel(-15.5, 11, 4, M['stucco_lav'], M['stucco_peach'], 'neon_violet', MID, sign='PALMS')
    main_hotel(-3.0, 19.0)
    deco_hotel(17.5, 11, 4, M['stucco_peach'], M['stucco_mint'], 'neon_cyan', MID, sign='SUNSET')
    deco_hotel(30, 10, 3, M['stucco_cream'], M['stucco_pink'], 'neon_pink', MID, portholes=True)
    for x in range(-34, 46, 8): lamp(x + 2.5, -2.4)
    for x in range(-30, 44, 9): palm(x, -3.0, random.uniform(7.5, 10.5), MID, lean=random.uniform(-.08, .08), rot=random.uniform(0, 6), fs=1.35)
    car(4.5, -6.2)
    box((0, -12.4, .55), (120, .45, 1.1), M['trim'], NEAR)
    box((0, -12.15, 1.13), (120, .06, .06), M['neon_cyan'], NEAR)
    for x in (-31, -20, 24, 38): palm(x, -16.5, random.uniform(10, 13), NEAR, lean=random.uniform(-.1, .1), rot=random.uniform(0, 6), fs=1.6)
    # слить всё по материалам: два десятка сеток вместо сотен объектов — быстро грузится и рисуется
    dg = bpy.context.evaluated_depsgraph_get(); groups = {}; shift = Matrix.Translation((-5.5, -1.0, 0))
    for o in list(sc.objects):
        if o.type not in ('MESH', 'FONT') or not o.material_slots: continue
        m = o.material_slots[0].material
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(shift @ o.matrix_world)
        groups.setdefault(m.name, []).append(me)
    for o in list(sc.objects): bpy.data.objects.remove(o)
    for name, meshes in groups.items():
        bm = bmesh.new()
        for me in meshes: bm.from_mesh(me)
        out = bpy.data.meshes.new(name); bm.to_mesh(out); bm.free(); out.materials.clear(); out.materials.append(bpy.data.materials[name])
        for pl in out.polygons: pl.material_index = 0
        sc.collection.objects.link(bpy.data.objects.new(name, out))
    path = os.path.join(OUT, 'hotel.glb'); kw = dict(filepath=path, export_format='GLB', export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(**kw, export_image_format='WEBP')
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    print('VICE MODEL', path, round(os.path.getsize(path) / 1e6, 2), 'MB', len(groups), 'meshes')

if MODEL:
    build_model(); raise SystemExit(0)

# ---------- сборка кадра ----------
ground(); far_city(); retro_sun()
deco_hotel(-27, 10, 3, M['stucco_mint'], M['stucco_lav'], 'neon_pink', MID, portholes=True)
deco_hotel(-15.5, 11, 4, M['stucco_lav'], M['stucco_peach'], 'neon_violet', MID, sign='PALMS')
main_hotel(-3.0, 19.0)
deco_hotel(17.5, 11, 4, M['stucco_peach'], M['stucco_mint'], 'neon_cyan', MID, sign='SUNSET')
deco_hotel(30, 10, 3, M['stucco_cream'], M['stucco_pink'], 'neon_pink', MID, portholes=True)
for x in range(-34, 46, 8): lamp(x + 2.5, -2.4)
for x in range(-30, 44, 9): palm(x, -3.0, random.uniform(7.5, 10.5), MID, lean=random.uniform(-.08, .08), rot=random.uniform(0, 6), fs=1.35)
car(4.5, -6.2)
# ближний план: парапет набережной и две большие пальмы по краям кадра
box((0, -12.4, .55), (200, .45, 1.1), M['trim'], NEAR)
box((0, -12.15, 1.13), (200, .06, .06), M['neon_cyan'] if NIGHT else M['trim'], NEAR)
palm(-17.5, -16.5, 15.5, NEAR, lean=.14, rot=.4, fs=1.9)
palm(27.0, -17.5, 17.0, NEAR, lean=-.12, rot=1.3, fs=2.0)

# ---------- небо и свет ----------
w = bpy.data.worlds.new('w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
nt = w.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
cr = ramp.color_ramp
stops = ([(0, '#ffb067'), (.08, '#ff7f73'), (.2, '#f0559a'), (.4, '#9a46c4'), (.75, '#3b2a8a')] if not NIGHT else
         [(0, '#ff4f9e'), (.07, '#d23a8c'), (.18, '#6a2088'), (.36, '#25104e'), (.75, '#0a0724')])
cr.elements[0].position, cr.elements[0].color = stops[0][0], (*hexc(stops[0][1]), 1)
cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*hexc(stops[-1][1]), 1)
for p, c in stops[1:-1]:
    e = cr.elements.new(p); e.color = (*hexc(c), 1)
bg.inputs['Strength'].default_value = 1.0 if not NIGHT else .55

def light(kind, loc, rot, energy, color, size=1.):
    L = bpy.data.lights.new(kind, kind); L.energy = energy; L.color = color
    if kind == 'AREA': L.size = size
    if kind == 'SUN':
        try: L.angle = .05
        except Exception: pass
    o = bpy.data.objects.new(kind, L); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot; return o
if NIGHT:
    light('SUN', (0, 0, 30), (math.radians(60), 0, math.radians(200)), .35, hexc('#8f7cff'))
    light('AREA', (6, -30, 6), (math.radians(82), 0, 0), 2400, hexc('#d8d0ff'), 40)
    light('AREA', (-20, -24, 4), (math.radians(80), 0, math.radians(-30)), 900, hexc('#3ef2e0'), 20)
    light('AREA', (30, -24, 4), (math.radians(80), 0, math.radians(30)), 900, hexc('#ff4fa8'), 20)
else:
    light('SUN', (0, 0, 30), (math.radians(78), 0, math.radians(165)), 3.4, hexc('#ffc79a'))
    light('AREA', (0, -30, 6), (math.radians(85), 0, 0), 1800, hexc('#ff9ac2'), 40)

# ---------- камера ----------
cam = bpy.data.cameras.new('cam'); cam.lens = 27; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (-2.0, -50.0, 2.2)
tgt = Vector((5.5, 0, 12.5)); d = tgt - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# ---------- проходы ----------
def render(name, show, transparent):
    for n, c in COLS.items(): c.hide_render = n not in show
    sc.render.film_transparent = transparent
    sc.render.filepath = os.path.join(OUT, f'{VAR}-{name}.png')
    bpy.ops.render.render(write_still=True)
render('full', ('FAR', 'MID', 'NEAR'), False)
render('far', ('FAR',), False)
ee.taa_render_samples = 8
render('mn', ('MID', 'NEAR'), True)
render('n', ('NEAR',), True)
print('VICE DONE', VAR, OUT)
