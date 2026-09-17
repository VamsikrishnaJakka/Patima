"use client";

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell} from '@/components/AppShell';
import {assessments,saveResult} from '@/lib/personal';

type ProbeContent={
  problem:string;
  task:string;
  boundary:string;
};

const probeContent:Record<string,ProbeContent>={
  'sql-window-functions':{
    problem:'You are given an events table with user_id, event_time, and event_type. Events belong to users and are not guaranteed to arrive in chronological order.',
    task:'Describe how you would use SQL window functions to order events per user, compare each event with the previous event, and identify a new session when the gap from the previous event exceeds 30 minutes. Explain which window clauses you need and why.',
    boundary:'What changes in your reasoning when two events have the same timestamp, or when the previous timestamp is NULL? Explain how you would make the result deterministic.',
  },
  'python-concurrency':{
    problem:'You need to implement an asynchronous rate limiter shared by many concurrent tasks. The limiter must prevent more than N requests during a rolling time window while remaining safe under concurrent access.',
    task:'Describe the mechanism you would use to coordinate concurrent tasks, maintain the request window, and prevent races. Explain where locking or another synchronization primitive belongs and why.',
    boundary:'Describe one failure mode involving cancellation, contention, or a burst of concurrent requests, and explain how your design handles it.',
  },
};

export default function Assessment({params}:{params:{slug:string}}){
  const a=assessments.find(x=>x.slug===params.slug)||assessments[0];
  const content=probeContent[a.slug]||probeContent['sql-window-functions'];
  const r=useRouter();
  const[step,setStep]=useState(1);
  const[answer,setAnswer]=useState('');
  const[notes,setNotes]=useState('');
  const[events,setEvents]=useState<string[]>([]);
  const[done,setDone]=useState(false);
  const[state,setState]=useState<'DEMONSTRATED'|'DEVELOPING'>('DEVELOPING');
  const record=(x:string)=>setEvents(v=>[...v,`${Date.now()} ${x}`]);
  const submit=()=>{
    record('SUBMIT');
    const q=answer.toLowerCase();
    const strong=a.slug==='sql-window-functions'
      ?q.includes('lag')&&q.includes('partition by')&&q.includes('order by')
      :q.includes('async')&&q.includes('lock');
    const final=strong&&notes.trim().length>30?'DEMONSTRATED':'DEVELOPING';
    setState(final);
    saveResult({
      sessionId:`${a.slug}-${Date.now()}`,
      capability:a.capability,
      completedAt:new Date().toISOString().slice(0,10),
      state:final,
      summary:final==='DEMONSTRATED'?'Independent workspace response covered the core mechanism and an edge condition.':'Partial understanding observed; a transfer probe is recommended.',
      scorelessOutcome:final==='DEMONSTRATED'?'Core capability observed under this probe.':'Capability is developing under this probe.',
      evidenceId:`assessment-${a.slug}`,
      telemetrySummary:`${events.length+1} workspace events; no global browser/device events.`,
    });
    setDone(true);
  };

  return <AppShell>
    <div className="mx-auto max-w-3xl">
      {done ? <>
        <p className="eyebrow">ASSESSMENT COMPLETE</p>
        <h1 className="mt-2 text-3xl font-semibold">{a.title}</h1>
        <div className="panel mt-5 p-6">
          <div className="flex justify-between">
            <span className="text-sm text-slate-500">Outcome</span>
            <span className={`pill ${state==='DEMONSTRATED'?'pill-good':'pill-warn'}`}>{state}</span>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-400">{state==='DEMONSTRATED'?'This probe produced demonstrated evidence.':'This is not a failure; it identifies the next verification step.'}</p>
          <button className="btn-primary mt-5" onClick={()=>r.push('/app/results')}>View my result</button>
        </div>
      </> : <>
        <div className="flex justify-between">
          <div>
            <p className="eyebrow">ASSESSMENT WORKSPACE</p>
            <h1 className="mt-2 text-2xl font-semibold">{a.title}</h1>
          </div>
          <span className="text-xs text-slate-600">Probe {step} / 2</span>
        </div>
        <div className="panel mt-6 p-5">
          <div className="h-1 rounded bg-slate-800">
            <div className="h-full rounded bg-emerald-400" style={{width:step===1?'50%':'100%'}}/>
          </div>

          <section className="mt-6 border-b border-slate-800 pb-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600">Problem</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{content.problem}</p>
            <p className="mt-4 text-sm leading-7 text-slate-300">{content.task}</p>
          </section>

          {step===1 ? <div className="mt-6">
            <h2 className="font-medium">Formulate your approach</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Explain the mechanism you would use. We observe interactions inside this workspace only.</p>
            <textarea className="textarea mt-4 min-h-44" value={answer} onChange={e=>{setAnswer(e.target.value);record('TYPE')}} placeholder="Write your approach..." aria-label="Assessment approach"/>
            <button className="btn-primary mt-4" disabled={!answer.trim()} onClick={()=>{record('NEXT');setStep(2)}}>Continue</button>
          </div> : <div className="mt-6">
            <h2 className="font-medium">Boundary / reasoning note</h2>
            <p className="mt-2 text-sm text-slate-500">{content.boundary}</p>
            <textarea className="textarea mt-4 min-h-36" value={notes} onChange={e=>{setNotes(e.target.value);record('TYPE')}} placeholder="Explain the edge case..." aria-label="Boundary reasoning note"/>
            <div className="mt-4 flex justify-between">
              <span className="text-xs text-slate-600">Workspace events: {events.length}</span>
              <button className="btn-primary" disabled={!notes.trim()} onClick={submit}>Submit for verification</button>
            </div>
          </div>}
        </div>
      </>}
    </div>
  </AppShell>;
}
