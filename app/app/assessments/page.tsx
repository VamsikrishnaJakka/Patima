'use client';
import Link from 'next/link';
import {AppShell} from '@/components/AppShell';
import {ASSESSMENT_CATALOG} from '@/lib/assessment-catalog';

export default function Assessments(){return <AppShell><p className="eyebrow">ASSESSMENTS</p><h1 className="mt-2 text-3xl font-semibold">Technical capability probes</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Configure a role, seniority, and capability domain first. Each assessment uses three progressive probes and records evidence only after server-side verification.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{ASSESSMENT_CATALOG.map(a=><Link href={`/app/assessments/setup?domain=${encodeURIComponent(a.slug)}`} key={a.slug} className="panel block p-5 transition hover:border-white/20"><div className="flex justify-between text-xs text-slate-500"><span className="text-emerald-300">{a.capabilityName}</span><span>3 probes</span></div><h2 className="mt-4 text-xl font-medium">{a.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{a.description}</p><div className="mt-5 text-xs text-emerald-300">Calibrate assessment →</div></Link>)}</div></AppShell>}
