# Запекание света ночной улицы (Cycles) и экспорт лёгкой сцены для сайта. Вызывается из vice_scene.py в режиме bake:
#   blender -b -P brand/vice/vice_scene.py -- bake public/img/vice [сэмплы] [размер]
# Свет, тени, отсветы неона и отражения — в текстурах; на сайте сцена рисуется без единого источника света.
import bpy, bmesh, os, math
SPP = int(float(argv[2])) if len(argv) > 2 else 256
RES = int(argv[3]) if len(argv) > 3 else 4096
TMP = os.path.join(HERE, 'out'); os.makedirs(TMP, exist_ok=True)

sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.samples = SPP; cy.use_denoising = False
cy.max_bounces = 5; cy.sample_clamp_indirect = 4; cy.sample_clamp_direct = 12; cy.blur_glossy = 1
try:
    pr = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            pr.compute_device_type = t; pr.get_devices()
            if any(d.type == t for d in pr.devices):
                for d in pr.devices: d.use = d.type == t
                cy.device = 'GPU'; print('BAKE GPU', t); break
        except Exception: pass
except Exception as e: print('BAKE CPU', e)

# группы: что запекаем и в каком размере; окна, неон и фонари остаются со своими текстурами/цветом
KEEP = lambda n: n.startswith(('win', 'store', 'neon', 'lamp', 'far_win'))
def group(n):
    if KEEP(n): return n
    if n in ('asphalt', 'sand', 'walk', 'mark'): return 'ground'
    if n in ('trunk', 'frond'): return 'palms'
    if n == 'far': return 'far'
    return 'hotels'
SIZE = {'hotels': RES, 'ground': RES // 2, 'palms': RES // 4, 'far': RES // 4}

dg = bpy.context.evaluated_depsgraph_get(); parts = {}
for o in list(sc.objects):
    if o.type not in ('MESH', 'FONT') or not o.material_slots or not o.material_slots[0].material: continue
    m = o.material_slots[0].material; me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
    xs = [v.co.x for v in me.vertices]; long_ = max(xs) - min(xs) > 60 and not KEEP(m.name)      # парапет и дорога — отдельно, иначе их полосы съедают атлас фасадов
    mark = m.name == 'trim' and max(v.co.z for v in me.vertices) < .1
    parts.setdefault('ground' if long_ or mark else group(m.name), []).append((m, me))
for o in list(sc.objects):
    if o.type in ('MESH', 'FONT'): bpy.data.objects.remove(o)
cam_p = Vector((-2, -50, 2.2)); objs = {}
for g, lst in parts.items():
    mats, bm = [], bmesh.new()
    for m, me in lst:
        if m not in mats: mats.append(m)
        k = len(bm.faces); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        for f in bm.faces[k:]: f.material_index = mats.index(m)
    if g in ('hotels', 'far', 'ground'):   # то, что с набережной никогда не видно, выбрасываем: меньше сетка и больше пикселей видимому
        bm.normal_update()
        dead = [f for f in bm.faces if f.normal.y > .5 or (g == 'ground' and (f.normal.z < -.5 or abs(f.normal.x) > .5)) or (f.normal.z < -.9 and f.calc_center_median().z < 1) or (f.normal.z > .9 and f.calc_center_median().z > 9 and g == 'hotels')]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
    if g == 'ground':                       # лишняя земля за кадром
        for v in bm.verts: v.co.x = max(-65, min(65, v.co.x)); v.co.y = max(-49, min(40, v.co.y))
    out = bpy.data.meshes.new(g); bm.to_mesh(out); bm.free()
    for m in mats: out.materials.append(m)
    ob = bpy.data.objects.new(g, out); sc.collection.objects.link(ob); objs[g] = ob

def only(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
baked = {}
for g in ('hotels', 'ground', 'palms', 'far'):
    ob = objs.get(g)
    if not ob: continue
    only(ob); uv = ob.data.uv_layers.new(name='bake'); ob.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.0006, area_weight=0., correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('bake_' + g, SIZE[g], SIZE[g], float_buffer=True, alpha=False); img.generated_color = (.02, .01, .03, 1)
    for m in ob.data.materials:
        nt = m.node_tree; n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.select = True; nt.nodes.active = n
    b = sc.render.bake; b.margin = 6; b.use_clear = True
    try: b.view_from = 'ACTIVE_CAMERA'      # отражения неона в асфальте — такими, какими их видно с набережной
    except Exception: pass
    print('BAKE', g, SIZE[g], len(ob.data.polygons), flush=True)
    bpy.ops.object.bake(type='COMBINED')
    p = os.path.join(TMP, f'bake-{g}.png'); sc.render.image_settings.color_mode = 'RGB'; img.save_render(p, scene=sc); baked[g] = p  # с той же цветокоррекцией AgX, что у 2D-кадра

from mathutils import Matrix as _M
shift = _M.Translation((-5.5, -1.0, 0))
for g, ob in objs.items():
    me = ob.data; me.transform(shift)
    if g in baked:
        for l in [l for l in me.uv_layers if l.name != 'bake']: me.uv_layers.remove(l)
        m = bpy.data.materials.new('baked_' + g); m.use_nodes = True; t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(baked[g])
        m.node_tree.links.new(t.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        me.materials.clear(); me.materials.append(m); me.polygons.foreach_set('material_index', [0] * len(me.polygons))
# свечение неона: мягкая карточка вокруг каждой трубки и буквы (на сайте — аддитивная, без постобработки)
for g in [k for k in objs if k.startswith('neon')]:
    bm = bmesh.new(); bm.from_mesh(objs[g].data); seen, vs, fs, uvs = set(), [], [], []
    for v in bm.verts:
        if v.index in seen: continue
        st, isl = [v], []
        while st:
            a = st.pop()
            if a.index in seen: continue
            seen.add(a.index); isl.append(a); st += [e.other_vert(a) for e in a.link_edges]
        xs, ys, zs = ([c.co[i] for c in isl] for i in range(3)); r = .5; y = min(ys) - .05
        w_, h_ = max(xs) - min(xs), max(zs) - min(zs)
        if max(ys) - min(ys) > 4 or w_ > 60 or max(w_, h_) < 1.7: continue   # буквы и парапет не размываем: надписи остаются чёткими
        k = len(vs); x0, x1, z0, z1 = min(xs) - r, max(xs) + r, min(zs) - r, max(zs) + r
        vs += [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]; fs.append((k, k + 1, k + 2, k + 3)); uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
    bm.free()
    if not fs: continue
    me = bpy.data.meshes.new('glow_' + g[5:]); me.from_pydata(vs, [], fs); u = me.uv_layers.new(name='UVMap')
    for i, c in enumerate(uvs): u.data[i].uv = c
    m = bpy.data.materials.new('glow_' + g[5:]); m.use_nodes = True; me.materials.append(m); sc.collection.objects.link(bpy.data.objects.new('glow_' + g[5:], me))
for o in list(sc.objects):
    if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o)
path = os.path.join(OUT, 'hotel.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True, export_normals=False, export_cameras=False, export_lights=False, export_image_format='WEBP', export_image_quality=82)
print('VICE BAKED', round(os.path.getsize(path) / 1e6, 2), 'MB', len(objs), 'meshes')
