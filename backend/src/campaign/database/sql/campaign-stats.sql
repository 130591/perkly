-- Campaign list/detail with delivery stats, aggregated across `payout` (owned
-- by the payout module — cross-context join, no FK: `payout.campaign_id`
-- stores `campaigns.external_id` as an opaque uuid, same convention as
-- `wallet.account_id`). `payout` is the source of truth for "how many
-- recipients, how much, what happened to each" once fan-out created the rows;
-- a campaign still in `draft` (pre fan-out) has none yet and rows come back
-- zeroed via the LEFT JOIN.
--
-- `sent` counts every payout ever created for the campaign; `redeemed` is
-- money actually paid out (not just claimed — `paid` is the strongest signal
-- a recipient really got the money); `pending` folds in `processing`/`failed`
-- so every payout is accounted for in exactly one bucket.
--
-- $1 = campaigns.account_id (uuid) — scopes to the caller's tenant.
SELECT
  c.external_id AS id,
  c.name        AS name,
  c.status      AS status,
  c.created_at  AS created_at,
  MAX(b.links_expire_at) AS expires_at,
  COUNT(p.id)                                                              AS sent,
  COUNT(p.id) FILTER (WHERE p.status = 'paid')                             AS redeemed,
  COUNT(p.id) FILTER (WHERE p.status IN ('pending', 'processing', 'failed')) AS pending,
  COUNT(p.id) FILTER (WHERE p.status = 'expired')                          AS expired,
  COALESCE(SUM(p.amount_cents), 0)::text                                   AS total_cents,
  COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status IN ('pending', 'processing', 'failed')), 0)::text AS pending_cents,
  COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status = 'paid'), 0)::text AS paid_cents
FROM campaigns c
LEFT JOIN batches b ON b.campaign_id = c.id
LEFT JOIN payout p  ON p.campaign_id = c.external_id AND p.deleted_at IS NULL
WHERE c.account_id = $1
  AND c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.created_at DESC;
