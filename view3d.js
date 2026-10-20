// 3D view for the live game. The 2D client keeps doing everything (network, controls, HUD);
// this file only draws the gym in 3D underneath the HUD canvas.
(function (out) {
  let T, G, SH, renderer, scene, camera, up, glcv, hemi, key;
  let machines = [], chars = {}, rings = {}, staff, gaz, W = 800, H = 500;
  const camPos = { x: 0, y: 12, z: 10 }, camTgt = { x: 0, y: 1, z: 0 };
  let shoulderOn = false, prMax = 1, prCur = 1, fpsT = 0, fpsN = 0;
  // Keep it smooth: drop the render resolution a notch when frames get slow, raise it again when there's headroom
  function adapt(dt) {
    fpsT += dt; fpsN++;
    if (fpsT < 2) return;
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    const next = fps < 40 ? Math.max(0.6, prCur - 0.15) : fps > 57 ? Math.min(prMax, prCur + 0.1) : prCur;
    if (Math.abs(next - prCur) > 0.01) { prCur = next; renderer.setPixelRatio(prCur); resize(W, H); }
  }
  // Over-the-shoulder camera (phones): how far back the camera can sit without ending up inside a wall
  function boomLength(ME, yaw, max) {
    const fl = SH.FLOORS[SH.floorOf(ME.x)], fx = Math.cos(yaw), fy = Math.sin(yaw);
    for (let d = 0.3; d <= max + 1e-6; d += 0.3) {
      const mx = ME.x - fx * d / 0.02, my = ME.y - fy * d / 0.02;
      if (mx < fl.x + 8 || mx > fl.x + fl.w - 8 || my < fl.y + 8 || my > fl.y + fl.h - 8 ||
        SH.WALLS.some(w => (w.t === 'wall' || w.t === 'lockers') && SH.inRect(mx, my, w))) return Math.max(0.6, d - 0.3);
    }
    return max;
  }
  let upVisible = true, first = true, restMats = [], cone = null, puffTex = null, goldFx = null, goldArrow = null;
  const puffs = [], pool = [];
  function puff(pos, vel, o) {
    let s = pool.pop();
    if (!s) { s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); s.renderOrder = 5; }
    setCol(s.material.color, o.col); s.position.copy(pos); s.visible = true; scene.add(s);
    puffs.push({ s, v: vel, life: o.life, max: o.life, a: o.a, r0: o.r0, r1: o.r1, drag: o.drag || 0, rise: o.rise || 0 });
  }
  function stepPuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); pool.push(p.s); puffs.splice(i, 1); continue; }
      const t = 1 - p.life / p.max;
      p.v.multiplyScalar(Math.pow(p.drag || 1, dt)); p.v.y += p.rise * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.r0 + (p.r1 - p.r0) * t);
      p.s.material.opacity = p.a * (1 - t) * Math.min(1, t * 6);
    }
  }
  const V = () => new T.Vector3();

  // Realistic look: proper colour pipeline (sRGB + filmic tone mapping) and reflections from a soft studio-style
  // environment, so chrome, mirrors and plates actually shine. ?look=old turns it off.
  const REAL = !(typeof location !== 'undefined' && /[?&]look=old/.test(location.search));
  function linearize(root) {
    if (!REAL) return;
    root.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => {
        if (m.userData.lin) return; m.userData.lin = 1;
        if (m.color) m.color.convertSRGBToLinear();
        if (m.emissive) m.emissive.convertSRGBToLinear();
        ['map', 'emissiveMap'].forEach(k => { if (m[k]) { m[k].encoding = T.sRGBEncoding; m[k].needsUpdate = true; } });
        m.needsUpdate = true;
      });
    });
  }
  const setCol = (c, hex) => { c.set(hex); if (REAL) c.convertSRGBToLinear(); return c; };
  function studio() {
    // a big soft-lit room: grey walls, bright ceiling panels, a warm window strip
    const e = new T.Scene(), g = new T.BoxGeometry(1, 1, 1);
    const room = new T.Mesh(g, new T.MeshBasicMaterial({ color: new T.Color(0.32, 0.31, 0.3), side: T.BackSide })); room.scale.set(40, 12, 30); room.position.y = 5; e.add(room);
    const floor = new T.Mesh(g, new T.MeshBasicMaterial({ color: new T.Color(0.08, 0.085, 0.1) })); floor.scale.set(40, 0.1, 30); floor.position.y = -0.95; e.add(floor);
    const lamp = new T.MeshBasicMaterial({ color: new T.Color(5, 4.8, 4.4) });
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const l = new T.Mesh(g, lamp); l.scale.set(4, 0.1, 1.2); l.position.set(i * 8, 10.9, j * 8); e.add(l); }
    const win = new T.Mesh(g, new T.MeshBasicMaterial({ color: new T.Color(3, 2.8, 2.4) })); win.scale.set(0.1, 3, 22); win.position.set(19.9, 6, 0); e.add(win);
    return e;
  }

  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }

  async function init(stage, hud) {
    if (out.V3D.ready) return;
    if (!window.THREE) await load('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    if (!window.G3) await load('gym3d.js');
    if (!THREE.GLTFLoader) await load('GLTFLoader.js').catch(() => {});
    if (!THREE.DRACOLoader) await load('DRACOLoader.js').catch(() => {});
    T = THREE; G = G3; SH = window.SHARED;
    renderer = new T.WebGLRenderer({ antialias: true });
    const phone = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    prMax = prCur = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5);
    renderer.setPixelRatio(prCur);
    renderer.shadowMap.enabled = !phone; renderer.shadowMap.type = T.PCFSoftShadowMap;
    if (REAL) { renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }
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
    if (REAL) G.LINEAR = true;   // models load their baked colours in linear space
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
    // puff sprites: steam out of the ears when fatigue is maxed, dust when sprinting
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const gx = cv.getContext('2d'), gr = gx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    puffTex = new T.CanvasTexture(cv);
    // golden machine: a column of light, a spinning gold coin and a ring on the floor
    goldFx = new T.Group(); goldFx.visible = false; scene.add(goldFx);
    const beam = new T.Mesh(new T.CylinderGeometry(0.75, 1.0, 6, 24, 1, true), new T.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    beam.position.y = 3; goldFx.add(beam);
    const coin = new T.Group(); coin.position.y = 3.2; goldFx.add(coin); goldFx.userData.coin = coin;
    const goldM = new T.MeshStandardMaterial({ color: '#FFC93C', metalness: 0.6, roughness: 0.25, emissive: '#7A5200', emissiveIntensity: 0.6 });
    const cmesh = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.07, 32), goldM); cmesh.rotation.x = Math.PI / 2; coin.add(cmesh);
    const rim = new T.Mesh(new T.TorusGeometry(0.34, 0.035, 8, 32), goldM); coin.add(rim);
    const gring = new T.Mesh(new T.RingGeometry(1.15, 1.35, 48), new T.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
    gring.rotation.x = -Math.PI / 2; gring.position.y = 0.05; goldFx.add(gring); goldFx.userData.ring = gring;
    // big gold arrow on the floor around you, pointing the way to the golden machine
    const sh = new T.Shape(); sh.moveTo(0.75, 0); sh.lineTo(0.05, 0.5); sh.lineTo(0.05, 0.2); sh.lineTo(-0.55, 0.2); sh.lineTo(-0.55, -0.2); sh.lineTo(0.05, -0.2); sh.lineTo(0.05, -0.5); sh.closePath();
    goldArrow = new T.Group(); goldArrow.visible = false; scene.add(goldArrow);
    const ga = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }));
    const gb = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: '#3A2A00', transparent: true, opacity: 0.6, depthWrite: false, side: T.DoubleSide }));
    [gb, ga].forEach((m, i) => { m.rotation.x = -Math.PI / 2; m.position.y = 0.06 + i * 0.01; m.renderOrder = 6 + i; goldArrow.add(m); });
    gb.scale.setScalar(1.15); gb.position.x = -0.04;
    if (REAL) {
      out.G3.LINEAR = true;
      scene.background.convertSRGBToLinear(); scene.fog.color.convertSRGBToLinear();
      const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(studio(), 0.04).texture; pm.dispose();
      hemi.intensity = 0.42; key.intensity = 1.25;
      linearize(scene);
    }
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
      linearize(c.group); linearize(track); linearize(ring);
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
    let camMap = null;
    if (ctx.cam) { const portrait = H > W, b = boomLength(ME, ctx.cam.yaw, portrait ? 4.2 : 4.0); camMap = { b, x: ME.x - Math.cos(ctx.cam.yaw) * b / 0.02, y: ME.y - Math.sin(ctx.cam.yaw) * b / 0.02 }; }
    // the mezzanine hides while you're underneath it, but stays put while you're high up the stairs (no pop on arrival)
    upVisible = myFloor === 1 || G.heightAt(ME.x, ME.y) > 2.4 || !((ME.x < 760 && ME.y < 590) || (camMap && camMap.x < 760 && camMap.y < 590));
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
      towel.visible = !!owner; if (owner) setCol(stripe.material.color, owner.c);
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
      const a = an(p.id), w0 = G.map3(pos.x, pos.y), v = ctx.vo && ctx.vo(pos);
      const x = w0[0] + (v ? v.x : 0), y = w0[1] + (v ? v.y : 0), z = w0[2] + (v ? v.z : 0);
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
      setCol(r.ring.material.color, fatHue(p.ft));
      r.ring.material.opacity = p.ft >= 90 ? 0.45 + 0.55 * Math.abs(Math.sin(TT * 9)) : 1;
    });
    Object.keys(chars).forEach(id => { if (!seen.has(+id)) dropChar(+id); });
    // steam from the ears at max fatigue, dust from sprinting feet
    const dt = Math.min(0.05, ctx.dt || 0.016);
    S.p.forEach(p => {
      const c = chars[p.id]; if (!c || !c.group.visible) return;
      const spr = p.id === myId ? ME.spr : p.sp;
      if (p.ft >= 95) for (let n = Math.floor(dt * 40 + Math.random()); n > 0; n--) {
        c.group.updateMatrixWorld(true);
        const head = c.parts.head, k = Math.random() < 0.5 ? -1 : 1;
        const ear = head.localToWorld(V().set(k * 0.24, -0.01, 0)), side = head.localToWorld(V().set(k, 0, 0)).sub(head.localToWorld(V())).normalize();
        puff(ear, side.multiplyScalar(0.9 + Math.random() * 0.5).add(V().set(0, 0.45, 0)), { col: '#F2F6FA', life: 1.1, a: 1, r0: 0.12, r1: 0.6, drag: 0.2, rise: 0.8 });
      }
      if (spr && p.on === null && Math.random() < dt * 22) {
        const g = c.group.position;
        puff(V().set(g.x + (Math.random() - 0.5) * 0.3, g.y + 0.08, g.z + (Math.random() - 0.5) * 0.3), V().set((Math.random() - 0.5) * 0.4, 0.35, (Math.random() - 0.5) * 0.4), { col: '#B8AD9C', life: 0.55, a: 0.55, r0: 0.12, r1: 0.4, drag: 0.3 });
      }
    });
    stepPuffs(dt); adapt(dt);
    if (goldArrow) {
      const g = ctx.GA;
      goldArrow.visible = !!g;
      if (g) {
        const [x, y, z] = G.map3(ME.x, ME.y), r = 1.45 + 0.08 * Math.sin(TT * 6);
        goldArrow.position.set(x + Math.cos(g.a) * r, y, z + Math.sin(g.a) * r);
        goldArrow.rotation.y = -g.a; goldArrow.scale.setScalar(1 + 0.08 * Math.sin(TT * 6));
      }
    }
    // golden machine marker
    if (goldFx) {
      const gi = S.st === 'playing' && S.gm >= 0 ? S.gm : -1;
      goldFx.visible = gi >= 0 && (SH.MACH[gi].x < 1900 || upVisible);
      if (goldFx.visible) {
        const p = machines[gi].b.g.getWorldPosition(V());
        goldFx.position.copy(p);
        goldFx.userData.coin.rotation.y = TT * 2.2; goldFx.userData.coin.position.y = 3.2 + Math.sin(TT * 3) * 0.12;
        const k = 1 + 0.08 * Math.sin(TT * 5); goldFx.userData.ring.scale.set(k, k, k);
      }
    }
    // staff patrol
    if (S.sf) { const a = an('staff'), [x, y, z] = G.map3(S.sf[0], S.sf[1]), d = S.sf[2] || 0; staff.group.position.set(x, y, z); staff.group.rotation.y = -(d + Math.PI / 2); staff.pose(G.POSE.stand(a.ph, Math.min(1, a.spd)));
      const vis = S.sf[0] < 1900 || upVisible; staff.group.visible = vis; cone.visible = vis; cone.position.set(x, y, z); cone.rotation.y = -d; }
    // rest circles glow brighter when you need them
    const tired = me ? Math.min(1, Math.max(0, (me.ft - 40) / 50)) : 0;
    restMats.forEach((m, i) => { if (i % 2 === 0) m.opacity = 0.28 + tired * (0.22 + 0.15 * Math.sin(TT * 5)); });
    // closing time: the lights go down
    const dim = S.st === 'playing' && S.tm < 20 ? (20 - S.tm) / 20 : 0;
    if (REAL) renderer.toneMappingExposure = 1.15 * (1 - dim * 0.45);
    else { hemi.intensity = 0.75 - dim * 0.35; key.intensity = 0.85 - dim * 0.4; }
    // follow camera, angled like Overcooked
    const tw = G.map3(ME.x, ME.y), mv = ctx.vo && ctx.vo(ME);
    const tx = tw[0] + (mv ? mv.x : 0), ty = tw[1] + (mv ? mv.y : 0), tz = tw[2] + (mv ? mv.z : 0);
    const portrait = H > W;
    if (ctx.cam) {
      // phones: behind and above your shoulder, wider lens, looking a little ahead of you
      const yaw = ctx.cam.yaw, fx = Math.cos(yaw), fz = Math.sin(yaw), fov = portrait ? 70 : 60;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const maxB = portrait ? 4.2 : 4.0, back = camMap.b, hgt = (portrait ? 3.9 : 3.3) + (maxB - back) * 0.45, ahead = (portrait ? 1.3 : 1.6) * back / maxB;
      const k = first || !shoulderOn ? 1 : 0.18; first = false; shoulderOn = true;
      camPos.x += (tx - fx * back - camPos.x) * k; camPos.y += (ty + hgt - camPos.y) * k; camPos.z += (tz - fz * back - camPos.z) * k;
      camTgt.x += (tx + fx * ahead - camTgt.x) * k; camTgt.y += (ty + 0.8 - camTgt.y) * k; camTgt.z += (tz + fz * ahead - camTgt.z) * k;
      camera.position.set(camPos.x, camPos.y, camPos.z);
      camera.lookAt(camTgt.x, camTgt.y, camTgt.z);
      renderer.render(scene, camera);
      window.__calls = renderer.info.render.calls;
      return;
    }
    if (shoulderOn) { shoulderOn = false; camera.fov = 42; camera.updateProjectionMatrix(); }
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
