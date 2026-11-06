"""Funcoes de apoio para os modelos de impressao Gferro (registradas como metodos Jinja) e o apontamento por codigo de barras."""
import base64
import io
import re
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import flt, now_datetime, time_diff_in_hours


def gf_qr(texto, escala=4):
    """QR code em PNG (data URI) para colocar direto em <img src=...>."""
    import pyqrcode

    buf = io.BytesIO()
    pyqrcode.create(str(texto), error="M").png(buf, scale=escala, quiet_zone=1)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def gf_whatsapp(telefone, mensagem=""):
    """Link wa.me a partir de um telefone brasileiro, ex.: (15) 99850-7812."""
    digitos = re.sub(r"\D", "", telefone or "")
    if digitos and not digitos.startswith("55"):
        digitos = "55" + digitos
    url = "https://wa.me/" + digitos
    return url + ("?text=" + quote(mensagem) if mensagem else "")


def gf_barcode(texto, altura=13, largura_modulo=0.33):
    """Codigo de barras Code 128 em PNG (data URI) para colocar direto em <img src=...>. Le qualquer texto ASCII (ex.: OS, etapa, matricula)."""
    import barcode
    from barcode.writer import ImageWriter

    buf = io.BytesIO()
    barcode.get("code128", str(texto), writer=ImageWriter()).write(
        buf, options={"module_width": largura_modulo, "module_height": altura, "quiet_zone": 2, "write_text": False, "dpi": 300}
    )
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------------------------
# Apontamento por codigo de barras (tela "Apontamento de Producao")
# Leitura em sequencia: matricula do colaborador (cracha) -> ordem de servico -> etapa do processo.
# Cada etapa da OS e um Job Card do ERPNext; o tempo fica nas linhas de tempo do Job Card.
# O operador vem do cadastro "Operador" (matricula = codigo de barras do cracha), sem depender de Employee.
# ---------------------------------------------------------------------------------------------
def _estado(jc):
    if jc.get("docstatus") == 1 or jc.get("status") == "Completed":
        return "concluida"
    if jc.get("is_paused"):
        return "pausada"
    if jc.get("status") == "Work In Progress":
        return "producao"
    return "aguardando"


def _cartao(jc):
    wo = frappe.db.get_value("Work Order", jc.work_order, ["production_item", "item_name", "sales_order"], as_dict=True) or {}
    aberto = next((r.from_time for r in jc.get("time_logs") or [] if r.from_time and not r.to_time), None)
    return {
        "tipo": "etapa", "job_card": jc.name, "os": jc.work_order, "pedido": wo.get("sales_order") or "",
        "codigo": wo.get("production_item"), "produto": wo.get("item_name") or wo.get("production_item"),
        "operacao": jc.operation, "recurso": jc.workstation or "", "centro": jc.workstation_type or "",
        "sequencia": jc.sequence_id, "qtd": flt(jc.for_quantity), "feito": flt(jc.total_completed_qty),
        "estado": _estado(jc), "operador": jc.get("operador") or "", "minutos": flt(jc.total_time_in_mins),
        "aberto_desde": str(aberto) if aberto else "",
    }


def _etapa_ativa(codigo):
    """Nome do Job Card vigente para o codigo lido. Se a etapa foi desfeita depois de finalizada, o ERPNext cria uma
    versao corrigida (PO-JOB00021-1) e o codigo impresso continua apontando para ela."""
    ativo = frappe.db.get_value("Job Card", {"name": codigo, "docstatus": ["<", 2]}, "name")
    if ativo:
        return ativo
    alt = frappe.get_all("Job Card", filters={"name": ["like", codigo + "-%"], "docstatus": ["<", 2]}, pluck="name",
                         order_by="creation desc", limit=1)
    return alt[0] if alt else None


@frappe.whitelist()
def apontamento_operador(matricula):
    """Identifica o colaborador pelo cracha (a matricula e o codigo de barras)."""
    m = (matricula or "").strip()
    if not m:
        frappe.throw(_("Bipe o crachá do colaborador."))
    op = frappe.db.get_value("Operador", m, ["name", "nome", "ativo"], as_dict=True)
    if not op:
        frappe.throw(_("Matrícula {0} não cadastrada.").format(m))
    if not op.ativo:
        frappe.throw(_("A matrícula {0} está inativa.").format(m))
    return {"matricula": op.name, "nome": op.nome}


@frappe.whitelist()
def apontamento_buscar(codigo):
    """Resolve o que foi lido pela leitora: o codigo de uma etapa (Job Card) ou o de uma OS (Work Order)."""
    codigo = (codigo or "").strip()
    if not codigo:
        frappe.throw(_("Leia o código de barras."))
    etapa = _etapa_ativa(codigo)
    if etapa:
        return _cartao(frappe.get_doc("Job Card", etapa))
    if frappe.db.exists("Work Order", codigo):
        wo = frappe.get_doc("Work Order", codigo)
        etapas = frappe.get_all("Job Card", filters={"work_order": codigo, "docstatus": ["<", 2]}, pluck="name", order_by="sequence_id asc")
        return {"tipo": "os", "os": codigo, "produto": wo.item_name or wo.production_item, "pedido": wo.sales_order or "",
                "etapas": [_cartao(frappe.get_doc("Job Card", n)) for n in etapas]}
    frappe.throw(_("Código {0} não encontrado. Confira a etiqueta.").format(codigo))


