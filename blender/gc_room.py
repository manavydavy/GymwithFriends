# Gym with Friends: rebuilds the gym building in Blender and bakes its lighting.
# Needs gc_build.py loaded as module 'gclib' (and the machines built, so they can cast soft shadows).
# Outputs: room.glb (walls, stairs, lockers, desk, props: rounded edges + baked ambient occlusion)
#          floor_ao.jpg (soft contact shadows for the textured ground floor, mapped over the whole floor)
import bpy, bmesh, math, os
from mathutils import Matrix, Vector
import gclib as G


def _cone(bm, s):
    p = s['p']
    M = G.m4(s['m'])
    loc, rot, sc = M.decompose()
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=max(8, p.get('radialSegments', 8)), radius1=p['radius'] * sc.x, radius2=0, depth=p['height'] * sc.y)
    bmesh.ops.transform(tmp, matrix=G.PRE_CYL, verts=tmp.verts)
    bmesh.ops.transform(tmp, matrix=G.C @ Matrix.Translation(loc) @ rot.to_matrix().to_4x4(), verts=tmp.verts)
    me = bpy.data.meshes.new('tmp'); tmp.to_mesh(me); tmp.free()
    for f in me.polygons:
        f.material_index = s['_mi']
    bm.from_mesh(me); bpy.data.meshes.remove(me)


def ensure_machines(spec_mach):
    """After a fresh Blender start: rebuild the machines (no bake) so the room bake can use them as occluders."""
    G.SPEC_MACH = spec_mach
    built = []
    for t, sp in spec_mach.items():
        if 'GCM_' + t in bpy.data.collections and len(bpy.data.collections['GCM_' + t].objects):
            continue
        q = G.QUALITY; G.QUALITY = 0.6
        try:
            G.build(t, dict(sp, shapes=G.enrich(sp['shapes'])), 0.0, True, False)
        finally:
            G.QUALITY = q
        built.append(t)
    return built


def occluders(spec, coll):
    """Copies of every machine at its place in the gym, so the bake sees them."""
    out = []
    for i, m in enumerate(spec['machines']):
        t = m['type']
        if t == 'squat':
            if 'GC_SquatRack_Export' not in bpy.data.collections:
                continue       # the hand-built rack isn't in this Blender session: no contact shadow for it
            src = [o for o in bpy.data.collections['GC_SquatRack_Export'].objects if o.type == 'MESH']
            base = Matrix.Identity(4)
        else:
            if 'GCM_' + t not in bpy.data.collections:
                continue
            src = [o for o in bpy.data.collections['GCM_' + t].objects if o.type == 'MESH']
            base = None
        for o in src:
            c = o.copy(); coll.objects.link(c)
            if base is None:
                # undo the grid layout offset used when the machine was built: owner matrices come from the spec
                ow = o.name.split('_', 1)[1] if '_' in o.name else o.name
                key = 'root' if ow == 'static' else ow[1:]
                mw = G.m4(G.SPEC_MACH[t]['owners'][key])
            else:
                mw = G.C.inverted() @ o.matrix_world @ G.C      # hand-built squat rack sits at the origin
            c.matrix_world = G.C @ Matrix.Translation(Vector(m['pos'])) @ mw @ G.C.inverted()
            out.append(c)
    return out


WALLISH = ('efe3cf', '2f8f8a', 'ff8a2b', '22252b', 'd9ccb5')


def fix_ao(o, buried=0.08, pct=0.9):
    """Corners buried inside other shapes bake black; borrow the face's lit corners instead, then normalise."""
    me = o.data; d = me.color_attributes['AO'].data
    vals = [c.color[0] for c in d]
    for poly in me.polygons:
        li = list(poly.loop_indices)
        good = [vals[i] for i in li if vals[i] > buried]
        if good and len(good) < len(li):
            fill = max(good)
            for i in li:
                if vals[i] <= buried: vals[i] = fill
    s = sorted(vals); p = s[int(len(s) * pct)] or 1.0
    for i, c in enumerate(d):
        v = min(1.0, vals[i] / p); c.color = (v, v, v, 1.0)
    return p


