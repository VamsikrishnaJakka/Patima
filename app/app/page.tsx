'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {
  Activity,ArrowRight,CheckCircle2,Code2,Flame,GitCommitHorizontal,Mail,
  Map,MessageCircle,ShieldCheck,Sparkles,Swords,Trophy,Users,BookOpen,FlaskConical
} from 'lucide-react';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';
import {communityThreads} from '@/lib/personal';

type Metrics={assessmentsCompleted:number;evidenceRecords:number;demonstratedCount:number;developingCount:number;reachedOut:number;hackathonsParticipated:number;verifiedRuns:number;contributions:number;evidenceViews:number;currentStreak:number;longestStreak:number;activityDays:string[]};
type Evidence={id:string;capability:string;state:string;verification:string;observedAt:string|null;freshness:string;evidenceCount:number};
type FeedItem={id:string;kind:string;label:string;title:string;body:string;timestamp:string|null;href:string;meta:string;state:string};
type ActiveAssessment={id:string;domain:string;experienceLevel:string;currentStep:number;questionCount:number;expiresAt:string;targetRole:string|null};
type Overview={metrics:Metrics;evidence:Evidence[];feed:FeedItem[];activeAssessment:ActiveAssessment|null};

const zeroMetrics:Metrics={assessmentsCompleted:0,evidenceRecords:0,demonstratedCount:0,developingCount:0,reachedOut:0,hackathonsParticipated:0,verifiedRuns:0,contributions:0,evidenceViews:0,currentStreak:0,longestStreak:0,activityDays:[]};
const iconFor=(kind:string)=>kind==='EVIDENCE'?ShieldCheck:kind==='ASSESSMENT'?CheckCircle2:kind==='HACKATHON'?Swords:Activity;
const formatFeedDate=(value:string|null)=>{if(!value)return'Recently';const d=new Date(value);return Number.isNaN(d.getTime())?'Recently':d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const formatCapability=(value:string)=>value==='sql-window-functions'?'SQL Foundations':value.replace(/[-_]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());

const roadmapCards=[
 {title:'SQL → Data Engineering',tag:'SQL',steps:'5 steps',body:'SQL foundations, joins, windows, performance and production patterns.',href:'/app/roadmap?domain=sql-window-functions'},
 {title:'Python → Concurrency',tag:'Python',steps:'5 steps',body:'From Python fundamentals to async coordination and rate limiting.',href:'/app/roadmap?domain=python-concurrency'},
 {title:'Linux → Systems',tag:'Linux',steps:'5 steps',body:'Processes, signals, file descriptors and production diagnostics.',href:'/app/roadmap?domain=linux.process_signals'},
 {title:'Docker → Containers',tag:'Docker',steps:'5 steps',body:'Images, layers, namespaces, cgroups and container debugging.',href:'/app/roadmap?domain=docker.container_internals'}
];

export default function Dashboard(){
 const[overview,setOverview]=useState<Overview>({metrics:zeroMetrics,evidence:[],feed:[],activeAssessment:null});
 const[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;(async()=>{try{const res=await fetch('/api/candidate/overview',{cache:'no-store'});if(!res.ok)return;const d=await res.json();if(alive)setOverview({metrics:{...zeroMetrics,...(d?.metrics||{})},evidence:Array.isArray(d?.evidence)?d.evidence:[],feed:Array.isArray(d?.feed)?d.feed:[],activeAssessment:d?.activeAssessment||null});}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[]);
 const activitySet=useMemo(()=>new Set(overview.metrics.activityDays||[]),[overview.metrics.activityDays]);
 const activityDots=useMemo(()=>{const pad=(n:number)=>String(n).padStart(2,'0'),key=(d:Date)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),out:string[]=[];for(let i=13;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);out.push(key(d));}return out},[]);

 return <AppShell>
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
   <div><p className="eyebrow text-red-600">PATIMA</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Welcome back.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Build skills, practice in sandboxes, follow technical work and turn verified activity into evidence.</p></div>
   <Link href="/app/assessments" className="btn-primary">Start an assessment <ArrowRight className="h-4 w-4"/></Link>
  </div>

  {overview.activeAssessment&&<section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-600">Resume assessment</p><h2 className="mt-2 text-base font-semibold text-slate-950">{formatCapability(overview.activeAssessment.domain)}</h2><p className="mt-1 text-xs text-slate-500">Question {overview.activeAssessment.currentStep} of {overview.activeAssessment.questionCount} · {overview.activeAssessment.experienceLevel.toLowerCase()}</p></div><Link href={'/app/assessments/workspace?session='+encodeURIComponent(overview.activeAssessment.id)} className="btn-primary">Resume <ArrowRight className="h-3.5 w-3.5"/></Link></div></section>}

  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
   <main className="min-w-0 space-y-6">
    <section className="flex items-end justify-between border-b border-slate-300 pb-3"><div><h2 className="text-sm font-semibold text-slate-950">For you</h2><p className="mt-1 text-xs text-slate-500">Your activity, plus technical posts and opportunities worth opening.</p></div><span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Live workspace</span></section>

    <section className="panel overflow-hidden border-red-200 bg-red-50 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-600"><Code2 className="h-3.5 w-3.5"/> Featured challenge</div><h2 className="mt-2 text-xl font-semibold text-slate-950">Advanced SQL Query Optimization</h2><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Reduce query cost, diagnose slow plans and practice decisions that matter to data engineers.</p><div className="mt-4 flex flex-wrap gap-2"><span className="pill border-red-200 bg-white text-slate-600">SQL</span><span className="pill border-red-200 bg-white text-slate-600">Intermediate</span><span className="pill border-red-200 bg-white text-slate-600">30 min</span></div></div><Link href="/app/assessments" className="btn-primary">Try challenge <ArrowRight className="h-4 w-4"/></Link></div></section>

    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow text-red-600">COMMUNITY</p><h2 className="mt-1 text-base font-semibold text-slate-950">What people are discussing</h2></div><Link href="/app/communities" className="text-xs font-semibold text-red-600 hover:text-red-700">View all →</Link></div>
      <div className="space-y-3">
       {communityThreads.slice(0,3).map((t)=>(
        <article key={t.title} className="panel p-5 transition hover:border-red-200 hover:shadow-md">
          <div className="flex gap-4">
           <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50"><MessageCircle className="h-4 w-4 text-red-600"/></div>
           <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-x-2 text-[10px] font-medium uppercase tracking-[0.13em] text-slate-400"><span>Community post</span><span>·</span><span>{t.domain}</span></div><h3 className="mt-2 text-base font-semibold text-slate-950">{t.title}</h3><p className="mt-1 text-sm text-slate-600">Compare approaches, explain trade-offs and add a solution that others can inspect.</p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">{t.replies} replies · {t.verified} verified solutions</span><Link href="/app/communities" className="text-xs font-semibold text-red-600">Join discussion <ArrowRight className="inline h-3.5 w-3.5"/></Link></div></div>
          </div>
        </article>
       ))}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow text-red-600">ROADMAPS</p><h2 className="mt-1 text-base font-semibold text-slate-950">Choose what to build next</h2></div><Link href="/app/roadmap" className="text-xs font-semibold text-red-600 hover:text-red-700">Open roadmap hub →</Link></div>
      <div className="grid gap-3 md:grid-cols-2">
       {roadmapCards.map(r=><Link key={r.title} href={r.href} className="panel group p-5 transition hover:border-red-200 hover:shadow-md"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-red-600"><Map className="h-3.5 w-3.5"/>{r.tag}</span><span className="text-[10px] text-slate-400">{r.steps}</span></div><h3 className="mt-3 text-sm font-semibold text-slate-950">{r.title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-500">{r.body}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-red-600">Continue <ArrowRight className="h-3.5 w-3.5"/></span></Link>)}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow text-red-600">SANDBOX LABS</p><h2 className="mt-1 text-base font-semibold text-slate-950">Real tools. Coming soon.</h2></div><Link href="/app/sandboxes" className="text-xs font-semibold text-red-600 hover:text-red-700">View all labs →</Link></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
       {[
        ['Apache Spark / PySpark','Data Engineering','Distributed processing'],
        ['Kubernetes','DevOps','Pods, services, scaling'],
        ['Linux','Systems','Processes, signals, shell'],
        ['API Testing','Testing','Requests, assertions, contracts']
       ].map(([name,category,desc])=><Link key={name} href="/app/sandboxes" className="panel p-4 transition hover:border-red-200 hover:shadow-md"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{name}</span><span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-red-600">Soon</span></div><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{category}</p><p className="mt-1.5 text-xs text-slate-500">{desc}</p></Link>)}
      </div>
    </section>

    <section className="panel p-5"><div className="flex items-center justify-between"><div><p className="eyebrow text-red-600">YOUR LATEST</p><h2 className="mt-1 text-sm font-semibold text-slate-950">Recent verified activity</h2></div><Link href="/app/evidence" className="btn-ghost">View evidence <ArrowRight className="h-3.5 w-3.5"/></Link></div>{loading?<p className="mt-5 text-sm text-slate-500">Loading…</p>:overview.feed.length===0?<p className="mt-5 text-xs text-slate-500">Complete an assessment to create your first activity item.</p>:<div className="mt-4 space-y-2">{overview.feed.slice(0,4).map(item=>{const Icon=iconFor(item.kind);return <Link key={item.id} href={item.href} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-red-200 hover:bg-red-50"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50"><Icon className="h-3.5 w-3.5 text-red-600"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{item.title}</span><span className="block mt-1 truncate text-[11px] text-slate-500">{item.label} · {item.meta}</span></span><span className="text-[10px] text-slate-400">{formatFeedDate(item.timestamp)}</span></Link>})}</div>}</section>
   </main>

   <aside className="space-y-4 xl:sticky xl:top-24">
    <section className="panel p-5"><div className="flex items-center justify-between"><div><p className="eyebrow text-red-600">YOUR RHYTHM</p><h2 className="mt-1 text-sm font-semibold text-slate-950">Practice streak</h2></div><Flame className="h-4 w-4 text-red-600"/></div><div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50"><div className="p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Current</p><p className="mt-1 text-2xl font-semibold text-slate-950">{loading?'—':overview.metrics.currentStreak}d</p></div><div className="p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Longest</p><p className="mt-1 text-2xl font-semibold text-slate-950">{loading?'—':overview.metrics.longestStreak}d</p></div></div><div className="mt-4"><div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400"><span>Last 14 days</span><span>Technical activity</span></div><div className="mt-3 grid gap-1.5" style={{gridTemplateColumns:'repeat(14,minmax(0,1fr))'}}>{activityDots.map(day=><span key={day} title={day} className={'h-2.5 rounded-sm border '+(activitySet.has(day)?'border-red-400 bg-red-500':'border-slate-300 bg-slate-100')}/>)}</div></div></section>

    <section className="panel p-5"><div className="flex items-center justify-between"><p className="eyebrow text-red-600">YOUR ACTIVITY</p><Activity className="h-4 w-4 text-slate-400"/></div><p className="mt-1 text-xs text-slate-500">Real work. Real progress.</p><div className="mt-3 divide-y divide-slate-100"><Signal icon={Mail} label="Employer reach-outs" value={overview.metrics.reachedOut}/><Signal icon={Trophy} label="Hackathons joined" value={overview.metrics.hackathonsParticipated}/><Signal icon={Code2} label="Verified runs" value={overview.metrics.verifiedRuns}/><Signal icon={GitCommitHorizontal} label="Contributions" value={overview.metrics.contributions}/><Signal icon={Users} label="Evidence views" value={overview.metrics.evidenceViews}/></div></section>

    <section className="panel p-5"><div className="flex items-center justify-between"><p className="eyebrow text-red-600">YOUR PROGRESS</p><ArrowRight className="h-4 w-4 text-red-600"/></div><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="Assessments" value={overview.metrics.assessmentsCompleted}/><Metric label="Evidence" value={overview.metrics.evidenceRecords}/><Metric label="Demonstrated" value={overview.metrics.demonstratedCount}/><Metric label="Developing" value={overview.metrics.developingCount}/></div><Link href="/app/profile" className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-500 hover:text-red-700"><span>View profile</span><ArrowRight className="h-3.5 w-3.5"/></Link></section>

    <Link href="/app/hackathons" className="panel group block overflow-hidden p-5 transition hover:border-red-200 hover:shadow-md"><div className="flex items-center gap-2 text-xs font-semibold text-slate-900"><Swords className="h-4 w-4 text-red-600"/>Find your next arena</div><p className="mt-2 text-xs leading-5 text-slate-500">Practice against a PATIMA challenge, with verified execution behind the result.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-red-600 group-hover:text-red-700">Explore arenas <ArrowRight className="h-3.5 w-3.5"/></span></Link>
   </aside>
  </div>
 </AppShell>
}

function Signal({icon:Icon,label,value}:{icon:typeof Mail;label:string;value:number}){return <div className="flex items-center justify-between gap-3 py-3"><span className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><Icon className="h-3.5 w-3.5 shrink-0 text-red-500"/><span className="truncate">{label}</span></span><span className="font-mono text-sm font-semibold text-slate-900">{value}</span></div>}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold text-slate-900">{value}</p></div>}
