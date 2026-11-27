"""
Modular input "kis_datagen" - Splunk Allgemeines Krankenhaus (SAKH): KIS, medical devices and
IT infrastructure demo data.

Long-running input: one process runs the simulated clock continuously and streams events via HEC
(or directly into the index). Disabling the input stops the process; `interval` only tells splunkd
to restart it if it ever dies. Progress is checkpointed every minute, so after a restart short gaps
are filled and the optional backfill runs only once.
"""

import fcntl
import json
import os
import signal
import time

import import_declare_test  # noqa: F401
from solnlib import conf_manager, log
from solnlib.modular_input import checkpointer
from splunklib import modularinput as smi

from kis_hec import HecClient, HecError
from kis_sim.engine import Simulation
from kis_sim.i18n import LANGUAGES
from kis_sim.metrics import DIRECT_SOURCETYPE, METRIC_SOURCETYPE, direct_lines
from kis_sim.scenarios import NAMES as SCENARIOS

ADDON_NAME = "TA-kis-datagen"
SETTINGS_CONF = "ta_kis_datagen_settings"
SETUP_STANZA = "hec_setup"
CHECKPOINT_COLLECTION = "ta_kis_datagen_checkpointer"
DEFAULT_INDEX = "demo_sakh"
DEFAULT_METRICS_INDEX = "demo_sakh_metrics"

CHECKPOINT_EVERY_SEC = 60
FLUSH_EVERY_SEC = 2
WATCHDOG_EVERY_SEC = 10

_stop = {"flag": False}


def _on_term(signum, frame):
    _stop["flag"] = True


def _int(value, default):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def get_setup(session_key):
    cfm = conf_manager.ConfManager(
        session_key, ADDON_NAME,
        realm="__REST_CREDENTIAL__#%s#configs/conf-%s" % (ADDON_NAME, SETTINGS_CONF))
    try:
        return cfm.get_conf(SETTINGS_CONF).get(SETUP_STANZA) or {}
    except Exception:
        return {}


class CheckpointStore:
    """Last generated second + scenario onsets in the KV store and a local file; the newer wins."""

    def __init__(self, key, session_key, checkpoint_dir, logger):
        self.key, self.logger = key, logger
        self.file = checkpointer.FileCheckpointer(checkpoint_dir)
        try:
            self.kv = checkpointer.KVStoreCheckpointer(CHECKPOINT_COLLECTION, session_key, ADDON_NAME)
        except Exception as e:
            logger.warning("KV store unavailable, using file checkpoint only: %s", e)
            self.kv = None

    def load(self):
        candidates = [self.file.get(self.key) or {}]
        if self.kv is not None:
            try:
                candidates.append(self.kv.get(self.key) or {})
            except Exception as e:
                self.logger.warning("KV store read failed, using file checkpoint: %s", e)
                self.kv = None
        return max(candidates, key=lambda c: c.get("last_ts") or 0)

    def save(self, data):
        self.file.update(self.key, data)
        if self.kv is not None:
            try:
                self.kv.update(self.key, data)
            except Exception as e:
                self.logger.warning("KV store write failed (file checkpoint kept): %s", e)
                self.kv = None


class Watchdog:
    """
    splunkd starts the input through `/bin/sh -c python ...` and, on disable, kills the shell - the
    python child would survive as an orphan and keep sending. So every few seconds we check that the
    parent is still alive and that the input is still enabled, and pick up scenario switches.
    """

    def __init__(self, name, session_key, logger):
        self.name, self.session_key, self.logger = name, session_key, logger
        self.ppid = os.getppid()
        self.last = time.time()
        self.stanza = None

    def should_stop(self):
        now = time.time()
        if now - self.last < WATCHDOG_EVERY_SEC:
            return False
        self.last = now
        if os.getppid() != self.ppid:
            self.logger.info("Parent process gone (input disabled or splunkd restarting) - stopping")
            return True
        try:
            cfm = conf_manager.ConfManager(self.session_key, ADDON_NAME)
            stanza = cfm.get_conf("inputs").get("kis_datagen://" + self.name)
            self.stanza = stanza
            if str(stanza.get("disabled", "0")).lower() in ("1", "true"):
                self.logger.info("Input disabled - stopping")
                return True
        except Exception as e:
            if "not exist" in str(e).lower() or "404" in str(e):
                self.logger.info("Input deleted - stopping")
                return True
            self.logger.debug("watchdog check skipped: %s", e)
        return False


