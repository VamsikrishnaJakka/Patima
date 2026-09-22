import {CloudCog,Code2,Container,Database,FlaskConical,GitBranch,Layers3,Radio,ServerCog,ShieldCheck,TestTube2,Wrench,Workflow,Zap} from 'lucide-react';
import {AppShell} from '@/components/AppShell';

const labs=[
 {name:'Apache Spark / PySpark',category:'Data Engineering',icon:Database,description:'Distributed processing, Spark SQL, joins, partitions and performance.'},
 {name:'Apache Kafka',category:'Data Engineering',icon:Radio,description:'Topics, partitions, consumer groups, offsets and event pipelines.'},
 {name:'Apache Airflow',category:'Data Engineering',icon:Workflow,description:'DAGs, scheduling, retries, sensors and production orchestration.'},
 {name:'Docker',category:'DevOps',icon:Container,description:'Images, containers, networks, volumes and resource limits.'},
 {name:'Kubernetes',category:'DevOps',icon:ServerCog,description:'Pods, deployments, services, config, scaling and debugging.'},
 {name:'Terraform',category:'DevOps',icon:Wrench,description:'Infrastructure as code, state, modules and repeatable environments.'},
 {name:'Linux',category:'Systems',icon:Layers3,description:'Processes, permissions, signals, networking and shell workflows.'},
 {name:'Git & GitHub Actions',category:'Engineering',icon:GitBranch,description:'Branches, pull requests and automated CI workflows.'},
 {name:'API Testing',category:'Testing',icon:TestTube2,description:'Requests, assertions, contracts, environments and failure cases.'},
 {name:'Selenium / Playwright',category:'Testing',icon:ShieldCheck,description:'Browser automation, selectors, waits and reliable end-to-end checks.'},
 {name:'Jenkins',category:'DevOps',icon:Zap,description:'Pipelines, agents, artifacts and continuous delivery.'},
 {name:'Cloud Fundamentals',category:'Cloud',icon:CloudCog,description:'Compute, storage, networking, IAM and deployment patterns.'},
 {name:'Python Runtime Lab',category:'Programming',icon:Code2,description:'Debugging, packaging, concurrency and runtime behavior.'}
];

export default function Sandboxes(){
 return <AppShell>
  <div className="mx-auto max-w-6xl">
   <p className="eyebrow text-red-600">SANDBOX LABS</p>
   <h1 className="mt-2 text-3xl font-semibold text-slate-950">Practice real technologies.</h1>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These are planned hands-on environments for developers, data engineers, DevOps engineers and testers. Every lab is isolated and does not create capability evidence by itself.</p>
   <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {labs.map(l=>{const Icon=l.icon;return <article key={l.name} className="panel relative overflow-hidden p-5">
      <div className="absolute right-4 top-4 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-red-600">Coming soon</div>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50"><Icon className="h-5 w-5 text-red-600"/></div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{l.category}</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">{l.name}</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">{l.description}</p>
      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400"><FlaskConical className="h-3.5 w-3.5"/><span>Isolated practice environment</span></div>
    </article>})}
   </div>
  </div>
 </AppShell>;
}