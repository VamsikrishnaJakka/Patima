'use client';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';

type QuestionReport={stepIndex:number;question:string;questionType:string;responseMode:string;expectedTimeComplexity?:string|null;expectedSpaceComplexity?:string|null;candidateResponse?:string|null;isCorrect?:boolean|null;timeTakenSeconds?:number|null;verificationStatus?:string|null;publicTestsPassed?:number;publicTestsTotal?:number;hiddenTestsPassed?:number;hiddenTestsTotal?:number;executionTimeMs?:number|null;verificationOutput?:any};
type Result={session_id:string;capability:string;target_role:string;seniority:string;outcome?:string|null;submitted_at:string;verification_tier?:string|null;summary?:string|null;context?:string|null;question_report?:QuestionReport[]};

export default function Results(){
 const params=useSearchParams();
 const sessionId=params.get('sessionId');
 const[r,setR]=useState<Result[]>([]);
 const[error,setError]=useState('');
 useEffect(()=>{
  const url=sessionId?'/api/assessment/results?sessionId='+encodeURIComponent(sessionId):'/api/assessment/results';
  fetch(url,{cache:'no-store'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load results');setR(data.results||[])}).catch(e=>setError(e instanceof Error?e.message:'Unable to load results'));
 },[sessionId]);
 return <AppShell>
  <p className="eyebrow">YOUR RESULTS</p>
  <h1 className="mt-2 text-3xl font-semibold">Assessment report</h1>
  <p className="mt-2 text-sm text-slate-500">Server-generated report from your submitted assessment responses. Each question shows its response, correctness state, time, and authored complexity guidance.</p>
  {error&&<div className="mt-6 panel p-5 text-sm text-rose-300" role="alert">{error}</div>}
  <div className="mt-6 space-y-6">
   {!error&&r.length===0?<div className="panel p-8 text-center text-sm text-slate-600">No completed assessments yet.</div>:r.map(x=>{
    const report=x.question_report||[];
    const scored=report.filter(q=>q.isCorrect!==null&&q.isCorrect!==undefined);
    const correct=scored.filter(q=>q.isCorrect===true).length;
    const skipped=report.filter(q=>q.candidateResponse==='[SKIPPED]').length;
    const totalTime=report.reduce((n,q)=>n+Number(q.timeTakenSeconds||0),0);
    return <article key={x.session_id} className="panel p-5">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-medium">{x.capability}</h2><div className="mt-1 text-xs text-slate-600">{x.target_role} · {x.seniority} · {new Date(x.submitted_at).toLocaleString()}</div></div>
      <StatusPill value={x.outcome||'PROVISIONAL'}/>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Questions</div><div className="mt-1 text-lg text-slate-200">{report.length}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Scored correct</div><div className="mt-1 text-lg text-emerald-300">{correct}/{scored.length}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Skipped</div><div className="mt-1 text-lg text-slate-200">{skipped}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><div className="text-[11px] text-slate-500">Response time</div><div className="mt-1 text-lg text-slate-200">{totalTime}s</div></div>
     </div>
     <div className="mt-6 space-y-3">{report.map(q=><section key={q.stepIndex} className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Question {q.stepIndex} · {q.responseMode==='MCQ'?'MCQ':q.questionType==='CODING'?'Coding':'Theory'}</div><div className={q.candidateResponse==='[SKIPPED]'?'text-slate-500':q.isCorrect===true?'text-emerald-300':q.isCorrect===false?'text-rose-300':'text-amber-300'}>{q.candidateResponse==='[SKIPPED]'?'SKIPPED':q.isCorrect===true?'CORRECT':q.isCorrect===false?'INCORRECT':'RECORDED'}</div></div>
      <div className="mt-3 text-sm leading-6 text-slate-200">{q.question}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
       <div className="text-slate-500">Time: <span className="text-slate-300">{q.timeTakenSeconds??0}s</span></div>
       <div className="text-slate-500">Expected time: <span className="text-slate-300">{q.expectedTimeComplexity||'Not specified'}</span></div>
       <div className="text-slate-500">Expected space: <span className="text-slate-300">{q.expectedSpaceComplexity||'Not specified'}</span></div>
      </div>
      <div className="mt-3 rounded-lg border border-white/5 bg-slate-950/50 p-3"><div className="text-[11px] uppercase tracking-wider text-slate-600">Your response</div><pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-slate-400">{q.candidateResponse||'No response recorded.'}</pre></div>
      {q.questionType==='CODING'&&<div className="mt-3 text-xs text-slate-500">Tests: {q.publicTestsPassed??0}/{q.publicTestsTotal??0} public · {q.hiddenTestsPassed??0}/{q.hiddenTestsTotal??0} hidden · execution {q.executionTimeMs??0}ms</div>}
     </section>)}</div>
     {x.summary&&<p className="mt-5 text-sm leading-7 text-slate-400">{x.summary}</p>}
     {x.context&&<div className="mt-4 rounded border border-white/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-500">{x.context}</div>}
    </article>;
   })}
  </div>
 </AppShell>;
}