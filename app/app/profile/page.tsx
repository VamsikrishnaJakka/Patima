'use client';
import {useEffect,useState} from 'react';
import {AppShell} from '@/components/AppShell';

type Session={name:string;email:string;handle:string;role:string};
type Overview={stats:{demonstrated:number;developing:number;completed:number};evidence:{capability:string;state:string;verification:string}[]};

export default function Profile(){
 const[s,setS]=useState<Session|null>(null); const[o,setO]=useState<Overview|null>(null);
 useEffect(()=>{Promise.all([fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()),fetch('/api/candidate/overview',{cache:'no-store'}).then(r=>r.json())]).then(([auth,overview])=>{setS(auth.session);setO(overview);}).catch(()=>{});},[]);
 return <AppShell><p className="eyebrow">PROFILE</p><h1 className="mt-2 text-3xl font-semibold">Your professional identity</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A factual view of your account identity and evidence currently recorded by PATIMA.</p>
  <div className="mt-6 grid gap-4 lg:grid-cols-2"><section className="panel p-6"><h2 className="font-medium">Identity & verification</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><div className="label">Real name</div><p className="mt-1">{s?.name||'—'}</p></div><div><div className="label">Account handle</div><p className="mt-1 font-mono">@{s?.handle||'—'}</p></div><div><div className="label">Primary contact email</div><p className="mt-1 break-all text-slate-300">{s?.email||'—'}</p></div><div><div className="label">Verification tier</div><p className="mt-1 text-slate-400">Provisional Email</p></div></div></section>
  <section className="panel p-6"><h2 className="font-medium">Active demonstrations</h2><div className="mt-5 grid grid-cols-3 gap-3"><div><div className="label">Demonstrated</div><p className="mt-2 text-2xl font-semibold">{o?.stats.demonstrated??0}</p></div><div><div className="label">Developing</div><p className="mt-2 text-2xl font-semibold">{o?.stats.developing??0}</p></div><div><div className="label">Completed</div><p className="mt-2 text-2xl font-semibold">{o?.stats.completed??0}</p></div></div><p className="mt-5 text-xs leading-5 text-slate-500">Counts are derived from your authenticated account; no seeded demonstration data is shown.</p></section></div>
  <section className="panel mt-4 p-6"><h2 className="font-medium">Evidence currently on record</h2>{!o?.evidence?.length?<p className="mt-4 text-sm text-slate-500">No capability evidence has been recorded yet.</p>:<div className="mt-4 space-y-2">{o.evidence.map(e=><div key={e.capability} className="flex items-center justify-between rounded-lg border border-white/5 px-4 py-3"><span className="text-sm">{e.capability}</span><span className="text-xs text-slate-500">{e.state} · {e.verification}</span></div>)}</div>}</section>
 </AppShell>;
}
