const qrcode=require('qrcode'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {query}=require('./db.cjs');const W=require('./workflow.cjs');const P=require('./dist/passport-qr.js');
const sessions=new Map(),attempts=new Map(),queues=new Map();
const accountPasswordKeys={mechanic:'MECHANIC_PASSWORD',owner:'OWNER_PASSWORD',recycler:'RECYCLER_PASSWORD'};
function accountPassword(role){return process.env[accountPasswordKeys[role]]||'';}
function validatePasswords(){const values=Object.values(accountPasswordKeys).map(key=>{const v=process.env[key];if(!v||v.length<12)throw Error(key+' doit contenir au moins 12 caractères.');return v;});if(new Set(values).size!==3)throw Error('Les trois comptes doivent avoir des mots de passe différents.');}
function serialize(id,task){const prior=queues.get(id)||Promise.resolve();const run=prior.catch(()=>{}).then(task);queues.set(id,run);return run.finally(()=>{if(queues.get(id)===run)queues.delete(id);});}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function identity(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('flux_session='))?.slice(13);const u=sessions.get(token);if(!u||u.expires<Date.now()){sessions.delete(token);return null;}return {...u,token};}
async function body(req){let value='';for await(const c of req){value+=c;if(value.length>40000)WFail('Requête trop volumineuse.',413);}try{return JSON.parse(value||'{}');}catch{WFail('JSON invalide.');}}
function WFail(message,status=400){const err=Error(message);err.status=status;throw err;}
function eq(a,b){return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest());}
async function readState(){const [bs,markets,centers]=await query(['MATCH (b:Battery) RETURN b.payload AS payload ORDER BY b.id','MATCH (d:MarketDemand) RETURN properties(d) AS demand ORDER BY d.id','MATCH (c:SortingCenter) RETURN properties(c) AS center ORDER BY c.name']);return {batteries:bs.map(x=>W.normalize(JSON.parse(x.payload))),markets:markets.map(x=>x.demand),centers:centers.map(x=>x.center)};}
async function persist(b,expected,action){
 const token=crypto.randomUUID(),last=b.events.at(-1);
 const common={id:b.id,token};
 const requests=b.requests.map(r=>({...r,decidedAt:r.decidedAt||'',refusalReason:r.refusalReason||'',centerId:r.centerId||'',requestedBy:r.requestedBy||'mechanic'}));
 const events=b.events.map(e=>({...e,actorId:e.actorId||'system',action:e.action||'legacy'}));
 const transfer=b.transfer?[{...b.transfer,receivedAt:b.transfer.receivedAt||''}]:[];
 const inspection=action==='inspection'?[{id:b.inspection.id,at:b.inspection.at,note:b.inspection.note,healthyCount:b.inspection.modules.filter(m=>m.healthy).length,snapshot:JSON.stringify(b.inspection)}]:[];
 const decision=action==='decision'?[{id:b.decision.id,at:b.decision.at,orientation:b.decision.orientation,justification:b.decision.justification,score:b.decision.score,snapshot:JSON.stringify(b.decision)}]:[];
 const statements=[
 {statement:'MATCH (b:Battery {id:$id}) SET b._lockVersion=coalesce(b._lockVersion,0)+1 WITH b WHERE b.revision=$expected SET b.payload=$payload,b.status=$status,b.revision=$revision,b._writeToken=$token RETURN b.id AS id',parameters:{...common,expected,payload:JSON.stringify(b),status:b.status,revision:b.revision}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token}) UNWIND $events AS x MERGE (e:Event {id:x.id}) ON CREATE SET e.at=x.at,e.title=x.title,e.detail=x.detail,e.actor=x.actor,e.action=x.action MERGE (b)-[:HAS_EVENT]->(e) MERGE (a:Actor {id:x.actorId}) ON CREATE SET a.name=x.actor MERGE (a)-[:PERFORMED]->(e)',parameters:{...common,events}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token}) UNWIND $requests AS x MERGE (r:StatusRequest {id:x.id}) SET r.state=x.state,r.fromStatus=x.fromStatus,r.toStatus=x.toStatus,r.note=x.note,r.at=x.at,r.garageName=x.garageName,r.decidedAt=x.decidedAt,r.refusalReason=x.refusalReason,r.centerId=x.centerId MERGE (r)-[:FOR]->(b) MERGE (g:Actor {id:x.requestedBy}) MERGE (g)-[:CREATED]->(r) MERGE (o:Actor {id:"owner"}) MERGE (r)-[:ASSIGNED_TO]->(o)',parameters:{...common,requests}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token}) UNWIND $transfers AS x MERGE (t:Transfer {id:x.id}) SET t.destination=x.destination,t.state=x.state,t.at=x.at,t.receivedAt=x.receivedAt,t.centerId=x.centerId MERGE (b)-[:HAS_TRANSFER]->(t) WITH t,x MATCH (c:SortingCenter {id:x.centerId}) MERGE (t)-[:TO_CENTER]->(c)',parameters:{...common,transfers:transfer}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token}) UNWIND $inspections AS x MERGE (i:Inspection {id:x.id}) SET i.at=x.at,i.note=x.note,i.healthyCount=x.healthyCount,i.snapshot=x.snapshot MERGE (b)-[:HAS_INSPECTION]->(i) WITH i UNWIND $modules AS m MATCH (original:Module {id:m.id}) MERGE (i)-[o:ASSESSES]->(original) SET o.healthy=m.healthy,o.fault=m.fault,o.visual=m.visual',parameters:{...common,inspections:inspection,modules:action==='inspection'?b.inspection.modules:[]}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token}) UNWIND $decisions AS x MERGE (d:Decision {id:x.id}) SET d.orientation=x.orientation,d.justification=x.justification,d.score=x.score,d.at=x.at,d.snapshot=x.snapshot MERGE (b)-[:HAS_DECISION]->(d) WITH d MATCH (a:Actor {id:"recycler"}) MERGE (a)-[:TOOK]->(d) WITH d MATCH (e:Event {id:$eventId}) MERGE (d)-[:RECORDED_AS]->(e)',parameters:{...common,decisions:decision,eventId:last.id}},
 {statement:'MATCH (b:Battery {id:$id,_writeToken:$token})-[:HAS_DECISION]->(d:Decision {id:$decisionId}) MATCH (m:MarketDemand) WHERE m.id IN $marketIds MERGE (d)-[:CONSIDERED]->(m)',parameters:{...common,decisionId:action==='decision'?b.decision.id:'',marketIds:action==='decision'?b.decision.markets.map(m=>m.id):[]}}
 ];
 const [result]=await query(statements);if(!result.length)WFail('Le passeport a changé. Actualisez la page avant de réessayer.',409);
}
async function findPassport(passport){const [rows]=await query([{statement:'MATCH (b:Battery) WHERE b.id=$id OR b.serial=$serial RETURN b.payload AS payload ORDER BY b.id',parameters:{id:passport.id,serial:passport.serial||''}}]);return rows.length?W.normalize(JSON.parse(rows[0].payload)):null;}
async function importPassport(passport){
 const existing=await findPassport(passport);if(existing){if(existing.id===passport.id&&existing.serial!==passport.serial)WFail('Cet identifiant est déjà associé à un autre numéro de série.',409);return {created:false,battery:W.projectBattery(existing,'mechanic')};}
 const at=new Date().toISOString(),id=crypto.randomUUID(),token=crypto.randomUUID();
 const b={...passport,status:'Original',stage:0,revision:0,requests:[],diagnostic:null,transfer:null,inspection:null,inspected:false,decision:null,events:[{id,at,actor:'Garage Flux',actorId:'mechanic',action:'scan',title:'Passeport ajouté par scan',detail:'Données du QR vérifiées et passeport ajouté au statut Original.'}]};
 try{const [rows]=await query([{statement:'MERGE (b:Battery {id:$id}) ON CREATE SET b.payload=$payload,b.serial=$serial,b.status="Original",b.revision=0,b._importToken=$token WITH b WHERE b._importToken=$token MERGE (p:Passport {id:$id}) MERGE (b)-[:HAS_PASSPORT]->(p) MERGE (o:Actor {id:$owner}) ON CREATE SET o.name=$owner,o.role="owner" MERGE (o)-[:RESPONSIBLE_FOR]->(p) FOREACH (x IN $modules | MERGE (m:Module {id:x.id}) SET m.soh=x.soh,m.resistance=x.resistance,m.fault=x.fault,m.visual=x.visual MERGE (b)-[:HAS_MODULE]->(m)) MERGE (e:Event {id:$event.id}) SET e += $event MERGE (b)-[:HAS_EVENT]->(e) MERGE (g:Actor {id:"mechanic"}) MERGE (g)-[:PERFORMED]->(e) RETURN b.id AS id',parameters:{id:b.id,payload:JSON.stringify(b),serial:b.serial,token,owner:b.owner,modules:b.modules,event:b.events[0]}}]);if(rows.length)return {created:true,battery:W.projectBattery(b,'mechanic')};}
 catch(e){if(!e.message.includes('ConstraintValidation'))throw e;}
 const raced=await findPassport(passport);if(!raced)WFail('Le passeport n’a pas pu être ajouté. Réessayez.',409);if(raced.id===passport.id&&raced.serial!==passport.serial)WFail('Cet identifiant est déjà utilisé par une autre batterie.',409);return {created:false,battery:W.projectBattery(raced,'mechanic')};
}
const allowed={diagnostic:'mechanic',waste:'owner',refuse:'owner',transfer:'owner',receive:'recycler',inspection:'recycler',decision:'recycler',recommendation:'recycler'};
function createServer(){return http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 const qr=url.pathname.match(/^\/qr\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.svg$/);
 if(qr&&req.method==='GET'){const u=identity(req);if(!u)return send(res,401,{error:'Connexion requise.'});const b=await findPassport({id:qr[1]});if(!b)return send(res,404,{error:'Passeport inconnu.'});const svg=await qrcode.toString(P.encode(b),{type:'svg',margin:3,errorCorrectionLevel:'M'});res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});return res.end(svg);}
 if(url.pathname.startsWith('/api/')){
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return send(res,403,{error:'Origine non autorisée.'});
  if(url.pathname==='/api/health')return send(res,200,{mode:'neo4j'});
  if(url.pathname==='/api/login'&&req.method==='POST'){
   const p=await body(req),key=req.socket.remoteAddress,now=Date.now();let limit=attempts.get(key);if(!limit||limit.until<now){limit={count:0,until:now+600000};attempts.set(key,limit);}if(limit.count>=30)return send(res,429,{error:'Trop de tentatives. Réessayez dans 10 minutes.'});
   if(!Object.hasOwn(accountPasswordKeys,p.username)||typeof p.password!=='string'||!eq(p.password,accountPassword(p.username))){limit.count++;return send(res,401,{error:'Identifiants incorrects.'});}
   attempts.delete(key);const previous=identity(req);if(previous)sessions.delete(previous.token);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{user:p.username,role:p.username,expires:now+8*3600000});res.setHeader('Set-Cookie',`flux_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(res,200,{ok:true});
  }
  const u=identity(req);if(!u)return send(res,401,{error:'Connexion requise.'});
  if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(u.token);res.setHeader('Set-Cookie','flux_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
  if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,W.projectState(await readState(),u.role,u.user));
  if(url.pathname==='/api/passports/lookup'&&req.method==='POST'){const p=await body(req),decoded=P.read(p.qrText),found=await findPassport(decoded.passport||{id:decoded.id});return send(res,200,{exists:!!found,battery:found?W.projectBattery(found,u.role):null,passport:!found&&u.role==='mechanic'?decoded.passport:null});}
  if(url.pathname==='/api/passports/import'&&req.method==='POST'){if(u.role!=='mechanic')return send(res,403,{error:'Seul le mécanicien peut ajouter un passeport par scan.'});const p=await body(req),decoded=P.read(p.qrText);if(!decoded.passport)WFail('Ce QR contient seulement un lien. Les données du passeport sont requises pour un ajout.');const result=await serialize('import:'+decoded.id,()=>importPassport(decoded.passport));return send(res,result.created?201:200,result);}
  const m=url.pathname.match(/^\/api\/batteries\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/(diagnostic|waste|refuse|transfer|receive|inspection|decision|recommendation)$/);
  if(m&&req.method==='POST'){
   if(allowed[m[2]]!==u.role)return send(res,403,{error:'Action réservée à un autre rôle.'});const p=await body(req);
   const result=await serialize(m[1],async()=>{const state=await readState(),b=state.batteries.find(x=>x.id===m[1]);if(!b)WFail('Batterie introuvable.',404);if(p.revision!==b.revision)WFail('Révision périmée. Actualisez la page.',409);if(m[2]==='recommendation')return W.recommend(b,p.weights,state.markets);
    const expected=b.revision,clean=W.cleanPayload(m[2],p,b);W.apply(b,m[2],clean,u.role,state.markets,state.centers);await persist(b,expected,m[2]);return W.projectBattery(b,u.role);});return send(res,200,result);
  }
  return send(res,404,{error:'Route inconnue.'});
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';if(name==='/seed.json'){res.writeHead(403);return res.end('Accès via le serveur uniquement.');}
 const file=path.resolve(__dirname,'dist','.'+name),root=path.resolve(__dirname,'dist')+path.sep;
 if(!file.startsWith(root)){res.writeHead(403);return res.end();}if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Introuvable');}
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
 }catch(e){send(res,e.status||400,{error:e.message.startsWith('Erreur Neo4j')?'Base Neo4j momentanément indisponible.':e.message});}});}
if(require.main===module){validatePasswords();createServer().listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1');}
module.exports={createServer,validatePasswords,readState};
