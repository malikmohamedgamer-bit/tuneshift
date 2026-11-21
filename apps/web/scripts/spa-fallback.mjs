// GitHub Pages SPA fallback: unknown paths serve 404.html, which is a copy of index.html,
// so deep links like /tuneshift/s/<code> boot the app and the router takes over.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const index = join(dir, 'index.html');
if (!existsSync(index)) {
  console.error(`spa-fallback: ${index} not found`);
  process.exit(1);
}
copyFileSync(index, join(dir, '404.html'));
// Pages runs Jekyll by default, which drops files/folders starting with "_".
writeFileSync(join(dir, '.nojekyll'), '');
console.log('spa-fallback: wrote 404.html and .nojekyll');
