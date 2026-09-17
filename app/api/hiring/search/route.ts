import {NextResponse} from 'next/server';
import {requireEmployer,withAuthenticatedClient} from '@/lib/server-auth';

export async function POST(request:Request){
 try{
  const s=await requireEmployer(); const b=await request.json();
  const required=Array.isArray(b.required_capability_slugs)?b.required_capability_slugs:[];
  if(!required.length)return NextResponse.json({error:'At least one required capability is required'},{status:400});
  if(required.length>20||required.some((x:any)=>typeof x!=='string'||!/^[a-z0-9._-]+$/.test(x)))return NextResponse.json({error:'Invalid capability requirements'},{status:400});
  const fresh=b.require_fresh!==false;
  const r=await withAuthenticatedClient(async(_,client)=>client.query(`WITH required AS (SELECT id,slug FROM capability_nodes WHERE slug=ANY($1::text[])), matched AS (SELECT ucs.user_id FROM user_capability_states ucs JOIN required r ON r.id=ucs.capability_node_id LEFT JOIN capability_decay_profiles dp ON dp.capability_node_id=ucs.capability_node_id WHERE ucs.state='DEMONSTRATED' AND ($2::boolean=false OR ucs.last_demonstrated_at >= clock_timestamp()-COALESCE(dp.half_life_days,180)*INTERVAL '1 day') GROUP BY ucs.user_id HAVING COUNT(DISTINCT ucs.capability_node_id)=(SELECT COUNT(*) FROM required) AND (SELECT COUNT(*) FROM required)=$3) SELECT u.id candidate_id,u.handle masked_handle,cvs.visibility,json_agg(json_build_object('slug',cn.slug,'name',cn.name,'state',ucs.state,'last_demonstrated_at',ucs.last_demonstrated_at,'evidence_count',ucs.evidence_count,'verification_tier',(SELECT er.verification_tier FROM evidence_records er WHERE er.user_id=u.id AND er.capability_node_id=cn.id ORDER BY er.recorded_at DESC LIMIT 1)) ORDER BY cn.slug) capabilities FROM matched m JOIN user_accounts u ON u.id=m.user_id JOIN candidate_visibility_settings cvs ON cvs.user_id=u.id JOIN user_capability_states ucs ON ucs.user_id=u.id JOIN capability_nodes cn ON cn.id=ucs.capability_node_id WHERE cn.slug=ANY($1::text[]) AND (cvs.visibility='PUBLIC' OR (cvs.visibility='APPROVED_EMPLOYERS_ONLY' AND EXISTS(SELECT 1 FROM candidate_employer_authorizations cea WHERE cea.candidate_user_id=u.id AND cea.employer_account_id=$4::uuid AND cea.revoked_at IS NULL))) GROUP BY u.id,u.handle,cvs.visibility ORDER BY u.handle`,[required,fresh,required.length,s.employerAccountId]));
  return NextResponse.json({match_count:r.rows.length,candidates:r.rows});
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized employer session':'Internal database error executing search'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});}
}
