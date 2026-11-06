"""Cria ordens de servico de EXEMPLO em varios estados para demonstrar o quadro "Acompanhamento da Producao".

Uso (container backend, pasta do bench):
  criar:   echo 'exec(open("/tmp/criar-exemplos-producao.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console
  remover: echo 'globals()["REMOVER"]=True; exec(open("/tmp/criar-exemplos-producao.py", encoding="utf-8").read(), globals())' | bench --site erp.gferro.com.br console

As ordens usam o fluxo real do apontamento (iniciar / pausar / finalizar) e depois os horarios sao ajustados para parecer producao de verdade.
Todas levam a descricao "EXEMPLO - ..." e nenhuma finaliza a ultima etapa (nao mexe em estoque). A remocao apaga so as de exemplo.
Operadores usados (matriculas do Nomus): 1, 3, 4, 5, 6, 7, 8, 9, 10 (um por apontamento em andamento: o limite e 1 por pessoa).
"""
import frappe
from frappe.utils import add_to_date, now_datetime

frappe.local.lang = "pt-BR"
MARCA = "EXEMPLO - criado para demonstracao (pode apagar)"


def remover():
    n = 0
    for nome in frappe.get_all("Work Order", filters={"description": ["like", "EXEMPLO - %"]}, pluck="name"):
        for se in frappe.get_all("Stock Entry", filters={"work_order": nome}, pluck="name"):
            frappe.delete_doc("Stock Entry", se, force=1, ignore_permissions=True)
        for jc in frappe.get_all("Job Card", filters={"work_order": nome}, fields=["name", "docstatus"]):
            if jc.docstatus == 1:
                frappe.get_doc("Job Card", jc.name).cancel()
            frappe.delete_doc("Job Card", jc.name, force=1, ignore_permissions=True)
        wo = frappe.get_doc("Work Order", nome)
        if wo.docstatus == 1:
            wo.cancel()
        frappe.delete_doc("Work Order", nome, force=1, ignore_permissions=True)
        n += 1
    frappe.db.commit()
    if not frappe.db.count("Work Order"):  # volta a numeracao so se nao sobrou nenhuma ordem real
        frappe.db.sql("update tabSeries set current=0 where name like 'MFG-WO-%' or name like 'PO-JOB%' or name like 'MAT-STE-%'")
        frappe.db.commit()
    print("EXEMPLOS removidos:", n, "| ordens restantes:", frappe.db.count("Work Order"))


if globals().get("REMOVER"):
    remover()
