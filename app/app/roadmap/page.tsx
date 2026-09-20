'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';
import {AppShell} from '@/components/AppShell';

const roadmaps:Record<string,{name:string;steps:string[];next:string}> = {
 'sql-window-functions':{name:'SQL',steps:['SQL basics: SELECT, WHERE, ORDER BY','Tables, keys, joins and relationships','GROUP BY, aggregates and NULL handling','Window functions and practical patterns','Practice with progressively harder queries'],next:'/app/assessments/setup?domain=sql-window-functions'},
 'python-concurrency':{name:'Python',steps:['Python syntax, variables and control flow','Functions, collections and modules','Exceptions, files and testing','Async/await fundamentals','Concurrency and rate-limiting patterns'],next:'/app/assessments/setup?domain=python-concurrency'},
 'java.concurrency_memory':{name:'Java',steps:['Java syntax and object-oriented basics','Collections, exceptions and interfaces','Threads and synchronization basics','Atomicity, visibility and volatile','Concurrency and memory-model patterns'],next:'/app/assessments/setup?domain=java.concurrency_memory'},
 'linux.process_signals':{name:'Linux',steps:['Shell and filesystem basics','Processes, PIDs and parent/child relationships','Files, permissions and descriptors','Signals and graceful shutdown','Process debugging and production diagnostics'],next:'/app/assessments/setup?domain=linux.process_signals'},
 'docker.container_internals':{name:'Docker',steps:['Containers vs processes and images','Dockerfiles and image layers','Volumes, networks and namespaces','Resource limits and cgroups','Production debugging and isolation'],next:'/app/assessments/setup?domain=docker.container_internals'}
};

function RoadmapContent(){
 const params=useSearchParams(),domain=params.get('domain')||'sql-window-functions',r=roadmaps[domain]||roadmaps['sql-window-functions'];
 return <AppShell><div className="mx-auto max-w-4xl">
  <p className="eyebrow">LEARNING ROADMAP</p><h1 className="mt-2 text-3xl font-semibold">{r.name} foundations</h1>
  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">You chose learning before assessment. Build the foundations first, practice each step, then come back when you are ready to measure your current capability.</p>
  <div className="mt-7 space-y-3">{r.steps.map((step,i)=><div key={step} className="panel flex items-start gap-4 p-5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-950/20 text-xs font-semibold text-emerald-300">{i+1}</span><div><h2 className="font-medium">{step}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{i===0?'Start here and make sure you can explain the basic idea before moving on.':i===r.steps.length-1?'Finish with independent practice before taking the assessment.':'Learn the concept, follow a worked example, then solve a small exercise without looking at the answer.'}</p></div></div>)}</div>
  <div className="mt-7 flex flex-wrap gap-3"><Link href="/app/learning" className="btn-ghost">Open learning hub</Link><Link href={r.next} className="btn-primary">I’m ready — take assessment →</Link></div>
 </div></AppShell>
}
export default function RoadmapPage(){return <Suspense fallback={<AppShell><p>Loading roadmap…</p></AppShell>}><RoadmapContent/></Suspense>}
