-- Language of the videos I watch, per quarter (based on the characters in each title).
SELECT strftime('%Y', watched_at) || ' Q' || ((CAST(strftime('%m', watched_at) AS INTEGER) + 2) / 3) AS quarter,
       SUM(language = 'Vietnamese') AS vietnamese,
       SUM(language = 'English')    AS english,
       SUM(language IN ('Korean', 'Japanese')) AS korean_japanese
FROM watches
WHERE language IS NOT NULL
GROUP BY quarter
ORDER BY quarter;
