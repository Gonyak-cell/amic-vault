import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const INPUT_HASHES=Object.freeze({controller:'7b9336594040cc7a0fd7382ddd6154936069990b844e0fd6d4d97c6606c0bb04',service:'74153123d246c4ecca435ef8915ec357840463dce2f31bb8cfe92b3b8a75c9ac'});
export const BASE_DIGEST='sha256:283f9ba79f9195e63c098a427edfb51185bfa21de814b9314a72a00ab4566211';
export const BASE_IMAGE=`770880870480.dkr.ecr.ap-northeast-2.amazonaws.com/amic-vault-prod/api@${BASE_DIGEST}`;
const RUNTIME_DIR='/app/apps/api/dist/modules/integrations/amic-os-vault-provider';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
function once(source,from,to){if(source.split(from).length!==2)throw Error('PATCH_ANCHOR_MISMATCH');return source.replace(from,to);}
export function patchVerifiedSources({controller,service}){
 if(sha256(controller)!==INPUT_HASHES.controller||sha256(service)!==INPUT_HASHES.service)throw Error('INPUT_HASH_MISMATCH');
 let c=controller.toString('utf8'),s=service.toString('utf8');
 c=once(c,"'client_name', 'tags', 'sort_by', 'code_basis', 'metadata_codes',","'client_name', 'tags', 'code_basis', 'metadata_codes',");
 c=once(c,'        ...inactiveKeys,',"        ...inactiveKeys,\n        ...(Object.hasOwn(input, 'sort_by') ? ['sort_by'] : []),");
 c=once(c,"    const dateBasis = input.date_basis ?? 'created_or_modified';","    const sortBy = input.sort_by == null ? null : input.sort_by;\n    if (sortBy !== null && !['relevance', 'updated_desc', 'updated_asc', 'title_asc', 'matter_asc', 'type_asc'].includes(sortBy)) throw invalid();\n    const dateBasis = input.date_basis ?? 'created_or_modified';");
 c=once(c,'        dateBasis: dateBasis,','        dateBasis: dateBasis,\n        sortBy,');
 s=once(s,"sortBy: input.query ? 'relevance' : 'updated_desc', groupBy: 'none', filters,","sortBy: input.sortBy ?? (input.query ? 'relevance' : 'updated_desc'), groupBy: 'none', filters,");
 return {controller:c,service:s};
}
export async function buildRepair({controllerPath,servicePath,outputDir}){
 const baseImage=BASE_IMAGE,runtimeDir=RUNTIME_DIR;
 const input={controller:await readFile(controllerPath),service:await readFile(servicePath)},patched=patchVerifiedSources(input);
 const output=resolve(outputDir);await mkdir(output,{recursive:false});
 const files={};for(const kind of ['controller','service']){const name=`amic-os-vault-read.${kind}.js`;await writeFile(resolve(output,name),patched[kind],{flag:'wx'});files[name]={input_sha256:INPUT_HASHES[kind],output_sha256:sha256(patched[kind]),destination:`${runtimeDir}/${name}`};}
 const dockerfile=`FROM ${baseImage}\nCOPY amic-os-vault-read.controller.js ${runtimeDir}/amic-os-vault-read.controller.js\nCOPY amic-os-vault-read.service.js ${runtimeDir}/amic-os-vault-read.service.js\n`;
 await writeFile(resolve(output,'Dockerfile'),dockerfile,{flag:'wx'});
 const manifest={schema:'amic.vault.search_sort_repair.v1',base_image:baseImage,files,dockerfile_sha256:sha256(dockerfile),scope:'sort_by validation and native sort forwarding only',build_executed:false,deployment_executed:false};
 await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length!==6)throw Error('Expected --controller FILE --service FILE --output DIR');
 const options={};for(let i=0;i<args.length;i+=2){if(!['--controller','--service','--output'].includes(args[i])||options[args[i]])throw Error('INVALID_ARGUMENTS');options[args[i]]=args[i+1];}
 await buildRepair({controllerPath:options['--controller'],servicePath:options['--service'],outputDir:options['--output']});
}
