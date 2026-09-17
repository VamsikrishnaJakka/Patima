import Link from 'next/link';
import {FileCheck2,ShieldCheck,Workflow} from 'lucide-react';

export default function HomePage(){
 return <main className="min-h-screen bg-slate-950 text-slate-100">
  <header className="border-b border-white/10">
   <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
    <Link href="/" className="min-w-0"><div className="text-lg font-semibold tracking-tight">PATIMA</div><div className="mt-1 text-xs text-slate-500">Evidence-first professional ecosystem</div></Link>
    <nav className="flex shrink-0 items-center gap-2"><Link href="/login" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Sign in</Link><Link href="/signup" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200">Create account</Link></nav>
   </div>
  </header>
  <section className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
   <div className="max-w-3xl"><p className="eyebrow">CAPABILITY → EVIDENCE → OPPORTUNITY</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Professional capability should be inspectable.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">PATIMA turns technical work into structured, inspectable evidence — from assessment and practice through verification and professional discovery.</p></div>
   <div className="mt-12 grid gap-4 md:grid-cols-3">
    <div className="panel p-6"><FileCheck2 className="h-5 w-5 text-slate-400"/><h2 className="mt-4 text-sm font-medium">Evidence over claims</h2><p className="mt-2 text-sm leading-6 text-slate-500">Capabilities stay connected to observations, context, dates, artifacts, and verification states.</p></div>
    <div className="panel p-6"><Workflow className="h-5 w-5 text-slate-400"/><h2 className="mt-4 text-sm font-medium">Develop, then demonstrate</h2><p className="mt-2 text-sm leading-6 text-slate-500">Assessment and practice can route into independent verification without turning learning completion into proof.</p></div>
    <div className="panel p-6"><ShieldCheck className="h-5 w-5 text-slate-400"/><h2 className="mt-4 text-sm font-medium">Inspectable by design</h2><p className="mt-2 text-sm leading-6 text-slate-500">Evidence access, progressive disclosure, candidate consent, and verification provenance are explicit system boundaries.</p></div>
   </div>
  </section>
 </main>;
}
