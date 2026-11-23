# Service-Abhaengigkeiten – data contract

One row per CMDB relation (`cmdb_rel_ci`). Nodes are placed in layers by their class:
business service → database → server / medical device → network.

| Column | Required | Meaning |
| --- | --- | --- |
| `parent`, `child` | yes | CI names. |
| `parent_class`, `child_class` | no | ServiceNow class, decides the layer (`…service…`, `…db…`, `…server…`/`…medical…`, `…net…`). |
| `child_status`, `parent_status` | no | `Operational`, `Non-Operational`, `Unreachable`, `critical`, … |

With *Auswirkungen weitergeben* on, every CI that depends on a failed CI turns *betroffen*.
Hover a node to highlight its whole chain; a click sets the drilldown field (`ci` by default).

```spl
index=demo_sakh sourcetype="snow:cmdb_rel_ci"
| stats latest(parent_class) as parent_class latest(child_class) as child_class by parent child
| join type=left child [search index=demo_sakh sourcetype="cisco:dnac:devicehealth" | stats latest(Reachability) as child_status by DeviceName | rename DeviceName as child]
```
