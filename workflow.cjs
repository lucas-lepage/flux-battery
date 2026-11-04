const E=require('./dist/engine.js'),{randomUUID}=require('node:crypto');
const roles={mechanic:'Garage Flux',owner:'Responsable constructeur',recycler:'Centre de tri'};
const DEFAULT_CENTERS=[{id:'SC-HV',name:'Centre de tri Hill Valley',city:'Hill Valley',approved:true},{id:'SC-GC',name:'GreenCycle · centre de démonstration',city:'Lyon',approved:true},{id:'SC-NO',name:'Centre non agréé · démonstration',city:'Paris',approved:false}];
function fail(message,status=400){const err=Error(message);err.status=status;throw err;}
function requireState(ok,message){if(!ok)fail(message,409);}
function text(value,label,max=1000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+' requis (1–'+max+' caractères).');return value.trim();}
function normalize(b){
 if(!b||!b.id)fail('Passeport incompatible avec le modèle FLUX.',503);
 b.requests=Array.isArray(b.requests)?b.requests:[];
 if(b.stage===1&&!b.requests.some(r=>r.state==='PENDING'))b.requests.push({id:'legacy-request-'+b.id,state:'PENDING',fromStatus:'Original',toStatus:'Waste',note:b.diagnostic?.note||'Signalement du garagiste',at:b.diagnostic?.at||b.events?.at(-1)?.at||new Date().toISOString(),garageName:'Garage Flux',requestedBy:'mechanic'});
 if(b.transfer){b.transfer.id=b.transfer.id||'legacy-transfer-'+b.id;b.transfer.centerId=b.transfer.centerId||DEFAULT_CENTERS.find(c=>c.name===b.transfer.destination)?.id||'';b.transfer.state=b.stage>=4?'RECEIVED':'PLANNED';}
 if(b.inspected&&!b.inspection)b.inspection={id:'legacy-inspection-'+b.id,at:b.events?.findLast(e=>e.title==='Inspection du centre de tri')?.at||new Date().toISOString(),note:'Inspection antérieure conservée',metrics:metrics(b),modules:b.modules.map(m=>({...m,healthy:m.fault==='none'})),legacy:true};
 if(b.decision)b.decision.id=b.decision.id||'legacy-decision-'+b.id;
 return b;
}
function metrics(b){return {soh:b.soh,age:b.age,cycles:b.cycles,chemistry:b.chemistry,resistance:b.resistance,maxResistance:b.maxResistance};}
function event(b,role,action,title,detail){b.events.push({id:randomUUID(),at:new Date().toISOString(),actor:roles[role],actorId:role,action,title,detail});b.revision++;}
function pending(b,p){const r=b.requests.find(r=>r.state==='PENDING');requireState(!!r,'Aucune demande en attente.');if(p.requestId&&p.requestId!==r.id)fail('La demande a changé. Actualisez le suivi.',409);return r;}
function centerFor(id,centers){const c=centers.find(c=>c.id===id);if(!c||c.approved!==true)fail('Choisissez un centre de tri agréé.');return c;}
function decisionInput(b){requireState(b.stage>=4&&b.status==='Waste'&&b.inspected&&!!b.inspection,'Confirmez la réception et enregistrez l’inspection avant de calculer une recommandation.');const data={...b,...b.inspection.metrics,modules:b.inspection.modules};const levels=['none','minor','major','critical'];data.fault=[b.fault,...data.modules.map(m=>m.fault)].reduce((a,c)=>levels.indexOf(c)>levels.indexOf(a)?c:a,'none');return data;}
function recommend(b,weights,markets){return E.recommend(decisionInput(b),weights,markets);}
function cleanPayload(action,p,b){
 if(action==='diagnostic')return {note:text(p.note,'Motif du signalement')};
 if(action==='waste'||action==='transfer')return {requestId:p.requestId,centerId:p.centerId};
 if(action==='refuse')return {requestId:p.requestId,note:text(p.note,'Motif du refus')};
 if(action==='inspection'){
  const note=text(p.note,'Constat d’inspection');if(!Array.isArray(p.modules)||p.modules.length!==b.modules.length)fail('Renseignez les cinq modules.');
  const modules=b.modules.map((base,i)=>{const m=p.modules[i];if(!m||typeof m.healthy!=='boolean'||!['none','minor','major','critical'].includes(m.fault))fail('Diagnostic de module invalide.');if(m.healthy&&m.fault!=='none')fail('Un module déclaré sain ne peut pas avoir un défaut.');return {...base,healthy:m.healthy,fault:!m.healthy&&m.fault==='none'?'minor':m.fault,visual:text(m.visual,'Constat visuel du module '+(i+1),200)};});return {note,modules};
 }
 if(action==='decision')return {orientation:p.orientation,weights:p.weights,justification:text(p.justification,'Justification de la décision',2000)};
 return {};
}
function apply(b,action,p,role,markets=[],centers=DEFAULT_CENTERS){
 normalize(b);
 const allowed={diagnostic:'mechanic',waste:'owner',refuse:'owner',transfer:'owner',receive:'recycler',inspection:'recycler',decision:'recycler'};
 if(allowed[action]!==role)fail('Action non autorisée pour ce compte.',403);
 if(action==='diagnostic'){
  requireState(b.stage===0&&b.status==='Original'&&!b.requests.some(r=>r.state==='PENDING'),'Une demande existe déjà ou le passeport n’est plus Original.');
  const note=text(p.note,'Motif du signalement');const r={id:randomUUID(),state:'PENDING',fromStatus:'Original',toStatus:'Waste',note,at:new Date().toISOString(),garageName:roles.mechanic,requestedBy:'mechanic'};
  b.requests.push(r);b.diagnostic={note,at:r.at};b.stage=1;event(b,role,action,'Batterie signalée hors d’usage',note);
 }else if(action==='waste'){
  requireState(b.stage===1&&b.status==='Original','La demande ne peut plus être validée.');const r=pending(b,p),c=centerFor(p.centerId,centers);
  Object.assign(r,{state:'APPROVED',decidedAt:new Date().toISOString(),decidedBy:'owner',centerId:c.id});b.status='Waste';b.stage=3;
  b.transfer={id:randomUUID(),centerId:c.id,destination:c.name,approved:true,state:'PLANNED',at:new Date().toISOString()};
  event(b,role,action,'Statut Original → Waste','Demande du garage validée par le constructeur.');event(b,role,'transfer','Destination de tri confirmée',c.name);
 }else if(action==='refuse'){
  requireState(b.stage===1&&b.status==='Original','La demande ne peut plus être refusée.');const r=pending(b,p);Object.assign(r,{state:'REJECTED',refusalReason:text(p.note,'Motif du refus'),decidedAt:new Date().toISOString(),decidedBy:'owner'});b.stage=0;event(b,role,action,'Signalement refusé',r.refusalReason);
 }else if(action==='transfer'){
  requireState(b.status==='Waste'&&(b.stage===2||(b.stage===3&&!b.transfer?.approved)),'La destination ne peut plus être modifiée.');const c=centerFor(p.centerId,centers);b.transfer={id:b.transfer?.id||randomUUID(),centerId:c.id,destination:c.name,approved:true,state:'PLANNED',at:new Date().toISOString()};b.stage=3;event(b,role,action,'Destination de tri confirmée',c.name);
 }else if(action==='receive'){
  requireState(b.status==='Waste','Réception bloquée : le statut du passeport est encore Original.');requireState(b.stage===3&&!!b.transfer,'Le responsable doit confirmer la destination avant réception.');centerFor(b.transfer.centerId,centers);b.transfer.state='RECEIVED';b.transfer.receivedAt=new Date().toISOString();b.stage=4;event(b,role,action,'Réception confirmée','Statut Waste vérifié à l’arrivée au centre de tri.');
 }else if(action==='inspection'){
  requireState(b.stage===4&&b.status==='Waste','Confirmez la réception avant l’inspection.');const inspection={id:randomUUID(),at:new Date().toISOString(),note:text(p.note,'Constat d’inspection'),metrics:metrics(b),modules:p.modules};
  E.validateDiagnostic({...b,...inspection.metrics,modules:inspection.modules});b.inspection=inspection;b.inspected=true;event(b,role,action,'Inspection du centre de tri',inspection.note);
 }else if(action==='decision'){
  requireState(b.stage===4&&!b.decision,'Une décision est déjà enregistrée ou la réception manque.');const rec=recommend(b,p.weights,markets);const chosen=rec.scores.find(s=>s.name===p.orientation&&s.eligible);if(!chosen)fail('Orientation non admissible.');
  b.decision={id:randomUUID(),orientation:p.orientation,score:chosen.score,justification:text(p.justification,'Justification de la décision',2000),at:new Date().toISOString(),recommendation:rec,inputSnapshot:decisionInput(b),markets:structuredClone(markets),actor:roles.recycler};b.stage=5;event(b,role,action,'Décision validée · '+p.orientation,b.decision.justification);
 }
 return b;
}
function projectBattery(b,role){const out=structuredClone(b);if(role!=='recycler'){
 delete out.expected;delete out.inspection;out.decision=out.decision?{recorded:true,at:out.decision.at}:null;
 out.events=out.events.map(e=>{if(e.action==='decision'||e.title?.startsWith('Décision validée'))return {...e,title:'Décision du centre de tri enregistrée',detail:'Étape terminée par le centre de tri.'};if(e.action==='inspection'||e.title==='Inspection du centre de tri')return {...e,detail:'Inspection technique enregistrée par le centre de tri.'};return e;});
 }return out;}
function projectState(state,role,user){return {batteries:state.batteries.map(b=>projectBattery(b,role)),markets:role==='recycler'?state.markets:[],centers:role==='owner'?state.centers.filter(c=>c.approved===true):[],role,user,notifications:role==='owner'?state.batteries.flatMap(b=>b.requests.filter(r=>r.state==='PENDING').map(r=>({...r,batteryId:b.id,model:b.model}))):[]};}
module.exports={apply,normalize,cleanPayload,recommend,decisionInput,projectBattery,projectState,DEFAULT_CENTERS};
