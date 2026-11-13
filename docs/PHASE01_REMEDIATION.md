# Phase 0-1 acceptance remediation

This note records corrections made after review of the Phase 0-1 import. It does not implement Phase 2. A control is described as enforced only where this repository has demonstrated it.

## Validation

`Policy.__post_init__` and `Policy.from_frame` now share one check. Amounts must be finite and nonnegative. Blank category names and blank membership names are rejected. CSV loading still strips fields first, rejects unknown settings, duplicate identities, and holidays that are not exact `YYYY-MM-DD` dates. Zero remains valid. The committed file `data/policy.csv` is loaded in the tests and must round-trip to `default_policy()`.

## Money representation for a future Phase 2

Do not change the Phase 0-1 CSV contract. It stores display numbers as floats and exports them with `format(value, "g")`.

Phase 2 should not compare those floats directly. Binary fractions make `0.10 + 0.20` and a "zero cents" test unreliable. `Decimal` is the right parser because it preserves the decimal the claim file actually contained. It is a poor stored type inside pandas, where it falls back to object columns and is easy to mix with float.

Recommended boundary, to be implemented only in Phase 2:

1. Parse each input amount with `Decimal`.
2. Quantize to cents with `ROUND_HALF_UP` before any comparison. The specification says "round amounts to cents" and does not name the tie rule. Half-up matches ordinary claim rounding (`0.005` becomes `0.01`). Fix this rule before writing the Phase 2 tests; do not leave it implicit.
3. Store the quantized result as an integer number of cents. Compare limits, zero cents, and duplicate bands with integers.
4. Convert a policy threshold at load time with the same quantizer. Reject a threshold that is not already an exact cent instead of silently comparing a float artifact.
5. Format exports from the integer, not from the original float.

## Dependencies

`requirements.txt` is the approved declaration: `pandas>=2.2`, `streamlit>=1.40`, `anthropic>=0.40`, `openai>=1.40`, and `pytest>=8.0`. `.python-version` is `3.11`. `requirements.lock` is a pip-tools resolution for CPython 3.11 with hashes. The workflow installs that lock with `--require-hashes` rather than re-resolving the minimums. A clean local install of the lock succeeded on CPython 3.11.2, x86_64, and imported `openai` 3.49.0 and `anthropic` 2.8.0 without calling either API. The Actions log is the CI demonstration.

Importing the SDKs is not a model call. CI still sets `XAI_API_KEY` and `ANTHROPIC_API_KEY` to empty strings.

## Content scan

`scripts/scan_secrets.py` reads tracked file contents and flags credential-shaped strings: long Anthropic and xAI tokens, GitHub token prefixes, AWS access-key IDs, and private-key blocks. The approved placeholders `xai-...` and `sk-ant-...` do not match. The scan does not use a paid service. Locally it reported no credential-shaped content after the remediation files were staged, and the tests show it flags a synthetic long token. The workflow runs the same command. A passing result is evidence about the scanned tree. It is not a merge block, because no branch protection requires this check.

## Actions runtime

The previous workflow used `actions/checkout@v4` and `actions/setup-python@v5`. The run on commit `3bf42a6` warned that both target Node.js 20 and were forced onto Node.js 24. The workflow now uses `actions/checkout@v7` and `actions/setup-python@v7`. Both major tags declare `using: node24`. Whether the separate `punycode` deprecation inside an action disappears can only be seen in the next Actions log.

## Grok GitHub App controls

Measured on 2026-11-12 for installation `181350568`, app `grok-by-xai`, account `chrisbdowden`:

- Repository selection is `selected`. The installation repository list contained only `chrisbdowden/claimcheck`. This was read again during this remediation.
- The granted permissions, read again from the installation on 2026-11-12, are: actions write, administration write, checks read, contents write, discussions write, issues write, metadata read, pull requests write, repository projects write, secret scanning alerts write, security events write, statuses write, vulnerability alerts write, and workflows write.
- Before the installation, creating a branch and a pull request returned `403 Resource not accessible by integration`. After it, draft PR #3 was created. That demonstrates the grant boundary. It does not demonstrate a repository rule.

These protections are not configured, and this change does not configure them:

- Branch protection and rulesets are not enabled. Even if an administrator enabled them later, this installation's administration permission can change or delete those settings. They are therefore not a control against this app unless the grant itself is reduced.
- The content scan and filename check are workflow steps. This installation can edit the workflow. A green check is evidence about one commit. It is not an enforced merge gate.
- GitHub secret scanning and push protection are not enabled by this change. Do not treat them as active.
- CODEOWNERS is not a required review.

What remains outside the app, and is the actual limit:

- The installation can reach only repositories the user selected. Removing `claimcheck`, suspending the app, or uninstalling it is a user action. The app cannot install itself onto another repository.
- GitHub still rejects an API call whose permission was not granted. That rejection was observed before the write grant. It is not a new setting.

No administration setting, credential, or branch protection was changed while writing this note.
