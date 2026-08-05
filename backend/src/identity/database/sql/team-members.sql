-- Team roster for one tenant: active members (the founding admin counts as
-- "pending" until they set a password) union pending, unexpired invitations.
-- Same-module UNION — both tables belong to identity — done here instead of
-- two round-trips merged/sorted in TS.
--
-- $1 = accounts.id (bigint, internal)
SELECT
  external_id AS id,
  COALESCE(name, split_part(email, '@', 1)) AS name,
  email,
  role,
  CASE WHEN status = 'active' THEN 'active' ELSE 'pending' END AS status,
  created_at
FROM users
WHERE account_id = $1
  AND status IN ('active', 'pending_activation')
  AND deleted_at IS NULL

UNION ALL

SELECT
  external_id AS id,
  split_part(email, '@', 1) AS name,
  email,
  role,
  'pending' AS status,
  created_at
FROM tenant_invitations
WHERE account_id = $1
  AND used_at IS NULL
  AND expires_at > now()
  AND deleted_at IS NULL

ORDER BY created_at ASC;
