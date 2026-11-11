-- Read-only report from pg_stat_statements: heaviest statements and statements returning many rows per call.
-- Constants are already normalized to $n by pg_stat_statements; the text is trimmed to 140 characters.
\echo '== top 20 by total time =='
SELECT calls,
       round(total_exec_time::numeric / 1000, 1) AS total_s,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 20;

\echo '== top 20 by rows per call (more than 5000 rows per call) =='
SELECT calls,
       rows / calls AS rows_per_call,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND calls > 0
  AND rows / calls > 5000
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY rows / calls DESC
LIMIT 20;
