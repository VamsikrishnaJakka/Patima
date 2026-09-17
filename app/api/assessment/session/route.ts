import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export async function GET(request:Request){
 try{
  const session=await requireCandidate();
  const id=new URL(request.url).searchParams.get('id');
  if(!id)return NextResponse.json({error:'Session id is required'},{status:400});
  const row=await withAuthenticatedClient(async(s,client)=>{
   const r=await client.query(`SELECT id,target_role,seniority,domain_slug,current_probe,status FROM assessment_sessions WHERE id=$1 AND user_id=$2 LIMIT 1`,[id,s.userId]);
   return r.rows[0];
  });
  if(!row)return NextResponse.json({error:'Assessment session not found'},{status:404});
  const assessment=getAssessment(row.domain_slug); if(!assessment)return NextResponse.json({error:'Assessment domain unavailable'},{status:503});
  return NextResponse.json({session:row,assessment:{slug:assessment.slug,title:assessment.title,description:assessment.description,probes:assessment.probes.map(({required,...probe})=>probe)}});
 }catch(error){
  const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to load assessment session'},{status});
 }
}