def _desfazer(jc):
    """Cancelar apontamento: desfaz o ultimo registro da etapa. Devolve o nome do Job Card vigente."""
    aberto = next((r for r in jc.time_logs if r.from_time and not r.to_time), None)
    if jc.docstatus == 1:  # etapa finalizada: cancela e recria limpa (versao corrigida do mesmo codigo)
        jc.cancel()
        novo = frappe.copy_doc(jc)
        novo.amended_from = jc.name
        novo.docstatus = 0
        novo.set("time_logs", [])
        novo.set("employee", [])
        for campo in ("total_completed_qty", "total_time_in_mins", "pending_qty", "process_loss_qty", "manufactured_qty", "transferred_qty"):
            novo.set(campo, 0)
        for campo in ("operador", "actual_start_date", "actual_end_date"):
            novo.set(campo, None)
        novo.is_paused = 0
        novo.status = "Open"
        novo.insert()
        return novo.name
    if aberto:  # em producao: tira o inicio
        jc.remove(aberto)
        jc.is_paused = 0
    elif jc.is_paused and jc.time_logs:  # pausada: tira a pausa (volta a produzir)
        ultimo = jc.time_logs[-1]
        ultimo.to_time = None
        ultimo.time_in_mins = 0
        jc.is_paused = 0
    else:
        frappe.throw(_("Não há apontamento para cancelar nesta etapa."))
    jc.save()
    return jc.name


@frappe.whitelist()
def apontamento_acao(job_card, acao, matricula=None, qtd=None, os=None):
    """iniciar | pausar | finalizar | cancelar uma etapa. Devolve o cartao atualizado."""
    etapa = _etapa_ativa((job_card or "").strip())
    if not etapa:
        frappe.throw(_("Etapa {0} não encontrada.").format(job_card))
    jc = frappe.get_doc("Job Card", etapa)
    jc.check_permission("write")
    if os and jc.work_order != os.strip():
        frappe.throw(_("A etapa {0} não pertence à ordem {1}.").format(jc.name, os))
    op = apontamento_operador(matricula)
    nome, mat = op["nome"], op["matricula"]
    agora = now_datetime()
    resultado = jc.name

    if acao == "cancelar":
        resultado = _desfazer(jc)
    else:
        if jc.docstatus != 0:
            frappe.throw(_("Esta etapa já foi concluída."))
        aberto = next((r for r in jc.time_logs if r.from_time and not r.to_time), None)
        if acao == "iniciar":
            if aberto:
                frappe.throw(_("Esta etapa já está em andamento."))
            limite = frappe.db.get_value("Operador", mat, "limite_apontamentos") or 1
            em_curso = frappe.db.count("Job Card Time Log", {"parenttype": "Job Card", "matricula": mat, "to_time": ["is", "not set"]})
            if em_curso >= limite:
                frappe.throw(_("{0} já tem {1} apontamento(s) em andamento (limite {2}). Pause ou finalize antes de iniciar outro.").format(nome, em_curso, limite))
            jc.is_paused = 0
            jc.append("time_logs", {"from_time": agora, "completed_qty": 0, "operador": nome, "matricula": mat})
            jc.operador = nome
            jc.save()
        elif acao == "pausar":
            if not aberto:
                frappe.throw(_("Esta etapa não está em andamento."))
            aberto.to_time = agora
            aberto.time_in_mins = time_diff_in_hours(agora, aberto.from_time) * 60
            jc.is_paused = 1
            jc.save()
        elif acao == "finalizar":
            feito = flt(qtd) if qtd not in (None, "") else flt(jc.for_quantity)
            if feito <= 0:
                frappe.throw(_("Informe a quantidade produzida."))
            if feito > flt(jc.for_quantity):
                frappe.throw(_("A quantidade produzida não pode passar de {0}.").format(flt(jc.for_quantity)))
            if aberto:
                aberto.to_time = agora
                aberto.time_in_mins = time_diff_in_hours(agora, aberto.from_time) * 60
                alvo = aberto
            elif jc.time_logs:
                alvo = jc.time_logs[-1]
            else:
                frappe.throw(_("Inicie a etapa antes de finalizar."))
            alvo.completed_qty = flt(alvo.completed_qty) + feito
            jc.is_paused = 0
            jc.pending_qty = max(flt(jc.for_quantity) - feito - flt(jc.process_loss_qty), 0)
            jc.operador = nome
            jc.save()
            jc.submit()
        else:
            frappe.throw(_("Ação inválida."))
    frappe.db.commit()
    return _cartao(frappe.get_doc("Job Card", resultado))
