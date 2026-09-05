-- Replace :user_id with the Waypost users.id UUID.
SELECT user_id, balance, created_at, updated_at
FROM public.trip_credit_accounts WHERE user_id = :user_id;

SELECT id, amount, entry_type, trip_version_id, idempotency_key, created_at
FROM public.trip_credit_ledger WHERE user_id = :user_id ORDER BY created_at;

SELECT a.user_id, a.balance, COALESCE(SUM(l.amount), 0) AS ledger_balance
FROM public.trip_credit_accounts a
LEFT JOIN public.trip_credit_ledger l ON l.user_id = a.user_id
WHERE a.user_id = :user_id
GROUP BY a.user_id, a.balance;

-- Do not update balance alone. Future positive grant types must be introduced
-- as an atomic account + ledger domain operation.
