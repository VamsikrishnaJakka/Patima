'use client';

import Editor from '@monaco-editor/react';
import {Suspense,useCallback,useEffect,useMemo,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {TriPaneInspector} from './tri-pane-inspector';

type FixturePreview={columns:string[];rows:(string|number|null)[][]};
type Question={
  variantId:string;stepIndex:number;promptMarkdown:string;scenarioEntity:string;fixtureDdl:string;
  fixturePreview?:FixturePreview;totalQuestions:number;remainingTimeSeconds:number;draftResponse?:string;expectedTimeComplexity?:string|null;expectedSpaceComplexity?:string|null;questionType?:string|null;conceptRubric?:unknown;
};
type State={closed:boolean;status?:string;assessment?:{slug:string;title:string;description:string};question?:Question;session?:{experience_level:string;current_step:number;expires_at:string}};
type RunResult={verdict:string;allPassed:boolean;executionTimeMs:number;runtimeMs?:number;peakMemoryKb:number|null;output?:string;expectedOutput?:string;errorMessage?:string|null;testCases?:any[];cases?:any[];summary?:{passed:number;total:number;publicPassed:number;publicTotal:number;hiddenPassed:number;hiddenTotal:number};publicTestsPassed?:number;publicTestsTotal?:number;runtime?:{language:string;engineVersion:string;architecture:string;vCpuLimit:number;memoryLimitMb:number;wallClockTimeoutMs:number;networkEnabled:boolean};environmentDigest?:string;sqlAnalysis?:{singleStatement:boolean;allowedTablesOnly:boolean;detectedClauses:string[];performanceObservation?:string;complexity?:{theoreticalTime:string;theoreticalSpace:string;rationale:string};partitionKeys?:string[];orderKeys?:string[];windowFrameExplicit?:boolean;hasUnboundedPreceding?:boolean;observations?:string[];codeSmells?:string[]}};

function Workspace(){
 const params=useSearchParams(),router=useRouter(),sessionId=params.get('session')||'';
 const[state,setState]=useState<State|null>(null);
 const[answer,setAnswer]=useState('');
 const[schema,setSchema]=useState<any|null>(null);
 const[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[testing,setTesting]=useState(false),[submitting,setSubmitting]=useState(false);
 const[error,setError]=useState('');
 const[integrityNotice,setIntegrityNotice]=useState('');
 const[seconds,setSeconds]=useState<number|null>(null);
 const[startedAt,setStartedAt]=useState<number>(Date.now());
 const[keystrokes,setKeystrokes]=useState(0);
 const[consoleTab,setConsoleTab]=useState<'output'|'tests'|'analysis'|'environment'>('output');
 const[runResult,setRunResult]=useState<RunResult|null>(null);
 const[testResult,setTestResult]=useState<RunResult|null>(null);
 const[events,setEvents]=useState<string[]>([]);
 const[saveState,setSaveState]=useState<'saved'|'saving'|'error'>('saved');

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const res=await fetch('/api/assessment/adaptive/session?id='+encodeURIComponent(sessionId),{cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Unable to load assessment');
   setState(data);setSeconds(data.question?.remainingTimeSeconds??null);setStartedAt(Date.now());
   setAnswer(data.question?.draftResponse||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load assessment')}
  finally{setLoading(false)}
 },[sessionId]);

 useEffect(()=>{if(!sessionId){router.replace('/app/assessments');return}load()},[sessionId,load]);

 useEffect(()=>{
  const violation=(reason:string)=>{setEvents(v=>[...v.slice(-19),reason]);setIntegrityNotice(reason);};
  const onVisibility=()=>{if(document.hidden)violation('tab/window left')};
  const onBlur=()=>violation('assessment window lost focus');
  const onFullscreen=()=>{if(!document.fullscreenElement&&!state?.closed)violation('fullscreen exited')};
  const block=(e:ClipboardEvent)=>{e.preventDefault();violation('clipboard action blocked')};
  const blockContext=(e:MouseEvent)=>{e.preventDefault();violation('context menu blocked')};
  const key=(e:KeyboardEvent)=>{
   const restricted=e.key==='F12'||(e.ctrlKey&&['l','t','w','r','n','p','u'].includes(e.key.toLowerCase()))||(e.ctrlKey&&e.shiftKey&&['i','j','c'].includes(e.key.toLowerCase()))||(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key));
   if(restricted){e.preventDefault();violation('restricted keyboard shortcut')}
  };
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('blur',onBlur);document.addEventListener('fullscreenchange',onFullscreen);
  document.addEventListener('copy',block);document.addEventListener('cut',block);document.addEventListener('paste',block);document.addEventListener('contextmenu',blockContext);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);document.removeEventListener('fullscreenchange',onFullscreen);document.removeEventListener('copy',block);document.removeEventListener('cut',block);document.removeEventListener('paste',block);document.removeEventListener('contextmenu',blockContext);document.removeEventListener('keydown',key)}
 },[state?.closed]);

 useEffect(()=>{if(seconds===null)return;const t=window.setInterval(()=>setSeconds(v=>v===null?null:Math.max(0,v-1)),1000);return()=>window.clearInterval(t)},[seconds!==null]);

 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();sessionStorage.setItem('patima:draft:'+sessionId,answer);setIntegrityNotice('Draft saved locally.');}
   if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void run();}
   if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='Enter'){e.preventDefault();void runTests();}
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 });

 useEffect(()=>{
  if(!state?.question)return;
  const t=window.setTimeout(async()=>{
   if(!answer.trim())return;
   setSaveState('saving');
   try{
    const r=await fetch('/api/assessment/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,variantId:state.question!.variantId,code:answer})});
    setSaveState(r.ok?'saved':'error');
   }catch{setSaveState('error')}
  },1200);
  return()=>window.clearTimeout(t);
 },[answer,sessionId,state?.question?.variantId]);

 const language=useMemo(()=>state?.assessment?.slug?.startsWith('python')?'python':state?.assessment?.slug?.startsWith('java')?'java':'sql',[state?.assessment?.slug]);

 const loadSchema=useCallback(async()=>{
  if(!state?.question)return;
  const key='patima:schema:'+state.question.variantId;
  try{
   const cached=sessionStorage.getItem(key);
   if(cached){setSchema(JSON.parse(cached));return;}
  }catch{}
  try{
   const r=await fetch('/api/assessments/workspace/schema?sessionId='+encodeURIComponent(sessionId)+'&variantId='+encodeURIComponent(state.question.variantId),{cache:'no-store'});
   if(r.ok){const data=await r.json();setSchema(data);try{sessionStorage.setItem(key,JSON.stringify(data));}catch{}}
  }catch{}
 },[sessionId,state?.question]);

 useEffect(()=>{void loadSchema()},[loadSchema]);

 async function run(){
  if(!state?.question||!answer.trim()||running)return;
  setRunning(true);setError('');setConsoleTab('output');
  try{
   const r=await fetch('/api/assessments/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,variantId:state.question.variantId,code:answer})});
   const data=await r.json();if(!r.ok)throw new Error(data.message||data.error||'Run failed');setRunResult(data);
  }catch(e){setError(e instanceof Error?e.message:'Run failed')}finally{setRunning(false)}
 }

 async function runTests(){
  if(!state?.question||!answer.trim()||testing)return;
  setTesting(true);setError('');setConsoleTab('tests');
  try{
   const r=await fetch('/api/assessments/run-tests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,variantId:state.question.variantId,code:answer})});
   const data=await r.json();if(!r.ok)throw new Error(data.message||data.error||'Test run failed');setTestResult(data);
  }catch(e){setError(e instanceof Error?e.message:'Test run failed')}finally{setTesting(false)}
 }

 async function submit(){
  if(!state?.question||!answer.trim()||submitting)return;
  if(testResult&&testResult.publicTestsTotal&&testResult.publicTestsPassed!==testResult.publicTestsTotal){setError('Run Tests must pass all visible tests before submission.');setConsoleTab('tests');return}
  setSubmitting(true);setError('');
  try{
   const r=await fetch('/api/assessments/submit-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    sessionId,variantId:state.question.variantId,submittedCode:answer,
    durationSeconds:Math.max(1,Math.round((Date.now()-startedAt)/1000)),
    integrity:{keystrokeCount:keystrokes,events:events.slice(-20)}
   })});
   const data=await r.json();if(!r.ok){const report=data.report;const failed=report?.firstFailingTestCase;const detail=report?('Verification: '+report.verdict+' · Public '+report.publicTestsPassed+'/'+report.publicTestsTotal+' · Hidden '+report.hiddenTestsPassed+'/'+report.hiddenTestsTotal+(failed?.name?' · Failed: '+failed.name:'')+(failed?.errorMessage?' · '+failed.errorMessage:'')):'';throw new Error((data.message||data.error||'Unable to submit answer')+(detail?' — '+detail:''));}
   sessionStorage.removeItem('patima:draft:'+sessionId);
   if(data.status==='COMPLETED'){setState({...state,closed:true,status:'VERIFIED',question:undefined});if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return}
   setState({...state,question:data.nextQuestion});setSeconds(data.nextQuestion.remainingTimeSeconds);setStartedAt(Date.now());setAnswer('');setKeystrokes(0);setRunResult(null);setTestResult(null);setSchema(null);setConsoleTab('output');void loadSchema();
  }catch(e){setError(e instanceof Error?e.message:'Unable to submit answer')}finally{setSubmitting(false)}
 }

 if(loading)return <div className="min-h-screen bg-[#050a0f] text-slate-100 p-4"><p className="text-sm text-slate-400">Preparing secure assessment workspace…</p></div>;
 if(error&&!state)return <div className="min-h-screen bg-[#050a0f] p-6 text-rose-300">{error}</div>;
 if(state?.closed)return <div className="min-h-screen bg-[#050a0f] p-6 text-slate-100"><div className="mx-auto max-w-3xl"><p className="text-xs uppercase tracking-widest text-emerald-300">Assessment complete</p><h1 className="mt-2 text-3xl font-semibold">{state.assessment?.title||'Assessment'}</h1><div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-6"><p className="text-sm leading-7 text-slate-400">Your responses have been verified and recorded on the server.</p><button className="btn-primary mt-5" onClick={()=>router.push('/app/results')}>View result →</button></div></div></div>;

 const q=state?.question;if(!q)return null;
 const publicPassed=testResult?.publicTestsTotal?testResult.publicTestsPassed===testResult.publicTestsTotal:false;
 const previewColumns=q.fixturePreview?.columns||[];
 return <div className="h-screen overflow-hidden bg-[#050a0f] text-slate-100">
  <header className="flex h-12 items-center justify-between border-b border-white/10 bg-[#081018] px-4">
   <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={()=>{if(!window.confirm('Leave this assessment? Your progress and answer will remain saved. The assessment timer will continue running.'))return;router.push('/app')}} className="shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200">← Exit</button><span className="font-semibold tracking-tight">PATIMA</span><span className="text-xs text-slate-500">{state.assessment?.title}</span><span className="text-xs text-slate-600">·</span><span className="text-xs text-slate-500">Question {q.stepIndex}/{q.totalQuestions}</span></div>
   <div className="flex items-center gap-5 text-xs"><span className="text-slate-600">{language.toUpperCase()}</span><span className={seconds!==null&&seconds<180?'text-amber-300':'text-slate-400'}>{seconds!==null?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'--:--'}</span></div>
  </header>
  <main className="grid h-[calc(100vh-6rem)] grid-cols-[34%_66%]">
   <section className="overflow-y-auto border-r border-white/10 bg-[#071019] p-5">
    <div className="text-xs uppercase tracking-widest text-emerald-300">Problem</div>
    <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{q.promptMarkdown}</div>
    <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-4">
     <div className="text-xs uppercase tracking-widest text-slate-500">Constraints & execution guidance</div>
     <div className="mt-3 space-y-2 text-xs text-slate-400">
      {q.expectedTimeComplexity&&<p><span className="text-slate-600">Expected time:</span> {q.expectedTimeComplexity}</p>}
      {q.expectedSpaceComplexity&&<p><span className="text-slate-600">Expected space:</span> {q.expectedSpaceComplexity}</p>}
      <p><span className="text-slate-600">Task type:</span> {q.questionType||'SQL coding'}</p>
      <p><span className="text-slate-600">Execution:</span> server timeout and memory limits are authoritative.</p>
      <p><span className="text-slate-600">Testing:</span> use <b>Run</b> for the current example, then <b>Run Tests</b> for all visible cases.</p>
      <p><span className="text-slate-600">Submission:</span> Submit Step runs authoritative verification, including hidden tests, and advances only after verification passes.</p>
     </div>
    </div>
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
     <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-slate-500">Database schema</span><button type="button" onClick={()=>{setSchema(null);void loadSchema()}} className="text-xs text-slate-600 hover:text-slate-300">refresh</button></div>
     {schema?<div className="mt-3 space-y-3"><div className="text-sm text-slate-300">{schema.tableName}</div><div className="space-y-1">{schema.columns?.map((c:any)=><div key={c.name} className="flex justify-between text-xs"><span className="text-slate-400">{c.name}</span><span className="text-slate-600">{c.type}</span></div>)}</div><div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><tbody>{schema.sampleData?.slice(0,6).map((row:any,i:number)=><tr key={i}>{Object.values(row).map((v:any,j:number)=><td key={j} className="border-b border-white/5 px-2 py-1 text-slate-500">{String(v??'NULL')}</td>)}</tr>)}</tbody></table></div></div>:previewColumns.length?<div className="mt-3 space-y-2"><div className="text-sm text-slate-300">{q.scenarioEntity}</div><div className="space-y-1">{previewColumns.map(name=><div key={name} className="flex justify-between text-xs"><span className="text-slate-400">{name}</span><span className="text-slate-600">loading type…</span></div>)}</div><p className="text-[11px] text-slate-600">Column names and sample rows are ready. Loading exact database types…</p></div>:<p className="mt-3 text-xs text-slate-600">Loading schema…</p>}
    </div>
    {q.fixturePreview&&<details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4"><summary className="cursor-pointer text-xs uppercase tracking-widest text-slate-500">Sample data</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{q.fixturePreview.columns.map(c=><th key={c} className="border-b border-white/10 px-2 py-2 text-slate-600">{c}</th>)}</tr></thead><tbody>{q.fixturePreview.rows.slice(0,8).map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className="border-b border-white/5 px-2 py-1 text-slate-500">{String(v??'NULL')}</td>)}</tr>)}</tbody></table></div></details>}
   </section>
   <section className="grid min-h-0 grid-rows-[1fr_35%]">
    <div className="min-h-0 border-b border-white/10">
     <Editor height="100%" theme="vs-dark" language={language} value={answer} onChange={v=>{setAnswer(v||'');setKeystrokes(k=>k+1)}} options={{automaticLayout:true,minimap:{enabled:true},fontSize:14,lineNumbers:'on',wordWrap:'on',folding:true,bracketPairColorization:{enabled:true},padding:{top:14},scrollBeyondLastLine:false,suggestOnTriggerCharacters:true}} onMount={editor=>{editor.addAction({id:'patima-run',label:'PATIMA: Run',keybindings:[2048+3],run:()=>void run()});editor.addAction({id:'patima-tests',label:'PATIMA: Run Tests',keybindings:[2048+1024+3],run:()=>void runTests()})}} />
    </div>
    <div className="min-h-0 bg-[#060c12]">
     <div className="flex h-10 items-center gap-1 border-b border-white/10 px-3">{(['output','tests','analysis','environment'] as const).map(t=><button key={t} onClick={()=>setConsoleTab(t)} className={'px-3 py-2 text-xs '+(consoleTab===t?'text-emerald-300':'text-slate-600')}>{t==='output'?'Run Console':t==='tests'?'Public Tests':t==='analysis'?'Analysis':'Environment'}</button>)}</div>
     <div className="h-[calc(100%-2.5rem)] overflow-auto p-4 font-mono text-xs">
      {error&&<div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-rose-300"><div className="font-semibold">Action failed</div><div className="mt-1 whitespace-pre-wrap">{error}</div><div className="mt-2 text-[11px] text-rose-400/70">The assessment did not advance. Fix the query or retry the action.</div></div>}
      {integrityNotice&&<div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">Integrity event recorded: {integrityNotice}. This is telemetry and does not block Run, Run Tests, or Submit.</div>}
      {consoleTab==='output'&&<div>
       {!runResult&&!error&&<div className="text-slate-600">Run your SQL to execute it against the assessment fixture.</div>}
       {runResult&&<div>
        <div className="mb-4 flex items-center gap-4"><span className={runResult.verdict==='ACCEPTED'?'text-emerald-300':'text-rose-300'}>{runResult.verdict}</span><span className="text-slate-500">{runResult.executionTimeMs}ms</span></div>
        {runResult.cases?.[0]?.actualOutputPreview&&(()=>{const firstCase=runResult.cases![0];const preview=firstCase.actualOutputPreview;return <div className="rounded-lg border border-white/10 overflow-auto"><table className="w-full text-left text-[11px]"><thead><tr>{preview.columns.map((x:string)=><th key={x} className="border-b border-white/10 px-3 py-2 text-slate-500">{x}</th>)}</tr></thead><tbody>{preview.rows.map((row:any,i:number)=><tr key={i}>{preview.columns.map((x:string)=><td key={x} className="border-b border-white/5 px-3 py-2 text-slate-300">{String(row[x]??'NULL')}</td>)}</tr>)}</tbody></table></div>})()}
        {runResult.errorMessage&&<pre className="mt-3 whitespace-pre-wrap text-rose-300">{runResult.errorMessage}</pre>}
       </div>}
      </div>}
      {consoleTab==='tests'&&<div>
       {testResult&&<div className="mb-4 flex items-center gap-4"><span className={testResult.verdict==='ACCEPTED'?'text-emerald-300':'text-rose-300'}>{testResult.verdict}</span><span className="text-slate-500">{testResult.summary?.publicPassed??testResult.publicTestsPassed??0}/{testResult.summary?.publicTotal??testResult.publicTestsTotal??0} public tests</span><span className="text-slate-500">{testResult.executionTimeMs}ms</span></div>}
       {!testResult&&!error&&<div className="text-slate-600">Run Tests to see every visible case.</div>}
       {(testResult?.cases||testResult?.testCases||[]).map((t:any,i:number)=><div key={t.id||i} className="mb-3">
        <div className="mb-2 flex justify-between rounded border border-white/10 p-2"><span className="text-slate-300">Case {i+1} · {t.name}</span><span className={t.status==='AC'?'text-emerald-300':'text-rose-300'}>{t.status}</span></div>
        <TriPaneInspector testCase={t}/>
       </div>)}
      </div>}
      {consoleTab==='analysis'&&<div className="space-y-4 text-[11px] text-slate-400">
       {((testResult||runResult)?.sqlAnalysis)&&<><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-white/10 p-3"><div className="text-slate-600">Time</div><div className="mt-1 text-slate-200">{(testResult||runResult)?.sqlAnalysis?.complexity?.theoreticalTime||'—'}</div></div>
        <div className="rounded border border-white/10 p-3"><div className="text-slate-600">Space</div><div className="mt-1 text-slate-200">{(testResult||runResult)?.sqlAnalysis?.complexity?.theoreticalSpace||'—'}</div></div>
        <div className="rounded border border-white/10 p-3"><div className="text-slate-600">Window Frame</div><div className="mt-1 text-slate-200">{(testResult||runResult)?.sqlAnalysis?.windowFrameExplicit?'Explicit':'Implicit'}</div></div>
        <div className="rounded border border-white/10 p-3"><div className="text-slate-600">Partitions</div><div className="mt-1 text-slate-200">{(testResult||runResult)?.sqlAnalysis?.partitionKeys?.join(', ')||'None'}</div></div>
       </div>
       <div className="rounded border border-white/10 p-3"><div className="mb-2 font-semibold text-slate-300">Detected SQL</div><div>{(testResult||runResult)?.sqlAnalysis?.detectedClauses?.join(' · ')||'None'}</div></div>
       <div className="rounded border border-white/10 p-3"><div className="mb-2 font-semibold text-slate-300">Why</div><div>{(testResult||runResult)?.sqlAnalysis?.complexity?.rationale}</div></div>
       {((testResult||runResult)?.sqlAnalysis?.observations||[]).length>0&&<div className="rounded border border-amber-500/20 bg-amber-500/5 p-3"><div className="mb-2 font-semibold text-amber-300">Performance observations</div><ul className="space-y-1">{(testResult||runResult)?.sqlAnalysis?.observations?.map((x:string)=><li key={x}>• {x}</li>)}</ul></div>}
       {((testResult||runResult)?.sqlAnalysis?.codeSmells||[]).length>0&&<div className="rounded border border-rose-500/20 bg-rose-500/5 p-3"><div className="mb-2 font-semibold text-rose-300">Code smells</div><ul className="space-y-1">{(testResult||runResult)?.sqlAnalysis?.codeSmells?.map((x:string)=><li key={x}>• {x}</li>)}</ul></div>}
       </>}
       {!((testResult||runResult)?.sqlAnalysis)&&<div className="text-slate-600">Run your SQL to generate structural analysis.</div>}
      </div>}
      {consoleTab==='environment'&&<div className="space-y-2 text-slate-500"><div>Runtime: <span className="text-slate-300">{testResult?.runtime?.language||runResult?.runtime?.language||'server-selected'}</span></div><div>Engine: <span className="text-slate-300">{testResult?.runtime?.engineVersion||runResult?.runtime?.engineVersion||'server-selected'}</span></div><div>CPU: <span className="text-slate-300">{testResult?.runtime?.vCpuLimit||runResult?.runtime?.vCpuLimit||'—'} vCPU</span></div><div>Memory: <span className="text-slate-300">{testResult?.runtime?.memoryLimitMb||runResult?.runtime?.memoryLimitMb||'—'} MB</span></div><div>Network: <span className="text-slate-300">disabled</span></div><div>Digest: <span className="break-all text-slate-600">{testResult?.environmentDigest||runResult?.environmentDigest||'—'}</span></div></div>}
     </div>
    </div>
   </section>
  </main>
  <footer className="flex h-14 items-center justify-between border-t border-white/10 bg-[#081018] px-4">
   <div className="flex min-w-0 items-center gap-4 text-[11px] text-slate-600"><span>{keystrokes} editor changes</span><span>{saveState==='saving'?'Saving…':saveState==='error'?'Save failed':'Draft saved'}</span>{events.length>0&&<span className="text-amber-400">{events.length} integrity event(s)</span>}</div>
   <div className="flex items-center gap-2">
    <button type="button" onClick={()=>void run()} disabled={running||!answer.trim()} title="Execute the current answer without progressing" className="rounded-md border border-white/10 px-4 py-2 text-xs text-slate-300 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40">{running?'Running…':<>Run <span className="ml-1 text-slate-600">Ctrl+Enter</span></>}</button>
    <button type="button" onClick={()=>void runTests()} disabled={testing||!answer.trim()} title="Run all visible/public tests" className="rounded-md border border-emerald-500/30 px-4 py-2 text-xs text-emerald-300 hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-40">{testing?'Testing…':<>Run Tests <span className="ml-1 text-emerald-500/60">Ctrl+Shift+Enter</span></>}</button>
    <button type="button" onClick={()=>void submit()} disabled={submitting||!answer.trim()||seconds===0||(!testResult?.publicTestsTotal?false:!publicPassed)} title={publicPassed?'Submit for authoritative server verification':'Run Tests and pass all visible tests before submitting'} className="btn-primary disabled:cursor-not-allowed disabled:opacity-40">{submitting?'Verifying…':'Submit Step →'}</button>
   </div>
  </footer>
 </div>;
}

export default function AssessmentWorkspacePage(){
 return <Suspense fallback={<div className="min-h-screen bg-[#050a0f] p-6 text-slate-400">Loading assessment workspace…</div>}><Workspace/></Suspense>;
}
