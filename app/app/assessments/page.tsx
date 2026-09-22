'use client';
import Link from 'next/link';
import {AppShell} from '@/components/AppShell';

const technologies=[
 {slug:'sql-window-functions',name:'SQL',description:'Queries, window functions, analytical SQL, and data reasoning.'},
 {slug:'python-concurrency',name:'Python',description:'Python programming, concurrency, correctness, and practical reasoning.'},
 {slug:'java.concurrency_memory',name:'Java',description:'Java concurrency, memory model, and systems programming.'},
 {slug:'linux.process_signals',name:'Linux',description:'Processes, signals, file descriptors, and operating-system behavior.'},
 {slug:'docker.container_internals',name:'Docker',description:'Containers, isolation, resources, images, and runtime mechanics.'},
];

export default function Assessments(){
 return <AppShell>
  <p className="eyebrow">TECHNICAL ASSESSMENTS</p>
  <h1 className="mt-2 text-3xl font-semibold">Choose a technology</h1>
  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose a technology first. Absolute beginners are routed to a guided roadmap; intermediate and advanced candidates can start the adaptive assessment.</p>
  <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
   {technologies.map(t=><Link href={`/app/assessments/setup?domain=${encodeURIComponent(t.slug)}`} key={t.slug} className="panel block p-5 transition hover:border-white/20">
    <div className="text-xs text-emerald-300">TECHNICAL ASSESSMENT</div>
    <h2 className="mt-3 text-xl font-medium">{t.name}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">{t.description}</p>
    <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Absolute beginner → roadmap</span><span className="text-xs font-medium text-red-600">Choose level →</span></div>
   </Link>)}
  </div>
 </AppShell>;
}