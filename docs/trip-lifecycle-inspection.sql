-- Replace <trip-id> in DBeaver. Lifecycle timestamps belong to Trip;
-- the finalized version remains immutable throughout execution.
SELECT
    t.id,
    t.status,
    t.started_at,
    t.ended_at,
    t.current_version_id,
    v.state AS version_state,
    v.version_no,
    v.finalized_at
FROM trips t
JOIN trip_versions v
  ON v.id = t.current_version_id
WHERE t.id = '<trip-id>';

-- Optional cache and credit invariants for the same Trip.
SELECT
    t.id,
    t.status,
    c.fetched_at,
    c.expires_at,
    a.balance,
    COALESCE(SUM(l.amount), 0) AS ledger_balance
FROM trips t
JOIN trip_versions v ON v.id = t.current_version_id
LEFT JOIN provider_route_cache c ON c.trip_version_id = v.id
JOIN trip_credit_accounts a ON a.user_id = t.user_id
LEFT JOIN trip_credit_ledger l ON l.user_id = t.user_id
WHERE t.id = '<trip-id>'
GROUP BY t.id, t.status, c.fetched_at, c.expires_at, a.balance;
