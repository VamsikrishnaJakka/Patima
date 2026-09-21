'use client';

import {Suspense,useMemo,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {AppShell} from '@/components/AppShell';

const technologies=[
 ['sql-window-functions','SQL','Adaptive SQL assessment'],
 ['python-concurrency','Python','Adaptive Python assessment'],
 ['java.concurrency_memory','Java','Adaptive Java assessment'],
 ['linux.process_signals','Linux','Adaptive Linux assessment'],
 ['docker.container_internals','Docker','Adaptive Docker assessment'],
] as const;

const levels=[
 ['BEGINNER','Beginner','Foundational concepts and straightforward problem solving'],
 ['INTERMEDIATE','Intermediate','Multi-step reasoning, edge cases, and practical implementation'],
 ['ADVANCED','Advanced','Complex reasoning, boundaries, and deeper technical behavior'],
] as const;

const counts=[5,10,15,20];

function duration(level:string,count:number){
 const seconds=count*(level==='BEGINNER'?90:level==='INTERMEDIATE'?100:120);
 return Math.ceil(seconds/60);
}

function Setup(){
 const router=useRouter();
 const params=useSearchParams();
 const requested=params.get('domain')||'sql-window-functions';
 const domain=technologies.some(x=>x[0]===requested)?requested:'sql-window-functions';
 const tech=technologies.find(x=>x[0]===domain)!;
 const[level,setLevel]=useState('INTERMEDIATE');
 const[count,setCount]=useState(15);
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState('');
 const[active,setActive]=useState<{sessionId:string;experienceLevel:string;currentStep:number;questionCount:number}|null>(null);
 const minutes=useMemo(()=>duration(level,count),[level,count]);

 const start=async()=>{
  setLoading(true);
  setError('');
  setActive(null);
  try{
   const res=await fetch('/api/assessment/start',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({domain,experienceLevel:level,questionCount:count})
   });
   const data=await res.json();
   if(!res.ok){
    if(data.error==='SESSION_ALREADY_ACTIVE'&&data.sessionId){
     setActive({
      sessionId:data.sessionId,
      experienceLevel:data.experienceLevel||'UNKNOWN',
      currentStep:Number(data.currentStep||1),
      questionCount:Number(data.questionCount||0)
     });
     throw new Error(data.message||'An active assessment already exists.');
    }
    throw new Error(data.message||data.error||'Unable to start assessment');
   }
   router.push('/app/assessments/workspace?session='+encodeURIComponent(data.sessionId));
  }catch(e){
   setError(e instanceof Error?e.message:'Unable to start assessment');
   setLoading(false);
  }
 };

 const resumeActive=()=>{
  if(!active)return;
  router.push('/app/assessments/workspace?session='+encodeURIComponent(active.sessionId));
 };

 const exitActive=async()=>{
  if(!active)return;
  setLoading(true);
  try{
   const res=await fetch('/api/assessment/abandon',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sessionId:active.sessionId})
   });
   if(!res.ok)throw new Error('Unable to exit the previous assessment');
   setActive(null);
   setError('The previous active assessment was exited. You can start this assessment now.');
  }catch(e){
   setError(e instanceof Error?e.message:'Unable to exit the previous assessment');
  }finally{
   setLoading(false);
  }
 };

 return (
  <AppShell>
   <div className="mx-auto max-w-3xl">
    <p className="eyebrow">ASSESSMENT SETUP</p>
    <h1 className="mt-2 text-3xl font-semibold">{tech[1]} assessment</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">
     Choose your starting point. If you are completely new to this technology, do not take an assessment yet — go directly to a guided roadmap.
    </p>

    <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
     <p className="text-sm font-semibold text-emerald-200">I’m a complete beginner</p>
     <p className="mt-2 text-sm leading-6 text-slate-400">
      I don’t know this technology yet. Take me to the learning roadmap instead of testing me.
     </p>
     <button type="button" onClick={()=>router.push('/app/roadmap?domain='+encodeURIComponent(domain))} className="mt-3 text-xs font-medium text-emerald-300">
      Start learning →
     </button>
    </div>

    <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-5">
     <p className="text-sm font-semibold text-amber-200">Important: this assessment is forward-only</p>
     <p className="mt-2 text-sm leading-6 text-amber-100/70">Once you submit or skip a question, it is committed and you cannot return to that question. Use <b>Run</b> and <b>Run Tests</b> to check coding answers before moving forward. Review each question, constraint, and visible test case carefully before submitting.</p>
    </div>

    <div className="panel mt-6 p-6">
     <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">1. Experience level</p>
     <div className="mt-3 grid gap-3 md:grid-cols-3">
      {levels.map(([id,label,desc])=>(
       <button key={id} type="button" onClick={()=>setLevel(id)} className={'rounded-lg border p-4 text-left '+(level===id?'border-emerald-500/60 bg-emerald-950/20':'border-white/10 bg-slate-950/40')}>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{desc}</span>
       </button>
      ))}
     </div>

     <p className="mt-7 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">2. Number of questions</p>
     <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {counts.map(n=>(
       <button key={n} type="button" onClick={()=>setCount(n)} className={'rounded-lg border p-4 text-center '+(count===n?'border-emerald-500/60 bg-emerald-950/20':'border-white/10 bg-slate-950/40')}>
        <span className="block text-lg font-semibold">{n}</span>
        <span className="text-xs text-slate-500">questions</span>
       </button>
      ))}
     </div>

     <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between">
       <span className="text-sm font-medium text-slate-300">Assessment duration</span>
       <span className="text-sm font-semibold text-emerald-300">{minutes} minutes</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">The timer changes with both the selected level and question count. The server is authoritative for the final duration.</p>
     </div>

     <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-4 text-xs leading-5 text-slate-500">
      <span className="font-medium text-slate-300">Selected:</span> {level[0]+level.slice(1).toLowerCase()} · {count} questions · {minutes} minutes
     </div>

     {error&&(
      <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/10 p-4" role="alert">
       <p className="text-sm text-amber-200">{error}</p>
       {active&&(
        <div className="mt-3 flex flex-wrap gap-2">
         <button type="button" onClick={resumeActive} className="rounded-md border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">
          Resume active assessment →
         </button>
         <button type="button" onClick={exitActive} disabled={loading} className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400 disabled:opacity-40">
          Exit previous assessment
         </button>
        </div>
       )}
      </div>
     )}

     <button type="button" onClick={start} disabled={loading} className="btn-primary mt-6 w-full">
      {loading?'Preparing your assessment…':'Start assessment →'}
     </button>
    </div>
   </div>
  </AppShell>
 );
}

export default function AssessmentSetupPage(){
 return (
  <Suspense fallback={
   <AppShell>
    <div className="mx-auto max-w-3xl">
     <p className="eyebrow">ASSESSMENT SETUP</p>
     <h1 className="mt-2 text-3xl font-semibold">Loading…</h1>
    </div>
   </AppShell>
  }>
   <Setup/>
  </Suspense>
 );
}
