"""Acrescenta o CSS/JS do GFerro ao hooks.py do erpnext (app_include_css / app_include_js).

Uso: python3 patch_hooks.py <caminho do hooks.py>
Cada execucao grava uma versao nova na URL (?v=...), assim o navegador nunca fica com JS/CSS antigo em cache.
Pode rodar de novo: o bloco anterior e substituido.
"""
import re
import sys
import time

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
marca = "# --- GFerro: personalizacao do desk"

# remove o bloco antigo, se existir
if marca in src:
    src = src[: src.index(marca)].rstrip() + "\n"

versao = str(int(time.time()))
src += '''
# --- GFerro: personalizacao do desk (barra lateral unica, logo, abrir no menu) ---
_gf_css = "/assets/erpnext/gferro/gferro-desk.css?v=%s"
_gf_js = "/assets/erpnext/gferro/gferro-desk.js?v=%s"
app_include_css = ([app_include_css] if isinstance(app_include_css, str) else list(app_include_css)) + [_gf_css]
app_include_js = ([app_include_js] if isinstance(app_include_js, str) else list(app_include_js)) + [_gf_js]
''' % (versao, versao)
open(path, "w", encoding="utf-8").write(src)
print("hooks.py atualizado, versao", versao)
