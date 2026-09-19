// scripts/seed_adaptive_inventory.ts
import crypto from 'crypto';
import { directPool } from '../lib/db';

async function seedInventory() {
  const client = await directPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Configs
    await client.query(`
      INSERT INTO assessment_level_configs (domain, experience_level, total_questions, duration_minutes, min_difficulty, max_difficulty, starting_difficulty)
      VALUES 
        ('sql', 'BEGINNER', 10, 15, 1.0, 4.0, 2.5),
        ('sql', 'INTERMEDIATE', 15, 25, 4.1, 7.0, 5.5),
        ('sql', 'ADVANCED', 20, 40, 7.1, 10.0, 8.5)
      ON CONFLICT (domain, experience_level) DO UPDATE SET
        total_questions = EXCLUDED.total_questions,
        duration_minutes = EXCLUDED.duration_minutes,
        min_difficulty = EXCLUDED.min_difficulty,
        max_difficulty = EXCLUDED.max_difficulty,
        starting_difficulty = EXCLUDED.starting_difficulty;
    `);

    // 2. 20 Distinct Intermediate Families
    const families = [
      { code: 'SQL_RUNNING_SUM', tag: 'WINDOW_FRAME', desc: 'Running totals over time windows' },
      { code: 'SQL_ROLLING_AVG', tag: 'WINDOW_FRAME', desc: '7-day moving averages with frame offsets' },
      { code: 'SQL_INACTIVITY_GAPS', tag: 'GAP_DETECTION', desc: 'Sessionization based on >30 min gap' },
      { code: 'SQL_DENSE_RANK_TIES', tag: 'RANKING', desc: 'Handling ties deterministically with secondary sort' },
      { code: 'SQL_LEAD_LAG_DELTA', tag: 'OFFSET_FUNCTIONS', desc: 'Period-over-period delta calculation' },
      { code: 'SQL_PERCENT_CONT', tag: 'PERCENTILE', desc: 'Continuous percentile distribution' },
      { code: 'SQL_FIRST_LAST_VAL', tag: 'WINDOW_BOUNDARY', desc: 'Extracting boundary values within partitions' },
      { code: 'SQL_CUME_DIST', tag: 'DISTRIBUTION', desc: 'Cumulative distribution calculations' },
      { code: 'SQL_NTILE_BUCKETING', tag: 'BUCKETING', desc: 'Quartile bucketing of high-volume event stream' },
      { code: 'SQL_ROW_NUMBER_DEDUP', tag: 'DEDUPLICATION', desc: 'Selecting most recent record per entity' },
      { code: 'SQL_MULTI_PARTITION', tag: 'PARTITIONING', desc: 'Partitioning by multiple hierarchical keys' },
      { code: 'SQL_CONDITIONAL_SUM', tag: 'CONDITIONAL_AGG', desc: 'Windowed sums filtered by status flags' },
      { code: 'SQL_ISLANDS_AND_GAPS', tag: 'ISLANDS_GAPS', desc: 'Group contiguous streaks of daily active logins' },
      { code: 'SQL_RANGE_BETWEEN_TIME', tag: 'WINDOW_RANGE', desc: 'Dynamic range interval windows' },
      { code: 'SQL_CONCURRENT_EVENTS', tag: 'INTERVAL_OVERLAP', desc: 'Max concurrent active connections' },
      { code: 'SQL_COALESCE_WINDOW', tag: 'FALLBACK_VALUES', desc: 'Forward-filling nulls in time-series' },
      { code: 'SQL_RUNNING_MAX_BOUND', tag: 'MONOTONIC_AGG', desc: 'High-water mark calculation per account' },
      { code: 'SQL_WEIGHTED_MOVING_AVG', tag: 'MATH_AGG', desc: 'Decay-weighted rolling sums' },
      { code: 'SQL_DYNAMIC_RESET_SUM', tag: 'STATE_RESET', desc: 'Running sum that resets upon reaching capacity' },
      { code: 'SQL_CROSS_PARTITION_RATIO', tag: 'TOTAL_RATIO', desc: 'Entity metric as percentage of partition total' },
    ];

    for (const fam of families) {
      const famRes = await client.query(`
        INSERT INTO question_families (domain, family_code, concept_tag, description)
        VALUES ('sql', $1, $2, $3)
        ON CONFLICT (family_code) DO UPDATE SET description = EXCLUDED.description
        RETURNING id;
      `, [fam.code, fam.tag, fam.desc]);
      const familyId = famRes.rows[0].id;

      // 3 Variants per family across 4.2 to 6.9 difficulty
      const variants = [
        { code: 'VAR_A', diff: 4.8, entity: 'customer_orders' },
        { code: 'VAR_B', diff: 5.6, entity: 'iot_telemetry' },
        { code: 'VAR_C', diff: 6.4, entity: 'financial_trades' },
      ];

      for (const v of variants) {
        const ddl = `CREATE TABLE ${v.entity} (id VARCHAR, user_id VARCHAR, event_time TIMESTAMP, val NUMERIC);`;
        const prompt = `Calculate the specified metric over \`${v.entity}\` using deterministic window framing.`;
        const assertions = JSON.stringify([{ name: 'Check count', rule: 'count >= 5' }]);
        const fingerprint = crypto.createHash('sha256').update(fam.code + v.code + ddl).digest('hex');

        await client.query(`
          INSERT INTO question_variants (
            family_id, variant_code, fingerprint, difficulty_score, experience_level,
            prompt_markdown, scenario_entity, fixture_ddl, hidden_assertions
          ) VALUES ($1, $2, $3, $4, 'INTERMEDIATE', $5, $6, $7, $8)
          ON CONFLICT (family_id, variant_code) DO NOTHING;
        `, [familyId, v.code, fingerprint, v.diff, prompt, v.entity, ddl, assertions]);
      }
    }

    await client.query('COMMIT');
    console.log('Successfully seeded 20 families and 60 variants for SQL Intermediate.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed error:', err);
  } finally {
    client.release();
    await directPool.end();
  }
}

seedInventory();

