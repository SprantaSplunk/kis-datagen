# Health Rings – data contract

Either one row per ring (long format) or a single row with one numeric column per ring (wide format, e.g. the output of `stats avg(x) as A avg(y) as B`).

| Column | Required | Meaning |
| --- | --- | --- |
| `name` | yes (long format) | Ring label. |
| `value` | yes (long format) | Number shown in the ring. |
| `unit` | no | Unit shown after the value. |
| `min`, `max` | no | Ring scale per row (default from the options, 0–100). |
| `warn`, `crit` | no | Thresholds per row (default from the options). |
| `better` | no | `higher` or `lower` – which direction is good for this row. |
| `status` | no | `ok`/`warn`/`crit` or words like `running`, `down`. Overrides thresholds. |
| `detail` | no | Extra tooltip line. |
| `key` | no | Drilldown value (default: `name`). |

Click a ring to set the drilldown field (`name` by default).

```spl
index=demo_mes production_rate_per_hour=* earliest=-5m
| stats avg(oee_pct) as value by location
| eval name=upper(substr(location,1,1)).substr(location,2), unit="%", warn=85, crit=70, key=location
| fields name value unit warn crit key
```
