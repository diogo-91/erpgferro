"""Preenche as frases sem traducao dos arquivos pt_BR.po dos apps.

Uso: python apply_translations.py <traducoes.json> <pasta_apps>
- Usa i18n/translations.json (msgid ingles -> portugues).
- Tambem reaproveita traducoes ja existentes de qualquer app para o mesmo msgid.
So preenche entradas com msgstr vazio; nunca altera traducoes existentes.
"""
import glob
import json
import os
import re
import sys

import polib

trans_file, apps_dir = sys.argv[1], sys.argv[2]
extra = json.load(open(trans_file, encoding="utf-8"))

files = glob.glob(os.path.join(apps_dir, "*", "*", "locale", "pt_BR.po"))
pos = {f: polib.pofile(f) for f in files}

known = {}
for po in pos.values():
    for e in po.translated_entries():
        known.setdefault(e.msgid, e.msgstr)


def tokens(s):
    return sorted(re.findall(r"\{[^}]*\}|%\w|<[^>]+>|&\w+;", s))


total = 0
for f, po in pos.items():
    n = 0
    for e in po.untranslated_entries():
        if e.msgid_plural:
            continue
        t = known.get(e.msgid) or extra.get(e.msgid)
        if t and tokens(t) == tokens(e.msgid):
            e.msgstr = t
            n += 1
    po.save(f)
    total += n
    print(f"{f}: {n} frases preenchidas, {len(po.untranslated_entries())} restantes")
print("total", total)
