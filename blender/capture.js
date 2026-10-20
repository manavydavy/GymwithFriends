// Reads the built-in 3D machines from gym3d.js and writes a JSON description of every shape,
// so Blender can rebuild them at higher quality (blender/gc_build.py).
// Run: node blender/capture.js path/to/three.js > out.json   (three.js r128 build, not the minified one is fine too)
// Moving parts are found automatically: any node whose transform or visibility changes during a rep.
const fs = require('fs'), path = require('path'), vm = require('vm');
const threePath = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(',') : null;
global.window = global;
global.THREE = require(path.resolve(threePath));
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
global.document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'gym3d.js'), 'utf8'));
const G = global.G3, T = THREE;
const GC = '#ab12cd'; // stand-in for the muscle-group colour

function nodes(root) { const a = []; root.traverse(o => a.push(o)); return a; }
const key = o => o.matrix.elements.map(x => x.toFixed(5)).join(',') + (o.visible ? 'v' : 'h');

function capture(type) {
  const b = G.MB[type](GC);
  const all = nodes(b.g);
  const states = [[0, false], [0, true], [0.35, true], [0.7, true], [1, true]];
  const seen = all.map(() => new Set());
  states.forEach(([L, u]) => { b.set(L, u); b.g.updateMatrixWorld(true); all.forEach((o, i) => { o.updateMatrix(); seen[i].add(key(o)); }); });
  b.set(0, false); b.g.updateMatrixWorld(true); all.forEach(o => o.updateMatrix());
  const dynamic = all.map((o, i) => i > 0 && seen[i].size > 1);
  const idx = new Map(all.map((o, i) => [o, i]));
  const owners = new Set(['root']), shapes = [], removed = [];
  all.forEach((o, i) => {
    if (!o.isMesh || dynamic[i]) return;              // stretched cables etc. stay as they are
    const m = o.material;
    if (Array.isArray(m) || m.map || !m.isMeshStandardMaterial) return; // signs keep their canvas textures
    let p = o.parent, owner = 'root';
    while (p && p !== b.g) { if (dynamic[idx.get(p)]) { owner = idx.get(p); break; } p = p.parent; }
    const ownerObj = owner === 'root' ? b.g : all[owner];
    const rel = new T.Matrix4().copy(ownerObj.matrixWorld).invert().multiply(o.matrixWorld);
    const g = o.geometry, gp = g.parameters || {};
    const hex = '#' + m.color.getHexString();
    shapes.push({ i, owner, type: g.type, p: gp, m: rel.elements.map(x => +x.toFixed(6)),
      mat: { c: hex === GC ? 'gc' : hex, r: +m.roughness.toFixed(2), mt: +m.metalness.toFixed(2) },
      ...(dynamic[idx.get(o.parent)] || o.parent === b.g ? {} : {}) });
    removed.push(i); owners.add(owner);
    // world transform of each owner in its rest pose (for previews and baking in Blender)
  });
  const ownerInfo = {};
  owners.forEach(k => { const ob = k === 'root' ? b.g : all[k]; ownerInfo[k] = ob.matrixWorld.elements.map(x => +x.toFixed(6)); });
  return { type, count: all.length, removed, owners: ownerInfo, shapes };
}

const types = only || ['bench', 'incline', 'dbrack', 'preacher', 'smith', 'pec', 'shoulder', 'latpull', 'row', 'cable', 'legpress', 'legext', 'latraise'];
const out = {};
types.forEach(t => { out[t] = capture(t); });
process.stdout.write(JSON.stringify(out));
