-- Paginated recipients (payouts) for one campaign — same cross-module
-- convention as campaign-stats.sql (payout.campaign_id stores
-- campaigns.external_id, no FK). `total_count` rides along via a window
-- function so the caller gets the page and the total in one round trip.
--
-- $1 = campaigns.external_id (uuid), $2 = limit, $3 = offset
-- `p."recipientName"` is quoted: the column was created camelCase (the
-- entity has no explicit `name:` override on this one field, unlike its
-- siblings), so an unquoted/snake_case reference won't resolve.
SELECT
  p.external_id     AS id,
  p."recipientName" AS name,
  p.channel      AS channel,
  p.amount_cents AS amount_cents,
  p.status       AS status,
  p.paid_at      AS paid_at,
  p.created_at   AS created_at,
  COUNT(*) OVER() AS total_count
FROM payout p
WHERE p.campaign_id = $1
  AND p.deleted_at IS NULL
ORDER BY p.created_at ASC
LIMIT $2 OFFSET $3;
