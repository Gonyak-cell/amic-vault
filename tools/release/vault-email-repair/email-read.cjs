'use strict';
// Narrow compatibility layer for the pinned production image. Search and ACL
// decisions remain in the existing SearchService/PermissionService.
const { BadRequestException, ForbiddenException } = require('@nestjs/common');
const { decodeEmlRawContent, normalizeEmailMetadata } = require('@amic-vault/shared');
const READ_DEADLINE_MS = 20_000, MAX_CANDIDATES = 1_000, MAX_HEADER_READS = 256;
const unavailable = () => new BadRequestException({code:'VALIDATION_FAILED',reason:'EMAIL_READ_INCOMPLETE'});
function bounded(promise, deadline, onLate) {
 const remaining=deadline-Date.now();
 if(remaining<=0){promise.then(onLate??(()=>{}),()=>{});return Promise.reject(unavailable());}
 let timer, expired=false;
 const task=Promise.resolve(promise).then(value=>{if(expired)onLate?.(value);return value;});
 return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(unavailable());},remaining);})]).finally(()=>clearTimeout(timer));
}
const fields = new Set(['event_at', 'sent_at', 'received_at', 'filed_at']);
const fail = () => { throw new BadRequestException({code:'VALIDATION_FAILED'}); };
function parseEmail(input, helpers) {
  const required=['principal','query','lawos_matter_id','current_version_only','date_from','date_to','page','page_size'];
  const optional=['date_basis','mime_type','email_date_basis','email_sort','email_sort_order','email_direction','code_basis','metadata_codes'];
  if(required.some(k=>!Object.hasOwn(input,k))||Object.keys(input).some(k=>!required.includes(k)&&!optional.includes(k)))fail();
  if(input.mime_type!=='message/rfc822'||input.current_version_only!==true)fail();
  if(input.query!=null&&typeof input.query!=='string')fail();
  const query=input.query?.trim()||null;
  if(query?.length>2000)fail();
  if(input.date_basis!=null&&input.date_basis!=='created')fail();
  if(input.code_basis!=null&&!['matter','legacy'].includes(input.code_basis))fail();
  if(input.metadata_codes!=null&&(!Array.isArray(input.metadata_codes)||input.metadata_codes.length))fail();
  const criteria={dateBasis:input.email_date_basis??'event_at',sort:input.email_sort??'event_at',sortOrder:input.email_sort_order??'desc',direction:input.email_direction??null};
  if(!fields.has(criteria.dateBasis)||!fields.has(criteria.sort)||!['asc','desc'].includes(criteria.sortOrder)||criteria.direction!==null&&!['sent','received'].includes(criteria.direction))fail();
  const dateFrom=helpers.optionalDate(input.date_from),dateTo=helpers.optionalDate(input.date_to);
  if(dateFrom&&dateTo&&dateFrom>dateTo)fail();
  // Match the canonical address-search contract, not a partial address guess.
  if(query?.includes('@')&&!/^[^\s@<>;,]+@[a-z0-9.-]+$/iu.test(query))fail();
  return {accountLedgerId:helpers.principalAccountLedgerId(input.principal),lawosMatterId:helpers.matterId(input.lawos_matter_id),page:helpers.page(input.page,1000),pageSize:helpers.page(input.page_size,50),query,dateFrom,dateTo,emailCriteria:criteria};
}
const instant=value=>{const date=value instanceof Date?value:new Date(value??NaN);return Number.isFinite(date.getTime())?date.toISOString():null;};
const text=(value,max)=>typeof value==='string'&&value.normalize('NFC').trim()&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value)?value.normalize('NFC').trim():null;
async function headerPrefix(stream,deadline){
  let value='',size=0;
  const timer=setTimeout(()=>stream.destroy?.(unavailable()),Math.max(0,deadline-Date.now()));
  try{for await(const part of stream){const chunk=Buffer.from(part);size+=chunk.length;if(size>4*1024*1024)fail();value+=chunk.toString('latin1');const end=value.search(/\r?\n\r?\n/u);if(end>=0)return value.slice(0,end+4);}}
  finally{clearTimeout(timer);stream.destroy?.();}
  fail();
}
async function emailRows(service,principal,items){
  if(!items.length)return [];
  const ids=items.map(row=>row.document_id);
  const result=await service.auditService.transaction(principal.tenantId,tx=>tx.query(`
SELECT d.document_id,d.matter_id,dv.version_id,em.email_id,em.subject,
 em.sent_at,em.received_at,filing.created_at AS filed_at,
 raw.file_object_id,raw.sha256,raw.size_bytes::text,raw.mime_type,
 raw.normalized_filename,raw.storage_uri
FROM documents d
JOIN document_versions dv ON dv.tenant_id=d.tenant_id AND dv.document_id=d.document_id AND dv.version_status='current'
JOIN LATERAL (
 SELECT f.* FROM email_matter_filings f
 WHERE f.tenant_id=d.tenant_id AND f.matter_id=d.matter_id AND f.body_document_id=d.document_id
 ORDER BY f.created_at ASC,f.filing_id ASC LIMIT 1
) filing ON true
JOIN email_messages em ON em.tenant_id=filing.tenant_id AND em.email_id=filing.email_id
JOIN file_objects raw ON raw.tenant_id=em.tenant_id AND raw.file_object_id=em.raw_file_object_id
 AND raw.sha256=em.raw_sha256 AND raw.size_bytes=em.raw_size_bytes AND lower(raw.mime_type)='message/rfc822'
WHERE d.tenant_id=$1::uuid AND d.document_id=ANY($2::uuid[]) AND d.status<>'deleted'
`,[principal.tenantId,ids]));
  return result.rows;
}
async function readEmail(service,principal,input){
 service.assertPrincipal(principal,input.accountLedgerId);
 const deadline=Date.now()+READ_DEADLINE_MS;
 const matterId=input.lawosMatterId?await bounded(service.resolveLawosMatter(principal.tenantId,input.lawosMatterId),deadline):null;
 const subject={tenantId:principal.tenantId,userId:principal.actorUserId,sessionId:null};
 const criteria=input.emailCriteria,visible=[],seen=new Set();let exhausted=false,candidates=0,headerReads=0;
 const addressMode=Boolean(input.query?.includes('@'));
 // Every candidate comes through the existing permission-before-search query.
 for(let page=1;page<=1000;page++){
  const response=await bounded(service.searchService.search(subject,{...(input.query&&!addressMode?{query:input.query}:{}),mode:'keyword',target:'email',sortBy:'updated_desc',groupBy:'none',filters:{versionStatus:'current',documentType:['email'],...(matterId?{matterId}:{})},page,pageSize:50}),deadline);
  candidates+=response.results.length;if(candidates>MAX_CANDIDATES)throw unavailable();
  const projected=await bounded(service.projectExactVersions(principal,response.results),deadline);
  const rows=await bounded(emailRows(service,principal,projected),deadline);
  for(const item of projected){
   if(seen.has(item.document_id))continue;
   const row=rows.find(r=>r.document_id===item.document_id&&r.version_id===item.version_id);
   if(!row||item.mime_type!=='text/plain')continue;
   const candidate=response.results.find(r=>r.documentId===item.document_id);
   if(!candidate||candidate.matterId!==row.matter_id)continue;
   let allowed=false;
   try{allowed=(await bounded(service.permissionService.canReadMatter(subject,row.matter_id),deadline)).effect==='ALLOW'&&(await bounded(service.permissionService.canReadDocument(subject,row.document_id),deadline)).effect==='ALLOW';}catch{throw new ForbiddenException({code:'PERMISSION_DENIED'});}
   if(!allowed)continue;
   const name=text(row.normalized_filename,240),bytes=Number(row.size_bytes);
   if(!name||/[\\/]/u.test(name)||!Number.isSafeInteger(bytes)||bytes<1||bytes>256*1024*1024||!/^[a-f0-9]{64}$/u.test(row.sha256)||!row.storage_uri||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.file_object_id??'')||row.file_object_id===item.file_object_id)continue;
   let metadata;
   if(++headerReads>MAX_HEADER_READS)throw unavailable();
   try{const stored=await bounded(service.storageService.getByStorageUri(principal.tenantId,row.storage_uri),deadline,late=>late?.body?.destroy?.());
    const prefix=await bounded(headerPrefix(stored.body,deadline),deadline);
    metadata=normalizeEmailMetadata(decodeEmlRawContent(Buffer.from(prefix,'latin1')));
   }catch{throw unavailable();}
   const sent=instant(row.sent_at),received=instant(row.received_at),filed=instant(row.filed_at);
   const direction=received?'received':sent?'sent':null;
   const message={subject:text(row.subject,500),from:metadata.participants.find(p=>p.role==='from')?.normalizedAddress??null,to:metadata.participants.filter(p=>p.role==='to').map(p=>p.normalizedAddress),direction,sent_at:sent,received_at:received,filed_at:filed,event_at:direction==='received'?received:direction==='sent'?sent:null};
   if(criteria.direction&&direction!==criteria.direction)continue;
   const at=message[criteria.dateBasis];
   if((input.dateFrom||input.dateTo)&&!at)continue;
   if(input.dateFrom&&Date.parse(at)<Date.parse(input.dateFrom+'T00:00:00.000+09:00')||input.dateTo&&Date.parse(at)>Date.parse(input.dateTo+'T23:59:59.999+09:00'))continue;
   if(input.query?.includes('@')&&![message.from,...message.to].some(a=>a?.toLowerCase()===input.query.toLowerCase()))continue;
   seen.add(item.document_id);
   visible.push({...item,email_message:message,email_source:{source_kind:'filed_eml',exact_version:{document_id:item.document_id,version_id:item.version_id,file_object_id:row.file_object_id,sha256:row.sha256,byte_size:bytes,mime_type:'message/rfc822'},attachment_name:name}});
  }
  if(response.results.length<50){exhausted=true;break;}
 }
 if(!exhausted)throw new BadRequestException({code:'VALIDATION_FAILED',reason:'SEARCH_CANDIDATE_LIMIT'});
 visible.sort((a,b)=>{const x=Date.parse(a.email_message[criteria.sort]??''),y=Date.parse(b.email_message[criteria.sort]??'');if(Number.isFinite(x)!==Number.isFinite(y))return Number.isFinite(x)?-1:1;if(Number.isFinite(x)&&x!==y)return criteria.sortOrder==='asc'?x-y:y-x;return a.document_id.localeCompare(b.document_id);});
 const offset=(input.page-1)*input.pageSize,items=visible.slice(offset,offset+input.pageSize);
 return {authority_kind:'amic-vault-api',authority_ref:service.config.uploadAuthorityRef(),provider_revision:service.config.uploadProviderRevision(),items,page_info:{page:input.page,page_size:input.pageSize,returned_count:items.length,has_more:offset+items.length<visible.length,current_version_only:true,omitted_result_count:null,email_date_basis:criteria.dateBasis,email_sort:criteria.sort,email_sort_order:criteria.sortOrder,email_direction:criteria.direction},count_leak_prevented:true,raw_bytes_included:false,storage_locator_returned:false};
}
module.exports={parseEmail,readEmail};
