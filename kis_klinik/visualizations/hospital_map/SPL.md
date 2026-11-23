# Klinik-Lageplan – data contract

One row per ward. Wards are grouped by building (columns) and floor (rows, top floor first).

| Column | Required | Meaning |
| --- | --- | --- |
| `ward` | yes | Ward ID, e.g. `INN-1`. |
| `occupancy_pct` | yes (or `beds_total` + `occupied`) | Occupancy in percent. |
| `building` | no | `A`–`D` (default: first letter of the ward). |
| `floor` | no | Floor number, 0 = ground floor. |
| `department` | no | Department code (default: ward prefix). |
| `beds_total`, `occupied`, `free` | no | Bed counts for tile text and tooltip. `free = 0` always counts as critical. |
| `status` | no | Overrides the threshold colour when it says `critical`. |

A click sets the drilldown field (`dept` by default) to the department, ward or building, depending on the *Klick liefert* option.

```spl
index=demo_sakh sourcetype="sakh:kis:beds"
| stats latest(beds_total) as beds_total latest(occupied) as occupied latest(free) as free latest(occupancy_pct) as occupancy_pct latest(floor) as floor by ward building department
```
