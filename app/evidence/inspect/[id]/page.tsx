'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {ShieldCheck,Clock,GitCommit,AlertCircle,RefreshCw} from 'lucide-react';

type Level='LEVEL_1_SUMMARY'|'LEVEL_2_CONTEXT'|'LEVEL_3_CODE';
type Evidence={capabilitySlug:string;capabilityName:string;state:string;verificationTier:string;summary:string;recordedAt:string;context?:string|null;artifactCode?:string|null;testTrace?:unknown[];artifactSha256?:string|null;merkleRoot?:string|null;attestationSignature?:string|null};

const levels:[Level,string][]=[
 ['LEVEL_1_SUMMARY','Summary'],
 ['LEVEL_2_CONTEXT','Context'],
 ['LEVEL_3_CODE','Technical proof']
];

export default function PublicEvidenceInspection(){
 const params=useParams<{id:string}>();
 const token=params.id;
 const[level,setLevel]=useState<Level>('LEVEL_1_SUMMARY');
 const[evidence,setEvidence]=useState<Evidence|null>(null);
 const[error,setError]=useState('');
 const[loading,setLoading]=useState(true);

 useEffect(()=>{
  if(!token)return;
  setLoading(true);setError('');
  fetch(`/api/evidence/inspect/${token}?disclosure_level=${level}`,{cache:'no-store'})
   .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to inspect evidence');return d})
   .then(d=>setEvidence(d.evidence))
   .catch(e=>setError(e instanceof Error?e.message:'Unable to inspect evidence'))
   .finally(()=>setLoading(false));
 },[token,level]);

 return <main className="min-h-screen bg-slate-950 text-slate-200">
  <div className="mx-auto max-w-4xl px-6 py-12">
   <div className="flex items-center justify-between border-b border-white/10 pb-5">
    <div><p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">PATIMA · PUBLIC EVIDENCE</p><p className="mt-2 text-xs text-slate-600">Tokenized inspection link · no candidate account required</p></div>
    <ShieldCheck className="h-5 w-5 text-emerald-400"/>
   </div>
   {loading?<div className="py-20 text-center text-sm text-slate-500"><RefreshCw className="mx-auto h-5 w-5 animate-spin"/><p className="mt-3">Loading verified evidence…</p></div>
    :error?<div className="mt-8 flex gap-3 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5 text-sm text-rose-300"><AlertCircle className="h-5 w-5 shrink-0"/><span>{error}</span></div>
    :evidence&&<div className="mt-8 space-y-6">
      <section><p className="text-xs uppercase tracking-[0.18em] text-slate-600">INSPECTABLE CAPABILITY</p><h1 className="mt-2 text-3xl font-semibold">{evidence.capabilityName}</h1><p className="mt-2 text-xs text-slate-500">{evidence.capabilitySlug} · {evidence.verificationTier}</p></section>
      <div className="flex flex-wrap gap-2">{levels.map(([key,label])=><button key={key} onClick={()=>setLevel(key)} className={`rounded-lg border px-3 py-2 text-xs ${level===key?'border-emerald-700 bg-emerald-950/40 text-emerald-300':'border-white/10 bg-slate-900 text-slate-400'}`}>{label}</button>)}</div>
      <section className="panel p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="label">Verification state</div><p className="mt-1 text-sm text-slate-200">{evidence.state}</p></div><div className="text-right text-xs text-slate-600"><Clock className="mr-1 inline h-3.5 w-3.5"/>{new Date(evidence.recordedAt).toLocaleString()}</div></div><div className="mt-6 border-t border-white/5 pt-5"><div className="label">What was observed</div><p className="mt-2 text-sm leading-7 text-slate-300">{evidence.summary}</p></div></section>
      {level!=='LEVEL_1_SUMMARY'&&<section className="panel p-6"><div className="label">Context</div><p className="mt-2 text-sm leading-7 text-slate-400">{evidence.context||'No additional context was recorded.'}</p></section>}
      {level==='LEVEL_3_CODE'&&<><section className="panel p-6"><div className="label">Technical artifact</div>{evidence.artifactCode?<pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-white/5 bg-black/20 p-4 text-xs leading-6 text-slate-300">{evidence.artifactCode}</pre>:<p className="mt-3 text-sm text-slate-500">No code artifact was persisted for this evidence record.</p>}</section><section className="panel p-6"><div className="label">Verification trace</div><pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/5 bg-black/20 p-4 text-[11px] leading-5 text-slate-400">{JSON.stringify(evidence.testTrace||[],null,2)}</pre><div className="mt-5 space-y-2 font-mono text-[11px] text-slate-500"><p><GitCommit className="mr-2 inline h-3.5 w-3.5"/>Artifact SHA-256: {evidence.artifactSha256||'not recorded'}</p><p>Merkle root: {evidence.merkleRoot||'not recorded'}</p><p>Digital signature: {evidence.attestationSignature||'not recorded'}</p></div></section></>}
      <p className="text-xs leading-5 text-slate-600">This page exposes only the evidence snapshot authorized by the candidate's public visibility setting. The link contains a high-entropy token and can be revoked by changing evidence visibility.</p>
    </div>}
  </div>
 </main>;
}
