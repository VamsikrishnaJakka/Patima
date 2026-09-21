'use client';
import {useEffect,useState} from 'react';
import {AppShell} from '@/components/AppShell';
import {StatusPill} from '@/components/StatusPill';

type Evidence={evidenceId:string;capability:string;state:string;verificationTier:string;recordedAt:string;summary:string;context?:string|null;artifactCode?:string|null;testTrace:unknown[];peerReviewSummary?:string|null;artifactSha256?:string|null;merkleRoot?:string|null;attestationSignature?:string|null;astFingerprint?:unknown;behavioralAssertions?:unknown;executionTraceDigest?:string|null;assessmentSessionId?:string|null;executionRunCount:number;latestExecutionTimeMs:number|null};

export default function EvidencePage(){
 const[e,setE]=useState<Evidence[]>([]),[error,setError]=useState(''),[open,setOpen]=useState<string|null>(null);
 useEffect(()=>{fetch('/api/candidate/evidence',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load evidence');setE(d.evidence||[])}).catch(err=>setError(err instanceof Error?err.message:'Unable to load evidence'));},[]);
 return <AppShell>
  <p className="eyebrow">EVIDENCE DOSSIER</p><h1 className="mt-2 text-3xl font-semibold">Your inspectable evidence</h1>
  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Evidence is derived from persisted PATIMA verification records. A claim without an execution record, artifact, or attestation is not presented as demonstrated evidence.</p>
  {error&&<div className="panel mt-6 p-5 text-sm text-rose-300">{error}</div>}
  {!error&&!e.length&&<div className="panel mt-6 p-8 text-center text-sm text-slate-500">No capability evidence has been recorded yet. Complete an assessment or challenge to create inspectable evidence.</div>}
  <div className="mt-6 space-y-4">{e.map(x=>{const expanded=open===x.evidenceId;return <article key={x.evidenceId} className="panel overflow-hidden">
   <button type="button" onClick={()=>setOpen(expanded?null:x.evidenceId)} className="w-full p-5 text-left"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-medium">{x.capability}</h2><p className="mt-1 text-xs text-slate-600">Observed {new Date(x.recordedAt).toLocaleString()} · {x.verificationTier} · Evidence #{x.evidenceId.slice(0,8)}</p></div><StatusPill value={x.state}/></div>
   <div className="mt-4 grid gap-3 md:grid-cols-4 text-xs"><div><span className="label">Verification</span><p className="mt-1 text-slate-300">{x.verificationTier}</p></div><div><span className="label">Execution runs</span><p className="mt-1 text-slate-300">{x.executionRunCount}</p></div><div><span className="label">Latest runtime</span><p className="mt-1 text-slate-300">{x.latestExecutionTimeMs==null?'—':x.latestExecutionTimeMs+' ms'}</p></div><div><span className="label">Artifact hash</span><p className="mt-1 truncate font-mono text-slate-400">{x.artifactSha256||'not recorded'}</p></div></div></button>
   {expanded&&<div className="border-t border-white/5 p-5 space-y-5"><section><div className="label">What was observed</div><p className="mt-2 text-sm leading-6 text-slate-300">{x.summary}</p>{x.context&&<p className="mt-2 text-xs leading-5 text-slate-500">{x.context}</p>}</section>
   <section><div className="label">Attested artifact</div>{x.artifactCode?<pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-white/5 bg-black/20 p-4 text-xs leading-6">{x.artifactCode}</pre>:<p className="mt-2 text-sm text-slate-500">No code artifact was persisted for this record.</p>}</section>
   <section><div className="label">Verification trace</div><pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/5 bg-black/20 p-4 text-xs leading-5">{JSON.stringify({testTrace:x.testTrace,behavioralAssertions:x.behavioralAssertions,astFingerprint:x.astFingerprint,executionTraceDigest:x.executionTraceDigest},null,2)}</pre></section>
   <section><div className="label">Integrity</div><div className="mt-2 grid gap-2 font-mono text-[11px] text-slate-400"><p>Evidence ID: {x.evidenceId}</p><p>Assessment session: {x.assessmentSessionId||'—'}</p><p>SHA-256: {x.artifactSha256||'not recorded'}</p><p>Merkle root: {x.merkleRoot||'not recorded'}</p><p>Attestation: {x.attestationSignature||'not recorded'}</p></div></section></div>}
  </article>})}</div>
 </AppShell>;
}
