"""Acrescenta o CSS/JS do GFerro ao hooks.py do erpnext (app_include_css / app_include_js)."""
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
if "gferro-desk" in src:
    print("hooks.py ja tem gferro-desk")
    sys.exit(0)
src += '''

# --- GFerro: personalizacao do desk (barra lateral unica, logo, abrir no menu) ---
_gf_css = "/assets/erpnext/gferro/gferro-desk.css"
_gf_js = "/assets/erpnext/gferro/gferro-desk.js"
app_include_css = ([app_include_css] if isinstance(app_include_css, str) else list(app_include_css)) + [_gf_css]
app_include_js = ([app_include_js] if isinstance(app_include_js, str) else list(app_include_js)) + [_gf_js]
'''
open(path, "w", encoding="utf-8").write(src)
print("hooks.py atualizado")
