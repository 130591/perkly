-- Per-ledger-account balances for a single customer account.
--
-- Aggregates ledger_entries (the journal, source of truth) so callers can seed
-- Ledger.hydrate without replaying every transaction. Returns at most one row
-- per ledger account ('external' | 'available' | 'reserved' | 'revenue');
-- accounts with no entries are simply absent (balanceOf treats them as 0).
--
-- $1 = account external_id (uuid)
SELECT
  e.account           AS account,
  SUM(e.amount)::text AS balance
FROM ledger_entries e
JOIN ledger_transactions t ON t.id = e.transaction_id AND t.deleted_at IS NULL
JOIN wallet w              ON w.id = t.wallet_id
JOIN accounts a            ON a.id = w.account_id
WHERE a.external_id = $1
  AND e.deleted_at IS NULL
GROUP BY e.account;
