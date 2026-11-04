const assert=require('node:assert/strict'),fs=require('node:fs');const {query,close}=require('../db.cjs'),{seed}=require('../seed.cjs'),{createServer,validatePasswords}=require('../server.cjs'),P=require('../dist/passport-qr.js'),E=require('../dist/engine.js'),fixtures=require('../dist/qr-passports.json');
const passwords={mechanic:'Garage_Test_2026!',owner:'Constructeur_Test_2026!',recycler:'Tri_Test_2026!'};for(const [r,k]of Object.entries({mechanic:'MECHANIC_PASSWORD',owner:'OWNER_PASSWORD',recycler:'RECYCLER_PASSWORD'}))process.env[k]=passwords[r];
(async()=>{for(let i=0;i<40;i++){try{await query(['RETURN 1 AS ready']);break;}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,500));}}
 // Model an existing installation with the five original examples and a shared actor.
 for(const sample of require('../dist/seed.json').batteries)await query([{statement:'CREATE (b:Battery {id:$id,serial:$serial,payload:$payload,revision:0}) CREATE (p:Passport {id:$id}) CREATE (m:Module {id:$mid}) CREATE (b)-[:HAS_PASSPORT]->(p) CREATE (b)-[:HAS_MODULE]->(m) MERGE (a:Actor {id:"shared-test"}) MERGE (a)-[:RESPONSIBLE_FOR]->(p)',parameters:{id:sample.id,serial:sample.serial,payload:JSON.stringify(sample),mid:sample.id+'-M1'}}]);
 await seed();const [removed,shared]=await query(['MATCH (b:Battery) RETURN count(b) AS n','MATCH (a:Actor {id:"shared-test"}) RETURN count(a) AS n']);assert.equal(removed[0].n,0);assert.equal(shared[0].n,1);
 validatePasswords();const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookies={};
 async function call(url,body,role){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(role?{cookie:cookies[role]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const contentType=r.headers.get('content-type')||'';return {status:r.status,data:contentType.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function state(role){const r=await call('/api/state',null,role);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
 try{
  for(const role of Object.keys(passwords)){const r=await call('/api/login',{username:role,password:passwords[role]});assert.equal(r.status,200);cookies[role]=r.cookie;}
  assert.equal((await state('mechanic')).batteries.length,0,'Une base neuve ne doit pas être préremplie en batteries.');assert.equal((await state('owner')).centers.length,2);
  const raw=P.encode(fixtures[2].passport);assert.equal((await call('/api/passports/import',{qrText:raw},'owner')).status,403);
  assert.equal((await call('/api/passports/lookup',{qrText:raw},'mechanic')).data.exists,false);
  const imported=await call('/api/passports/import',{qrText:raw},'mechanic');assert.equal(imported.status,201,JSON.stringify(imported.data));let b=imported.data.battery;assert.equal(b.status,'Original');assert.equal(b.stage,0);const endpoint='/api/batteries/'+b.id+'/';
  assert.equal((await call('/api/passports/import',{qrText:raw},'mechanic')).data.created,false);assert.equal((await call(endpoint+'receive',{revision:b.revision},'recycler')).status,409);assert.equal((await call(endpoint+'recommendation',{revision:b.revision,weights:E.defaults},'recycler')).status,409);assert.equal((await call(endpoint+'recommendation',{revision:b.revision},'mechanic')).status,403);
  async function act(action,role,p={}){const r=await call(endpoint+action,{...p,revision:b.revision},role);assert.equal(r.status,200,action+' '+JSON.stringify(r.data));b=r.data;return b;}
  await act('diagnostic','mechanic',{note:'Module défectueux constaté',soh:1,status:'Waste'});assert.equal(b.status,'Original');assert.equal(b.soh,73);assert.equal((await state('owner')).notifications.length,1);
  await act('refuse','owner',{note:'Préciser le constat'});assert.equal(b.status,'Original');assert.equal(b.requests[0].state,'REJECTED');
  await act('diagnostic','mechanic',{note:'Constat complété'});
  assert.equal((await call(endpoint+'waste',{revision:b.revision,centerId:'SC-NO'},'owner')).status,400);assert.equal((await state('owner')).batteries[0].status,'Original');
  await act('waste','owner',{centerId:'SC-HV'});assert.equal(b.status,'Waste');assert.equal(b.stage,3);assert.equal((await state('owner')).notifications.length,0);
  assert.equal((await call('/api/passports/lookup',{qrText:raw},'recycler')).data.battery.status,'Waste','Le statut vivant prime sur le QR imprimé.');
  await act('receive','recycler');assert.equal((await call(endpoint+'recommendation',{revision:b.revision,weights:E.defaults},'recycler')).status,409);
  const inspection={note:'Inspection complète',soh:1,modules:b.modules.map(m=>({healthy:m.fault==='none',fault:m.fault,visual:'Inspection visuelle réalisée',soh:1}))};
  const responses=await Promise.all([call(endpoint+'inspection',{...inspection,revision:b.revision},'recycler'),call(endpoint+'inspection',{...inspection,revision:b.revision},'recycler')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],JSON.stringify(responses.map(r=>r.data.error)));b=responses.find(r=>r.status===200).data;assert.equal(b.soh,73);assert.equal(b.inspection.metrics.soh,73);assert.equal(b.inspection.modules[0].soh,b.modules[0].soh);
  const rec=await call(endpoint+'recommendation',{revision:b.revision,weights:E.defaults},'recycler');assert.equal(rec.status,200);assert.equal(rec.data.title,'Repurpose');
  await act('decision','recycler',{orientation:'Repurpose',weights:E.defaults,justification:'Inspection et demande de stockage compatibles.'});assert.equal(b.stage,5);
  for(const role of ['mechanic','owner']){const s=await state(role);assert.deepEqual(s.markets,[]);assert.ok(!JSON.stringify(s).includes('Repurpose'));assert.ok(!JSON.stringify(s).includes('recommendation'));assert.equal(s.batteries[0].inspection,undefined);assert.equal(s.batteries[0].decision.recorded,true);}
  const [counts,requestStates,inspectionCounts]=await query(['MATCH (:Battery)-[:HAS_DECISION]->(d:Decision) RETURN count(d) AS n','MATCH (r:StatusRequest) RETURN r.state AS state ORDER BY state','MATCH (i:Inspection)-[r:ASSESSES]->(m:Module) RETURN count(r) AS n']);assert.equal(counts[0].n,1);assert.deepEqual(requestStates.map(r=>r.state),['APPROVED','REJECTED']);assert.equal(inspectionCounts[0].n,5);
  await seed();assert.equal((await state('recycler')).batteries[0].stage,5);
  const qr=await call('/qr/'+b.id+'.svg',null,'mechanic');assert.equal(qr.status,200);assert.match(qr.data,/<svg/);fs.writeFileSync('/tmp/flux-live-qr.svg',qr.data);
  // Même numéro de série sous un autre identifiant : ouverture du passeport existant.
  const duplicate=P.encode({...fixtures[2].passport,id:'BP-OTHER'});const same=await call('/api/passports/import',{qrText:duplicate},'mechanic');assert.equal(same.status,200);assert.equal(same.data.battery.id,b.id);assert.equal((await state('mechanic')).batteries.length,1);
  // Une ancienne batterie en attente garde son historique après migration.
  const old=structuredClone(require('../dist/seed.json').batteries[0]);old.stage=1;old.revision=1;old.diagnostic={note:'Ancien signalement',at:'2026-11-04T08:00:00Z'};await query([{statement:'CREATE (b:Battery {id:$id,payload:$payload,status:"Original",revision:1})',parameters:{id:old.id,payload:JSON.stringify(old)}}]);await seed();const migrated=(await state('owner')).batteries.find(x=>x.id===old.id);assert.equal(migrated.requests[0].note,'Ancien signalement');assert.equal(migrated.stage,1);assert.equal(migrated.soh,old.soh);
  fs.writeFileSync('/tmp/flux-qa-state.json',JSON.stringify(await state('recycler')));
  // Owner-only deletion requires confirmation and the current revision.
  for(const role of ['mechanic','recycler'])assert.equal((await call(endpoint+'delete',{revision:b.revision,confirmation:b.id},role)).status,403);
  assert.equal((await call(endpoint+'delete',{revision:b.revision,confirmation:'wrong'},'owner')).status,400);
  assert.equal((await call(endpoint+'delete',{revision:b.revision-1,confirmation:b.id},'owner')).status,409);
  const [before]=await query(['MATCH (n) WHERE n:Actor OR n:MarketDemand OR n:SortingCenter RETURN count(n) AS n']);
  assert.equal((await call(endpoint+'delete',{revision:b.revision,confirmation:b.id},'owner')).status,200);
  const [left,after,other]=await query([{statement:'MATCH (n) WHERE (n:Battery AND n.id=$id) OR (n:Module AND n.id STARTS WITH $prefix) OR n:Inspection OR n:Decision OR (n:StatusRequest AND n.id<>$legacy) RETURN count(n) AS n',parameters:{id:b.id,prefix:b.id+'-',legacy:migrated.requests[0].id}},'MATCH (n) WHERE n:Actor OR n:MarketDemand OR n:SortingCenter RETURN count(n) AS n',{statement:'MATCH (b:Battery {id:$id}) RETURN count(b) AS n',parameters:{id:old.id}}]);
  assert.equal(left[0].n,0);assert.equal(after[0].n,before[0].n);assert.equal(other[0].n,1);await seed();assert.equal((await state('recycler')).batteries.length,1,'La migration ne doit jamais se rejouer et supprimer une batterie ajoutée ensuite.');
  console.log('PASS suppression : cinq exemples retirés une seule fois, rôle, confirmation, révision, graphe privé nettoyé, références partagées conservées.');
  console.log('PASS Neo4j : ajout par QR, dédoublonnage, refus/validation avec centre agréé, réception bloquée, inspection séparée, conseils réservés au recycleur, concurrence, migration sans remise à zéro.');
 }finally{await new Promise(r=>server.close(r));await close();}
})().catch(async e=>{console.error(e);await close();process.exitCode=1;});
