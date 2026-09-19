import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../audit/audit.service';
import { AuditMetadataNormalizer } from '../../audit/audit-metadata.normalizer';
import { PermissionEventRecorder } from '../../audit/permission-event.recorder';
import { DocumentService } from '../../document/document.service';
import { DocumentVersionService } from '../../document/document-version.service';
import { DocumentUploadService } from '../../document/document-upload.service';
import { VersionNumberResolver } from '../../document/version-number.resolver';
import { FileObjectService } from '../../storage/file-object.service';
import { FilePromotionService } from '../../file-security/file-promotion.service';
import { FileSecurityService } from '../../file-security/file-security.service';
import { QuarantineIntakeService } from '../../file-security/quarantine-intake.service';
import { PermissionService } from '../../permission/permission.service';
import { DocumentPermissionService } from '../../permission/document-permission.service';
import { FailClosedPermissionWrapper } from '../../permission/fail-closed.wrapper';
import { WallMembershipReader } from '../../permission/wall-membership.reader';
import { TenantContextService } from '../../tenant/tenant-context';
import { UserService } from '../../user/user.service';
import { MatterSourcePolicyService } from '../matter-app/matter-source-policy';
import { AmicOsVaultEditorController } from './amic-os-vault-editor.controller';
import { AmicOsVaultEditorService } from './amic-os-vault-editor.service';
import { AmicOsVaultDocumentCopyService } from './amic-os-vault-document-copy.service';
import { AmicOsVaultUploadService } from './amic-os-vault-upload.service';
import { AmicOsVaultProviderConfig, AmicOsVaultProviderGuard } from './amic-os-vault-provider.guard';
import type { AmicOsVaultDocumentCopyBindingInput } from './amic-os-vault-editor.contract';

// Only the external scanner verdict is synthetic. The production scanner consumes and hashes every byte.
const scanner = vi.hoisted(() => ({ outcome: 'clean' }));
vi.mock('../../document/extraction/private-gateway.transport', () => ({
  fetchIngestionWorker: async (_path: string, input: RequestInit) => {
    await new Response(input.body).arrayBuffer();
    return Response.json({ outcome: scanner.outcome, engine_version: 'synthetic-test-scanner', signature_age_seconds: 0 });
  },
}));
const exec = promisify(execFile);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const otherUserId = '22222222-2222-4222-8222-222222222223';
const matterId = '33333333-3333-4333-8333-333333333333';
const workspaceId = '44444444-4444-4444-8444-444444444444';
const ddl = `
CREATE ROLE vault_app LOGIN;
CREATE TABLE synthetic_scan_jobs (payload jsonb);
CREATE TABLE tenants (tenant_id uuid PRIMARY KEY, slug text, status text);
CREATE TABLE users (tenant_id uuid, user_id uuid, role text, status text, practice_group text, PRIMARY KEY(tenant_id,user_id));
CREATE TABLE matters (tenant_id uuid, matter_id uuid, client_id uuid, matter_code text, updated_at timestamptz DEFAULT now(), status text, legal_hold boolean DEFAULT false,
 confidentiality_level text DEFAULT 'internal', practice_group text, access_scope text DEFAULT 'matter_team', metadata_json jsonb, PRIMARY KEY(tenant_id,matter_id));
CREATE TABLE matter_members (tenant_id uuid,matter_id uuid,user_id uuid,matter_role text,access_level text);
CREATE TABLE workspaces (tenant_id uuid,workspace_id uuid,status text,created_at timestamptz DEFAULT now());
CREATE TABLE ethical_walls (tenant_id uuid,wall_id uuid,matter_id uuid,status text);
CREATE TABLE ethical_wall_memberships (tenant_id uuid,wall_id uuid,subject_type text,subject_id uuid,membership_type text);
CREATE TABLE group_members (tenant_id uuid,group_id uuid,user_id uuid);
CREATE TABLE permissions (tenant_id uuid,permission_id uuid,resource_type text,resource_id uuid,action text,subject_type text,
 subject_id text,effect text,condition_json jsonb,priority integer,valid_from timestamptz,valid_to timestamptz);
CREATE TABLE documents (tenant_id uuid,document_id uuid,matter_id uuid,document_family_id uuid,title text,status text,
 document_type text,subtype text,confidentiality_level text,privilege_status text,source text,ai_allowed boolean,
 folder_id uuid,legal_hold boolean DEFAULT false,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(), PRIMARY KEY(tenant_id,document_id));
CREATE TABLE file_objects (tenant_id uuid,file_object_id uuid,storage_uri text,original_filename text,normalized_filename text,
 mime_type text,size_bytes bigint,sha256 text,encryption_key_id text,source_system text,created_by uuid,created_at timestamptz DEFAULT now(), PRIMARY KEY(tenant_id,file_object_id));
CREATE TABLE document_versions (tenant_id uuid,version_id uuid DEFAULT gen_random_uuid(),document_id uuid,file_object_id uuid,file_hash text,
 version_no integer DEFAULT 1,version_status text DEFAULT 'current',created_by uuid,created_at timestamptz DEFAULT now(),supersedes_version_id uuid,
 version_label text,version_significance text,rendition_type text,base_clean_version_id uuid,PRIMARY KEY(tenant_id,version_id));
CREATE TABLE audit_events (event_id uuid DEFAULT gen_random_uuid(),seq bigserial,tenant_id uuid,actor_type text,actor_id uuid,session_id uuid,
 action text,target_type text,target_id uuid,matter_id uuid,result text,metadata_json jsonb,correlation_id text,retention_label text,created_at timestamptz DEFAULT now());
CREATE TABLE file_security_scans (tenant_id uuid,scan_id uuid DEFAULT gen_random_uuid(),matter_id uuid,quarantine_ref uuid,quarantine_storage_uri text,
 expected_sha256 text,size_bytes bigint,created_by uuid,state text DEFAULT 'quarantined',result_code text DEFAULT 'pending',observed_sha256 text,
 signature_at timestamptz,engine_version text,updated_at timestamptz DEFAULT now(),promoted_at timestamptz,PRIMARY KEY(tenant_id,scan_id),UNIQUE(tenant_id,quarantine_ref));
CREATE TABLE file_security_scan_attempts (tenant_id uuid,scan_id uuid,attempt_no integer,expected_sha256 text,state text,result_code text,
 observed_sha256 text,engine_version text,signature_at timestamptz,finished_at timestamptz);
CREATE TABLE file_security_promotion_inputs (tenant_id uuid,scan_id uuid,original_filename text,normalized_filename text,mime_type text,source_system text,created_by uuid,fields_json jsonb);
CREATE TABLE file_security_promotions (tenant_id uuid,scan_id uuid,document_id uuid,version_id uuid,file_object_id uuid,primary_sha256 text,promoted_by uuid,PRIMARY KEY(tenant_id,scan_id));
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO vault_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vault_app;
`;
const binary = {
  pdf: Buffer.from('%PDF-1.7 synthetic'),
  doc: Buffer.from('d0cf11e0a1b11ae1' + '00'.repeat(32), 'hex'),
  gif: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  webp: Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64'),
  jpg: Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70]),
  png: Buffer.from('\x89PNG\r\n\x1A\nsynthetic', 'latin1'),
};
const files: [string,string,Buffer][] = [
  ['txt','text/plain',Buffer.from('synthetic original')], ['csv','text/csv',Buffer.from('name,value\nsynthetic,1')],
  ['pdf','application/pdf',binary.pdf], ['doc','application/msword',binary.doc], ['xls','application/vnd.ms-excel',binary.doc],
  ['ppt','application/vnd.ms-powerpoint',binary.doc], ['gif','image/gif',binary.gif], ['webp','image/webp',binary.webp],
  ['jpg','image/jpeg',binary.jpg], ['png','image/png',binary.png],
  ...(['docx','xlsx','pptx'] as const).map((ext): [string,string,Buffer] => {
    const suffix = ext === 'docx' ? 'wordprocessingml.document' : ext === 'xlsx' ? 'spreadsheetml.sheet' : 'presentationml.presentation';
    const mime = `application/vnd.openxmlformats-officedocument.${suffix}`;
    const file = ext === 'docx' ? 'word/document.xml' : ext === 'xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml';
    return [ext,mime,Buffer.from(`PK\x03\x04[Content_Types].xml ${file} ${mime}`, 'latin1')];
  }),
];

