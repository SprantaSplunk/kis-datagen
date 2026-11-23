# Intensiv-Monitorwand – data contract

One row per occupied ICU bed (latest values).

| Column | Required | Meaning |
| --- | --- | --- |
| `bed` | yes | Bed ID, e.g. `ICU-1-04`. |
| `hr`, `spo2` | yes (or `data_status`) | Heart rate, oxygen saturation. |
| `rr`, `nibp_sys`, `nibp_dia`, `temp_c` | no | Respiratory rate, blood pressure, temperature. |
| `news2` | no | Early warning score; colours the tile (default 5 = beobachten, 7 = kritisch). |
| `ventilated` | no | `true` shows *beatmet*. |
| `data_status` | no | Anything other than `ok` draws a *KEINE DATEN* tile. |
| `trend` | no | Comma-separated HR values, drawn when the ECG animation is off. |

A click sets the drilldown field (`bed` by default).

```spl
index=demo_sakh sourcetype="sakh:pdms:vitals" earliest=-10m
| stats latest(hr) as hr latest(spo2) as spo2 latest(rr) as rr latest(nibp_sys) as nibp_sys latest(nibp_dia) as nibp_dia latest(temp_c) as temp_c latest(news2) as news2 latest(ventilated) as ventilated latest(data_status) as data_status latest(patient_id) as patient_id by bed
```
