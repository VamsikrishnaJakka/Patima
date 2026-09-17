export type CapabilityState = "DEMONSTRATED" | "DEVELOPING" | "PROVISIONAL" | "NOT_EVALUATED";

export type EvidenceRecord = {
  id: string;
  capability: string;
  state: CapabilityState;
  verification: string;
  observedAt: string;
  context: string;
  artifact: string;
};

export type Candidate = {
  handle: string;
  name: string;
  headline: string;
  location: string;
  capabilities: EvidenceRecord[];
};

export const candidates: Candidate[] = [
  {
    handle: "arjun-mehta",
    name: "Arjun Mehta",
    headline: "Data Engineer",
    location: "Bengaluru, India",
    capabilities: [
      { id: "ev-001", capability: "SQL Window Functions", state: "DEMONSTRATED", verification: "PEER_ATTESTED", observedAt: "2026-09-12", context: "Transfer probe with ranking, deduplication and tie handling", artifact: "session-window.sql" },
      { id: "ev-002", capability: "Python Concurrency", state: "DEMONSTRATED", verification: "SANDBOX_REPRODUCED", observedAt: "2026-09-10", context: "Rate limiter implementation and race-condition probe", artifact: "rate_limiter.py" },
      { id: "ev-003", capability: "AWS Data Engineering", state: "DEVELOPING", verification: "CLIENT_EVALUATED", observedAt: "2026-09-08", context: "ETL and data-lake practical", artifact: "pipeline.py" },
    ],
  },
  {
    handle: "maya-iyer",
    name: "Maya Iyer",
    headline: "Senior Software Engineer",
    location: "Hyderabad, India",
    capabilities: [
      { id: "ev-004", capability: "Python Concurrency", state: "DEMONSTRATED", verification: "PEER_ATTESTED", observedAt: "2026-09-11", context: "Independent transfer challenge", artifact: "worker-pool.py" },
      { id: "ev-005", capability: "System Design", state: "PROVISIONAL", verification: "PEER_ATTESTED", observedAt: "2026-08-30", context: "Architecture decision record and review", artifact: "adr-004.md" },
    ],
  },
];

export const hiringRequirements = [
  "SQL Window Functions",
  "Python Concurrency",
  "AWS Data Engineering",
];

export const demoCandidate = candidates[0];
