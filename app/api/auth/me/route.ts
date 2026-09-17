import {NextResponse} from 'next/server';
import {getServerSession} from '@/lib/server-auth';
export async function GET(){const s=await getServerSession();return NextResponse.json({authenticated:!!s,session:s?{id:s.id,userId:s.userId,name:s.name,email:s.email,handle:s.handle,role:s.role,employerAccountId:s.employerAccountId,employerMemberships:s.employerMemberships}:null});}
