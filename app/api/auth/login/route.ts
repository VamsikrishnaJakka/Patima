import {NextResponse} from 'next/server';
import {establishSession,verifyCredentials} from '@/lib/server-auth';
export async function POST(request:Request){try{const b=await request.json();const u=await verifyCredentials(String(b.email||''),String(b.password||''));if(!u)return NextResponse.json({error:'Invalid email or password.'},{status:401});await establishSession(u.id);return NextResponse.json({user:{id:u.id,name:u.name,email:u.email,handle:u.handle,role:u.role}});}catch{return NextResponse.json({error:'Unable to sign in.'},{status:500});}}
