'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell} from '@/components/AppShell';

const roles=['Data Engineer','Backend Engineer','Distributed Systems Engineer','Platform / DevOps Engineer'];
const levels=[['JUNIOR','Junior (0–2 years)','Core syntax, basic partitioning & filtering'],['MID','Mid (3–5 years)','Boundary conditions, temporal gaps, tie-breaking'],['SENIOR','Senior / Staff (5+ years)','Memory, frame behavior, distributed execution']];
const domains=[['sql-window-functions','SQL Window Functions & Event Stream Analytics'],['python-concurrency','Python Concurrency & Rate Limiting'],['java.concurrency_memory','Java Concurrency & Memory Model'],['linux.process_signals','Linux Systems, Signals & Process Trees'],['docker.container_internals','Docker Containers, Namespaces & cgroups']];

export default function AssessmentSetup(){
 const router=useRouter(); const[role,setRole]=useState(roles[0]); const[seniority,setSeniority]=useState('MID'); const[domain,setDomain]=useState(domains[0][0]); const[loading,setLoading]=useState(false); const[error,setError]=useState('');
 const start=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const res=await fetch('/api/assessment/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,seniority,domain})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to start assessment');router.push(`/app/assessments/workspace?session=${encodeURIComponent(data.sessionId)}`)}catch(err){setError(err instanceof Error?err.message:'Unable to start assessment');setLoading(false)}};
 return <AppShell><div className="mx-auto max-w-3xl"><p className="eyebrow">ASSESSMENT CALIBRATION GATEWAY</p><h1 className="mt-2 text-3xl font-semibold">Configure your assessment battery</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">PATIMA uses your target role, seniority, and capability domain to select a three-probe verification battery. The final capability state is derived server-side from the complete battery.</p><form onSubmit={start} className="panel mt-6 space-y-7 p-6">
  <div><label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">1. Target technical role</label><select value={role} onChange={e=>setRole(e.target.value)} className="input mt-3 w-full">{roles.map(x=><option key={x}>{x}</option>)}</select></div>
  <div><label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">2. Seniority & experience horizon</label><div className="mt-3 grid gap-3 md:grid-cols-3">{levels.map(([id,label,desc])=><button key={id} type="button" onClick={()=>setSeniority(id)} className={`rounded-lg border p-4 text-left ${seniority===id?'border-emerald-500/60 bg-emerald-950/20':'border-white/10 bg-slate-950/40'}`}><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{desc}</span></button>)}</div></div>
  <div><label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">3. Capability focus domain</label><select value={domain} onChange={e=>setDomain(e.target.value)} className="input mt-3 w-full">{domains.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-4 text-xs text-slate-500"><div className="font-medium text-slate-300">Calibration preview</div><div className="mt-2 grid gap-1 sm:grid-cols-3"><span>Difficulty: {seniority==='JUNIOR'?'Foundational':seniority==='MID'?'Level 3':'Advanced'}</span><span>Structure: 3 progressive probes</span><span>Evidence: server verified</span></div></div>
  {error&&<p className="text-sm text-rose-300" role="alert">{error}</p>}
  <button disabled={loading} className="btn-primary w-full">{loading?'Generating battery…':'Generate calibrated assessment →'}</button>
 </form></div></AppShell>;
}
