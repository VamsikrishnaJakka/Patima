'use client';

import {useState} from 'react';
import Editor from '@monaco-editor/react';
import {ArrowRight,CheckCircle2,Clock3,FlaskConical,Play,RotateCcw,Table2} from 'lucide-react';
import {AppShell} from '@/components/AppShell';

type Output={columns:string[];rows:Record<string,unknown>[]}|null;

const starter=[
  'SELECT',
  '  customer_id,',
  '  order_id,',
  '  order_date,',
  '  amount,',
  '  status',
  'FROM customer_orders',
  'ORDER BY customer_id, order_date, order_id;'
].join('\n');

export default function Sandboxes(){
 const[sql,setSql]=useState(starter);
 const[running,setRunning]=useState(false);
 const[verdict,setVerdict]=useState('');
 const[runtime,setRuntime]=useState<number|null>(null);
 const[output,setOutput]=useState<Output>(null);
 const[error,setError]=useState('');
 const run=async()=>{
  setRunning(true);setError('');setOutput(null);
  try{const res=await fetch('/api/sandboxes/sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to run sandbox');setVerdict(data.verdict||'');setRuntime(data.runtimeMs??null);setOutput(data.output??null);if(data.errorMessage)setError(data.errorMessage);}
  catch(e){setError(e instanceof Error?e.message:'Unable to run sandbox');setVerdict('')}
  finally{setRunning(false)}
 };
 return <AppShell>
  <div className="mx-auto max-w-6xl">
   <div className="flex flex-wrap items-end justify-between gap-4">
    <div><p className="eyebrow text-red-600">SANDBOX</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">SQL Query Sandbox</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Run queries against a fixed <code>customer_orders</code> fixture. Nothing is submitted and no evidence is created.</p></div>
    <div className="flex gap-2"><button className="btn-ghost" onClick={()=>{setSql(starter);setOutput(null);setError('');setVerdict('')}}><RotateCcw className="h-3.5 w-3.5"/>Reset</button><button className="btn-primary" disabled={running} onClick={run}><Play className="h-3.5 w-3.5"/>{running?'Running…':'Run query'}</button></div>
   </div>
   <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span className="text-xs font-semibold text-slate-700">query.sql</span><span className="text-[10px] uppercase tracking-wider text-slate-400">DuckDB · 128 MB · 2 sec</span></div><Editor height="420px" defaultLanguage="sql" value={sql} onChange={(v)=>setSql(v||'')} theme="light" options={{minimap:{enabled:false},fontSize:13,scrollBeyondLastLine:false,automaticLayout:true,padding:{top:16,bottom:16}}}/></section>
    <aside className="space-y-4">
     <section className="panel p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Table2 className="h-4 w-4 text-red-600"/>customer_orders</div><p className="mt-1 text-xs text-slate-500">8 rows · 5 columns · fixed sandbox data</p><div className="mt-4 space-y-2">{['customer_id INT','order_id INT','order_date DATE','amount NUMERIC','status TEXT'].map(x=><div key={x} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">{x}</div>)}</div></section>
     <section className="panel p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FlaskConical className="h-4 w-4 text-red-600"/>Sandbox rules</div><div className="mt-3 space-y-2 text-xs leading-5 text-slate-500"><p>Read-only fixture. No persistent database writes.</p><p>Run only. No score, submission or evidence.</p><p>Useful for joins, filters, ranking and window functions.</p></div></section>
    </aside>
   </div>
   <section className="mt-5 panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-950">Result</h2><p className="mt-1 text-xs text-slate-500">{verdict||'Run a query to see rows here.'}</p></div>{runtime!==null&&<span className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5"/>{runtime} ms</span>}</div>{error&&<div className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs leading-5 text-red-700">{error}</div>}{!output?<div className="p-10 text-center text-xs text-slate-400">No result yet.</div>:output.rows.length===0?<div className="p-10 text-center text-xs text-slate-500">Query returned 0 rows.</div>:<div className="overflow-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr>{output.columns.map(c=><th key={c} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold text-slate-600">{c}</th>)}</tr></thead><tbody>{output.rows.map((row,i)=><tr key={i} className="border-b border-slate-100 last:border-0">{output.columns.map(c=><td key={c} className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{String(row[c]??'NULL')}</td>)}</tr>)}</tbody></table></div>}</section>
   <div className="mt-4 flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-red-500"/> Isolated from assessments and evidence. <a className="font-semibold text-red-600 hover:text-red-700" href="/app/assessments">Ready to be evaluated? <ArrowRight className="inline h-3.5 w-3.5"/></a></div>
  </div>
 </AppShell>
}