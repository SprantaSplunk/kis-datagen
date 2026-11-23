# Bildgebung – data contract

One row per large imaging device. MRT rows (helium level present or ID starting with `MR`) draw the
magnet and helium tank, all others a CT gantry with tube load.

| Column | Required | Meaning |
| --- | --- | --- |
| `device_id` | yes | e.g. `MRT-1`, `CT-2`. |
| `helium_level_pct` | MRT | Helium level; below 80 % = Warnung, below 70 % = kritisch (options). |
| `tube_heat_pct` | CT | Tube load; above 70 % = Warnung, above 85 % = kritisch. |
| `status` | no | `Gesperrt`, `Offline`, `Stoerung` force the critical state. |
| `magnet_temp_k`, `shield_temp_k`, `cold_head_status` | no | Footer and tooltip (MRT). `FAULT` = critical, `WARNING` = Warnung. |
| `device_type`, `manufacturer`, `model`, `exams_today` | no | Tooltip. |

A click sets the drilldown field (`device` by default).

```spl
index=demo_sakh sourcetype="sakh:medtech:telemetry" device_type IN ("MRT", "CT")
| stats latest(*) as * by device_id
| table device_id device_type manufacturer model status helium_level_pct magnet_temp_k shield_temp_k cold_head_status tube_heat_pct exams_today
```

Helium trend from the metrics index:

```spl
| mstats avg(_value) as helium WHERE index=demo_sakh_metrics metric_name="sakh.mri.helium_level_pct" BY device_id span=5m
| timechart span=5m avg(helium) by device_id
```
