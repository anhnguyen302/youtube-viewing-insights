-- How often I replay the same video (no titles are published).
WITH per_video AS (
    SELECT url, COUNT(*) AS plays
    FROM watches
    WHERE url IS NOT NULL
    GROUP BY url
)
SELECT CASE WHEN plays = 1 THEN 'Once' WHEN plays <= 4 THEN '2–4×' WHEN plays <= 9 THEN '5–9×'
            WHEN plays <= 19 THEN '10–19×' ELSE '20×+' END AS bucket,
       MIN(plays)  AS sort_key,
       MAX(plays)  AS max_plays,
       COUNT(*)    AS videos,
       SUM(plays)  AS plays
FROM per_video
GROUP BY bucket
ORDER BY sort_key;
