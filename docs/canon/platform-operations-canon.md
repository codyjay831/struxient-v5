# Platform Operations Canon — Struxient v5

> **Status:** **Canon** for platform operator tooling unless explicitly superseded by a dated canon update.  
> **Scope:** Struxient internal platform authority, read-only tenant inspection, and privileged audit — not contractor workspace administration.

## Purpose

The Platform Operations Console allows authorized Struxient operators to inspect contractor organizations and users, view bounded operational summaries, and maintain an append-only record of privileged platform actions. It is **separate** from contractor `Membership` and `StaffRole`.

## Locked decisions

1. **Platform authority is separate from contractor `Membership` and `StaffRole`.**
2. **Platform routes use request-scoped `getPlatformContext()`; contractor `resolveActorContextOrThrow()` is forbidden in platform services/pages.**
3. **Platform access denied by default; grants are explicit rows in `PlatformAccess`.**
4. **Platform access revalidated from DB on every privileged request; never sole authority from JWT claims.**
5. **Development contractor fallback never grants platform access.**
6. **MVP platform console is read-only** (except audit writes and bootstrap grants).
7. **No impersonation, support switching, or contractor workspace shell reuse.**
8. **Tenant inspection is summary-first; no customer/attachment/message browsing.**
9. **`PlatformAuditEvent` is append-only; not `JobActivity` or console logs.**
10. **Sensitive AI payloads hidden by default in platform UI.**
11. **SaaS billing truth remains external until a future billing canon exists.**
12. **`PlatformAccess` is one current-state platform access record per user; durable grant/revoke history lives in `PlatformAuditEvent`.**
13. **Bootstrap attribution is truthful: initial bootstrap uses `PlatformAuditActorType.SYSTEM`, not a false self-grant.**
14. **Unauthenticated platform requests redirect to `/login`; authenticated non-platform and revoked users receive 403 Platform Access Denied.**
15. **Bootstrap access creation and audit creation are atomic; if the audit row fails, no access grant remains.**
16. **Platform audit actor attribution is durable: `actorUserId` uses FK Restrict, and `actorEmailSnapshot` preserves attribution across email changes.**
17. **Future platform mutations require lifecycle enforcement + audit in one transaction.**
18. **Bootstrap is deliberate, auditable, non-runtime; no permanent email allowlist.**

## Authority model

```text
User
├── Membership[]       // contractor tenant authority
└── PlatformAccess?    // one current-state platform access record per user
```

Future platform permissions expand through `PlatformRole` → capability mapping, not multiple `PlatformAccess` rows per user.

## Request boundary

```text
Authenticated identity
        ↓
request-scoped getPlatformContext()
        ↓
active PlatformAccess loaded from DB
        ↓
explicit PlatformContext passed to inspection services
        ↓
explicit target organization IDs
```

## Error behavior

| Condition | Response |
|-----------|----------|
| No session | Redirect `/login` |
| Session, no platform access | 403 Platform Access Denied |
| Revoked platform access | 403 Platform Access Denied |
| Missing target organization | 404 |

## Non-goals (MVP)

Impersonation, support view, user disable, session revoke, org suspend, billing UI, support desk, raw AI payloads, database editing, placeholder mutation buttons.

---

*Canon update (2026-06-14): Initial platform operations canon for read-only console, PlatformAccess lifecycle, audit attribution, and bootstrap rules.*
