// Shared SPL fragments. Index and sourcetype names match TA-kis-datagen exactly.

export const IDX = 'index=demo_sakh';
export const MIDX = 'index=demo_sakh_metrics';
export const ev = (sourcetype, extra = '') => `${IDX} sourcetype="${sourcetype}"${extra ? ` ${extra}` : ''}`;

// ISE / IOS / Windows raw formats (search-time, independent of installed vendor add-ons)
export const IOS_REX = '| rex "^<\\d+>\\d+: (?<device>[^:]+): [^%]+%(?<facility>[A-Z0-9_]+)-(?<severity>\\d)-(?<mnemonic>[A-Z0-9_]+): (?<message_text>.*)"';
export const ISE_REX = '| rex "(?<ise_category>CISE_\\w+)" | rex "NetworkDeviceName=(?<nad>[^,]+)" | rex "EndPointMatchedProfile=(?<profile>[^,]+)" | rex "#SAKH#Haus (?<ise_building>[A-D])" | rex "FailureReason=(?<failure_reason>[^,]+)"';

// one placeholder row when a table search finds nothing, so the panel does not look broken
export const none = (field, text) => `| appendpipe [| stats count | where count=0 | eval ${field}="${text}" | fields - count]`;

// latest value per ward / series from a metrics index
export function mlatest(names, by) {
    return `| mstats latest(_value) as value WHERE ${MIDX} metric_name IN (${names.map((n) => `"${n}"`).join(', ')}) BY metric_name ${by}`;
}

// ring rows for health_rings: name;value;unit;min;max;warn;crit;better;key
export function ringRows(rows) {
    const parts = rows.map(
        ([name, expr, unit, min, max, warn, crit, better, key = '']) =>
            `"${name};".coalesce(tostring(${expr}), "").";${unit};${min};${max};${warn};${crit};${better};${key}"`
    );
    return `| eval r=mvappend(${parts.join(', ')})
| mvexpand r
| eval f=split(r, ";"), name=mvindex(f, 0), value=mvindex(f, 1), unit=mvindex(f, 2), min=mvindex(f, 3), max=mvindex(f, 4), warn=mvindex(f, 5), crit=mvindex(f, 6), better=mvindex(f, 7), key=mvindex(f, 8)
| table name value unit min max warn crit better key`;
}
