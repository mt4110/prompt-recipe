import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeVersionError} from './check-node.mjs';
test('unsupported versions receive an actionable error before test flags are used',()=>{for(const v of ['20.19.0','22.17.0'])assert.match(nodeVersionError(v),/requires Node.js >=22.18.0/);for(const v of ['22.18.0','24.0.0','26.9.0'])assert.equal(nodeVersionError(v),null);});
test('test launcher exits with the version message before spawning a test process', async()=>{
 const {spawnSync}=await import('node:child_process');
 const runner=new URL('./run-tests.mjs',import.meta.url).href;
 const code=`Object.defineProperty(process.versions,'node',{value:'20.19.0'}); import(${JSON.stringify(runner)});`;
 const result=spawnSync(process.execPath,['-e',code],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/requires Node.js >=22.18.0/);assert.doesNotMatch(result.stderr,/bad option|Unknown or unexpected option/);
});
