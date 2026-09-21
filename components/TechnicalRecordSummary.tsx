'use client';
import React from'react';

export interface TechnicalRecordMetrics{
 assessmentsCompleted:number;
 evidenceRecords:number;
 demonstratedCount:number;
 developingCount:number;
}

export function TechnicalRecordSummary({metrics}:{metrics:TechnicalRecordMetrics}){
 return <div className="grid grid-cols-2 gap-3 md:grid-cols-4 p-4 bg-slate-900/60 border border-white/10 rounded-xl font-mono text-xs mb-6">
  <div className="border-r border-white/5 pr-3"><span className="text-slate-500 uppercase block text-[10px] tracking-wider">Evaluations</span><span className="text-lg font-bold text-slate-100">{metrics.assessmentsCompleted} Completed</span></div>
  <div className="border-r border-white/5 pr-3"><span className="text-slate-500 uppercase block text-[10px] tracking-wider">Evidence Records</span><span className="text-lg font-bold text-sky-400">{metrics.evidenceRecords} Recorded</span></div>
  <div className="border-r border-white/5 pr-3"><span className="text-slate-500 uppercase block text-[10px] tracking-wider">Demonstrated</span><span className="text-lg font-bold text-emerald-400">{metrics.demonstratedCount} Verified</span></div>
  <div><span className="text-slate-500 uppercase block text-[10px] tracking-wider">Developing</span><span className="text-lg font-bold text-amber-400">{metrics.developingCount} In Progress</span></div>
 </div>;
}
