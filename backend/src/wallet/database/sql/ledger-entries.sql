-- Ledger transactions for one wallet, joined out to whatever caused each
-- movement — a PSP charge (fund) or a campaign/payout (reserve/settle/expire)
-- — so a read-model can label the row without wallet knowing campaign/payout
-- exist (RFC 0004, Decisão 2: loose reference, not FK).
--
-- `available_delta`/`reserved_delta` are the raw per-account movement of this
-- transaction; the caller derives the display amount per `type` (reserve uses
-- reserved_delta, settle uses -reserved_delta since it also covers the fee
-- leg, fund/expire use available_delta) rather than summing both — the two
-- legs of a transaction don't share a sign convention that survives a naive
-- SUM (e.g. reserve's available(-X)+reserved(+X) cancels to zero).
--
-- `t.reference` is the opaque idempotencyKey the caller passed into
-- reserve/release/settle (`campaign-confirm:<uuid>`, `payout-expire:<uuid>`,
-- `payout-settle:<uuid>`) — parsed here, not re-derived elsewhere, since this
-- query is the one place that needs to cross back into campaign/payout.
--
-- $1 = wallet.account_id (uuid)
SELECT
  t.external_id AS id,
  t.type        AS type,
  t.created_at  AS created_at,
  ch.method     AS charge_method,
  cam.name      AS campaign_name,
  COALESCE(SUM(e.amount) FILTER (WHERE e.account = 'available'), 0)::text AS available_delta,
  COALESCE(SUM(e.amount) FILTER (WHERE e.account = 'reserved'), 0)::text  AS reserved_delta
FROM ledger_transactions t
JOIN wallet w         ON w.id = t.wallet_id
JOIN ledger_entries e ON e.transaction_id = t.id AND e.deleted_at IS NULL
LEFT JOIN charges ch  ON ch.transaction_id = t.id
LEFT JOIN payout p
  ON t.type IN ('settle', 'expire')
  AND p.external_id = split_part(t.reference, ':', 2)::uuid
LEFT JOIN campaigns cam
  ON (t.type = 'reserve' AND cam.external_id = split_part(t.reference, ':', 2)::uuid)
  OR (t.type IN ('settle', 'expire') AND cam.external_id = p.campaign_id)
WHERE w.account_id = $1
  AND t.deleted_at IS NULL
GROUP BY t.id, ch.method, cam.name
ORDER BY t.created_at DESC;
