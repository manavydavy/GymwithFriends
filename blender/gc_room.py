# Gym Colonisers: rebuilds the gym building in Blender and bakes its lighting.
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


def occluders(spec, coll):
    """Copies of every machine at its place in the gym, so the bake sees them."""
    out = []
    for i, m in enumerate(spec['machines']):
        t = m['type']
        if t == 'squat':
            src = [o for o in bpy.data.collections['GC_SquatRack_Export'].objects if o.type == 'MESH']
            base = Matrix.Identity(4)
        else:
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


def build_room(spec, bake=True):
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
    objs = []
    for ow, od in owners.items():
        me = bpy.data.meshes.new('room_' + ow)
        od['bm'].to_mesh(me); od['bm'].free()
        for k in od['mats']:
            me.materials.append(mats[k])
        for f in me.polygons:
            f.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(35))
        G.subdivide_long(me, 0.4)
        old = bpy.data.objects.get(ow)
        if old:
            old.name = ow + '_old'
        o = bpy.data.objects.new(ow, me); coll.objects.link(o)
        objs.append(o)
    occ = occluders(spec, occ_coll)
    floor = _floor_plane(coll)
    if bake:
        _bake(objs, [coll, occ_coll], dist=0.9)
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
