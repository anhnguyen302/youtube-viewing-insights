-- Habits in Vietnam (summers) vs. Chicago (school year).
WITH daily AS (
    SELECT location, date(watched_at) AS day, COUNT(*) AS videos
    FROM watches GROUP BY location, day
)
SELECT w.location,
       COUNT(*)                                                         AS videos,
       (SELECT COUNT(*) FROM daily d WHERE d.location = w.location)     AS active_days,
       ROUND(1.0 * COUNT(*) / (SELECT COUNT(*) FROM daily d WHERE d.location = w.location), 1) AS per_active_day,
       ROUND(100.0 * AVG(language = 'Vietnamese'), 1)                   AS vietnamese_pct
FROM watches w
GROUP BY w.location;
