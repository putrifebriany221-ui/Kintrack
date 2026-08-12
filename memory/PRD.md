# KINTRACK — Sistem Tracking Kinerja PN Sukadana

## Original Problem Statement
Production-ready web application for an Indonesian court institution (Pengadilan Negeri Sukadana) to manage, calculate, monitor, and report institutional performance indicators. Must be data-driven and configurable — 17 indicators stored as configurable master records, NOT hard-coded. Configurable calculation engine, RBAC, audit trails, formula versioning, approval workflow, and prepared (read-only) SIPP integration.

## Tech Stack (as built)
- Frontend: React (CRA + craco), Tailwind, shadcn/ui, recharts, react-router
- Backend: FastAPI (Python runtime of platform), motor/MongoDB
- Auth: JWT (Bearer token in localStorage) + bcrypt, role-based access control
- NOTE: User's spec asked for no-Python/MariaDB. Platform runtime is fixed to FastAPI+MongoDB; per user decision (option b) data models are relational-style (mirroring the MariaDB table list) to ease a future MySQL/Node port. Collections mirror: users, roles, responsible_officers, reporting_periods, indicators, indicator_categories, indicator_formula_versions, indicator_components (embedded), indicator_responsible_officers, indicator_data, indicator_calculations, survey_questions, data_sources, data_source_mappings, business_rules, audit_logs, system_settings, sipp_processes.

## User Personas / Roles
- super_admin (owner: putrifebriany221@gmail.com) — full access
- admin_operator — manage data & config, reports
- responsible_officer — input data for assigned indicators
- viewer — read-only dashboards/reports

## Core Requirements (static)
- Configurable Indicator Master (create/edit/toggle/delete, no code changes)
- Generic calculation engine: percentage, ratio, composite/weighted, survey, manual/count/score
- Numerator/denominator explicit storage + validation (neg denom rejected, den=0 → N/A)
- Append-only calculation history + formula versioning (new version on formula change)
- Responsible officer master + many-to-many assignments (Primary/Supporting/Verifier/Approver)
- Reporting periods with lock/unlock
- Approval workflow: draft→submitted→verified→approved→locked (role-gated)
- Audit log (LOGIN/CREATE/UPDATE/DELETE/CALCULATE/SUBMIT/VERIFY/APPROVE/LOCK/UNLOCK)
- Dashboard with filters + charts; Reports with print + CSV/PDF export
- SIPP read-only data-source mapping (config only; sync returns 501 until enabled)
- Business rules config (restorative justice, diversi, mediasi) + SKM survey elements

## Implemented (2026-06-12) — MVP COMPLETE
- All 12 modules built and tested (100% backend + frontend pass, iteration_1)
- 17 indicators seeded as configurable records with initial formula version v1
- Full CRUD + calculation + workflow + audit + RBAC verified
- Professional Indonesian government UI (emerald/amber, Plus Jakarta Sans)

## Mocked / Not Enabled
- SIPP MariaDB read-only integration: intentionally not connected (POST /api/sipp/sync → 501). Mapping configuration UI is functional.
- Survey per-question scoring UI: index can be entered manually or via respondents; deep survey-question entry form prepared for future survey-app integration.

## Backlog / Remaining (P1/P2)
- P1: Assign-officer UI directly on indicator detail (assignments API exists; add modal)
- P1: Real per-question survey response entry form for indicator 1.13
- P1: True PDF export (currently uses browser print-to-PDF); Excel is CSV
- P2: SIPP MariaDB live connector + scheduled auto-retrieval
- P2: Supporting document upload (object storage)
- P2: Eligibility rule engine execution against SIPP data
- P2: Split server.py into routers for maintainability

## Test Credentials
See /app/memory/test_credentials.md
