import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
const start=read('app/api/assessment/start/route.ts');
const results=read('app/app/results/page.tsx');
const dossier=read('app/api/assessment/results/dossier/route.ts');
const catalog=read('lib/assessment-catalog.ts');

function assert(condition:boolean,message:string){if(!condition)throw new Error(message);}
function gate(n:number,label:string,fn:()=>void){console.log(`[GATE ${n}] ${label}...`);fn();console.log('PASS');}

gate(1,'Assessment start does not infer employment role or seniority from difficulty',()=>{
 assert(!start.includes("roleForDomain"),'roleForDomain inference remains');
 assert(!start.includes("seniorityForLevel"),'seniorityForLevel inference remains');
 assert(start.includes("body.targetRole"),'optional targetRole input is not supported');
 assert(start.includes("body.seniority"),'optional seniority input is not supported');
 assert(start.includes("'SYSTEM_INFERRED'"),'assessment context source is not tracked');
});

gate(2,'Results display assessment level and only explicit role context',()=>{
 assert(results.includes('domain_title'),'results do not use the server-derived assessment display title');
 assert(results.includes('Level:'),'results do not display the evaluated level');
 assert(results.includes("x.target_role?"),'results still require inferred target role');
 assert(results.includes("x.seniority?"),'results still require inferred seniority');
});

gate(3,'Beginner tracks use foundational titles rather than specializations',()=>{
 assert(catalog.includes("'SQL Foundations'"),'SQL beginner display title missing');
 assert(catalog.includes("'Python Foundations'"),'Python beginner display title missing');
 assert(catalog.includes("'Java Foundations'"),'Java beginner display title missing');
});

gate(4,'Analytical dossier hides system-inferred role and seniority',()=>{
 assert(dossier.includes("targetRole:sess.target_role_source==='USER_PROVIDED'?sess.target_role:null"),'dossier still exposes inferred target role');
 assert(dossier.includes("seniority:sess.seniority_source==='USER_PROVIDED'?sess.seniority:null"),'dossier still exposes inferred seniority');
 assert(dossier.includes('getAssessmentDisplayTitle'), 'dossier does not use the level-aware display title');
});

console.log('ALL 4 ASSESSMENT CONTEXT GATES PASSED.');
