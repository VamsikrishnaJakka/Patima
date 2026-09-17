import {NextResponse} from 'next/server';
import {withAuthenticatedClient,requireCandidate} from '@/lib/server-auth';

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
          LEFT JOIN evidence_records er
            ON er.user_id=ucs.user_id AND er.capability_node_id=ucs.capability_node_id
          WHERE ucs.user_id=$1
          GROUP BY cn.slug,cn.name,ucs.state,ucs.evidence_count,ucs.last_observed_at,ucs.last_demonstrated_at
          ORDER BY cn.name
        `,[s.userId]);
        const completed=await client.query(`SELECT COUNT(*)::int AS completed FROM evidence_records WHERE user_id=$1`,[s.userId]);
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
        return {stats:{demonstrated,developing,completed:Number(completed.rows[0]?.completed||0)},evidence};
      });
    })();
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'UNAUTHORIZED';
    const status=message==='UNAUTHORIZED'?401:500;
    return NextResponse.json({error:status===401?'Unauthorized':'Unable to load candidate overview'},{status});
  }
}
