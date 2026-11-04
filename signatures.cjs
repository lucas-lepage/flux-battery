// Signature records follow completed actions and are independent of the exporting account.
const definitions={mechanic:{role:'Mécanicien',name:'Garage Flux'},owner:{role:'Responsable',name:'Responsable du passeport'},recycler:{role:'Recycleur',name:'Centre de tri'}};
function signatureRecords(b){
 const requests=b.requests||[],events=b.events||[],previous=b.signatures||{};
 const last=xs=>xs.at(-1);
 const mechanic=last(requests)?.at||b.diagnostic?.at||last(events.filter(e=>e.action==='diagnostic'||e.title?.startsWith('Batterie signalée')))?.at||previous.mechanic?.at;
 const owner=last(requests.filter(r=>r.decidedAt))?.decidedAt||last(events.filter(e=>['waste','refuse','transfer'].includes(e.action)&&(e.actorId==='owner'||/responsable|constructeur/i.test(e.actor||''))))?.at||(b.transfer?.approved?b.transfer.at:null)||previous.owner?.at;
 const recycler=b.stage===5?(b.decision?.at||last(events.filter(e=>e.action==='decision'||e.title?.startsWith('Décision validée')||e.title==='Décision du centre de tri enregistrée'))?.at||previous.recycler?.at):null;
 const out={};for(const [key,at] of Object.entries({mechanic,owner,recycler}))if(at)out[key]={...definitions[key],at};return out;
}
function signaturesFor(b){return Object.values(signatureRecords(b));}
module.exports={signatureRecords,signaturesFor};
