'use client';

import type {AssessmentDossierResponse} from '@/app/api/assessment/results/dossier/route';

export function PrintDossier({data,onClose}:{data:AssessmentDossierResponse;onClose:()=>void}){
 const percent=data.metrics.totalQuestions?Math.round((data.metrics.scoredCorrect/data.metrics.totalQuestions)*100):0;
 return <div className="patima-print-dossier fixed inset-0 z-[100] overflow-auto bg-slate-100 text-slate-900">
  <style jsx global>{`
   @page{size:A4 portrait;margin:14mm}
   @media print{
    body *{visibility:hidden!important}
    .patima-print-dossier,.patima-print-dossier *{visibility:visible!important}
    .patima-print-dossier{position:absolute!important;left:0!important;top:0!important;width:100%!important;display:block!important;overflow:visible!important;background:white!important;color:#0f172a!important}
    .patima-print-toolbar{display:none!important}
    .patima-print-question{break-inside:avoid}
    .patima-print-dossier pre{white-space:pre-wrap;overflow-wrap:anywhere}
   }
  `}</style>
  <div className="patima-print-toolbar sticky top-0 z-10 flex items-center justify-between border-b bg-slate-950 px-5 py-3 text-white">
   <div><div className="font-semibold">PATIMA Assessment Dossier</div><div className="text-xs text-slate-400">Use your browser's print dialog and choose <b>Save as PDF</b>.</div></div>
   <div className="flex gap-2"><button onClick={onClose} className="rounded border border-white/20 px-4 py-2 text-xs">Close</button><button onClick={()=>window.print()} className="rounded bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950">Export PDF</button></div>
  </div>

  <article className="mx-auto max-w-[210mm] bg-white p-8 print:p-0">
   <header className="border-b-4 border-slate-900 pb-5">
    <div className="text-[11px] font-bold tracking-[0.2em] text-slate-500">PATIMA · TECHNICAL ASSESSMENT DOSSIER</div>
    <h1 className="mt-2 text-3xl font-bold">Assessment Evidence & Learning Analysis</h1>
    <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-600">
     <div>Candidate: <b>{data.candidate.name||data.candidate.handle}</b></div>
     <div>Handle: <b>@{data.candidate.handle}</b></div>
     <div>Target: <b>{data.session.targetRole}</b></div>
     <div>Level: <b>{data.session.experienceLevel}</b></div>
     <div>Domain: <b>{data.session.domainTitle}</b></div>
     <div>Submitted: <b>{data.session.submittedAt?new Date(data.session.submittedAt).toLocaleString():'—'}</b></div>
    </div>
   </header>

   <section className="mt-6 grid grid-cols-4 gap-3">
    {[
     ['Score',data.metrics.scoredCorrect+'/'+data.metrics.totalQuestions+' ('+percent+'%)'],
     ['Skipped',String(data.metrics.skipped)],
     ['Failed',String(data.metrics.failed)],
     ['Response time',data.metrics.totalDurationSeconds+'s']
    ].map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 p-3"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>)}
   </section>

   <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
    <h2 className="text-sm font-bold uppercase tracking-wider">Executive interpretation</h2>
    <p className="mt-2 text-sm leading-6">This dossier describes what was actually demonstrated during this assessment. Correct responses are treated as demonstrated evidence; skipped or failed responses identify topics requiring preparation. Optimization notes describe additional performance considerations and are not a replacement for correctness.</p>
    {data.conceptGaps.length>0&&<div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-amber-700">Topics requiring preparation</div><ul className="mt-2 space-y-1 text-sm">{data.conceptGaps.map((g,i)=><li key={i}>• Question {g.stepIndex}: <b>{g.concept.replace(/_/g,' ')}</b> — {g.reason}</li>)}</ul></div>}
   </section>

   <section className="mt-7">
    <h2 className="text-lg font-bold">Question performance matrix</h2>
    <table className="mt-3 w-full border-collapse text-[10px]">
     <thead><tr className="bg-slate-900 text-white"><th className="p-2 text-left">Question</th><th className="p-2 text-left">Concept</th><th className="p-2 text-left">State</th><th className="p-2 text-left">Time</th><th className="p-2 text-left">Tests</th></tr></thead>
     <tbody>{data.questions.map(q=><tr key={q.stepIndex} className="border-b border-slate-200"><td className="p-2">Q{q.stepIndex} · {q.questionType}</td><td className="p-2">{q.conceptTag.replace(/_/g,' ')}</td><td className="p-2 font-bold">{q.status}</td><td className="p-2">{q.durationSeconds}s / {q.expectedTimeSeconds}s</td><td className="p-2">{q.questionType==='CODING'?q.publicTestsPassed+'/'+q.publicTestsTotal+' public · '+q.hiddenTestsPassed+'/'+q.hiddenTestsTotal+' hidden':'—'}</td></tr>)}</tbody>
    </table>
   </section>

   <div className="mt-8 space-y-8">
    {data.questions.map(q=><section key={q.stepIndex} className="patima-print-question border-t-2 border-slate-200 pt-5">
     <div className="flex items-start justify-between gap-4">
      <div><div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Question {q.stepIndex} · {q.questionType} · {q.conceptTag.replace(/_/g,' ')}</div><h3 className="mt-2 text-base font-bold">{q.promptMarkdown}</h3></div>
      <div className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-bold">{q.status}</div>
     </div>

     <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
      <div><b>Expected time complexity:</b> {q.expectedTimeComplexity||'Not specified'}</div>
      <div><b>Expected space complexity:</b> {q.expectedSpaceComplexity||'Not specified'}</div>
      <div><b>Observed complexity:</b> {q.observedTimeComplexity||'Not captured'} / {q.observedSpaceComplexity||'Not captured'}</div>
      <div><b>Execution:</b> {q.executionTimeMs==null?'Not executed':q.executionTimeMs+' ms'}</div>
     </div>

     <div className="mt-4"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Candidate response</div><pre className="mt-1 rounded border border-slate-200 bg-slate-50 p-3 text-[9px] leading-4">{q.candidateResponse||'No response recorded.'}</pre></div>

     {(q.correctAnswer||q.referenceSolution)&&<div className="mt-3 grid grid-cols-2 gap-3">
      {q.correctAnswer&&<div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Authored correct answer</div><div className="mt-1 rounded border border-emerald-200 bg-emerald-50 p-3 text-[10px]">{q.correctAnswer}</div></div>}
      {q.referenceSolution&&<div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Reference solution</div><pre className="mt-1 rounded border border-slate-200 bg-slate-50 p-3 text-[9px] leading-4">{q.referenceSolution}</pre></div>}
     </div>}

     <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Diagnostic analysis</div>
      <p className="mt-2 text-[10px] leading-5"><b>What happened:</b> {q.analysis.diagnosis}</p>
      <p className="mt-2 text-[10px] leading-5"><b>What to prepare:</b> {q.analysis.actionableAdvice}</p>
      <p className="mt-2 text-[10px] leading-5"><b>Optimization / performance:</b> {q.analysis.optimizationNote}</p>
      {q.analysis.evidence.length>0&&<ul className="mt-2 space-y-1 text-[10px]">{q.analysis.evidence.map((e,i)=><li key={i}>• {e}</li>)}</ul>}
     </div>
    </section>)}
   </div>

   <footer className="mt-10 border-t border-slate-300 pt-4 text-[9px] text-slate-500">
    Server-generated from persisted assessment evidence. The report distinguishes demonstrated correctness from preparation gaps and optimization observations.
   </footer>
  </article>
 </div>;
}
