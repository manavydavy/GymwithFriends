// Lists the distinct shapes a character is made of (see blender/gc_char.py).
// Run: node blender/capture_char.js path/to/three.js  -> writes models/char.json and prints the Blender input
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global; global.THREE = require(path.resolve(process.argv[2]));
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
global.document = { createElement: () => ({ getContext: () => ctx2d }) };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'gym3d.js'), 'utf8'));
const c = G3.makeChar({ shades: true, chain: true });
const sigs = {}, parts = [];
c.group.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry, sig = g.type + JSON.stringify(g.parameters);
  if (sigs[sig]) return;
  sigs[sig] = 'p' + parts.length;
  parts.push({ name: sigs[sig], type: g.type, p: JSON.parse(JSON.stringify(g.parameters)) });
});
fs.writeFileSync(path.join(__dirname, '..', 'models', 'char.json'), JSON.stringify({ sigs }));
process.stdout.write(JSON.stringify(parts));
