import {storyFrame} from '../src/lib/timeline';
import {cameraAt} from '../src/scene/camera';
for (const v of [1860,1920,1965,1980,2010,2040,2100]) { const s=storyFrame(v); const c=cameraAt(s); console.log(v, s.toFixed(1), 'dist', c.dist.toFixed(0)); }
