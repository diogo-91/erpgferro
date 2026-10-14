"""Mescla em translations.json as traducoes das frases que ainda ficavam em ingles.

Uso: python i18n/add_missing.py
So adiciona chaves novas; nunca sobrescreve as existentes.
"""
import json
import os

path = os.path.join(os.path.dirname(__file__), "translations.json")
data = json.load(open(path, encoding="utf-8"))

novas = {
    "Account {0} does not belong to Company {1}": "A conta {0} não pertence à empresa {1}",
    "All raw materials are already mapped to finished goods": "Todas as matérias-primas já estão mapeadas para produtos acabados",
    "Auto Map Raw Materials to Finished Goods": "Mapear matérias-primas automaticamente para produtos acabados",
    "Bank Transaction {0} added as {1}": "Transação bancária {0} adicionada como {1}",
    "Books are closed till {0} by Period Closing Voucher, remove these rows: {1}": "Os livros estão fechados até {0} pelo Comprovante de Fechamento de Período, remova estas linhas: {1}",
    "Cannot cancel Stock Closing Entry {0} because the later Stock Closing Entry {1} is built on it. Cancel {1} first.": "Não é possível cancelar o Lançamento de Fechamento de Estoque {0} porque o lançamento posterior {1} depende dele. Cancele {1} primeiro.",
    "Cannot create Work Orders from a stopped Material Request": "Não é possível criar Ordens de Produção a partir de uma Solicitação de Material parada",
    "Cannot create {0} from a Bank Transaction": "Não é possível criar {0} a partir de uma transação bancária",
    "Cannot disable Serial and Batch No for Item, as there are items with serial / batch enabled.": "Não é possível desativar Nº de Série e Lote para o Item, pois há itens com série / lote ativado.",
    "Cannot enable {0} as {1} is disabled in {2}": "Não é possível ativar {0}, pois {1} está desativado em {2}",
    "Closed Period Rows Selected": "Linhas de período fechado selecionadas",
    "Communication {0} is not on the timeline of Issue {1}": "A comunicação {0} não está na linha do tempo do chamado {1}",
    "Components can be returned only after Work Order {0} is Completed or Closed": "Os componentes só podem ser devolvidos depois que a Ordem de Produção {0} for Concluída ou Encerrada",
    "Could not download the statement. Please try again.": "Não foi possível baixar o extrato. Tente novamente.",
    "Default Supplier for {0} not found": "Fornecedor padrão para {0} não encontrado",
    "Default Target Warehouse {0} must be a Transit warehouse when Add to Transit is enabled.": "O Depósito de Destino padrão {0} deve ser um depósito de Trânsito quando Adicionar ao Trânsito está ativado.",
    "Enable Item Search Index": "Ativar índice de busca de itens",
    "Finished Good Batch No": "Nº do lote do produto acabado",
    "Finished Good Serial / Batch No": "Nº de série / lote do produto acabado",
    "Finished Good Serial No": "Nº de série do produto acabado",
    "Finished good mapping can't be changed for a cancelled entry": "O mapeamento de produto acabado não pode ser alterado em um lançamento cancelado",
    "Finished good mapping is only allowed for Manufacture and Repack entries": "O mapeamento de produto acabado só é permitido em lançamentos de Fabricação e Reembalagem",
    "From Date cannot be after As On Date": "A Data Inicial não pode ser posterior à Data de Posição",
    "Group the report by Sales Order or by Item, not both.": "Agrupe o relatório por Pedido de Venda ou por Item, não por ambos.",
    "Invalid Price List": "Lista de preços inválida",
    "Invalid Sample Size": "Tamanho de amostra inválido",
    "Invalid address": "Endereço inválido",
    "Invalid doctype": "DocType inválido",
    "Invalid doctype {0}": "DocType {0} inválido",
    "Invalid document type": "Tipo de documento inválido",
    "Invalid filter": "Filtro inválido",
    "Invalid name": "Nome inválido",
    "Invalid reference": "Referência inválida",
    "Invalid tax master doctype": "DocType de cadastro de imposto inválido",
    "Invalid type": "Tipo inválido",
    "Item Restricted for Party": "Item restrito para a parte",
    "Items must be a list of Item codes": "Os itens devem ser uma lista de códigos de item",
    "Later Stock Closing Entry Exists": "Existe um Lançamento de Fechamento de Estoque posterior",
    "Map Raw Materials to Finished Goods": "Mapear matérias-primas para produtos acabados",
    "Mapping must be a dictionary of raw material entries to finished goods": "O mapeamento deve ser um dicionário de matérias-primas para produtos acabados",
    "Mapping saved": "Mapeamento salvo",
    "Material Request must be submitted to create Work Orders": "A Solicitação de Material deve ser enviada para criar Ordens de Produção",
    "No Matching Vouchers Found": "Nenhum comprovante correspondente encontrado",
    "Not permitted for {0}": "Não permitido para {0}",
    "Only users with the {0} role can repost GL Entries": "Somente usuários com o papel {0} podem reprocessar lançamentos contábeis",
    "Only users with the {0} role can repost GL entries": "Somente usuários com o papel {0} podem reprocessar lançamentos contábeis",
    "Parent document is required to search child rows": "O documento pai é necessário para buscar as linhas filhas",
    "Please contact any of the following users for this transaction.": "Entre em contato com um dos usuários a seguir para esta transação.",
    "Price List {0} cannot be used on a buying transaction": "A Lista de Preços {0} não pode ser usada em uma transação de compra",
    "Price List {0} cannot be used on a selling transaction": "A Lista de Preços {0} não pode ser usada em uma transação de venda",
    "Pricing Rule {0} is disabled": "A Regra de Preços {0} está desativada",
    "Qty for Manufacture must be greater than the process loss of {0} to produce a finished good.": "A quantidade a fabricar deve ser maior que a perda de processo de {0} para produzir um produto acabado.",
    "Raw material {0} is already mapped and can't be changed after {1} is submitted": "A matéria-prima {0} já está mapeada e não pode ser alterada após o envio de {1}",
    "Repost GL Entries": "Reprocessar lançamentos contábeis",
    "Repost Stock & GL Entries": "Reprocessar lançamentos de estoque e contábeis",
    "Row #{0}: Company {1} does not match with the company {2} in Serial and Batch Bundle {3}.": "Linha #{0}: A empresa {1} não corresponde à empresa {2} no Pacote de Série e Lote {3}.",
    "Row #{0}: Planned Qty must be greater than 0 for Item {1}.": "Linha #{0}: A quantidade planejada deve ser maior que 0 para o Item {1}.",
    "Row #{0}: Serial No {1} is not reserved against Sales Order {2}. Deliver only the Serial Nos produced and reserved for it.": "Linha #{0}: O Nº de Série {1} não está reservado para o Pedido de Venda {2}. Entregue apenas os Nºs de Série produzidos e reservados para ele.",
    "Row #{0}: Target Warehouse {1} must be a Transit warehouse when Add to Transit is enabled.": "Linha #{0}: O Depósito de Destino {1} deve ser um depósito de Trânsito quando Adicionar ao Trânsito está ativado.",
    "Row {0}: Item {1} is not allowed for {2} {3}.": "Linha {0}: O Item {1} não é permitido para {2} {3}.",
    "Sample Size must be greater than zero": "O tamanho da amostra deve ser maior que zero",
    "Serial / Batch No Not Activated": "Nº de Série / Lote não ativado",
    "Serial No Not Reserved": "Nº de Série não reservado",
    "The following payment schedule(s) already exist:\n{0}": "As seguintes programações de pagamento já existem:\n{0}",
    "There are no serial / batch tracked raw materials or finished goods to map": "Não há matérias-primas ou produtos acabados com rastreio de série / lote para mapear",
    "These rows fall in a closed Accounting Period, remove them: {0}": "Estas linhas estão em um Período Contábil fechado, remova-as: {0}",
    "To Date must be after {0}, the To Date of the last Stock Closing Entry {1}": "A Data Final deve ser posterior a {0}, a Data Final do último Lançamento de Fechamento de Estoque {1}",
    "Total {0} of all items is zero, charges cannot be distributed on it.": "O total de {0} de todos os itens é zero, as despesas não podem ser distribuídas.",
    "Work Order Not Finished": "Ordem de Produção não concluída",
    "UnReconcile": "Desconciliar",
    "DeLinked": "Desvinculado",
    "Closed Period Rows Selected": "Linhas de período fechado selecionadas",
    "{0} (Accounting Period {1})": "{0} (Período Contábil {1})",
    "{0} cannot be cleared against a bank statement": "{0} não pode ser compensado com um extrato bancário",
    "{0} cannot be reconciled against a Bank Transaction": "{0} não pode ser conciliado com uma transação bancária",
    "{0} does not hold a Serial and Batch Bundle": "{0} não possui um Pacote de Série e Lote",
    "{0} has no serial / batch tracked finished good": "{0} não possui produto acabado com rastreio de série / lote",
    "{0} is not a child table": "{0} não é uma tabela filha",
    "{0} is not a valid reference field for {1}": "{0} não é um campo de referência válido para {1}",
    "Row {0} is not a raw material serial / batch entry of {1}": "A linha {0} não é um lançamento de série / lote de matéria-prima de {1}",
    "Active: The agent is available and working.<br>\nAway: The agent is temporarily unreachable.<br>\nUnavailable: The agent is off and unavailable.": "Ativo: o agente está disponível e trabalhando.<br>\nAusente: o agente está temporariamente inacessível.<br>\nIndisponível: o agente está desligado e indisponível.",
    "If enabled, feedback email will be sent to the customer when you mark a ticket as the status selected below.\n": "Se ativado, um e-mail de avaliação será enviado ao cliente quando você marcar um chamado com o status selecionado abaixo.\n",
    "If enabled, the feedback dialog will be shown, when a user tries to close a ticket. \n": "Se ativado, a janela de avaliação será exibida quando um usuário tentar fechar um chamado. \n",
    "Open: SLA continues. <br>\nPaused: SLA is paused. <br>\nResolved: SLA timer stops.": "Aberto: o SLA continua. <br>\nPausado: o SLA está pausado. <br>\nResolvido: o cronômetro do SLA é interrompido.",
    "When enabled, the ticket status will automatically change to the status selected below whenever the agent responds to a ticket.\n": "Quando ativado, o status do chamado mudará automaticamente para o status selecionado abaixo sempre que o agente responder a um chamado.\n",
    "Per Day\nShift Time (In Hours) * No of Workstations * No of Shift": "Por dia\nTempo do turno (em horas) * Nº de estações de trabalho * Nº de turnos",
    "Leave blank for home.\nThis is relative to site URL, for example \"about\" will redirect to \"https://yoursitename.com/about\"": "Deixe em branco para a página inicial.\nÉ relativo à URL do site, por exemplo \"sobre\" redirecionará para \"https://seusite.com/sobre\"",
    "Minimum quantity should be as per Stock UOM\n\n": "A quantidade mínima deve ser conforme a UDM de Estoque\n\n",
    "Cr": "Cr",
    "Dr": "Dr",
}

adicionadas = 0
for k, v in novas.items():
    if k not in data:
        data[k] = v
        adicionadas += 1

# mantem o formato original: uma chave por linha, sem indentacao, ordem preservada
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write("{\n")
    itens = list(data.items())
    for i, (k, v) in enumerate(itens):
        f.write(json.dumps(k, ensure_ascii=False) + ": " + json.dumps(v, ensure_ascii=False))
        f.write(",\n" if i < len(itens) - 1 else "\n")
    f.write("}")
print("adicionadas:", adicionadas, "total:", len(data))
