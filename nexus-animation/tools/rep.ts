import {repCell, TYPES} from '../src/scene/Tissue';
for (const t of TYPES) { const c = repCell(t); console.log(t, c?.pos.toArray().map(v=>v.toFixed(1))); }
