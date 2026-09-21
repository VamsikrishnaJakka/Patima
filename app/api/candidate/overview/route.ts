import {NextResponse}from'next/server';
import {withAuthenticatedClient,requireCandidate}from'@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const data=await (async()=>{
   const session=await requireCandidate();
   return withAuthenticatedClient(async(s,client)=>{
    const states=await client.query(`
      SELECT cn.slug,cn.name,ucs.state,ucs.evidence_count,
             ucs.last_observed_at,ucs.last_demonstrated_at,
             COUNT(er.id)::int AS evidence_rows
      FROM user_capability_states ucs
      JOIN capability_nodes cn ON cn.id=ucs.capability_node_id
      LEFT JOIN evidence_records er ON er.user_id=ucs.user_id AND er.capability_node_id=ucs.capability_node_id
      WHERE ucs.user_id=$1
      GROUP BY cn.slug,cn.name,ucs.state,ucs.evidence_count,ucs.last_observed_at,ucs.last_demonstrated_at
      ORDER BY cn.name
    `,[s.userId]);
    const completed=await client.query(`SELECT COUNT(*)::int AS completed FROM assessment_sessions WHERE user_id=$1 AND status IN ('VERIFIED','SUBMITTED')`,[s.userId]);
    const evidenceCount=await client.query(`SELECT COUNT(*)::int AS count FROM evidence_records WHERE user_id=$1`,[s.userId]);
    const active=await client.query(`
      SELECT id,domain,experience_level,current_step,selected_question_count,expires_at,target_role
      FROM assessment_sessions
      WHERE user_id=$1 AND status='IN_PROGRESS' AND expires_at>clock_timestamp()
      ORDER BY started_at DESC LIMIT 1
    `,[s.userId]);
    const evidence=states.rows.map((x:any)=>({
      id:`${x.slug}:${s.userId}`,capability:x.name,state:x.state,
      verification:x.evidence_rows>0?'Evidence recorded':'Inconclusive / Pending',
      observedAt:x.last_observed_at?new Date(x.last_observed_at).toISOString().slice(0,10):null,
      freshness:x.last_demonstrated_at?'Demonstrated':'Developing',
      evidenceCount:Number(x.evidence_count||x.evidence_rows||0),
    }));
    const demonstratedCount=states.rows.filter((x:any)=>x.state==='DEMONSTRATED').length;
    const developingCount=states.rows.filter((x:any)=>x.state==='DEVELOPING').length;
    const a=active.rows[0];
    return {
      metrics:{assessmentsCompleted:Number(completed.rows[0]?.completed||0),evidenceRecords:Number(evidenceCount.rows[0]?.count||0),demonstratedCount,developingCount},
      evidence,
      activeAssessment:a?{id:a.id,domain:a.domain,experienceLevel:a.experience_level,currentStep:Number(a.current_step||1),questionCount:Number(a.selected_question_count||0),expiresAt:a.expires_at,targetRole:a.target_role}:null
    };
   });
  })();
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const message=error instanceof Error?error.message:'UNAUTHORIZED';
  const status=message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to load candidate overview'},{status});
 }
}
