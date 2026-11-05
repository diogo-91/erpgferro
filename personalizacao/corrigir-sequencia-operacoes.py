"""Renumera as operacoes das BOMs e dos Roteiros importados do Nomus: sequence_id passa a ser 1, 2, 3...

O ERPNext exige sequencia consecutiva (a Ordem de Producao recusa 10, 15, 20...). O numero original da etapa no
Nomus fica na descricao ("Etapa Nomus: 10"). Atualiza direto no banco (as BOMs ja estao submetidas). Idempotente.

Uso (container backend, pasta do bench):
  echo 'exec(open("/tmp/corrigir-sequencia-operacoes.py").read(), globals())' | bench --site erp.gferro.com.br console
"""
import frappe

pais = frappe.db.sql("select distinct parent, parenttype from `tabBOM Operation` where parenttype in ('BOM', 'Routing')")
ajustados = 0
for pai, tipo in pais:
    linhas = frappe.db.sql("select name, sequence_id, idx, description from `tabBOM Operation` where parent=%s and parenttype=%s "
                           "order by sequence_id, idx", (pai, tipo), as_dict=True)
    if [l.sequence_id for l in linhas] == list(range(1, len(linhas) + 1)):
        continue
    for pos, l in enumerate(linhas, 1):
        desc = (l.description or "")
        if "Etapa Nomus:" not in desc:
            desc = ("Etapa Nomus: %s" % l.sequence_id + (" | " + desc if desc else ""))
        frappe.db.sql("update `tabBOM Operation` set sequence_id=%s, description=%s where name=%s", (pos, desc, l.name))
    ajustados += 1
frappe.db.commit()
frappe.clear_cache()
print("RESULTADO sequencias renumeradas em %d de %d (BOM/Roteiro)" % (ajustados, len(pais)))
