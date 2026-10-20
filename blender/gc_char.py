# Gym Colonisers: higher-quality body parts for the characters.
# The game's rig (makeChar in gym3d.js) poses each part every frame, so each part here is built in
# exactly the same local frame as the shape it replaces. Only the geometry changes; the game keeps
# its own per-player colours. Needs gc_build.py loaded first (uses its C matrix and export helpers).
import bpy, bmesh, math
from mathutils import Matrix, Vector

def _lathe(bm, prof, segs, zscale=1.0):
    """prof: list of (r, y) bottom to top, three.js frame (Y up). Returns verts grid."""
    rings = []
    for (r, y) in prof:
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            ring.append(bm.verts.new((r * math.sin(a), y, r * math.cos(a) * zscale)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(segs):
            bm.faces.new((a[j], b[j], b[(j + 1) % segs], a[(j + 1) % segs]))
    # caps
    if prof[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if prof[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    return rings

def _smooth_profile(pts, n=4):
    """Catmull-Rom through (r, y) points, n samples per span."""
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in range(2)))
    out.append(pts[-1])
    return out

def _sphere(bm, r, u=28, v=18, sc=(1, 1, 1), theta_max=None, thick=0.0):
    """UV sphere in three frame (pole on +Y). theta_max cuts it like three's thetaLength (cap from the top)."""
    rows = v if theta_max is None else max(4, int(v * theta_max / math.pi))
    tm = math.pi if theta_max is None else theta_max
    prof = []
    for i in range(rows + 1):
        th = tm * i / rows
        prof.append((r * math.sin(th), r * math.cos(th)))
    prof = list(reversed(prof))   # bottom to top
    rings = []
    top = None
    for (rr, y) in prof:
        if rr < 1e-5:
            top = bm.verts.new((0, y, 0)) if y > 0 else None
            if y < 0:
                rings.append('bottom')
            continue
        rings.append([bm.verts.new((rr * math.sin(2 * math.pi * j / u), y, rr * math.cos(2 * math.pi * j / u))) for j in range(u)])
    bottom = None
    if rings and rings[0] == 'bottom':
        rings.pop(0)
        bottom = bm.verts.new((0, -r, 0))
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(u):
            bm.faces.new((a[j], b[j], b[(j + 1) % u], a[(j + 1) % u]))
    if top:
        for j in range(u):
            bm.faces.new((rings[-1][j], top, rings[-1][(j + 1) % u]))
    if bottom:
        for j in range(u):
            bm.faces.new((bottom, rings[0][j], rings[0][(j + 1) % u]))
    elif theta_max is not None and thick > 0:
        # give the open edge some thickness (hair)
        inner = [bm.verts.new((Vector(v.co) * (1 - thick / r)).to_tuple()) for v in rings[0]]
        for j in range(u):
            bm.faces.new((rings[0][(j + 1) % u], inner[(j + 1) % u], inner[j], rings[0][j]))
    for vv in bm.verts:
        vv.co = Vector((vv.co.x * sc[0], vv.co.y * sc[1], vv.co.z * sc[2]))

def _rbox(bm, w, h, d, bev, segs=3, toe=0.0):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1)
    bmesh.ops.scale(tmp, vec=Vector((w, h, d)), verts=tmp.verts)
    if toe:
        # lower the front-top edge (front is -Z in three) to make a toe
        for v in tmp.verts:
            if v.co.z < 0 and v.co.y > 0:
                v.co.y -= toe
    bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bev, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)

def _torus(bm, R0, r0, n1=40, n2=12):
    rings = []
    for i in range(n1):
        a = 2 * math.pi * i / n1
        rings.append([bm.verts.new(((R0 + r0 * math.cos(b)) * math.cos(a), (R0 + r0 * math.cos(b)) * math.sin(a), r0 * math.sin(b)))
                      for b in [2 * math.pi * j / n2 for j in range(n2)]])
    for i in range(n1):
        a, b = rings[i], rings[(i + 1) % n1]
        for j in range(n2):
            bm.faces.new((a[j], a[(j + 1) % n2], b[(j + 1) % n2], b[j]))

