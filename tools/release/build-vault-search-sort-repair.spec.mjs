import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {patchVerifiedSources,buildRepair,BASE_IMAGE} from './build-vault-search-sort-repair.mjs';
const dir=fileURLToPath(new URL('./fixtures/vault-search-sort-repair/',import.meta.url));
async function inputs(){return {controller:await readFile(join(dir,'deployed-vault-read.controller.js')),service:await readFile(join(dir,'deployed-vault-read.service.js'))};}
function load(source){const exports={};const noop=()=>()=>{};const common=new Proxy({BadRequestException:class extends Error{},ForbiddenException:class extends Error{}},{get:(o,k)=>o[k]??noop});vm.runInNewContext(source,{exports,require:name=>name==='@nestjs/common'?common:new Proxy({},{get:()=>class {}}),Buffer,console});return exports;}
test('rejects unpinned compiled inputs before transformation',()=>assert.throws(()=>patchVerifiedSources({controller:Buffer.from('drift'),service:Buffer.from('drift')}),/INPUT_HASH_MISMATCH/));
test('actual controller supports only sort extension and preserves inactive/date validation',async()=>{
 const patched=patchVerifiedSources(await inputs());
 const parse=vm.runInNewContext(patched.controller.slice(patched.controller.indexOf('function parseSearch('),patched.controller.indexOf('function parseVersions('))+';parseSearch',{object:v=>v,exactKeys:(v,keys)=>assert.deepEqual(Object.keys(v).sort(),Array.from(keys).sort()),invalid:()=>Error('invalid'),optionalDate:v=>v,matterId:v=>v,principalAccountLedgerId:()=> 'actor',page:v=>v});
 const body={principal:{tenant_id:'tenant',user_id:'actor'},query:'Timesheet',lawos_matter_id:null,current_version_only:true,date_from:null,date_to:null,date_basis:'created',page:1,page_size:50};
 for(const sort of ['relevance','updated_desc','updated_asc','title_asc','matter_asc','type_asc'])assert.equal(parse({...body,sort_by:sort}).sortBy,sort);
 assert.equal(parse(body).sortBy,null);assert.equal(parse({...body,sort_by:null}).sortBy,null);
 for(const patch of [{sort_by:'bad'},{sort_by:''},{sort_by:1},{mime_type:'text/plain'},{body_q:'secret'},{date_from:'2026-01-01',date_basis:'created'}])assert.throws(()=>parse({...body,...patch}));
 assert.equal(parse({...body,date_from:'2026-01-01',date_basis:'modified'}).dateBasis,'modified');
});
test('actual service preserves projection pagination, forwards sorting and denies invalid principal',async()=>{
 const patched=patchVerifiedSources(await inputs());const {AmicOsVaultReadService:Class}=load(patched.service);const service=Object.create(Class.prototype),calls=[];
 service.config={uploadAuthorityRef:()=> 'test-authority',uploadProviderRevision:()=> 'test-revision'};service.tenantContext={require:()=>({source:'amic-os-provider',tenantId:'tenant'})};service.resolveLawosMatter=async()=> 'vault-matter';service.projectExactVersions=async(_p,rows)=>rows.filter(r=>!r.denied);
 const records=Array.from({length:52},(_,i)=>({document_id:`doc-${i}`,denied:i===0}));
 service.searchService={search:async(_ctx,input)=>{calls.push(input);return {results:records.slice((input.page-1)*50,input.page*50)};}};
 const principal={tenantId:'tenant',actorUserId:'actor',accountLedgerId:'actor'},input={accountLedgerId:'actor',lawosMatterId:'matter',page:1,pageSize:50,query:'Timesheet',dateFrom:null,dateTo:null,dateBasis:'created',sortBy:'updated_desc'};
 await assert.rejects(()=>service.read({...principal,tenantId:'other'},input));assert.equal(calls.length,0);
 await assert.rejects(()=>service.read({...principal,accountLedgerId:'other'},input));assert.equal(calls.length,0);
 const first=await service.read(principal,input);assert.equal(first.items.length,50);assert.equal(first.page_info.has_more,true);assert.ok(first.items.every(r=>!r.denied));assert.ok(calls.every(c=>c.sortBy==='updated_desc'&&c.filters.matterId==='vault-matter'));
 const second=await service.read(principal,{...input,page:2});assert.equal(second.items.length,1);assert.equal(second.page_info.has_more,false);
 calls.length=0;await service.read(principal,{...input,sortBy:null});assert.equal(calls[0].sortBy,'relevance');
 for(const sortBy of ['updated_desc',null,undefined]){calls.length=0;await service.read(principal,{...input,query:null,sortBy,dateBasis:'modified',dateFrom:'2026-10-01',dateTo:'2026-10-07'});assert.equal(calls[0].sortBy,'updated_desc');assert.equal(calls[0].filters.dateFrom,'2026-10-01T00:00:00.000Z');assert.equal(calls[0].filters.dateTo,'2026-10-07T23:59:59.999Z');assert.equal(calls[0].filters.versionStatus,'current');assert.equal(calls[0].filters.matterId,'vault-matter');}
});
test('output creation is exclusive and manifest/base are pinned',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vault-sort-test-'));try{const outputDir=join(root,'output');const args={controllerPath:join(dir,'deployed-vault-read.controller.js'),servicePath:join(dir,'deployed-vault-read.service.js'),outputDir};const manifest=await buildRepair(args);assert.equal(manifest.base_image,BASE_IMAGE);assert.equal(Object.keys(manifest.files).length,2);await assert.rejects(()=>buildRepair(args));await access(join(outputDir,'manifest.json'));}finally{await rm(root,{recursive:true,force:true});}
});
