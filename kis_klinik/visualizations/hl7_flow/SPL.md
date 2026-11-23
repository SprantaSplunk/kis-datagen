# Schnittstellen-Fluss – data contract

One row per interface channel. Every channel is drawn source → communication server → target.

| Column | Required | Meaning |
| --- | --- | --- |
| `source_system`, `target_system` | yes | System names, e.g. `KIS`, `LIS`. |
| `channel` | no | Channel ID (drilldown value). |
| `messages` | no | Messages in the period; sets line width and particle count. |
| `queue_depth` | no | Queue badge. ≥ 50 = Stau, ≥ 200 = gestoppt (options). |
| `avg_latency_ms`, `message_type`, `status` | no | Tooltip; `Stau`/`gestoppt` set the colour. |

A click on a queue badge sets the drilldown field (`channel` by default).

```spl
| mstats sum(_value) as messages WHERE index=demo_sakh_metrics metric_name="sakh.hl7.messages_in" BY channel source_system target_system
| join type=left channel [| mstats latest(_value) as queue_depth WHERE index=demo_sakh_metrics metric_name="sakh.hl7.queue_depth" BY channel]
```
