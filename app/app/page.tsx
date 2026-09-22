'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {
  Activity,ArrowRight,CheckCircle2,Code2,Flame,GitCommitHorizontal,Mail,
  ShieldCheck,Sparkles,Swords,Trophy,Users
} from 'lucide-react';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';

type Metrics={
  assessmentsCompleted:number;evidenceRecords:number;demonstratedCount:number;developingCount:number;
  reachedOut:number;hackathonsParticipated:number;verifiedRuns:number;contributions:number;evidenceViews:number;
  currentStreak:number;longestStreak:number;activityDays:string[];
};
type Evidence={id:string;capability:string;state:string;verification:string;observedAt:string|null;freshness:string;evidenceCount:number};
type FeedItem={id:string;kind:string;label:string;title:string;body:string;timestamp:string|null;href:string;meta:string;state:string};
type ActiveAssessment={id:string;domain:string;experienceLevel:string;currentStep:number;questionCount:number;expiresAt:string;targetRole:string|null};
type Overview={metrics:Metrics;evidence:Evidence[];feed:FeedItem[];activeAssessment:ActiveAssessment|null};

const zeroMetrics:Metrics={
  assessmentsCompleted:0,evidenceRecords:0,demonstratedCount:0,developingCount:0,
  reachedOut:0,hackathonsParticipated:0,verifiedRuns:0,contributions:0,evidenceViews:0,
  currentStreak:0,longestStreak:0,activityDays:[]
};

const iconFor=(kind:string)=>{
  if(kind==='EVIDENCE')return ShieldCheck;
  if(kind==='ASSESSMENT')return CheckCircle2;
  if(kind==='HACKATHON')return Swords;
  return Activity;
};

const formatFeedDate=(value:string|null)=>{
  if(!value)return 'Recently';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Recently';
  return date.toLocaleDateString(undefined,{month:'short',day:'numeric'});
};

