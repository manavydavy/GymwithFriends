// Gym Colonisers 3D asset library (three.js r128).
// Everything is built from simple shapes in code: no model files to download.
// Units are metres. Layout matches the 2D game map: X = right, Z = towards the front of the gym.
(function (out) {
  const T = THREE, V3 = T.Vector3, UP = new V3(0, 1, 0);
  const SCALE = 0.02; // 2D map pixels -> metres
  const toWorld = (x, y) => [(x - 750) * SCALE, (y - 460) * SCALE];

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
    x.fillStyle = o.bg; x.fillRect(0, 0, o.w, o.h);
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
        faceM.color.set(o.skin).lerp(new T.Color('#E8402F'), t * 0.85);
        P.head.scale.setScalar(1 + t * 0.1);
      },
      setColour(c) { shirtM.color.set(c); }
    };
    return api;
  }
  // Ready-made poses
  const POSE = {
    stand(ph, spd, opts) {
      spd = spd || 0; const s = Math.sin(ph || 0) * spd, b = Math.abs(Math.sin(ph || 0)) * spd;
      const crossed = opts && opts.crossed;
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
  function buildMachine(m, groupColour) {
    const b = MB[TYPE[m.name]](groupColour);
    const [x, z] = toWorld(m.x + m.w / 2, m.y + m.h / 2);
    b.g.position.set(x, 0, z);
    b.def = m;
    return b;
  }

  // ---------- the gym room ----------
  function floorTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = '#3A3D46'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    for (let i = 0; i < 110; i++) { x.fillStyle = ['#5E8FB0', '#B05E5E', '#C9A15A', '#7FB07F'][i % 4]; x.globalAlpha = 0.35; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 2); }
    x.globalAlpha = 1; x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(30 / 1.5, 18.4 / 1.5); t.anisotropy = 8;
    return t;
  }
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
  function kettlebell(p, pos, s, col) {
    const g = group(p, pos); g.scale.setScalar(s);
    mesh(sphG(0.12, 10), std(col || '#2B2F38', 0.5, 0.3), g, [0, 0.11, 0], null, [1, 0.9, 1]);
    mesh(new T.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), std(col || '#2B2F38', 0.5, 0.3), g, [0, 0.2, 0]);
    return g;
  }
  function buildRoom(scene, shared) {
    const R = new T.Group(); scene.add(R);
    const W = 30, D = 18.4, H = 3.4;
    // floor
    const fl = mesh(new T.PlaneGeometry(W, D), new T.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 }), R, [0, 0, 0], [-Math.PI / 2, 0, 0]);
    fl.castShadow = false;
    // walls: teal dado, orange stripe, cream top
    const wallM = std('#EFE3CF', 0.9), dado = std('#2F8F8A', 0.85), stripe = std('#FF8A2B', 0.7), skirting = std('#22252B', 0.8);
    function wall(len, pos, rotY, opts) {
      const g = group(R, pos, [0, rotY, 0]);
      box(len, H - 1.12, 0.2, wallM, g, [0, 1.12 + (H - 1.12) / 2, 0]);
      box(len, 1.04, 0.22, dado, g, [0, 0.52 + 0.04, 0]);
      box(len, 0.08, 0.24, stripe, g, [0, 1.1, 0]);
      box(len, 0.08, 0.24, skirting, g, [0, 0.04, 0]);
      box(len, 0.08, 0.26, std('#D9CCB5', 0.8), g, [0, H, 0]);
      return g;
    }
    const back = wall(W, [0, 0, -D / 2 - 0.1], 0);
    wall(D, [-W / 2 - 0.1, 0, 0], Math.PI / 2);
    // right wall with a doorway
    const doorZ = toWorld(shared.DOOR.x, shared.DOOR.y)[1];
    const r1 = D / 2 + doorZ - 0.9, r2 = D / 2 - doorZ - 0.9;
    wall(r1, [W / 2 + 0.1, 0, -D / 2 + r1 / 2], -Math.PI / 2);
    wall(r2, [W / 2 + 0.1, 0, D / 2 - r2 / 2], -Math.PI / 2);
    const dg = group(R, [W / 2 + 0.1, 0, doorZ]);
    box(0.24, 2.4, 0.1, M.frame(), dg, [0, 1.2, -0.85]); box(0.24, 2.4, 0.1, M.frame(), dg, [0, 1.2, 0.85]); box(0.24, 0.12, 1.8, M.frame(), dg, [0, 2.4, 0]);
    box(0.2, H - 2.46, 1.8, wallM, dg, [0, 2.46 + (H - 2.46) / 2, 0]);
    const glass = new T.MeshStandardMaterial({ color: '#A8D8EA', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 });
    box(0.04, 2.3, 0.8, glass, dg, [0, 1.17, -0.42]).castShadow = false; box(0.04, 2.3, 0.8, glass, dg, [0.25, 1.17, 0.5], [0, -0.7, 0]).castShadow = false;
    sign(dg, [{ t: 'EXIT', size: 170, c: '#FFFFFF' }], 0.6, 0.22, [-0.13, 2.7, 0], [0, -Math.PI / 2, 0], { bg: '#1E9E4A' }, true);
    // low front wall so the camera can see in (dollhouse cut)
    const fr = group(R, [0, 0, D / 2 + 0.1]);
    box(W + 0.4, 0.55, 0.2, dado, fr, [0, 0.275, 0]); box(W + 0.4, 0.06, 0.24, stripe, fr, [0, 0.58, 0]);
    // mirrors along the back wall + big sign in the middle
    const mirM = new T.MeshStandardMaterial({ map: mirrorTexture(), roughness: 0.05, metalness: 0.35 });
    for (let i = 0; i < 12; i++) {
      if (i === 6) continue;
      const [mx] = toWorld(30 + i * 122 + 50, 0);
      box(1.9, 1.9, 0.04, M.frame(), back, [mx, 1.45, 0.12]);
      const mm = mesh(new T.PlaneGeometry(1.8, 1.8), mirM, back, [mx, 1.45, 0.145]); mm.castShadow = false;
    }
    const [sx] = toWorld(850, 0);
    box(2.3, 1.2, 0.08, std('#15171C', 0.6), back, [sx, 2.2, 0.14]);
    sign(back, [{ t: "BIG GAZ'S GYM", size: 120, c: '#FFC93C' }, { t: 'EST. LAST TUESDAY', size: 54, c: '#F4F1EA', weight: '700' }], 2.2, 1.0, [sx, 2.2, 0.19], null, { bg: '#15171C', border: '#FF8A2B' }, true);
    sign(back, [{ t: 'MOST GAINS WINS', size: 90, c: '#15171C' }], 2.2, 0.36, [sx, 1.22, 0.19], null, { bg: '#FFC93C' });
    // wall clock above sign
    const clock = group(back, [sx, 3.05, 0.14]);
    mesh(cylG(0.24, 0.24, 0.05, 20), std('#F4F1EA', 0.5), clock, null, [Math.PI / 2, 0, 0]);
    mesh(new T.TorusGeometry(0.24, 0.025, 6, 20), M.black(), clock);
    box(0.02, 0.17, 0.02, M.black(), clock, [0, 0.07, 0.03]); box(0.12, 0.02, 0.02, M.black(), clock, [0.05, 0, 0.03], [0, 0, -0.5]);
    // posters on the left wall
    const lw = group(R, [-W / 2 + 0.01, 0, 0], [0, Math.PI / 2, 0]);
    sign(lw, [{ t: 'NO PAIN', size: 110 }, { t: 'NO GAIN', size: 110 }], 1.2, 1.6, [-5, 2.2, 0], null, { bg: '#E2544B', fg: '#FFFFFF' });
    sign(lw, [{ t: 'PLEASE', size: 70, c: '#15171C' }, { t: 'WIPE DOWN', size: 90, c: '#15171C' }, { t: 'EQUIPMENT', size: 90, c: '#15171C' }, { t: '(we know you won\'t)', size: 40, c: '#4C5361', weight: '700' }], 1.3, 1.3, [1, 2.2, 0], null, { bg: '#F4F1EA', border: '#15171C' });
    sign(lw, [{ t: 'NEVER', size: 90 }, { t: 'SKIP', size: 90 }, { t: 'LEG DAY', size: 90 }], 1.2, 1.6, [6, 2.2, 0], null, { bg: '#2F6FE0', fg: '#FFFFFF' });
    // windows on the left wall
    const winM = new T.MeshStandardMaterial({ color: '#BFE6F5', emissive: '#87C5DF', emissiveIntensity: 0.55, roughness: 0.2 });
    [-7.5, -2, 3.5].forEach(z => { box(0.06, 1.0, 1.6, M.frame(), lw, [z, 2.3, 0.02], [0, Math.PI / 2, 0]); const w = box(0.04, 0.9, 1.5, winM, lw, [z, 2.3, 0.05], [0, Math.PI / 2, 0]); w.castShadow = false; });
    // right wall: banner + TV
    const rw = group(R, [W / 2 - 0.01, 0, 0], [0, -Math.PI / 2, 0]);
    sign(rw, [{ t: 'NO EXCUSES', size: 120, c: '#FFC93C' }], 3.2, 0.7, [4, 2.6, 0], null, { bg: '#15171C' });
    box(1.4, 0.82, 0.08, M.black(), rw, [-2.5, 2.3, 0.04]);
    sign(rw, [{ t: 'GYM TV', size: 60, c: '#FFFFFF' }, { t: 'leg day highlights', size: 40, c: '#9BE89F', weight: '700' }], 1.3, 0.72, [-2.5, 2.3, 0.09], null, { bg: '#22324A' }, true);
    // rubber zone mats + props
    REST_PROPS(R, shared);
    return R;
  }
  function REST_PROPS(R, shared) {
    // fountains at rest spots, stretch mat with rollers and a yoga ball
    shared.REST.forEach(r => {
      const [x, z] = toWorld(r.x, r.y);
      if (r.n === 'Stretch mat') {
        const mat = box(r.r * 2 * SCALE * 1.0, 0.04, r.r * 1.4 * SCALE, std('#3F9E92', 0.9), R, [x, 0.02, z]); mat.castShadow = false;
        [-0.5, 0.2].forEach((dx, i) => mesh(cylG(0.08, 0.08, 0.5, 12), std(i ? '#FF8A2B' : '#2F6FE0', 0.6), R, [x + dx, 0.12, z + 0.5], [0, 0, Math.PI / 2]));
        mesh(sphG(0.33, 16), std('#B07CFF', 0.4), R, [x + 1.1, 0.35, z - 0.3]);
        kettlebell(R, [x - 1.2, 0.04, z - 0.5], 1, '#E2544B'); kettlebell(R, [x - 0.9, 0.04, z - 0.55], 0.8);
      } else cooler(R, [x + (x < 0 ? -0.5 : 0.5), 0, z]);
    });
    shared.TREADS.forEach(t => { const [x, z] = toWorld(t.x + t.w / 2, t.y + t.h / 2); treadmill(R, [x, 0, z]); });
    const [tx, tz] = toWorld(380, 676);
    sign(R, [{ t: 'CARDIO', size: 120, c: '#FFFFFF' }, { t: '(nobody uses it)', size: 60, c: '#9AA0AB', weight: '700' }], 2.0, 0.55, [tx, 0.02, tz + 0.1], [-Math.PI / 2, 0, 0], { bg: '#2B2F38' });
    const [dx, dz] = toWorld(shared.DESK.x + shared.DESK.w / 2, shared.DESK.y + shared.DESK.h / 2);
    desk(R, [dx, 0, dz]);
    // plants, bins, towel basket, kettlebell row, medicine balls
    [[-14.3, -8.6], [14.3, -8.6], [-14.3, 8.5]].forEach(([x, z]) => plant(R, [x, 0, z], 1.1));
    const basket = group(R, [12.5, 0, 3.4]);
    mesh(cylG(0.32, 0.26, 0.55, 12), std('#C9A15A', 0.9), basket, [0, 0.275, 0]);
    for (let i = 0; i < 4; i++) box(0.3, 0.08, 0.22, std('#F4F1EA', 0.9), basket, [Math.sin(i) * 0.08, 0.58 + i * 0.03, Math.cos(i * 2) * 0.06], [0.2 * i, i, 0.1]);
    sign(basket, [{ t: 'USED TOWELS', size: 70, c: '#15171C' }], 0.6, 0.14, [0, 0.35, 0.33], null, { bg: '#F4F1EA' });
    for (let i = 0; i < 8; i++) kettlebell(R, [-14.4, 0, -6 + i * 0.5], 0.7 + i * 0.07, ['#2B2F38', '#E2544B', '#2F6FE0', '#FFC93C'][i % 4]);
    const mb = group(R, [-14.4, 0, 4.5]);
    box(0.4, 1.4, 1.2, M.frame(), mb, [0, 0.7, 0]);
    [0.35, 0.8, 1.25].forEach((y, j) => [-0.35, 0, 0.35].forEach((z, i) => mesh(sphG(0.15, 10), std(['#2FBF71', '#E2544B', '#FFC93C'][(i + j) % 3], 0.6), mb, [0.12, y, z])));
    // chalk bucket near the squat racks
    const cb = group(R, [6.6, 0, -4.2]); mesh(cylG(0.18, 0.15, 0.3, 12), std('#F4F1EA', 0.6), cb, [0, 0.15, 0]); mesh(cylG(0.17, 0.17, 0.02, 12), std('#FFFFFF', 1), cb, [0, 0.29, 0]);
    // bin
    const bin = group(R, [-3.8, 0, 3.4]); mesh(cylG(0.2, 0.17, 0.6, 12), std('#2F8F8A', 0.6), bin, [0, 0.3, 0]);
    // loose dumbbells on the floor (someone didn't rerack)
    const d1 = dumbbell(0.7, '#9C6ADE', R); d1.position.set(-4.6, 0.1, -3.9); d1.rotation.y = 0.8;
    const d2 = dumbbell(0.7, '#9C6ADE', R); d2.position.set(-4.1, 0.1, -3.7); d2.rotation.y = 2.2;
  }

  out.G3 = { T, SCALE, toWorld, M, std, mesh, box, group, span, tube, sq, pad, plate, barbell, dumbbell, textTex, sign, makeChar, POSE, buildMachine, buildRoom, SKINS, HAIRS, MB };
})(window);
