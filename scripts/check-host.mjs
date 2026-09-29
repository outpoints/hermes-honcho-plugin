// Exercise the real host REST bridge and Electron profile mapper offline.
// No gateway, SSH process, live home, or Honcho connection is opened.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert(process.env.HERMES_SOURCE && process.env.SCREENSHOT_WORK_DIR, 'Set HERMES_SOURCE and SCREENSHOT_WORK_DIR.')
const source = resolve(process.env.HERMES_SOURCE)
const src = join(source, 'apps/desktop/src')
const hostRequire = createRequire(join(source, 'package.json'))
const { build } = hostRequire('esbuild')
await mkdir(process.env.SCREENSHOT_WORK_DIR, { recursive: true })
const work = await mkdtemp(join(resolve(process.env.SCREENSHOT_WORK_DIR), 'honcho-host-'))
const plugin = await readFile(join(repo, 'desktop/plugin.js'), 'utf8')
const imports = plugin.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1].split(',').map(s => s.trim())
const ui = imports.filter(name => !['atom', 'host', 'useValue', 'queryClient'].includes(name))
const shim = `import { atom } from 'nanostores'; import { QueryClient } from '@tanstack/react-query';
export {atom}; export const queryClient=new QueryClient({defaultOptions:{queries:{gcTime:0}}});
export const useValue=atom=>atom.get();
export const host={state:{},profileRoutes:async()=>globalThis.fixtureRoutes};
${ui.map(name => `export const ${name}=()=>{};`).join('\n')}`
const entry = `
import assert from 'node:assert/strict';
import plugin,{useFocusScope,requestForFocus} from 'fixture-plugin';
import {host,atom,queryClient} from '@hermes/plugin-sdk';
import {pluginRest} from ${JSON.stringify(join(src, 'api/plugins.ts'))};
import {setApiRequestProfile,setApiRequestConnection} from ${JSON.stringify(join(src, 'api/client.ts'))};
import {pathForRegistryBackendRequest} from ${JSON.stringify(join(source, 'apps/desktop/electron/connection-config.ts'))};
import {buildRegistryProfileRoutes} from ${JSON.stringify(join(source, 'apps/desktop/electron/plugin-profile-routes.ts'))};
const values={profile:'desktop-alias',focusedSessionProfile:'desktop-alias',focusedSessionOwner:{connectionId:'demo-ssh',profile:'desktop-alias'},connectionId:'demo-ssh',focusedStoredSessionId:'demo-session',focusedSessionId:'demo-runtime',cwd:'/srv/demo',busy:false,awaitingResponse:false};
host.state=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,atom(v)]));
globalThis.fixtureRoutes=buildRegistryProfileRoutes({agents:[{connectionId:'demo-ssh',profile:'desktop-alias'},{connectionId:'local',profile:'desktop-alias'}],sources:[{id:'demo-ssh',kind:'ssh',remoteProfile:'research'},{id:'local',kind:'local'}]});
setApiRequestConnection('demo-ssh'); setApiRequestProfile('desktop-alias');
const seen=[];
globalThis.window={hermesDesktop:{api:async request=>{
 assert.equal(request.connectionId,'demo-ssh'); assert.equal(request.profile,'desktop-alias');
 const path=pathForRegistryBackendRequest(request.path,request.profile,{mode:'ssh',remoteProfile:'research'});
 assert.equal(new URL(path,'http://fixture').searchParams.get('profile'),'research');
 if(request.body){assert.equal(request.body.profile,'research');assert.equal(request.body.focused_profile,'research');}
 seen.push(request); return {ok:true};
}}};
plugin.register({rest:(path,opts)=>pluginRest(plugin.id,path,opts),registerMany(){},onDispose(){}});
const focus=useFocusScope();
for(const endpoint of ['/snapshot','/messages','/conclusions','/context','/search','/scopes','/activity','/upload-ticket']) await requestForFocus(focus,endpoint,{method:'POST',body:focus.body});
const bytes=new TextEncoder().encode('Synthetic SSH upload fixture').buffer;
await requestForFocus({...focus,backendProfile:'research'},'/uploads/demo-ticket',{method:'POST',upload:{filename:'demo.txt',contentType:'text/plain',bytes},timeoutMs:125000});
assert.equal(seen.at(-1).upload.bytes,bytes); assert.equal(seen.at(-1).timeoutMs,125000);
const count=seen.length;
window.hermesDesktop.api=async()=>{throw new Error('Remote companion missing')};
await assert.rejects(requestForFocus(focus,'/snapshot',{method:'POST',body:focus.body}),/Remote companion missing/);
assert.equal(seen.length,count);
queryClient.clear();
console.log(JSON.stringify({host_transport_checks:count,ssh_alias:'desktop-alias -> research',multipart_bytes_preserved:true,missing_companion_no_fallback:true,live_ssh_tested:false}));
`
try {
  await build({ stdin: { contents: entry, resolveDir: repo }, outfile: join(work, 'check.mjs'), bundle: true, platform: 'node', format: 'esm', alias: { '@': src }, nodePaths: [join(source, 'node_modules')], plugins: [{ name: 'host-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(fixture-plugin|@hermes\/plugin-sdk)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'fixture-plugin' ? plugin + '\nexport {useFocusScope,requestForFocus}' : shim, resolveDir: src, loader: 'js' }))
  } }] })
  await import(pathToFileURL(join(work, 'check.mjs')))
} finally { await rm(work, { recursive: true, force: true }) }
