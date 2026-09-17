import {NextResponse} from 'next/server';
import {getAssessment,AssessmentProbe} from '@/lib/assessment-catalog';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

type Answer={probe:number;answer:string};

type ProbeEvaluation={
 probe:number;
 passed:boolean;
 covered:number;
 criteria:number;
 reasons:string[];
};

const normalize=(value:string)=>value.toLowerCase().replace(/\s+/g,' ').trim();
const matches=(text:string,pattern:string)=>{
 try{return new RegExp(pattern,'i').test(text);}catch{return normalize(text).includes(normalize(pattern));}
};

function evaluateProbe(probe:AssessmentProbe,answer:string):ProbeEvaluation{
 const text=normalize(answer);
 const reasons:string[]=[];
 if(text.length<80)reasons.push('Response is too brief to establish technical reasoning.');
 const covered=probe.verification.filter(group=>group.some(pattern=>matches(text,pattern))).length;
 const criteria=probe.verification.length;
 const requiredCoverage=Math.ceil(criteria*0.8);
 const passed=text.length>=80&&covered>=requiredCoverage;
 if(covered<requiredCoverage)reasons.push(`Covered ${covered}/${criteria} required reasoning dimensions.`);
 return {probe:probe.number,passed,covered,criteria,reasons};
}

export function verifyAssessment(definition:{probes:AssessmentProbe[]},answers:Answer[]){
 const evaluations=definition.probes.map(probe=>evaluateProbe(probe,answers.find(a=>a.probe===probe.number)?.answer||''));
 const passed=evaluations.filter(e=>e.passed).length;
 const normalized=answers.map(a=>normalize(a.answer)).filter(Boolean);
 const duplicateResponses=new Set(normalized).size<normalized.length;
 let outcome:'DEMONSTRATED'|'PROVISIONAL'|'DEVELOPING'=passed===3&&!duplicateResponses?'DEMONSTRATED':passed>=2?'PROVISIONAL':'DEVELOPING';
 if(duplicateResponses&&outcome==='DEMONSTRATED')outcome='PROVISIONAL';
 return {outcome,passed,evaluations,duplicateResponses};
}