def _limb(bm, rt, rb, bulge=0.0, segs=20):
    """Unit-length limb along Y from -0.5 to 0.5, radius rb at the bottom and rt at the top, with an optional muscle bulge."""
    prof = []
    for i in range(9):
        t = i / 8
        r = rb + (rt - rb) * t
        r *= 1 + bulge * math.sin(math.pi * min(1, t * 1.15)) ** 1.5
        prof.append((r, -0.5 + t))
    _lathe(bm, prof, segs)

def part(bm, s):
    t, p = s['type'], s['p']
    if t == 'LatheGeometry':
        pts = [(q['x'], q['y']) for q in p['points']]
        # smoother torso with a little chest and a collar
        prof = _smooth_profile(pts[1:-1], 4)
        prof = [(0.0, 0.0)] + prof + [(0.11, 0.995), (0.085, 1.005), (0.0, 1.005)]
        _lathe(bm, [(r, y) for (r, y) in prof if r > 0] , 36, 0.68)
        # caps
    elif t == 'SphereGeometry':
        r = p['radius']
        partial = p.get('thetaLength', math.pi) < math.pi - 1e-3
        if partial:                       # hair cap
            _sphere(bm, r, 32, 22, theta_max=p['thetaLength'] * 1.04, thick=0.018)
        elif abs(r - 0.21) < 1e-6:        # skull: a touch of jaw and cheek
            _sphere(bm, r, 36, 24)
            for v in bm.verts:
                if v.co.y < 0:
                    k = 1 - 0.12 * min(1, -v.co.y / r) ** 2
                    v.co.x *= k
                if v.co.y < -0.05 and v.co.z < 0:
                    v.co.z *= 1.04
        elif abs(r - 0.074) < 1e-6:       # hand: chunky rounded fist
            _rbox(bm, 0.13, 0.15, 0.12, 0.045, 3)
        else:
            u = 24 if r > 0.06 else 18
            _sphere(bm, r, u, max(10, u * 2 // 3))
    elif t == 'CylinderGeometry':
        rt, rb, h = p['radiusTop'], p['radiusBottom'], p['height']
        if abs(h - 1) < 1e-6:
            bulge = 0.08 if rt in (0.088, 0.11) else 0.05 if rt in (0.07, 0.08) else 0.0
            _limb(bm, rt, rb, bulge, 22)
        else:                             # shorts
            prof = [(rb * 1.02, -h / 2), (rb, -h / 2 + 0.02), (rb * 0.99, 0.0), (rt, h / 2 - 0.01), (rt * 0.96, h / 2)]
            _lathe(bm, prof, 32)
    elif t == 'TorusGeometry':
        _torus(bm, p['radius'], p['tube'], 44 if p['radius'] > 0.15 else 36, 12)
    elif t == 'BoxGeometry':
        w, h, d = p['width'], p['height'], p['depth']
        if abs(d - 0.27) < 1e-6:          # shoe upper
            _rbox(bm, w, h, d, 0.035, 3, toe=0.02)
        elif abs(d - 0.285) < 1e-6:       # sole
            _rbox(bm, w, h, d, 0.012, 2)
        else:
            _rbox(bm, w, h, d, min(w, h, d) * 0.3, 2)
    else:
        return False
    return True

def build_char(parts):
    import gclib
    coll = gclib.collection('GC_CharParts')
    objs = []
    for i, s in enumerate(parts):
        bm = bmesh.new()
        if not part(bm, s):
            bm.free(); continue
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.transform(bm, matrix=gclib.C, verts=bm.verts)
        me = bpy.data.meshes.new(s['name']); bm.to_mesh(me); bm.free()
        for f in me.polygons: f.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(50))
        o = bpy.data.objects.new(s['name'], me); coll.objects.link(o)
        o.location = (i % 8 * 0.6, -(i // 8) * 0.6 - 3, 0.6)   # laid out in a grid for viewing; the game ignores this
        objs.append(o)
    path = gclib.export(objs, 'char_parts', True)
    tris = 0
    for o in objs:
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    return {'path': path, 'tris': tris, 'parts': len(objs)}
