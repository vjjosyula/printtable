import * as THREE from 'three';
import {worldAt} from '../src/scene/state';
import {cameraAt} from '../src/scene/camera';
const frames=process.argv.slice(2).map(Number);
for (const f of frames){
  const w=worldAt(f); const c=cameraAt(f);
  const cam=new THREE.PerspectiveCamera(c.fov,1080/1350,0.1,1e6);
  cam.position.copy(c.pos); cam.lookAt(c.target); cam.updateMatrixWorld();
  const offY=0.085;
  const P=(p:THREE.Vector3,r:number,name:string)=>{const d=p.distanceTo(c.pos);const q=p.clone().project(cam);
    const sx=(q.x+1)/2, sy=(1-q.y)/2+offY; const size=r/(d*Math.tan(c.fov*Math.PI/360))/2; return `${name}[${sx.toFixed(2)},${sy.toFixed(2)} h${size.toFixed(2)}${q.z>1?' BEHIND':''}]`;};
  const parts=[];
  for (const n of w.nucs) if ([3,4,5,6,8,100,112].includes(n.id)) parts.push(P(n.C.clone().add(n.coreOffset),6.5,'N'+n.id));
  if (w.writer.visible>0) parts.push(P(w.writer.pos,5.5,'W'));
  if (w.pol1.visible>0) parts.push(P(w.pol1.pos,10.5,'P1'));
  if (w.pol2.visible>0) parts.push(P(w.pol2.pos,10.5,'P2'));
  console.log(f, 'cam',c.pos.toArray().map(v=>v.toFixed(0)).join(','), parts.join(' '));
}
