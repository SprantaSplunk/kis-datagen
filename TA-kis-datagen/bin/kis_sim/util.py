"""Deterministic randomness, daily curves and time helpers.

Every value is a function of (seed, name, time bucket), so a restart or a backfill produces the
same curves as a process that ran without interruption.
"""

import hashlib
import math
import random
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    ZoneInfo = None


def rng(*parts):
    digest = hashlib.blake2b("|".join(str(p) for p in parts).encode("utf-8"), digest_size=8).digest()
    return random.Random(int.from_bytes(digest, "big"))


def unit(*parts):
    """Stable pseudo-random number in [0, 1)."""
    digest = hashlib.blake2b("|".join(str(p) for p in parts).encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") / 2 ** 64


def noise(seed, name, ts, period=900):
    """Smooth noise in [-1, 1]: cosine interpolation between per-period random points."""
    k = int(ts // period)
    f = (ts - k * period) / period
    a = unit(seed, name, k) * 2 - 1
    b = unit(seed, name, k + 1) * 2 - 1
    w = (1 - math.cos(f * math.pi)) / 2
    return a * (1 - w) + b * w


def poisson(r, lam):
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, int(round(r.gauss(lam, math.sqrt(lam)))))
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= limit:
            return k
        k += 1


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def weighted(r, pairs):
    total = sum(w for _, w in pairs)
    x = r.random() * total
    for value, w in pairs:
        x -= w
        if x <= 0:
            return value
    return pairs[-1][0]


class Clock:
    """Local wall-clock view of an epoch timestamp (hospital time zone)."""

    def __init__(self, tz_name="Europe/Vienna"):
        self.tz = None
        if ZoneInfo is not None:
            try:
                self.tz = ZoneInfo(tz_name)
            except Exception:
                self.tz = None

    def local(self, ts):
        if self.tz is None:
            return datetime.fromtimestamp(ts, timezone(timedelta(hours=1)))
        return datetime.fromtimestamp(ts, self.tz)

    def hour(self, ts):
        dt = self.local(ts)
        return dt.hour + dt.minute / 60.0 + dt.second / 3600.0

    def weekday(self, ts):
        return self.local(ts).weekday()

    def iso(self, ts):
        return self.local(ts).isoformat(timespec="seconds")

    def date(self, ts):
        return self.local(ts).strftime("%Y-%m-%d")

    def syslog(self, ts):
        return self.local(ts).strftime("%b %d %H:%M:%S")


def bump(h, center, width):
    """Gaussian bump around an hour of the day (wraps at midnight)."""
    d = min(abs(h - center), 24 - abs(h - center))
    return math.exp(-(d * d) / (2 * width * width))


def ed_curve(h):
    """Emergency department arrivals: low at night, peak late morning and early evening."""
    return 0.35 + 0.75 * bump(h, 11.0, 2.8) + 0.65 * bump(h, 18.5, 2.4)


def daytime(h, start=7.0, end=16.0, ramp=1.0):
    """Plateau during working hours with soft edges."""
    if h < start - ramp or h > end + ramp:
        return 0.0
    if h < start:
        return (h - (start - ramp)) / ramp
    if h > end:
        return ((end + ramp) - h) / ramp
    return 1.0


def office(h, wd):
    """Office/clinical routine activity: high on weekdays during the day, low otherwise."""
    base = 0.18 + 0.82 * daytime(h, 7.5, 16.5, 1.5)
    return base * (0.45 if wd >= 5 else 1.0)


def round_to(v, digits=1):
    return round(v, digits)
