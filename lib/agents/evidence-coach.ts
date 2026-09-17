import {GoogleGenAI} from '@google/genai';

export type EvidenceCoachStatus='DEMONSTRATED'|'DEVELOPING'|'PROVISIONAL';

export interface EvidenceCoachInput{
 status:EvidenceCoachStatus;
 domain:string;
 astViolations:string[];
 failedAssertions:string[];
 candidateReasoning:string;
 executionDurationMs:number;
}

export interface EvidenceCoachOutput{
 summary:string;
 gapAnalysis:string|null;
 nextMilestone:string;
 proveItChallenge:string|null;
 provider:'gemini'|'fallback';
}

const MODEL=process.env.PATIMA_EVIDENCE_COACH_MODEL?.trim()||'gemini-2.5-flash';
const MAX_REASONING=4000;
const MAX_ITEMS=10;
const CALL_TIMEOUT_MS=1800;
const FALLBACK_NEXT='Review the window-function partitioning, deterministic event ordering, and frame semantics before the next demonstration.';

const trimText=(value:string,max:number)=>value.trim().slice(0,max);
const trimList=(values:string[])=>values.filter((value):value is string=>typeof value==='string').slice(0,MAX_ITEMS).map(value=>trimText(value,500));

function fallback(input:EvidenceCoachInput):EvidenceCoachOutput{
 const failed=trimList(input.failedAssertions);
 const violations=trimList(input.astViolations);
 const gap=[...violations,...failed].join('; ')||null;
 const statusSummary=input.status==='DEMONSTRATED'
  ?'Deterministic verification reproduced the submitted behavior successfully.'
  :input.status==='PROVISIONAL'
   ?'The calibrated probes passed, but deterministic reproduction did not establish full independent verification.'
   :'Deterministic verification did not reproduce the required behavior.';
 return {
  summary:statusSummary,
  gapAnalysis:input.status==='DEMONSTRATED'?null:gap,
  nextMilestone:FALLBACK_NEXT,
  proveItChallenge:input.status==='DEMONSTRATED'?'How would you preserve deterministic ordering and correct window-frame semantics when multiple events share the same timestamp?':null,
  provider:'fallback',
 };
}

function isValidOutput(value:unknown):value is Omit<EvidenceCoachOutput,'provider'>{
 if(!value||typeof value!=='object')return false;
 const candidate=value as Record<string,unknown>;
 return typeof candidate.summary==='string'&&candidate.summary.length<=4000&&
  (candidate.gapAnalysis===null||typeof candidate.gapAnalysis==='string')&&
  (typeof candidate.gapAnalysis!=='string'||candidate.gapAnalysis.length<=4000)&&
  typeof candidate.nextMilestone==='string'&&candidate.nextMilestone.length<=2000&&
  (candidate.proveItChallenge===null||typeof candidate.proveItChallenge==='string')&&
  (typeof candidate.proveItChallenge!=='string'||candidate.proveItChallenge.length<=2000);
}

function jsonFromResponse(text:string):unknown{
 const normalized=text.trim();
 if(!normalized)throw new Error('EMPTY_MODEL_RESPONSE');
 return JSON.parse(normalized);
}

export async function consultEvidenceCoach(input:EvidenceCoachInput):Promise<EvidenceCoachOutput>{
 const bounded:EvidenceCoachInput={
  status:input.status,
  domain:trimText(input.domain,200),
  astViolations:trimList(input.astViolations),
  failedAssertions:trimList(input.failedAssertions),
  candidateReasoning:trimText(input.candidateReasoning,MAX_REASONING),
  executionDurationMs:Number.isFinite(input.executionDurationMs)?Math.max(0,Math.round(input.executionDurationMs)):0,
 };
 const apiKey=process.env.GEMINI_API_KEY?.trim();
 if(!apiKey)return fallback(bounded);

 const prompt=`You are the PATIMA Evidence Coach. You operate strictly downstream of deterministic verification telemetry. You are advisory only: never change the assessment outcome, never invent verification, and never claim that an unverified artifact passed.

Verified telemetry:
- outcome: ${bounded.status}
- domain: ${bounded.domain}
- AST violations: ${JSON.stringify(bounded.astViolations)}
- failed invariant assertions: ${JSON.stringify(bounded.failedAssertions)}
- candidate trade-off defense: ${JSON.stringify(bounded.candidateReasoning)}
- execution duration (ms): ${bounded.executionDurationMs}

Rules:
1. Treat outcome and telemetry as authoritative.
2. For DEMONSTRATED, summarize the verified achievement, generate exactly one concise Prove-It challenge targeting a deeper edge case, and set gapAnalysis to null.
3. For DEVELOPING or PROVISIONAL, identify the concrete gap visible in the telemetry, set proveItChallenge to null, and give one immediate remediation milestone.
4. Do not add claims that are absent from the telemetry.
5. Return JSON only.

Required JSON shape:
{"summary":"string","gapAnalysis":"string or null","nextMilestone":"string","proveItChallenge":"string or null"}`;

 try{
  const ai=new GoogleGenAI({apiKey});
  const response=await Promise.race([
   ai.models.generateContent({
    model:MODEL,
    contents:prompt,
    config:{responseMimeType:'application/json',temperature:0.2},
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('EVIDENCE_COACH_TIMEOUT')),CALL_TIMEOUT_MS)),
  ]);
  const parsed=jsonFromResponse(response.text||'');
  if(!isValidOutput(parsed))throw new Error('INVALID_EVIDENCE_COACH_OUTPUT');
  return {...parsed,provider:'gemini'};
 }catch{
  return fallback(bounded);
 }
}