describe('generic copies: actual HTTP, disposable PostgreSQL, production upload/scan/promotion and local synthetic storage', () => {
  let directory: string;
  let postgresBinDirectory = '';
  let admin: Pool;
  let pool: Pool;
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let origin: string;
  let copies: AmicOsVaultDocumentCopyService;
  let security: FileSecurityService;
  let tenant: TenantContextService;
  let sourceReady = true;
  const objects = new Map<string,{ path: string; mime: string; size: number }>();
  const storageUri = (t: string,q: string) => `s3://synthetic/tenants/${t}/quarantine/${q}`;
  let store: { [key: string]: unknown };
  beforeAll(async () => {
    try {
      postgresBinDirectory = (await exec('pg_config', ['--bindir'])).stdout.trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    directory = await mkdtemp(join(tmpdir(),'amic-copy-pg-'));
    const portServer = createServer();
    await new Promise<void>((done) => portServer.listen(0,'127.0.0.1',done));
    const port = (portServer.address() as {port:number}).port;
    await new Promise<void>((done) => portServer.close(() => done()));
    await exec(join(postgresBinDirectory,'initdb'),['-D',join(directory,'db'),'-A','trust','--no-locale','--encoding=UTF8','--username=copy_test_owner']);
    await exec(join(postgresBinDirectory,'pg_ctl'),['-D',join(directory,'db'),'-l',join(directory,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -k /tmp -F`,'-w','start']);
    admin = new Pool({connectionString:`postgresql://copy_test_owner@127.0.0.1:${port}/postgres`});
    await admin.query(ddl);
    const migrations = resolve(__dirname,'../../../../../../db/migrations');
    for (const name of ['0215_create_amic_os_office_copies.sql','0216_retain_amic_os_document_copy_snapshots.sql']) {
      const sql = await readFile(join(migrations,name),'utf8');
      await admin.query(sql.split('-- Down Migration')[0]!);
      if (name.startsWith('0216')) {
        await admin.query(sql.split('-- Down Migration')[1]!);
        await admin.query(sql.split('-- Down Migration')[0]!);
      }
    }
    pool = new Pool({connectionString:`postgresql://vault_app@127.0.0.1:${port}/postgres`,max:12});
    await admin.query(`INSERT INTO tenants VALUES ($1,'synthetic','active');`,[tenantId]);
    await admin.query(`INSERT INTO users VALUES ($1,$2,'matter_owner','active',NULL),($1,$3,'matter_owner','active',NULL)`,[tenantId,userId,otherUserId]);
    await admin.query(`INSERT INTO matters(tenant_id,matter_id,client_id,status,metadata_json) VALUES ($1,$2,$3,'active',$4)`,[tenantId,matterId,randomUUID(),{lawosMatterId:'synthetic-matter'}]);
    await admin.query(`INSERT INTO matter_members VALUES ($1,$2,$3,'owner','edit'),($1,$2,$4,'owner','edit')`,[tenantId,matterId,userId,otherUserId]);
    await admin.query(`INSERT INTO workspaces(tenant_id,workspace_id,status) VALUES($1,$2,'active')`,[tenantId,workspaceId]);
    const transaction = async <T>(id: string,work: (client:PoolClient)=>Promise<T>) => {
      const client=await pool.connect(); await client.query('BEGIN');
      try { await client.query("SELECT set_config('app.current_tenant_id',$1,true)",[id]); const result=await work(client); await client.query('COMMIT'); return result; }
      catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    };
    const database = {tenantTransaction:transaction,auditTransaction:transaction};
    tenant = new TenantContextService();
    const audit=new AuditService(tenant,new AuditMetadataNormalizer(),database as never);
    const wrapper=new FailClosedPermissionWrapper(new PermissionEventRecorder(audit));
    const permission=new PermissionService(wrapper,new WallMembershipReader(database as never),database as never,
      undefined,new DocumentPermissionService(wrapper,database as never));
    const policy=new MatterSourcePolicyService({status:async()=>({mode:'vault_native',
      uploadAuthoritative:sourceReady,sourceContractReady:sourceReady,sourceStale:false})} as never,permission,database as never);
    const put=async(uri:string,body:Readable,mime:string)=>{
      const bytes=Buffer.from(await new Response(Readable.toWeb(body) as ReadableStream).arrayBuffer());
      const path=join(directory,hashName(uri)); await writeFile(path,bytes); objects.set(uri,{path,mime,size:bytes.length});
      return {storageUri:uri,key:uri,encryptionKeyId:null};
    };
    const get=async(uri:string)=>{const obj=objects.get(uri);if(!obj)throw new Error('object missing');return {body:Readable.from([await readFile(obj.path)]),contentLength:obj.size,contentType:obj.mime};};
    store={quarantineStorageUri:storageUri,
      putQuarantineObject:async(i:{tenantId:string;quarantineRef:string;body:Readable;contentType:string})=>put(storageUri(i.tenantId,i.quarantineRef),i.body,i.contentType),
      putTenantObject:async(i:{tenantId:string;documentId:string;fileObjectId:string;body:Readable;contentType:string})=>put(`s3://synthetic/tenants/${i.tenantId}/documents/${i.documentId}/${i.fileObjectId}`,i.body,i.contentType),
      getByStorageUri:async(_t:string,uri:string)=>get(uri),
      headByStorageUri:async(_t:string,uri:string)=>{const o=objects.get(uri);return o?{contentLength:o.size,contentType:o.mime}:null;},
      sha256ByStorageUri:async(_t:string,uri:string)=>digest(await readFile(objects.get(uri)!.path)),
      getRangeByStorageUri:async(_t:string,uri:string,start:number,end:number)=>{const o=objects.get(uri)!;return {body:Readable.from([(await readFile(o.path)).subarray(start,end+1)]),contentLength:end-start+1,contentType:o.mime};},
      createQuarantineWriteUrl:async(i:{tenantId:string;quarantineRef:string;contentType:string})=>({url:`${origin}/synthetic-upload/${i.quarantineRef}`,headers:{'content-type':i.contentType},expiresAt:new Date(Date.now()+60000)}),
      deleteByStorageUri:async(_t:string,uri:string)=>{objects.delete(uri);},
    };
    const versions=new DocumentVersionService(audit,permission,tenant,new VersionNumberResolver());
    const upload=new DocumentUploadService(audit,new DocumentService(),versions,
      {findCandidates:async()=>[],findSafeUploadCandidates:async()=>[]} as never,new FileObjectService(database as never),permission,store as never,tenant,policy);
    const queue={enqueue:async(payload:unknown,tx:PoolClient)=>{await tx.query('INSERT INTO synthetic_scan_jobs VALUES($1::jsonb)',[JSON.stringify(payload)]);return 'synthetic-scan-job';}};
    const intake=new QuarantineIntakeService(audit,queue as never,policy,permission,store as never,tenant);
    const config={acceptsCredential:(value:unknown)=>value==='synthetic-internal-provider-token',uploadAuthorityRef:()=> 'amic-vault-api:synthetic',uploadProviderRevision:()=> 'single-install-upload-v1'};
    const uploads=new AmicOsVaultUploadService(audit,policy as never,intake,store as never,tenant,config as never);
    const editor=new AmicOsVaultEditorService(audit,{} as never,upload,permission,store as never,tenant,config as never);
    const promotion=new FilePromotionService(audit,database as never,upload,store as never,tenant);
    copies=new AmicOsVaultDocumentCopyService(audit,editor,uploads,promotion,queue as never,store as never,config as never);
    security=new FileSecurityService(audit,promotion,store as never);
    const users={findLoginCandidateByAccountLedgerId:async(id:string)=>{
      if(!['synthetic-user','synthetic-other','copy-owner'].includes(id))return null;
      const actor=id==='synthetic-other'?otherUserId:userId;
      return {tenant:{tenantId,slug:'synthetic',status:'active'},user:{tenantId,userId:actor,status:'active'}};
    }};
    @Module({controllers:[AmicOsVaultEditorController],providers:[
      {provide:AmicOsVaultEditorService,useValue:editor},{provide:AmicOsVaultDocumentCopyService,useValue:copies},
      {provide:AmicOsVaultProviderConfig,useValue:config},{provide:UserService,useValue:users},
      {provide:TenantContextService,useValue:tenant},AmicOsVaultProviderGuard]})
    class TestModule {}
    app=await NestFactory.create(TestModule,{logger:false});
    app.setGlobalPrefix('v1');
    app.use((req:{url:string;headers:Record<string,string>;on:Readable['on']},res:{statusCode:number;end:(body?:string)=>void},next:()=>void)=>{
      if(!req.url.startsWith('/synthetic-upload/'))return tenant.runRequest(next);
      const q=req.url.split('/').pop()!;
      void put(storageUri(tenantId,q),req as unknown as Readable,req.headers['content-type']!).then(()=>{res.statusCode=200;res.end();});
    });
    await app.listen(0,'127.0.0.1'); origin=await app.getUrl();
  },60000);
  afterAll(async()=>{await app?.close();await pool?.end();await admin?.end();if(directory){await exec(join(postgresBinDirectory,'pg_ctl'),['-D',join(directory,'db'),'-m','immediate','-w','stop']).catch(()=>{});await rm(directory,{recursive:true,force:true});}},30000);
  function hashName(value:string){return createHash('sha256').update(value).digest('hex');}
  async function post(action:string,input:unknown,user='synthetic-user') {
    return fetch(`${origin}/v1/integrations/amic-os/vault/edit/document-copy/${action}`,{method:'POST',headers:{'content-type':'application/json','x-amic-os-vault-provider-token':'synthetic-internal-provider-token','x-amic-os-account-ledger-id':user},body:JSON.stringify(input)});
  }
  async function source(ext:string,mime:string,bytes:Buffer):Promise<AmicOsVaultDocumentCopyBindingInput> {
    const doc=randomUUID(),version=randomUUID(),file=randomUUID(); const uri=`s3://synthetic/tenants/${tenantId}/source/${file}`;
    const path=join(directory,file);await writeFile(path,bytes);objects.set(uri,{path,mime,size:bytes.length});
    await admin.query(`INSERT INTO documents(tenant_id,document_id,matter_id,title,status,document_type,confidentiality_level,privilege_status,created_by)
      VALUES($1,$2,$3,'Synthetic source','draft','other','internal','none',$4)`,[tenantId,doc,matterId,userId]);
    await admin.query(`INSERT INTO file_objects(tenant_id,file_object_id,storage_uri,original_filename,normalized_filename,mime_type,size_bytes,sha256)
      VALUES($1,$2,$3,$4,$4,$5,$6,$7)`,[tenantId,file,uri,`source.${ext}`,mime,bytes.length,digest(bytes)]);
    await admin.query(`INSERT INTO document_versions(tenant_id,version_id,document_id,file_object_id,file_hash) VALUES($1,$2,$3,$4,$5)`,[tenantId,version,doc,file,digest(bytes)]);
    return {principal:{tenant_id:'synthetic-lawos',user_id:'synthetic-user'},lawos_matter_id:'synthetic-matter',
      requested_exact_version:{document_id:doc,version_id:version,file_object_id:file,sha256:digest(bytes),byte_size:bytes.length,mime_type:mime},
      copy_id:`document-copy:${randomUUID()}`,snapshot_id:`document-copy-snapshot:${randomUUID()}`};
  }
  async function scan(input:AmicOsVaultDocumentCopyBindingInput){
    const result=await admin.query('SELECT quarantine_ref,file_json FROM amic_os_document_copy_snapshots WHERE snapshot_id=$1',[input.snapshot_id]);
    const row=result.rows[0];await security.handle({tenantId,quarantineRef:row.quarantine_ref,expectedSha256:row.file_json.sha256});
  }
  async function jsonOk(action:string,input:unknown){const response=await post(action,input);const value=await response.json();expect(response.status,JSON.stringify(value)).toBe(200);return value;}
  for (const [ext,mime,bytes] of files) {
    it(`${ext}: clone and changed snapshot survive reselect, stay unpublished until commit and publish once`,async()=>{
      const input=await source(ext,mime,bytes);
      const same={...input,copy_id:`document-copy:${randomUUID()}`,snapshot_id:`document-copy-snapshot:${randomUUID()}`};
      await jsonOk('prepare',{...same,title:'Same byte copy',mode:'clone',file:null});await scan(same);
      const sameSaved=await jsonOk('commit',same);expect(sameSaved.exact_version.sha256).toBe(digest(bytes));
      const before=(await admin.query('SELECT count(*) FROM documents')).rows[0].count;
      const clone=await jsonOk('prepare',{...input,title:'Synthetic retained copy',mode:'clone',file:null});
      expect(clone.state).toBe('quarantined');
      expect((await post('commit',input)).status).toBe(400);
      await scan(input);
      const retained=await jsonOk('complete',input);expect(retained.state).toBe('retained');
      expect((await admin.query('SELECT count(*) FROM documents')).rows[0].count).toBe(before);
      const base={principal:input.principal,lawos_matter_id:input.lawos_matter_id,requested_exact_version:input.requested_exact_version};
      expect((await jsonOk('list',{...base,limit:50})).items[0].snapshot_id).toBe(input.snapshot_id);
      const chunk=await jsonOk('read',{...input,offset:0});expect(digest(Buffer.from(chunk.bytes_base64,'base64'))).toBe(digest(bytes));
      const changed=['gif','webp'].includes(ext)?Buffer.from(bytes):Buffer.concat([bytes,Buffer.from(' changed')]);
      // Change a payload byte while preserving the validator's minimal format signature.
      if(ext==='gif')changed[13]=42;else if(ext==='webp')changed[changed.length-1]=1;

      const next={...input,snapshot_id:`document-copy-snapshot:${randomUUID()}`};
      const prepared=await jsonOk('prepare',{...next,title:'Synthetic retained copy',mode:'upload',file:{filename:`changed.${ext}`,sha256:digest(changed),byte_size:changed.length,mime_type:mime}});
      expect(prepared.state).toBe('transfer_ready');
      expect((await fetch(prepared.upload_url,{method:'PUT',headers:prepared.required_headers,body:changed})).status).toBe(200);
      expect((await jsonOk('complete',next)).state).toBe('quarantined');await scan(next);
      expect((await jsonOk('complete',next)).state).toBe('retained');
      expect((await jsonOk('list',{...base,limit:50})).items).toHaveLength(3);
      expect((await admin.query('SELECT count(*) FROM documents')).rows[0].count).toBe(before);
      const saved=await jsonOk('commit',next);expect(saved.state).toBe('saved');expect(saved.exact_version.sha256).toBe(digest(changed));
      const replay=await jsonOk('commit',next);expect(replay.exact_version).toEqual(saved.exact_version);
      expect((await admin.query('SELECT count(*) FROM documents')).rows[0].count).toBe(String(Number(before)+1));
      const original=await admin.query('SELECT file_hash FROM document_versions WHERE version_id=$1',[input.requested_exact_version.version_id]);
      expect(original.rows[0].file_hash).toBe(digest(bytes));
      const provenance=await admin.query('SELECT source_document_id,source_version_id,final_snapshot_id FROM amic_os_office_copies WHERE copy_id=$1',[input.copy_id]);
      expect(provenance.rows[0]).toEqual({source_document_id:input.requested_exact_version.document_id,source_version_id:input.requested_exact_version.version_id,final_snapshot_id:next.snapshot_id});
    },30000);
  }
  it('paginates more than fifty generic snapshots without overlaps and rejects malformed or cross-source cursors',async()=>{
    const input=await source('txt','text/plain',Buffer.from('paginated recovery source'));
    await jsonOk('prepare',{...input,title:'Paginated recovery',mode:'clone',file:null});
    const base={principal:input.principal,lawos_matter_id:input.lawos_matter_id,requested_exact_version:input.requested_exact_version,limit:50};
    const timestamp='2026-09-20T00:00:00.123456Z';
    await admin.query('UPDATE amic_os_document_copy_snapshots SET created_at=$2 WHERE snapshot_id=$1',[input.snapshot_id,timestamp]);
    const added=Array.from({length:105},()=>`document-copy-snapshot:${randomUUID()}`);
    const addSnapshot=async(snapshotId:string,createdAt:string)=>admin.query(`INSERT INTO amic_os_document_copy_snapshots
      (tenant_id,snapshot_id,copy_id,quarantine_ref,source_exact,file_json,mode,preflight_json,request_hash,created_at)
      SELECT tenant_id,$2,copy_id,$3,source_exact,file_json,mode,preflight_json,request_hash,$4::timestamptz
      FROM amic_os_document_copy_snapshots WHERE tenant_id=$5 AND snapshot_id=$1`,
    [input.snapshot_id,snapshotId,randomUUID(),createdAt,tenantId]);
    for(const id of added)await addSnapshot(id,timestamp);
    const foreign=await source('txt','text/plain',Buffer.from('another recovery source'));
    await jsonOk('prepare',{...foreign,title:'Other source',mode:'clone',file:null});
    const other={...input,copy_id:`document-copy:${randomUUID()}`,snapshot_id:`document-copy-snapshot:${randomUUID()}`,
      principal:{...input.principal,user_id:'synthetic-other'}};
    expect((await post('prepare',{...other,title:'Other actor',mode:'clone',file:null},'synthetic-other')).status).toBe(200);
    const first=await jsonOk('list',base);
    expect(first.items).toHaveLength(50);expect(first.next_cursor).toMatch(/^dcp1\.[A-Za-z0-9_-]+$/u);
    const decoded=JSON.parse(Buffer.from(first.next_cursor.slice(5),'base64url').toString('utf8'));
    expect(decoded.created_at).toBe(timestamp);
    const insertedLater=`document-copy-snapshot:${randomUUID()}`;
    await addSnapshot(insertedLater,'2026-09-20T00:00:00.123457Z');
    const second=await jsonOk('list',{...base,cursor:first.next_cursor});
    const third=await jsonOk('list',{...base,cursor:second.next_cursor});
    expect(second.items).toHaveLength(50);expect(third.items).toHaveLength(6);expect(third.next_cursor).toBeNull();
    const ids=[...first.items,...second.items,...third.items].map((item:{snapshot_id:string})=>item.snapshot_id);
    expect(new Set(ids).size).toBe(106);
    expect(ids).toEqual([input.snapshot_id,...added].sort());
    expect(ids).not.toContain(insertedLater);expect(ids).not.toContain(foreign.snapshot_id);expect(ids).not.toContain(other.snapshot_id);
    expect((await jsonOk('list',base)).items[0].snapshot_id).toBe(insertedLater);
    expect((await post('list',{...base,requested_exact_version:foreign.requested_exact_version,cursor:first.next_cursor})).status).toBe(400);
    expect((await post('list',{...base,principal:other.principal,cursor:first.next_cursor},'synthetic-other')).status).toBe(400);
    const otherList=await post('list',{...base,principal:other.principal},'synthetic-other');
    expect(otherList.status).toBe(200);expect((await otherList.json()).items.map((item:{snapshot_id:string})=>item.snapshot_id)).toEqual([other.snapshot_id]);
    const forged={...decoded,snapshot_id:`document-copy-snapshot:${randomUUID()}`};
    const cursorFor=(value:unknown)=>`dcp1.${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
    for(const cursor of ['', 'invalid', 'dcp1.bad', `dcp1.${'a'.repeat(481)}`, `${first.next_cursor}=`,
      cursorFor(forged),cursorFor({...decoded,created_at:'2026-02-30T00:00:00.123456Z'}),
      cursorFor({...decoded,scope:'0'.repeat(64)}),cursorFor({...decoded,extra:true})]) {
      expect((await post('list',{...base,cursor})).status,`cursor ${cursor.slice(0,30)}`).toBe(400);
    }
    expect((await admin.query('SELECT count(*) FROM amic_os_document_copy_snapshots WHERE copy_id=$1',[input.copy_id])).rows[0].count).toBe('107');
  },30000);
  it('retains old snapshots after the current source changes, blocks commit and rechecks real membership and creator',async()=>{
    const input=await source('txt','text/plain',Buffer.from('original for recovery'));
    await jsonOk('prepare',{...input,title:'Recoverable',mode:'clone',file:null});await scan(input);
    await admin.query("UPDATE document_versions SET version_status='superseded' WHERE version_id=$1",[input.requested_exact_version.version_id]);
    const newVersion=await admin.query("INSERT INTO document_versions(tenant_id,document_id,file_object_id,file_hash) VALUES($1,$2,$3,$4) RETURNING version_id",[tenantId,input.requested_exact_version.document_id,input.requested_exact_version.file_object_id,input.requested_exact_version.sha256]);
    const latestList=await jsonOk('list',{principal:input.principal,lawos_matter_id:input.lawos_matter_id,requested_exact_version:{...input.requested_exact_version,version_id:newVersion.rows[0].version_id},limit:50});
    expect(latestList.items[0].snapshot_id).toBe(input.snapshot_id);expect(latestList.items[0].blocked_reason).toBe('base_version_stale');
    const status=await jsonOk('complete',input);expect(status.state).toBe('retained');expect(status.blocked_reason).toBe('base_version_stale');
    expect((await jsonOk('read',{...input,offset:0})).final).toBe(true);
    expect((await post('commit',input)).status).toBe(400);
    const other={...input,principal:{...input.principal,user_id:'synthetic-other'}};
    expect((await post('read',{...other,offset:0},'synthetic-other')).status).toBe(403);
    await admin.query('DELETE FROM matter_members WHERE user_id=$1',[userId]);
    for(const action of ['complete','commit','read']) expect((await post(action,action==='read'?{...input,offset:0}:input)).status).toBe(403);
    await admin.query("INSERT INTO matter_members VALUES($1,$2,$3,'owner','edit')",[tenantId,matterId,userId]);
    expect((await jsonOk('complete',input)).state).toBe('retained');
  });
  it('rejects infected scans, reused snapshot keys and forged source tuples without publishing',async()=>{
    const input=await source('txt','text/plain',Buffer.from('infected synthetic bytes'));
    await jsonOk('prepare',{...input,title:'Blocked',mode:'clone',file:null});
    scanner.outcome='infected';try{await scan(input);}finally{scanner.outcome='clean';}
    expect((await jsonOk('complete',input)).state).toBe('blocked');
    expect((await post('read',{...input,offset:0})).status).toBe(400);
    expect((await post('commit',input)).status).toBe(400);
    expect((await post('prepare',{...input,title:'Different binding',mode:'clone',file:null})).status).toBe(400);
    expect((await post('complete',{...input,requested_exact_version:{...input.requested_exact_version,sha256:'a'.repeat(64)}})).status).toBe(403);
    const isolated=await pool.connect();try{await isolated.query("SELECT set_config('app.current_tenant_id',$1,false)",[randomUUID()]);
      expect((await isolated.query('SELECT * FROM amic_os_document_copy_snapshots')).rows).toHaveLength(0);
    }finally{isolated.release();}
  });
  it('reads a retained 25MiB snapshot in <=3MiB chunks and rejects 25MiB+1 before storage',async()=>{
    const bytes=Buffer.alloc(25*1024*1024,65),input=await source('txt','text/plain',bytes);
    const request={...input,title:'Bounded large copy',mode:'clone',file:null};
    expect((await post('prepare',{...request,requested_exact_version:{...input.requested_exact_version,byte_size:bytes.length+1}})).status).toBe(400);
    await jsonOk('prepare',request);await scan(input);
    const hash=createHash('sha256');let offset=0;
    while(offset<bytes.length){const chunk=await jsonOk('read',{...input,offset});const data=Buffer.from(chunk.bytes_base64,'base64');
      expect(data.length).toBeLessThanOrEqual(3*1024*1024);hash.update(data);offset=chunk.next_offset;expect(chunk.final).toBe(offset===bytes.length);}
    expect(hash.digest('hex')).toBe(digest(bytes));
  },30000);
  it('rechecks permissions after retained bytes and saved primary readback; rollback retains a failed promotion',async()=>{
    const input=await source('txt','text/plain',Buffer.from('late permission boundary'));
    await jsonOk('prepare',{...input,title:'Late boundary',mode:'clone',file:null});await scan(input);
    const range=store.getRangeByStorageUri as (...args:unknown[])=>Promise<unknown>;
    store.getRangeByStorageUri=async(...args:unknown[])=>{const value=await range(...args);await admin.query('DELETE FROM matter_members WHERE user_id=$1',[userId]);return value;};
    try{expect((await post('read',{...input,offset:0})).status).toBe(403);}finally{
      store.getRangeByStorageUri=range;await admin.query("INSERT INTO matter_members VALUES($1,$2,$3,'owner','edit')",[tenantId,matterId,userId]);
    }
    const put=store.putTenantObject;
    store.putTenantObject=async()=>{throw new Error('synthetic storage failure');};
    try{expect((await post('commit',input)).status).toBe(500);}finally{store.putTenantObject=put;}
    expect((await jsonOk('complete',input)).state).toBe('retained');
    const before=Number((await admin.query('SELECT count(*) FROM documents')).rows[0].count);
    const primaryHash=store.sha256ByStorageUri as (...args:unknown[])=>Promise<string>;
    store.sha256ByStorageUri=async(...args:unknown[])=>{const value=await primaryHash(...args);if(String(args[1]).includes('/documents/'))await admin.query('DELETE FROM matter_members WHERE user_id=$1',[userId]);return value;};
    try{expect((await post('commit',input)).status).toBe(403);}finally{
      store.sha256ByStorageUri=primaryHash;await admin.query("INSERT INTO matter_members VALUES($1,$2,$3,'owner','edit')",[tenantId,matterId,userId]);
    }
    expect(Number((await admin.query('SELECT count(*) FROM documents')).rows[0].count)).toBe(before);
    expect((await jsonOk('complete',input)).state).toBe('retained');
    const responses=await Promise.all([post('commit',input),post('commit',input)]);
    expect(responses.map(x=>x.status)).toEqual([200,200]);
    const saved=await Promise.all(responses.map(x=>x.json()));expect(saved[0].exact_version).toEqual(saved[1].exact_version);
    expect(Number((await admin.query('SELECT count(*) FROM documents')).rows[0].count)).toBe(before+1);
    const sha=store.sha256ByStorageUri as (...args:unknown[])=>Promise<string>;
    store.sha256ByStorageUri=async(...args:unknown[])=>{const value=await sha(...args);if(String(args[1]).includes('/documents/'))await admin.query('DELETE FROM matter_members WHERE user_id=$1',[userId]);return value;};
    try{expect((await post('commit',input)).status).toBe(403);}finally{
      store.sha256ByStorageUri=sha;await admin.query("INSERT INTO matter_members VALUES($1,$2,$3,'owner','edit')",[tenantId,matterId,userId]);
    }
  });
  it('rechecks actual Matter source readiness before prepare and explicit promotion',async()=>{
    const input=await source('txt','text/plain',Buffer.from('source readiness boundary'));
    sourceReady=false;
    try{expect((await post('prepare',{...input,title:'Source policy',mode:'clone',file:null})).status).toBe(400);}
    finally{sourceReady=true;}
    await jsonOk('prepare',{...input,title:'Source policy',mode:'clone',file:null});await scan(input);
    sourceReady=false;
    try{expect((await post('commit',input)).status).toBe(400);}
    finally{sourceReady=true;}
    expect((await jsonOk('complete',input)).state).toBe('retained');
    expect((await jsonOk('commit',input)).saved).toBe(true);
  });
  it('refreshes an aged retained scan through the existing queue before explicit commit',async()=>{
    const input=await source('txt','text/plain',Buffer.from('durable aged snapshot'));
    await jsonOk('prepare',{...input,title:'Later session',mode:'clone',file:null});await scan(input);
    await admin.query("UPDATE file_security_scans SET signature_at=now()-interval '2 days' WHERE scan_id=(SELECT scan_id FROM amic_os_document_copy_snapshots WHERE snapshot_id=$1)",[input.snapshot_id]);
    const before=Number((await admin.query('SELECT count(*) FROM synthetic_scan_jobs')).rows[0].count);
    expect((await post('commit',input)).status).toBe(400);
    expect((await jsonOk('complete',input)).state).toBe('quarantined');
    expect(Number((await admin.query('SELECT count(*) FROM synthetic_scan_jobs')).rows[0].count)).toBe(before+1);
    await scan(input);
    expect((await jsonOk('complete',input)).state).toBe('retained');
    expect((await jsonOk('commit',input)).saved).toBe(true);
  });
  it('rejects expired prepared transport and preserves populated snapshots on rollback',async()=>{
    const input=await source('txt','text/plain',Buffer.from('expired bytes'));
    const prepared=await jsonOk('prepare',{...input,title:'Expired snapshot',mode:'upload',file:{filename:'expired.txt',sha256:input.requested_exact_version.sha256,byte_size:input.requested_exact_version.byte_size,mime_type:'text/plain'}});
    await fetch(prepared.upload_url,{method:'PUT',headers:prepared.required_headers,body:Buffer.from('expired bytes')});
    await admin.query("UPDATE amic_os_document_copy_snapshots SET preflight_json=jsonb_set(preflight_json,'{expires_at}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE snapshot_id=$1",[input.snapshot_id]);
    expect((await post('complete',input)).status).toBe(409);
    const migration=await readFile(resolve(__dirname,'../../../../../../db/migrations/0216_retain_amic_os_document_copy_snapshots.sql'),'utf8');
    await expect(admin.query(migration.split('-- Down Migration')[1]!)).rejects.toThrow('Retained document copies must be preserved');
    expect(Number((await admin.query('SELECT count(*) FROM amic_os_document_copy_snapshots')).rows[0].count)).toBeGreaterThan(0);
  });

  if (process.env.AMIC_OS_COPY_BROWSER_HARNESS) it('paired browser: OS cookie API to companion HTTP with durable remote copy recovery', async () => {
    const paired = await import(/* @vite-ignore */ pathToFileURL(resolve(process.env.AMIC_OS_COPY_BROWSER_HARNESS!)).href);
    const setMembership = async (allowed: boolean) => {
      await admin.query('DELETE FROM matter_members WHERE tenant_id=$1 AND matter_id=$2 AND user_id=$3',[tenantId,matterId,userId]);
      if (allowed) await admin.query("INSERT INTO matter_members VALUES($1,$2,$3,'owner','edit')",[tenantId,matterId,userId]);
    };
    await paired.runPairedRemoteDocumentCopy({ providerOrigin: origin, providerToken: 'synthetic-internal-provider-token', seedSource: source,
      scanSnapshot: (snapshotId: string) => scan({ snapshot_id: snapshotId } as AmicOsVaultDocumentCopyBindingInput), setMembership,
      configureUploadTarget: (uploadOrigin: string) => {
        const previous = store.createQuarantineWriteUrl;
        store.createQuarantineWriteUrl = async (input: {quarantineRef: string;contentType: string;contentLength: number}) => ({
          url: `${uploadOrigin}/synthetic-upload/${input.quarantineRef}?X-Amz-Signature=${'a'.repeat(64)}`,
          headers: {'content-type':input.contentType,'content-length':String(input.contentLength),'if-none-match':'*'}, expiresAt: new Date(Date.now()+600_000),
        });
        return () => { store.createQuarantineWriteUrl = previous; };
      },
      readback: async ({copyId,snapshotId,original,expected}: {copyId:string;snapshotId:string;
        original:AmicOsVaultDocumentCopyBindingInput['requested_exact_version'];expected:AmicOsVaultDocumentCopyBindingInput['requested_exact_version']}) => {
        const provenance=(await admin.query('SELECT source_document_id,source_version_id,final_snapshot_id,copy_kind FROM amic_os_office_copies WHERE copy_id=$1',[copyId])).rows[0];
        expect(provenance).toEqual({source_document_id:original.document_id,source_version_id:original.version_id,final_snapshot_id:snapshotId,copy_kind:'generic'});
        const versions=(await admin.query('SELECT file_hash,version_status FROM document_versions WHERE document_id=$1',[original.document_id])).rows;
        expect(versions).toEqual([{file_hash:original.sha256,version_status:'current'}]);
        const promoted=(await admin.query(`SELECT p.document_id,p.version_id,p.file_object_id,p.primary_sha256,f.storage_uri
          FROM file_security_promotions p JOIN amic_os_document_copy_snapshots s ON s.tenant_id=p.tenant_id AND s.scan_id=p.scan_id
          JOIN file_objects f ON f.tenant_id=p.tenant_id AND f.file_object_id=p.file_object_id WHERE s.copy_id=$1`,[copyId])).rows;
        expect(promoted).toHaveLength(1);expect(promoted[0].document_id).toBe(expected.document_id);expect(promoted[0].version_id).toBe(expected.version_id);
        expect(promoted[0].file_object_id).toBe(expected.file_object_id);expect(promoted[0].primary_sha256).toBe(expected.sha256);
        const sha=store.sha256ByStorageUri as (tenant:string,uri:string)=>Promise<string>;
        expect(await sha(tenantId,promoted[0].storage_uri)).toBe(expected.sha256);
        return {provenance,exact_version:expected,promoted_documents:promoted.length,original_unchanged:true,primary_hash_verified:true};
      },
    });
  },180_000);

  it('rejects disguised bytes and a changed fingerprint before a snapshot is retained',async()=>{
    const input=await source('pdf','application/pdf',binary.pdf);
    const invalid=Buffer.from('this is not a PDF');
    const prepared=await jsonOk('prepare',{...input,title:'Invalid file',mode:'upload',file:{filename:'bad.pdf',sha256:digest(invalid),byte_size:invalid.length,mime_type:'application/pdf'}});
    await fetch(prepared.upload_url,{method:'PUT',headers:prepared.required_headers,body:invalid});
    expect((await post('complete',input)).status).toBe(415);
    expect((await admin.query('SELECT scan_id FROM amic_os_document_copy_snapshots WHERE snapshot_id=$1',[input.snapshot_id])).rows[0].scan_id).toBeNull();
    expect((await post('prepare',{...input,title:'Invalid file',mode:'upload',file:{filename:'bad.pdf',sha256:'b'.repeat(64),byte_size:invalid.length,mime_type:'application/pdf'}})).status).toBe(400);
    expect((await fetch(`${origin}/v1/integrations/amic-os/vault/edit/document-copy/list`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(401);
  });

});
