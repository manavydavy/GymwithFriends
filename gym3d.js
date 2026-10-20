// Gym Colonisers 3D asset library (three.js r128).
// Everything is built from simple shapes in code: no model files to download.
// Units are metres. Layout matches the 2D game map: X = right, Z = towards the front of the gym.
(function (out) {
  const T = THREE, V3 = T.Vector3, UP = new V3(0, 1, 0);
  const SCALE = 0.02; // 2D map pixels -> metres
  const toWorld = (x, y) => [((x >= 1900 ? x - 2000 : x) - 900) * SCALE, (y - 550) * SCALE];

  // ---------- materials ----------
  const matCache = {};
  function std(color, rough, metal, extra) {
    const k = color + '|' + rough + '|' + metal + (extra ? JSON.stringify(extra) : '');
    if (!matCache[k]) matCache[k] = new T.MeshStandardMaterial(Object.assign({ color, roughness: rough == null ? 0.75 : rough, metalness: metal || 0, flatShading: true }, extra || {}));
    return matCache[k];
  }
  const M = {
    steel: () => std('#CBD2DC', 0.32, 0.75), chrome: () => std('#E6EBF2', 0.18, 0.9), steelDark: () => std('#5C6370', 0.45, 0.6),
    frame: () => std('#2B2F38', 0.55, 0.35), paint: () => std('#F07A3A', 0.5, 0.15), paintDark: () => std('#C95A22', 0.55, 0.1),
    pad: () => std('#2E3445', 0.8), padTop: () => std('#3A4257', 0.75), iron: () => std('#3A3E47', 0.55, 0.45), rubber: () => std('#1F2228', 0.95),
    white: () => std('#F4F1EA', 0.6), black: () => std('#141518', 0.6), wood: () => std('#C88F55', 0.7), woodDark: () => std('#8A5A30', 0.75)
  };

  // ---------- geometry helpers ----------
  const geoCache = {};
  const geo = (k, make) => geoCache[k] || (geoCache[k] = make());
  const boxG = (w, h, d) => geo('b' + w + ',' + h + ',' + d, () => new T.BoxGeometry(w, h, d));
  const cylG = (rt, rb, h, s) => geo('c' + rt + ',' + rb + ',' + h + ',' + (s || 12), () => new T.CylinderGeometry(rt, rb, h, s || 12));
  const sphG = (r, s) => geo('s' + r + ',' + (s || 12), () => new T.SphereGeometry(r, s || 12, Math.max(6, ((s || 12) * 0.75) | 0)));
  function mesh(g, m, parent, pos, rot, sc) {
    const o = new T.Mesh(g, m);
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    if (sc) o.scale.set(sc[0], sc[1], sc[2]);
    o.castShadow = true; o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  const box = (w, h, d, m, p, pos, rot) => mesh(boxG(w, h, d), m, p, pos, rot);
  const group = (p, pos, rot) => { const g = new T.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); if (p) p.add(g); return g; };
  const v = a => (a.isVector3 ? a : new V3(a[0], a[1], a[2]));
  // Place a unit-height mesh (along Y) between two points
  function span(o, a, b) {
    a = v(a); b = v(b);
    const d = b.clone().sub(a), L = d.length() || 1e-4;
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
    o.scale.set(1, L, 1);
    return o;
  }
  const tube = (a, b, r, m, p) => span(mesh(cylG(r, r, 1, 10), m || M.steel(), p), a, b);
  const sq = (a, b, s, m, p) => span(mesh(boxG(s, 1, s), m || M.frame(), p), a, b);
  function pad(w, h, d, p, pos, rot, m) {
    const g = group(p, pos, rot);
    mesh(boxG(w, h, d), m || M.pad(), g);
    mesh(boxG(w * 0.92, 0.012, d * 0.86), M.padTop(), g, [0, h / 2 + 0.004, 0]);
    return g;
  }
  // Weight plate, axis along X
  function plate(r, t, color, p, x) {
    const g = group(p, [x || 0, 0, 0]);
    mesh(cylG(r, r, t, 22), std(color, 0.6, 0.05), g, null, [0, 0, Math.PI / 2]);
    mesh(cylG(r * 0.82, r * 0.82, t * 1.06, 22), std(color, 0.45, 0.1), g, null, [0, 0, Math.PI / 2]);
    mesh(cylG(r * 0.2, r * 0.2, t * 1.15, 12), M.chrome(), g, null, [0, 0, Math.PI / 2]);
    return g;
  }
  // Barbell along X. plates: list of [radius, thickness]
  function barbell(len, plates, color, p) {
    const g = group(p);
    mesh(cylG(0.014, 0.014, len - 0.8, 10), M.steel(), g, null, [0, 0, Math.PI / 2]);
    [-1, 1].forEach(k => {
      mesh(cylG(0.026, 0.026, 0.42, 12), M.chrome(), g, [k * (len / 2 - 0.21), 0, 0], [0, 0, Math.PI / 2]);
      mesh(cylG(0.045, 0.045, 0.03, 12), M.steel(), g, [k * (len / 2 - 0.43), 0, 0], [0, 0, Math.PI / 2]);
      let x = len / 2 - 0.39;
      plates.forEach(([r, t]) => { plate(r, t, color, g, k * (x + t / 2)); x += t + 0.004; });
      mesh(cylG(0.035, 0.035, 0.03, 10), M.steelDark(), g, [k * (x + 0.02), 0, 0], [0, 0, Math.PI / 2]);
    });
    return g;
  }
  // Hex dumbbell, handle along X
  function dumbbell(size, color, p) {
    const g = group(p), r = 0.06 + size * 0.035, w = 0.06 + size * 0.04;
    mesh(cylG(0.016, 0.016, 0.16, 8), M.steel(), g, null, [0, 0, Math.PI / 2]);
    [-1, 1].forEach(k => {
      mesh(cylG(r, r, w, 6), M.iron(), g, [k * (0.08 + w / 2), 0, 0], [0, 0, Math.PI / 2]);
      mesh(cylG(r * 1.01, r * 1.01, 0.014, 6), std(color, 0.5), g, [k * (0.08 + w * 0.3), 0, 0], [0, 0, Math.PI / 2]);
    });
    return g;
  }
  function pulley(p, pos, axis) {
    const g = group(p, pos);
    mesh(cylG(0.06, 0.06, 0.03, 16), M.steelDark(), g, null, axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
    mesh(cylG(0.02, 0.02, 0.045, 8), M.chrome(), g, null, axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
    return g;
  }
  // Cable that can be re-stretched every frame
  function cable(p) { const o = mesh(cylG(0.006, 0.006, 1, 5), M.black(), p); o.castShadow = false; return { o, set(a, b) { span(o, a, b); } }; }
  // Selectorised weight stack. set(L) lifts the top plates.
  function stack(p, pos, groupColor, h) {
    h = h || 2.0;
    const g = group(p, pos);
    sq([-0.24, 0, 0], [-0.24, h, 0], 0.07, M.paint(), g); sq([0.24, 0, 0], [0.24, h, 0], 0.07, M.paint(), g);
    sq([-0.27, h, 0], [0.27, h, 0], 0.08, M.paint(), g);
    box(0.62, 0.05, 0.3, M.frame(), g, [0, 0.025, 0]);
    tube([-0.1, 0.05, 0], [-0.1, h - 0.05, 0], 0.012, M.chrome(), g); tube([0.1, 0.05, 0], [0.1, h - 0.05, 0], 0.012, M.chrome(), g);
    for (let i = 0; i < 8; i++) box(0.34, 0.034, 0.18, M.iron(), g, [0, 0.08 + i * 0.038, 0]);
    const top = group(g);
    for (let i = 0; i < 4; i++) box(0.34, 0.034, 0.18, M.iron(), top, [0, 0.4 + i * 0.038, 0]);
    box(0.36, 0.03, 0.2, std(groupColor, 0.5), top, [0, 0.56, 0]);
    tube([0, 0.56, 0], [0, 0.85, 0], 0.012, M.chrome(), top);
    mesh(cylG(0.012, 0.012, 0.22, 8), std('#E2544B', 0.5), g, [0.12, 0.2, 0.0], [0, 0, Math.PI / 2]);
    // shroud panel so it reads as a gym machine
    box(0.03, h * 0.75, 0.32, M.paintDark(), g, [-0.27, h * 0.45, 0]);
    pulley(g, [0, h - 0.06, 0], 'x');
    return { g, top, set(L) { top.position.y = L * 0.32; }, topWorld: () => g.localToWorld(new V3(0, 0.87 + top.position.y, 0)) };
  }
  // Rubber floor mat that every machine sits on
  function footprint(p, w, d) {
    const m = mesh(boxG(w + 0.16, 0.03, d + 0.16), M.rubber(), p, [0, 0.015, 0]);
    m.castShadow = false;
    return m;
  }
  // Canvas texture with text (signs, posters)
  function textTex(lines, o) {
    o = Object.assign({ w: 512, h: 256, bg: '#15171C', fg: '#FFC93C', font: 'Impact, "Arial Black", sans-serif', size: 90, border: null }, o || {});
    const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h;
    const x = cv.getContext('2d');
    if (o.bg !== 'none') { x.fillStyle = o.bg; x.fillRect(0, 0, o.w, o.h); }
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = 14; x.strokeRect(10, 10, o.w - 20, o.h - 20); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const s = (l.size || o.size); x.font = (l.weight || '900') + ' ' + s + 'px ' + o.font; x.fillStyle = l.c || o.fg;
      const y = o.h / 2 + (i - (lines.length - 1) / 2) * (s * 1.08);
      x.fillText(l.t, o.w / 2, y, o.w - 40);
    });
    const t = new T.CanvasTexture(cv); t.anisotropy = 4; return t;
  }
  function sign(p, lines, w, h, pos, rot, o, emissive) {
    const tex = textTex(lines, Object.assign({ w: Math.round(512 * w / h) > 1024 ? 1024 : Math.round(256 * w / h) * 2, h: 512 }, o));
    const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: emissive ? new T.Color('#ffffff') : new T.Color('#000000'), emissiveMap: emissive ? tex : null, emissiveIntensity: emissive ? 0.6 : 0 });
    const s = mesh(new T.PlaneGeometry(w, h), m, p, pos, rot); s.castShadow = false;
    return s;
  }

  // ---------- characters ----------
  // Chunky friendslop gym bro with a posable skeleton (two-bone IK for arms and legs).
  const SKINS = ['#F2C79B', '#DDA877', '#B9825A', '#8C5A3C', '#F5D3B3'];
  const HAIRS = ['#2B1D14', '#5A3A22', '#C9A15A', '#151515', '#7A2E1F', '#D8D8D8'];
  let torsoGeo = null;
  function getTorso() {
    if (torsoGeo) return torsoGeo;
    const pts = [[0, 0], [0.16, 0.0], [0.175, 0.12], [0.165, 0.32], [0.2, 0.55], [0.265, 0.78], [0.27, 0.88], [0.22, 0.97], [0.1, 1.0], [0, 1.0]].map(([r, y]) => new T.Vector2(r, y));
    torsoGeo = new T.LatheGeometry(pts, 14); torsoGeo.scale(1, 1, 0.68);
    return torsoGeo;
  }
  function ik(A, Tg, l1, l2, pole) {
    const d = Tg.clone().sub(A), dir = d.clone().normalize();
    let L = Math.min(Math.max(d.length(), Math.abs(l1 - l2) + 0.02), l1 + l2 - 0.002);
    const T2 = A.clone().add(dir.clone().multiplyScalar(L));
    const ca = (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), along = l1 * ca, h = l1 * Math.sqrt(Math.max(0, 1 - ca * ca));
    let pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pd.lengthSq() < 1e-6) pd = Math.abs(dir.y) < 0.9 ? new V3(0, 1, 0) : new V3(0, 0, 1);
    pd.normalize();
    return [A.clone().add(dir.multiplyScalar(along)).add(pd.multiplyScalar(h)), T2];
  }
  function makeChar(o) {
    o = Object.assign({ col: '#3C82FF', skin: SKINS[0], hair: HAIRS[0], shorts: '#2C3140', scale: 1 }, o || {});
    const root = new T.Group(); root.scale.setScalar(o.scale);
    const skinM = new T.MeshStandardMaterial({ color: o.skin, roughness: 0.8, flatShading: true });
    const faceM = new T.MeshStandardMaterial({ color: o.skin, roughness: 0.8, flatShading: true });
    const shirtM = new T.MeshStandardMaterial({ color: o.col, roughness: 0.75, flatShading: true });
    const shortsM = std(o.shorts, 0.85), hairM = std(o.hair, 0.95), darkM = std('#16171B', 0.6), whiteM = std('#FFFFFF', 0.35);
    const P = {};
    P.torso = mesh(getTorso(), shirtM, root);
    P.shorts = mesh(cylG(0.17, 0.2, 0.2, 12), shortsM, root);
    P.neck = mesh(cylG(0.075, 0.085, 1, 10), skinM, root);
    // head
    const H = P.head = group(root);
    const skull = mesh(sphG(0.21, 16), faceM, H, null, null, [1, 1.05, 1]);
    mesh(new T.SphereGeometry(0.218, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM, H, [0, 0.01, 0.02], [0.35, 0, 0]);
    [-1, 1].forEach(k => mesh(sphG(0.05, 8), faceM, H, [k * 0.205, -0.01, 0.01], null, [0.55, 1, 0.8]));
    P.band = mesh(new T.TorusGeometry(0.212, 0.028, 6, 22), shirtM, H, [0, 0.06, 0], [Math.PI / 2 - 0.12, 0, 0]);
    P.eyes = [-1, 1].map(k => {
      const e = group(H, [k * 0.075, 0.015, -0.178]);
      mesh(sphG(0.046, 10), whiteM, e, null, null, [1, 1.1, 0.55]);
      mesh(sphG(0.024, 8), darkM, e, [0, -0.004, -0.02]);
      return e;
    });
    P.brows = [-1, 1].map(k => box(0.075, 0.02, 0.025, hairM, H, [k * 0.075, 0.085, -0.19], [0, 0, k * -0.18]));
    mesh(sphG(0.038, 8), faceM, H, [0, -0.035, -0.208]);
    P.mouth = box(0.085, 0.018, 0.02, darkM, H, [0, -0.105, -0.183]);
    if (o.shades) { box(0.21, 0.055, 0.03, darkM, H, [0, 0.02, -0.205]); }
    if (o.chain) mesh(new T.TorusGeometry(0.11, 0.012, 6, 18), std('#E6B422', 0.25, 0.9), root).name = 'chain';
    P.chain = root.getObjectByName('chain');
    // limbs
    const limb = (rt, rb, m) => mesh(cylG(rt, rb, 1, 10), m, root);
    P.arm = [-1, 1].map(() => ({ cap: mesh(sphG(0.105, 10), skinM, root), up: limb(0.088, 0.068, skinM), el: mesh(sphG(0.07, 8), skinM, root), fo: limb(0.07, 0.056, skinM), hand: mesh(sphG(0.074, 10), skinM, root) }));
    P.leg = [-1, 1].map(() => {
      const shoe = group(root);
      box(0.13, 0.09, 0.27, std('#F3F3F3', 0.55), shoe, [0, 0, 0]);
      box(0.14, 0.03, 0.285, std(o.col, 0.6), shoe, [0, -0.045, 0]);
      box(0.1, 0.02, 0.06, std('#C9CED6', 0.6), shoe, [0, 0.05, -0.06]);
      return { th: limb(0.11, 0.085, skinM), sh: limb(0.125, 0.115, shortsM), kn: mesh(sphG(0.084, 8), skinM, root), shin: limb(0.08, 0.06, skinM), shoe };
    });
    upgradeChar(root);
    const tmp = new T.Matrix4(), q = new T.Quaternion();
    let effort = 0, fat = 0;
    const api = {
      group: root, parts: P,
      pose(p) {
        const pelvis = v(p.pelvis), chest = v(p.chest);
        const up = chest.clone().sub(pelvis); const len = up.length(); up.normalize();
        const front = v(p.front || [0, 0, -1]).clone(); front.sub(up.clone().multiplyScalar(front.dot(up))).normalize();
        const right = new V3().crossVectors(front, up).normalize(), back = front.clone().negate();
        q.setFromRotationMatrix(tmp.makeBasis(right, up, back));
        // index 0 is always the character's own left side, whichever way they face
        const swapped = a => a && v(a[0]).clone().sub(v(a[1])).dot(right) > 0;
        const pair = a => Array.isArray(a) && Array.isArray(a[0]);
        let hands = p.hands, eP = p.elbowPole, feet = p.feet, kP = p.kneePole, fF = p.footFront;
        if (swapped(hands)) { hands = [hands[1], hands[0]]; if (eP) eP = [eP[1], eP[0]]; }
        if (swapped(feet)) { feet = [feet[1], feet[0]]; if (kP) kP = [kP[1], kP[0]]; if (pair(fF)) fF = [fF[1], fF[0]]; }
        P.torso.position.copy(pelvis); P.torso.quaternion.copy(q); P.torso.scale.set(1, len, 1);
        P.shorts.position.copy(pelvis).add(up.clone().multiplyScalar(0.06)); P.shorts.quaternion.copy(q);
        const neckA = chest.clone().sub(up.clone().multiplyScalar(0.03)), neckB = chest.clone().add(up.clone().multiplyScalar(0.09));
        span(P.neck, neckA, neckB);
        // head looks along headFront (default: torso front), stays fairly upright
        const hf = v(p.headFront || front).clone().normalize();
        let hu = up.clone().lerp(UP, p.lying ? 0 : 0.4).normalize(); hf.sub(hu.clone().multiplyScalar(hf.dot(hu))).normalize();
        const hr = new V3().crossVectors(hf, hu).normalize();
        P.head.quaternion.setFromRotationMatrix(tmp.makeBasis(hr, hu, hf.clone().negate()));
        P.head.position.copy(neckB).add(hu.clone().multiplyScalar(0.17));
        if (P.chain) { P.chain.position.copy(chest).add(front.clone().multiplyScalar(0.05)).sub(up.clone().multiplyScalar(0.06)); P.chain.quaternion.copy(q); P.chain.rotateX(Math.PI / 2 + 0.5); }
        // arms
        [-1, 1].forEach((k, i) => {
          const S = chest.clone().sub(up.clone().multiplyScalar(0.08)).add(right.clone().multiplyScalar(k * 0.245));
          const hand = hands ? v(hands[i]) : S.clone().add(new V3(k * 0.06, -0.55, 0.02));
          const pole = eP ? v(eP[i]) : back.clone().add(right.clone().multiplyScalar(k * 0.6)).add(new V3(0, -0.3, 0));
          const [E, Hd] = ik(S, hand, 0.3, 0.28, pole);
          const A = P.arm[i];
          A.cap.position.copy(S); span(A.up, S, E); A.el.position.copy(E); span(A.fo, E, Hd); A.hand.position.copy(Hd);
        });
        // legs
        [-1, 1].forEach((k, i) => {
          const Hp = pelvis.clone().add(up.clone().multiplyScalar(0.03)).add(right.clone().multiplyScalar(k * 0.1));
          const foot = feet ? v(feet[i]) : Hp.clone().add(new V3(0, -0.82, 0));
          const pole = kP ? v(kP[i]) : front.clone().add(right.clone().multiplyScalar(k * 0.2));
          const [K, F] = ik(Hp, foot, 0.42, 0.42, pole);
          const Lg = P.leg[i];
          span(Lg.th, Hp, K); span(Lg.sh, Hp, Hp.clone().lerp(K, 0.45)); Lg.kn.position.copy(K); span(Lg.shin, K, F);
          let ff = v(fF ? (pair(fF) ? fF[i] : fF) : front).clone(); ff.y = 0; if (ff.lengthSq() < 1e-4) ff.set(0, 0, -1); ff.normalize();
          Lg.shoe.position.copy(F).add(ff.clone().multiplyScalar(0.06)).add(new V3(0, -0.02, 0));
          Lg.shoe.rotation.set(0, Math.atan2(-ff.x, -ff.z), 0);
        });
      },
      // Strain on the face during a rep (0..1)
      setEffort(e) {
        effort = e;
        P.eyes.forEach(x => x.scale.set(1, 1 - e * 0.65, 1));
        P.brows.forEach((b, i) => { b.position.y = 0.085 - e * 0.025; b.rotation.z = (i ? -1 : 1) * (0.18 + e * 0.25); });
        P.mouth.scale.set(1 - e * 0.2, 1 + e * 3.2, 1);
      },
      // Fatigue 0..100: face goes red and puffs up
      setFat(f) {
        fat = f; const t = Math.max(0, Math.min(1, (f - 40) / 55));
        faceM.color.set(o.skin).lerp(new T.Color('#E8402F'), t * 0.85); if (out.G3.LINEAR) faceM.color.convertSRGBToLinear();
        P.head.scale.setScalar(1 + t * 0.1);
      },
      setColour(c) { shirtM.color.set(c); if (out.G3.LINEAR) shirtM.color.convertSRGBToLinear(); }
    };
    return api;
  }
  // Swap each body part's shape for the smoother Blender one (same size and frame; colours stay the game's own)
  let CHARMAP = null;
  function upgradeChar(root) {
    const src = ASSETS.char;
    if (!src || !CHARMAP) return;
    root.traverse(o => {
      if (!o.isMesh) return;
      const n = CHARMAP[o.geometry.type + JSON.stringify(o.geometry.parameters)];
      const node = n && src.getObjectByName(n);
      let g = null; if (node) node.traverse(x => { if (!g && x.isMesh) g = x.geometry; });
      if (!g) return;
      o.geometry = g;
      if (o.material.flatShading) { o.material.flatShading = false; o.material.needsUpdate = true; } // in place: setFat() recolours this material
    });
  }
  // Ready-made poses
  const POSE = {
    stand(ph, spd, opts) {
      spd = spd || 0; const s = Math.sin(ph || 0) * spd, b = Math.abs(Math.sin(ph || 0)) * spd;
      const crossed = opts && opts.crossed;
      if (opts && opts.cheer !== undefined) {       // arms up, pumping (match winner)
        const t = opts.cheer, up = 0.5 + 0.5 * Math.sin(t * 7), hop = Math.max(0, Math.sin(t * 7)) * 0.05;
        return { pelvis: [0, 0.9 + hop, 0], chest: [0, 1.43 + hop, 0.02], front: [0, 0.15, -1],
          feet: [[-0.13, 0.07, 0], [0.13, 0.07, 0]],
          hands: [[-0.36, 1.9 + up * 0.22 + hop, -0.05], [0.36, 1.9 + (1 - up) * 0.22 + hop, -0.05]], elbowPole: [[-1, -0.2, 0.3], [1, -0.2, 0.3]] };
      }
      if (opts && opts.clap !== undefined) {        // clapping for the winner
        const c = Math.abs(Math.sin(opts.clap * 9)) * 0.09;
        return { pelvis: [0, 0.9, 0], chest: [0, 1.42, 0], front: [0, 0, -1], feet: [[-0.12, 0.07, 0], [0.12, 0.07, 0]],
          hands: [[-0.03 - c, 1.3, -0.32], [0.03 + c, 1.3, -0.32]], elbowPole: [[-1, -0.6, 0.2], [1, -0.6, 0.2]] };
      }
      return {
        pelvis: [0, 0.9 + b * 0.03, 0], chest: [0, 1.42 + b * 0.03, -0.02 * spd], front: [0, 0, -1],
        feet: [[-0.12, 0.07 + Math.max(0, s) * 0.08, -s * 0.28], [0.12, 0.07 + Math.max(0, -s) * 0.08, s * 0.28]],
        hands: crossed ? [[0.16, 1.22, -0.2], [-0.16, 1.2, -0.22]] : [[-0.32, 0.9, s * 0.25], [0.32, 0.9, -s * 0.25]],
        elbowPole: crossed ? [[-1, -0.3, -0.3], [1, -0.3, -0.3]] : null
      };
    }
  };

  // ---------- machines ----------
  // Each builder returns { g, set(L), pose(L) } in the machine's own frame.
  // L is how far through a rep (0..1). The user approaches from +Z.
  const MB = {};
  const lerp = (a, b, t) => a + (b - a) * t;
  const lv = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));

  MB.bench = function (gc, incline) {
    const g = new T.Group();
    footprint(g, 2.0, 0.9);
    sq([-0.45, 0, 0], [-0.45, 0.4, 0], 0.07, M.frame(), g); sq([0.45, 0, 0], [0.45, 0.4, 0], 0.07, M.frame(), g);
    sq([-0.45, 0.03, -0.22], [-0.45, 0.03, 0.22], 0.06, M.frame(), g); sq([0.45, 0.03, -0.22], [0.45, 0.03, 0.22], 0.06, M.frame(), g);
    sq([-0.5, 0.4, 0], [0.5, 0.4, 0], 0.07, M.frame(), g);
    const ux = incline ? -0.62 : -0.7, uh = incline ? 1.55 : 1.15;
    [-1, 1].forEach(k => {
      sq([ux, 0, k * 0.45], [ux, uh, k * 0.45], 0.07, M.frame(), g);
      sq([ux - 0.15, 0.03, k * 0.45], [ux + 0.2, 0.03, k * 0.45], 0.06, M.frame(), g);
      box(0.1, 0.05, 0.05, M.paint(), g, [ux + 0.05, uh - 0.08, k * 0.45]);
    });
    sq([ux, 0.03, -0.45], [ux, 0.03, 0.45], 0.06, M.frame(), g);
    if (incline) {
      pad(0.36, 0.09, 0.3, g, [0.28, 0.48, 0]);
      const bp = pad(0.82, 0.09, 0.3, g, [-0.27, 0.78, 0], [0, 0, -0.66]);
      sq([-0.1, 0.4, 0], [-0.35, 0.68, 0], 0.06, M.frame(), g);
    } else pad(1.2, 0.09, 0.3, g, [0, 0.48, 0]);
    const bar = barbell(1.8, [[0.225, 0.06], [0.16, 0.04]], gc, g); bar.rotation.y = Math.PI / 2;
    const rest = [ux + 0.03, uh - 0.04, 0];
    const set = (L, used) => { bar.position.set(...(used ? (incline ? lv([-0.14, 1.1, 0], [-0.26, 1.56, 0], L) : lv([-0.3, 0.8, 0], [-0.36, 1.27, 0], L)) : rest)); };
    set(0, false);
    return {
      g, set,
      pose(L) {
        const b = bar.position;
        if (incline) return {
          pelvis: [0.14, 0.6, 0], chest: [-0.22, 0.98, 0], front: [0.74, 0.67, 0], headFront: [0.8, 0.6, 0], lying: true,
          feet: [[0.62, 0.07, -0.3], [0.62, 0.07, 0.3]], footFront: [1, 0, 0], kneePole: [[0.3, 1, -0.4], [0.3, 1, 0.4]],
          hands: [[b.x, b.y, -0.38], [b.x, b.y, 0.38]], elbowPole: [[0.2, -1, -0.8], [0.2, -1, 0.8]]
        };
        return {
          pelvis: [0.3, 0.6, 0], chest: [-0.24, 0.64, 0], front: [0, 1, 0], headFront: [0, 1, 0], lying: true,
          feet: [[0.66, 0.07, -0.33], [0.66, 0.07, 0.33]], footFront: [1, 0, 0], kneePole: [[0.2, 1, -0.5], [0.2, 1, 0.5]],
          hands: [[b.x, b.y, -0.38], [b.x, b.y, 0.38]], elbowPole: [[0.3, -1, -0.8], [0.3, -1, 0.8]]
        };
      }
    };
  };
  MB.incline = gc => MB.bench(gc, true);

  MB.dbrack = function (gc) {
    const g = new T.Group();
    footprint(g, 3.3, 0.7);
    [-1.55, 1.55].forEach(x => { sq([x, 0, -0.25], [x, 0.9, -0.25], 0.07, M.frame(), g); sq([x, 0, 0.18], [x, 0.55, 0.18], 0.07, M.frame(), g); sq([x, 0.03, -0.3], [x, 0.03, 0.25], 0.06, M.frame(), g); });
    [[0.55, 0.05], [0.5, 0.18], [0.88, -0.32], [0.8, -0.14]].forEach(([y, z]) => sq([-1.55, y, z], [1.55, y, z], 0.05, M.frame(), g));
    const bells = [];
    for (let i = 0; i < 12; i++) {
      const d = dumbbell(0.4 + i * 0.12, gc, g); d.rotation.y = Math.PI / 2; d.position.set(-1.38 + i * 0.25, 0.6 + i * 0.002, 0.11); bells.push(d);
    }
    for (let i = 0; i < 10; i++) { const d = dumbbell(0.1 + i * 0.06, gc, g); d.rotation.y = Math.PI / 2; d.position.set(-1.3 + i * 0.29, 0.91, -0.23); }
    sign(g, [{ t: '5    10    15    20    25    30', size: 120 }], 2.9, 0.12, [0, 0.43, 0.235], [-0.3, 0, 0], { bg: '#22252B', fg: '#E8E2D6' });
    const held = [-1, 1].map(() => { const d = dumbbell(0.9, gc, g); d.visible = false; d.rotation.y = Math.PI / 2; return d; });
    let hp = [[-0.27, 0.85, 0.78], [0.27, 0.85, 0.78]];
    return {
      g,
      set(L, used) {
        bells[6].visible = bells[7].visible = !used;
        hp = [lv([-0.27, 0.86, 0.8], [-0.22, 1.32, 0.62], L), lv([0.27, 0.86, 0.8], [0.22, 1.32, 0.62], L)];
        held.forEach((d, i) => { d.visible = !!used; d.position.set(...hp[i]); d.rotation.x = -L * 1.2; });
      },
      pose(L) {
        return { pelvis: [0, 0.9, 0.8], chest: [0, 1.42, 0.78], front: [0, 0, -1], feet: [[-0.13, 0.07, 0.8], [0.13, 0.07, 0.8]], hands: hp,
          elbowPole: [[-0.3, -0.5, 1], [0.3, -0.5, 1]] };
      }
    };
  };

  MB.preacher = function (gc) {
    const g = new T.Group();
    footprint(g, 1.4, 1.1);
    sq([0, 0.03, -0.35], [0, 0.03, 0.45], 0.07, M.frame(), g); sq([-0.35, 0.03, 0.45], [0.35, 0.03, 0.45], 0.06, M.frame(), g); sq([-0.35, 0.03, -0.35], [0.35, 0.03, -0.35], 0.06, M.frame(), g);
    sq([0, 0, 0.3], [0, 0.56, 0.3], 0.07, M.frame(), g);
    pad(0.36, 0.09, 0.32, g, [0, 0.62, 0.3]);
    sq([0, 0, -0.3], [0, 0.85, -0.1], 0.07, M.frame(), g);
    pad(0.52, 0.07, 0.36, g, [0, 0.95, -0.12], [-0.55, 0, 0]);
    [-1, 1].forEach(k => { sq([k * 0.3, 0.85, -0.05], [k * 0.3, 1.02, -0.02], 0.04, M.frame(), g); box(0.05, 0.04, 0.06, M.paint(), g, [k * 0.3, 1.02, 0.0]); });
    const bar = group(g);
    // EZ curl bar
    const pts = [[-0.62, 0, 0], [-0.22, 0, 0], [-0.15, 0, 0.04], [-0.07, 0, -0.03], [0.07, 0, -0.03], [0.15, 0, 0.04], [0.22, 0, 0], [0.62, 0, 0]];
    for (let i = 0; i < pts.length - 1; i++) tube(pts[i], pts[i + 1], 0.014, M.steel(), bar);
    [-1, 1].forEach(k => { mesh(cylG(0.025, 0.025, 0.24, 10), M.chrome(), bar, [k * 0.5, 0, 0], [0, 0, Math.PI / 2]); plate(0.17, 0.04, gc, bar, k * 0.42); plate(0.12, 0.03, gc, bar, k * 0.47); });
    const set = (L, used) => { bar.position.set(...(used ? lv([0, 0.82, -0.38], [0, 1.3, -0.02], L) : [0, 1.06, 0.0])); };
    set(0, false);
    return { g, set, pose() { const b = bar.position; return { pelvis: [0, 0.7, 0.34], chest: [0, 1.2, 0.2], front: [0, -0.25, -1], feet: [[-0.15, 0.07, 0.02], [0.15, 0.07, 0.02]],
      hands: [[-0.17, b.y, b.z], [0.17, b.y, b.z]], elbowPole: [[0, -1, -0.4], [0, -1, -0.4]], headFront: [0, -0.2, -1] }; } };
  };

  MB.squat = function (gc) {
    const g = new T.Group();
    footprint(g, 1.7, 1.7);
    // lifting platform
    const plat = box(1.5, 0.04, 1.5, M.wood(), g, [0, 0.035, 0]); plat.castShadow = false;
    [-1, 1].forEach(k => { const r = box(0.24, 0.045, 1.5, M.rubber(), g, [k * 0.62, 0.037, 0]); r.castShadow = false; });
    const posts = [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]];
    posts.forEach(([x, z]) => sq([x, 0, z], [x, 2.25, z], 0.075, M.frame(), g));
    sq([-0.62, 2.25, -0.62], [0.62, 2.25, -0.62], 0.075, M.frame(), g); sq([-0.62, 2.25, 0.62], [0.62, 2.25, 0.62], 0.075, M.frame(), g);
    sq([-0.62, 2.25, -0.62], [-0.62, 2.25, 0.62], 0.075, M.frame(), g); sq([0.62, 2.25, -0.62], [0.62, 2.25, 0.62], 0.075, M.frame(), g);
    tube([-0.7, 2.18, 0.62], [0.7, 2.18, 0.62], 0.018, M.chrome(), g);
    [-1, 1].forEach(k => {
      sq([k * 0.62, 0.06, -0.62], [k * 0.62, 0.06, 0.62], 0.07, M.frame(), g);
      sq([k * 0.62, 0.78, -0.66], [k * 0.62, 0.78, 0.66], 0.05, M.paint(), g);
      box(0.06, 0.05, 0.12, M.paint(), g, [k * 0.6, 1.36, -0.55]);
      // plate storage horns on the back posts
      tube([k * 0.66, 0.45, -0.62], [k * 0.95, 0.45, -0.62], 0.025, M.chrome(), g);
      plate(0.225, 0.06, gc, g, 0).position.set(k * 0.75, 0.45, -0.62);
      plate(0.225, 0.06, gc, g, 0).position.set(k * 0.82, 0.45, -0.62);
      plate(0.16, 0.04, gc, g, 0).position.set(k * 0.88, 0.45, -0.62);
    });
    // numbered holes on the posts
    for (let i = 0; i < 12; i++) posts.forEach(([x, z]) => { const h = box(0.08, 0.012, 0.012, M.black(), g, [x, 0.5 + i * 0.12, z + (z > 0 ? -0.04 : 0.04)]); h.castShadow = false; });
    const bar = barbell(2.0, [[0.225, 0.06], [0.225, 0.06], [0.16, 0.04]], gc, g);
    let P = null;
    const set = (L, used) => {
      if (!used) { bar.position.set(0, 1.4, -0.53); P = null; return; }
      const pel = [0, lerp(0.9, 0.52, L), lerp(0.05, 0.28, L)], ch = [0, lerp(1.42, 1.0, L), lerp(0.02, -0.08, L)];
      bar.position.set(0, ch[1] - 0.04, ch[2] + lerp(0.1, 0.16, L));
      P = { pelvis: pel, chest: ch, front: [0, lerp(0, -0.3, L), -1], headFront: [0, lerp(0.05, 0.25, L), -1], feet: [[-0.2, 0.11, -0.04], [0.2, 0.11, -0.04]],
        footFront: [[-0.25, 0, -1], [0.25, 0, -1]], kneePole: [[-0.5, 0, -1], [0.5, 0, -1]],
        hands: [[-0.45, bar.position.y, bar.position.z - 0.02], [0.45, bar.position.y, bar.position.z - 0.02]], elbowPole: [[-0.3, -1, 1], [0.3, -1, 1]] };
    };
    set(0, false);
    return { g, set, pose: () => P };
  };

  MB.smith = function (gc) {
    const g = new T.Group();
    footprint(g, 2.1, 1.7);
    [[-0.95, -0.72], [0.95, -0.72], [-0.95, 0.72], [0.95, 0.72]].forEach(([x, z]) => sq([x, 0, z], [x, 2.2, z], 0.075, M.paint(), g));
    [-1, 1].forEach(k => { sq([k * 0.95, 2.2, -0.72], [k * 0.95, 2.2, 0.72], 0.075, M.paint(), g); sq([k * 0.95, 0.04, -0.72], [k * 0.95, 0.04, 0.72], 0.075, M.frame(), g); });
    sq([-0.95, 2.2, 0.1], [0.95, 2.2, 0.1], 0.07, M.paint(), g); sq([-0.95, 0.04, 0.1], [0.95, 0.04, 0.1], 0.07, M.frame(), g);
    [-1, 1].forEach(k => tube([k * 0.58, 0.05, 0.1], [k * 0.58, 2.18, 0.1], 0.02, M.chrome(), g));
    // seat with upright back
    sq([0, 0.03, 0.2], [0, 0.03, 0.75], 0.06, M.frame(), g); sq([0, 0, 0.42], [0, 0.44, 0.42], 0.06, M.frame(), g);
    pad(0.4, 0.09, 0.34, g, [0, 0.5, 0.4]); pad(0.38, 0.6, 0.09, g, [0, 0.92, 0.65], [-0.12, 0, 0]);
    sq([0, 0.5, 0.62], [0, 0.65, 0.68], 0.05, M.frame(), g);
    const bar = barbell(1.75, [[0.2, 0.05], [0.15, 0.035]], gc, g);
    const sleeves = [-1, 1].map(k => box(0.09, 0.12, 0.07, M.steelDark(), bar, [k * 0.58, 0, 0]));
    [-1, 1].forEach(k => box(0.03, 0.09, 0.03, M.paint(), bar, [k * 0.58, -0.06, -0.05]));
    const set = (L, used) => bar.position.set(0, used ? lerp(1.3, 1.86, L) : 1.25, 0.1);
    set(0, false);
    return { g, set, pose() { const y = bar.position.y; return { pelvis: [0, 0.6, 0.42], chest: [0, 1.12, 0.48], front: [0, 0, -1], headFront: [0, 0.1, -1],
      feet: [[-0.22, 0.07, 0.0], [0.22, 0.07, 0.0]], kneePole: [[-0.3, 0.3, -1], [0.3, 0.3, -1]], hands: [[-0.34, y, 0.1], [0.34, y, 0.1]], elbowPole: [[-1, -1, 0.4], [1, -1, 0.4]] }; } };
  };

  // Shared seat for machines where you sit facing out (+Z) with the stack behind
  function seatFacingOut(g, gc, h) {
    const st = stack(g, [0, 0, -0.55], gc, h || 2.0);
    sq([0, 0.03, -0.45], [0, 0.03, 0.55], 0.08, M.paint(), g); sq([-0.3, 0.03, 0.5], [0.3, 0.03, 0.5], 0.07, M.paint(), g);
    sq([0, 0, 0.12], [0, 0.45, 0.12], 0.07, M.paint(), g); sq([0, 0.6, -0.3], [0, 1.25, -0.3], 0.06, M.paint(), g); sq([0, 0.03, -0.3], [0, 0.6, -0.3], 0.06, M.paint(), g);
    pad(0.44, 0.09, 0.4, g, [0, 0.5, 0.12]); pad(0.42, 0.62, 0.09, g, [0, 0.95, -0.2], [0.1, 0, 0]);
    return st;
  }
  const seatedOut = (extra) => Object.assign({ pelvis: [0, 0.6, 0.06], chest: [0, 1.12, -0.04], front: [0, 0, 1], headFront: [0, 0, 1],
    feet: [[-0.2, 0.07, 0.55], [0.2, 0.07, 0.55]], kneePole: [[-0.3, 0.3, 1], [0.3, 0.3, 1]] }, extra);

  MB.pec = function (gc) {
    const g = new T.Group(); footprint(g, 1.7, 1.3);
    const st = seatFacingOut(g, gc);
    const cab = cable(g);
    const arms = [-1, 1].map(k => {
      const piv = group(g, [k * 0.14, 1.62, -0.12]);
      box(0.08, 0.08, 0.08, M.steelDark(), piv);
      const lever = sq([0, 0, 0], [0.5, 0, 0], 0.05, M.paint(), piv);
      const padG = pad(0.08, 0.38, 0.13, piv, [0.5, -0.4, 0]);
      sq([0.5, 0, 0], [0.5, -0.22, 0], 0.045, M.paint(), piv);
      return { piv, k };
    });
    let hands = [[0, 0, 0], [0, 0, 0]];
    const set = (L, used) => {
      const a = used ? lerp(0.15, 1.45, L) : 0.15; st.set(used ? L : 0);
      arms.forEach(({ piv, k }) => { piv.rotation.y = k < 0 ? Math.PI + a : -a; });
      hands = arms.map(({ piv }) => { piv.updateMatrix(); return new V3(0.5, -0.24, 0).applyMatrix4(piv.matrix).toArray(); });
      cab.set([0, 1.98, -0.55], [0, 1.62, -0.12]);
    };
    set(0, false);
    return { g, set, pose: () => seatedOut({ hands, elbowPole: [[-0.4, -1, 0], [0.4, -1, 0]] }) };
  };
  MB.shoulder = function (gc) {
    const g = new T.Group(); footprint(g, 1.7, 1.3);
    const st = seatFacingOut(g, gc);
    const levers = [-1, 1].map(k => {
      const piv = group(g, [k * 0.3, 0.95, -0.32]);
      box(0.08, 0.1, 0.1, M.steelDark(), piv);
      sq([0, 0, 0], [0, 0.55, 0.35], 0.055, M.paint(), piv);
      const grip = mesh(cylG(0.03, 0.03, 0.16, 10), M.rubber(), piv, [0, 0.55, 0.35], [Math.PI / 2, 0, 0]);
      return { piv, k };
    });
    let hands;
    const set = (L, used) => {
      st.set(used ? L : 0);
      const a = used ? lerp(-0.25, 0.55, L) : -0.25;
      levers.forEach(({ piv }) => { piv.rotation.x = -a; });
      hands = levers.map(({ piv }) => { piv.updateMatrix(); return new V3(0, 0.55, 0.35).applyMatrix4(piv.matrix).toArray(); });
    };
    set(0, false);
    return { g, set, pose: () => seatedOut({ hands, elbowPole: [[-1, -1, 0.2], [1, -1, 0.2]] }) };
  };
  MB.latraise = function (gc) {
    const g = new T.Group(); footprint(g, 1.7, 1.3);
    const st = seatFacingOut(g, gc);
    pad(0.36, 0.42, 0.08, g, [0, 1.05, 0.26]); sq([0, 0.5, 0.3], [0, 0.85, 0.3], 0.05, M.paint(), g);
    const arms = [-1, 1].map(k => {
      const piv = group(g, [k * 0.12, 1.42, -0.02]);
      box(0.08, 0.08, 0.08, M.steelDark(), piv);
      sq([0, 0, 0], [k * 0.05, -0.42, 0], 0.045, M.paint(), piv);
      pad(0.14, 0.18, 0.12, piv, [k * 0.1, -0.42, 0.04]);
      mesh(cylG(0.025, 0.025, 0.12, 8), M.rubber(), piv, [k * 0.08, -0.56, 0.08], [Math.PI / 2, 0, 0]);
      return { piv, k };
    });
    let hands;
    const set = (L, used) => {
      st.set(used ? L : 0);
      const a = used ? lerp(0.05, 1.25, L) : 0.05;
      arms.forEach(({ piv, k }) => { piv.rotation.z = k * a; });
      hands = arms.map(({ piv, k }) => { piv.updateMatrix(); return new V3(k * 0.1, -0.56, 0.08).applyMatrix4(piv.matrix).toArray(); });
    };
    set(0, false);
    return { g, set, pose: () => seatedOut({ hands, elbowPole: [[-0.6, -0.2, -1], [0.6, -0.2, -1]] }) };
  };
  MB.legext = function (gc) {
    const g = new T.Group(); footprint(g, 1.7, 1.3);
    const st = seatFacingOut(g, gc);
    [-1, 1].forEach(k => { sq([k * 0.3, 0.45, 0.0], [k * 0.3, 0.55, 0.0], 0.04, M.paint(), g); mesh(cylG(0.03, 0.03, 0.14, 8), M.rubber(), g, [k * 0.3, 0.57, 0.0], [Math.PI / 2, 0, 0]); });
    const piv = group(g, [0, 0.56, 0.34]);
    [-1, 1].forEach(k => { box(0.06, 0.08, 0.08, M.steelDark(), piv, [k * 0.26, 0, 0]); sq([k * 0.26, 0, 0], [k * 0.26, -0.42, 0], 0.045, M.paint(), piv); });
    mesh(cylG(0.06, 0.06, 0.46, 12), M.pad(), piv, [0, -0.42, 0.02], [0, 0, Math.PI / 2]);
    tube([-0.26, -0.42, 0], [0.26, -0.42, 0], 0.018, M.chrome(), piv);
    const cab = cable(g);
    let feet;
    const set = (L, used) => {
      st.set(used ? L : 0);
      piv.rotation.x = -(used ? lerp(0.1, 1.35, L) : 0.1);
      piv.updateMatrix();
      const r = new V3(0, -0.42, -0.09).applyMatrix4(piv.matrix);
      feet = [[-0.1, r.y + 0.02, r.z], [0.1, r.y + 0.02, r.z]];
      cab.set([0, 1.98, -0.55], [0, 0.56, 0.2]);
    };
    set(0, false);
    return { g, set, pose: () => seatedOut({ pelvis: [0, 0.62, 0.0], chest: [0, 1.14, -0.08], feet, footFront: [0, 0, 1], kneePole: [[-0.2, 1, 0.2], [0.2, 1, 0.2]],
      hands: [[-0.3, 0.6, 0.0], [0.3, 0.6, 0.0]], elbowPole: [[-1, 0, -0.2], [1, 0, -0.2]] }) };
  };

  MB.latpull = function (gc) {
    const g = new T.Group(); footprint(g, 1.7, 1.3);
    const st = stack(g, [0, 0, -0.55], gc, 2.35);
    sq([0, 2.32, -0.55], [0, 2.32, 0.1], 0.08, M.paint(), g);
    pulley(g, [0, 2.24, 0.05], 'x');
    sq([0, 0.03, -0.5], [0, 0.03, 0.55], 0.08, M.paint(), g); sq([-0.3, 0.03, 0.5], [0.3, 0.03, 0.5], 0.07, M.paint(), g);
    sq([0, 0, 0.32], [0, 0.45, 0.32], 0.07, M.paint(), g); pad(0.42, 0.09, 0.38, g, [0, 0.5, 0.32]);
    sq([0, 0.03, 0.02], [0, 0.78, 0.02], 0.06, M.paint(), g);
    [-1, 1].forEach(k => mesh(cylG(0.065, 0.065, 0.2, 12), M.pad(), g, [k * 0.13, 0.8, 0.02], [0, 0, Math.PI / 2]));
    const bar = group(g);
    const bp = [[-0.6, -0.08, 0], [-0.45, 0, 0], [0.45, 0, 0], [0.6, -0.08, 0]];
    for (let i = 0; i < 3; i++) tube(bp[i], bp[i + 1], 0.016, M.steel(), bar);
    [-1, 1].forEach(k => mesh(cylG(0.026, 0.026, 0.13, 10), M.rubber(), bar, [k * 0.53, -0.04, 0], [0, 0, Math.PI / 2 + k * 0.5]));
    const cab = cable(g), cab2 = cable(g);
    const set = (L, used) => {
      st.set(used ? L : 0);
      bar.position.set(...(used ? lv([0, 1.95, 0.18], [0, 1.4, 0.14], L) : [0, 1.92, 0.1]));
      cab.set([0, 2.2, 0.05], bar.position); cab2.set([0, 2.26, -0.55], [0, 2.26, 0.0]);
    };
    set(0, false);
    return { g, set, pose() { const b = bar.position; return { pelvis: [0, 0.6, 0.34], chest: [0, 1.12, 0.3], front: [0, 0, -1], headFront: [0, 0.35, -1],
      feet: [[-0.2, 0.07, -0.12], [0.2, 0.07, -0.12]], kneePole: [[-0.3, 0.5, -1], [0.3, 0.5, -1]], hands: [[-0.48, b.y - 0.02, b.z], [0.48, b.y - 0.02, b.z]], elbowPole: [[-1, -0.5, 0.3], [1, -0.5, 0.3]] }; } };
  };

  MB.row = function (gc) {
    const g = new T.Group(); footprint(g, 1.9, 1.3);
    const st = stack(g, [0, 0, -0.6], gc, 1.6);
    sq([0, 0.28, -0.5], [0, 0.28, 0.62], 0.1, M.paint(), g); sq([0, 0, 0.55], [0, 0.28, 0.55], 0.08, M.paint(), g); sq([0, 0, -0.2], [0, 0.28, -0.2], 0.08, M.paint(), g);
    pad(0.36, 0.09, 0.34, g, [0, 0.42, 0.36]);
    pad(0.44, 0.32, 0.06, g, [0, 0.42, -0.22], [0.5, 0, 0], M.rubber());
    pulley(g, [0, 0.38, -0.46], 'x');
    const handle = group(g);
    tube([-0.07, 0, 0.04], [0, 0, -0.06], 0.014, M.steel(), handle); tube([0.07, 0, 0.04], [0, 0, -0.06], 0.014, M.steel(), handle);
    [-1, 1].forEach(k => mesh(cylG(0.022, 0.022, 0.1, 8), M.rubber(), handle, [k * 0.07, 0, 0.06], [Math.PI / 2, 0, 0]));
    const cab = cable(g);
    let lean = 0;
    const set = (L, used) => {
      st.set(used ? L : 0); lean = 1 - L;
      handle.position.set(...(used ? lv([0, 0.72, -0.18], [0, 0.84, 0.2], L) : [0, 0.33, -0.36]));
      cab.set([0, 0.38, -0.46], handle.position.clone().add(new V3(0, 0, -0.05)));
    };
    set(0, false);
    return { g, set, pose() { const h = handle.position; return { pelvis: [0, 0.55, 0.4], chest: [0, lerp(1.08, 0.98, lean), lerp(0.36, 0.08, lean)], front: [0, 0, -1],
      headFront: [0, 0.15, -1], feet: [[-0.15, 0.36, -0.18], [0.15, 0.36, -0.18]], footFront: [0, 0.6, -1], kneePole: [[-0.3, 1, 0], [0.3, 1, 0]],
      hands: [[-0.07, h.y, h.z + 0.06], [0.07, h.y, h.z + 0.06]], elbowPole: [[-0.5, -0.2, 1], [0.5, -0.2, 1]] }; } };
  };

  MB.cable = function (gc) {
    const g = new T.Group(); footprint(g, 2.1, 1.5);
    const towers = [-1, 1].map(k => {
      const st = stack(g, [k * 0.98, 0, -0.15], gc, 2.2);
      sq([k * 0.86, 0, -0.15], [k * 0.86, 2.2, -0.15], 0.06, M.paint(), g);
      box(0.08, 0.14, 0.12, M.steelDark(), g, [k * 0.83, 1.2, -0.15]);
      pulley(g, [k * 0.79, 1.2, -0.15], 'z');
      return st;
    });
    sq([-1.0, 2.24, -0.15], [1.0, 2.24, -0.15], 0.08, M.paint(), g);
    tube([-0.86, 2.0, -0.15], [0.86, 2.0, -0.15], 0.02, M.chrome(), g);
    const grips = [-1, 1].map(() => { const h = group(g); tube([0, -0.06, 0], [0, 0.06, 0], 0.02, M.rubber(), h); tube([0, 0.06, 0], [0, 0.06, -0.06], 0.008, M.steel(), h); return h; });
    const cabs = [cable(g), cable(g)];
    let hands;
    const set = (L, used) => {
      towers.forEach(t => t.set(used ? L : 0));
      hands = used ? [lv([-0.5, 1.18, -0.05], [-0.3, 1.12, 0.32], L), lv([0.5, 1.18, -0.05], [0.3, 1.12, 0.32], L)] : [[-0.76, 1.1, -0.1], [0.76, 1.1, -0.1]];
      grips.forEach((h, i) => { h.position.set(...hands[i]); cabs[i].set([(i ? 1 : -1) * 0.79, 1.2, -0.15], hands[i]); });
    };
    set(0, false);
    return { g, set, pose: () => ({ pelvis: [0, 0.9, 0.3], chest: [0, 1.42, 0.3], front: [0, 0, -1], feet: [[-0.18, 0.07, 0.2], [0.18, 0.07, 0.45]], hands, elbowPole: [[-1, -0.3, 1], [1, -0.3, 1]] }) };
  };

  MB.legpress = function (gc) {
    const g = new T.Group(); footprint(g, 2.1, 1.5);
    sq([-1.0, 0.04, -0.4], [1.0, 0.04, -0.4], 0.08, M.paint(), g); sq([-1.0, 0.04, 0.4], [1.0, 0.04, 0.4], 0.08, M.paint(), g);
    sq([-1.0, 0.04, -0.4], [-1.0, 0.04, 0.4], 0.08, M.paint(), g); sq([1.0, 0.04, -0.4], [1.0, 0.04, 0.4], 0.08, M.paint(), g);
    const r0 = new V3(-0.15, 0.35, 0), dir = new V3(0.78, 0.63, 0).normalize();
    [-1, 1].forEach(k => {
      tube([r0.x, r0.y, k * 0.3], [r0.x + dir.x * 1.45, r0.y + dir.y * 1.45, k * 0.3], 0.03, M.chrome(), g);
      sq([0.95, 0.04, k * 0.3], [0.95, 1.12, k * 0.3], 0.07, M.paint(), g);
      sq([-0.15, 0.04, k * 0.3], [-0.15, 0.35, k * 0.3], 0.07, M.paint(), g);
    });
    pad(0.42, 0.1, 0.5, g, [-0.38, 0.38, 0]);
    pad(0.72, 0.1, 0.5, g, [-0.82, 0.6, 0], [0, 0, -0.62]);
    sq([-0.6, 0.04, 0], [-0.6, 0.33, 0], 0.07, M.paint(), g); sq([-0.95, 0.04, 0], [-0.95, 0.66, 0], 0.07, M.paint(), g);
    [-1, 1].forEach(k => { sq([-0.42, 0.3, k * 0.3], [-0.42, 0.44, k * 0.34], 0.04, M.paint(), g); mesh(cylG(0.03, 0.03, 0.12, 8), M.rubber(), g, [-0.42, 0.46, k * 0.36], [0, 0, Math.PI / 2]); });
    const sled = group(g);
    box(0.1, 0.12, 0.74, M.steelDark(), sled, [0, 0, 0]);
    const fp = box(0.06, 0.62, 0.66, M.rubber(), sled, [-0.06, 0.12, 0]); fp.rotation.z = 0.68;
    [-1, 1].forEach(k => { tube([0.05, 0.05, k * 0.37], [0.05, 0.05, k * 0.62], 0.025, M.chrome(), sled); [0.45, 0.52, 0.58].forEach((z, i) => { const p = plate(i < 2 ? 0.225 : 0.16, 0.05, gc, sled, 0); p.position.set(0.05, 0.05, k * z); p.rotation.y = Math.PI / 2; }); });
    let feet;
    const set = (L, used) => {
      const s = used ? lerp(0.25, 0.75, L) : 0.15;
      sled.position.copy(r0).add(dir.clone().multiplyScalar(s)).add(new V3(0, 0.06, 0));
      const c = sled.position.clone().add(new V3(-0.12, 0.12, 0));
      feet = [[c.x, c.y, -0.15], [c.x, c.y, 0.15]];
    };
    set(0, false);
    return { g, set, pose: () => ({ pelvis: [-0.42, 0.52, 0], chest: [-0.84, 0.86, 0], front: [0.63, 0.78, 0], headFront: [0.8, 0.6, 0], lying: true,
      feet, footFront: [1, 0.8, 0], kneePole: [[0.2, 1, -0.3], [0.2, 1, 0.3]], hands: [[-0.42, 0.46, -0.36], [-0.42, 0.46, 0.36]], elbowPole: [[0, 0, -1], [0, 0, 1]] }) };
  };

  const TYPE = {
    'Flat bench': 'bench', 'Incline bench': 'incline', 'Dumbbell rack': 'dbrack', 'Preacher curl': 'preacher',
    'Squat rack 1': 'squat', 'Squat rack 2': 'squat', 'Smith machine': 'smith', 'Pec deck': 'pec',
    'Shoulder press': 'shoulder', 'Lat pulldown': 'latpull', 'Seated row': 'row', 'Cable stack': 'cable',
    'Leg press': 'legpress', 'Leg extension': 'legext', 'Lateral raise': 'latraise'
  };
  // ---------- models made in Blender (.glb) ----------
  // Loaded once; if anything fails the procedural models above are used instead.
  const ASSETS = {};
  const GLB = { squat: 'models/squat_rack.glb', pre: 'models/preworkout.glb' };
  // Blender material name -> game material [colour, roughness, metalness]. 'plate' takes the muscle-group colour.
  const GLB_MATS = { frame: ['#2B2F38', 0.55, 0.35], paint: ['#F07A3A', 0.45, 0.15], chrome: ['#E6EBF2', 0.18, 0.9], steel: ['#CBD2DC', 0.32, 0.75],
    steelDark: ['#5C6370', 0.45, 0.6], rubber: ['#1F2228', 0.95, 0], wood: ['#C88F55', 0.7, 0], black: ['#141518', 0.6, 0], white: ['#F4F1EA', 0.6, 0], plateRed: ['plate', 0.6, 0.05] };
  let MANIFEST = {};
  const glbOff = () => typeof location !== 'undefined' && /[?&]glb=off/.test(location.search);
  async function loadAssets() {
    if (!T.GLTFLoader || glbOff()) return;
    const loader = new T.GLTFLoader();
    if (T.DRACOLoader) { const d = new T.DRACOLoader(); d.setDecoderPath('draco/'); d.setDecoderConfig({ type: 'wasm' }); loader.setDRACOLoader(d); }
    // machines rebuilt in Blender: models/machines.json says which ones exist and how their parts map onto the built-in rig
    try { const r = await fetch('models/machines.json'); if (r.ok) MANIFEST = await r.json(); } catch (e) { MANIFEST = {}; }
    try { const r = await fetch('models/char.json'); if (r.ok) { const c = await r.json(); if (c.glb) { CHARMAP = c.sigs; GLB.char = 'models/char_parts.glb'; } } } catch (e) { CHARMAP = null; }
    const list = Object.assign({}, GLB);
    Object.keys(MANIFEST).forEach(t => { if (MANIFEST[t].glb && t !== '__room') list['m_' + t] = 'models/m_' + t + '.glb'; });
    if (MANIFEST.__room && MANIFEST.__room.glb) list.room = 'models/room.glb';
    const tex = MANIFEST.__room && MANIFEST.__room.glb ? new Promise(res => new T.TextureLoader().load('models/floor_ao.jpg', t => { ASSETS.floorAO = t; res(); }, undefined, () => res())) : null;
    if (tex) await tex;
    return Promise.all(Object.entries(list).map(([key, url]) => new Promise(res => loader.load(url, gl => {
      gl.scene.traverse(o => {
        if (!o.isMesh) return;
        // newer Blender exporters put a plain white set first and the real colours second
        if (o.geometry.getAttribute('color_1')) { o.geometry.setAttribute('color', o.geometry.getAttribute('color_1')); o.geometry.deleteAttribute('color_1'); }
        // baked ambient occlusion lives in the vertex colours; soften it and drop the alpha channel
        const c = o.geometry.getAttribute('color');
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (c && mats.some(m => /^GCR_/.test(m.name || ''))) {
          // baked full colour (building): stored linear; only the old look needs it back in sRGB
          const k = !c.normalized ? 1 : c.array instanceof Uint16Array ? 65535 : c.array instanceof Uint8Array ? 255 : 1;
          const buf = new Float32Array(c.count * 3), lin = !!(out.G3 && out.G3.LINEAR);
          for (let i = 0; i < c.count; i++) for (let j = 0; j < 3; j++) { const v = Math.min(1, (j === 0 ? c.getX(i) : j === 1 ? c.getY(i) : c.getZ(i)) / k); buf[i * 3 + j] = lin ? v : Math.pow(v, 1 / 2.2); }
          o.geometry.setAttribute('color', new T.BufferAttribute(buf, 3));
        } else if (c) {
          const out = new Float32Array(c.count * 3);
          // r128 doesn't un-normalise integer colours for us
          const k = !c.normalized ? 1 : c.array instanceof Uint16Array ? 65535 : c.array instanceof Uint8Array ? 255 : 1;
          // the building gets a gentler touch, and none at all on the big walls (too few vertices to hold shading nicely)
          const wallish = key === 'room' && /^GCM_(efe3cf|2f8f8a|ff8a2b|22252b|d9ccb5)_/.test(o.material.name || '');
          const lo = wallish ? 1 : key === 'room' ? 0.8 : 0.42;
          for (let i = 0; i < c.count; i++) { const v = lo + (1 - lo) * Math.pow(Math.min(1, c.getX(i) / k), 0.8); out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = v; }
          o.geometry.setAttribute('color', new T.BufferAttribute(out, 3));
        }
        o.castShadow = true; o.receiveShadow = true;
      });
      ASSETS[key] = gl.scene; res();
    }, undefined, e => { console.warn('Model failed to load, using the built-in one:', url, e); res(); }))));
  }
  function glbInstance(key, gc) {
    const s = ASSETS[key].clone(true);
    s.traverse(o => {
      if (!o.isMesh) return;
      const swap = mt => { const n = mt.name || '', g = n.match(/^GCM_(\w+?)_([\d.]+)_([\d.]+)$/), r = n.match(/^GCR_([\d.]+)_([\d.]+)$/);
        if (r) return std('#ffffff', +r[1], +r[2], { flatShading: false, vertexColors: true });
        const d = g ? [g[1] === 'gc' ? 'plate' : '#' + g[1], +g[2], +g[3]] : GLB_MATS[n.replace(/^GC_/, '')] || ['#888888', 0.7, 0];
        return std(d[0] === 'plate' ? gc : d[0], d[1], d[2], { flatShading: false, vertexColors: !!o.geometry.getAttribute('color') }); };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return s;
  }
  // Squat rack from Blender (hand-built). Same rep animation as MB.squat, just a nicer model.
  MB.squatGLB = function (gc) {
    const g = new T.Group();
    footprint(g, 1.7, 1.7);
    const s = glbInstance('squat', gc); g.add(s);
    const bar = s.getObjectByName('SquatRack_Bar');
    const rest = bar.position.clone();
    let P = null;
    const set = (L, used) => {
      if (!used) { bar.position.copy(rest); P = null; return; }
      const pel = [0, lerp(0.9, 0.52, L), lerp(0.05, 0.28, L)], ch = [0, lerp(1.42, 1.0, L), lerp(0.02, -0.08, L)];
      bar.position.set(0, ch[1] - 0.04, ch[2] + lerp(0.1, 0.16, L));
      P = { pelvis: pel, chest: ch, front: [0, lerp(0, -0.3, L), -1], headFront: [0, lerp(0.05, 0.25, L), -1], feet: [[-0.2, 0.11, -0.04], [0.2, 0.11, -0.04]],
        footFront: [[-0.25, 0, -1], [0.25, 0, -1]], kneePole: [[-0.5, 0, -1], [0.5, 0, -1]],
        hands: [[-0.45, bar.position.y, bar.position.z - 0.02], [0.45, bar.position.y, bar.position.z - 0.02]], elbowPole: [[-0.3, -1, 1], [0.3, -1, 1]] };
    };
    set(0, false);
    return { g, set, pose: () => P };
  };
  // While we compare: only Squat rack 1 uses the Blender model (?glb=all for both, ?glb=off for neither).
  const glbFor = m => (TYPE[m.name] === 'squat' && ASSETS.squat ? 'squatGLB' : null);
  // Swap a built-in machine's shapes for the Blender ones. The built-in moving parts (groups) stay,
  // so set()/pose() keep animating exactly as before; the Blender pieces just ride along inside them.
  function glbSwap(b, type, gc) {
    const man = MANIFEST[type], src = ASSETS['m_' + type];
    if (!man || !src) return;
    const all = []; b.g.traverse(o => all.push(o));
    if (all.length !== man.count) { console.warn('Model out of date for', type, '- using the built-in one'); return; }
    const inst = glbInstance('m_' + type, gc);
    const parts = man.owners.map(k => [k, inst.getObjectByName(k === 'root' ? 'static' : 'o' + k)]);
    if (parts.some(p => !p[1])) return;
    man.removed.forEach(i => { const o = all[i]; if (o.parent) o.parent.remove(o); });
    parts.forEach(([k, node]) => { node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1); (k === 'root' ? b.g : all[+k]).add(node); });
  }

  function buildMachine(m, groupColour) {
    const b = MB[glbFor(m) || TYPE[m.name]](groupColour);
    if (!glbFor(m)) glbSwap(b, TYPE[m.name], groupColour);
    const [x, z] = toWorld(m.x + m.w / 2, m.y + m.h / 2);
    b.g.position.set(x, m.x >= 1900 ? 3.6 : 0, z);
    b.def = m;
    return b;
  }

  // ---------- the gym room ----------
  // Rubber gym tiles: 2 x 2 one-metre tiles per texture, coloured flecks, seams, and a matching normal map
  let floorCv = null;
  function floorCanvases() {
    if (floorCv) return floorCv;
    const N = 512, T2 = N / 2, cv = document.createElement('canvas'), nv = document.createElement('canvas');
    cv.width = cv.height = nv.width = nv.height = N;
    const x = cv.getContext('2d'), n = nv.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    [[0, 0, 0], [1, 0, 6], [0, 1, -5], [1, 1, 3]].forEach(([i, j, v]) => { const c = 56 + v; x.fillStyle = 'rgb(' + c + ',' + (c + 3) + ',' + (c + 10) + ')'; x.fillRect(i * T2, j * T2, T2, T2); });
    for (let k = 0; k < 16000; k++) { const g = rnd(); x.fillStyle = g < 0.45 ? 'rgba(255,255,255,.10)' : g < 0.9 ? 'rgba(0,0,0,.18)' : 'rgba(150,155,165,.35)'; const s = rnd() < 0.85 ? 1 : 2; x.fillRect(rnd() * N, rnd() * N, s, s); }
    const flecks = ['#4F86C6', '#C65A4F', '#D4B04A', '#5FAE6E', '#E8E8E8'];
    for (let k = 0; k < 900; k++) { x.fillStyle = flecks[k % flecks.length]; x.globalAlpha = 0.45 + rnd() * 0.3; x.fillRect(rnd() * N, rnd() * N, 2, 1 + (rnd() < 0.5)); }
    x.globalAlpha = 1;
    // seams
    x.fillStyle = 'rgba(0,0,0,.55)'; [0, T2].forEach(p => { x.fillRect(p, 0, 2, N); x.fillRect(0, p, N, 2); });
    x.fillStyle = 'rgba(255,255,255,.07)'; [0, T2].forEach(p => { x.fillRect(p + 2, 0, 1, N); x.fillRect(0, p + 2, N, 1); });
    // normal map: flat with grooves along the seams and a faint rubber grain
    n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, N, N);
    for (let k = 0; k < 6000; k++) { const a = rnd() * 6.28, r = 128 + Math.cos(a) * 18, gg = 128 + Math.sin(a) * 18; n.fillStyle = 'rgb(' + (r | 0) + ',' + (gg | 0) + ',250)'; n.fillRect(rnd() * N, rnd() * N, 2, 2); }
    [0, T2].forEach(p => {
      n.fillStyle = 'rgb(70,128,230)'; n.fillRect(p - 2 < 0 ? N - 2 : p - 2, 0, 2, N); n.fillStyle = 'rgb(186,128,230)'; n.fillRect(p + 2, 0, 2, N);
      n.fillStyle = 'rgb(128,186,230)'; n.fillRect(0, p - 2 < 0 ? N - 2 : p - 2, N, 2); n.fillStyle = 'rgb(128,70,230)'; n.fillRect(0, p + 2, N, 2);
    });
    return (floorCv = { cv, nv });
  }
  function floorMaterial(w, d) {
    const { cv, nv } = floorCanvases();
    const t = new T.CanvasTexture(cv), nt = new T.CanvasTexture(nv);
    [t, nt].forEach(q => { q.wrapS = q.wrapT = T.RepeatWrapping; q.repeat.set((w || 36) / 2, (d || 22) / 2); q.anisotropy = 8; });
    return new T.MeshStandardMaterial({ map: t, normalMap: nt, normalScale: new T.Vector2(0.55, 0.55), roughness: 0.9, metalness: 0 });
  }
  function floorTexture(w, d) { return floorMaterial(w, d).map; }
  function mirrorTexture() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#CFE6F2'); gr.addColorStop(0.5, '#9EC3D8'); gr.addColorStop(1, '#BFDCEC');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.moveTo(40, 256); x.lineTo(90, 256); x.lineTo(200, 0); x.lineTo(150, 0); x.fill();
    x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(110, 256); x.lineTo(125, 256); x.lineTo(235, 0); x.lineTo(220, 0); x.fill();
    return new T.CanvasTexture(cv);
  }
  function plant(p, pos, s) {
    const g = group(p, pos); g.scale.setScalar(s || 1);
    mesh(cylG(0.2, 0.15, 0.35, 10), std('#E8E2D6', 0.7), g, [0, 0.175, 0]);
    mesh(cylG(0.19, 0.19, 0.02, 10), std('#5A3A22', 0.9), g, [0, 0.34, 0]);
    const leaf = std('#4FA25A', 0.8), leaf2 = std('#3D8A4A', 0.8);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; mesh(new T.ConeGeometry(0.09, 0.7, 5), i % 2 ? leaf : leaf2, g, [Math.cos(a) * 0.08, 0.7, Math.sin(a) * 0.08], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); }
    return g;
  }
  function cooler(p, pos) {
    const g = group(p, pos);
    box(0.36, 1.0, 0.34, std('#F4F1EA', 0.5), g, [0, 0.5, 0]);
    box(0.3, 0.12, 0.05, std('#2B2F38', 0.6), g, [0, 0.82, 0.17]);
    mesh(cylG(0.15, 0.15, 0.42, 14), new T.MeshStandardMaterial({ color: '#6EC6F0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75 }), g, [0, 1.22, 0]);
    mesh(cylG(0.05, 0.05, 0.06, 10), std('#2F6FE0', 0.5), g, [0, 1.46, 0]);
    [-0.06, 0.06].forEach((x, i) => box(0.03, 0.05, 0.03, std(i ? '#E2544B' : '#2F6FE0', 0.5), g, [x, 0.84, 0.2]));
    mesh(cylG(0.035, 0.03, 0.08, 8), std('#FFFFFF', 0.6), g, [0.25, 0.04, 0.1]);
    return g;
  }
  function treadmill(p, pos) {
    const g = group(p, pos);
    box(0.8, 0.16, 1.9, std('#2B2F38', 0.6, 0.2), g, [0, 0.1, 0.15]);
    box(0.62, 0.02, 1.7, M.rubber(), g, [0, 0.19, 0.2]);
    [-1, 1].forEach(k => { sq([k * 0.36, 0.15, -0.65], [k * 0.36, 1.25, -0.75], 0.06, std('#2B2F38', 0.5, 0.3), g); tube([k * 0.36, 1.0, -0.72], [k * 0.36, 1.0, -0.2], 0.022, M.chrome(), g); });
    box(0.8, 0.32, 0.12, std('#2B2F38', 0.5, 0.3), g, [0, 1.3, -0.75], [0.5, 0, 0]);
    const scr = box(0.5, 0.2, 0.02, new T.MeshStandardMaterial({ color: '#1B3A4A', emissive: '#3FA7D6', emissiveIntensity: 0.5 }), g, [0, 1.32, -0.68], [0.5, 0, 0]);
    // dust bunny, because nobody uses cardio
    mesh(sphG(0.06, 6), std('#9AA0AB', 1), g, [0.2, 0.23, 0.6], null, [1, 0.5, 1]);
    return g;
  }
  function desk(p, pos) {
    const g = group(p, pos);
    box(4.4, 1.05, 0.7, M.wood(), g, [0, 0.525, 0]);
    box(4.5, 0.06, 0.82, std('#F4F1EA', 0.4), g, [0, 1.08, 0]);
    box(4.42, 0.12, 0.02, std('#FFC93C', 0.5), g, [0, 0.95, -0.36]);
    sign(g, [{ t: "BIG GAZ'S", size: 120, c: '#FFC93C' }, { t: 'RECEPTION', size: 80, c: '#F4F1EA' }], 1.6, 0.6, [0, 0.55, -0.36], [0, Math.PI, 0], { bg: '#8A5A30' });
    // monitor, keyboard, bell
    box(0.5, 0.32, 0.04, M.black(), g, [-1.2, 1.36, 0.1], [0, 0.3, 0]); box(0.08, 0.18, 0.06, M.black(), g, [-1.2, 1.18, 0.12]);
    box(0.44, 0.02, 0.15, std('#2B2F38', 0.6), g, [-1.1, 1.12, -0.12]);
    mesh(new T.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#E6B422', 0.25, 0.9), g, [0.9, 1.11, -0.15]);
    // protein tubs
    ['#E2544B', '#2F6FE0', '#FFC93C', '#2FBF71', '#B07CFF'].forEach((c, i) => { mesh(cylG(0.11, 0.11, 0.26, 12), std(c, 0.5), g, [1.4 + i * 0.25, 1.24, 0.1]); mesh(cylG(0.112, 0.112, 0.05, 12), M.black(), g, [1.4 + i * 0.25, 1.39, 0.1]); });
    // shelf behind with more tubs and a trophy
    box(4.0, 1.6, 0.35, M.woodDark(), g, [0, 0.8, 1.2]);
    [0.6, 1.15].forEach(y => box(3.9, 0.04, 0.4, M.wood(), g, [0, y, 1.0]));
    for (let i = 0; i < 9; i++) mesh(cylG(0.1, 0.1, 0.24, 10), std(['#E2544B', '#2F6FE0', '#FFC93C', '#2FBF71'][i % 4], 0.5), g, [-1.7 + i * 0.42, 0.74, 1.0]);
    const tro = group(g, [1.4, 1.17, 1.0]); mesh(cylG(0.05, 0.08, 0.08, 8), std('#2B2F38', 0.5), tro, [0, 0.04, 0]); mesh(cylG(0.12, 0.04, 0.2, 10), std('#E6B422', 0.25, 0.9), tro, [0, 0.2, 0]);
    return g;
  }
  // ---------- gym furniture and wall details ----------
  const BUMPER = ['#1F2228', '#D9483B', '#2F6FE0', '#F2C230', '#2FA05A'];
  function plyo(p, pos) {
    const g = group(p, pos);
    const foam = std('#2B2F38', 0.85), red = std('#D9483B', 0.7);
    [[0.76, 0.6, 0.6, 0, 0], [0.62, 0.45, 0.5, 0.25, 0.6], [0.5, 0.3, 0.4, -0.15, 1.05]].forEach(([w, h, d, ry, y]) => {
      const b = group(g, [0, y, 0], [0, ry, 0]);
      box(w, h, d, foam, b, [0, h / 2, 0]); box(w + 0.01, 0.06, d + 0.01, red, b, [0, h - 0.06, 0]);
    });
    return g;
  }
  function plateTree(p, pos, s) {
    const g = group(p, pos); g.scale.setScalar(s || 1);
    mesh(cylG(0.42, 0.45, 0.06, 24), M.frame(), g, [0, 0.03, 0]);
    sq([0, 0, 0], [0, 1.25, 0], 0.08, M.frame(), g); mesh(cylG(0.06, 0.06, 0.04, 12), M.rubber(), g, [0, 1.27, 0]);
    [[0.3, 0], [0.3, Math.PI / 2], [0.3, Math.PI], [0.3, -Math.PI / 2], [0.75, Math.PI / 4], [0.75, -3 * Math.PI / 4], [1.05, -Math.PI / 4], [1.05, 3 * Math.PI / 4]].forEach(([y, a], i) => {
      const arm = group(g, [0, y, 0], [0, a, 0]);
      tube([0, 0, 0], [0.24, 0.06, 0], 0.022, M.chrome(), arm);
      const n = i < 4 ? 2 : 1, r = i < 4 ? 0.225 : i < 6 ? 0.17 : 0.12;
      for (let k = 0; k < n; k++) plate(r, 0.05, BUMPER[(i + k) % BUMPER.length], arm, 0.1 + k * 0.055).position.y = 0.03;
    });
    return g;
  }
  function spareBench(p, pos, rot) {
    const g = group(p, pos, [0, rot || 0, 0]);
    sq([-0.5, 0.05, 0], [0.5, 0.05, 0], 0.07, M.frame(), g);
    [-0.45, 0.45].forEach(x => { sq([x, 0.05, -0.2], [x, 0.05, 0.2], 0.06, M.frame(), g); sq([x * 0.8, 0.05, 0], [x * 0.8, 0.4, 0], 0.06, M.frame(), g); });
    pad(0.55, 0.08, 0.28, g, [-0.26, 0.46, 0]); pad(0.45, 0.08, 0.28, g, [0.27, 0.5, 0], [0, 0, -0.18]);
    [-1, 1].forEach(k => mesh(cylG(0.05, 0.05, 0.04, 14), M.rubber(), g, [0.52, 0.06, k * 0.17], [Math.PI / 2, 0, 0]));
    return g;
  }
  function cableRack(p, pos) {
    const g = group(p, pos);
    box(1.6, 0.9, 0.04, M.frame(), g, [0, 1.6, 0.02]);
    for (let i = 0; i < 5; i++) tube([-0.64 + i * 0.32, 1.85, 0.04], [-0.64 + i * 0.32, 1.85, 0.16], 0.015, M.chrome(), g);
    tube([-0.64 - 0.3, 1.8, 0.16], [-0.64 + 0.3, 1.8, 0.16], 0.016, M.chrome(), g);                 // straight bar
    tube([-0.32, 1.85, 0.16], [-0.42, 1.55, 0.16], 0.015, M.steel(), g); tube([-0.32, 1.85, 0.16], [-0.22, 1.55, 0.16], 0.015, M.steel(), g); // V-bar
    [-0.03, 0.03].forEach(x => mesh(cylG(0.022, 0.022, 0.5, 8), std('#C9B37E', 0.95), g, [x, 1.6, 0.16]));  // rope
    [0.32, 0.64].forEach(x => { tube([x, 1.85, 0.16], [x, 1.62, 0.16], 0.01, M.steel(), g); mesh(cylG(0.02, 0.02, 0.13, 10), M.rubber(), g, [x, 1.6, 0.16], [0, 0, Math.PI / 2]); }); // D-handles
    return g;
  }
  function wallFan(p, pos, rot) {
    const g = group(p, pos, [0, rot || 0, 0]);
    box(0.12, 0.3, 0.12, M.frame(), g, [0, 0, 0.06]);
    const head = group(g, [0, -0.12, 0.3], [0.35, 0, 0]);
    mesh(new T.TorusGeometry(0.32, 0.018, 8, 32), M.chrome(), head);
    mesh(cylG(0.08, 0.08, 0.12, 16), std('#EDEDED', 0.5), head, null, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) box(0.26, 0.012, 0.09, std('#EDEDED', 0.5), head, [Math.cos(i * 2.09) * 0.15, Math.sin(i * 2.09) * 0.15, 0], [0, 0.3, i * 2.09]);
    return g;
  }
  function speaker(p, pos, rot) {
    const g = group(p, pos, [0, rot || 0, 0]);
    box(0.36, 0.55, 0.3, M.black(), g, [0, 0, 0.15]);
    mesh(cylG(0.12, 0.12, 0.02, 20), std('#2B2F38', 0.4, 0.3), g, [0, -0.08, 0.31], [Math.PI / 2, 0, 0]);
    mesh(cylG(0.05, 0.05, 0.02, 14), std('#2B2F38', 0.4, 0.3), g, [0, 0.16, 0.31], [Math.PI / 2, 0, 0]);
    return g;
  }
  function kettlebell(p, pos, s, col) {
    const g = group(p, pos); g.scale.setScalar(s);
    mesh(sphG(0.12, 10), std(col || '#2B2F38', 0.5, 0.3), g, [0, 0.11, 0], null, [1, 0.9, 1]);
    mesh(new T.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), std(col || '#2B2F38', 0.5, 0.3), g, [0, 0.2, 0]);
    return g;
  }
  // Drinks behind the glass of the vending machine
  let vendCv = null;
  function vendTex() {
    if (!vendCv) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const x = cv.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#34404D'); gr.addColorStop(1, '#161B21'); x.fillStyle = gr; x.fillRect(0, 0, 256, 512);
      const cols = ['#E2544B', '#2F6FE0', '#FFC93C', '#2FBF71', '#B07CFF', '#FF8A2B'];
      for (let r = 0; r < 5; r++) {
        const y0 = 12 + r * 99; x.fillStyle = '#9AA3AD'; x.fillRect(6, y0 + 84, 244, 5);
        for (let c = 0; c < 5; c++) {
          const c0 = 16 + c * 47, col = cols[(r * 2 + c) % cols.length];
          x.fillStyle = col;
          if (r % 2) { x.fillRect(c0, y0 + 26, 32, 58); x.fillStyle = '#DDE3EA'; x.fillRect(c0 + 3, y0 + 21, 26, 6); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(c0 + 4, y0 + 30, 5, 50); }
          else { x.beginPath(); x.moveTo(c0 + 10, y0 + 6); x.lineTo(c0 + 22, y0 + 6); x.lineTo(c0 + 22, y0 + 22); x.lineTo(c0 + 32, y0 + 36); x.lineTo(c0 + 32, y0 + 84); x.lineTo(c0, y0 + 84); x.lineTo(c0, y0 + 36); x.lineTo(c0 + 10, y0 + 22); x.fill();
            x.fillStyle = '#F4F1EA'; x.fillRect(c0 + 2, y0 + 50, 28, 15); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(c0 + 4, y0 + 38, 4, 44); }
          x.fillStyle = '#FFC93C'; x.font = '700 12px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('$' + (3 + ((r + c) % 4)), c0 + 16, y0 + 98);
        }
      }
      x.fillStyle = 'rgba(255,255,255,.07)'; x.beginPath(); x.moveTo(60, 0); x.lineTo(130, 0); x.lineTo(30, 512); x.lineTo(-40, 512); x.fill();
      vendCv = cv;
    }
    return new T.CanvasTexture(vendCv);
  }
  // ---------- the inside of the shell: ceiling and shopfront ----------
  // Only drawn when the camera is inside the building below them (behind-you camera), so the overhead
  // camera still sees straight down into the gym. shellUpdate() switches them every frame.
  function deckTexture() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = '#4A4F58'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { const g = x.createLinearGradient(i * 32, 0, i * 32 + 32, 0); g.addColorStop(0, '#3C4048'); g.addColorStop(0.3, '#5F6570'); g.addColorStop(0.55, '#565C66'); g.addColorStop(1, '#383C44'); x.fillStyle = g; x.fillRect(i * 32, 0, 32, 256); }
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 127, 256, 2);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(36 / 2.4, 22 / 4.8); t.anisotropy = 4; return t;
  }
  function streetTexture() {
    const W = 2048, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sky = x.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, '#8EC5E8'); sky.addColorStop(1, '#DCEFF7'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // buildings across the road
    let bx = -20;
    while (bx < W) {
      const bw = 120 + rnd() * 160, bh = 190 + rnd() * 200, col = ['#C8B8A2', '#A7B3BF', '#D9C9B4', '#B58F7A', '#9FA9A0', '#E1D6C6'][(rnd() * 6) | 0];
      x.fillStyle = col; x.fillRect(bx, H * 0.86 - bh, bw, bh);
      x.fillStyle = 'rgba(40,60,80,.55)';
      for (let wy = H * 0.86 - bh + 18; wy < H * 0.86 - 70; wy += 36) for (let wx = bx + 12; wx < bx + bw - 26; wx += 30) x.fillRect(wx, wy, 18, 22);
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(bx + bw - 8, H * 0.86 - bh, 8, bh);
      // shopfront awning
      x.fillStyle = ['#2F8F8A', '#D9483B', '#2F6FE0', '#FFC93C'][(rnd() * 4) | 0]; x.fillRect(bx + 6, H * 0.86 - 62, bw - 12, 14);
      x.fillStyle = 'rgba(30,40,50,.6)'; x.fillRect(bx + 14, H * 0.86 - 46, bw - 28, 46);
      bx += bw + 4;
    }
    // street trees
    for (let i = 0; i < 9; i++) { const tx = 80 + i * 235 + rnd() * 40; x.fillStyle = '#6B4B3A'; x.fillRect(tx - 5, H * 0.72, 10, H * 0.17);
      x.fillStyle = i % 2 ? '#4F8F4A' : '#5DA052'; x.beginPath(); x.arc(tx, H * 0.66, 46, 0, 7); x.arc(tx - 30, H * 0.71, 32, 0, 7); x.arc(tx + 30, H * 0.71, 32, 0, 7); x.fill(); }
    x.fillStyle = '#B9BDC2'; x.fillRect(0, H * 0.86, W, H * 0.14);       // far footpath
    x.fillStyle = '#8E9399'; x.fillRect(0, H * 0.86, W, 4);
    // parked cars along the far kerb
    for (let i = 0; i < 7; i++) { const c0 = 60 + i * 290 + rnd() * 80, b0 = H * 0.86 + 6, cc = ['#E2544B', '#F4F1EA', '#2F6FE0', '#2B2F38', '#FFC93C', '#9AA3AD', '#2FA05A'][i];
      x.fillStyle = cc; x.beginPath(); x.moveTo(c0, b0); x.lineTo(c0, b0 - 24); x.lineTo(c0 + 22, b0 - 27); x.lineTo(c0 + 38, b0 - 44); x.lineTo(c0 + 88, b0 - 44); x.lineTo(c0 + 107, b0 - 27); x.lineTo(c0 + 126, b0 - 24); x.lineTo(c0 + 126, b0); x.fill();
      x.fillStyle = 'rgba(120,170,200,.9)'; x.beginPath(); x.moveTo(c0 + 28, b0 - 28); x.lineTo(c0 + 42, b0 - 40); x.lineTo(c0 + 84, b0 - 40); x.lineTo(c0 + 99, b0 - 28); x.fill();
      x.fillStyle = '#15171C'; [c0 + 26, c0 + 100].forEach(wx => { x.beginPath(); x.arc(wx, b0, 10, 0, 7); x.fill(); }); }
    const t = new T.CanvasTexture(cv); t.anisotropy = 4; return t;
  }
  function buildShell(scene) {
    const X = x => (x - 900) * SCALE, Z = y => (y - 550) * SCALE, zf = Z(1105);
    const sh = { ceil: new T.Group(), front: new T.Group(), frontZ: zf - 0.3 };
    scene.add(sh.ceil); scene.add(sh.front);
    const noShadow = g => g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // ceiling: steel deck facing down, I-beams, ducts, sprinkler line, hanging LED battens
    const C = sh.ceil, beamM = std('#3A3F4B', 0.5, 0.45), ductM = std('#B8BEC6', 0.38, 0.65), darkM = std('#2B2F38', 0.6, 0.3);
    mesh(new T.PlaneGeometry(36.4, 22.6), new T.MeshStandardMaterial({ map: deckTexture(), roughness: 0.75, metalness: 0.25, emissive: '#1D2026' }), C, [0, WALL_H - 0.02, 0.05], [Math.PI / 2, 0, 0]);
    for (let x = -16; x <= 16.01; x += 4) {
      box(0.16, 0.5, 22.3, beamM, C, [x, WALL_H - 0.3, 0.05]); box(0.34, 0.05, 22.3, beamM, C, [x, WALL_H - 0.53, 0.05]); box(0.34, 0.05, 22.3, beamM, C, [x, WALL_H - 0.06, 0.05]);
      [-11.05, 11.15].forEach(z => box(0.5, 0.6, 0.06, beamM, C, [x, WALL_H - 0.35, z]));
    }
    [[Z(140), 0.42], [Z(820), 0.36]].forEach(([z, r]) => {
      const y = WALL_H - 0.75;
      mesh(cylG(r, r, 36.2, 20), ductM, C, [0, y, z], [0, 0, Math.PI / 2]);
      for (let x = -15; x <= 15.01; x += 3) { mesh(cylG(r + 0.025, r + 0.025, 0.08, 20), ductM, C, [x, y, z], [0, 0, Math.PI / 2]); tube([x, y + r, z], [x, WALL_H - 0.55, z], 0.012, darkM, C); }
      for (let x = -13.5; x <= 13.6; x += 6) { box(0.4, 0.12, 0.4, ductM, C, [x, y - r - 0.04, z]); box(0.34, 0.02, 0.34, darkM, C, [x, y - r - 0.105, z]); }
    });
    tube([-18, WALL_H - 0.85, Z(480)], [18, WALL_H - 0.85, Z(480)], 0.03, std('#C9372C', 0.5), C);
    for (let x = -15; x <= 15.01; x += 3) mesh(cylG(0.025, 0.04, 0.07, 8), M.chrome(), C, [x, WALL_H - 0.92, Z(480)]);
    const ledM = new T.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFF6E5', emissiveIntensity: 1.0, roughness: 0.3 });
    [Z(300), Z(620), Z(950)].forEach(z => { for (let x = -15; x <= 15.01; x += 5) {
      const y = WALL_H - 1.0; box(1.7, 0.07, 0.24, darkM, C, [x, y, z]); box(1.6, 0.02, 0.17, ledM, C, [x, y - 0.04, z]);
      [-0.7, 0.7].forEach(dx => tube([x + dx, y + 0.03, z], [x + dx, WALL_H - 0.55, z], 0.006, darkM, C)); } });
    // shopfront: windows over the low front wall, glass doors, the street outside
    const F = sh.front, alu = std('#A3ACB6', 0.35, 0.7), wallM = std('#EFE3CF', 0.9), top = 3.3;
    box(36.2, WALL_H - top, 0.2, wallM, F, [0, top + (WALL_H - top) / 2, zf + 0.1]);
    box(36.2, 0.16, 0.26, std('#2F8F8A', 0.85), F, [0, top + 0.08, zf + 0.06]); box(36.2, 0.05, 0.28, std('#FF8A2B', 0.7), F, [0, top + 0.18, zf + 0.06]);
    box(36.2, 0.1, 0.16, alu, F, [0, top - 0.05, zf]); box(36.2, 0.06, 0.16, alu, F, [0, 0.62, zf]);
    for (let x = 0; x <= 1800; x += 90) { if (x > 1040 && x < 1120) continue; box(0.07, top - 0.62, 0.14, alu, F, [X(x), (top + 0.62) / 2, zf]); }
    // entrance: glass doors with push bars
    [1040, 1120].forEach(x => box(0.12, top, 0.18, alu, F, [X(x), top / 2, zf]));
    [1060, 1100].forEach((x, i) => { box(0.05, 2.3, 0.06, alu, F, [X(x) + (i ? 0.78 : -0.78), 1.15, zf]); box(0.05, 2.3, 0.06, alu, F, [X(x) + (i ? -0.78 : 0.78), 1.15, zf]); box(1.6, 0.06, 0.06, alu, F, [X(x), 2.3, zf]); box(1.6, 0.12, 0.06, alu, F, [X(x), 0.06, zf]); tube([X(x) - 0.5, 1.05, zf - 0.08], [X(x) + 0.5, 1.05, zf - 0.08], 0.02, M.chrome(), F); });
    sign(F, [{ t: 'THANKS FOR COMING', size: 90, c: '#15171C' }, { t: 'now get back in here', size: 54, c: '#15171C', weight: '700' }], 3.2, 0.8, [X(1080), 4.0, zf - 0.005], [0, Math.PI, 0], { bg: '#FFC93C' });
    const winM = new T.MeshStandardMaterial({ color: '#BFE6F5', emissive: '#87C5DF', emissiveIntensity: 0.55, roughness: 0.2 });
    [150, 450, 1350, 1650].forEach(x => box(2.4, 1.0, 0.04, winM, F, [X(x), 7.7, zf - 0.02]));
    const glass = mesh(new T.PlaneGeometry(36.2, top - 0.62), new T.MeshStandardMaterial({ color: '#CFE8F2', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.12, depthWrite: false }), F, [0, (top + 0.62) / 2, zf + 0.01], [0, Math.PI, 0]);
    // outside: footpath, kerb, road and the street across it
    const ground = (w, d, z, c, y) => mesh(new T.PlaneGeometry(w, d), std(c, 0.95), F, [0, y || 0, z], [-Math.PI / 2, 0, 0]);
    ground(70, 3.2, zf + 1.7, '#B9BDC2', -0.01); ground(70, 0.2, zf + 3.4, '#8E9399', 0.06); ground(70, 7, zf + 7, '#3D4148', -0.02);
    for (let x = -33; x < 34; x += 6) box(3, 0.005, 0.15, std('#E8E2C8', 0.7), F, [x, -0.01, zf + 7]);
    const st = mesh(new T.PlaneGeometry(70, 17.5), new T.MeshBasicMaterial({ map: streetTexture(), fog: false }), F, [0, 6.2, zf + 10.5], [0, Math.PI, 0]);
    noShadow(C); noShadow(F);
    mergeStatic(C); mergeStatic(F);
    sh.ceil.visible = sh.front.visible = false;
    return sh;
  }
  function shellUpdate(sh, cam) {
    if (!sh) return;
    sh.ceil.visible = cam.y < CEIL_LOW;
    sh.front.visible = cam.z < sh.frontZ;
  }
  // ---------- the gym building (two floors) ----------
  const ELEV = 3.6, WALL_H = 9.6, CEIL_LOW = 8.5;
  function heightAt(x, y) { if (x >= 1900) return ELEV; if (x < 200 && y > 520 && y < 1000) return y <= 570 ? ELEV : (1000 - y) / 430 * ELEV; return 0; }
  const map3 = (x, y) => { const [X, Z] = toWorld(x, y); return [X, heightAt(x, y), Z]; };
  function buildRoom(scene, sh, opts) {
    const R = new T.Group(); scene.add(R);
    const up = new T.Group(); R.add(up);
    const X = x => (x - 900) * SCALE, Z = y => (y - 550) * SCALE, Wd = 36, Dp = 22, H1 = 3.4, H2 = WALL_H;
    const wallM = std('#EFE3CF', 0.9), dado = std('#2F8F8A', 0.85), stripe = std('#FF8A2B', 0.7), skirt = std('#22252B', 0.8);
    // floor + tinted areas
    const fl = mesh(new T.PlaneGeometry(Wd, Dp), floorMaterial(Wd, Dp), R, [0, 0, 0], [-Math.PI / 2, 0, 0]); fl.castShadow = false;
    sh.ZONES.forEach(z => {
      const upz = z.x >= 1900, x0 = upz ? z.x - 2000 : z.x;
      const p = mesh(new T.PlaneGeometry(z.w * SCALE, z.h * SCALE), new T.MeshBasicMaterial({ color: z.floor, transparent: true, opacity: 0.3, depthWrite: false }), upz ? up : R, [X(x0 + z.w / 2), (upz ? ELEV : 0) + 0.008, Z(z.y + z.h / 2)], [-Math.PI / 2, 0, 0]);
      p.castShadow = false; p.receiveShadow = false;
    });
    const decal = (t, x, y, w, rotZ, parent, elev) => { const s = sign(parent || R, [{ t, size: 150, c: 'rgba(255,255,255,.16)' }], w, w / 4, [X(x), (elev || 0) + 0.012, Z(y)], [-Math.PI / 2, 0, rotZ || 0], { bg: 'none' }); s.material.transparent = true; s.material.depthWrite = false; s.receiveShadow = false; return s; };
    decal('CABLE ALLEY', 660, 262, 7); decal('MAIN HALL', 600, 880, 7); decal('LEG ROOM', 1500, 345, 6); decal('CORRIDOR', 1255, 700, 7, Math.PI / 2);
    decal('CHEST FLOOR', 350, 470, 6, 0, up, ELEV);
    for (let y = 1000; y > 420; y -= 90) { const a = sign(R, [{ t: '▲', size: 300, c: 'rgba(255,201,60,.55)' }], 1.0, 1.0, [X(1255), 0.013, Z(y)], [-Math.PI / 2, 0, 0], { bg: 'none', w: 256, h: 256 }); a.material.transparent = true; a.material.depthWrite = false; }
    // walls: axis-aligned between two map points
    function wall(x1, y1, x2, y2, h, opts) {
      opts = opts || {};
      const horiz = y1 === y2, len = (horiz ? Math.abs(x2 - x1) : Math.abs(y2 - y1)) * SCALE, th = opts.th || 0.2;
      const g = group(opts.parent || R, [X((x1 + x2) / 2), opts.base || 0, Z((y1 + y2) / 2)], [0, horiz ? 0 : Math.PI / 2, 0]);
      if (opts.low) { box(len, h, th, dado, g, [0, h / 2, 0]); box(len, 0.06, th + 0.04, stripe, g, [0, h, 0]); return g; }
      box(len, Math.max(0.01, h - 1.12), th, wallM, g, [0, 1.12 + (h - 1.12) / 2, 0]);
      box(len, 1.04, th + 0.02, dado, g, [0, 0.56, 0]); box(len, 0.08, th + 0.04, stripe, g, [0, 1.1, 0]); box(len, 0.08, th + 0.04, skirt, g, [0, 0.04, 0]);
      box(len, 0.08, th + 0.06, std('#D9CCB5', 0.8), g, [0, h, 0]);
      if (h > 5) { box(len, 0.14, th + 0.05, dado, g, [0, 3.45, 0]); box(len, 0.05, th + 0.06, stripe, g, [0, 3.56, 0]); }
      return g;
    }
    wall(0, -5, 1800, -5, H2); wall(-5, 0, -5, 1100, H2); wall(1805, 0, 1805, 1100, H2);
    wall(0, 1105, 1040, 1105, 0.55, { low: true }); wall(1120, 1105, 1800, 1105, 0.55, { low: true });
    // door: a doormat and a low exit sign (a tall frame would block the camera)
    const dg = group(R, [X(1080), 0, Z(1085)]);
    const mat = box(1.5, 0.02, 0.7, std('#5A3A22', 0.95), dg, [0, 0.012, 0]); mat.castShadow = false;
    sign(dg, [{ t: 'WELCOME', size: 120, c: '#FFC93C' }], 1.3, 0.35, [0, 0.026, 0], [-Math.PI / 2, 0, 0], { bg: '#5A3A22' });
    const glass = new T.MeshStandardMaterial({ color: '#A8D8EA', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.4 });
    tube([0.9, 0, 0.35], [0.9, 0.75, 0.35], 0.025, M.steel(), dg);
    sign(dg, [{ t: 'EXIT', size: 170, c: '#FFFFFF' }], 0.5, 0.2, [0.9, 0.85, 0.36], [0, 0, 0], { bg: '#1E9E4A' }, true);
    // interior walls, half walls, railings, lockers
    sh.WALLS.forEach(w => {
      if (w.t === 'wall') { if (w.w > w.h) wall(w.x, w.y + w.h / 2, w.x + w.w, w.y + w.h / 2, H1, { th: w.h * SCALE }); else wall(w.x + w.w / 2, w.y, w.x + w.w / 2, w.y + w.h, H1, { th: w.w * SCALE }); }
      else if (w.t === 'half') { const g = group(R, [X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)]); box(w.w * SCALE, 1.0, w.h * SCALE, dado, g, [0, 0.5, 0]); box(w.w * SCALE + 0.04, 0.06, w.h * SCALE + 0.06, stripe, g, [0, 1.02, 0]); }
      else if (w.t === 'lockers') {
        const g = group(R, [X(w.x + w.w / 2), 0, Z(w.y + w.h / 2)]), bw = w.w * SCALE, bd = w.h * SCALE;
        box(bw, 2.5, bd, std('#2A2F3A', 0.8), g, [0, 1.25, 0]); box(bw + 0.1, 0.1, bd + 0.1, std('#3A3F4B', 0.85), g, [0, 2.55, 0]);
        for (let i = 0; i < 3; i++) box(bw - 0.6, 0.06, 0.5, std('#4A5060', 0.7, 0.3), g, [0, 2.62, -bd / 2 + 2 + i * (bd - 4) / 2]);
        // whatever got dumped on the locker room roof
        const card = std('#C49A6C', 0.9), tape = std('#D9C9A3', 0.8);
        [[-3.2, -2.4, 0.9, 0.6, 0.7, 0.2, 0], [-2.2, -2.7, 0.7, 0.5, 0.6, -0.3, 0], [-3.1, -2.45, 0.6, 0.42, 0.5, 0.12, 0.6], [2.9, -2.2, 0.8, 0.5, 0.6, 0.5, 0]].forEach(([x, z, bw2, bh, bd2, r, y0]) => {
          const b = group(g, [x, 2.6 + y0, z], [0, r, 0]); box(bw2, bh, bd2, card, b, [0, bh / 2, 0]); box(bw2 + 0.006, 0.012, 0.09, tape, b, [0, bh + 0.002, 0]); });
        ['#3F9E92', '#2F6FE0', '#E2544B'].forEach((c, i) => mesh(cylG(0.11, 0.11, 0.62, 14), std(c, 0.85), g, [2.4 + i * 0.05, 2.71 + (i === 2 ? 0.19 : 0), 3.9 + (i === 2 ? -0.11 : i * 0.22)], [0, 0, Math.PI / 2]));
        for (let i = 0; i < 4; i++) mesh(cylG(0.225 - i * 0.03, 0.225 - i * 0.03, 0.05, 22), std(BUMPER[i + 1], 0.6), g, [3.4, 2.63 + i * 0.05, -4.1]);
        treadmill(g, [-2.7, 2.6, 2.9]);
        mesh(sphG(0.3, 14), std('#B07CFF', 0.5), g, [3.1, 2.66, 1.4], null, [1, 0.33, 1]);
        const lt = sign(g, [{ t: 'LOCKER ROOM', size: 150, c: 'rgba(255,255,255,.22)' }], 7, 1.75, [0, 2.66, 0], [-Math.PI / 2, 0, Math.PI / 2], { bg: 'none' }); lt.material.transparent = true;
        const doorA = std('#4E6E8E', 0.5, 0.2), doorB = std('#5A7C9C', 0.5, 0.2);
        for (let i = 0; i < Math.floor(bd / 0.42); i++) { box(0.03, 1.9, 0.38, i % 2 ? doorA : doorB, g, [-bw / 2 - 0.016, 1.05, -bd / 2 + 0.25 + i * 0.42]); box(0.03, 0.04, 0.12, M.chrome(), g, [-bw / 2 - 0.035, 1.05, -bd / 2 + 0.36 + i * 0.42]); }
        for (let i = 0; i < Math.floor(bw / 0.42); i++) box(0.38, 1.9, 0.03, i % 2 ? doorA : doorB, g, [-bw / 2 + 0.25 + i * 0.42, 1.05, -bd / 2 - 0.016]);
        sign(g, [{ t: 'LOCKER ROOM', size: 110, c: '#F4F1EA' }, { t: 'members only', size: 50, c: '#9AA0AB', weight: '700' }], 2.2, 0.6, [-bw / 2 - 0.04, 2.25, 0], [0, -Math.PI / 2, 0], { bg: '#15171C' });
      } else if (w.t === 'rail') {
        const upr = w.x >= 1900, x0 = upr ? w.x - 2000 : w.x, vert = w.h > w.w;
        const pts = []; const n = Math.max(2, Math.round((vert ? w.h : w.w) / 60));
        for (let i = 0; i <= n; i++) { const px = vert ? x0 + w.w / 2 : x0 + w.w * i / n, py = vert ? w.y + w.h * i / n : w.y + w.h / 2; pts.push([X(px), upr ? ELEV : heightAt(px - 1, py), Z(py)]); }
        pts.forEach(p => tube(p, [p[0], p[1] + 1.0, p[2]], 0.025, M.chrome(), upr ? up : R));
        for (let i = 0; i < pts.length - 1; i++) { tube([pts[i][0], pts[i][1] + 1.0, pts[i][2]], [pts[i + 1][0], pts[i + 1][1] + 1.0, pts[i + 1][2]], 0.03, M.steel(), upr ? up : R);
          if (!upr) [0.36, 0.68].forEach(f => tube([pts[i][0], pts[i][1] + f, pts[i][2]], [pts[i + 1][0], pts[i + 1][1] + f, pts[i + 1][2]], 0.014, M.steel(), R));
          if (upr) { const a = pts[i], b = pts[i + 1]; const gp = mesh(boxG(Math.max(0.02, Math.abs(b[0] - a[0])), 0.8, Math.max(0.02, Math.abs(b[2] - a[2]))), glass, up, [(a[0] + b[0]) / 2, ELEV + 0.5, (a[2] + b[2]) / 2]); gp.castShadow = false; } }
      }
    });
    // staircase along the left wall, rising towards the back: concrete flight, oak treads with yellow
    // nosing and grip tape, a steel stringer along the open side and a handrail on the wall
    const stepM = std('#80858E', 0.92), tread = std('#B9824C', 0.62), nose = std('#FFC93C', 0.6), grip = std('#1C1E23', 0.95), stringer = std('#3A3F4B', 0.5, 0.45);
    const steps = 20, sy0 = 1000, sy1 = 570, sd = (sy0 - sy1) / steps, sw = 200 * SCALE, rise = ELEV / steps, run = sd * SCALE;
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * rise, yc = sy0 - (i + 0.5) * sd, zf = Z(yc) + run / 2;
      box(sw - 0.02, h - 0.045, run, stepM, R, [X(100), (h - 0.045) / 2, Z(yc)]);
      box(sw - 0.04, 0.045, run + 0.035, tread, R, [X(100), h - 0.0225, Z(yc) + 0.0175]);
      box(sw - 0.16, 0.02, 0.055, nose, R, [X(100), h + 0.008, zf + 0.004]);
      box(sw - 0.36, 0.008, 0.04, grip, R, [X(100), h + 0.003, zf - 0.08]);
    }
    box(sw, ELEV - 0.04, 50 * SCALE, stepM, R, [X(100), (ELEV - 0.04) / 2, Z(545)]);
    box(sw - 0.04, 0.045, 50 * SCALE, tread, R, [X(100), ELEV - 0.0205, Z(545)]);
    box(sw - 0.16, 0.02, 0.055, nose, R, [X(100), ELEV + 0.008, Z(570) + 0.004]);
    { const L = Math.hypot((sy0 - sy1) * SCALE, ELEV), a = Math.atan2(ELEV, (sy0 - sy1) * SCALE);
      const sg = group(R, [X(200) + 0.02, ELEV / 2 + 0.02, Z((sy0 + sy1) / 2)], [a, 0, 0]);
      box(0.1, 0.44, L + 0.5, stringer, sg); box(0.12, 0.05, L + 0.5, stringer, sg, [0, 0.215, 0]);
      // wall handrail with brackets
      const hx = X(0) + 0.09, rh = y => Math.max(0, (sy0 - y) / (sy0 - sy1) * ELEV) + rise + 0.9;
      tube([hx, rh(1010), Z(1010)], [hx, rh(sy1), Z(sy1)], 0.024, M.steel(), R); tube([hx, rh(sy1), Z(sy1)], [hx, rh(sy1), Z(528)], 0.024, M.steel(), R);
      for (let y = 980; y > 560; y -= 84) { tube([X(0), rh(y) - 0.07, Z(y)], [hx, rh(y) - 0.02, Z(y)], 0.012, M.steel(), R); box(0.02, 0.09, 0.07, M.steel(), R, [X(0) + 0.01, rh(y) - 0.07, Z(y)]); } }
    // wayfinding sign on a stand at the foot of the stairs, angled to face the hall and the camera
    { const st = group(R, [X(229), 0, Z(1023)], [0, Math.PI / 4, 0]);
      box(0.46, 0.035, 0.28, M.frame(), st, [0, 0.018, 0]); sq([0, 0.03, 0], [0, 1.72, 0], 0.07, M.frame(), st);
      box(1.48, 0.54, 0.05, M.frame(), st, [0, 1.98, 0]);
      const lines = [{ t: 'CHEST FLOOR', size: 120, c: '#15171C' }, { t: 'up the stairs \u2191', size: 64, c: '#15171C', weight: '800' }];
      sign(st, lines, 1.4, 0.46, [0, 1.98, 0.027], null, { bg: '#FFC93C' }); sign(st, lines, 1.4, 0.46, [0, 1.98, -0.027], [0, Math.PI, 0], { bg: '#FFC93C' }); }
    // mezzanine (upstairs) over the back-left of the ground floor
    const slabW = 700 * SCALE, slabD = 520 * SCALE;
    const slab = box(slabW, 0.3, slabD, std('#5A4E4A', 0.8), up, [X(350), ELEV - 0.15, Z(260)]);
    const top = mesh(new T.PlaneGeometry(slabW, slabD), floorMaterial(slabW, slabD), up, [X(350), ELEV + 0.004, Z(260)], [-Math.PI / 2, 0, 0]); top.castShadow = false;
    box(0.3, 0.45, slabD, std('#2B2F38', 0.6, 0.3), up, [X(700), ELEV - 0.25, Z(260)]);
    box(slabW, 0.45, 0.3, std('#2B2F38', 0.6, 0.3), up, [X(350), ELEV - 0.25, Z(520)]);
    box(0.32, ELEV, 0.32, std('#2B2F38', 0.6, 0.3), up, [X(700), ELEV / 2, Z(518)]);
    // railing along the open right-hand edge of the mezzanine
    for (let y = 10; y <= 510; y += 62.5) tube([X(700) - 0.08, ELEV, Z(y)], [X(700) - 0.08, ELEV + 1.0, Z(y)], 0.025, M.chrome(), up);
    tube([X(700) - 0.08, ELEV + 1.0, Z(10)], [X(700) - 0.08, ELEV + 1.0, Z(510)], 0.03, M.steel(), up);
    const rg = mesh(boxG(0.02, 0.8, 500 * SCALE), glass, up, [X(700) - 0.08, ELEV + 0.5, Z(260)]); rg.castShadow = false;
    // mirrors: ground level along the back wall, and upstairs
    const mirM = new T.MeshStandardMaterial({ map: mirrorTexture(), roughness: 0.05, metalness: 0.35 });
    const mirror = (x, base, parent) => { box(1.9, 1.9, 0.04, M.frame(), parent, [X(x), base + 1.45, Z(0) + 0.02]); const mm = mesh(new T.PlaneGeometry(1.8, 1.8), mirM, parent, [X(x), base + 1.45, Z(0) + 0.045]); mm.castShadow = false; };
    for (let x = 70; x < 1800; x += 122) { if (x > 700 && x < 1000) continue; if (x > 1100 && x < 1240) continue; mirror(x, 0, R); }
    for (let x = 70; x < 700; x += 122) mirror(x, ELEV, up);
    // signs and posters
    box(2.3, 1.2, 0.08, std('#15171C', 0.6), R, [X(925), 4.9, Z(0) + 0.04]);
    sign(R, [{ t: "BIG GAZ'S GYM", size: 120, c: '#FFC93C' }, { t: 'EST. LAST TUESDAY', size: 54, c: '#F4F1EA', weight: '700' }], 2.2, 1.0, [X(925), 4.9, Z(0) + 0.09], null, { bg: '#15171C', border: '#FF8A2B' }, true);
    sign(R, [{ t: 'MOST GAINS WINS', size: 90, c: '#15171C' }], 2.6, 0.42, [X(850), 1.7, Z(0) + 0.06], null, { bg: '#FFC93C' });
    const clock = group(R, [X(925), 6.0, Z(0) + 0.05]);
    mesh(cylG(0.28, 0.28, 0.05, 20), std('#F4F1EA', 0.5), clock, null, [Math.PI / 2, 0, 0]); mesh(new T.TorusGeometry(0.28, 0.03, 6, 20), M.black(), clock);
    box(0.02, 0.2, 0.02, M.black(), clock, [0, 0.08, 0.03]); box(0.14, 0.02, 0.02, M.black(), clock, [0.06, 0, 0.03], [0, 0, -0.5]);
    const w1W = X(1150) - 0.01, w1E = X(1180) + 0.01;
    sign(R, [{ t: 'NO PAIN', size: 110 }, { t: 'NO GAIN', size: 110 }], 1.2, 1.6, [w1W, 2.3, Z(560)], [0, -Math.PI / 2, 0], { bg: '#E2544B', fg: '#FFFFFF' });
    sign(R, [{ t: 'PLEASE', size: 70, c: '#15171C' }, { t: 'WIPE DOWN', size: 90, c: '#15171C' }, { t: 'EQUIPMENT', size: 90, c: '#15171C' }, { t: "(we know you won't)", size: 40, c: '#4C5361', weight: '700' }], 1.3, 1.3, [w1W, 2.3, Z(760)], [0, -Math.PI / 2, 0], { bg: '#F4F1EA', border: '#15171C' });
    sign(R, [{ t: 'LEG ROOM', size: 100, c: '#15171C' }, { t: 'straight ahead ↑', size: 60, c: '#15171C', weight: '700' }], 1.4, 0.7, [w1E, 2.1, Z(980)], [0, Math.PI / 2, 0], { bg: '#FFC93C' });
    sign(R, [{ t: 'NEVER', size: 90 }, { t: 'SKIP', size: 90 }, { t: 'LEG DAY', size: 90 }], 1.2, 1.6, [w1E, 2.2, Z(620)], [0, Math.PI / 2, 0], { bg: '#2F6FE0', fg: '#FFFFFF' });
    const rwx = X(1800) - 0.01;
    sign(R, [{ t: 'NO EXCUSES', size: 120, c: '#FFC93C' }], 3.2, 0.7, [rwx, 2.6, Z(190)], [0, -Math.PI / 2, 0], { bg: '#15171C' });
    sign(up, [{ t: 'INTERNATIONAL', size: 70, c: '#FFFFFF' }, { t: 'CHEST DAY', size: 110, c: '#FFC93C' }, { t: 'every day', size: 50, c: '#F4F1EA', weight: '700' }], 1.6, 1.2, [X(0) + 0.01, ELEV + 2.0, Z(250)], [0, Math.PI / 2, 0], { bg: '#E2544B' });
    const winM = new T.MeshStandardMaterial({ color: '#BFE6F5', emissive: '#87C5DF', emissiveIntensity: 0.55, roughness: 0.2 });
    [150, 400, 650, 900].forEach(y => { const w = box(0.04, 1.2, 1.8, winM, R, [rwx - 0.02, 5.2, Z(y)]); w.castShadow = false; });
    [700, 900].forEach(y => { const w = box(0.04, 1.2, 1.8, winM, R, [X(0) + 0.03, 5.2, Z(y)]); w.castShadow = false; });
    [200, 520, 1330, 1650].forEach(x => { const w = box(2.4, 1.1, 0.04, winM, R, [X(x), 7.7, Z(0) + 0.03]); w.castShadow = false; });
    [150, 400, 650, 900].forEach(y => { const w = box(0.04, 1.0, 1.8, winM, R, [rwx - 0.02, 7.7, Z(y)]); w.castShadow = false; });
    sign(R, [{ t: 'GAINS', size: 210, c: '#FFC93C' }, { t: 'LOADING...', size: 96, c: '#F4F1EA' }], 5.4, 2.1, [X(0) + 0.012, 7.5, Z(800)], [0, Math.PI / 2, 0], { bg: '#22252B' });
    box(0.08, 0.82, 1.4, M.black(), R, [rwx - 0.04, 2.3, Z(60) + 1.0]);
    sign(R, [{ t: 'GYM TV', size: 60, c: '#FFFFFF' }, { t: 'leg day highlights', size: 40, c: '#9BE89F', weight: '700' }], 1.3, 0.72, [rwx - 0.09, 2.3, Z(60) + 1.0], [0, -Math.PI / 2, 0], { bg: '#22324A' }, true);
    PROPS(R, up, sh);
    up.userData.noMerge = true;
    if (opts && opts.raw) return { R, up, restMats };   // used by blender/capture_room.js
    roomSwap(R, up);
    // soft contact shadows baked in Blender, multiplied over the ground floor
    if (ASSETS.floorAO) {
      const ao = mesh(new T.PlaneGeometry(Wd, Dp), new T.MeshBasicMaterial({ map: ASSETS.floorAO, blending: T.MultiplyBlending, transparent: true, premultipliedAlpha: true, depthWrite: false }), R, [0, 0.004, 0], [-Math.PI / 2, 0, 0]);
      ao.castShadow = ao.receiveShadow = false; ao.renderOrder = -1;
    }
    mergeStatic(R); mergeStatic(up);
    return { R, up, restMats };
  }
  // Swap the room's plain shapes for the Blender-built room (same rule as blender/capture_room.js)
  const roomShape = o => o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.map && !o.material.transparent && !(o.material.emissive && o.material.emissive.getHex());
  function roomSwap(R, up) {
    const man = MANIFEST.__room, src = ASSETS.room;
    if (!man || !src) return;
    const all = []; R.traverse(o => all.push(o));
    if (all.length !== man.count) { console.warn('Room model out of date - using the built-in room'); return; }
    const inst = glbInstance('room', '#888888');
    const parts = [['room', R], ['up', up]].map(([n, par]) => [inst.getObjectByName(n), par]);
    if (parts.some(p => !p[0])) return;
    man.removed.forEach(i => { const o = all[i]; if (o.parent) o.parent.remove(o); });
    parts.forEach(([node, par]) => { node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1); node.userData.noMerge = true; par.add(node); });
  }
  // Bake all non-moving, untextured meshes into one mesh per material (far fewer draw calls on phones)
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), kill = [];
    root.traverse(o => {
      if (!o.isMesh || o.material.transparent || o.material.map || o.geometry.getAttribute('color')) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.noMerge) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const k = o.material.uuid + '|' + o.castShadow;
      if (!buckets.has(k)) buckets.set(k, { mat: o.material, cast: o.castShadow, geos: [] });
      buckets.get(k).geos.push(g); kill.push(o);
    });
    kill.forEach(o => o.parent.remove(o));
    buckets.forEach(b => {
      let n = 0; b.geos.forEach(g => n += g.attributes.position.count);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let off = 0;
      b.geos.forEach(g => { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; });
      const m = new T.BufferGeometry();
      m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('normal', new T.BufferAttribute(nor, 3)); m.setAttribute('uv', new T.BufferAttribute(uv, 2));
      m.computeBoundingSphere();
      const mesh = new T.Mesh(m, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; root.add(mesh);
    });
  }
  const restMats = [];
  function PROPS(R, up, sh) {
    sh.REST.forEach(r => {
      const [x, y3, z] = map3(r.x, r.y), par = r.x >= 1900 ? up : R;
      // big blue rest circle on the floor
      const fillM = new T.MeshBasicMaterial({ color: '#3FA9F5', transparent: true, opacity: 0.32, depthWrite: false });
      const edgeM = new T.MeshBasicMaterial({ color: '#8FD3FF', transparent: true, opacity: 0.9, depthWrite: false });
      const disc = mesh(new T.CircleGeometry(r.r * SCALE, 40), fillM, par, [x, y3 + 0.02, z], [-Math.PI / 2, 0, 0]); disc.castShadow = disc.receiveShadow = false;
      const edge = mesh(new T.RingGeometry(r.r * SCALE - 0.1, r.r * SCALE, 48), edgeM, par, [x, y3 + 0.022, z], [-Math.PI / 2, 0, 0]); edge.castShadow = edge.receiveShadow = false;
      const lbl = sign(par, [{ t: 'REST', size: 150, c: 'rgba(255,255,255,.85)' }], 1.1, 0.42, [x, y3 + 0.03, z + r.r * SCALE * 0.62], [-Math.PI / 2, 0, 0], { bg: 'none' }); lbl.material.transparent = true; lbl.material.depthWrite = false;
      restMats.push(fillM, edgeM);
      if (r.n === 'Stretch mat') {
        const mat = box(r.r * 2 * SCALE, 0.04, r.r * 1.4 * SCALE, std('#3F9E92', 0.9), R, [x, 0.02, z]); mat.castShadow = false;
        [-0.5, 0.2].forEach((dx, i) => mesh(cylG(0.08, 0.08, 0.5, 12), std(i ? '#FF8A2B' : '#2F6FE0', 0.6), R, [x + dx, 0.12, z + 0.5], [0, 0, Math.PI / 2]));
        mesh(sphG(0.33, 16), std('#B07CFF', 0.4), R, [x + 1.1, 0.35, z - 0.3]);
        kettlebell(R, [x - 1.2, 0.04, z - 0.5], 1, '#E2544B'); kettlebell(R, [x - 0.9, 0.04, z - 0.55], 0.8);
      } else cooler(par, [x, y3, z]);
    });
    sh.TREADS.forEach(t => { const [x, y3, z] = map3(t.x + t.w / 2, t.y + t.h / 2); treadmill(up, [x, y3, z]); });
    const [dx, , dz] = map3(sh.DESK.x + sh.DESK.w / 2, sh.DESK.y + sh.DESK.h / 2);
    desk(R, [dx, 0, dz]);
    [[30, 80], [1770, 40], [1120, 1070], [670, 40]].forEach(([x, y], i) => { const [a, , b] = map3(x, y); plant(i === 3 ? up : R, [a, i === 3 ? ELEV : 0, b], 1.1); });
    const [bx, , bz] = map3(1120, 940);
    const basket = group(R, [bx, 0, bz]);
    mesh(cylG(0.32, 0.26, 0.55, 12), std('#C9A15A', 0.9), basket, [0, 0.275, 0]);
    for (let i = 0; i < 4; i++) box(0.3, 0.08, 0.22, std('#F4F1EA', 0.9), basket, [Math.sin(i) * 0.08, 0.58 + i * 0.03, Math.cos(i * 2) * 0.06], [0.2 * i, i, 0.1]);
    for (let i = 0; i < 7; i++) { const [a, , b] = map3(1120, 330 + i * 26); kettlebell(R, [a, 0, b], 0.7 + i * 0.07, ['#2B2F38', '#E2544B', '#2F6FE0', '#FFC93C'][i % 4]); }
    const [mx, , mz] = map3(1775, 250);
    const mb = group(R, [mx, 0, mz]); box(0.4, 1.4, 1.2, M.frame(), mb, [0, 0.7, 0]);
    [0.35, 0.8, 1.25].forEach((y, j) => [-0.35, 0, 0.35].forEach((z, i) => mesh(sphG(0.15, 10), std(['#2FBF71', '#E2544B', '#FFC93C'][(i + j) % 3], 0.6), mb, [-0.12, y, z])));
    const [cx3, , cz3] = map3(1345, 335); const cb = group(R, [cx3, 0, cz3]); mesh(cylG(0.18, 0.15, 0.3, 12), std('#F4F1EA', 0.6), cb, [0, 0.15, 0]); mesh(cylG(0.17, 0.17, 0.02, 12), std('#FFFFFF', 1), cb, [0, 0.29, 0]);
    const [ix, , iz] = map3(700, 1070); const bin = group(R, [ix, 0, iz]); mesh(cylG(0.2, 0.17, 0.6, 12), std('#2F8F8A', 0.6), bin, [0, 0.3, 0]);
    // furniture (collides, see SHARED.DECOR) and wall details
    (sh.DECOR || []).forEach(d => {
      const upd = d.x >= 1900, [x, y3, z] = map3(d.x + d.w / 2, d.y + d.h / 2), par = upd ? up : R;
      if (d.k === 'plyo') plyo(par, [x, y3, z]);
      else if (d.k === 'tree') plateTree(par, [x, y3, z], d.w < 50 ? 0.85 : 1);
      else if (d.k === 'bench') spareBench(par, [x, y3, z], Math.PI / 2);
    });
    { const [a, , b] = map3(300, 0); cableRack(R, [a, 0, b + 0.06]); }
    [[1450, 0, 0], [1750, 0, 0], [980, 0, 0]].forEach(([x, y, r]) => { const [a, , b] = map3(x, y); wallFan(R, [a, 2.9, b + 0.02], r); });
    [[1790, 120, -Math.PI / 2], [10, 1080, Math.PI / 2]].forEach(([x, y, r]) => { const [a, , b] = map3(x, y); speaker(R, [a, 3.0, b], r); });
    // Brand-new props modelled in Blender (blender/gc_props.py). The simple stand-ins below are what you
    // see without the Blender room; with it, each stand-in is swapped for the real model at the same spot.
    const ex = (par, k, mx, my, rot, stand) => { const [x, y3, z] = map3(mx, my); const g = group(par, [x, y3, z], [0, rot || 0, 0]); g.userData.extra = k; if (stand) stand(g); return g; };
    const vend = ex(R, 'vending', 1128, 830, -Math.PI / 2, g => box(1.0, 1.9, 0.82, std('#D23A2F', 0.45, 0.2), g, [0, 1.0, -0.01]));
    mesh(new T.PlaneGeometry(0.6, 1.08), new T.MeshStandardMaterial({ map: vendTex(), emissive: '#ffffff', emissiveMap: vendTex(), emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1 }), vend, [-0.14, 1.16, 0.405]).castShadow = false;
    sign(vend, [{ t: 'ICE COLD GAINS', size: 130, c: '#FFFFFF' }], 0.94, 0.15, [0, 1.835, 0.426], null, { bg: '#D23A2F' }, true);
    sign(vend, [{ t: 'INSERT $$$', size: 120, c: '#9BE89F' }], 0.17, 0.06, [0.34, 1.62, 0.446], null, { bg: '#0E1A22' }, true);
    ex(R, 'bag', 368, 908, 0, g => { mesh(cylG(0.19, 0.19, 1.1, 16), std('#B22A24', 0.5), g, [0.12, 1.03, 0]); sq([-0.45, 0, 0], [-0.45, 2.4, 0], 0.08, M.frame(), g); sq([-0.49, 2.35, 0], [0.25, 2.35, 0], 0.07, M.frame(), g); box(1.1, 0.06, 0.9, M.frame(), g, [0, 0.03, 0]); });
    ex(R, 'ropes', 712, 1080, Math.PI, g => { const rm = std('#3B3F46', 0.9); tube([-2.4, 0.02, 0.35], [0, 0.03, -0.3], 0.019, rm, g); tube([-1.6, 0.02, 0.55], [0, 0.03, -0.3], 0.019, rm, g); });
    const bagStand = g => box(0.62, 0.28, 0.3, std('#24324A', 0.8), g, [0, 0.14, 0]);
    ex(R, 'gymbag', 1132, 712, Math.PI / 2, bagStand); ex(up, 'gymbag', 2030, 330, Math.PI / 2, bagStand);
    const [lx, , lz] = map3(560, 560);
    const d1 = dumbbell(0.7, '#9C6ADE', R); d1.position.set(lx, 0.1, lz); d1.rotation.y = 0.8;
    const d2 = dumbbell(0.7, '#9C6ADE', R); d2.position.set(lx + 0.5, 0.1, lz + 0.2); d2.rotation.y = 2.2;
  }

  out.G3 = { loadAssets, ASSETS, T, SCALE, toWorld, M, std, mesh, box, group, span, tube, sq, pad, plate, barbell, dumbbell, textTex, sign, makeChar, POSE, buildMachine, buildRoom, buildShell, shellUpdate, map3, heightAt, ELEV, SKINS, HAIRS, MB };
})(window);
