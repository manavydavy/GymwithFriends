// Captures the gym building's plain shapes (walls, stairs, lockers, desk, props...) for blender/gc_room.py.
// Textured, see-through and glowing things (floor, signs, mirrors, glass, windows, screens) stay built-in.
// Run: node blender/capture_room.js path/to/three.js > spec_room.json   (also updates models/machines.json "__room")
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global; global.THREE = require(path.resolve(process.argv[2]));
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {}, measureText: () => ({ width: 10 }) }) });
global.document = { createElement: () => ({ getContext: () => ctx2d }) };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'gym3d.js'), 'utf8'));
global.SHARED = require(path.join(__dirname, '..', 'shared.js'));
const T = THREE, scene = new T.Scene();
const { R, up } = G3.buildRoom(scene, SHARED, { raw: true });
R.updateMatrixWorld(true);
const all = []; R.traverse(o => all.push(o));
const roomShape = o => o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.map && !o.material.transparent && !(o.material.emissive && o.material.emissive.getHex());
const inUp = o => { for (let p = o; p; p = p.parent) if (p === up) return true; return false; };
const shapes = [], removed = [];
all.forEach((o, i) => {
  if (!roomShape(o)) return;
  const owner = inUp(o) ? 'up' : 'room';
  const base = owner === 'up' ? up : R;
  const rel = new T.Matrix4().copy(base.matrixWorld).invert().multiply(o.matrixWorld);
  const m = o.material, hex = '#' + m.color.getHexString(), g = o.geometry;
  shapes.push({ i, owner, type: g.type, p: g.parameters, m: rel.elements.map(x => +x.toFixed(5)), mat: { c: hex, r: +m.roughness.toFixed(2), mt: +m.metalness.toFixed(2) } });
  removed.push(i);
});
const manPath = path.join(__dirname, '..', 'models', 'machines.json');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
man.__room = Object.assign({}, man.__room || {}, { count: all.length, removed, owners: ['room', 'up'] });
fs.writeFileSync(manPath, JSON.stringify(man));
process.stdout.write(JSON.stringify({ count: all.length, shapes }));
