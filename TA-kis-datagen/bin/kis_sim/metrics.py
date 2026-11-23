"""Conversion of numeric time series into Splunk metrics (index demo_sakh_metrics).

Pure performance counters (server, VMware) are written as metrics only. Sources whose events also
carry status texts used by dashboards and scenarios (DB, HL7, ThousandEyes, medical devices, beds,
blood bank, ICU vitals, ED board, eHealth, nursing, Catalyst health) are written twice: the event stays
in demo_sakh and the numeric values go to demo_sakh_metrics.
"""

from . import hospital as H

METRIC_SOURCETYPE = "sakh:metrics"
DIRECT_SOURCETYPE = "sakh:metrics:direct"

# sourcetype -> (metric prefix, dimension fields, measure fields)
SPEC = {
    "sakh:windows:perf": ("sakh.server", ("host", "os", "role", "application"),
                          ("cpu_pct", "mem_pct", "disk_c_free_pct", "disk_d_free_pct", "disk_queue", "net_mbps",
                           "sessions")),
    "sakh:linux:perf": ("sakh.server", ("host", "os", "role", "application"),
                        ("cpu_pct", "iowait_pct", "mem_pct", "load1", "fs_root_used_pct", "fs_var_used_pct",
                         "fs_data_used_pct", "swap_used_pct")),
    "sakh:vmware:perf": ("sakh.vmware", ("esx_host", "cluster", "datastore"),
                         ("vm_count", "cpu_pct", "mem_pct", "datastore_latency_ms", "datastore_used_pct")),
    "sakh:db:performance": ("sakh.db", ("instance", "engine", "host", "application"),
                            ("active_sessions", "avg_query_ms", "tps", "blocked_sessions", "cpu_pct",
                             "buffer_hit_pct", "tablespace_used_pct", "replication_lag_s", "size_gb")),
    "sakh:hl7:engine": ("sakh.hl7", ("channel", "source_system", "target_system", "direction"),
                        ("messages_in", "messages_out", "queue_depth", "avg_latency_ms", "ack_errors")),
    "sakh:thousandeyes:test": ("sakh.te", ("test_name", "agent", "building"),
                               ("loss_pct", "latency_ms", "jitter_ms", "availability_pct", "response_ms")),
    "sakh:kis:beds": ("sakh.beds", ("ward", "department", "building"),
                      ("beds_total", "occupied", "free", "cleaning", "blocked", "isolation", "occupancy_pct")),
    "sakh:bloodbank:inventory": ("sakh.blood", ("product", "blood_group"),
                                 ("units_available", "units_reserved", "units_free", "min_stock", "target_stock",
                                  "expiring_48h", "days_of_supply", "fill_pct")),
    "sakh:pdms:vitals": ("sakh.icu", ("bed", "ward", "department", "building"),
                         ("hr", "spo2", "rr", "nibp_sys", "nibp_dia", "temp_c", "fio2", "peep", "news2")),
    "sakh:ed:tracking": ("sakh.ed", ("department", "building"),
                         ("waiting", "in_treatment", "boarding", "longest_wait_min", "door_to_doc_min",
                          "arrivals_per_hour", "ambulance_bypass")),
    "sakh:ehealth": ("sakh.ehealth", ("service", "service_name"),
                     ("requests", "errors", "error_pct", "avg_response_ms")),
    "sakh:nursing:staffing": ("sakh.nursing", ("ward", "department", "building", "shift"),
                              ("nurses_planned", "nurses_present", "sick_leave", "patients", "patients_per_nurse")),
    "cisco:dnac:devicehealth": ("sakh.network", ("DeviceName", "DeviceFamily", "Role", "Building"),
                                ("HealthScore", "CPUUtilization", "MemoryUtilization", "ClientCount",
                                 "ChannelUtilization", "InterfaceErrors")),
}
METRICS_ONLY = {"sakh:windows:perf", "sakh:linux:perf", "sakh:vmware:perf"}

MEDTECH_PREFIX = {"MRT": "sakh.mri", "CT": "sakh.ct", "LAB": "sakh.lab", "VENT": "sakh.ventilator",
                  "PUMP": "sakh.pump", "MON": "sakh.monitor", "ANES": "sakh.anesthesia", "ROE": "sakh.xray",
                  "US": "sakh.ultrasound", "ANGIO": "sakh.angio"}
MEDTECH_DIMS = ("device_id", "device_type", "manufacturer", "model", "building", "ward", "department")

DIM_ALIAS = {"DeviceName": "device", "DeviceFamily": "device_family", "Role": "role", "Building": "building",
             "esx_host": "host"}
MEASURE_ALIAS = {"HealthScore": "health_score", "CPUUtilization": "cpu_pct", "MemoryUtilization": "mem_pct",
                 "ClientCount": "clients", "ChannelUtilization": "channel_util_pct", "InterfaceErrors": "interface_errors"}


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _dims(data, names):
    out = {}
    for n in names:
        v = data.get(n)
        if v is not None and v != "":
            out[DIM_ALIAS.get(n, n)] = str(v).replace('"', "'")
    return out


def to_metric(sourcetype, data):
    """Returns {dimension: str, ..., "metric_name:<name>": number, ...} or None."""
    if not isinstance(data, dict):
        return None
    if sourcetype == "sakh:medtech:telemetry":
        prefix = MEDTECH_PREFIX.get(data.get("device_type"))
        if not prefix:
            return None
        fields = _dims(data, MEDTECH_DIMS)
        online = data.get("connectivity") == "online"
        fields["metric_name:sakh.medtech.online"] = 1 if online else 0
        fields["metric_name:sakh.medtech.alarm_count"] = data.get("alarm_count", 0)
        skip = set(MEDTECH_DIMS) | {"alarm_count", "last_seen_s"}
        for k, v in data.items():
            if k not in skip and _num(v):
                fields["metric_name:%s.%s" % (prefix, k)] = v
        return fields
    spec = SPEC.get(sourcetype)
    if not spec:
        return None
    prefix, dims, measures = spec
    if sourcetype == "sakh:ed:tracking" and data.get("type") != "status":
        return None
    if sourcetype == "sakh:ehealth" and data.get("type") != "service":
        return None
    if sourcetype == "sakh:pdms:vitals" and data.get("data_status") != "ok":
        return None
    fields = _dims(data, dims)
    if sourcetype in ("sakh:windows:perf", "sakh:linux:perf"):
        s = H.SERVER.get(data.get("host"), {})
        fields["building"] = s.get("building", "")
        fields["os_family"] = s.get("family", "")
    n = 0
    for m in measures:
        v = data.get(m)
        if _num(v):
            fields["metric_name:%s.%s" % (prefix, MEASURE_ALIAS.get(m, m))] = v
            n += 1
    if sourcetype == "cisco:dnac:devicehealth":
        fields["metric_name:sakh.network.reachable"] = 1 if data.get("Reachability") == "Reachable" else 0
        n += 1
    return fields if n else None


def direct_lines(fields):
    """Direct mode: one JSON line per measure ({"metric_name":..,"_value":..,dims}) for the index-time transforms."""
    dims = {k: v for k, v in fields.items() if not k.startswith("metric_name:")}
    for k, v in fields.items():
        if k.startswith("metric_name:"):
            line = {"metric_name": k.split(":", 1)[1], "_value": v}
            line.update(dims)
            yield line
