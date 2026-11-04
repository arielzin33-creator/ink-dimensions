# Threat model and trust boundaries

Spec §6.1, §6.6 and §7.5 item 4. Review this document with the platform-readiness report.

## Data flow

```
 issue author (untrusted) ──text──▶ GitHub issue ──▶ factory-triage ── read-only agent ──▶ hand-off comment (bot)
                                                                                         │
 owner ── labels, approvals ─────────────────────────────────────────────────────────────┤
                                                                                         ▼
 factory-implement:  preflight (no agent) ─▶ claim ─▶ implement ── Claude Code ──▶ patch (artifact, hash)
                                                      │  sandbox: no network, writes only the checkout
                                                      │  OIDC ─▶ Anthropic (workload identity federation)
                                                      ▼
                     gates (no credentials) ─▶ verify (read-only agent) ─▶ publish (default-branch scripts)
                                                                               │
                                                                               ▼
                                                                 draft PR ─▶ owner reviews and merges
                                                                               │
 factory-release:  build (signed provenance) ─▶ staging (env) ─▶ production (env, owner approval)
                                                                               │
 production signals ─▶ factory-incident ─▶ issue (untrusted text) ─▶ triage ────┘
```

## Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| Issue text → prompt | Untrusted text | Sanitised and wrapped as data; never interpolated into shell; red-team suite |
| Hand-off → run | Fields only | Accepted only from trusted authors; repeated fields rejected |
| Agent → repository | File edits | Guard hook, sandbox deny-writes, load-bearing policy, diff policy re-run from the base |
| Agent → network | Nothing | Sandbox with no allowed domains; no credentials in the job; guard blocks network tools |
| Agent code → verdict | Exit codes only | `sandbox-exec.sh`: read-only filesystem except the checkout, no network, new PID namespace |
| Job → job | Artifacts | Downloaded by exact name; patch bound by SHA-256 |
| Factory → production | Image digests | Human merge; provenance verified before deploy; owner approval on `production` |
| Production → factory | Alert payloads | Sanitised; become issues, never commands |

## Lethal trifecta by role (spec §6.6)

| Role | Private data | Untrusted input | External communication | Leg removed |
|---|---|---|---|---|
| Triage | issue metadata, code (read) | issue text | templated hand-off via the workflow | the agent writes nothing; the workflow writes fields |
| Implementer | repository code | hand-off, dependencies | none | communication removed (no network, no push) |
| Verifier | repository code, diff | implementer's diff | structured verdict | verdict schema only |
| Release | built image | none from agents | deploy | no agent; human approval |

## Residual risks

- **Regex guards.** The shell guard is regex-based and can be bypassed by indirection. It is defence in depth behind the sandbox and the diff policy.
- **Domain fronting.** Domain fronting past egress controls is acknowledged by the sandbox runtime documentation. This factory allows no domains at all.
- **Content tampering.** A wrong but plausible change or a backdoored dependency leaves control flow intact. Only review, tests, holdouts and provenance catch it.
- **Twin fidelity.** Twin fidelity is unmeasured until the live contract suites run.
- **Unverified profile.** The bubblewrap profile is verified only in CI on Ubuntu runners.
