import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {patchVerifiedSources,buildRepair,BASE_IMAGE} from './build-vault-email-repair.mjs';
const dir=fileURLToPath(new URL('./fixtures/vault-email-repair/',import.meta.url));
const helperSource=await readFile(new URL('./vault-email-repair/email-read.cjs',import.meta.url),'utf8');
const inputs={controller:await readFile(join(dir,'controller.js')),service:await readFile(join(dir,'service.js'))};
const patched=patchVerifiedSources(inputs);
const injections=[];
const common=new Proxy({BadRequestException:class extends Error{},ForbiddenException:class extends Error{constructor(response){super(response.code);this.response=response;}},Inject:token=>(_target,_key,index)=>injections.push([index,token])},{get:(o,k)=>o[k]??(()=>()=>{})});
const dependencies=new Map();
function dependency(name){if(!dependencies.has(name))dependencies.set(name,new Proxy({},{get:(obj,key)=>obj[key]??(obj[key]=class{})}));return dependencies.get(name);}
function requireStub(name){
 if(name==='@nestjs/common')return common;
 if(name==='./email-read.cjs')return helper;
 if(name==='@amic-vault/shared')return {decodeEmlRawContent:buffer=>buffer.toString(),normalizeEmailMetadata:raw=>({participants:[{role:'from',normalizedAddress:raw.match(/From: ([^\r\n]+)/)?.[1]??'unknown@example.invalid'},{role:'to',normalizedAddress:'to@example.invalid'}]})};
 return dependency(name);
}
const module={exports:{}};vm.runInNewContext(helperSource,{module,require:requireStub,Buffer,console,setTimeout,clearTimeout});const helper=module.exports;
const exports={};vm.runInNewContext(patched.service,{exports,require:requireStub,Buffer,console});
const Class=exports.AmicOsVaultReadService;
const parse=vm.runInNewContext(patched.controller.slice(patched.controller.indexOf('function parseSearch('),patched.controller.indexOf('function parseVersions('))+';parseSearch',{require:requireStub,object:v=>v,exactKeys:(v,keys)=>assert.deepEqual(Object.keys(v).sort(),Array.from(keys).sort()),invalid:()=>Error('invalid'),optionalDate:v=>v,matterId:v=>v,principalAccountLedgerId:()=> 'actor',page:(v,max)=>{if(!Number.isInteger(v)||v<1||v>max)throw Error('page');return v;}});
const body={principal:{},query:null,lawos_matter_id:null,current_version_only:true,date_from:null,date_to:null,date_basis:'created',page:1,page_size:50,mime_type:'message/rfc822'};
const principal={tenantId:'tenant',actorUserId:'actor',accountLedgerId:'actor'};
function fixture(count=3){
 const service=Object.create(Class.prototype),calls=[],storageReads=[];
 const records=Array.from({length:count},(_,i)=>({documentId:`doc-${i}`,versionId:`v-${i}`,matterId:'matter',title:`Email ${i}`}));
 const rowFor=(id)=>{const i=Number(id.split('-')[1]);return {document_id:id,matter_id:'matter',version_id:`v-${i}`,email_id:`email-${i}`,subject:`Email ${i}`,sent_at:null,received_at:new Date(Date.UTC(2026,9,1,0,i)),filed_at:'2026-10-02T00:00:00Z',file_object_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,sha256:'a'.repeat(64),size_bytes:'100',mime_type:'message/rfc822',normalized_filename:`mail-${i}.eml`,storage_uri:`private-${i}`};};
 service.config={uploadAuthorityRef:()=> 'authority',uploadProviderRevision:()=> 'revision'};
 service.tenantContext={require:()=>({source:'amic-os-provider',tenantId:'tenant'})};service.resolveLawosMatter=async()=> 'matter';
 service.searchService={search:async(_ctx,input)=>{calls.push(input);return {results:input.query?.includes('@')?[]:records.slice((input.page-1)*50,input.page*50)};}};
 service.projectExactVersions=async(_p,rows)=>rows.map(r=>({document_id:r.documentId,version_id:r.versionId,mime_type:'text/plain',file_object_id:'body-file',title:r.title}));
 service.auditService={transaction:async(tenant,fn)=>{assert.equal(tenant,'tenant');return fn({query:async(sql,params)=>{assert.match(sql,/d.tenant_id=\$1::uuid/);assert.match(sql,/raw.sha256=em.raw_sha256/);return {rows:params[1].map(rowFor)};}});}};
 service.permissionService={canReadMatter:async()=>({effect:'ALLOW'}),canReadDocument:async()=>({effect:'ALLOW'})};
 service.storageService={getByStorageUri:async(tenant,uri)=>{storageReads.push([tenant,uri]);return {body:Readable.from(['From: sender@example.invalid\r\nTo: to@example.invalid\r\n\r\n'])};}};
 return {service,calls,storageReads,records};
}
test('pins compiled inputs and preserves existing dependency positions while adding explicit DI',()=>{
 assert.throws(()=>patchVerifiedSources({...inputs,service:Buffer.from('drift')}),/INPUT_HASH/);
 const args=Array.from({length:11},()=>({})),instance=new Class(...args);
 assert.equal(instance.auditService,args[0]);assert.equal(instance.documentVersions,args[8]);assert.equal(instance.permissionService,args[9]);assert.equal(instance.storageService,args[10]);
 assert.equal(injections.find(([index])=>index===9)[1],dependency('../../permission/permission.service').PermissionService);
 assert.equal(injections.find(([index])=>index===10)[1],dependency('../../storage/storage.service').StorageService);
});
test('actual patched controller accepts email contract and rejects dropped or invalid semantics',()=>{
 const input=parse({...body,email_date_basis:'received_at',email_sort:'sent_at',email_sort_order:'asc',email_direction:'received'});
 assert.equal(input.emailCriteria.dateBasis,'received_at');
 for(const change of [{email_sort:'bad'},{email_sort_order:''},{email_direction:'bad'},{date_basis:'modified'},{date_from:'2026-10-02',date_to:'2026-10-01'},{body_q:'secret'},{query:'partial@'},{page:0},{metadata_codes:['code'],code_basis:'legacy'}])assert.throws(()=>parse({...body,...change}));
 const {mime_type,...normal}=body;assert.equal(parse({...normal,sort_by:'title_asc'}).sortBy,'title_asc');assert.throws(()=>parse({...normal,mime_type:'application/pdf'}));
});
test('global timestamp sort precedes paging across source pages, keeps source exact bytes and KST bounds',async()=>{
 const {service,calls}=fixture(51);const first=await service.read(principal,parse({...body,page_size:1}));assert.equal(first.items[0].document_id,'doc-50');assert.equal(first.page_info.has_more,true);
 const second=await service.read(principal,parse({...body,page:2,page_size:1}));assert.equal(second.items[0].document_id,'doc-49');assert.ok(calls.every(c=>c.filters.documentType[0]==='email'&&c.filters.versionStatus==='current'&&!c.filters.dateFrom));
 assert.equal(first.items[0].mime_type,'text/plain');assert.equal(first.items[0].email_source.exact_version.mime_type,'message/rfc822');assert.equal(first.items[0].email_source.exact_version.version_id,'v-50');assert.equal(JSON.stringify(first).includes('private-'),false);
 const excluded=await service.read(principal,parse({...body,date_from:'2026-09-30',date_to:'2026-09-30'}));assert.equal(excluded.items.length,0);
 const included=await service.read(principal,parse({...body,date_from:'2026-10-01',date_to:'2026-10-01',email_sort_order:'asc'}));assert.equal(included.items[0].document_id,'doc-0');
});
test('principal, tenant and document permission failures happen before any storage read',async()=>{
 const {service,calls,storageReads}=fixture();await assert.rejects(()=>service.read({...principal,tenantId:'other'},parse(body)));assert.equal(calls.length,0);
 service.permissionService.canReadDocument=async()=>({effect:'DENY'});const result=await service.read(principal,parse(body));assert.equal(result.items.length,0);assert.equal(storageReads.length,0);
 service.permissionService.canReadDocument=async()=>{throw Error('policy');};await assert.rejects(()=>service.read(principal,parse(body)),error=>error.response?.code==='PERMISSION_DENIED');assert.equal(storageReads.length,0);
});
test('direction and complete address filters retained; failed headers never expose data',async()=>{
 const {service,calls}=fixture();assert.equal((await service.read(principal,parse({...body,email_direction:'sent'}))).items.length,0);
 assert.equal((await service.read(principal,parse({...body,query:'other@example.invalid'}))).items.length,0);
 assert.equal((await service.read(principal,parse({...body,query:'sender@example.invalid'}))).items.length,3);assert.ok(calls.every(call=>!call.query?.includes('@')));
 service.storageService.getByStorageUri=async()=>{throw Error('private failure');};await assert.rejects(()=>service.read(principal,parse(body)));
});
test('output has exactly three pinned runtime files and exclusive output directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vault-email-test-'));try{const outputDir=join(root,'output');const options={controllerPath:join(dir,'controller.js'),servicePath:join(dir,'service.js'),outputDir};const result=await buildRepair(options);assert.equal(result.base_image,BASE_IMAGE);assert.equal(Object.keys(result.files).length,3);await assert.rejects(()=>buildRepair(options));}finally{await rm(root,{recursive:true,force:true});}
});

test('candidate and header work caps fail explicitly without partial results',async()=>{
 const denied=fixture(1001);denied.service.permissionService.canReadDocument=async()=>({effect:'DENY'});await assert.rejects(()=>denied.service.read(principal,parse(body)));assert.equal(denied.storageReads.length,0);
 const headers=fixture(257);await assert.rejects(()=>headers.service.read(principal,parse(body)));assert.equal(headers.storageReads.length,256);
});
test('overall deadline destroys a stalled header stream and late storage responses',async()=>{
 const fastModule={exports:{}};vm.runInNewContext(helperSource,{module:fastModule,require:requireStub,Buffer,console,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout});
 const {service}=fixture(1);let stream=new Readable({read(){}});service.storageService.getByStorageUri=async()=>({body:stream});await assert.rejects(()=>fastModule.exports.readEmail(service,principal,parse(body)));assert.equal(stream.destroyed,true);
 let resolveStorage;stream=new Readable({read(){}});service.storageService.getByStorageUri=()=>new Promise(resolve=>{resolveStorage=resolve;});await assert.rejects(()=>fastModule.exports.readEmail(service,principal,parse(body)));resolveStorage({body:stream});await new Promise(resolve=>setImmediate(resolve));assert.equal(stream.destroyed,true);
});
