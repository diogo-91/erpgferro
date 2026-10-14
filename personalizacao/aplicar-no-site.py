"""Aplica a personalizacao do GFerro no site (banco de dados).

Uso (dentro do container backend, na pasta do bench):
  bench --site erp.gferro.com.br console < /tmp/aplicar-no-site.py

Espera encontrar em /tmp:
  login-website-script.js   (script da tela de login)
  gferro-login-bg.webp      (imagem de fundo do login)
  gferro-logo.webp          (logo do Grupo Gferro)
E faz: envia as imagens como arquivos publicos, grava o Website Script e
define o logo no Navbar Settings / Website Settings. Pode rodar de novo.
"""
import frappe


def _enviar(nome, caminho):
    for n in frappe.get_all("File", filters={"file_name": nome}, pluck="name"):
        frappe.delete_doc("File", n, ignore_permissions=True, force=True)
    f = frappe.get_doc({"doctype": "File", "file_name": nome, "is_private": 0,
                        "content": open(caminho, "rb").read()})
    f.insert(ignore_permissions=True)
    return f.file_url


bg = _enviar("gferro-login-bg.webp", "/tmp/gferro-login-bg.webp")
logo = _enviar("gferro-logo.webp", "/tmp/gferro-logo.webp")

ws = frappe.get_single("Website Script")
ws.javascript = open("/tmp/login-website-script.js", encoding="utf-8").read().replace("/files/gferro-login-bg.webp", bg)
ws.save(ignore_permissions=True)

nb = frappe.get_single("Navbar Settings")
nb.app_logo = logo
nb.save(ignore_permissions=True)

wsb = frappe.get_single("Website Settings")
wsb.app_logo = logo
wsb.banner_image = logo
wsb.favicon = logo
wsb.save(ignore_permissions=True)

frappe.db.commit()
frappe.clear_cache()
print("OK", bg, logo)
