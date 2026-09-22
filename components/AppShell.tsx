"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {BriefcaseBusiness,FileCheck2,GraduationCap,LayoutDashboard,LogOut,MessageSquareText,Settings,Swords,UserRound,Users} from "lucide-react";
import {useEffect,useState} from "react";

const candidateLinks=[['/app','Overview',LayoutDashboard],['/app/assessments','Assessments',FileCheck2],['/app/results','Results',FileCheck2],['/app/evidence','Evidence',BriefcaseBusiness],['/app/learning','Learning',GraduationCap],['/app/communities','Communities',MessageSquareText],['/app/hackathons','Hackathons',Swords],['/app/profile','Profile',UserRound],['/candidate/requests','Contact requests',Users]] as const;
const employerLinks=[['/hiring/search','Capability search',BriefcaseBusiness],['/hiring/candidates','Candidates',Users],['/hiring/requests','Contact requests',MessageSquareText]] as const;

type EmployerOrganization={employerAccountId:string;organizationName:string;role:string};
type Theme='default'|'redwhite';

export function AppShell({children,role='candidate',theme='default'}:{children:React.ReactNode;role?:'candidate'|'employer';theme?:Theme}){
 const pathname=usePathname(),router=useRouter();
 const[name,setName]=useState('Account'); const[organizations,setOrganizations]=useState<EmployerOrganization[]>([]); const[selectedOrg,setSelectedOrg]=useState(''); const[switchingOrg,setSwitchingOrg]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{try{const res=await fetch('/api/auth/me',{cache:'no-store'});const data=await res.json();const s=data.session;if(!s)router.replace('/login');else if(s.role!==role)router.replace(s.role==='employer'?'/hiring/search':'/app');else if(alive){setName(s.name);if(role==='employer'){setOrganizations(s.employerMemberships||[]);setSelectedOrg(s.employerAccountId||'');}}}catch{router.replace('/login');}})();return()=>{alive=false}},[router,role]);
 const switchOrganization=async(id:string)=>{if(!id||id===selectedOrg)return;setSwitchingOrg(true);try{const res=await fetch('/api/auth/organization',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employer_account_id:id})});if(!res.ok)throw new Error('Unable to switch organization');setSelectedOrg(id);router.refresh();}catch{setSelectedOrg(selectedOrg);}finally{setSwitchingOrg(false)}};
 const logout=async()=>{await fetch('/api/auth/logout',{method:'POST'});router.replace('/login')};
 const links=role==='employer'?employerLinks:candidateLinks;
 const home=role==='employer'?'/hiring/search':'/app';
 const activeOrganization=organizations.find(o=>o.employerAccountId===selectedOrg);
 const redWhite=theme==='redwhite';
 return <div className={redWhite?'patima-redwhite min-h-screen':'min-h-screen bg-[#071019] text-slate-100'}>
   <header className={redWhite?'sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur':'sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 backdrop-blur'}>
     <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
       <div className="flex min-w-0 items-center gap-3">
         <Link href={home} className={redWhite?'flex items-center gap-2 shrink-0':'shrink-0 font-semibold tracking-tight'}>
           {redWhite&&<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-sm font-bold text-white">P</span>}
           <span className={redWhite?'text-lg font-bold tracking-tight text-slate-950':'font-semibold tracking-tight'}>PATIMA</span>
         </Link>
         {redWhite&&<span className="hidden border-l border-slate-200 pl-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 lg:inline">Skills. Proof. Opportunities.</span>}
         {role==='employer'&&organizations.length>1&&<label className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><span className="hidden sm:inline">Organization</span><select value={selectedOrg} disabled={switchingOrg} onChange={e=>switchOrganization(e.target.value)} className={redWhite?'max-w-[240px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none':'max-w-[240px] rounded-md border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none'}><option value="">Select organization</option>{organizations.map(o=><option key={o.employerAccountId} value={o.employerAccountId}>{o.organizationName} · {o.role}</option>)}</select></label>}
       </div>
       <div className={redWhite?'flex shrink-0 items-center gap-3 text-xs text-slate-500':'flex shrink-0 items-center gap-3 text-xs text-slate-400'}>
         <span className={redWhite?'font-medium text-slate-700':''}>{name}</span>
         <button onClick={logout} className="btn-ghost !px-2 !py-1.5"><LogOut className="h-3.5 w-3.5"/>Sign out</button>
       </div>
     </div>
   </header>
   <div className="mx-auto grid max-w-7xl lg:grid-cols-[220px_1fr]">
     <aside className={redWhite?'border-r border-slate-200 p-3 lg:min-h-[calc(100vh-61px)]':'border-r border-white/5 p-3 lg:min-h-[calc(100vh-73px)]'}>
       <nav className="space-y-1">{links.map(([href,label,Icon])=><Link key={href} href={href} className={redWhite?('red-nav-item '+(pathname===href?'red-nav-item-active':'')):('nav-item '+(pathname===href?'nav-item-active':''))}><Icon className="h-4 w-4"/>{label}</Link>)}</nav>
       <div className={redWhite?'mt-4 border-t border-slate-200 pt-4':'mt-4 border-t border-white/5 pt-4'}>
         {role==='candidate'&&<Link href="/settings" className={redWhite?'red-nav-item':'nav-item'}><Settings className="h-4 w-4"/>Settings</Link>}
         {role==='employer'&&<Link href="/app" className={redWhite?'red-nav-item':'nav-item'}><LayoutDashboard className="h-4 w-4"/>Candidate view</Link>}
       </div>
       {redWhite&&role==='candidate'&&<div className="mt-8 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 p-4 text-white shadow-sm"><p className="text-sm font-semibold leading-5">Build better developers.</p><p className="mt-1 text-xs text-red-100">A more open world.</p><div className="mt-4 h-px w-8 bg-white/70"/><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">PATIMA</p></div>}
     </aside>
     <main className={redWhite?'min-w-0 bg-slate-50 p-4 sm:p-6':'min-w-0 p-4 sm:p-6'}>{children}</main>
   </div>
 </div>;
}
