# Notaufnahme-Fluss – data contract

One row per Manchester triage level (1 = sofort … 5 = nicht dringend).

| Column | Required | Meaning |
| --- | --- | --- |
| `triage_level` | yes | 1–5. |
| `waiting` | yes | Patients waiting for the first doctor contact. |
| `longest_wait_min` | no | Longest wait; compared with the MTS target (0/10/30/90/120 min). |
| `target_min` | no | Overrides the MTS target. |
| `in_treatment`, `arrivals` | no | Tooltip. |

A click sets the drilldown field (`triage` by default) to the level.

```spl
index=demo_sakh sourcetype="sakh:ed:tracking" type=status
| head 1
| eval r=mvappend("1;".waiting_t1.";".longest_t1, "2;".waiting_t2.";".longest_t2, "3;".waiting_t3.";".longest_t3, "4;".waiting_t4.";".longest_t4, "5;".waiting_t5.";".longest_t5)
| mvexpand r
| eval f=split(r, ";"), triage_level=mvindex(f, 0), waiting=mvindex(f, 1), longest_wait_min=mvindex(f, 2)
| table triage_level waiting longest_wait_min
```
