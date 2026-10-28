import { spawnSync } from 'node:child_process';
import { requireSupportedNode } from './check-node.mjs';
requireSupportedNode();
const result=spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...process.argv.slice(2)], {stdio:'inherit'});
if(result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