def bake_colours(o):
    """Fold each face's colour and its ambient occlusion into vertex colours (linear) and collapse the many
    colour materials into a few roughness/metalness classes named GCR_<rough>_<metal> (far fewer draw calls)."""
    me = o.data
    ao = me.color_attributes['AO'].data
    base, cls = [], []
    for mt in me.materials:
        b = mt.node_tree.nodes.get('Principled BSDF')
        base.append(tuple(b.inputs['Base Color'].default_value)[:3])
        r = round(b.inputs['Roughness'].default_value * 4) / 4; mv = b.inputs['Metallic'].default_value
        cls.append((max(0.25, r), 0.9 if mv > 0.5 else 0.3 if mv > 0.15 else 0.0))
    keys = sorted(set(cls)); kidx = {k: i for i, k in enumerate(keys)}
    col = me.color_attributes.new('COL', 'FLOAT_COLOR', 'CORNER'); cd = col.data
    names = [mt.name for mt in me.materials]
    for poly in me.polygons:
        mi = poly.material_index; bc = base[mi]
        wall = names[mi][4:10] in WALLISH            # big plain walls: no baked shading (too few vertices to hold it)
        for li in poly.loop_indices:
            a = ao[li].color[0]
            f = 1.0 if wall else 0.8 + 0.2 * (max(0.0, a) ** 0.8)
            cd[li].color = (bc[0] * f, bc[1] * f, bc[2] * f, 1.0)
        poly.material_index = kidx[cls[mi]]
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['COL']
    for i in range(len(me.materials)):
        r, mm = keys[min(i, len(keys) - 1)]
        name = 'GCR_%s_%s' % (r, mm)
        mt = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mt.use_nodes = True; b = mt.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Roughness'].default_value = r; b.inputs['Metallic'].default_value = mm
        me.materials[i] = mt
    return len(keys)


def build_room(spec, bake=True):
    """Run with G.QUALITY = 0.6 and spheres capped at 10x6 segments in the spec (what the game ships)."""
    coll = G.collection('GC_Room')
    occ_coll = G.collection('GC_RoomOccluders')
    mats, owners = {}, {}
    for s in spec['shapes']:
        k = G.mat_key(s['mat'])
        if k not in mats:
            mats[k] = G.material(k, s['mat'])
        od = owners.setdefault(s['owner'], {'bm': bmesh.new(), 'mats': []})
        if k not in od['mats']:
            od['mats'].append(k)
        s['_mi'] = od['mats'].index(k)
        if s['type'] == 'ConeGeometry':
            _cone(od['bm'], s)
        else:
            G.prim(od['bm'], s)
    # props modelled in Blender (gc_props.py), placed where the game's stand-ins are
    import gcprops as GP
    for e in spec.get('extras', []):
        od = owners.setdefault(e['owner'], {'bm': bmesh.new(), 'mats': []})
        M = G.C @ G.m4(e['m'])
        for (mat, pbm) in GP.make(e['k']):
            k = G.mat_key(mat)
            if k not in mats:
                mats[k] = G.material(k, mat)
            if k not in od['mats']:
                od['mats'].append(k)
            bmesh.ops.transform(pbm, matrix=M, verts=pbm.verts)
            me = bpy.data.meshes.new('tmp'); pbm.to_mesh(me); pbm.free()
            for f in me.polygons:
                f.material_index = od['mats'].index(k)
            od['bm'].from_mesh(me); bpy.data.meshes.remove(me)
    objs = []
    for ow, od in owners.items():
        me = bpy.data.meshes.new('room_' + ow)
        od['bm'].to_mesh(me); od['bm'].free()
        for k in od['mats']:
            me.materials.append(mats[k])
        for f in me.polygons:
            f.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(35))
        G.subdivide_long(me, 0.9)
        old = bpy.data.objects.get(ow)
        if old:
            old.name = ow + '_old'
        o = bpy.data.objects.new(ow, me); coll.objects.link(o)
        objs.append(o)
    occ = occluders(spec, occ_coll)
    floor = _floor_plane(coll)
    if bake:
        _bake(objs, [coll, occ_coll], dist=0.9)
        for o in objs:
            fix_ao(o); bake_colours(o)
    path = G.export(objs, 'room', True)
    tris = 0
    for o in objs:
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    return {'path': path, 'bytes': os.path.getsize(path), 'tris': tris, 'occluders': len(occ)}


