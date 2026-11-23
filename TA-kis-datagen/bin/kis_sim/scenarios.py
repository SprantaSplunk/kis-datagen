"""Scenario catalogue and onset handling.

Each scenario has a lead phase (early warning signals) followed by the impact phase. Effects are
pure functions of the onset time, so backfill and restarts stay consistent.
"""

from .util import clamp

LEAD_SECONDS = 360

# name, label, impact ramp seconds
SCENARIOS = [
    ("flu_surge", "Grippewelle - Patientenansturm in der Notaufnahme", 1200),
    ("blood_shortage", "Blutkonserven-Engpass (0 negativ / A negativ)", 900),
    ("mri_cooling", "MRT-1 Kuehlungsausfall (Kaltkopf / Helium)", 600),
    ("hl7_queue", "Kommunikationsserver - HL7-Stau Labor zum KIS", 300),
    ("kis_db", "KIS-Datenbank - Sperren durch LKF-Export", 300),
    ("network_building_c", "Netzwerkausfall Haus C (Intensiv und Notaufnahme)", 120),
    ("cisco_psirt", "Kritische Cisco Sicherheitsluecke auf Catalyst Switches", 600),
]
NAMES = [s[0] for s in SCENARIOS]
LABEL = {s[0]: s[1] for s in SCENARIOS}
RAMP = {s[0]: s[2] for s in SCENARIOS}


class ScenarioState:
    def __init__(self, flags=None, onset=None):
        self.flags = {n: False for n in NAMES}
        self.onset = {}
        for name, ts in (onset or {}).items():
            if name in RAMP:
                self.onset[name] = float(ts)
        if flags:
            self.flags.update({k: bool(v) for k, v in flags.items() if k in RAMP})
        for name in list(self.onset):
            if not self.flags.get(name):
                del self.onset[name]

    def apply(self, flags, now):
        """Switch scenarios on or off; newly enabled ones start at ``now``."""
        changed = []
        for name in NAMES:
            want = bool(flags.get(name, False))
            if want and name not in self.onset:
                self.onset[name] = float(now)
                changed.append((name, True))
            elif not want and name in self.onset:
                del self.onset[name]
                changed.append((name, False))
            self.flags[name] = want
        return changed

    def elapsed(self, name, ts):
        t0 = self.onset.get(name)
        if t0 is None or ts < t0:
            return None
        return ts - t0

    def lead(self, name, ts):
        e = self.elapsed(name, ts)
        return 0.0 if e is None else clamp(e / LEAD_SECONDS, 0.0, 1.0)

    def impact(self, name, ts):
        e = self.elapsed(name, ts)
        if e is None or e < LEAD_SECONDS:
            return 0.0
        return clamp((e - LEAD_SECONDS) / RAMP[name], 0.0, 1.0)

    def crossed(self, name, delay, ts, window):
        """True once, in the generator tick whose window contains onset + delay."""
        t0 = self.onset.get(name)
        if t0 is None:
            return False
        at = t0 + delay
        return ts - window < at <= ts
