const {query,close}=require('./db.cjs');const data=require('./dist/seed.json');const {normalize,DEFAULT_CENTERS}=require('./workflow.cjs');
async function seed(){
 await query(['CREATE CONSTRAINT battery_id IF NOT EXISTS FOR (n:Battery) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT module_id IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT event_id IF NOT EXISTS FOR (n:Event) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT market_id IF NOT EXISTS FOR (n:MarketDemand) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT actor_id IF NOT EXISTS FOR (n:Actor) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT decision_id IF NOT EXISTS FOR (n:Decision) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT sorting_center_id IF NOT EXISTS FOR (n:SortingCenter) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT status_request_id IF NOT EXISTS FOR (n:StatusRequest) REQUIRE n.id IS UNIQUE','CREATE CONSTRAINT inspection_id IF NOT EXISTS FOR (n:Inspection) REQUIRE n.id IS UNIQUE']);
 await query([{statement:'UNWIND $centers AS x MERGE (c:SortingCenter {id:x.id}) ON CREATE SET c += x',parameters:{centers:DEFAULT_CENTERS}},{statement:'UNWIND $markets AS x MERGE (m:MarketDemand {id:x.id}) ON CREATE SET m += x',parameters:{markets:data.markets}}]);
 const [rows]=await query(['MATCH (b:Battery) RETURN b.id AS id,b.payload AS payload,b.revision AS revision']);
 for(const row of rows){if(!row.payload)continue;const b=normalize(JSON.parse(row.payload));await query([{statement:'MATCH (b:Battery {id:$id}) WHERE b.payload=$old AND b.revision=$revision SET b.payload=$payload,b.serial=$serial,b.status=$status',parameters:{id:row.id,old:row.payload,revision:row.revision,payload:JSON.stringify(b),serial:b.serial,status:b.status}}]);
  if(b.requests.length)await query([{statement:'MATCH (b:Battery {id:$id}) UNWIND $requests AS x MERGE (r:StatusRequest {id:x.id}) ON CREATE SET r.state=x.state,r.note=x.note,r.at=x.at,r.garageName=x.garageName MERGE (r)-[:FOR]->(b)',parameters:{id:b.id,requests:b.requests}}]);
 }
 await query(['CREATE CONSTRAINT battery_serial IF NOT EXISTS FOR (n:Battery) REQUIRE n.serial IS UNIQUE']);
 await require('./maintenance.cjs').removeInitialExamples();
}
if(require.main===module)seed().then(()=>console.log('Référentiels Neo4j prêts. Passeports existants conservés ; nouveaux passeports ajoutés par scan.')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(close);
module.exports={seed};
