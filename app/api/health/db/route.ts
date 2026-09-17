import {NextResponse} from 'next/server';
import {query} from '@/lib/db';

export const dynamic='force-dynamic';

export async function GET(){
  try{
    await query('SELECT 1');
    return NextResponse.json({ok:true});
  }catch(error:any){
    console.error('[DATABASE_HEALTH_FAILED]',error?.message||error);
    return NextResponse.json({ok:false,error:'Database unavailable.'},{status:503});
  }
}
