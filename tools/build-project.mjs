import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { bundleLua } from './bundle-lua.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { code, moduleCount } = await bundleLua({root:path.join(root,'src'),entry:'main',out:path.join(root,'dist/click-paimon.lua')});
const save = JSON.parse(await fs.readFile(path.join(root,'game/ui.save.json'),'utf8'));
if(save.assets.scripts.length!==1) throw Error('Expected exactly one entry script');
Object.assign(save.assets.scripts[0],{path:'dist/click-paimon.lua',source:code});
await fs.writeFile(path.join(root,'dist/click-paimon.save.json'),JSON.stringify(save,null,2)+'\n');
await fs.writeFile(path.join(root,'dist/build.json'),JSON.stringify({entry:'src/main.lua',modules:moduleCount,sha256:createHash('sha256').update(code).digest('hex'),lua:'dist/click-paimon.lua',save:'dist/click-paimon.save.json'},null,2)+'\n');
console.log(`Built ${moduleCount} modules -> dist/click-paimon.lua and dist/click-paimon.save.json`);
