"""Gera o HTML de impressao de um orçamento e salva em /tmp/orc.html (para testar paginas com o Chrome).

Uso (container backend):
  echo 'NOME="CP 02523"; exec(open("/tmp/testar-paginas.py").read(), globals())' | bench --site erp.gferro.com.br console
Depois:
  chromium-headless-shell --no-sandbox --no-pdf-header-footer --print-to-pdf=/tmp/orc.pdf file:///tmp/orc.html
"""
import frappe

NOME = globals().get("NOME") or "CP 02523"
html = frappe.get_print("Quotation", NOME, "Orçamento Gferro", as_pdf=False, no_letterhead=1)
html = html.replace("<head>", '<head><base href="http://frontend:8080/">', 1)
open("/tmp/orc.html", "w", encoding="utf-8").write(html)
print("HTML_OK", len(html))
