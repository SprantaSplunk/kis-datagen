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

A click on a test row sets the drilldown token (`lab_test` by default) to `test_code`; a second click
sets it back to `*`.

```spl
index=demo_sakh sourcetype="sakh:lis:result" (flag="HH" OR flag="LL")
| table _time test_code test_name value unit ref_low ref_high crit_low crit_high flag ward priority delivery_status patient_id
| head 300
```
