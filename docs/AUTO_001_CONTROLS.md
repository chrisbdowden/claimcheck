# CLAIMCHECK-AUTO-001 controls

Authorization: automation setup, Phase 0–1 import and verification only. Phase 2 HOLD.

- main is the approved baseline; all subsequent changes through reviewed pull requests.
- No auto-merge. CI success is necessary but not sufficient for merge.
- No secrets in source control or GitHub Actions for this phase.
- No network calls to model providers, paid inference, or deployments.
- No real employer/employee/vendor data. Synthetic data only.
- CI validates offline tests once the Phase 0–1 baseline is imported.
- CI does not prove semantic correctness, secret safety, or security on its own.
- The Grok Bot GitHub execution integration remains unverified until a controlled PR proves it.
- Public visibility means all committed source and history can be read by anyone.
