-- Viewing sessions: a new session starts after a 30+ minute gap.
WITH ordered AS (
    SELECT watched_at,
           (julianday(watched_at) - julianday(LAG(watched_at) OVER (ORDER BY watched_at))) * 24 * 60 AS gap_min
    FROM watches
),
flagged AS (
    SELECT watched_at, SUM(CASE WHEN gap_min IS NULL OR gap_min > 30 THEN 1 ELSE 0 END)
           OVER (ORDER BY watched_at) AS session_id
    FROM ordered
),
sessions AS (
    SELECT session_id, COUNT(*) AS videos FROM flagged GROUP BY session_id
)
SELECT CASE WHEN videos = 1 THEN '1 video' WHEN videos <= 3 THEN '2–3' WHEN videos <= 9 THEN '4–9'
            WHEN videos <= 19 THEN '10–19' ELSE '20+' END AS bucket,
       MIN(videos)       AS sort_key,
       COUNT(*)          AS sessions,
       SUM(videos)       AS videos
FROM sessions
GROUP BY bucket
ORDER BY sort_key;
