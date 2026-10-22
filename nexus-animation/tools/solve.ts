import * as THREE from 'three';
import {worldAt} from '../src/scene/state';
// For a frame, find yaw/dist/target that frame the listed objects inside the safe area below the caption.
type Obj = {p: THREE.Vector3; r: number};
function objs(f: number, names: string[]): Obj[] {
  const w = worldAt(f);
  const out: Obj[] = [];
  for (const n of names) {
    if (n.startsWith('N')) { const nn = w.nucs.find((x) => x.id === Number(n.slice(1)))!; out.push({p: nn.C.clone().add(nn.coreOffset), r: 7}); }
    if (n === 'W') out.push({p: w.writer.pos.clone(), r: 5.5});
    if (n === 'P1') out.push({p: w.pol1.pos.clone(), r: 11});
    if (n === 'P2') out.push({p: w.pol2.pos.clone(), r: 11});
    if (n === 'COIL') out.push({p: new THREE.Vector3(215, 0, 0), r: 26});
  }
  return out;
}
const [fs, pitchS, ...names] = process.argv.slice(2);
const f = Number(fs); const pitch = Number(pitchS);
const os = objs(f, names);
const cen = os.reduce((a, o) => a.add(o.p), new THREE.Vector3()).multiplyScalar(1 / os.length);
let best: any = null;
const fov = 34, aspect = 1080 / 1350, offY = 0.085;
for (let yaw = -1.6; yaw <= 0.6; yaw += 0.05)
  for (let d = 25; d <= 220; d *= 1.04)
    for (let dx = -30; dx <= 30; dx += 5) for (let dy = -6; dy <= 6; dy += 3) {
      const t = cen.clone().add(new THREE.Vector3(dx, dy, 0));
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1e5);
      cam.position.copy(t).addScaledVector(dir, d); cam.lookAt(t); cam.updateMatrixWorld();
      let ok = true; let minSize = 1e9;
      for (const o of os) {
        const q = o.p.clone().project(cam);
        const dd = o.p.distanceTo(cam.position);
        const h = o.r / (dd * Math.tan((fov * Math.PI) / 360)) / 2; // fraction of height (radius)
        const sx = (q.x + 1) / 2, sy = (1 - q.y) / 2 + offY;
        const hx = h / aspect;
        if (q.z > 1 || sx - hx < 0.07 || sx + hx > 0.93 || sy - h < 0.36 || sy + h > 0.95) { ok = false; break; }
        minSize = Math.min(minSize, h);
      }
      if (ok && (!best || minSize > best.minSize)) best = {yaw: +yaw.toFixed(2), d: +d.toFixed(0), t: t.toArray().map((v) => +v.toFixed(0)), minSize: +minSize.toFixed(3)};
    }
console.log(f, names.join(','), JSON.stringify(best));
