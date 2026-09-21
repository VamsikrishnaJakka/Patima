'use client';

import {useEffect,useState,Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';
import {PrintDossier} from './print-dossier';
import type {AssessmentDossierResponse} from '@/app/api/assessment/results/dossier/route';

type QuestionReport={stepIndex:number;question:string;questionType:string;responseMode:string;candidateResponse?:string|null;isCorrect?:boolean|null;timeTakenSeconds?:number|null;verificationStatus?:string|null;publicTestsPassed?:number;publicTestsTotal?:number;hiddenTestsPassed?:number;hiddenTestsTotal?:number;executionTimeMs?:number|null};
type Result={session_id:string;capability:string;target_role:string;seniority:string;outcome?:string|null;submitted_at:string;verification_tier?:string|null;summary?:string|null;context?:string|null;question_report?:QuestionReport[]};

function ResultsContent(){
 const params=useSearchParams(),sessionId=params.get('sessionId');
 const[r,setR]=useState<Result[]>([]),[error,setError]=useState(''),[dossier,setDossier]=useState<AssessmentDossierResponse|null>(null),[exporting,setExporting]=useState(false);
 useEffect(()=>{
  const url=sessionId?'/api/assessment/results?sessionId='+encodeURIComponent(sessionId):'/api/assessment/results';
  fetch(url,{cache:'no-store'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load results');setR(data.results||[])}).catch(e=>setError(e instanceof Error?e.message:'Unable to load results'));
 },[sessionId]);

 async function openDossier(id:string){
  setExporting(true);setError('');
  try{
   const res=await fetch('/api/assessment/results/dossier?sessionId='+encodeURIComponent(id),{cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Unable to prepare assessment dossier');
   setDossier(data);
  }catch(e){setError(e instanceof Error?e.message:'Unable to prepare assessment dossier')}finally{setExporting(false)}
 }

 if(dossier)return <PrintDossier data={dossier} onClose={()=>setDossier(null)}/>;

 return <AppShell>
  <p className="eyebrow">YOUR RESULTS</p>
  <h1 className="mt-2 text-3xl font-semibold">Assessment results</h1>
  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Your assessment evidence is stored server-side. Open the analytical dossier for the question-by-question diagnosis, preparation topics, reference answers, complexity observations, and optimization notes.</p>
  {error&&<div className="mt-6 panel p-5 text-sm text-rose-300" role="alert">{error}</div>}
  <div className="mt-6 space-y-5">
   {!error&&r.length===0?<div className="panel p-8 text-center text-sm text-slate-600">No completed assessments yet.</div>:r.map(x=>{
    const report=x.question_report||[],scored=report.filter(q=>q.isCorrect!==null&&q.isCorrect!==undefined),correct=scored.filter(q=>q.isCorrect===true).length;
    const skipped=report.filter(q=>q.candidateResponse==='[SKIPPED]').length,totalTime=report.reduce((n,q)=>n+Number(q.timeTakenSeconds||0),0);
    return <article key={x.session_id} className="panel p-5">
     <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-medium">{x.capability}</h2><div className="mt-1 text-xs text-slate-600">{x.target_role} · {x.seniority} · {new Date(x.submitted_at).toLocaleString()}</div></div>
      <div className="flex items-center gap-3"><StatusPill value={x.outcome||'PROVISIONAL'}/><button type="button" onClick={()=>void openDossier(x.session_id)} disabled={exporting} className="btn-primary text-xs disabled:opacity-50">{exporting?'Preparing…':'Export analytical PDF'}</button></div>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Questions</div><div className="mt-1 text-lg text-slate-200">{report.length}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Scored correct</div><div className="mt-1 text-lg text-emerald-300">{correct}/{scored.length}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Skipped</div><div className="mt-1 text-lg text-slate-200">{skipped}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Response time</div><div className="mt-1 text-lg text-slate-200">{totalTime}s</div></div>
     </div>
     <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs leading-5 text-slate-400">
      <span className="font-semibold text-emerald-300">Analytical dossier:</span> includes the exact question, candidate response, authored answer/reference solution, verification evidence, missed-topic diagnosis, preparation guidance, and optimization/performance observations.
     </div>
    </article>;
   })}
  </div>
 </AppShell>;
}

export default function Results(){
 return <Suspense fallback={<AppShell><div className="panel p-8 text-center text-sm text-slate-500">Loading assessment results…</div></AppShell>}><ResultsContent/></Suspense>;
}
