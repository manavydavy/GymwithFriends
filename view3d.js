// 3D view for the live game. The 2D client keeps doing everything (network, controls, HUD);
// this file only draws the gym in 3D underneath the HUD canvas.
(function (out) {
  let T, G, SH, renderer, scene, camera, up, glcv, hemi, key;
  let machines = [], chars = {}, rings = {}, staff, gaz, W = 800, H = 500;
  const camPos = { x: 0, y: 12, z: 10 }, camTgt = { x: 0, y: 1, z: 0 };
  let upVisible = true, first = true, restMats = [], cone = null;

  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }

  async function init(stage, hud) {
    if (out.V3D.ready) return;
    if (!window.THREE) await load('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    if (!window.G3) await load('gym3d.js');
    if (!THREE.GLTFLoader) await load('GLTFLoader.js').catch(() => {});
    T = THREE; G = G3; SH = window.SHARED;
    renderer = new T.WebGLRenderer({ antialias: true });
    const phone = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5));
    renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = T.PCFSoftShadowMap;
    glcv = renderer.domElement;
    glcv.style.cssText = 'position:absolute;left:0;top:0;width:100%;display:block;touch-action:none;pointer-events:none';
    stage.insertBefore(glcv, hud);
    hud.style.position = 'relative'; hud.style.zIndex = '1';
    scene = new T.Scene(); scene.background = new T.Color('#1B1D22'); scene.fog = new T.Fog('#1B1D22', 30, 60);
    camera = new T.PerspectiveCamera(42, W / H, 0.1, 150);
    hemi = new T.HemisphereLight('#FFF4E2', '#3A3D46', 0.75); scene.add(hemi);
    key = new T.DirectionalLight('#FFF1DC', 0.85); key.position.set(-10, 26, 15); key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536); Object.assign(key.shadow.camera, { left: -21, right: 21, top: 15, bottom: -15, near: 1, far: 70 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; scene.add(key);
    await G.loadAssets();
    const room = G.buildRoom(scene, SH); up = room.up; restMats = room.restMats;
    const hlMat = new T.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.8, depthWrite: false });
    machines = SH.MACH.map(m => {
      const b = G.buildMachine(m, SH.GROUPS[m.g].c); (m.x >= 1900 ? up : scene).add(b.g);
      // glowing outline for machines on today's program
      const hl = new T.Group(); const w = m.w * 0.02 + 0.45, d = m.h * 0.02 + 0.45;
      [[w, 0.06, 0, -d / 2], [w, 0.06, 0, d / 2], [0.06, d, -w / 2, 0], [0.06, d, w / 2, 0]].forEach(([a, c, x, z]) => { const o = new T.Mesh(new T.BoxGeometry(a, 0.02, c), hlMat); o.position.set(x, 0.05, z); hl.add(o); });
      b.g.add(hl);
      // towel that appears when someone claims the machine
      const towel = new T.Group();
      const tw = new T.Mesh(new T.BoxGeometry(0.55, 0.04, 0.36), G.std('#FFFFFF', 0.9)); towel.add(tw);
      const stripe = new T.Mesh(new T.BoxGeometry(0.55, 0.045, 0.06), new T.MeshStandardMaterial({ color: '#3C82FF', roughness: 0.8 })); stripe.position.z = 0.12; towel.add(stripe);
      towel.position.set(0.15, 1.15, 0.1); towel.rotation.set(0.15, 0.4, 0.1); towel.visible = false; b.g.add(towel);
      return { b, m, hl, towel, stripe };
    });
    staff = G.makeChar({ col: '#3DAE5A', skin: '#DDA877', hair: '#2B1D14' }); scene.add(staff.group);
    // yellow vision cone on the floor in front of the staff member
    cone = new T.Group(); scene.add(cone);
    const fov = SH.CFG.staffFov * Math.PI / 180, R = SH.CFG.staffSight * 0.02;
    const cm = new T.Mesh(new T.CircleGeometry(R, 32, -fov / 2, fov), new T.MeshBasicMaterial({ color: '#FFD54A', transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
    cm.rotation.x = -Math.PI / 2; cm.position.y = 0.03; cone.add(cm);
    const ce = new T.Mesh(new T.RingGeometry(R - 0.08, R, 32, 1, -fov / 2, fov), new T.MeshBasicMaterial({ color: '#FFD54A', transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide }));
    ce.rotation.x = -Math.PI / 2; ce.position.y = 0.032; cone.add(ce);
    gaz = G.makeChar({ col: '#1A1A1A', skin: '#DDA877', hair: '#151515', shades: true, chain: true, scale: 1.15 });
    const gp = G.map3(SH.DESK.x + SH.DESK.w / 2 + 40, SH.DESK.y + SH.DESK.h + 32); gaz.group.position.set(gp[0], 0, gp[2]); scene.add(gaz.group);
    gaz.pose(G.POSE.stand(0, 0, { crossed: true }));
    out.V3D.ready = true;
    resize(W, H);
  }

  function resize(w, h) {
    W = w; H = h;
    if (!renderer) return;
    renderer.setSize(w, h, false); glcv.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function charFor(p) {
    let c = chars[p.id];
    if (!c) {
      c = chars[p.id] = G.makeChar({ col: p.c, skin: G.SKINS[p.id % G.SKINS.length], hair: G.HAIRS[(p.id * 7 + 3) % G.HAIRS.length] });
      scene.add(c.group);
      const track = new T.Mesh(new T.RingGeometry(0.52, 0.66, 48), new T.MeshBasicMaterial({ color: '#15171C', transparent: true, opacity: 0.55, depthWrite: false })); track.rotation.x = -Math.PI / 2;
      const ring = new T.Mesh(new T.RingGeometry(0.52, 0.66, 48, 1, Math.PI / 2, Math.PI * 2), new T.MeshBasicMaterial({ color: '#4CD964', transparent: true, depthWrite: false, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2;
      scene.add(track); scene.add(ring); rings[p.id] = { track, ring };
    }
    return c;
  }
  function dropChar(id) {
    const c = chars[id]; if (!c) return;
    c.group.parent && c.group.parent.remove(c.group); scene.remove(rings[id].track); scene.remove(rings[id].ring);
    delete chars[id]; delete rings[id];
  }
  const fatHue = f => (f >= 80 ? '#FF4D3D' : f >= 50 ? '#FF8A2B' : '#4CD964');

  // ctx: { S, myId, ME, disp, an, liftOf, jitOf, TT }
  function render(ctx) {
    if (!out.V3D.ready || !ctx.S) return;
    const { S, myId, ME, disp, an, liftOf, TT } = ctx;
    const me = S.p.find(p => p.id === myId);
    const myFloor = SH.floorOf(ME.x);
    upVisible = myFloor === 1 || !(ME.x < 760 && ME.y < 590);
    up.visible = upVisible;
    const seen = new Set();
    // machines and the people on them
    machines.forEach(({ b, m, hl, towel, stripe }, i) => {
      const st = S.m[i], user = st[0] !== null ? S.p.find(p => p.id === st[0]) : null, owner = st[1] !== null ? S.p.find(p => p.id === st[1]) : null;
      if (user) {
        const c = charFor(user); seen.add(user.id);
        if (c.group.parent !== b.g) { c.group.parent && c.group.parent.remove(c.group); b.g.add(c.group); }
        c.group.position.set(0, 0, 0); c.group.rotation.set(0, 0, 0);
        const a = an(user.id), L = liftOf(a, user);
        b.set(L, true); const P = b.pose(L); if (P) c.pose(P);
        c.setEffort(Math.max(0, L * 1.2 - 0.2)); c.setFat(user.ft);
        c.group.visible = m.x < 1900 || upVisible;
        const r = rings[user.id], wp = b.g.getWorldPosition(new T.Vector3());
        r.track.position.set(wp.x, wp.y + 0.04, wp.z); r.ring.position.set(wp.x, wp.y + 0.045, wp.z);
        const sc = Math.max(m.w, m.h) * 0.02 * 0.62 / 0.6 + 0.2; r.track.scale.setScalar(sc); r.ring.scale.setScalar(sc);
      } else b.set(0, false);
      towel.visible = !!owner; if (owner) stripe.material.color.set(owner.c);
      const gi = SH.GK.indexOf(m.g);
      const target = me && S.st === 'playing' && S.pg.includes(m.g) && me.gr[gi] < 100 && !me.pl[gi] && !user;
      hl.visible = !!target; if (target) hl.children[0].material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(TT * 4));
    });
    // everyone walking around
    S.p.forEach(p => {
      if (p.on !== null) return;
      const c = charFor(p); seen.add(p.id);
      if (c.group.parent !== scene) { c.group.parent && c.group.parent.remove(c.group); scene.add(c.group); }
      const pos = p.id === myId ? ME : disp[p.id]; if (!pos) return;
      const a = an(p.id), [x, y, z] = G.map3(pos.x, pos.y);
      const shake = p.ft >= 90 ? Math.sin(TT * 55) * 0.02 : 0;
      c.group.position.set(x + shake, y, z);
      if (p.st) { c.group.rotation.set(-1.25, -a.ang + a.spin, 0); c.group.position.y = y + 0.35; c.pose(G.POSE.stand(0, 0)); }
      else { c.group.rotation.set(0, -a.ang, 0); c.pose(G.POSE.stand(a.ph, Math.min(1, a.spd), p.lo ? { crossed: true } : null)); }
      c.setEffort(0); c.setFat(p.ft);
      c.group.visible = pos.x < 1900 || upVisible;
      const r = rings[p.id]; r.track.scale.setScalar(1); r.ring.scale.setScalar(1);
      r.track.position.set(x, y + 0.04, z); r.ring.position.set(x, y + 0.045, z);
    });
    S.p.forEach(p => {
      const r = rings[p.id]; if (!r) return;
      const vis = chars[p.id] && chars[p.id].group.visible;
      r.track.visible = r.ring.visible = !!vis;
      r.ring.geometry.setDrawRange(0, Math.floor(Math.min(p.ft, 100) / 100 * 48) * 6);
      r.ring.material.color.set(fatHue(p.ft));
      r.ring.material.opacity = p.ft >= 90 ? 0.45 + 0.55 * Math.abs(Math.sin(TT * 9)) : 1;
    });
    Object.keys(chars).forEach(id => { if (!seen.has(+id)) dropChar(+id); });
    // staff patrol
    if (S.sf) { const a = an('staff'), [x, y, z] = G.map3(S.sf[0], S.sf[1]), d = S.sf[2] || 0; staff.group.position.set(x, y, z); staff.group.rotation.y = -(d + Math.PI / 2); staff.pose(G.POSE.stand(a.ph, Math.min(1, a.spd)));
      const vis = S.sf[0] < 1900 || upVisible; staff.group.visible = vis; cone.visible = vis; cone.position.set(x, y, z); cone.rotation.y = -d; }
    // rest circles glow brighter when you need them
    const tired = me ? Math.min(1, Math.max(0, (me.ft - 40) / 50)) : 0;
    restMats.forEach((m, i) => { if (i % 2 === 0) m.opacity = 0.28 + tired * (0.22 + 0.15 * Math.sin(TT * 5)); });
    // closing time: the lights go down
    const dim = S.st === 'playing' && S.tm < 30 ? (30 - S.tm) / 30 : 0;
    hemi.intensity = 0.75 - dim * 0.35; key.intensity = 0.85 - dim * 0.4;
    // follow camera, angled like Overcooked
    const [tx, ty, tz] = G.map3(ME.x, ME.y);
    const portrait = H > W;
    const off = portrait ? [0, 11, 8] : [0, 8.2, 7.2];
    const k = first ? 1 : 0.12; first = false;
    camTgt.x += (tx - camTgt.x) * k; camTgt.y += (ty + 0.8 - camTgt.y) * k; camTgt.z += (tz - (portrait ? 1.4 : 0.6) - camTgt.z) * k;
    camera.position.set(camTgt.x + off[0], camTgt.y + off[1], camTgt.z + off[2]);
    camera.lookAt(camTgt.x, camTgt.y, camTgt.z);
    renderer.render(scene, camera);
    window.__calls = renderer.info.render.calls;
  }

  // Map position + height (metres) -> screen pixels, or null when behind the camera
  const tmp = { v: null };
  function project(x, y, h) {
    if (!camera) return null;
    const v = tmp.v || (tmp.v = new T.Vector3());
    const p = G.map3(x, y); v.set(p[0], p[1] + (h || 0), p[2]); v.project(camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }

  out.V3D = { ready: false, init, resize, render, project, upVisible: () => upVisible };
})(window);
