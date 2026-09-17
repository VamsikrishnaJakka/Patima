# Cycle 16 — Enterprise Hiring Surface & Evidence-First Sourcing

This repository implementation currently contains the Cycle 16 front-end foundation: an evidence-first Hiring Inspector and inspectable candidate dossier view.

## Implemented

- Candidate evidence models
- Capability states: DEMONSTRATED, DEVELOPING, PROVISIONAL, NOT_EVALUATED
- Verification labels
- Required-capability hiring surface
- Evidence search
- Candidate dossier inspection
- Separate evidence records with observation date, context, and artifact
- No hidden candidate match score
- Calm, technical, inspectable UI

## Important boundary

This commit is an executable UI foundation, not a claim that the complete PATIMA backend, Evidence Engine, database, authentication, execution infrastructure, peer-review system, hiring authorization model, and production verification stack have all been implemented. Those components must be added and independently verified in subsequent engineering cycles.

## Source of truth

Engineering reports specify intended behavior. The GitHub repository is the implementation source of truth. A feature is considered implemented only when executable code, tests, security checks, and product-visible behavior are committed and verified.
