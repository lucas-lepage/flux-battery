(function(root){
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id);
 function required(v,label,max=120){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+' absent ou invalide dans le QR code.');return v.trim();}
 function number(v,label,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' invalide dans le QR code.');return v;}
 function clean(p){if(!p||!validId(p.id))throw Error('Identifiant de passeport invalide.');if(p.status&&p.status!=='Original')throw Error('Un nouveau passeport doit être émis au statut Original.');if(!['NMC','LFP'].includes(p.chemistry))throw Error('Chimie non prise en charge.');if(!['none','minor','major','critical'].includes(p.fault))throw Error('Classification du défaut absente.');if(!Array.isArray(p.modules)||p.modules.length!==5)throw Error('Le QR code doit contenir cinq modules.');
 const modules=p.modules.map((m,i)=>{if(!m||!['none','minor','major','critical'].includes(m.fault))throw Error('Défaut de module invalide.');return {id:p.id+'-M'+(i+1),soh:number(m.soh,'SOH module',0,100),resistance:number(m.resistance,'Résistance module',0,10000),fault:m.fault,visual:required(m.visual,'Constat du module',200)};});
 return {id:p.id,serial:required(p.serial,'Numéro de série'),model:required(p.model,'Modèle'),manufacturer:required(p.manufacturer,'Constructeur'),owner:required(p.owner,'Responsable'),chemistry:p.chemistry,capacity:number(p.capacity,'Capacité',.001,100000),age:number(p.age,'Âge',0,40),cycles:number(p.cycles,'Cycles',0,1000000),soh:number(p.soh,'SOH',0,100),resistance:number(p.resistance,'Résistance',0,10000),maxResistance:number(p.maxResistance,'Référence résistance',.001,10000),fault:p.fault,modules,status:'Original'};
 }
 const faults=['none','minor','major','critical'];
 function encode(passport){
  const p=clean({...passport,status:'Original'}),visuals=[...new Set(p.modules.map(m=>m.visual))];
  // Positional schema removes repeated field names and module IDs, without losing values.
  const data=[p.id,p.serial,p.model,p.manufacturer,p.owner,p.chemistry,p.capacity,p.age,p.cycles,p.soh,p.resistance,p.maxResistance,faults.indexOf(p.fault),visuals,p.modules.map(m=>[m.soh,m.resistance,faults.indexOf(m.fault),visuals.indexOf(m.visual)])];
  const text='FLUX2:'+JSON.stringify(data);if(new TextEncoder().encode(text).length>2200)throw Error('Les informations dépassent la capacité prévue pour le QR code. Raccourcissez les libellés.');return text;
 }
 function read(raw){
  if(typeof raw!=='string'||raw.length>12000)throw Error('Contenu QR invalide.');raw=raw.trim();
  if(raw.startsWith('FLUX2:')){
   let d;try{d=JSON.parse(raw.slice(6));}catch{throw Error('QR compact incomplet ou illisible.');}
   if(!Array.isArray(d)||d.length!==15||!Array.isArray(d[13])||!Array.isArray(d[14]))throw Error('Format de passeport compact invalide.');
   const passport=clean({id:d[0],serial:d[1],model:d[2],manufacturer:d[3],owner:d[4],chemistry:d[5],capacity:d[6],age:d[7],cycles:d[8],soh:d[9],resistance:d[10],maxResistance:d[11],fault:faults[d[12]],status:'Original',modules:d[14].map(m=>{if(!Array.isArray(m)||m.length!==4)throw Error('Module compact invalide.');return {soh:m[0],resistance:m[1],fault:faults[m[2]],visual:d[13][m[3]]};})});
   return {id:passport.id,passport,legacy:false};
  }
  let data;try{data=JSON.parse(raw);}catch{try{const url=new URL(raw),id=url.searchParams.get('battery');if(validId(id))return {id,passport:null,legacy:true};}catch{}throw Error('Ce QR code ne contient pas un passeport FLUX reconnu.');}
  if(data.format!=='FLUX-PASSPORT'||data.version!==1)throw Error('Format de passeport QR non reconnu.');const passport=clean(data.passport);return {id:passport.id,passport,legacy:false};
 }
 const api={read,encode,clean,validId};if(typeof module!=='undefined')module.exports=api;else root.FluxQR=api;
})(typeof window!=='undefined'?window:globalThis);
