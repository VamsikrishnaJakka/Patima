import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export const dynamic='force-dynamic';

const skills=[
 {id:'python',name:'Python',domain:'Programming'},
 {id:'sql',name:'SQL',domain:'Data'},
 {id:'java',name:'Java',domain:'Programming'},
 {id:'linux',name:'Linux',domain:'Systems'},
 {id:'git',name:'Git & Version Control',domain:'Engineering'},
 {id:'docker',name:'Docker',domain:'DevOps'},
 {id:'kubernetes',name:'Kubernetes',domain:'DevOps'},
 {id:'terraform',name:'Terraform',domain:'DevOps'},
 {id:'cicd',name:'CI/CD',domain:'DevOps'},
 {id:'spark',name:'Apache Spark / PySpark',domain:'Data Engineering'},
 {id:'kafka',name:'Apache Kafka',domain:'Data Engineering'},
 {id:'airflow',name:'Apache Airflow',domain:'Data Engineering'},
 {id:'snowflake',name:'Snowflake',domain:'Data Engineering'},
 {id:'api-testing',name:'API Testing',domain:'Testing'},
 {id:'selenium',name:'Selenium / Playwright',domain:'Testing'},
 {id:'test-automation',name:'Test Automation',domain:'Testing'},
 {id:'aws',name:'AWS Fundamentals',domain:'Cloud'},
 {id:'observability',name:'Observability',domain:'DevOps'}
];

const paths=[
 {id:'data-engineering',name:'Data Engineering',description:'Build from programming and SQL into Spark, Kafka, orchestration and modern data platforms.',skills:['python','sql','git','linux','docker','spark','kafka','airflow','snowflake']},
 {id:'devops',name:'DevOps Engineering',description:'Build the foundations for Linux, containers, Kubernetes, infrastructure and delivery automation.',skills:['linux','git','docker','kubernetes','terraform','cicd','aws','observability']},
 {id:'software-engineering',name:'Software Engineering',description:'Strengthen a programming language, systems fundamentals, data access, containers and testing.',skills:['python','java','git','sql','linux','docker','test-automation','api-testing']},
 {id:'qa-automation',name:'QA & Test Automation',description:'Move from testing fundamentals into API automation, browser automation and continuous delivery.',skills:['python','java','git','sql','linux','api-testing','selenium','test-automation','cicd']},
 {id:'cloud-engineering',name:'Cloud Engineering',description:'Connect Linux and containers to Kubernetes, infrastructure as code and cloud operations.',skills:['linux','git','docker','kubernetes','terraform','aws','observability']}
];

const directDomain:Record<string,string>={python:'python-concurrency',sql:'sql-window-functions',java:'java.concurrency_memory',linux:'linux.process_signals',docker:'docker.container_internals'};

export async function GET(){
 try{
  const candidate=await requireCandidate();
  return withAuthenticatedClient(async(_,client)=>{
   const assessed=await client.query(`SELECT domain,status FROM assessment_sessions WHERE user_id=$1 AND status IN ('VERIFIED','SUBMITTED')`,[candidate.userId]);
   const states=await client.query(`SELECT cn.slug,ucs.state,ucs.last_demonstrated_at FROM user_capability_states ucs JOIN capability_nodes cn ON cn.id=ucs.capability_node_id WHERE ucs.user_id=$1`,[candidate.userId]);
   const directState:Record<string,string>={};
   for(const row of states.rows){
    const slug=String(row.slug||'');
    if(slug==='python.concurrency.rate_limiter')directState.python=String(row.state||'');
    if(slug==='sql.window_functions')directState.sql=String(row.state||'');
    if(slug==='java.concurrency_memory')directState.java=String(row.state||'');
    if(slug==='linux.process_signals')directState.linux=String(row.state||'');
    if(slug==='docker.container_internals')directState.docker=String(row.state||'');
   }
   const assessedDomains=new Set(assessed.rows.map((r:any)=>String(r.domain||'')));
   const skillProgress=skills.map(skill=>{
     const state=directState[skill.id]||'';
     const assessedFlag=skill.id in directDomain ? assessedDomains.has(directDomain[skill.id]) : false;
     let percent=0,status='NOT_STARTED';
     if(state==='DEMONSTRATED'){percent=100;status='DEMONSTRATED';}
     else if(state==='DEVELOPING'){percent=60;status='DEVELOPING';}
     else if(state==='INTRODUCED'||assessedFlag){percent=30;status='EVALUATED';}
     return {...skill,progress:percent,status};
   });
   const skillMap=Object.fromEntries(skillProgress.map(s=>[s.id,s]));
   const pathProgress=paths.map(path=>{
     const completed=path.skills.reduce((sum,id)=>sum+Number(skillMap[id]?.progress||0),0);
     const percent=path.skills.length?Math.round(completed/path.skills.length):0;
     return {...path,progress:percent};
   });
   return NextResponse.json({skills:skillProgress,paths:pathProgress});
  });
 }catch(error){
  const message=error instanceof Error?error.message:'UNAUTHORIZED';
  return NextResponse.json({error:message==='UNAUTHORIZED'?'Unauthorized':'Unable to load roadmaps'},{status:message==='UNAUTHORIZED'?401:500});
 }
}