def acquire_lock(checkpoint_dir, name, logger, wait_sec=30):
    """One generator process per input - a second instance waits, then gives up."""
    path = os.path.join(checkpoint_dir, "kis_datagen_%s.lock" % name)
    os.makedirs(checkpoint_dir, exist_ok=True)
    fh = open(path, "w")
    deadline = time.time() + wait_sec
    while True:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fh
        except OSError:
            if time.time() > deadline or _stop["flag"]:
                logger.warning("Another KIS datagen process for '%s' is still running - exiting", name)
                fh.close()
                return None
            time.sleep(1)


def scenario_flags(item):
    """Input fields scenario_<name> -> {name: bool}. Missing fields = off."""
    return {name: str(item.get("scenario_" + name, "0")).strip().lower() in ("1", "true", "yes", "on")
            for name in SCENARIOS}


def describe(flags):
    if isinstance(flags, dict):
        flags = flags.items()
    return ", ".join("%s=%s" % (n, "on" if on else "off") for n, on in sorted(flags))


def logger_for_input(name):
    return log.Logs().get_logger("%s_kis_datagen_%s" % (ADDON_NAME.lower(), name))


def validate_input(definition: smi.ValidationDefinition):
    p = definition.parameters
    if (p.get("language") or "de") not in LANGUAGES:
        raise ValueError("Language must be de or en.")
    if not 0 <= _int(p.get("backfill_minutes"), 0) <= 10080:
        raise ValueError("Backfill must be between 0 and 10080 minutes (7 days).")
    for key, default in (("index", DEFAULT_INDEX), ("metrics_index", DEFAULT_METRICS_INDEX)):
        index = (p.get(key) or default).strip()
        if not index or not index.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Index name may only contain letters, digits, _ and -.")


def targets(item):
    """Returns (language, index, metrics_index, remapped). English inputs left on the German default
    indexes write to demo_sakh_en / demo_sakh_en_metrics so both languages can run side by side."""
    lang = (item.get("language") or "de").strip().lower()
    if lang not in LANGUAGES:
        lang = "de"
    index = (item.get("index") or DEFAULT_INDEX).strip()
    metrics_index = (item.get("metrics_index") or DEFAULT_METRICS_INDEX).strip()
    remapped = lang == "en" and (index, metrics_index) == (DEFAULT_INDEX, DEFAULT_METRICS_INDEX)
    if remapped:
        index, metrics_index = DEFAULT_INDEX + "_en", DEFAULT_INDEX + "_en_metrics"
    return lang, index, metrics_index, remapped


def make_output(mode, setup, index, metrics_index, event_writer, logger):
    """Returns (emit(time, sourcetype, source, host, event), emit_metric(time, source, host, fields), flush())."""
    if mode == "hec":
        hec = HecClient(setup["hec_url"], setup["hec_token"],
                        batch_size=_int(setup.get("hec_batch_size"), 500), logger=logger,
                        verify=str(setup.get("hec_verify_ssl", "1")).lower() not in ("0", "false", "no"))

        def emit(t, st, src, host, data):
            hec.add({"time": round(t, 3), "host": host, "source": src, "sourcetype": st,
                     "index": index, "event": data})

        def emit_metric(t, src, host, fields):
            hec.add({"time": round(t, 3), "host": host, "source": src, "sourcetype": METRIC_SOURCETYPE,
                     "index": metrics_index, "event": "metric", "fields": fields})
        return emit, emit_metric, hec.flush

    def emit(t, st, src, host, data):
        raw = data if isinstance(data, str) else json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        event_writer.write_event(smi.Event(data=raw, time="%.3f" % t, index=index, host=host,
                                           source=src, sourcetype=st))

    def emit_metric(t, src, host, fields):
        # Direct mode: one JSON line per measure, turned into metric data points by the
        # index-time transforms of sakh:metrics:direct (props.conf / transforms.conf)
        for line in direct_lines(fields):
            event_writer.write_event(smi.Event(
                data=json.dumps(line, separators=(",", ":"), ensure_ascii=False), time="%.3f" % t,
                index=metrics_index, host=host, source=src, sourcetype=DIRECT_SOURCETYPE))
    return emit, emit_metric, (lambda: None)


