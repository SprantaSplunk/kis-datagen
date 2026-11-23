"""
Custom REST handler for the Setup page (settings endpoint).
Wired in via package/bin/TA_kis_datagen_rh_settings.py, which overrides the
UCC-generated file (UCC does not support custom handlers for settings tabs).

* validates that URL + token are present when output mode is HEC
* tests the token against the HEC endpoint (no event is indexed)
* marks the app as configured (app.conf already ships is_configured = true; kept as a no-op safety net)
"""

import import_declare_test  # noqa: F401

from splunktaucclib.rest_handler.admin_external import AdminExternalHandler
from splunktaucclib.rest_handler.error import RestError

from kis_hec import check_token

APP = "TA-kis-datagen"
MASK = "********"


class SetupHandler(AdminExternalHandler):
    def __init__(self, *args, **kwargs):
        AdminExternalHandler.__init__(self, *args, **kwargs)

    def _validate(self):
        if self.callerArgs.id != "hec_setup":   # e.g. the Logging tab
            return
        mode = (self.payload.get("send_mode") or "hec").strip()
        if mode != "hec":
            return
        url = (self.payload.get("hec_url") or "").strip()
        token = (self.payload.get("hec_token") or "").strip()
        if not url:
            raise RestError(400, "HEC URL is required when Send mode is HEC.")
        if not token:
            raise RestError(400, "HEC token is required when Send mode is HEC.")
        if token == MASK or set(token) == {"*"}:
            return  # unchanged, already stored encrypted
        verify = str(self.payload.get("hec_verify_ssl", "1")).lower() not in ("0", "false", "no")
        ok, msg = check_token(url, token, verify=verify)
        if not ok:
            raise RestError(400, msg)

    def _mark_configured(self):
        try:
            from splunklib import client
            svc = client.connect(token=self.getSessionKey(), app=APP, owner="nobody")
            svc.post("apps/local/%s" % APP, configured=1)
        except Exception:
            pass  # cosmetic only: worst case Splunk shows the setup page again on app launch

    def handleEdit(self, confInfo):
        self._validate()
        AdminExternalHandler.handleEdit(self, confInfo)
        if self.callerArgs.id == "hec_setup":
            self._mark_configured()

    def handleList(self, confInfo):
        AdminExternalHandler.handleList(self, confInfo)
