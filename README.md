# PATIMA

Evidence-first technical capability platform.

## Repository status

This repository is the implementation source of truth for PATIMA.

The engineering cycle documents describe product requirements, architecture, verification, and release gates. Each completed cycle should also leave behind executable code, tests, migrations, and product artifacts here.

## Current milestone

Cycle 16 — Enterprise Hiring Surface & Evidence-First Sourcing Engine

## Principles

- Capability over claims
- Evidence over scores
- Development over judgment
- Human authority
- No self-approval
- Earned execution
- Calm, inspectable UX
- Near-zero infrastructure cost
- No unnecessary over-engineering

## Planned structure

```text
app/                 Next.js application routes
components/          Shared UI components
lib/                 Domain and application utilities
evidence-engine/     Canonical evidence and capability logic
execution/           Level A / B1 / B2 execution boundaries
db/migrations/       Database migrations
tests/               Unit, integration, E2E, security, and chaos tests
docs/cycles/         Engineering cycle artifacts
screenshots/         Product reality captures
```

## Development

The repository is intentionally being built cycle-by-cycle. A cycle is not complete merely because an engineering report exists; the corresponding implementation, tests, and product-visible behavior must be committed here.
