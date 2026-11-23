# OP-Saalplan – data contract

One row per OR case. Times are epoch seconds (or ISO strings).

| Column | Required | Meaning |
| --- | --- | --- |
| `room` | yes | OR room, e.g. `OP-3`. |
| `planned_start`, `planned_end` | yes | Planned slot (outlined bar). |
| `actual_start`, `actual_end` | no | Actual times (filled bar; open end = case running). |
| `case_id`, `procedure`, `department` | no | Label, tooltip and colour per department. |
| `status` | no | `abgesetzt …` draws the slot crossed out. |

A click on the room label (default) or on a case (options *Fall* / *Abteilung*) sets the drilldown field.

```spl
index=demo_sakh sourcetype="sakh:or:case" (type=plan OR type=milestone)
| stats latest(planned_start) as planned_start latest(planned_end) as planned_end min(actual_start) as actual_start max(actual_end) as actual_end latest(status) as status latest(procedure) as procedure latest(department) as department by room case_id
| where planned_start >= relative_time(now(), "@d")
```
