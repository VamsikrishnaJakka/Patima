# PATIMA Build Crew

The build crew is a **review/orchestration layer**, not an autonomous production deployer.

## Roles

1. Principal System Architect
2. Full-Stack Builder
3. Evidence & Sandbox Engineer
4. Red Team Security Engineer
5. Lead QA Engineer
6. Release & Performance Engineer

The crew is intentionally sequential. Evidence, security, and QA findings are inputs to release review. A human remains the final approval authority.

## Runtime boundary

PATIMA's in-product Evidence Coach is separate from this build crew. It receives only deterministic assessment telemetry and cannot change assessment outcomes or evidence state.

## Local use

The script expects `GROQ_API_KEY` and CrewAI to be installed in a separate Python environment. Keep CrewAI dependencies out of the Next.js production bundle unless/until the build workflow is deliberately moved into CI.

Example:

```bash
python scripts/crew/orchestrator.py "Evidence Coach integration" "Keep deterministic verification authoritative and make AI feedback downstream only."
```
