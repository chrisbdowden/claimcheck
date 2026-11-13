# Grok Bot engineering task contract — AUTO-001

Status: PREPARED, NOT CONNECTED. A public GitHub repository does not itself enable Grok Bot to execute tasks.

## Authorized
1. Inspect and reconcile the supplied Phase 0–1 ZIP against the seven-phase prompts.
2. Import Phase 0–1 on a dedicated branch, retaining the original baseline and documenting any changes.
3. Run offline tests and policy CSV round-trip checks; report exact outputs.
4. Check tracked files for secrets and real employer/employee data.
5. Prepare a draft PR and a Phase 2 plan. Do not implement Phase 2.
6. For a harmless documentation-only test, demonstrate a PR with CI evidence.

## Required output
Commit SHA, branch, PR, test logs, gaps, limitations, and learning exercises.

## Forbidden without separate approval
Phase 2+, paid model calls, real financial data, deployment, publication of credentials, automatic merges, branch protection changes, external integrations, or spending.

## Retry policy
At most two automatic repair attempts per failing CI job. Then stop and report.
