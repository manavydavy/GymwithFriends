# Gym with Friends: props modelled directly in Blender (no built-in version to copy).
# Each model is built in the game's own frame (three.js: Y up, front facing +Z, origin on the floor), as
# a list of (material, bmesh) pairs. gc_room.py places them where the game's stand-ins are (spec "extras"),
# joins them into the room and bakes them with it, so they cost no extra draw calls in the game.
import bpy, bmesh, math
from mathutils import Matrix, Vector

V = Vector


def mat(c, r=0.6, mt=0.0):
    return {'c': c, 'r': r, 'mt': mt}


def rot3(r):
    if not r:
        return Matrix.Identity(4)
    return Matrix.Rotation(r[0], 4, 'X') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[2], 4, 'Z')   # three.js 'XYZ'


def catmull(ctrl, n=8):
    P = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(ctrl[-1].copy())
    return out


class Parts:
    def __init__(self):
        self.bms = {}

    def out(self):
        return [v for v in self.bms.values()]

    def _put(self, t, m, M):
        bmesh.ops.transform(t, matrix=M, verts=t.verts)
        k = '%s_%s_%s' % (m['c'], m['r'], m['mt'])
        if k not in self.bms:
            self.bms[k] = (m, bmesh.new())
        me = bpy.data.meshes.new('t'); t.to_mesh(me); t.free()
        self.bms[k][1].from_mesh(me); bpy.data.meshes.remove(me)

    def box(self, w, h, d, pos, m, bev=0.008, rot=None, segs=2):
        t = bmesh.new(); bmesh.ops.create_cube(t, size=1); bmesh.ops.scale(t, vec=(w, h, d), verts=t.verts)
        if bev > 0:
            bmesh.ops.bevel(t, geom=list(t.edges), offset=min(bev, min(w, h, d) * 0.45), segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
        self._put(t, m, Matrix.Translation(pos) @ rot3(rot))

    def cyl(self, rt, rb, h, pos, m, rot=None, segs=24, bev=0.0):
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, cap_tris=False, segments=segs, radius1=rb, radius2=rt, depth=h)
        bmesh.ops.transform(t, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=t.verts)   # Z axis -> Y axis
        if bev > 0:
            es = [e for e in t.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal, 0) > 1.0]
            bmesh.ops.bevel(t, geom=es, offset=bev, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
        self._put(t, m, Matrix.Translation(pos) @ rot3(rot))

    def rod(self, a, b, r, m, segs=12):
        a, b = V(a), V(b); d = b - a
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=d.length)
        q = V((0, 0, 1)).rotation_difference(d.normalized())
        self._put(t, m, Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4())

    def sphere(self, r, pos, m, sc=(1, 1, 1), u=20, v=12, rot=None):
        t = bmesh.new(); bmesh.ops.create_uvsphere(t, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.transform(t, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=t.verts)
        bmesh.ops.scale(t, vec=sc, verts=t.verts)
        self._put(t, m, Matrix.Translation(pos) @ rot3(rot))

    def torus(self, R0, r0, pos, m, rot=None, n1=24, n2=8, sc=(1, 1, 1)):
        """Ring in the XY plane (like three's TorusGeometry)."""
        t = bmesh.new(); rings = []
        for i in range(n1):
            a = 2 * math.pi * i / n1
            rings.append([t.verts.new(((R0 + r0 * math.cos(b)) * math.cos(a) * sc[0], (R0 + r0 * math.cos(b)) * math.sin(a) * sc[1], r0 * math.sin(b) * sc[2]))
                          for b in [2 * math.pi * j / n2 for j in range(n2)]])
        for i in range(n1):
            A, B = rings[i], rings[(i + 1) % n1]
            for j in range(n2):
                t.faces.new((A[j], A[(j + 1) % n2], B[(j + 1) % n2], B[j]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        M = rot if isinstance(rot, Matrix) else rot3(rot)
        self._put(t, m, Matrix.Translation(pos) @ M)

    def lathe(self, prof, pos, m, segs=32, rot=None, sc=(1, 1, 1), post=None):
        """prof: (r, y) bottom to top around the Y axis; r = 0 closes the end to a point."""
        t = bmesh.new(); rings = []
        for (r, y) in prof:
            if r < 1e-6:
                rings.append(t.verts.new((0, y, 0)))
            else:
                rings.append([t.verts.new((r * math.sin(2 * math.pi * j / segs) * sc[0], y * sc[1], r * math.cos(2 * math.pi * j / segs) * sc[2])) for j in range(segs)])
        for A, B in zip(rings, rings[1:]):
            la, lb = isinstance(A, list), isinstance(B, list)
            for j in range(segs):
                if la and lb:
                    t.faces.new((A[j], A[(j + 1) % segs], B[(j + 1) % segs], B[j]))
                elif la:
                    t.faces.new((A[j], A[(j + 1) % segs], B))
                elif lb:
                    t.faces.new((A, B[(j + 1) % segs], B[j]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        bmesh.ops.transform(t, matrix=rot3(rot), verts=t.verts)
        if post:
            for vv in t.verts:
                vv.co = post(vv.co)
        self._put(t, m, Matrix.Translation(pos))

    def sweep(self, pts, r, m, segs=10, ridge=0.0, caps=True, rfun=None):
        """Tube along a polyline (parallel-transport frames). ridge adds twisted strands (rope)."""
        t = bmesh.new(); n = len(pts); rings = []
        tang = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
        ref = V((0, 1, 0)) if abs(tang[0].y) < 0.9 else V((1, 0, 0))
        nrm = tang[0].cross(ref).normalized(); s = 0.0
        for i in range(n):
            if i > 0:
                ax = tang[i - 1].cross(tang[i])
                if ax.length > 1e-7:
                    nrm = Matrix.Rotation(tang[i - 1].angle(tang[i]), 3, ax.normalized()) @ nrm
                s += (pts[i] - pts[i - 1]).length
            bi = tang[i].cross(nrm).normalized(); nn = bi.cross(tang[i]).normalized()
            rr0 = r * (rfun(i / (n - 1)) if rfun else 1)
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                rr = rr0 * (1 + ridge * math.cos(3 * a - s * 55))
                ring.append(t.verts.new(pts[i] + (nn * math.cos(a) + bi * math.sin(a)) * rr))
            rings.append(ring)
        for A, B in zip(rings, rings[1:]):
            for j in range(segs):
                t.faces.new((A[j], A[(j + 1) % segs], B[(j + 1) % segs], B[j]))
        if caps:
            t.faces.new(list(reversed(rings[0]))); t.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        self._put(t, m, Matrix.Identity(4))

    def chain(self, a, b, m, R0=0.013, r0=0.0042, pitch=0.026):
        a, b = V(a), V(b); d = b - a; L = d.length; n = max(2, int(L / pitch))
        q = V((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        for i in range(n):
            p = a + d * ((i + 0.5) / n)
            self.torus(R0, r0, p, m, rot=q @ Matrix.Rotation(math.pi / 2 * (i % 2), 4, 'Y'), n1=10, n2=5, sc=(1, 1.55, 1))


# ---------------- the props ----------------

def vending():
    P = Parts()
    red, trim, black, panel = mat('#D23A2F', 0.42, 0.25), mat('#C9CED6', 0.3, 0.8), mat('#141518', 0.6), mat('#22252B', 0.5, 0.2)
    P.box(1.0, 1.88, 0.82, (0, 1.0, -0.01), red, 0.03, segs=3)
    P.box(0.96, 0.07, 0.76, (0, 0.035, -0.01), black, 0.01)
    P.box(1.02, 0.035, 0.84, (0, 1.955, -0.01), panel, 0.012)
    P.box(0.98, 0.2, 0.03, (0, 1.835, 0.405), panel, 0.008)
    for (w, h, x, y) in [(0.04, 1.16, -0.46, 1.16), (0.04, 1.16, 0.18, 1.16), (0.68, 0.04, -0.14, 1.72), (0.68, 0.04, -0.14, 0.60)]:
        P.box(w, h, 0.05, (x, y, 0.425), trim, 0.01)
    P.box(0.26, 1.08, 0.04, (0.34, 1.16, 0.42), panel, 0.01)
    btn, ok = mat('#E8E8E8', 0.4), mat('#2FBF71', 0.4)
    for r in range(4):
        for c in range(3):
            P.cyl(0.021, 0.021, 0.014, (0.27 + c * 0.07, 1.05 + r * 0.075, 0.445), ok if (r == 0 and c == 2) else btn, rot=(math.pi / 2, 0, 0), segs=14)
    P.box(0.05, 0.1, 0.012, (0.34, 1.5, 0.446), trim, 0.004)
    P.box(0.008, 0.07, 0.008, (0.34, 1.5, 0.452), black, 0)
    P.box(0.14, 0.09, 0.035, (0.34, 0.88, 0.455), black, 0.008)
    P.box(0.03, 0.012, 0.01, (0.34, 0.91, 0.474), ok, 0)
    P.box(0.12, 0.08, 0.03, (0.34, 0.72, 0.44), black, 0.008)
    P.box(0.6, 0.26, 0.03, (-0.14, 0.35, 0.415), black, 0.01)
    P.cyl(0.012, 0.012, 0.3, (-0.14, 0.455, 0.44), trim, rot=(0, 0, math.pi / 2), segs=10)
    P.box(0.98, 0.12, 0.02, (0, 0.13, 0.405), panel, 0.006)
    for k in (-1, 1):
        for i in range(7):
            P.box(0.012, 0.018, 0.42, (k * 0.503, 0.3 + i * 0.04, -0.12), panel, 0.003)
        P.box(0.008, 1.3, 0.09, (k * 0.503, 1.05, 0.22), mat('#FFC93C', 0.5), 0.003)
        P.box(0.008, 1.3, 0.03, (k * 0.503, 1.05, 0.12), mat('#F4F1EA', 0.5), 0.003)
    for (x, z) in [(-0.42, -0.36), (0.42, -0.36), (-0.42, 0.34), (0.42, 0.34)]:
        P.cyl(0.03, 0.035, 0.02, (x, 0.01, z), black, segs=12)
    return P.out()


def heavybag():
    P = Parts()
    frame, red, black, steel, rub = mat('#22252B', 0.45, 0.4), mat('#B22A24', 0.42), mat('#16171B', 0.5), mat('#AEB6C0', 0.3, 0.85), mat('#1F2228', 0.95)
    for z in (-0.42, 0.42):
        P.box(1.1, 0.07, 0.07, (0, 0.055, z), frame, 0.008)
        for x in (-0.5, 0.5):
            P.box(0.1, 0.02, 0.1, (x, 0.01, z), rub, 0.006)
    P.box(0.07, 0.07, 0.84, (-0.45, 0.055, 0), frame, 0.008)
    P.box(0.07, 0.07, 0.84, (0.5, 0.055, 0), frame, 0.008)
    P.box(0.08, 2.4, 0.08, (-0.45, 1.29, 0), frame, 0.01)
    for z in (-0.4, 0.4):
        P.rod((-0.45, 0.09, z), (-0.45, 0.85, 0), 0.02, frame)
    P.box(0.8, 0.07, 0.07, (-0.08, 2.42, 0), frame, 0.008)
    P.rod((-0.45, 1.85, 0), (-0.03, 2.38, 0), 0.022, frame)
    P.box(0.02, 0.1, 0.1, (0.32, 2.42, 0), black, 0.004)
    # weight plates on pegs to hold the stand down
    for z, c in ((-0.24, '#D9483B'), (0.24, '#2F6FE0')):
        P.rod((-0.45, 0.3, z), (-0.8, 0.3, z), 0.022, steel)
        P.cyl(0.2, 0.2, 0.045, (-0.64, 0.3, z), mat(c, 0.6), rot=(0, 0, math.pi / 2), segs=28, bev=0.008)
        P.cyl(0.05, 0.05, 0.052, (-0.64, 0.3, z), steel, rot=(0, 0, math.pi / 2), segs=14)
    # swivel, chains, bag
    bx = 0.18
    P.cyl(0.022, 0.022, 0.06, (bx, 2.36, 0), steel, segs=12)
    P.chain((bx, 2.33, 0), (bx, 1.82, 0), steel)
    P.torus(0.032, 0.006, (bx, 1.8, 0), steel, rot=(math.pi / 2, 0, 0), n1=18, n2=6)
    for (dx, dz) in [(0.11, 0.0), (-0.11, 0.0), (0.0, 0.11), (0.0, -0.11)]:
        P.chain((bx + dx * 0.25, 1.79, dz * 0.25), (bx + dx, 1.63, dz), steel)
        P.torus(0.016, 0.005, (bx + dx, 1.61, dz), steel, rot=(0, math.atan2(dx, dz) + math.pi / 2, 0), n1=12, n2=5)
    prof = [(0, 0.46), (0.11, 0.462), (0.16, 0.475), (0.185, 0.505), (0.196, 0.56), (0.198, 0.9), (0.198, 1.5), (0.193, 1.56), (0.165, 1.592), (0.09, 1.603), (0, 1.605)]
    P.lathe(prof, (bx, 0, 0), red, segs=36)
    P.cyl(0.201, 0.201, 0.08, (bx, 1.52, 0), black, segs=36)
    P.cyl(0.201, 0.199, 0.07, (bx, 0.57, 0), black, segs=36)
    for y in (0.85, 1.2):
        P.torus(0.198, 0.0035, (bx, y, 0), black, rot=(math.pi / 2, 0, 0), n1=40, n2=4)
    P.box(0.13, 0.22, 0.012, (bx, 1.08, 0.196), mat('#F4F1EA', 0.6), 0.004)
    P.box(0.09, 0.03, 0.006, (bx, 1.08, 0.204), red, 0.002)
    # gloves on a hook
    P.rod((-0.41, 1.66, 0.0), (-0.3, 1.66, 0.0), 0.01, steel)
    glove, cuff = mat('#2F6FE0', 0.4), mat('#F4F1EA', 0.5)
    for k, z in ((0, -0.06), (1, 0.06)):
        gx, gy = -0.31, 1.36 - k * 0.04
        P.sphere(0.085, (gx, gy, z), glove, sc=(0.85, 1.2, 1.0), u=18, v=12)
        P.sphere(0.035, (gx + 0.06, gy + 0.03, z), glove, sc=(1, 1.3, 1), u=10, v=8)
        P.cyl(0.055, 0.058, 0.1, (gx, gy + 0.15, z), cuff, segs=16)
        P.sweep([V((gx, gy + 0.2, z)), V((gx + 0.005, gy + 0.26, z * 0.6)), V((-0.31, 1.66, 0.0))], 0.004, cuff, segs=5)
    return P.out()


def ropes():
    P = Parts()
    rope, tape, band, frame = mat('#2D3138', 0.85), mat('#121316', 0.7), mat('#E8E8E8', 0.6), mat('#3A3F4B', 0.45, 0.5)
    P.box(0.24, 0.18, 0.02, (0, 0.15, -0.43), frame, 0.006)
    for (x, y) in [(-0.09, 0.08), (0.09, 0.08), (-0.09, 0.22), (0.09, 0.22)]:
        P.cyl(0.012, 0.012, 0.012, (x, y, -0.418), mat('#AEB6C0', 0.3, 0.85), rot=(math.pi / 2, 0, 0), segs=8)
    P.torus(0.05, 0.011, (0, 0.15, -0.385), frame, rot=(0, math.pi / 2, 0), n1=20, n2=7)
    A = [V(p) for p in [(-2.55, 0.02, 0.42), (-2.2, 0.02, 0.5), (-1.8, 0.02, 0.28), (-1.4, 0.02, 0.12), (-1.0, 0.02, 0.28), (-0.6, 0.02, 0.06), (-0.25, 0.04, -0.16), (0, 0.11, -0.33)]]
    B = [V(p) for p in [(0, 0.11, -0.33), (0.18, 0.04, -0.1), (0.05, 0.02, 0.22), (-0.35, 0.02, 0.48), (-0.85, 0.02, 0.62), (-1.3, 0.02, 0.8), (-1.65, 0.02, 0.74)]]
    path = catmull(A + B[1:], 9)
    P.sweep(path, 0.019, rope, segs=9, ridge=0.12)
    for ends in (path[:7], list(reversed(path[-7:]))):
        hp = [p + V((0, 0.0012, 0)) for p in ends]
        P.sweep(hp, 0.0215, tape, segs=10)
        P.sweep(hp[5:7], 0.0225, band, segs=10)
    return P.out()


def gymbag():
    P = Parts()
    navy, grey, black, trim = mat('#24324A', 0.75), mat('#5A6170', 0.7), mat('#16171B', 0.6), mat('#C9CED6', 0.3, 0.8)
    cy, flat = 0.118, -0.108

    def post(c):
        y = c.y if c.y > flat else flat + (c.y - flat) * 0.12
        return V((c.x, y + cy, c.z))
    ends = [(0, -0.31), (0.1, -0.308), (0.138, -0.296), (0.155, -0.27), (0.16, -0.24)]
    P.lathe(ends, (0, 0, 0), grey, segs=28, rot=(0, 0, -math.pi / 2), sc=(0.9, 1, 0.85), post=post)
    P.lathe([(0.16, -0.24), (0.162, 0.0), (0.16, 0.24)], (0, 0, 0), navy, segs=28, rot=(0, 0, -math.pi / 2), sc=(0.9, 1, 0.85), post=post)
    P.lathe([(r, -y) for (r, y) in reversed(ends)], (0, 0, 0), grey, segs=28, rot=(0, 0, -math.pi / 2), sc=(0.9, 1, 0.85), post=post)
    top = cy + 0.146
    P.box(0.46, 0.01, 0.022, (0, top + 0.001, 0), black, 0.003)
    P.box(0.022, 0.008, 0.045, (0.17, top + 0.008, 0.02), trim, 0.002)
    P.sweep(catmull([V((-0.13, top - 0.005, 0.035)), V((-0.06, top + 0.09, 0.035)), V((0.06, top + 0.09, 0.035)), V((0.13, top - 0.005, 0.035))], 6), 0.009, black, segs=6)
    P.sweep(catmull([V((-0.13, top - 0.01, -0.035)), V((-0.06, top + 0.0, -0.13)), V((0.06, top + 0.0, -0.13)), V((0.13, top - 0.01, -0.035))], 6), 0.009, black, segs=6)
    P.box(0.09, 0.045, 0.008, (-0.05, cy + 0.02, 0.137), mat('#FFC93C', 0.5), 0.003)
    # towels, a shaker on top and a steel bottle on the floor
    P.box(0.32, 0.05, 0.24, (0.5, 0.025, 0), mat('#F2F2EE', 0.9), 0.02, segs=3)
    P.box(0.29, 0.045, 0.21, (0.51, 0.072, 0.01), mat('#2FA0A0', 0.9), 0.02, rot=(0, 0.14, 0), segs=3)
    sh = [(0, 0.0), (0.038, 0.0), (0.044, 0.008), (0.045, 0.15), (0.047, 0.152)]
    P.lathe(sh, (0.5, 0.095, 0.0), mat('#DDE3EA', 0.25), segs=20)
    P.lathe([(0.047, 0.152), (0.049, 0.18), (0.04, 0.19), (0.016, 0.198), (0, 0.199)], (0.5, 0.095, 0.0), mat('#E2544B', 0.4), segs=20)
    P.cyl(0.011, 0.013, 0.03, (0.5, 0.305, 0.0), mat('#E2544B', 0.4), segs=10)
    P.lathe([(0, 0), (0.033, 0), (0.035, 0.01), (0.035, 0.19), (0.026, 0.215), (0, 0.215)], (0.28, 0.035, 0.24), mat('#B8C2CC', 0.3, 0.7), segs=18, rot=(0, 0, -math.pi / 2))
    P.cyl(0.02, 0.02, 0.035, (0.28 + 0.232, 0.035, 0.24), black, rot=(0, 0, math.pi / 2), segs=12)
    return P.out()


# ---------------- the toilets ----------------
PORC, CHROME = mat('#F4F6F8', 0.22), mat('#C9CED6', 0.28, 0.85)


def toilet(P, x, z0):
    """close-coupled toilet with its back at z0, facing +Z"""
    bowl = [(0, 0.0), (0.13, 0.0), (0.15, 0.06), (0.16, 0.2), (0.19, 0.34), (0.2, 0.39), (0.17, 0.4), (0.0, 0.4)]
    P.lathe(bowl, (x, 0, z0 + 0.36), PORC, segs=28, sc=(1, 1, 1.32))
    P.torus(0.16, 0.022, (x, 0.415, z0 + 0.37), mat('#FFFFFF', 0.3), rot=(math.pi / 2, 0, 0), n1=28, n2=8, sc=(1, 1.3, 1))
    P.box(0.42, 0.4, 0.17, (x, 0.62, z0 + 0.1), PORC, 0.04, segs=3)
    P.box(0.44, 0.04, 0.19, (x, 0.84, z0 + 0.1), PORC, 0.015)
    P.cyl(0.03, 0.03, 0.012, (x, 0.865, z0 + 0.1), CHROME, segs=14)
    P.box(0.36, 0.42, 0.03, (x, 0.64, z0 + 0.2), mat('#FFFFFF', 0.3), 0.012, rot=(-0.12, 0, 0))   # lid up


def stalls():
    P = Parts()
    panel, door, post = mat('#C9D2DA', 0.45), mat('#2F8F8A', 0.45), mat('#5E6B76', 0.45, 0.2)
    W, D, n = 5.0, 1.52, 3
    cw = W / n; back, front = -D / 2, D / 2
    for k in range(n + 1):
        x = -W / 2 + k * cw
        P.box(0.025, 1.85, D - 0.06, (x, 0.15 + 0.925, -0.03), panel, 0.008)
        P.box(0.07, 2.05, 0.07, (x, 1.025, front - 0.035), post, 0.01)
        P.box(0.08, 0.1, 0.08, (x, 0.05, front - 0.035), CHROME, 0.01)
    P.rod((-W / 2, 2.03, front - 0.035), (W / 2, 2.03, front - 0.035), 0.018, CHROME)
    opens = [0.45, 0.0, 1.2]
    for k in range(n):
        x0 = -W / 2 + k * cw
        P.box(cw - 0.72, 1.85, 0.025, (x0 + 0.035 + (cw - 0.72) / 2, 1.075, front - 0.04), panel, 0.008)   # fixed front panel
        hx, dw, a = x0 + cw - 0.035, 0.6, opens[k]                                                        # door hinged on the right
        c = V((hx - math.cos(a) * dw / 2, 1.075, front - 0.04 - math.sin(a) * dw / 2))
        P.box(dw, 1.85, 0.03, c, door, 0.01, rot=(0, a, 0))
        hp = V((hx - math.cos(a) * (dw - 0.07), 1.05, front - 0.04 - math.sin(a) * (dw - 0.07))) + V((math.sin(a) * 0.03, 0, math.cos(a) * 0.03))
        P.box(0.03, 0.12, 0.03, hp, CHROME, 0.006, rot=(0, a, 0))
        cx0 = x0 + cw / 2
        toilet(P, cx0, back + 0.02)
        P.cyl(0.055, 0.055, 0.11, (x0 + 0.06, 0.75, back + 0.6), mat('#FFFFFF', 0.8), rot=(0, 0, math.pi / 2), segs=16)   # loo roll
        P.cyl(0.014, 0.014, 0.14, (x0 + 0.06, 0.75, back + 0.6), CHROME, rot=(0, 0, math.pi / 2), segs=8)
        P.box(0.08, 0.03, 0.03, (x0 + 0.03, 0.75, back + 0.6), CHROME, 0.005)
    return P.out()


def urinals():
    P = Parts()
    div = mat('#C9D2DA', 0.45)
    for k, x in enumerate((-1.06, 0.0, 1.06)):
        P.box(0.4, 0.66, 0.3, (x, 0.86, -0.13), PORC, 0.12, segs=4)
        P.sphere(0.15, (x, 0.66, -0.0), mat('#E3EBF0', 0.2), sc=(1, 0.45, 0.75), u=24, v=12)
        P.cyl(0.05, 0.05, 0.03, (x, 0.6, -0.06), mat('#5FB3B0', 0.6), segs=12)                      # urinal cake
        P.rod((x, 1.18, -0.24), (x, 1.5, -0.24), 0.018, CHROME)
        P.box(0.09, 0.12, 0.08, (x, 1.52, -0.22), CHROME, 0.015)
        P.rod((x, 1.5, -0.2), (x, 1.5, -0.12), 0.012, CHROME)
    for x in (-0.53, 0.53):
        P.box(0.02, 0.85, 0.55, (x, 1.05, -0.0), div, 0.01)
        P.box(0.03, 0.03, 0.55, (x, 1.48, -0.0), CHROME, 0.008)
    return P.out()


def vanity():
    P = Parts()
    stone, skirt, white = mat('#4A5560', 0.3), mat('#3A424B', 0.5), mat('#FFFFFF', 0.4)
    P.box(3.4, 0.06, 0.6, (0, 0.86, 0), stone, 0.012)
    P.box(3.4, 0.24, 0.04, (0, 0.72, 0.27), skirt, 0.008)
    for x in (-1.1, 0.0, 1.1):
        P.lathe([(0, 0.0), (0.12, 0.0), (0.19, 0.05), (0.21, 0.09), (0.215, 0.1), (0.0, 0.1)], (x, 0.8, 0.03), PORC, segs=28, sc=(1, 1, 0.7))
        P.cyl(0.165, 0.165, 0.012, (x, 0.897, 0.03), mat('#DDE6EC', 0.2), segs=28)
        P.cyl(0.02, 0.02, 0.014, (x, 0.9, 0.03), CHROME, segs=10)
        P.rod((x, 0.89, -0.21), (x, 1.07, -0.21), 0.02, CHROME)
        P.rod((x, 1.06, -0.21), (x, 1.06, -0.08), 0.016, CHROME)
        P.cyl(0.03, 0.03, 0.03, (x + 0.08, 0.92, -0.21), CHROME, segs=12)
        P.box(0.08, 0.16, 0.07, (x + 0.32, 0.98, -0.22), white, 0.015)                                # soap
        P.rod((x + 0.32, 0.96, -0.19), (x + 0.32, 0.96, -0.14), 0.008, CHROME)
    P.box(0.3, 0.36, 0.2, (-1.95, 1.25, -0.18), white, 0.04, segs=3)                                 # hand dryer
    P.box(0.16, 0.05, 0.08, (-1.95, 1.05, -0.12), CHROME, 0.012)
    P.cyl(0.17, 0.15, 0.6, (-1.95, 0.3, -0.05), mat('#8E9AA5', 0.4, 0.5), segs=24)                  # bin
    return P.out()


def wetfloor():
    P = Parts()
    yel, blk = mat('#FFC93C', 0.5), mat('#15171C', 0.6)
    for k in (-1, 1):
        rot = (-k * 0.2, 0, 0)
        c = (0, 0.32, k * 0.07)
        P.box(0.32, 0.62, 0.018, c, yel, 0.01, rot=rot)
        P.box(0.2, 0.04, 0.02, (0, 0.5, k * 0.035), blk, 0.004, rot=rot)
        P.box(0.12, 0.12, 0.02, (0, 0.3, k * 0.075), blk, 0.01, rot=(-k * 0.2, 0, 0.785))
    P.box(0.14, 0.04, 0.04, (0, 0.65, 0), yel, 0.01)
    return P.out()


MAKERS = {'vending': vending, 'bag': heavybag, 'ropes': ropes, 'gymbag': gymbag, 'stalls': stalls, 'urinals': urinals, 'vanity': vanity, 'wetfloor': wetfloor}


def make(k):
    return MAKERS[k]()


def preview(k, at=(0, 0, 0)):
    """Build one prop as its own object (for looking at it in Blender)."""
    import gclib as G
    coll = G.collection('GC_Props', clear=False)
    name = 'GCP_' + k
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    bm = bmesh.new(); mats = []
    for (m, pbm) in make(k):
        key = G.mat_key(m); mats.append(G.material(key, m))
        bmesh.ops.transform(pbm, matrix=G.C, verts=pbm.verts)
        me = bpy.data.meshes.new('t'); pbm.to_mesh(me); pbm.free()
        for f in me.polygons:
            f.material_index = len(mats) - 1
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    for f in me.polygons:
        f.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(35))
    o = bpy.data.objects.new(name, me); coll.objects.link(o); o.location = at
    me.calc_loop_triangles()
    return {'tris': len(me.loop_triangles)}
