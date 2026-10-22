import {worldAt} from '../src/scene/state';
for (const f of [326,340,346,356,366]) { const w=worldAt(f); const r=w.rna; console.log(f, w.pol1.pos.toArray().map(v=>v.toFixed(1)).join(','), r? `rna end ${r.slice(-3).join(',')} n=${r.length/3}`:''); }
