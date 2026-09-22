import Link from 'next/link';
import {FileCheck2,ShieldCheck,Workflow} from 'lucide-react';

export default function HomePage(){
 return <main className="patima-public min-h-screen">
  <header className="border-b border-slate-200 bg-white">
   <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
    <Link href="/" className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-sm font-bold text-white">P</span><div className="text-lg font-semibold tracking-tight text-slate-950">PATIMA</div></div><div className="mt-1 text-xs text-slate-500">Skills. Proof. Opportunities.</div></Link>
    <nav className="flex shrink-0 items-center gap-2"><Link href="/login" className="btn-ghost">Sign in</Link><Link href="/signup" className="btn-primary">Create account</Link></nav>
   </div>
  </header>
  <section className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
   <div className="max-w-3xl"><p className="eyebrow text-red-600">CAPABILITY → EVIDENCE → OPPORTUNITY</p><h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Professional capability should be inspectable.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">PATIMA turns technical work into structured, inspectable evidence — from assessment and practice through verification and professional discovery.</p></div>
   <div className="mt-12 grid gap-4 md:grid-cols-3">
    <div className="panel p-6"><FileCheck2 className="h-5 w-5 text-red-600"/><h2 className="mt-4 text-sm font-medium text-slate-900">Evidence over claims</h2><p className="mt-2 text-sm leading-6 text-slate-500">Capabilities stay connected to observations, context, dates, artifacts, and verification states.</p></div>
    <div className="panel p-6"><Workflow className="h-5 w-5 text-red-600"/><h2 className="mt-4 text-sm font-medium text-slate-900">Develop, then demonstrate</h2><p className="mt-2 text-sm leading-6 text-slate-500">Assessment and practice can route into independent verification without turning learning completion into proof.</p></div>
    <div className="panel p-6"><ShieldCheck className="h-5 w-5 text-red-600"/><h2 className="mt-4 text-sm font-medium text-slate-900">Inspectable by design</h2><p className="mt-2 text-sm leading-6 text-slate-500">Evidence access, progressive disclosure, candidate consent, and verification provenance are explicit system boundaries.</p></div>
   </div>
  </section>
 </main>;
}
