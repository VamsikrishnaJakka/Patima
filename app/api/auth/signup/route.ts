import {NextResponse} from 'next/server';
import {createUser,establishSession} from '@/lib/server-auth';

export async function POST(request:Request){
  try{
    const b=await request.json();
    const name=String(b.name||'').trim();
    const email=String(b.email||'').trim();
    const password=String(b.password||'');

    if(!name||!email||password.length<8){
      return NextResponse.json({error:'Invalid input. Name, email, and minimum 8-character password are required.'},{status:400});
    }

    const u=await createUser(name,email,password);
    await establishSession(u.id);
    return NextResponse.json({user:{id:u.id,name:u.name,email:u.email,handle:u.handle,role:u.role}},{status:201});
  }catch(e:any){
    if(e?.code==='23505'){
      return NextResponse.json({error:'An account already exists for this email.'},{status:409});
    }

    if(e?.message?.includes('DATABASE_NOT_CONFIGURED')||e?.code==='ECONNREFUSED'||e?.code==='ENOTFOUND'||e?.code==='ETIMEDOUT'){
      console.error('[DATABASE_UNAVAILABLE]',e?.message||e);
      return NextResponse.json({error:'Service temporarily unavailable. Please try again shortly.'},{status:503});
    }

    console.error('[SIGNUP_ERROR]',e);
    return NextResponse.json({error:'Registration failed. Please check your details and try again.'},{status:500});
  }
}
