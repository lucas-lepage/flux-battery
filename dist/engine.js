(function(root){
const orientations=['Reuse','Remanufacture','Repurpose','Recycle'];
const defaults={health:40,demand:30,value:20,environment:10};
function clamp(x){return Math.max(0,Math.min(100,x));}
function recommend(b,weights=defaults,markets=[]){
 const missing=['soh','age','chemistry','fault','resistance','maxResistance'].filter(k=>b[k]===null||b[k]===undefined||b[k]==='');
 const w={};for(const k of Object.keys(defaults)){const v=Number(weights[k]);if(!Number.isFinite(v)||v<0||v>100)throw Error('Les pondérations doivent être comprises entre 0 et 100.');w[k]=v;}const total=Object.values(w).reduce((a,c)=>a+c,0);if(!total)throw Error('Au moins une pondération doit être positive.');
 if(missing.length)return {title:'Diagnostic incomplet',blocked:true,reason:'Compléter : '+missing.join(', '),scores:[],rules:['Les quatre orientations nécessitent un diagnostic renseigné.'],weights:w};
 const modules=b.modules||[];const critical=b.fault==='critical'||modules.some(m=>m.fault==='critical');
 const weakest=modules.length?Math.min(...modules.map(m=>m.soh)):b.soh;
 const ratio=b.resistance/b.maxResistance;
 const reasons={Reuse:[],Remanufacture:[],Repurpose:[],Recycle:[]};
 if(critical)for(const o of orientations.slice(0,3))reasons[o].push('Défaut critique : orientation exclue dans ce prototype.');
 if(b.soh<80)reasons.Reuse.push('SOH inférieur au seuil illustratif de 80 %.');
 if(weakest<75)reasons.Reuse.push('Au moins un module a un SOH inférieur à 75 %.');
 if(b.fault!=='none')reasons.Reuse.push('Le réemploi direct nécessite une absence de défaut.');
 if(b.age>8)reasons.Reuse.push('Âge supérieur à 8 ans.');
 if(ratio>1)reasons.Reuse.push('Résistance interne au-dessus de la référence déclarée.');
 if(b.soh<45)reasons.Remanufacture.push('SOH inférieur à 45 %.');
 if(b.age>12)reasons.Remanufacture.push('Âge supérieur à 12 ans.');
 if(b.soh<60)reasons.Repurpose.push('SOH inférieur à 60 %.');
 if(weakest<50)reasons.Repurpose.push('Un module a un SOH inférieur à 50 %.');
 if(ratio>1.5)reasons.Repurpose.push('Résistance interne supérieure à 1,5 × la référence.');
 const tech={Reuse:clamp(b.soh-(b.age*1.5)),Remanufacture:clamp(65+(b.fault==='major'?15:0)-Math.abs(b.soh-65)*.4),Repurpose:clamp(90-Math.abs(b.soh-75)*1.2),Recycle:clamp(100-b.soh+(b.chemistry==='NMC'?25:10))};
 const value={Reuse:90,Remanufacture:65,Repurpose:72,Recycle:b.chemistry==='NMC'?70:45};
 const env={Reuse:95,Remanufacture:80,Repurpose:90,Recycle:60};
 const scores=orientations.map(name=>{const matches=markets.filter(m=>m.orientation===name&&m.active&&(!m.chemistry||m.chemistry===b.chemistry)&&b.soh>=m.minSoh);const demand=matches.length?Math.max(...matches.map(m=>m.urgency)):10;const criteria={health:Math.round(tech[name]),demand,value:value[name],environment:env[name]};const contributions={};let score=0;for(const k of Object.keys(w)){contributions[k]=Math.round(criteria[k]*w[k]/total*10)/10;score+=criteria[k]*w[k]/total;}return {name,score:Math.round(score*10)/10,eligible:!reasons[name].length,reasons:reasons[name],criteria,contributions,markets:matches.map(m=>m.name)};}).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score);
 const best=scores.find(s=>s.eligible);
 return {title:best.name,blocked:false,critical,reason:critical?'Recyclage orienté vers une évaluation spécialisée : validation humaine obligatoire.':`Meilleure orientation admissible : ${best.score}/100.`,scores,weights:w,rules:[`SOH du pack : ${b.soh} % ; module le plus faible : ${weakest} %.`,`Âge : ${b.age} ans ; chimie : ${b.chemistry}.`,`Résistance : ${b.resistance} mΩ ; référence déclarée : ${b.maxResistance} mΩ.`,`Défaut déclaré : ${b.fault}. Les exclusions sont appliquées avant les scores.`,'Score = somme des notes (0–100) × poids / somme des poids.','Notes économiques et environnementales : hypothèses pédagogiques fixes, sans estimation monétaire ni ACV.'],version:'rules-1.0'};
}
function validateDiagnostic(b){for(const [k,min,max] of [['soh',0,100],['age',0,40],['resistance',0,10000],['maxResistance',.001,10000]])if(!Number.isFinite(Number(b[k]))||Number(b[k])<min||Number(b[k])>max)throw Error('Valeur invalide : '+k);if(!['NMC','LFP'].includes(b.chemistry)||!['none','minor','major','critical'].includes(b.fault))throw Error('Diagnostic invalide.');if(!Array.isArray(b.modules)||b.modules.length!==5)throw Error('Le diagnostic doit comporter cinq modules.');for(const m of b.modules){if(!Number.isFinite(m.soh)||m.soh<0||m.soh>100||!Number.isFinite(m.resistance)||m.resistance<0||!['none','minor','major','critical'].includes(m.fault))throw Error('Module invalide.');}return true;}
const api={recommend,defaults,orientations,validateDiagnostic};if(typeof module!=='undefined')module.exports=api;else root.FluxEngine=api;
})(typeof window!=='undefined'?window:globalThis);
