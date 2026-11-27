"""Translation of generated events (German model -> other languages).

The model and every generator stay German; a translator rewrites the human-readable values of an
event right before it is emitted. lang_<code>.json holds "patterns" (regex, replacement with $1)
and "phrases" (exact text). Phrases match whole words only, longest first, so a full sentence wins
over the words it contains. Field names, hosts, sourcetypes and IDs are never touched.
The dashboard generator of kis_clinic applies the same file to its searches, so the values in the
searches always match the values in the data.
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LANGUAGES = ("de", "en")
EDGE = r"A-Za-z0-9_\-"


def load(lang):
    with open(os.path.join(HERE, "lang_%s.json" % lang), encoding="utf-8") as fh:
        return json.load(fh)


def compile_table(table):
    patterns = [(re.compile(p), re.sub(r"\$(\d)", r"\\\1", r)) for p, r in table.get("patterns", [])]
    phrases = table.get("phrases", {})
    keys = sorted(phrases, key=len, reverse=True)
    rx = re.compile("(?<![%s])(?:%s)(?![%s])" % (EDGE, "|".join(re.escape(k) for k in keys), EDGE)) if keys else None
    return patterns, phrases, rx


class Translator:
    def __init__(self, lang):
        self.lang = lang
        self.patterns, self.phrases, self.rx = compile_table(load(lang))
        self.cache = {}

    def text(self, s):
        hit = self.cache.get(s)
        if hit is not None:
            return hit
        out = s
        for rx, rep in self.patterns:
            out = rx.sub(rep, out)
        if self.rx is not None:
            out = self.rx.sub(lambda m: self.phrases[m.group(0)], out)
        if len(self.cache) < 200000:
            self.cache[s] = out
        return out

    def value(self, v):
        if isinstance(v, str):
            return self.text(v)
        if isinstance(v, dict):
            return {k: self.value(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self.value(x) for x in v]
        return v


def translator(lang):
    """None for the model language (German)."""
    if not lang or lang == "de":
        return None
    if lang not in LANGUAGES:
        raise ValueError("unknown language %r" % lang)
    return Translator(lang)
