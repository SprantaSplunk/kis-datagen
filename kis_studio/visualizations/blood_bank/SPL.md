# Blutdepot – data contract

One row per product and blood group. Rows are products (EK, TK, FFP), columns blood groups (0- … AB+).

| Column | Required | Meaning |
| --- | --- | --- |
| `blood_group` | yes | `0-`, `0+`, `A-`, … |
| `units_available` | yes | Units in stock. |
| `product` | no | `EK`, `TK`, `FFP` (default `EK`). |
| `min_stock` | no | Minimum stock; drawn as dashed line. Below = *niedrig*, below half = *kritisch*. |
| `target_stock` | no | 100 % fill level of the bag (default 2.5 × minimum). |
| `expiring_48h`, `units_reserved`, `days_of_supply` | no | Tooltip and label. |
| `status` | no | `kritisch`/`critical` forces the critical colour. |

A click sets the drilldown field (`blood_group` by default).

```spl
index=demo_sakh sourcetype="sakh:bloodbank:inventory"
| stats latest(units_available) as units_available latest(min_stock) as min_stock latest(target_stock) as target_stock latest(expiring_48h) as expiring_48h latest(units_reserved) as units_reserved latest(days_of_supply) as days_of_supply by product blood_group
```

Metrics variant (index `demo_sakh_metrics`):

```spl
| mstats latest(_value) as v WHERE index=demo_sakh_metrics metric_name IN ("sakh.blood.units_available", "sakh.blood.min_stock", "sakh.blood.target_stock") BY metric_name product blood_group
| eval m=replace(metric_name, "sakh.blood.", ""), key=product."|".blood_group
| xyseries key m v
| eval product=mvindex(split(key, "|"), 0), blood_group=mvindex(split(key, "|"), 1)
| fields - key
```
