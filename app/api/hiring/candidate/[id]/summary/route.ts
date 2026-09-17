import {NextResponse} from 'next/server';
import {requireEmployer,withAuthenticatedClient} from '@/lib/server-auth';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request:Request,{params}:{params:{id:string}}){
  try{
    const s=await requireEmployer();
    if(!UUID.test(params.id)) return NextResponse.json({error:'Invalid candidate id'},{status:400});
    return await withAuthenticatedClient(async(_,client)=>{
      const r=await client.query(`
        SELECT u.id AS candidate_id,u.handle,cvs.visibility,
               json_agg(json_build_object(
                 'capability_id',cn.id,
                 'slug',cn.slug,
                 'name',cn.name,
                 'state',ucs.state,
                 'verification_tier',latest.verification_tier,
                 'recorded_at',latest.recorded_at
               ) ORDER BY cn.slug) AS capabilities
        FROM user_accounts u
        JOIN candidate_visibility_settings cvs ON cvs.user_id=u.id
        JOIN user_capability_states ucs ON ucs.user_id=u.id
        JOIN capability_nodes cn ON cn.id=ucs.capability_node_id
        LEFT JOIN LATERAL (
          SELECT er.verification_tier,er.recorded_at
          FROM evidence_records er
          WHERE er.user_id=u.id AND er.capability_node_id=cn.id
          ORDER BY er.recorded_at DESC LIMIT 1
        ) latest ON TRUE
        WHERE u.id=$1 AND u.role='candidate'
          AND (
            cvs.visibility='PUBLIC'
            OR (cvs.visibility='APPROVED_EMPLOYERS_ONLY' AND EXISTS(
              SELECT 1 FROM candidate_employer_authorizations cea
              WHERE cea.candidate_user_id=u.id
                AND cea.employer_account_id=$2
                AND cea.revoked_at IS NULL
            ))
          )
        GROUP BY u.id,u.handle,cvs.visibility`,[params.id,s.employerAccountId]);
      if(!r.rows.length) return NextResponse.json({error:'Candidate not found'},{status:404});
      return NextResponse.json(r.rows[0]);
    });
  }catch(e){
    return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized employer session':'Internal server error'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});
  }
}
