# Payout Ledger — Mitigation Register

**Read this before reporting any payout anomaly.** Items here have already been
reviewed and deliberately dispositioned by the owner. They are settled. Re-raising
them wastes time and erodes trust in the audit.

Last updated: 2026-10-27 (PT)

---

## Rule 1 — One paid row per billing week is the truth

A payment produces **one** real payout. Confirm it by a transfer reference:
`stripe_transfer_id` starts with `tr_`, or is one of the audit labels
`bank_sweep_*` / `reallocated_oct11_transfers` / `manual_resolution`.

## Rule 2 — Year-span rows are ledger artifacts, not exposure

A row matching **all** of the following is a duplicate artifact from the legacy
pre-harden payout path. It represents **no cash movement** and is **not** exposure:

- `period_start` = `2026-08-17` and `period_end` = `2027-08-16` (the full rental term, not a week)
- `stripe_fee_amount` = `0`
- `uride_platform_fee_amount` = `22.67` (old split; current weeks use 8% = `22`)
- `stripe_transfer_id` = empty
- `net_host_payout` = `260.72`

Do not report the sum of these rows as money owed, double-paid, or at risk.

---

## Settled items

### Booking `6a83a10524dd6c88bc4e5653` — 2015 Toyota Prius (Brhan Elnour Mohamed)

Reviewed 2026-10-27. All weeks paid exactly once; every payout carries its own
transfer. Nothing was paid twice.

| Row (id suffix) | Created | Net | Status | Disposition |
|---|---|---|---|---|
| `8417e7` | 2026-09-30 | 260.72 | voided_duplicate | Voided 2026-10-11 during PnL audit — "year-span duplicate payout" |
| `1509f2` | 2026-10-21 | 260.72 | pending | **Mitigated — Rule 2 artifact.** Covered by the same week's real transfer `tr_1USo0p4Ne884nJhcg20jBR5F` ($253). |
| `e6db02` | 2026-10-28 | 260.72 | pending | **Mitigated — Rule 2 artifact.** Covered by the same week's real transfer `tr_1UVKRx4Ne884nJhcNJFEW0fv` ($253). |

These two pending rows remain `pending` on purpose: they are netted out in
reporting, and changing their status would disturb the reconciled PnL. Both carry
a `notes` stamp pointing here.

**Also settled:** booking-level `host_payout_status` still reads `pending` with an
Aug 30 "insufficient funds" reason. That message was superseded by the successful
transfers from Sep 21 onward and is stale text, not an open failure.

---

## Standing instruction for future audits

1. Check this register first.
2. Before reporting a payout problem, look for a transfer reference for that week.
   No transfer reference + a Rule 2 fingerprint = already settled, say nothing.
3. If a genuine new issue is found, report it **once**, and after the owner
   dispositions it, append it here with date, decision and evidence.

### How to append

```
### Booking <id> — <vehicle> (<renter>)
Reviewed <date>. <one line on what was checked>
| Row | Created | Net | Status | Disposition |
|---|---|---|---|---|
| `<suffix>` | <date> | <net> | <status> | <decision> |
``