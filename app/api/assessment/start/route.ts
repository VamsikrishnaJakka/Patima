import {NextResponse} from 'next/server';
import {getAssessment,Seniority} from '@/lib/assessment-catalog';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

const roles=['Data Engineer','Backend Engineer','Distributed Systems Engineer','Platform / DevOps Engineer'];
const seniorities:Seniority[]=['JUNIOR','MID','SENIOR'];

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const role=typeof body.role==='string'?body.role:'';
  const seniority=body.seniority as Seniority;
  const domain=typeof body.domain==='string'?body.domain:'';
  if(!roles.includes(role)||!seniorities.includes(seniority))return NextResponse.json({error:'Invalid assessment context'},{status:400});
  const assessment=getAssessment(domain); if(!assessment)return NextResponse.json({error:'Assessment domain is unavailable'},{status:400});
  const result=await withAuthenticatedClient(async(_,client)=>{
   const node=await client.query(`SELECT id FROM capability_nodes WHERE slug=$1 LIMIT 1`,[assessment.capabilitySlug]);
   if(!node.rows[0])throw new Error('CAPABILITY_NOT_CONFIGURED');
   const inserted=await client.query(`INSERT INTO assessment_sessions(user_id,target_role,seniority,domain_slug,capability_node_id) VALUES($1,$2,$3,$4,$5) RETURNING id`,[session.userId,role,seniority,assessment.slug,node.rows[0].id]);
   return inserted.rows[0].id;
  });
  return NextResponse.json({sessionId:result,assessment:{slug:assessment.slug,title:assessment.title,description:assessment.description,probes:assessment.probes.map(({required,...probe})=>probe)}});
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const status=message==='UNAUTHORIZED'?401:message==='CAPABILITY_NOT_CONFIGURED'?503:500;
  return NextResponse.json({error:status===401?'Unauthorized':status===503?'Assessment capability is not configured':'Unable to start assessment'},{status});
 }
}
