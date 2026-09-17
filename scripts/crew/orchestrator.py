"""PATIMA build-time crew scaffold.

This crew is intentionally advisory. It produces review artifacts; it does not
push code, mutate production data, approve releases, or replace deterministic
verification. Human approval remains the final release gate.
"""

import os
import sys
from crewai import Agent, Crew, LLM, Process, Task


def build_crew():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Set GROQ_API_KEY before running the build crew.")

    llm = LLM(model="groq/llama-3.3-70b-versatile", temperature=0.1)

    architect = Agent(
        role="Principal System Architect",
        goal="Produce the smallest architecture, schema, RLS policy, and API contract that satisfies the feature evidence requirements.",
        backstory="Reject bloat. Preserve Next.js, PostgreSQL, server-session, RLS, and deterministic evidence boundaries.",
        llm=llm,
    )
    builder = Agent(
        role="Full-Stack Builder",
        goal="Implement the approved Next.js App Router, TypeScript, SQL, and UI changes without introducing unnecessary services.",
        backstory="Prefer the existing codebase and the smallest safe change set.",
        llm=llm,
    )
    evidence = Agent(
        role="Evidence & Sandbox Engineer",
        goal="Verify that candidate-controlled execution remains outside the application database and that evidence is reproducible.",
        backstory="AST allowlists and isolated DuckDB are authoritative. Never substitute an LLM for grading.",
        llm=llm,
    )
    security = Agent(
        role="Red Team Security Engineer",
        goal="Attack auth, IDOR, RLS, injection, provenance, and sandbox boundaries and propose concrete patches.",
        backstory="Assume hostile input and fail closed.",
        llm=llm,
    )
    qa = Agent(
        role="Lead QA Engineer",
        goal="Create executable tests for boundaries, concurrency, failure recovery, regression, and real-user flows.",
        backstory="Test what breaks rather than only the happy path.",
        llm=llm,
    )
    release = Agent(
        role="Release & Performance Engineer",
        goal="Check type/build readiness, migration order, package/runtime compatibility, cost, and performance risks.",
        backstory="Keep the release gate explicit and reproducible.",
        llm=llm,
    )

    spec = Task(
        description="Write the minimal architecture specification for: {feature}. Requirements: {requirements}",
        expected_output="Architecture, schema/RLS changes, route contract, evidence contract, risks, and explicit non-goals.",
        agent=architect,
    )
    build = Task(
        description="Review the approved specification and describe the exact implementation and test files required. Do not invent infrastructure.",
        expected_output="A concrete implementation plan with files, interfaces, tests, and rollback notes.",
        agent=builder,
        context=[spec],
    )
    evidence_check = Task(
        description="Audit the implementation plan for deterministic evidence, AST boundaries, isolated execution, provenance, and grading integrity.",
        expected_output="Evidence boundary report with pass/fail findings and required patches.",
        agent=evidence,
        context=[spec, build],
    )
    security_check = Task(
        description="Perform an adversarial security review of the proposed implementation.",
        expected_output="Threats, exploit paths, severity, and concrete mitigations.",
        agent=security,
        context=[build],
    )
    qa_check = Task(
        description="Define executable regression, concurrency, abuse, and failure-injection tests.",
        expected_output="Test plan mapped to acceptance criteria and known failure modes.",
        agent=qa,
        context=[build, evidence_check, security_check],
    )
    release_check = Task(
        description="Assess build/runtime compatibility, dependency cost, migration sequencing, and release readiness. Do not declare production approval.",
        expected_output="Release checklist with blockers, measurements required, and human approval points.",
        agent=release,
        context=[spec, build, evidence_check, security_check, qa_check],
    )

    return Crew(
        agents=[architect, builder, evidence, security, qa, release],
        tasks=[spec, build, evidence_check, security_check, qa_check, release_check],
        process=Process.sequential,
        verbose=True,
    )


if __name__ == "__main__":
    feature = sys.argv[1] if len(sys.argv) > 1 else "Candidate Evidence Coach integration"
    requirements = sys.argv[2] if len(sys.argv) > 2 else "Keep deterministic grading authoritative; runtime AI may only provide downstream coaching."
    result = build_crew().kickoff(inputs={"feature": feature, "requirements": requirements})
    print(result)
