# Kickoff prompt for Claude Code (Phase 2)

Paste this into Claude Code from an empty project folder that contains this handoff bundle.

---

You are continuing the KHATIB TECHNICAL SOLUTIONS project. Phase 0 (planning) and Phase 1 (UI design) are done. Read, in order:
1. `design_handoff_khatib_platform/docs/DECISIONS.md`
2. `design_handoff_khatib_platform/docs/ARCHITECTURE.md`
3. `design_handoff_khatib_platform/README.md` (screens, tokens, motion, copy)
Open the `.dc.html` files in `designs/` in a browser to see the intended look and behavior.

Working rules from the owner (mandatory):
- Communicate in Arabic; technical terms may be in English.
- Before any significant decision (architecture, cost, security, scope), present options A/B/C with pros, cons, cost and your recommendation, then **wait for the owner's choice**. Items marked **[Proposed]** or **[Verify]** in ARCHITECTURE.md need that step.
- Build phase by phase; do not move on while critical bugs or known vulnerabilities remain.
- Never claim something works without a test or evidence. Always label: tested / implemented-untested / in progress / needs external setup / needs Meta approval / not possible.
- Never commit secrets; only `.env.example` with names. Never print secrets in logs or terminal output.
- No paid services, purchases or paid deployments without explicit approval.
- Do not alter the robot artwork.

Phase 2 scope (Foundation): project setup, Supabase schema + RLS + migrations, client code login + sessions + rate limiting, admin Passkey auth with recovery codes, clients CRUD, access-code generate/revoke, subscriptions (30 days, Asia/Damascus) with renew/pause/end, audit log, and the admin screens (clients list, client detail) + client login screen + welcome screen, matching the designs. Include the security tests listed in ARCHITECTURE.md §9 that apply to this phase. Start by checking the local environment (Node, Git, Supabase CLI, Wrangler) and proposing the folder structure for approval.
