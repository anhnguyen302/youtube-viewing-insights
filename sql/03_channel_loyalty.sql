-- How concentrated my viewing is across channels (no channel names are published).
WITH per_channel AS (
    SELECT channel, COUNT(*) AS plays
    FROM watches
    WHERE channel IS NOT NULL
    GROUP BY channel
)
SELECT CASE WHEN plays = 1 THEN '1 play' WHEN plays <= 4 THEN '2–4' WHEN plays <= 19 THEN '5–19'
            WHEN plays <= 99 THEN '20–99' ELSE '100+' END AS bucket,
       MIN(plays)  AS sort_key,
       COUNT(*)    AS channels,
       SUM(plays)  AS plays
FROM per_channel
GROUP BY bucket
ORDER BY sort_key;
