import {NextResponse} from 'next/server';
import {destroySession} from '@/lib/server-auth';
export async function POST(){try{await destroySession();return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'Unable to sign out.'},{status:500});}}
