'use client';
import {useEffect,useState} from 'react';
import {AppShell} from '@/components/AppShell';

type Visibility='PRIVATE'|'APPROVED_EMPLOYERS_ONLY'|'PUBLIC';
type Settings={visibility:Visibility;accepting_contact_requests:boolean;peer_visibility:boolean};

export default function Settings(){
 const[s,setS]=useState<Settings>({visibility:'PRIVATE',accepting_contact_requests:true,peer_visibility:false});const[saving,setSaving]=useState(false);const[message,setMessage]=useState('');
 useEffect(()=>{fetch('/api/candidate/settings/visibility',{cache:'no-store'}).then(r=>r.json()).then(setS).catch(()=>{});},[]);
 const save=async(next:Settings)=>{setS(next);setSaving(true);setMessage('');try{const r=await fetch('/api/candidate/settings/visibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(!r.ok)throw new Error();setS(await r.json());setMessage('Saved.');}catch{setMessage('Unable to save this change.');}finally{setSaving(false);}};
 return <AppShell><p className="eyebrow">SETTINGS</p><h1 className="mt-2 text-3xl font-semibold">Privacy and account controls</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Control which audiences may discover or contact you. These settings are stored against your authenticated candidate account.</p>
  <div className="panel mt-6 p-6 space-y-6"><div><h2 className="font-medium">Evidence visibility</h2><p className="mt-1 text-xs text-slate-500">Choose the audience for your professional evidence.</p><div className="mt-3 flex flex-wrap gap-2">{(['PRIVATE','APPROVED_EMPLOYERS_ONLY','PUBLIC'] as Visibility[]).map(v=><button key={v} onClick={()=>save({...s,visibility:v})} className={`rounded-lg border px-3 py-2 text-xs ${s.visibility===v?'border-emerald-700 bg-emerald-950/40 text-emerald-300':'border-white/10 bg-slate-900 text-slate-400'}`}>{v==='PRIVATE'?'Private':v==='APPROVED_EMPLOYERS_ONLY'?'Approved employers':'Public'}</button>)}</div></div>
   <div className="border-t border-white/5 pt-5"><label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-medium">Accept employer contact requests</span><span className="mt-1 block text-xs text-slate-500">Employers can request contact only when your visibility rules permit discovery.</span></span><input type="checkbox" checked={s.accepting_contact_requests} onChange={e=>save({...s,accepting_contact_requests:e.target.checked})}/></label></div>
   <div className="border-t border-white/5 pt-5"><label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-medium">Technical community & peer visibility</span><span className="mt-1 block text-xs text-slate-500">Persist your audience preference for peer/community features. This does not itself expose evidence.</span></span><input type="checkbox" checked={s.peer_visibility} onChange={e=>save({...s,peer_visibility:e.target.checked})}/></label></div>
   <div className="border-t border-white/5 pt-5 text-xs text-slate-600">{saving?'Saving…':message||'Changes are applied immediately.'}</div>
  </div>
 </AppShell>;
}