def _floor_plane(coll):
    me = bpy.data.meshes.new('GC_GroundFloor')
    me.from_pydata([(-18, -11, 0), (18, -11, 0), (18, 11, 0), (-18, 11, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UVMap')
    for li, (u, v) in zip(range(4), [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    o = bpy.data.objects.new('GC_GroundFloor', me); coll.objects.link(o)
    return o


def _bake(objs, colls, dist):
    sc = bpy.context.scene
    keep = set()
    for c in colls:
        keep |= set(o.name for o in c.objects)
    hidden = []
    for o in sc.objects:
        if o.name not in keep and not o.hide_render:
            o.hide_render = True; hidden.append(o.name)
    prev = (sc.render.engine, sc.world.light_settings.distance)
    sc.world.light_settings.distance = dist
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 64
    try:
        for o in objs:
            for a in list(o.data.color_attributes):
                o.data.color_attributes.remove(a)
            ca = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
            o.data.color_attributes.active_color = ca
            with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
                bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    finally:
        sc.render.engine, sc.world.light_settings.distance = prev
        for n in hidden:
            bpy.data.objects[n].hide_render = False


def bake_floor(size=(2048, 1252), dist=1.2, samples=96):
    """Bakes ambient occlusion onto the ground floor (walls, desk, stairs, machines) into floor_ao.jpg."""
    sc = bpy.context.scene
    fl = bpy.data.objects['GC_GroundFloor']
    img = bpy.data.images.get('GC_FloorAO') or bpy.data.images.new('GC_FloorAO', size[0], size[1], alpha=False)
    img.scale(size[0], size[1])
    m = bpy.data.materials.get('GC_FloorBake') or bpy.data.materials.new('GC_FloorBake')
    m.use_nodes = True
    nt = m.node_tree
    node = nt.nodes.get('GC_Img') or nt.nodes.new('ShaderNodeTexImage')
    node.name = 'GC_Img'; node.image = img
    nt.nodes.active = node
    fl.data.materials.clear(); fl.data.materials.append(m)
    keep = set(o.name for o in bpy.data.collections['GC_Room'].objects) | set(o.name for o in bpy.data.collections['GC_RoomOccluders'].objects)
    hidden = []
    for o in sc.objects:
        if o.name not in keep and not o.hide_render:
            o.hide_render = True; hidden.append(o.name)
    prev = (sc.render.engine, sc.world.light_settings.distance)
    sc.world.light_settings.distance = dist
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples
    try:
        sc.render.bake.target = 'IMAGE_TEXTURES'
        sc.render.bake.margin = 4
        with bpy.context.temp_override(active_object=fl, object=fl, selected_objects=[fl], selected_editable_objects=[fl]):
            bpy.ops.object.bake(type='AO', target='IMAGE_TEXTURES')
    finally:
        sc.render.engine, sc.world.light_settings.distance = prev
        for n in hidden:
            bpy.data.objects[n].hide_render = False
    path = os.path.join(G.OUT, 'floor_ao.jpg')
    img.filepath_raw = path; img.file_format = 'JPEG'
    s = sc.render.image_settings
    old = (s.file_format, s.quality, s.color_mode)
    s.file_format = 'JPEG'; s.quality = 82; s.color_mode = 'BW'
    img.save_render(path, scene=sc)
    s.file_format, s.quality, s.color_mode = old
    return {'path': path, 'bytes': os.path.getsize(path)}
