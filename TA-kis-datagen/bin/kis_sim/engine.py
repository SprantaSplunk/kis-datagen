"""Simulated clock: runs every generator at its interval, in time order, up to ``now``."""

import heapq
import math

from . import clinical, infra, itsm
from .i18n import translator
from .metrics import METRICS_ONLY, to_metric
from .model import Model
from .scenarios import NAMES, ScenarioState
from .util import Clock

ALL_GENERATORS = clinical.GENERATORS + infra.GENERATORS + itsm.GENERATORS


class Context:
    def __init__(self, seed, clock, scen, model):
        self.seed, self.clock, self.scen, self.m = seed, clock, scen, model
        self.first = {"cisco_iq": True, "cmdb": True, "changes": True}
        self.lis_critical = {}
        self.lis_stuck = {}


class Simulation:
    """
    emit(time, sourcetype, source, host, event) is called for every event (index demo_sakh),
    emit_metric(time, source, host, fields) for every metric data point (index demo_sakh_metrics).
    Without emit_metric, metrics-only sources are emitted as events.
    prime=True runs every slower source once at start_ts, so snapshots (blood stock, beds, ...) exist
    right after a restart instead of only at their next interval; afterwards they stay on their grid.
    """

    def __init__(self, emit, tz="Europe/Vienna", start_ts=None, seed="sakh", scenarios=None, onset=None,
                 logger=None, only=None, emit_metric=None, prime=False, lang="de"):
        self.emit = emit
        self.emit_metric = emit_metric
        self.tr = translator(lang)
        self.logger = logger
        self.clock = Clock(tz)
        self.scen = ScenarioState(scenarios, onset)
        self.ctx = Context(str(seed), self.clock, self.scen, Model(str(seed), self.clock, self.scen))
        self.count = 0
        self.metric_count = 0
        self.by_sourcetype = {}
        start = float(start_ts)
        self.heap = []
        for i, (name, interval, func) in enumerate(ALL_GENERATORS):
            if only and name not in only:
                continue
            first = start if prime and interval > 60 else math.ceil(start / interval) * interval
            heapq.heappush(self.heap, (first, i, name, interval, func))

    @property
    def onset(self):
        return dict(self.scen.onset)

    def set_scenarios(self, flags, now):
        return self.scen.apply(flags, now)

    def next_due(self):
        return self.heap[0][0] if self.heap else float("inf")

    def run_until(self, now):
        while self.heap and self.heap[0][0] <= now:
            ts, i, name, interval, func = heapq.heappop(self.heap)
            try:
                events = func(self.ctx, ts)
            except Exception as e:  # one broken source must not stop the others
                events = []
                if self.logger:
                    self.logger.exception("generator %s failed at %s: %s", name, int(ts), e)
            for t, st, src, host, data in events:
                if isinstance(data, dict):
                    data = {k: v for k, v in data.items() if v is not None}
                t = min(t, now)
                if self.emit_metric is not None:
                    fields = to_metric(st, data)
                    if fields and self.tr:
                        fields = self.tr.value(fields)
                    if fields:
                        self.metric_count += 1
                        key = "metrics:" + st
                        self.by_sourcetype[key] = self.by_sourcetype.get(key, 0) + 1
                        self.emit_metric(t, src, host, fields)
                    if st in METRICS_ONLY:
                        continue
                self.count += 1
                self.by_sourcetype[st] = self.by_sourcetype.get(st, 0) + 1
                if self.tr:
                    src, data = self.tr.text(src), self.tr.value(data)
                self.emit(t, st, src, host, data)
            heapq.heappush(self.heap, ((math.floor(ts / interval) + 1) * interval, i, name, interval, func))


__all__ = ["Simulation", "ALL_GENERATORS", "NAMES"]
