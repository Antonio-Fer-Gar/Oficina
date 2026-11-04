import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
const bundles: Parameters<typeof Bun.build>[0][] = [
  { entrypoints: ['src/main.ts'], target: 'node', format: 'cjs', naming: 'main.cjs', external: ['electron'] },
  { entrypoints: ['src/preload.ts'], target: 'node', format: 'cjs', naming: 'preload.cjs', external: ['electron'] },
  { entrypoints: ['src/renderer.ts'], target: 'browser', format: 'iife', naming: 'renderer.js' },
  { entrypoints: ['src/bridge/worker.ts'], target: 'bun', format: 'esm', naming: 'worker.js' },
  { entrypoints: ['src/terminal-launcher.ts'], target: 'bun', format: 'esm', naming: 'terminal-launcher.js' },
  { entrypoints: ['src/app-update-helper.ts'], target: 'bun', format: 'esm', naming: 'app-update-helper.js' },
  { entrypoints: ['src/bridge/extension.ts'], target: 'bun', format: 'esm', naming: 'extension.js', external: ['@oh-my-pi/pi-coding-agent'] },
];
for (const options of bundles) {
  const result = await Bun.build({ ...options, outdir: 'dist', minify: false, sourcemap: 'none' });
  if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1); }
}
for (const [from, to] of [['src/index.html', 'index.html'], ['src/style.css', 'style.css'],
  ['assets/nter-logo.png', 'nter-logo.png'], ['assets/notification.wav', 'notification.wav']]) copyFileSync(from!, 'dist/' + to);
console.log('dist ready');
