import {NextResponse} from 'next/server';
import {requireEmployer,withAuthenticatedClient} from '@/lib/server-auth';

export async function GET(){
  try{
    const s=await requireEmployer();
    return await withAuthenticatedClient(async(_,client)=>{
      const r=await client.query(`
        SELECT c.id,c.candidate_user_id,c.role_title,c.message_body,c.status,c.created_at,c.expires_at,
               c.responded_at,c.released_email,u.handle
        FROM candidate_contact_intents c
        JOIN user_accounts u ON u.id=c.candidate_user_id AND u.role='candidate'
        WHERE c.employer_account_id=$1
        ORDER BY c.created_at DESC
        LIMIT 100`,[s.employerAccountId]);
      return NextResponse.json({requests:r.rows});
    });
  }catch(e){
    return NextResponse.json(
      {error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized employer session':e instanceof Error&&e.message==='ORGANIZATION_CONTEXT_REQUIRED'?'Select an employer organization before viewing contact requests':'Internal error loading contact requests'},
      {status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:e instanceof Error&&e.message==='ORGANIZATION_CONTEXT_REQUIRED'?409:500},
    );
  }
}
