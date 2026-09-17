import {NextResponse} from 'next/server';
import {withAuthenticatedClient,requireCandidate} from '@/lib/server-auth';

export async function GET(){
  try{
    const session=await requireCandidate();
    const data=await withAuthenticatedClient(session,async(s,client)=>{
      const states=await client.query(`
        SELECT cn.slug,cn.name,ucs.state,ucs.evidence_count,
               ucs.last_observed_at,ucs.last_demonstrated_at,
               COUNT(er.id)::int AS evidence_rows
        FROM user_capability_states ucs
        JOIN capability_nodes cn ON cn.id=ucs.capability_node_id
        LEFT JOIN evidence_records er
          ON er.user_id=ucs.user_id AND er.capability_node_id=ucs.capability_node_id
        WHERE ucs.user_id=$1
        GROUP BY cn.slug,cn.name,ucs.state,ucs.evidence_count,ucs.last_observed_at,ucs.last_demonstrated_at
        ORDER BY cn.name
      `,[s.userId]);
      const results=await client.query(`
        SELECT capability,COUNT(*)::int AS completed
        FROM evidence_records er
        JOIN capability_nodes cn ON cn.id=er.capability_node_id
        WHERE er.user_id=$1
        GROUP BY capability
      `,[s.userId]).catch(()=>({rows:[]}));
      const evidence=states.rows.map((x:any)=>({
        id:`${x.slug}:${s.userId}`,
        capability:x.name,
        state:x.state,
        verification:x.evidence_rows>0?'Evidence recorded':'Not evaluated',
        observedAt:x.last_observed_at?new Date(x.last_observed_at).toISOString().slice(0,10):null,
        freshness:x.last_demonstrated_at?'Observed':'Not evaluated',
        evidenceCount:Number(x.evidence_count||x.evidence_rows||0),
      }));
      const demonstrated=states.rows.filter((x:any)=>x.state==='DEMONSTRATED').length;
      const developing=states.rows.filter((x:any)=>x.state==='DEVELOPING').length;
      const completed=results.rows.reduce((n:number,x:any)=>n+Number(x.completed||0),0);
      return {stats:{demonstrated,developing,completed},evidence};
    });
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'UNAUTHORIZED';
    const status=message==='UNAUTHORIZED'?401:500;
    return NextResponse.json({error:status===401?'Unauthorized':'Unable to load candidate overview'},{status});
  }
}
