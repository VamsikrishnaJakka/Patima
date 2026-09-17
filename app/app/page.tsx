'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Activity,ArrowRight,FileCheck2,ShieldCheck} from 'lucide-react';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';

type Evidence={id:string;capability:string;state:string;verification:string;observedAt:string|null;freshness:string;evidenceCount:number};
type Overview={stats:{demonstrated:number;developing:number;completed:number};evidence:Evidence[]};

export default function Dashboard(){
  const[overview,setOverview]=useState<Overview>({stats:{demonstrated:0,developing:0,completed:0},evidence:[]});
  const[loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;(async()=>{try{const res=await fetch('/api/candidate/overview',{cache:'no-store'});if(!res.ok)return;const data=await res.json();if(alive)setOverview(data);}finally{if(alive)setLoading(false);}})();return()=>{alive=false}},[]);
  const stats=[['Demonstrated',overview.stats.demonstrated],['Developing',overview.stats.developing],['Assessments completed',overview.stats.completed]] as const;
  return <AppShell><div className="mb-8"><p className="eyebrow">YOUR PATIMA WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold">Your capability workspace</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Assessment activity and evidence are scoped to your authenticated PATIMA account.</p></div>
    <div className="grid gap-4 md:grid-cols-3">{stats.map(([label,value])=><div className="panel p-5" key={label}><div className="label">{label}</div><div className="mt-3 text-3xl font-semibold">{loading?'—':value}</div></div>)}</div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]"><section className="panel p-5"><div className="flex items-center justify-between"><div><h2 className="font-medium">Your capability evidence</h2><p className="mt-1 text-xs text-slate-500">State, verification, context and freshness.</p></div><Link href="/app/evidence" className="btn-ghost">View all <ArrowRight className="h-3.5 w-3.5"/></Link></div>
      {loading?<p className="mt-5 text-sm text-slate-500">Loading your evidence…</p>:overview.evidence.length===0?<div className="mt-5 rounded-xl border border-dashed border-slate-800 p-8 text-center"><h3 className="text-sm font-medium text-slate-200">No Evidence Generated Yet</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">Take your first technical assessment to produce inspectable evidence and establish capability state.</p><Link href="/app/assessments" className="btn-primary mt-5 inline-flex">Take first assessment</Link></div>:<div className="mt-5 space-y-2">{overview.evidence.map(x=><div key={x.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium">{x.capability}</div><StatusPill value={x.state}/></div><div className="mt-2 text-xs text-slate-500">{x.verification}{x.observedAt?` · observed ${x.observedAt}`:''} · {x.freshness}</div></div>)}</div>}
    </section><aside className="space-y-4"><div className="panel p-5"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-emerald-300"/>Evidence health</div><p className="mt-2 text-sm leading-6 text-slate-500">Hiring activity does not alter capability state or freshness.</p></div><Link href="/app/assessments" className="panel block p-5"><div className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-emerald-300"/>Take an assessment</div><p className="mt-2 text-sm text-slate-500">Run a technical probe and add evidence.</p></Link><Link href="/app/results" className="panel block p-5"><div className="flex items-center gap-2 text-sm font-medium"><FileCheck2 className="h-4 w-4 text-emerald-300"/>Review results</div><p className="mt-2 text-sm text-slate-500">See the outcome of your completed probes.</p></Link></aside></div></AppShell>;
}
