// Usage: node stills.mjs outDir comp frame1 frame2 ...
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const [outDir, comp, ...frames] = process.argv.slice(2);
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browser = await openBrowser('chrome', {
  browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  chromiumOptions: {gl: 'angle'},
});
const composition = await selectComposition({serveUrl, id: comp, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}});
for (const fr of frames) {
  const t0 = Date.now();
  const output = path.join(outDir, `f${String(fr).padStart(3, '0')}.png`);
  await renderStill({serveUrl, composition, frame: Number(fr), output, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 240000});
  console.log('frame', fr, (Date.now() - t0) / 1000, 's');
}
await browser.close({silent: true});
