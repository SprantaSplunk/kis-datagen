"""
Minimal HTTP Event Collector client (stdlib only).
TLS verification is on by default; it can be switched off on the Setup page for
lab instances with self-signed certificates (never needed for Splunk Cloud).
"""

import json
import ssl
import time
import uuid
import urllib.error
import urllib.request


class HecError(Exception):
    def __init__(self, msg, code=None):
        Exception.__init__(self, msg)
        self.code = code   # HEC error code from the response body, e.g. 7 = incorrect index


def _ssl_context(verify=True):
    if not verify:
        return ssl._create_unverified_context()
    ctx = ssl.create_default_context()
    try:  # prefer certifi bundle if present (shipped with splunk-sdk deps on some stacks)
        import certifi
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    return ctx


class HecClient:
    def __init__(self, url, token, batch_size=500, timeout=30, logger=None, verify=True):
        self.endpoint = url.rstrip("/") + "/services/collector/event"
        self.token = token
        self.batch_size = max(1, int(batch_size))
        self.timeout = timeout
        self.logger = logger
        # A channel is required when indexer acknowledgment is enabled on the token
        self.channel = str(uuid.uuid4())
        self.ctx = _ssl_context(verify)
        self._buf = []
        self.sent = 0

    def add(self, payload):
        self._buf.append(payload)
        if len(self._buf) >= self.batch_size:
            self.flush()

    def flush(self):
        if not self._buf:
            return
        body = "\n".join(json.dumps(p, separators=(",", ":")) for p in self._buf).encode("utf-8")
        self._post(body)
        self.sent += len(self._buf)
        self._buf = []

    def _post(self, body, attempts=5):
        delay = 2
        for attempt in range(1, attempts + 1):
            req = urllib.request.Request(self.endpoint, data=body, method="POST")
            req.add_header("Authorization", "Splunk " + self.token)
            req.add_header("X-Splunk-Request-Channel", self.channel)
            req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx) as r:
                    r.read()
                    return
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "replace")[:300]
                # 503 = server busy / 429 = throttled -> retry; anything else is fatal
                if e.code in (429, 500, 502, 503, 504) and attempt < attempts:
                    if self.logger:
                        self.logger.warning("HEC %s (attempt %s), retrying: %s", e.code, attempt, text)
                    time.sleep(delay)
                    delay *= 2
                    continue
                try:
                    hec_code = json.loads(text).get("code")
                except Exception:
                    hec_code = None
                raise HecError("HEC returned %s: %s" % (e.code, text), code=hec_code)
            except (urllib.error.URLError, OSError) as e:
                if attempt < attempts:
                    if self.logger:
                        self.logger.warning("HEC connection error (attempt %s): %s", attempt, e)
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise HecError("Cannot reach HEC at %s: %s" % (self.endpoint, e))


def check_token(url, token, timeout=15, verify=True):
    """
    Validate URL + token without indexing anything: an empty POST returns
    HTTP 400 code 5 ("No data") for a valid token, 401/403 for a bad one.
    Returns (ok: bool, message: str).
    """
    endpoint = url.rstrip("/") + "/services/collector/event"
    req = urllib.request.Request(endpoint, data=b"", method="POST")
    req.add_header("Authorization", "Splunk " + token)
    req.add_header("X-Splunk-Request-Channel", str(uuid.uuid4()))
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context(verify)) as r:
            r.read()
            return True, "ok"
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            data = {}
        code = data.get("code")
        if e.code == 400 and code in (5, 6, 12):   # no data / invalid data format / event field required
            return True, "ok"
        if code == 4 or e.code in (401, 403):
            return False, "HEC rejected the token (invalid or disabled)."
        if code == 1:
            return False, "HEC token is disabled."
        return False, "HEC answered HTTP %s: %s" % (e.code, data.get("text", ""))
    except Exception as e:
        return False, "Cannot reach %s (%s). Check the URL, or switch Send mode to Direct." % (endpoint, e)
