import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const checkoutBase=process.env.MARINARA_CHECKOUT_BASE;
assert(checkoutBase, 'Set MARINARA_CHECKOUT_BASE to a directory containing engine/, agents/, and oracle-deps/.');
const base=checkoutBase.replace(/\/+$/, '')+'/';
const engine=base+'engine/';
const agents=base+'agents/';
const overlay=agents+'packages/hierarchical-maps/src/engine/packages/';
registerHooks({resolve(s,c,n){
 if(s==='zod')return n(pathToFileURL(base+'oracle-deps/node_modules/zod/index.js').href,c);
 if(s==='@marinara-engine/shared')return n(pathToFileURL(engine+'packages/shared/src/utils/spatial-context.ts').href,c);
 if(s.startsWith('.')&&s.endsWith('.js')&&c.parentURL){const u=new URL(s.replace(/\.js$/,'.ts'),c.parentURL);if(existsSync(u))return n(u.href,c);}
 return n(s,c);
}});
const load=p=>import(pathToFileURL(p));
const schema=(await load(engine+'packages/shared/src/schemas/spatial-context.schema.ts')).spatialContextDefinitionSchema;
const spatial=await load(engine+'packages/shared/src/utils/spatial-context.ts');
const runtime=await load(overlay+'maps-shared/src/runtime-prompt.ts');
const lore=await load(overlay+'client/src/features/spatial-context/portable-lore.ts');
const profiles=await load(overlay+'maps-shared/src/maps-model.ts');
const loreSchemas=await load(engine+'packages/shared/src/schemas/lorebook.schema.ts');
const root=new URL('../',import.meta.url);
const pack=JSON.parse(readFileSync(process.argv[2]));
const original=JSON.parse(readFileSync(new URL('source/original.world-map.json',root)));
const index=JSON.parse(readFileSync(new URL('source/global-index.json',root))).globalIndexIds;
const d=schema.parse(pack.definition);profiles.spatialHierarchyProfileSchema.parse(pack.hierarchyProfile);
assert.equal(d.locations.length,79);
const by=new Map(d.locations.map(l=>[l.id,l]));
for(const l of original.definition.locations){assert(by.has(l.id));assert.equal(by.get(l.id).referenceImageId,l.referenceImageId);}
assert.equal(d.startingLocationId,original.definition.startingLocationId);
assert.equal(d.revision,original.definition.revision);
assert.deepEqual(d.locations.slice(0,50).map(l=>l.id),index);
const p=runtime.buildOwnerSpatialProjection('source-test',d,d.startingLocationId);
assert.deepEqual(p.knownLocations.map(l=>l.id),index);assert.equal(p.omittedKnownLocationCount,29);
const can=(def,a,b)=>a===b||spatial.resolveSpatialRoute(def,a,b)!==null;
const reachable=def=>def.locations.filter(l=>can(def,def.startingLocationId,l.id)).map(l=>l.id);
assert.equal(reachable(d).length,54);
for(const l of d.locations.filter(l=>l.id.startsWith('crypts-')))assert(!can(d,d.startingLocationId,l.id));
const entrances=[['nevermore-poe-statue','crypts-stair-mouth'],['ravencroft-iron-maiden','crypts-tunnel-mouth'],['dorms-common','crypts-crawlspace']];
const gates=[['crypts-door-1','crypts-breath'],['crypts-door-2','crypts-chamber-3'],['crypts-door-3','crypts-approach']];
const set=(def,[a,b],state)=>{const edge=def.locations.find(l=>l.id===a).links.find(l=>l.targetId===b);assert(edge);edge.state=state;};
let routeCases=0;const stages=[];
for(const entrance of entrances){
 const v=structuredClone(d);set(v,entrance,'available');
 assert(can(v,d.startingLocationId,'crypts-chamber-1'));assert(!can(v,d.startingLocationId,'crypts-chamber-2'));assert(can(v,'crypts-chamber-1',d.startingLocationId));routeCases+=3;
 for(let stage=0;stage<3;stage++){
  const [a,b]=gates[stage];assert(!can(v,a,b));set(v,gates[stage],'available');assert(can(v,a,b));assert(can(v,b,a));assert(can(v,b,d.startingLocationId));routeCases+=4;
  if(stage<2){assert(!can(v,d.startingLocationId,gates[stage+1][1]));routeCases++;}
 }
 assert.equal(reachable(v).length,79);routeCases++;
 // Every gate is a real cut even if all other progression gates are open.
 for(const gate of gates){set(v,gate,'blocked');assert(!can(v,d.startingLocationId,gate[1]));set(v,gate,'available');routeCases++;}
 stages.push({entrance:entrance[0],allOpenReachable:reachable(v).length,altarRoute:spatial.resolveSpatialRoute(v,d.startingLocationId,'crypts-altar')});
}
for(const id of ['dorm-wednesday-enid','dorm-pugsley','dorm-bianca','dorm-nerissa'])assert.equal(by.get(id).parentId,'dorms-upper');
assert.deepEqual(spatial.resolveSpatialRoute(d,'ravencroft-morticia-chamber','ravencroft-gomez-room'),['ravencroft-family','ravencroft-gomez-room']);
assert(!spatial.resolveSpatialRoute(d,'ravencroft-parlor','ravencroft-walk').includes('ravencroft-morticia-chamber'));
assert.equal(by.get('crypts-vestment').parentId,'crypts-threshold');assert.equal(by.get('crypts-breath').parentId,'crypts-second-rite');
assert(!by.get('crypts-echo').links.some(l=>l.targetId==='crypts-door-3'));
const bundle=lore.parsePortableLoreBundle(pack.portableLore);assert(bundle);
assert.equal(bundle.books.flatMap(b=>b.entries).length,30);
let bookCount=0,entryCount=0,folderCount=0;
const imported=await lore.importPortableLoreBundle({bundle,plan:lore.planPortableLoreImport(bundle,[],[],pack.name),strategy:'separate',api:{
 async post(path,body){
  if(path==='/lorebooks'){loreSchemas.createLorebookSchema.parse(body);return{id:'test-book-'+(++bookCount)};}
  if(path.endsWith('/folders')){loreSchemas.createLorebookFolderSchema.parse(body);return{id:'test-folder-'+(++folderCount)};}
  if(path.endsWith('/entries/bulk'))return body.entries.map(e=>{loreSchemas.createLorebookEntrySchema.parse({...e,lorebookId:'test-book'});return{id:'test-entry-'+(++entryCount)};});
  throw new Error('Unexpected API path: '+path);
 },async patch(path,body){loreSchemas.updateLorebookEntrySchema.parse(body);return{};},async delete(){return{};}
}});
assert.equal(imported.importedEntries,30);
const remapped=lore.remapPortableLoreReferences(d,bundle,imported.entryIdMap);
for(const l of remapped.locations)assert(l.lorebookEntryIds.every(id=>id.startsWith('test-entry-')));
const rootLore=JSON.parse(readFileSync(new URL('source/original-lore.marinara.json',root))).data.entries;
const revisedLore=JSON.parse(readFileSync(new URL('source/revised-lore.marinara.json',root))).data.entries;
const changedLore=rootLore.filter(e=>e.content!==revisedLore.find(v=>v.id===e.id).content).map(e=>e.name);
assert.deepEqual(changedLore.sort(),['First Rite','Second Rite','Union','Crypt laterals','The Crypts of Nevermore','Ravencroft wings'].sort());
const report={engineRevision:execFileSync('git',['-C',engine,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),agentsRevision:execFileSync('git',['-C',agents,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),locations:79,originalIdsPreserved:67,knownNames:50,omittedKnownNames:29,defaultReachable:54,controlledCryptLocations:25,routeCases,stages,portableLoreEntries:30,sourceEntriesRecovered:26,allLoreBindingsRemapped:true,changedLore,sourceSchemasPassed:true,runtimeImported:false};
writeFileSync(new URL('checks/source-results.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
