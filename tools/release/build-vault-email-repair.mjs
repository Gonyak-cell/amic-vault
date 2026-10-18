import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const BASE_IMAGE='770880870480.dkr.ecr.ap-northeast-2.amazonaws.com/amic-vault-prod/api@sha256:5a8572520984a69ea50a4f93faba4ed72f95552e38d14db1bfb74497139d3985';
export const INPUT_HASHES=Object.freeze({controller:'6706b5500f768a9240a739b0cff7b6d6d294109c8bf451824feb4b56b7054b06',service:'0c849447a0784eacb01a3f5efb1783ccd3cafb2b66afc5d5a3dc960de61bb3ba'});
export const sha256=value=>createHash('sha256').update(value).digest('hex');
function once(source,from,to){if(source.split(from).length!==2)throw Error('PATCH_ANCHOR_MISMATCH');return source.replace(from,to);}
export function patchVerifiedSources({controller,service}){
 if(sha256(controller)!==INPUT_HASHES.controller||sha256(service)!==INPUT_HASHES.service)throw Error('INPUT_HASH_MISMATCH');
 let c=controller.toString(),s=service.toString();
 c=once(c,'function parseSearch(value) {\n    const input = object(value);','function parseSearch(value) {\n    const input = object(value);\n    if (input.mime_type === "message/rfc822") return require("./email-read.cjs").parseEmail(input, { optionalDate, principalAccountLedgerId, matterId, page });');
 s=once(s,'    constructor(auditService, searchService, tenantContext, config, previewSessions, previews, previewQueue, external, documentVersions) {','    constructor(auditService, searchService, tenantContext, config, previewSessions, previews, previewQueue, external, documentVersions, permissionService, storageService) {\n        this.permissionService = permissionService;\n        this.storageService = storageService;');
 s=once(s,'    async read(principal, input) {','    async read(principal, input) {\n        if (input.emailCriteria) return require("./email-read.cjs").readEmail(this, principal, input);');
 s=once(s,'    __param(8, (0, common_1.Inject)(document_version_service_1.DocumentVersionService)),','    __param(8, (0, common_1.Inject)(document_version_service_1.DocumentVersionService)),\n    __param(9, (0, common_1.Inject)(require("../../permission/permission.service").PermissionService)),\n    __param(10, (0, common_1.Inject)(require("../../storage/storage.service").StorageService)),');
 // Explicit @Inject entries define positions 9/10; existing design:paramtypes and
 // all original positions remain byte-identical, preserving the pinned runtime.
 return {controller:c,service:s};
}
export async function buildRepair({controllerPath,servicePath,outputDir}){
 const inputs={controller:await readFile(controllerPath),service:await readFile(servicePath)};
 const patched=patchVerifiedSources(inputs);
 const helper=await readFile(resolve(dirname(fileURLToPath(import.meta.url)),'vault-email-repair/email-read.cjs'));
 await mkdir(outputDir,{recursive:false});
 const files={'amic-os-vault-read.controller.js':patched.controller,'amic-os-vault-read.service.js':patched.service,'email-read.cjs':helper};
 for(const [name,data] of Object.entries(files))await writeFile(resolve(outputDir,name),data,{flag:'wx'});
 const runtime='/app/apps/api/dist/modules/integrations/amic-os-vault-provider';
 await writeFile(resolve(outputDir,'Dockerfile'),`FROM ${BASE_IMAGE}\nCOPY ${Object.keys(files).join(' ')} ${runtime}/\n`,{flag:'wx'});
 const manifest={base_image:BASE_IMAGE,input_hashes:INPUT_HASHES,files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,sha256(data)])),scope:'Email read compatibility only; no migrations, original bytes, non-email methods or ACL engine replaced'};
 await writeFile(resolve(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length!==6)throw Error('Expected --controller FILE --service FILE --output DIR');
 const options={};for(let i=0;i<args.length;i+=2){if(!['--controller','--service','--output'].includes(args[i])||options[args[i]])throw Error('INVALID_ARGUMENTS');options[args[i]]=args[i+1];}
 await buildRepair({controllerPath:options['--controller'],servicePath:options['--service'],outputDir:options['--output']});
}
