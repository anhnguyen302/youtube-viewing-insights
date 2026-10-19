-- Videos watched per month and where I was that month.
SELECT strftime('%Y-%m', watched_at) AS month,
       location,
       COUNT(*)                      AS videos
FROM watches
GROUP BY month
ORDER BY month;
