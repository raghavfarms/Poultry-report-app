import fs from 'fs';
import path from 'path';

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full);
    } else if (/\.(jsx?|tsx?|json|txt|md)$/.test(f)) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('Cold Room') || content.includes('Cold room') || content.includes('Laying Shed')) {
        console.log(`Found in: ${full}`);
      }
    }
  }
}
searchDir(path.resolve('..'));

