# 16. Roadmap and Release Plan

## 1. Release Train

| Release | 목적 | 핵심 범위 | Pillars |
| --- | --- | --- | --- |
| R0 | Foundation | repo, CI/CD, auth skeleton, DB, design system, logging, test framework | P0,P1 |
| R1 | Matter Core | Client, Matter, Party, Matter team, basic permission | P2,P4,P5 |
| R2 | Document Vault MVP | upload, version, metadata, hash, preview skeleton, audit | P3,P4,P5 |
| R3 | Search MVP | metadata/full-text/permission-bound search, indexing, snippets | P6,P4,P5 |
| R4 | Email Vault MVP | email filing, attachment extraction, threading, timeline | P7,P3,P5 |
| R5 | Security & Governance | RBAC/ABAC, ethical wall, DLP, external sharing controls | P4,P5 |
| R6 | AI Knowledge Layer v1 | permission-bound RAG, summaries, citations, AI sessions | P8,P6,P4,P5 |
| R7 | Knowledge Graph v1 | graph schema, mapping, sync, graph query | P9,P3,P8 |
| R8 | Contract Intelligence | clause extraction, redline parser, playbook, rule store | P10,P9,P8 |
| R9 | DD Vault | RFI, data room mapping, DD issue, risk register | P11,P13 |
| R10 | Litigation Vault | evidence, fact ledger, issue tree, pleading management | P12 |
| R11 | External Portal / VDR | external workspace, secure link, watermark, Q&A | P13,P4,P5 |
| R12 | Records Management | retention, legal hold, archive, disposal workflow | P14,P5 |
| R13 | Enterprise Hardening | SSO/SAML, BYOK, SIEM, backup/DR, compliance readiness | P16,P15 |
| R14 | Scale & Optimization | performance, cost, eval, advanced AI, migration tooling | P15,P16 |


## 2. Gate 기준

| Release | Gate |
|---|---|
| R0 | Foundation Completion Gate |
| R1 | Matter Core Gate |
| R2 | Document Vault MVP Gate |
| R3 | Permission-bound Search Gate |
| R4 | Email Vault Gate |
| R5 | Security & Governance Gate |
| R6 | AI Governance Gate |
| R7 | Knowledge Graph Gate |
| R8 | Contract Intelligence Gate |
| R9 | DD Vault Gate |
| R10 | Litigation Vault Gate |
| R11 | External Sharing Critical Gate |
| R12 | Records Governance Gate |
| R13 | Enterprise SaaS Readiness Gate |
| R14 | Scale & Learning Gate |

## 3. 권장 순서

R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9/R10 → R11 → R12 → R13 → R14.

AI는 R6부터 본격 적용합니다. 그 전에는 문서, 권한, 검색, 감사로그 기반을 먼저 완성해야 합니다.

## 4. MVP Definition

MVP는 Matter 중심으로 문서와 이메일을 저장하고, 권한연동 검색 및 Gemma 기반 근거제시 요약을 제공하는 수준으로 정의합니다. 조항은행, DD, 송무, VDR 전체 자동화는 후속 release로 둡니다.
