const fs=require('node:fs');
if(fs.existsSync('.env'))for(const line of fs.readFileSync('.env','utf8').split('\n')){const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}
const neo4j=require('neo4j-driver');let driver;
function getDriver(){if(!driver){const uri=process.env.NEO4J_URI;if(!uri||!process.env.NEO4J_PASSWORD)throw Error('Configurer NEO4J_URI et NEO4J_PASSWORD dans Render.');driver=neo4j.driver(uri,neo4j.auth.basic(process.env.NEO4J_USERNAME||process.env.NEO4J_USER||'neo4j',process.env.NEO4J_PASSWORD),{disableLosslessIntegers:true,maxConnectionPoolSize:5,connectionAcquisitionTimeout:20000,maxTransactionRetryTime:10000});}return driver;}
async function query(statements){const session=getDriver().session({database:process.env.NEO4J_DATABASE||'neo4j'});try{return await session.executeWrite(async tx=>{const results=[];for(const item of statements){const s=typeof item==='string'?{statement:item}:item;const result=await tx.run(s.statement,s.parameters||{});results.push(result.records.map(r=>r.toObject()));}return results;});}catch(e){const err=Error('Erreur Neo4j : '+(e.code||'connexion indisponible'));err.status=e.code?.startsWith('Neo.TransientError')?409:503;throw err;}finally{await session.close();}}
async function close(){if(driver){await driver.close();driver=null;}}
module.exports={query,close};
