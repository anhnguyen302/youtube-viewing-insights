-- When I watch: videos by weekday (0 = Sunday) and local hour.
SELECT CAST(strftime('%w', watched_at) AS INTEGER) AS weekday,
       CAST(strftime('%H', watched_at) AS INTEGER) AS hour,
       COUNT(*)                                    AS videos
FROM watches
GROUP BY weekday, hour;
