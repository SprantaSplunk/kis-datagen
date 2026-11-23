# Heat Timeline – data contract

Either `timechart` output (`_time` plus one column per series) or long rows with `_time`, `series` and `value`. Columns starting with `_` (such as `_span`) are ignored.

| Column | Required | Meaning |
| --- | --- | --- |
| `_time` | yes | Bucket start (ISO time or epoch seconds). |
| one column per series | yes (wide format) | Numeric value per bucket. |
| `series`, `value` | yes (long format) | Series name and value. |

Options choose a relative colour scale or fixed thresholds, and whether higher values are better. Click a row to set the drilldown field (`series` by default) to the series name.

```spl
index=demo_catalyst sourcetype=catalyst:center:site:health
| rex field=Location "(?<site>[^/]+)$" | eval site=lower(site)
| timechart span=15m avg(healthScore) by site
```
