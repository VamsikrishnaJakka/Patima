'use client';
import {useEffect,useState} from 'react';
import {AppShell} from '@/components/AppShell';

type Hackathon={id:string;title:string;domain:string;experience_level:string;mode:string;scheduled_start:string|null;duration_minutes:number;status:string;arena_spec:any;participants:any[]};

export default function Hackathons(){
 const[h,setH]=useState<Hackathon[]>([]),[show,setShow]=useState(false),[message,setMessage]=useState(''),[form,setForm]=useState({title:'',domain:'sql-window-functions',experienceLevel:'INTERMEDIATE',opponentHandle:'',declaredLanguage:'python',opponentLanguage:'python',scheduledStart:'',durationMinutes:60});
 const load=()=>fetch('/api/hackathons',{cache:'no-store'}).then(r=>r.json()).then(d=>setH(d.hackathons||[]));
 useEffect(()=>{void load()},[]);
 const submit=async()=>{setMessage('Creating proposal…');const r=await fetch('/api/hackathons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json();setMessage(r.ok?'Proposal created. The other participant must review and accept the terms before scheduling.':d.error||'Unable to create proposal');if(r.ok){setShow(false);await load();}};
 const action=async(id:string,action:string)=>{setMessage('Updating…');const r=await fetch('/api/hackathons/'+id+'/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,scheduledStart:form.scheduledStart||undefined})});const d=await r.json();setMessage(r.ok?(action==='ACCEPT'?'Terms accepted.':'Hackathon updated.'):d.error||'Unable to update');await load()};
 return <AppShell>
  <p className="eyebrow">TECHNICAL HACKATHONS</p><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="mt-2 text-3xl font-semibold">Collaborative evidence</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Team outcome is not individual capability. PATIMA matches declared stack and verified level, warns about material disparity, requires mutual agreement, and builds the arena conditions.</p></div><button className="btn-primary" onClick={()=>setShow(true)}>Schedule Hackathon</button></div>
  {message&&<div className="panel mt-5 p-4 text-sm text-slate-400">{message}</div>}
  <div className="mt-6 space-y-4">{!h.length?<div className="panel p-8 text-center text-sm text-slate-500">No hackathons yet. Propose a 1v1 or team arena when you have a participant and target capability.</div>:h.map(x=><article key={x.id} className="panel p-5">
   <div className="flex flex-wrap justify-between gap-4"><div><div className="label">{x.status} · {x.mode}</div><h2 className="mt-2 text-lg font-medium">{x.title}</h2><p className="mt-1 text-xs text-slate-500">{x.domain} · {x.experience_level} · {x.duration_minutes} minutes</p></div>{x.status==='PROPOSED'&&x.participants.some(p=>!p.agreed)&&<button className="btn-primary text-xs" onClick={()=>void action(x.id,'ACCEPT')}>Accept challenge terms</button>}</div>
   <div className="mt-5 grid gap-3 md:grid-cols-3">{x.participants.map(p=><div key={p.userId} className="rounded-lg border border-white/5 p-4"><div className="font-mono text-sm">@{p.handle}</div><div className="mt-2 text-xs text-slate-500">Declared stack: {p.language}</div><div className="mt-1 text-xs text-slate-500">Verified level: {p.verifiedLevel??'Not established'}</div><div className="mt-2 text-xs">{p.agreed?'✓ Terms accepted':'Awaiting participant agreement'}</div></div>)}</div>
   {x.arena_spec?.parity&&<div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 text-xs leading-5 text-amber-100/70"><b className="text-amber-200">Parity check:</b> {x.arena_spec.parity.caution}</div>}
   {x.status==='AGREED'&&<div className="mt-4 flex gap-2"><input type="datetime-local" className="input max-w-xs" value={form.scheduledStart} onChange={e=>setForm({...form,scheduledStart:e.target.value})}/><button className="btn-primary text-xs" onClick={()=>void action(x.id,'SCHEDULE')}>Schedule after agreement</button></div>}
  </article>)}</div>
  {show&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="panel w-full max-w-xl p-6"><h2 className="text-lg font-semibold">Schedule a hackathon</h2><p className="mt-2 text-xs leading-5 text-slate-500">The suggestion can come from participants; PATIMA validates parity and constructs the actual arena, fixtures, limits and hidden conditions after agreement.</p><div className="mt-5 grid gap-3">
   {([['title','Challenge title'],['opponentHandle','Opponent handle'],['domain','Capability / domain'],['experienceLevel','Experience level'],['declaredLanguage','Your stack'],['opponentLanguage','Opponent stack']] as const).map(([k,l])=><label key={k} className="text-xs text-slate-500">{l}<input className="input mt-1" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
   <label className="text-xs text-slate-500">Proposed start<input type="datetime-local" className="input mt-1" value={form.scheduledStart} onChange={e=>setForm({...form,scheduledStart:e.target.value})}/></label>
   <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={()=>setShow(false)}>Cancel</button><button className="btn-primary" onClick={()=>void submit()}>Propose challenge</button></div>
  </div></div></div>}
 </AppShell>;
}