const formatCapability=(value:string)=>{
  if(value==='sql-window-functions')return 'SQL Foundations';
  return value.replace(/[-_]+/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
};

export default function Dashboard(){
  const[overview,setOverview]=useState<Overview>({metrics:zeroMetrics,evidence:[],feed:[],activeAssessment:null});
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const res=await fetch('/api/candidate/overview',{cache:'no-store'});
        if(!res.ok)return;
        const data=await res.json();
        if(alive)setOverview({
          metrics:{...zeroMetrics,...(data?.metrics||{})},
          evidence:Array.isArray(data?.evidence)?data.evidence:[],
          feed:Array.isArray(data?.feed)?data.feed:[],
          activeAssessment:data?.activeAssessment||null
        });
      }finally{
        if(alive)setLoading(false);
      }
    })();
    return()=>{alive=false};
  },[]);

  const activitySet=useMemo(()=>new Set(overview.metrics.activityDays||[]),[overview.metrics.activityDays]);
  const activityDots=useMemo(()=>{
    const pad=(n:number)=>String(n).padStart(2,'0');
    const localKey=(d:Date)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const days=[];const today=new Date();
    for(let i=13;i>=0;i--){
      const d=new Date(today);d.setHours(12,0,0,0);d.setDate(today.getDate()-i);
      days.push(localKey(d));
    }
    return days;
  },[]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">PATIMA FEED</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">Welcome back.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Your technical progress, verified work and the things worth seeing next — in one quiet workspace.
          </p>
        </div>
        <Link href="/app/assessments" className="btn-primary">
          Start an assessment <ArrowRight className="h-4 w-4"/>
        </Link>
      </div>

      {overview.activeAssessment&&(
        <section className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Resume where you left off</p>
              <h2 className="mt-2 text-base font-semibold text-slate-100">{formatCapability(overview.activeAssessment.domain)}</h2>
              <p className="mt-1 text-xs text-slate-500">
                Question {overview.activeAssessment.currentStep} of {overview.activeAssessment.questionCount} · {overview.activeAssessment.experienceLevel.toLowerCase()}
              </p>
            </div>
            <Link href={'/app/assessments/workspace?session='+encodeURIComponent(overview.activeAssessment.id)} className="btn-primary">
              Resume <ArrowRight className="h-3.5 w-3.5"/>
            </Link>
          </div>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-5">
          <section className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">For you</h2>
              <p className="mt-1 text-xs text-slate-600">A quiet stream of things that happened in PATIMA.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Recent</span>
          </section>

          {loading?(
            <div className="panel p-8 text-center"><p className="text-sm text-slate-400">Loading your feed…</p></div>
          ):overview.feed.length===0?(
            <div className="panel border-dashed p-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02]">
                <Sparkles className="h-5 w-5 text-slate-400"/>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-200">Your feed starts with your work.</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">
                Complete an assessment or join a PATIMA arena and your verified activity will appear here.
              </p>
              <Link href="/app/assessments" className="btn-primary mt-5 inline-flex">Explore assessments</Link>
            </div>
          ):(
            overview.feed.map((item)=>(
              <article key={item.id} className="panel overflow-hidden p-5 transition duration-200 hover:border-white/15">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02]">
                    {(() => {const Icon=iconFor(item.kind);return <Icon className="h-4 w-4 text-slate-300"/>;})()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <span>{item.label}</span><span>·</span><span>{formatFeedDate(item.timestamp)}</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-slate-100">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.body}</p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
                      <span className="text-[11px] text-slate-600">{item.meta}</span>
                      <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200">
                        Open <ArrowRight className="h-3.5 w-3.5"/>
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">CAPABILITY SNAPSHOT</p>
                <h2 className="mt-2 text-sm font-semibold text-slate-200">What your evidence currently says</h2>
              </div>
              <Link href="/app/evidence" className="btn-ghost">View evidence <ArrowRight className="h-3.5 w-3.5"/></Link>
            </div>
            {overview.evidence.length===0?(
              <p className="mt-5 text-xs text-slate-500">No capability evidence has been recorded yet.</p>
            ):(
              <div className="mt-4 divide-y divide-white/5">
                {overview.evidence.slice(0,5).map((item)=>(
                  <Link key={item.id} href="/app/evidence" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{item.capability}</p>
                      <p className="mt-1 text-[11px] text-slate-600">{item.verification}{item.observedAt?' · observed '+item.observedAt:''}</p>
                    </div>
                    <StatusPill value={item.state}/>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <div><p className="eyebrow">YOUR RHYTHM</p><h2 className="mt-1 text-sm font-semibold text-slate-200">Practice streak</h2></div>
              <Flame className="h-4 w-4 text-emerald-300"/>
            </div>
            <div className="mt-5 grid grid-cols-2 divide-x divide-white/5 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">Current</p><p className="mt-1 text-2xl font-semibold text-slate-100">{loading?'—':overview.metrics.currentStreak}d</p></div>
              <div className="p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">Longest</p><p className="mt-1 text-2xl font-semibold text-slate-100">{loading?'—':overview.metrics.longestStreak}d</p></div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-600"><span>Last 14 days</span><span>Technical activity</span></div>
              <div className="mt-3 grid gap-1.5" style={{gridTemplateColumns:'repeat(14,minmax(0,1fr))'}}>
                {activityDots.map((day)=><span key={day} title={day} className={'h-2.5 rounded-sm border '+(activitySet.has(day)?'border-emerald-400/50 bg-emerald-400/55':'border-white/5 bg-white/[0.025]')}/>)}
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between"><p className="eyebrow">SIGNALS</p><Activity className="h-4 w-4 text-slate-500"/></div>
            <div className="mt-4 divide-y divide-white/5">
              <Signal icon={Mail} label="Employer reach-outs" value={overview.metrics.reachedOut}/>
              <Signal icon={Trophy} label="Hackathons joined" value={overview.metrics.hackathonsParticipated}/>
              <Signal icon={Code2} label="Verified runs" value={overview.metrics.verifiedRuns}/>
              <Signal icon={GitCommitHorizontal} label="Contributions" value={overview.metrics.contributions}/>
              <Signal icon={Users} label="Evidence views" value={overview.metrics.evidenceViews}/>
            </div>
          </section>

          <section className="panel p-5">
            <p className="eyebrow">CAPABILITY</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric label="Completed" value={overview.metrics.assessmentsCompleted}/>
              <Metric label="Evidence" value={overview.metrics.evidenceRecords}/>
              <Metric label="Demonstrated" value={overview.metrics.demonstratedCount}/>
              <Metric label="Developing" value={overview.metrics.developingCount}/>
            </div>
            <Link href="/app/profile" className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-slate-400 hover:text-slate-200">
              <span>View profile</span><ArrowRight className="h-3.5 w-3.5"/>
            </Link>
          </section>

          <Link href="/app/hackathons" className="panel group block p-5 transition hover:border-white/15">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Swords className="h-4 w-4 text-slate-400"/>Find your next arena</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Practice against a real PATIMA challenge, with verified execution behind the result.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs text-emerald-300 group-hover:text-emerald-200">Explore arenas <ArrowRight className="h-3.5 w-3.5"/></span>
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}

function Signal({icon:Icon,label,value}:{icon:typeof Mail;label:string;value:number}){
  return <div className="flex items-center justify-between gap-3 py-3"><span className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><Icon className="h-3.5 w-3.5 shrink-0 text-slate-400"/><span className="truncate">{label}</span></span><span className="font-mono text-sm font-semibold text-slate-200">{value}</span></div>;
}

function Metric({label,value}:{label:string;value:number}){
  return <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 text-lg font-semibold text-slate-200">{value}</p></div>;
}
