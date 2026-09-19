'use client';
import {Suspense,useState} from 'react';
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

function Setup(){
 const router=useRouter(),params=useSearchParams();
 const requested=params.get('domain')||'sql-window-functions';
 const domain=technologies.some(x=>x[0]===requested)?requested:'sql-window-functions';
 const tech=technologies.find(x=>x[0]===domain)!;
 const[level,setLevel]=useState('INTERMEDIATE'); const[loading,setLoading]=useState(false); const[error,setError]=useState('');
 const available=true;
 const start=async()=>{
  if(!available)return;
  setLoading(true);setError('');
  try{
   const res=await fetch('/api/assessment/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain,experienceLevel:level})});
   const data=await res.json(); if(!res.ok)throw new Error(data.error||'Unable to start assessment');
   router.push(`/app/assessments/workspace?session=${encodeURIComponent(data.sessionId)}`);
  }catch(e){setError(e instanceof Error?e.message:'Unable to start assessment');setLoading(false)}
 };
 return <AppShell><div className="mx-auto max-w-3xl">
  <p className="eyebrow">ASSESSMENT SETUP</p><h1 className="mt-2 text-3xl font-semibold">{tech[1]} assessment</h1>
  <p className="mt-2 text-sm leading-6 text-slate-500">Select the level that reflects the experience you want this assessment to measure. The adaptive engine will keep every question inside that level.</p>
  <div className="panel mt-6 p-6">
   <div className="grid gap-3 md:grid-cols-3">{levels.map(([id,label,desc])=><button key={id} type="button" onClick={()=>setLevel(id)} className={`rounded-lg border p-4 text-left ${level===id?'border-emerald-500/60 bg-emerald-950/20':'border-white/10 bg-slate-950/40'}`}><span className="block text-sm font-medium">{label}</span><span className="mt-2 block text-xs leading-5 text-slate-500">{desc}</span></button>)}</div>
   <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/40 p-4 text-sm">
    <div className="font-medium text-slate-300">{level==='BEGINNER'?'10 questions · 15 minutes':level==='INTERMEDIATE'?'15 questions · 25 minutes':'20 questions · 40 minutes'}</div>
    <p className="mt-1 text-xs leading-5 text-slate-500">Questions adapt based on your responses and time, while the server enforces the selected level.</p>
   </div>
   <p className="mt-4 text-xs text-slate-500">The assessment inventory is available for all listed technologies and experience levels. The adaptive engine keeps every question inside the selected level.</p>
   {error&&<p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}
   <button onClick={start} disabled={!available||loading} className="btn-primary mt-6 w-full">{loading?'Preparing your assessment…':'Start assessment →'}</button>
  </div>
 </div></AppShell>;
}
export default function AssessmentSetupPage(){return <Suspense fallback={<AppShell><div className="mx-auto max-w-3xl"><p className="eyebrow">ASSESSMENT SETUP</p><h1 className="mt-2 text-3xl font-semibold">Loading…</h1></div></AppShell>}><Setup/></Suspense>}