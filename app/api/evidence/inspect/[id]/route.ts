import {NextResponse} from 'next/server';
import {runtimePool} from '@/lib/db';

export const dynamic='force-dynamic';

const TOKEN=/^[a-f0-9]{48}$/;

const LEVELS=['LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE'] as const;
type Level=typeof LEVELS[number];

export async function GET(request:Request,{params}:{params:{id:string}}){
 const token=params.id;
 if(!TOKEN.test(token))return NextResponse.json({error:'Evidence inspection link not found'},{status:404});
 const url=new URL(request.url);
 const level=(url.searchParams.get('disclosure_level')||'LEVEL_1_SUMMARY') as Level;
 if(!LEVELS.includes(level))return NextResponse.json({error:'Invalid disclosure level'},{status:400});

 const client=await runtimePool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT set_config($1,$2,true)',['app.current_user_id','']);
  await client.query('SELECT set_config($1,$2,true)',['app.current_employer_account_id','']);
  await client.query('SELECT set_config($1,$2,true)',['app.public_share_token',token]);
  const result=await client.query(
   `SELECT token,capability_slug,capability_name,state,verification_tier,summary,context,
           artifact_code,test_trace,artifact_sha256,merkle_root,attestation_signature,recorded_at
      FROM public_evidence_shares
     WHERE token=$1 AND revoked_at IS NULL
     LIMIT 1`,
   [token]
  );
  await client.query('COMMIT');
  if(!result.rows.length)return NextResponse.json({error:'Evidence inspection link not found or revoked'},{status:404});
  const raw=result.rows[0];
  const evidence:any={
   capabilitySlug:raw.capability_slug,
   capabilityName:raw.capability_name,
   state:raw.state,
   verificationTier:raw.verification_tier,
   summary:raw.summary,
   recordedAt:raw.recorded_at
  };
  if(level==='LEVEL_2_CONTEXT'||level==='LEVEL_3_CODE')evidence.context=raw.context;
  if(level==='LEVEL_3_CODE'){
   evidence.artifactCode=raw.artifact_code;
   evidence.testTrace=raw.test_trace||[];
   evidence.artifactSha256=raw.artifact_sha256;
   evidence.merkleRoot=raw.merkle_root;
   evidence.attestationSignature=raw.attestation_signature;
  }
  return NextResponse.json({disclosureLevel:level,evidence},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  try{await client.query('ROLLBACK');}catch{}
  return NextResponse.json({error:'Unable to inspect evidence'},{status:500});
 }finally{client.release();}
}
