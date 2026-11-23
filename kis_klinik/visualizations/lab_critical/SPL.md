# Kritische Laborwerte – data contract

One row per critical result. Each test gets a scale: reference range (green), between reference and
alarm limit (amber), beyond the alarm limit (red, square-root compressed so very high values stay
visible). Every result is a dot; a ring marks results not yet delivered to the KIS. The right column
shows the latest result with ward and time.

| Column | Required | Meaning |
| --- | --- | --- |
| `test_code` or `test_name` | yes | Test, e.g. `K`, `NA`, `HB`. One row per test on the scale. |
| `value` | yes | Numeric result. |
| `unit`, `test_name` | no | Label. |
| `ref_low`, `ref_high` | no | Reference range. Known tests fall back to built-in limits. |
| `crit_low`, `crit_high` | no | Alarm limits (dashed red lines). |
| `flag` | no | `HH` or `LL`; decides "zu hoch" / "zu niedrig". |
| `ward`, `_time`, `priority`, `patient_id` | no | Tooltip and latest-result column. |
| `delivery_status` | no | Anything other than `zugestellt` is drawn as a ring and counted as "nicht im KIS". |
| `ack_state` | no | `offen` draws a red halo ("nicht quittiert"); `quittiert` or `unbekannt` do not. Without this column an empty `ack_min` counts as open. |
| `ack_min`, `ack_role`, `escalated` | no | Minutes to acknowledgement, who acknowledged, `1` if escalated. |

A click on a test row sets the drilldown token (`lab_test` by default) to `test_code`; a second click
sets it back to `*`.

```spl
index=demo_sakh ((sourcetype="sakh:lis:result" (flag="HH" OR flag="LL")) OR sourcetype="sakh:lis:critical")
| eval rt=if(sourcetype="sakh:lis:result", _time, null()), acked=if(action="quittiert", minutes, null()), ack_role=if(action="quittiert", role, null()), esc=if(action="eskaliert", 1, null())
| stats min(rt) as _time max(acked) as ack_min first(ack_role) as ack_role max(esc) as escalated first(test_code) as test_code first(value) as value first(unit) as unit first(flag) as flag first(ward) as ward first(delivery_status) as delivery_status by order_id
| where isnotnull(_time) | sort - _time | head 300
```