else:
    from erpnext.gferro_utils import apontamento_acao

    EMPRESA = frappe.get_all("Company", pluck="name")[0]
    agora = now_datetime()
    atras = lambda minutos: add_to_date(agora, minutes=-minutos)
    DURACOES = [50, 35, 70, 45, 60]

    def cenario(item, qtd, feitas, estado, mat, inicio_atras, pedido=None, pausa_dur=20):
        """feitas = etapas ja finalizadas; estado da etapa atual: producao | pausada | aguardando | nenhuma (ordem ainda nao iniciada)."""
        bom = frappe.db.get_value("BOM", {"item": item, "docstatus": 1, "is_default": 1}, "name")
        wo = frappe.get_doc({"doctype": "Work Order", "production_item": item, "bom_no": bom, "qty": qtd, "company": EMPRESA,
                             "use_multi_level_bom": 0, "description": MARCA, "planned_start_date": atras(inicio_atras + 400)})
        wo.set_work_order_operations()
        wo.insert()
        wo.submit()
        frappe.db.commit()
        jcs = frappe.get_all("Job Card", filters={"work_order": wo.name}, pluck="name", order_by="sequence_id asc")
        for i in range(feitas):
            apontamento_acao(jcs[i], "iniciar", mat, None, wo.name)
            apontamento_acao(jcs[i], "finalizar", mat, qtd, wo.name)
        if estado in ("producao", "pausada"):
            apontamento_acao(jcs[feitas], "iniciar", mat, None, wo.name)
        if estado == "pausada":
            apontamento_acao(jcs[feitas], "pausar", mat, None, wo.name)
        # ---- horarios realistas (de tras para frente) ----
        fim = inicio_atras + (0 if estado in ("aguardando", "nenhuma") else 3)
        for i in range(feitas - 1, -1, -1):
            dur = DURACOES[i % 5]
            ini = fim + dur
            frappe.db.sql("update `tabJob Card Time Log` set from_time=%s, to_time=%s, time_in_mins=%s where parent=%s",
                          (atras(ini), atras(fim), dur, jcs[i]))
            frappe.db.sql("update `tabJob Card` set actual_start_date=%s, actual_end_date=%s, total_time_in_mins=%s where name=%s",
                          (atras(ini), atras(fim), dur, jcs[i]))
            frappe.db.sql("update `tabWork Order Operation` set actual_start_time=%s, actual_end_time=%s, actual_operation_time=%s where parent=%s and sequence_id=%s",
                          (atras(ini), atras(fim), dur, wo.name, i + 1))
            fim = ini + 4
        if estado == "producao":
            frappe.db.sql("update `tabJob Card Time Log` set from_time=%s where parent=%s and to_time is null", (atras(inicio_atras), jcs[feitas]))
            frappe.db.sql("update `tabJob Card` set actual_start_date=%s where name=%s", (atras(inicio_atras), jcs[feitas]))
        elif estado == "pausada":
            frappe.db.sql("update `tabJob Card Time Log` set from_time=%s, to_time=%s, time_in_mins=%s where parent=%s",
                          (atras(inicio_atras + pausa_dur), atras(inicio_atras), pausa_dur, jcs[feitas]))
            frappe.db.sql("update `tabJob Card` set actual_start_date=%s, total_time_in_mins=%s where name=%s", (atras(inicio_atras + pausa_dur), pausa_dur, jcs[feitas]))
        if pedido:
            frappe.db.set_value("Work Order", wo.name, "sales_order", pedido, update_modified=False)
        frappe.db.commit()
        return wo.name

    PD = "PD 02147" if frappe.db.exists("Sales Order", "PD 02147") else None
    plano = [
        # item, qtd, feitas, estado da etapa atual, matricula, minutos atras, pedido
        ("0014", 18, 1, "producao", "3", 200, PD),        # Pintura em producao
        ("PA 00168", 30, 0, "producao", "8", 75, None),   # Corte/Forro em producao
        ("0014", 40, 0, "producao", "10", 45, PD),        # Corte em producao
        ("PA 00105", 12, 0, "producao", "4", 120, PD),    # Corte/Dobra em producao
        ("PA 00165", 25, 1, "aguardando", "9", 50, None),  # Colagem aguardando
        ("0014", 22, 3, "producao", "5", 240, PD),        # Estocagem (expedicao) em producao
        ("0001", 60, 1, "pausada", "6", 35, None),        # Estocagem pausada
        ("PA 00103", 15, 2, "aguardando", "1", 125, None),  # Logistica aguardando
        ("0014", 10, 4, "producao", "7", 25, PD),         # Logistica em producao
        ("PA 00168", 14, 1, "aguardando", "9", 12, None),  # Pintura aguardando
        ("0001", 8, 0, "nenhuma", "9", 0, None),         # ainda nao iniciada
    ]
    criadas = [cenario(i, q, f, e, m, a, p) for i, q, f, e, m, a, p in plano]
    print("EXEMPLOS criados:", criadas)
    # o que o quadro vai mostrar
    por = {}
    for jc in frappe.get_all("Job Card", filters={"work_order": ["in", criadas], "docstatus": 0}, fields=["work_order", "status", "is_paused", "workstation_type", "operation", "sequence_id"], order_by="work_order asc, sequence_id asc"):
        por.setdefault(jc.work_order, []).append(jc)
    for nome, lst in por.items():
        atual = next((j for j in lst), None)
        print("EXEMPLO", nome, "-> etapa atual:", atual.operation, "|", atual.workstation_type, "|", "pausada" if atual.is_paused else atual.status)
