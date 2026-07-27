-- Per-ledger-account balances for a single customer account.
--
-- Aggregates ledger_entries (the journal, source of truth) so callers can seed
-- Ledger.hydrate without replaying every transaction. Returns at most one row
-- per ledger account ('external' | 'available' | 'reserved' | 'revenue');
-- accounts with no entries are simply absent (balanceOf treats them as 0).
--
-- $1 = account external_id (uuid) — `wallet.account_id` stores it directly
-- (opaque column, `accounts` is owned by `identity` now — RFC 0004, Decisão 2),
-- so no join through `accounts` is needed here.
SELECT
  e.account           AS account,
  SUM(e.amount)::text AS balance
FROM ledger_entries e
JOIN ledger_transactions t ON t.id = e.transaction_id AND t.deleted_at IS NULL
JOIN wallet w              ON w.id = t.wallet_id
WHERE w.account_id = $1
  AND e.deleted_at IS NULL
GROUP BY e.account;