def run(name, item, session_key, event_writer, logger, checkpoint_dir):
    setup = get_setup(session_key)
    mode = setup.get("send_mode") or "hec"
    if mode == "hec" and not (setup.get("hec_url") and setup.get("hec_token")):
        logger.error("HEC is not configured. Open the add-on > Setup > HEC Setup.")
        return

    tz_name = item.get("timezone") or "Europe/Vienna"
    lang, index, metrics_index, remapped = targets(item)
    if remapped:
        logger.info("language=en with the default indexes - writing to %s / %s", index, metrics_index)
    seed = item.get("seed") or "sakh"
    backfill = _int(item.get("backfill_minutes"), 0) * 60
    max_gap = _int(item.get("max_gap_minutes"), 15) * 60

    ckpt = CheckpointStore("kis_datagen_" + name, session_key, checkpoint_dir, logger)
    cp = ckpt.load()
    now = time.time()
    last = cp.get("last_ts")
    if last is None:
        start = now - backfill
        if backfill:
            logger.info("First start: backfilling %s minutes into index %s", backfill // 60, index)
    elif now - last <= max_gap:
        start = last
    else:
        logger.info("Input was stopped for %s min (> %s) - resuming at now", int(now - last) // 60, max_gap // 60)
        start = now

    emit, emit_metric, flush = make_output(mode, setup, index, metrics_index, event_writer, logger)
    flags = scenario_flags(item)
    onset = cp.get("scenario_onset") or {}
    sim = Simulation(emit, tz_name, start_ts=start, seed=seed, scenarios=flags, onset=onset, logger=logger,
                     emit_metric=emit_metric, prime=start == now, lang=lang)
    started = sim.set_scenarios(flags, now)
    logger.info("KIS datagen started (mode=%s, language=%s, index=%s, metrics_index=%s, tz=%s, start=%s, scenarios: %s)",
                mode, lang, index, metrics_index, tz_name, int(start), describe(flags))
    if started:
        logger.info("Scenarios switched at start: %s", describe(started))

    watchdog = Watchdog(name, session_key, logger)
    last_flush = last_ckpt = time.time()
    reported = 0
    while not _stop["flag"]:
        if watchdog.should_stop():
            break
        if watchdog.stanza is not None:
            changed = sim.set_scenarios(scenario_flags(watchdog.stanza), time.time())
            watchdog.stanza = None
            if changed:
                logger.info("Scenarios changed: %s", describe(changed))
        now = time.time()
        sim.run_until(now)
        if now - last_flush >= FLUSH_EVERY_SEC:
            flush()
            last_flush = now
        if now - last_ckpt >= CHECKPOINT_EVERY_SEC:
            flush()
            ckpt.save({"last_ts": now, "scenario_onset": sim.onset})
            log.events_ingested(logger, "kis_datagen://" + name, "sakh:*", sim.count - reported, index)
            reported = sim.count
            logger.info("metric data points so far: %s (index %s)", sim.metric_count, metrics_index)
            last_ckpt = now
        time.sleep(max(0.1, min(1.0, sim.next_due() - time.time())))

    flush()
    ckpt.save({"last_ts": time.time(), "scenario_onset": sim.onset})
    logger.info("KIS datagen stopped - %s events this session", sim.count)


def stream_events(inputs: smi.InputDefinition, event_writer: smi.EventWriter):
    signal.signal(signal.SIGTERM, _on_term)
    signal.signal(signal.SIGINT, _on_term)
    for input_name, item in inputs.inputs.items():
        name = input_name.split("/")[-1]
        logger = logger_for_input(name)
        session_key = inputs.metadata["session_key"]
        try:
            logger.setLevel(conf_manager.get_log_level(
                logger=logger, session_key=session_key, app_name=ADDON_NAME, conf_name=SETTINGS_CONF))
        except Exception:
            pass
        ckpt_dir = inputs.metadata.get("checkpoint_dir", ".")
        lock = acquire_lock(ckpt_dir, name, logger)
        if lock is None:
            return
        # a HEC outage must not kill the stream - retry after a pause
        while not _stop["flag"]:
            try:
                log.modular_input_start(logger, name)
                run(name, item, session_key, event_writer, logger, ckpt_dir)
                return
            except HecError as e:
                if e.code == 7:
                    logger.error("HEC rejected an index (Incorrect index). Both indexes must exist and be allowed "
                                 "for the token: %s (events), %s (metrics). Retrying in 60 s.", *targets(item)[1:3])
                else:
                    logger.error("HEC delivery failed: %s - retrying in 60 s", e)
            except Exception as e:
                log.log_exception(logger, e, "kis_datagen_error", msg_before="KIS datagen crashed: ")
            for _ in range(60):
                if _stop["flag"] or os.getppid() == 1:
                    return
                time.sleep(1)
