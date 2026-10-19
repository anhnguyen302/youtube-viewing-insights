-- Headline numbers.
SELECT COUNT(*)                                                    AS videos,
       COUNT(DISTINCT channel)                                     AS channels,
       MIN(date(watched_at))                                       AS first_day,
       MAX(date(watched_at))                                       AS last_day,
       ROUND(COUNT(*) / (julianday(MAX(watched_at)) - julianday(MIN(watched_at))), 1) AS per_day,
       (SELECT value FROM meta WHERE key = 'ads')                  AS ads,
       ROUND(100.0 * COUNT(DISTINCT url) / COUNT(*), 1)            AS unique_pct
FROM watches;
