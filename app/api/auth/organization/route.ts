import {NextResponse} from 'next/server';
import {getServerSession,selectEmployerOrganization} from '@/lib/server-auth';

export async function GET(){
  try{
    const s=await getServerSession();
    if(!s||s.role!=='employer')return NextResponse.json({error:'Unauthorized employer session'},{status:401});
    return NextResponse.json({selected_organization_id:s.employerAccountId,organizations:s.employerMemberships});
  }catch{return NextResponse.json({error:'Unable to resolve organization context'},{status:500});}
}

export async function POST(request:Request){
  try{
    const s=await getServerSession();
    if(!s||s.role!=='employer')return NextResponse.json({error:'Unauthorized employer session'},{status:401});
    const body=await request.json();
    const id=String(body.employer_account_id||'');
    if(!id)return NextResponse.json({error:'employer_account_id is required'},{status:400});
    await selectEmployerOrganization(id);
    return NextResponse.json({selected_organization_id:id});
  }catch(e){
    if(e instanceof Error&&e.message==='FORBIDDEN_ORGANIZATION')return NextResponse.json({error:'You are not a member of that organization'},{status:403});
    if(e instanceof Error&&e.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized employer session'},{status:401});
    return NextResponse.json({error:'Unable to select organization'},{status:500});
  }
}
