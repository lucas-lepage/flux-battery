const PDFDocument=require('pdfkit'),path=require('node:path');
const E=require('./dist/engine.js');
const statusNames={Original:'En service',Waste:'Hors d’usage',Oriented:'Orientation validée'};
const faults={none:'Aucun',minor:'Mineur',major:'Majeur',critical:'Critique'};
const date=v=>v?new Date(v).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}):'Non renseignée';
const fr=v=>String(v??'').replace(/\b(Original|Waste|Oriented|Reuse|Remanufacture|Repurpose|Recycle)\b/g,k=>statusNames[k]||E.orientationInfo[k]?.label||k);
function signaturesFor(b){
 const requests=b.requests||[],last=xs=>xs.at(-1);
 const mechanic=last(requests)||(b.diagnostic?.at?b.diagnostic:null),owner=last(requests.filter(r=>r.decidedAt))||last((b.events||[]).filter(e=>['waste','refuse','transfer'].includes(e.action)&&e.actorId==='owner')),recycler=b.decision?.at||b.inspection?.at||b.transfer?.receivedAt;
 return [mechanic&&{role:'Mécanicien',name:'Garage Flux',at:mechanic.at},owner&&{role:'Responsable',name:'Responsable du passeport',at:owner.decidedAt||owner.at},recycler&&{role:'Recycleur',name:'Centre de tri',at:recycler}].filter(Boolean);
}
function reportSections(b){
 return {diagnostics:(b.requests||[]).length>0,transfer:!!b.transfer,received:!!b.transfer?.receivedAt,inspection:!!b.inspection,decision:!!b.decision,signatures:signaturesFor(b)};
}
async function generateReport(b,{generatedAt=new Date()}={}){
 const doc=new PDFDocument({size:'A4',margins:{top:44,bottom:48,left:44,right:44},bufferPages:true,info:{Title:'Rapport de suivi - '+b.id,Author:'FLUX - Démonstration',Subject:'État du parcours à la date d’édition - signatures fictives'}});
 const chunks=[];const finished=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.registerFont('Body',path.join(__dirname,'assets/fonts/DejaVuSans.ttf'));doc.registerFont('Bold',path.join(__dirname,'assets/fonts/DejaVuSans-Bold.ttf'));
 const x=44,width=507,ink='#1a2b43',muted='#617087',blue='#2856a1';let y=44;
 const bottom=()=>doc.page.height-62;
 function newPage(){doc.addPage();y=44;doc.font('Bold').fontSize(9).fillColor(blue).text('FLUX  /  '+b.id+'  /  Rapport de suivi',x,y);y+=26;}
 function ensure(h){if(y+h>bottom())newPage();}
 function text(value,{size=9,color=ink,bold=false,indent=0}={}){const valueText=fr(value);doc.font(bold?'Bold':'Body').fontSize(size);const h=doc.heightOfString(valueText,{width:width-indent,lineGap:2});ensure(h+4);doc.font(bold?'Bold':'Body').fontSize(size).fillColor(color).text(valueText,x+indent,y,{width:width-indent,lineGap:2});y+=h+4;}
 function heading(title){ensure(40);y+=8;doc.moveTo(x,y).lineTo(x+width,y).lineWidth(.5).strokeColor('#dce3ed').stroke();y+=10;text(title,{bold:true,size:10,color:blue});}
 function pair(label,value){text(label+' : '+(value??'Non renseigné'));}
 function table(headers,rows,ratios){const widths=ratios.map(r=>r*width);function row(values,header=false){doc.font(header?'Bold':'Body').fontSize(8);const heights=values.map((v,i)=>doc.heightOfString(fr(v),{width:widths[i]-12,lineGap:1}));const h=Math.max(...heights)+10;if(y+h>bottom()){newPage();if(!header)row(headers,true);}if(header)doc.rect(x,y,width,h).fill('#edf2fa');let offset=x;values.forEach((v,i)=>{doc.font(header?'Bold':'Body').fontSize(8).fillColor(ink).text(fr(v),offset+6,y+5,{width:widths[i]-12,lineGap:1});offset+=widths[i];});doc.moveTo(x,y+h).lineTo(x+width,y+h).strokeColor('#e4e9f1').lineWidth(.4).stroke();y+=h;}
 row(headers,true);rows.forEach(r=>row(r));y+=9;}
 doc.font('Bold').fontSize(20).fillColor(blue).text('FLUX',x,y);doc.font('Body').fontSize(8).fillColor(muted).text('BATTERY PASSPORT',x+70,y+8);y+=36;
 text('Rapport de suivi de batterie',{size:17,bold:true});text(b.id+'  •  '+b.model,{size:11,bold:true});
 text('Édité le '+date(generatedAt)+'  |  Révision '+b.revision,{size:8,color:muted});
 text('Statut : '+(statusNames[b.status]||b.status),{bold:true,color:blue});
 text('Photographie du dossier à la date d’édition. Les étapes non réalisées ne sont pas ajoutées au rapport.',{size:8,color:muted});
 heading('1. Identification et caractéristiques');
 table(['Identification','Valeur'],[['Numéro de série',b.serial],['Constructeur / responsable',b.manufacturer+' / '+b.owner],['Chimie / capacité',b.chemistry+' / '+b.capacity+' kWh'],['État de santé (SOH) / âge',b.soh+' % / '+b.age+' ans'],['Cycles / résistance interne',b.cycles+' / '+b.resistance+' mΩ'],['Résistance de référence / défaut initial',b.maxResistance+' mΩ / '+(faults[b.fault]||b.fault)]],[.44,.56]);
 table(['Module','SOH','Résistance','Défaut initial'],(b.modules||[]).map((m,i)=>['Module '+(i+1),m.soh+' %',m.resistance+' mΩ',faults[m.fault]||m.fault]),[.25,.2,.25,.3]);
 if(b.requests?.length){heading('2. Diagnostic et demande au responsable');for(const [i,r]of b.requests.entries()){text('Signalement '+(i+1)+' - '+date(r.at)+' - '+r.garageName,{bold:true});text(r.note);if(r.decidedAt){text((r.state==='APPROVED'?'Validation du responsable':'Refus du responsable')+' - '+date(r.decidedAt),{bold:true});if(r.state==='REJECTED')text('Motif du refus : '+r.refusalReason);}else text('En attente de validation du responsable.',{color:muted});}}
 if(b.transfer){heading('3. Destination et réception');pair('Centre de tri',b.transfer.destination);pair('Destination enregistrée le',date(b.transfer.at));if(b.transfer.receivedAt)pair('Réception confirmée le',date(b.transfer.receivedAt));else text('Réception non encore confirmée.',{color:muted});}
 if(b.inspection){heading('4. Inspection du recycleur');pair('Inspection enregistrée le',date(b.inspection.at));text(b.inspection.note);table(['Module','État constaté','Défaut','Observation'],b.inspection.modules.map((m,i)=>['Module '+(i+1),m.healthy?'Sain':'À traiter',faults[m.fault]||m.fault,m.visual]),[.16,.2,.18,.46]);}
 else if(b.inspected){heading('4. Inspection du recycleur');text('Inspection enregistrée. Les détails techniques sont réservés au compte recycleur.');}
 if(b.decision){heading('5. Décision du centre de tri');pair('Décision enregistrée le',date(b.decision.at));if(b.decision.orientation){const info=E.orientationInfo[b.decision.orientation];text(info?.label||b.decision.orientation,{bold:true});if(info)text(info.description);pair('Justification',b.decision.justification);if(b.decision.recommendation?.scores)table(['Orientation','Score','Résultat'],b.decision.recommendation.scores.map(s=>[E.orientationInfo[s.name]?.label||s.name,s.eligible?s.score+' / 100':'- ',s.eligible?'Admissible':'Exclue : '+s.reasons.join(' ')]),[.4,.16,.44]);if(info)pair('Prochaine action',info.next);}else text('Orientation validée par le centre de tri. Le détail de la décision est réservé au compte recycleur.');text('La décision est enregistrée ; ce document ne certifie pas la réalisation du traitement physique.',{size:8,color:muted});}
 if(b.events?.length){heading('Historique des étapes réalisées');for(const e of b.events)text(date(e.at)+' - '+e.title,{size:8});}
 const signatures=signaturesFor(b);
 if(signatures.length){
  const signatureHeight=118;if(y+signatureHeight>bottom())newPage();y=Math.max(y+12,bottom()-signatureHeight);
  doc.moveTo(x,y).lineTo(x+width,y).strokeColor('#cbd5e4').stroke();y+=10;
  doc.font('Bold').fontSize(9).fillColor(blue).text('Signatures des intervenants',x,y);y+=21;
  const col=width/3;signatures.forEach((s,i)=>{const sx=x+i*col;doc.font('Bold').fontSize(8).fillColor(ink).text(s.role,sx,y,{width:col-14});doc.save().translate(sx+5,y+21).lineWidth(.9).strokeColor('#315b97').path('M0 12 C9 -7 12 25 20 4 C25 -8 16 23 29 7 C38 -2 25 21 43 9 L60 4 M7 17 L70 10').stroke().restore();doc.font('Body').fontSize(7).fillColor(muted).text(s.name,sx,y+44,{width:col-14}).text(date(s.at),sx,y+57,{width:col-14});});
 }
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.font('Body').fontSize(7).fillColor(muted).text('FLUX - '+b.id+' - Rapport de suivi',44,doc.page.height-33,{lineBreak:false});doc.text((i+1)+' / '+range.count,510,doc.page.height-33,{lineBreak:false});}
 doc.end();return finished;
}
module.exports={generateReport,signaturesFor,reportSections};
