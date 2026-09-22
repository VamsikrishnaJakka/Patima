import {NextResponse} from 'next/server';
import {withAuthenticatedClient,requireCandidate} from '@/lib/server-auth';

export const dynamic='force-dynamic';

const domainLabel=(domain:string)=>{
  if(domain==='sql-window-functions')return 'SQL Foundations';
  return domain.replace(/[-_]+/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
};

export async function GET(){
  try{
    const session=await requireCandidate();
    return await withAuthenticatedClient(async(s,client)=>{
      const states=await client.query(`
        SELECT cn.slug,cn.name,ucs.state,ucs.evidence_count,
               ucs.last_observed_at,ucs.last_demonstrated_at,
               COUNT(er.id)::int AS evidence_rows
        FROM user_capability_states ucs
        JOIN capability_nodes cn ON cn.id=ucs.capability_node_id
        LEFT JOIN evidence_records er
          ON er.user_id=ucs.user_id AND er.capability_node_id=ucs.capability_node_id
        WHERE ucs.user_id=$1
        GROUP BY cn.slug,cn.name,ucs.state,ucs.evidence_count,ucs.last_observed_at,ucs.last_demonstrated_at
        ORDER BY cn.name
      `,[s.userId]);

      const completed=await client.query(`
        SELECT COUNT(*)::int AS completed
        FROM assessment_sessions
        WHERE user_id=$1 AND status IN ('VERIFIED','SUBMITTED')
      `,[s.userId]);

      const evidenceCount=await client.query(`
        SELECT COUNT(*)::int AS count
        FROM evidence_records
        WHERE user_id=$1
      `,[s.userId]);

      const active=await client.query(`
        SELECT id,domain,experience_level,current_step,selected_question_count,expires_at,target_role
        FROM assessment_sessions
        WHERE user_id=$1 AND status='IN_PROGRESS' AND expires_at>clock_timestamp()
        ORDER BY started_at DESC LIMIT 1
      `,[s.userId]);

      const telemetry=await client.query(`
        WITH activity_days AS (
          SELECT DISTINCT DATE(l.created_at) AS day
          FROM assessment_adaptive_logs l
          JOIN assessment_sessions ss ON ss.id=l.session_id
          WHERE ss.user_id=$1
          UNION
          SELECT DISTINCT DATE(r.created_at) AS day
          FROM assessment_execution_runs r
          JOIN assessment_sessions ss ON ss.id=r.session_id
          WHERE ss.user_id=$1
          UNION
          SELECT DISTINCT DATE(hc.committed_at) AS day
          FROM hackathon_contributions hc
          WHERE hc.user_id=$1
        ),
        numbered AS (
          SELECT day, day-(ROW_NUMBER() OVER(ORDER BY day))::int AS grp
          FROM activity_days
        ),
        streaks AS (
          SELECT grp,COUNT(*)::int AS length,MAX(day) AS end_day
          FROM numbered
          GROUP BY grp
        )
        SELECT
          (SELECT COUNT(*)::int FROM candidate_contact_intents WHERE candidate_user_id=$1) AS reached_out,
          (SELECT COUNT(DISTINCT arena_id)::int FROM hackathon_participants WHERE user_id=$1) AS hackathons_participated,
          (SELECT COUNT(*)::int
             FROM assessment_execution_runs r
             JOIN assessment_sessions ss ON ss.id=r.session_id
            WHERE ss.user_id=$1) AS verified_runs,
          (SELECT COUNT(*)::int FROM hackathon_contributions WHERE user_id=$1) AS contributions,
          (SELECT COUNT(*)::int FROM evidence_access_events WHERE candidate_user_id=$1) AS evidence_views,
          COALESCE((SELECT MAX(length) FROM streaks),0)::int AS longest_streak,
          COALESCE((SELECT MAX(day) FROM activity_days),NULL) AS latest_activity,
          COALESCE(
            (SELECT array_agg(day ORDER BY day ASC)
               FROM activity_days
              WHERE day>=CURRENT_DATE-13),
            '{}'::date[]
          ) AS activity_days,
          CASE
            WHEN (SELECT MAX(day) FROM activity_days) IS NULL
              OR (SELECT MAX(day) FROM activity_days) < CURRENT_DATE-1
            THEN 0
            ELSE COALESCE(
              (SELECT length FROM streaks WHERE end_day=(SELECT MAX(day) FROM activity_days) LIMIT 1),
              0
            )
          END::int AS current_streak
        FROM (SELECT 1) seed
      `,[s.userId]);

      const recentEvidence=await client.query(`
        SELECT er.id,cn.name AS capability,er.summary,er.verification_tier,er.recorded_at,ucs.state
        FROM evidence_records er
        JOIN capability_nodes cn ON cn.id=er.capability_node_id
        LEFT JOIN user_capability_states ucs
          ON ucs.user_id=er.user_id AND ucs.capability_node_id=er.capability_node_id
        WHERE er.user_id=$1
        ORDER BY er.recorded_at DESC
        LIMIT 6
      `,[s.userId]);

      const recentAssessments=await client.query(`
        SELECT id,domain,experience_level,outcome,submitted_at,updated_at
        FROM assessment_sessions
        WHERE user_id=$1 AND status IN ('VERIFIED','SUBMITTED') AND submitted_at IS NOT NULL
        ORDER BY submitted_at DESC
        LIMIT 6
      `,[s.userId]);

      const recentHackathons=await client.query(`
        SELECT a.id AS arena_id,a.title,a.domain,a.experience_level,a.status,a.scheduled_start,
               p.agreed_at
        FROM hackathon_participants p
        JOIN hackathon_arenas a ON a.id=p.arena_id
        WHERE p.user_id=$1
        ORDER BY COALESCE(p.agreed_at,a.created_at) DESC
        LIMIT 6
      `,[s.userId]);

      const feed=[
        ...recentEvidence.rows.map((r:any)=>({
          id:'evidence:'+r.id,
          kind:'EVIDENCE',
          label:'Verified milestone',
          title:r.capability,
          body:r.summary||'A capability evidence record was added from verified activity.',
          timestamp:r.recorded_at,
          href:'/app/evidence',
          meta:r.verification_tier==='SANDBOX_REPRODUCED'?'Server-verified':'Platform-verified',
          state:r.state||'PROVISIONAL'
        })),
        ...recentAssessments.rows.map((r:any)=>({
          id:'assessment:'+r.id,
          kind:'ASSESSMENT',
          label:'Assessment completed',
          title:domainLabel(r.domain),
          body:r.outcome==='DEMONSTRATED'
            ?'You demonstrated the evaluated skills in this assessment.'
            :r.outcome==='DEVELOPING'
              ?'Assessment recorded. Keep building evidence in this capability.'
              :'Assessment result recorded.',
          timestamp:r.submitted_at||r.updated_at,
          href:'/app/results?sessionId='+encodeURIComponent(r.id),
          meta:String(r.experience_level||'').toLowerCase()+' · '+(r.outcome||'Recorded'),
          state:r.outcome||'RECORDED'
        })),
        ...recentHackathons.rows.map((r:any)=>({
          id:'hackathon:'+r.arena_id,
          kind:'HACKATHON',
          label:'Hackathon activity',
          title:r.title,
          body:'You joined a '+String(r.experience_level||'').toLowerCase()+' PATIMA arena.',
          timestamp:r.agreed_at||r.scheduled_start,
          href:'/app/hackathons',
          meta:r.domain,
          state:r.status||'JOINED'
        }))
      ].sort((a,b)=>new Date(b.timestamp||0).getTime()-new Date(a.timestamp||0).getTime()).slice(0,12);

      const evidence=states.rows.map((x:any)=>({
        id:x.slug+':'+s.userId,
        capability:x.name,state:x.state,
        verification:x.evidence_rows>0?'Evidence recorded':'Inconclusive / Pending',
        observedAt:x.last_observed_at?new Date(x.last_observed_at).toISOString().slice(0,10):null,
        freshness:x.last_demonstrated_at?'Demonstrated':'Developing',
        evidenceCount:Number(x.evidence_count||x.evidence_rows||0),
      }));

      const demonstratedCount=states.rows.filter((x:any)=>x.state==='DEMONSTRATED').length;
      const developingCount=states.rows.filter((x:any)=>x.state==='DEVELOPING').length;
      const t=telemetry.rows[0]||{};
      const a=active.rows[0];

      return NextResponse.json({
        metrics:{
          assessmentsCompleted:Number(completed.rows[0]?.completed||0),
          evidenceRecords:Number(evidenceCount.rows[0]?.count||0),
          demonstratedCount,
          developingCount,
          reachedOut:Number(t.reached_out||0),
          hackathonsParticipated:Number(t.hackathons_participated||0),
          verifiedRuns:Number(t.verified_runs||0),
          contributions:Number(t.contributions||0),
          evidenceViews:Number(t.evidence_views||0),
          currentStreak:Number(t.current_streak||0),
          longestStreak:Number(t.longest_streak||0),
          activityDays:Array.isArray(t.activity_days)?t.activity_days.map((d:any)=>String(d).slice(0,10)):[],
        },
        evidence,
        feed,
        activeAssessment:a?{
          id:a.id,domain:a.domain,experienceLevel:a.experience_level,
          currentStep:Number(a.current_step||1),questionCount:Number(a.selected_question_count||0),
          expiresAt:a.expires_at,targetRole:a.target_role
        }:null
      },{headers:{'Cache-Control':'no-store'}});
    });
  }catch(error){
    const message=error instanceof Error?error.message:'UNAUTHORIZED';
    const status=message==='UNAUTHORIZED'?401:500;
    return NextResponse.json({error:status===401?'Unauthorized':'Unable to load candidate overview'},{status});
  }
}
