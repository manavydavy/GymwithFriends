# Gym Colonisers: rebuilds the game's machines in Blender at higher quality.
# Input is the JSON from blender/capture.js (one entry per machine type).
# Every shape gets rounded edges, smooth shading and more segments, then the parts are joined
# per moving piece, ambient occlusion is baked into vertex colours, and a .glb is exported.
# Coordinates in the JSON are three.js (Y up, -Z forward); they're converted to Blender (Z up).
import bpy, bmesh, math, os, tempfile, json, base64
from mathutils import Matrix, Vector

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # three -> blender
PRE_CYL = Matrix.Rotation(-math.pi / 2, 4, 'Y') @ Matrix.Rotation(-math.pi / 2, 4, 'X')  # bmesh Z-axis -> three Y-axis
OUT = os.path.join(tempfile.gettempdir(), 'gc_models')
os.makedirs(OUT, exist_ok=True)


def m4(e):
    return Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (0, 0, 0, 1)))


def srgb_to_lin(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def material(key, mat):
    name = 'GCM_' + key
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    hx = '#D9483B' if mat['c'] == 'gc' else mat['c']
    rgb = [srgb_to_lin(int(hx[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = rgb + [1]
    b.inputs['Roughness'].default_value = mat['r']
    b.inputs['Metallic'].default_value = mat['mt']
    m.diffuse_color = rgb + [1]
    return m


def mat_key(mat):
    return '%s_%s_%s' % (mat['c'].lstrip('#'), mat['r'], mat['mt'])


def bevel_edges(bm, edges, off, segs):
    edges = [e for e in edges if e.is_valid]
    if edges and off > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=off, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)


def sharp_edges(bm, ang):
    out = []
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal, 0) > ang:
            out.append(e)
    return out


def prim(bm, s):
    """Add one shape to bm (in the owner's three.js frame, before the C conversion)."""
    t, p = s['type'], s['p']
    M = m4(s['m'])
    loc, rot, sc = M.decompose()
    R = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
    tmp = bmesh.new()
    if t == 'BoxGeometry':
        dims = Vector((p['width'] * sc.x, p['height'] * sc.y, p['depth'] * sc.z))
        bmesh.ops.create_cube(tmp, size=1)
        bmesh.ops.scale(tmp, vec=dims, verts=tmp.verts)
        mn = min(dims)
        if mn > 0.006:
            off = max(0.0015, min(mn * 0.16, 0.012))
            bevel_edges(tmp, list(tmp.edges), off, 2 if off > 0.004 else 1)
    elif t == 'CylinderGeometry':
        rt, rb, h = p['radiusTop'] * sc.x, p['radiusBottom'] * sc.x, p['height'] * sc.y
        r = max(rt, rb)
        segs = p.get('radialSegments', 12)
        if segs > 6:
            segs = 32 if r > 0.1 else 24 if r > 0.04 else 16 if r > 0.015 else 10
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=segs, radius1=rb, radius2=rt, depth=h)
        bmesh.ops.transform(tmp, matrix=PRE_CYL, verts=tmp.verts)
        if abs(sc.z - sc.x) > 1e-3 and sc.x > 0:
            bmesh.ops.scale(tmp, vec=Vector((1, 1, sc.z / sc.x)), verts=tmp.verts)
        if r > 0.012 and h > 0.006:
            off = min(0.006, r * 0.18, h * 0.2)
            bevel_edges(tmp, sharp_edges(tmp, 1.0), off, 2 if off > 0.003 else 1)
    elif t == 'SphereGeometry':
        r = p['radius']
        bmesh.ops.create_uvsphere(tmp, u_segments=max(16, p.get('widthSegments', 12) * 2), v_segments=max(10, p.get('heightSegments', 8) * 2), radius=r)
        bmesh.ops.transform(tmp, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=tmp.verts)
        bmesh.ops.scale(tmp, vec=sc, verts=tmp.verts)
    elif t == 'TorusGeometry':
        R0, r0 = p['radius'], p['tube']
        arc = p.get('arc', math.pi * 2)
        n1, n2 = max(24, p.get('tubularSegments', 12) * 2), max(10, p.get('radialSegments', 6) * 2)
        full = arc >= math.pi * 2 - 1e-4
        rings = []
        for i in range(n1 + (0 if full else 1)):
            a = arc * i / n1
            ring = []
            for j in range(n2):
                b = 2 * math.pi * j / n2
                ring.append(tmp.verts.new(((R0 + r0 * math.cos(b)) * math.cos(a), (R0 + r0 * math.cos(b)) * math.sin(a), r0 * math.sin(b))))
            rings.append(ring)
        for i in range(len(rings) - (0 if full else 1)):
            a, b2 = rings[i], rings[(i + 1) % len(rings)]
            for j in range(n2):
                tmp.faces.new((a[j], a[(j + 1) % n2], b2[(j + 1) % n2], b2[j]))
        bmesh.ops.scale(tmp, vec=sc, verts=tmp.verts)
    else:
        tmp.free()
        return False
    bmesh.ops.transform(tmp, matrix=C @ R, verts=tmp.verts)
    me = bpy.data.meshes.new('tmp')
    tmp.to_mesh(me)
    tmp.free()
    for f in me.polygons:
        f.material_index = s['_mi']
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return True


def subdivide_long(me, maxlen=0.22):
    bm = bmesh.new()
    bm.from_mesh(me)
    groups = {}
    for e in bm.edges:
        L = e.calc_length()
        if L > maxlen * 1.4:
            groups.setdefault(min(12, int(L / maxlen)), []).append(e)
    for n, es in sorted(groups.items(), reverse=True):
        es = [e for e in es if e.is_valid]
        if es:
            bmesh.ops.subdivide_edges(bm, edges=es, cuts=n, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()


def collection(name, clear=True):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    elif clear:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    return c


def floor(coll):
    me = bpy.data.meshes.new('GC_BakeFloor')
    me.from_pydata([(-8, -8, 0), (8, -8, 0), (8, 8, 0), (-8, 8, 0)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new('GC_BakeFloor', me)
    coll.objects.link(o)
    return o


def bake_ao(objs, coll, dist=0.4, samples=64):
    sc = bpy.context.scene
    fl = floor(coll)
    # only this collection takes part in the bake
    hidden = []
    for o in sc.objects:
        if o.name not in coll.objects and not o.hide_render:
            o.hide_render = True
            hidden.append(o.name)
    prev = (sc.render.engine, sc.world.light_settings.distance if sc.world else None)
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = dist
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    for o in objs:
        for a in list(o.data.color_attributes):
            o.data.color_attributes.remove(a)
        ca = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = ca
        with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    sc.render.engine = prev[0]
    if prev[1] is not None:
        sc.world.light_settings.distance = prev[1]
    for n in hidden:
        bpy.data.objects[n].hide_render = False
    bpy.data.objects.remove(fl, do_unlink=True)


def export(objs, name, draco=True):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=False, export_normals=True, export_vertex_color='ACTIVE', export_materials='EXPORT')
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                  export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_color_quantization=8)
    bpy.ops.export_scene.gltf(**kw)
    for o in objs:
        o.select_set(False)
    return path


def build(name, spec, offset_x=0.0, draco=True, bake=True):
    coll = collection('GCM_' + name)
    mats, owners = {}, {}
    for s in spec['shapes']:
        k = mat_key(s['mat'])
        if k not in mats:
            mats[k] = material(k, s['mat'])
        ow = str(s['owner'])
        owners.setdefault(ow, {'bm': bmesh.new(), 'mats': []})
        od = owners[ow]
        if k not in od['mats']:
            od['mats'].append(k)
        s['_mi'] = od['mats'].index(k)
        prim(od['bm'], s)
    objs = []
    shift = Matrix.Translation((offset_x, 0, 0))
    for ow, od in owners.items():
        nm = 'static' if ow == 'root' else 'o' + ow
        me = bpy.data.meshes.new(name + '_' + nm)
        od['bm'].to_mesh(me)
        od['bm'].free()
        for k in od['mats']:
            me.materials.append(mats[k])
        for f in me.polygons:
            f.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(35))
        if ow == 'root':
            subdivide_long(me)
        o = bpy.data.objects.new(nm, me)
        coll.objects.link(o)
        o.matrix_world = shift @ C @ m4(spec['owners'][ow]) @ C.inverted()
        objs.append(o)
    if bake:
        bake_ao(objs, coll)
    path = export(objs, 'm_' + name, draco)
    tris = 0
    for o in objs:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    for o in objs:   # keep names unique across machines once exported
        o.name = name + '_' + o.name
    return {'path': path, 'bytes': os.path.getsize(path), 'tris': tris, 'objects': len(objs)}


def chunk(path, i, size=120000):
    d = open(path, 'rb').read()
    return {'n': (len(d) + size - 1) // size, 'part': i, 'bytes': len(d), 'b64': base64.b64encode(d[i * size:(i + 1) * size]).decode()}
