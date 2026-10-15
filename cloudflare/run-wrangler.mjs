import{createRequire}from'node:module';
import{dirname,resolve}from'node:path';import{spawnSync}from'node:child_process';
const require=createRequire(import.meta.url);
if(process.platform!=='linux'||process.arch!=='x64')throw Error('Native hosting toolchain requires Linux x64');
const root=dirname(require.resolve('wrangler/package.json'));
const tool=createRequire(resolve(root,'package.json'));
const esbuild=createRequire(tool.resolve('esbuild/package.json'));
const miniflare=createRequire(tool.resolve('miniflare/package.json'));
const workerd=createRequire(miniflare.resolve('workerd/package.json'));
const env={...process.env,WRANGLER_SEND_METRICS:'false',
 ESBUILD_BINARY_PATH:esbuild.resolve('@esbuild/linux-x64/bin/esbuild'),
 MINIFLARE_WORKERD_PATH:workerd.resolve('@cloudflare/workerd-linux-64/bin/workerd')};
// Use registry-pinned optional binaries directly. No dependency lifecycle scripts run.
const result=spawnSync(process.execPath,[resolve(root,'bin/wrangler.js'),...process.argv.slice(2)],{env,stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
