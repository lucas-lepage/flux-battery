const {query}=require('./db.cjs');
const initial=require('./dist/seed.json').batteries;
const migration='remove-initial-demo-batteries-v1';
// Delete only privately owned passport records. Actors, centres and market references survive.
function deletion(id,revision=null,serial=null,once=false){return {statement:`
 MATCH (b:Battery {id:$id})
 WHERE ($serial IS NULL OR b.serial=$serial)
 AND (NOT $once OR NOT EXISTS { MATCH (:AppMigration {id:$migration,state:'DONE'}) })
 SET b._lockVersion=coalesce(b._lockVersion,0)+1
 WITH b WHERE $revision IS NULL OR b.revision=$revision
 OPTIONAL MATCH (b)-[:HAS_PASSPORT|HAS_MODULE|HAS_EVENT|HAS_DIAGNOSTIC|HAS_TRANSFER|HAS_INSPECTION|HAS_DECISION]->(n)
 WITH b,collect(DISTINCT n) AS owned
 OPTIONAL MATCH (r:StatusRequest)-[:FOR]->(b)
 WITH b,owned,collect(DISTINCT r) AS requests
 WITH b,owned+requests AS candidates
 WITH b,[n IN candidates WHERE any(label IN labels(n) WHERE label IN ["Passport","Module","Event","Diagnostic","Transfer","Inspection","Decision","StatusRequest"]) AND NOT EXISTS {
 MATCH (other:Battery)-[:HAS_PASSPORT|HAS_MODULE|HAS_EVENT|HAS_DIAGNOSTIC|HAS_TRANSFER|HAS_INSPECTION|HAS_DECISION]->(n) WHERE other<>b
 } AND NOT EXISTS { MATCH (n)-[:FOR]->(other:Battery) WHERE other<>b }] AS private
 WITH b,private,b.id AS id
 FOREACH (n IN private | DETACH DELETE n)
 DETACH DELETE b RETURN id`,parameters:{id,revision,serial,once,migration}};}
async function deleteBattery(id,revision){const [rows]=await query([deletion(id,revision)]);if(!rows.length){const e=Error('Le passeport a changé ou a déjà été supprimé. Actualisez la page.');e.status=409;throw e;}return {deleted:true,id};}
async function removeInitialExamples(){
 await query(['CREATE CONSTRAINT app_migration_id IF NOT EXISTS FOR (n:AppMigration) REQUIRE n.id IS UNIQUE']);
 // All five deletions and the completion marker commit together.
 const statements=initial.filter(b=>/^BP-00[1-5]$/.test(b.id)).map(b=>deletion(b.id,null,b.serial,true));
 statements.push({statement:'MERGE (m:AppMigration {id:$id}) ON CREATE SET m.state="DONE",m.at=datetime() RETURN m.state AS state',parameters:{id:migration}});
 await query(statements);
}
module.exports={deleteBattery,removeInitialExamples,deletion};
