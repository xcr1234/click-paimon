import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createWebServer } from 'beyond-simulator-web';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await createWebServer({workspace:root,port:0});
const api=async(action,args={})=>{
  const r=await fetch(`${server.url}/editor/api/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'public-export',...args})});
  const data=await r.json();
  if(!r.ok||!data.ok) throw Error(`${action}: ${JSON.stringify(data)}`);
  return data.value;
};
try {
  await api('load-archive',{path:'dist/click-paimon.save.json'});
  const exported=await api('export',{format:'gia-combined'});
  await fs.writeFile(path.join(root,'dist/click-paimon.gia'),Buffer.from(exported.data,'base64'));
  const imported=await api('import',{sessionId:'public-roundtrip',format:'gia',filename:'click-paimon.gia',data:exported.data});
  const snapshot=imported.snapshot;
  assert.equal(snapshot.scripts.length,1,'one entry mapping after roundtrip');
  const lua=await api('export',{sessionId:'public-roundtrip',format:'lua',assetType:snapshot.scripts[0].id});
  assert.equal(Buffer.from(lua.data,'base64').toString('utf8'),await fs.readFile(path.join(root,'dist/click-paimon.lua'),'utf8'));
  await fs.writeFile(path.join(root,'dist/export-report.json'),JSON.stringify({sourceMatches:true,warnings:exported.warnings??[]},null,2)+'\n');
  console.log(`Exported dist/click-paimon.gia; ${exported.warnings?.length??0} exporter notes in dist/export-report.json`);
} finally {await server.close();}
