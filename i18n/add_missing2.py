"""Mescla em translations.json as frases de texto que ainda ficavam em ingles (segunda rodada).

Uso: python i18n/add_missing2.py
So adiciona chaves novas; nunca sobrescreve as existentes.
"""
import json
import os

path = os.path.join(os.path.dirname(__file__), "translations.json")
data = json.load(open(path, encoding="utf-8"))

novas = {
    "'{0}' is a reserved name and cannot be used as a line reference": "'{0}' é um nome reservado e não pode ser usado como referência de linha",
    'Creation of {0} failed.\n\t\t\t\tCheck <b><a href="/app/bulk-transaction-log">Bulk Transaction Log</a></b>': 'A criação de {0} falhou.\n\t\t\t\tVeja o <b><a href="/app/bulk-transaction-log">Log de Transações em Lote</a></b>',
    'Creation of {0} partially successful.\n\t\t\t\tCheck <b><a href="/app/bulk-transaction-log">Bulk Transaction Log</a></b>': 'A criação de {0} foi parcialmente concluída.\n\t\t\t\tVeja o <b><a href="/app/bulk-transaction-log">Log de Transações em Lote</a></b>',
    'Enter the Operation, the table will fetch the Operation details like Hourly Rate, Workstation automatically.\n\n After that, set the Operation Time in minutes and the table will calculate the Operation Costs based on the Hourly Rate and Operation Time.': 'Informe a Operação; a tabela busca automaticamente os detalhes da Operação, como o Valor por Hora e o Posto de Trabalho.\n\n Depois, informe o Tempo da Operação em minutos e a tabela calculará os Custos da Operação com base no Valor por Hora e no Tempo da Operação.',
    'Example: ABCD.#####\nIf series is set and Serial No is not mentioned in transactions, then automatic serial number will be created based on this series. If you always want to explicitly mention Serial Nos for this item. leave this blank.': 'Exemplo: ABCD.#####\nSe a série estiver definida e o Nº de Série não for informado nas transações, um número de série automático será criado com base nessa série. Se você sempre quiser informar os Nºs de Série deste item manualmente, deixe em branco.',
    'Finished good batch this raw material was consumed into (Manufacture / Repack)': 'Lote do produto acabado em que esta matéria-prima foi consumida (Fabricação / Reembalagem)',
    'Finished good serial no this raw material was consumed into (Manufacture / Repack)': 'Nº de série do produto acabado em que esta matéria-prima foi consumida (Fabricação / Reembalagem)',
    'If enabled, do not update serial / batch values in the stock transactions on creation of auto Serial \n / Batch Bundle. ': 'Se ativado, não atualiza os valores de série / lote nas transações de estoque na criação do Pacote de Nº de Série \n / Lote automático. ',
    "Invalid line reference format: '{0}'. Must start with a letter and contain only letters, numbers and underscores": "Formato de referência de linha inválido: '{0}'. Deve começar com uma letra e conter apenas letras, números e sublinhados",
    'Link the Serial and Batch Bundles of the raw materials and finished goods first. Serial / batch nos picked on submit can be mapped after the entry is submitted.': 'Vincule primeiro os Pacotes de Série e Lote das matérias-primas e dos produtos acabados. Os nºs de série / lote escolhidos ao enviar podem ser mapeados depois que o lançamento for enviado.',
    'On submit of a Manufacture / Repack entry, map the raw material serial / batch nos that were not mapped in draft to the finished goods, in order': 'Ao enviar um lançamento de Fabricação / Reembalagem, mapeia, em ordem, os nºs de série / lote das matérias-primas que não foram mapeados no rascunho para os produtos acabados',
    'Only values between [0,1) are allowed. Like {0.00, 0.04, 0.09, ...}\nEx: If allowance is set at 0.07, accounts that have balance of 0.07 in either of the currencies will be considered as zero balance account': 'Somente valores entre [0,1) são permitidos. Como {0.00, 0.04, 0.09, ...}\nEx.: Se a tolerância for 0,07, contas com saldo de 0,07 em qualquer uma das moedas serão consideradas contas com saldo zero',
    'Pick the finished good serial / batch each raw material went into. The Serial No and Batch Traceability report uses this mapping.': 'Escolha o nº de série / lote do produto acabado em que cada matéria-prima foi usada. O relatório de Rastreabilidade de Nº de Série e Lote usa esse mapeamento.',
    'Raw material {0} is mapped to {1}, which is not a finished good of this entry': 'A matéria-prima {0} está mapeada para {1}, que não é um produto acabado deste lançamento',
    'Replace a particular BOM in all other BOMs where it is used. It will replace the old BOM link, update cost and regenerate "BOM Explosion Item" table as per new BOM.\nIt also updates latest price in all the BOMs.': 'Substitui uma Lista de Materiais específica em todas as outras onde ela é usada. Substitui o vínculo da lista antiga, atualiza o custo e regera a tabela "Item da Explosão da Lista de Materiais" conforme a nova lista.\nTambém atualiza o preço mais recente em todas as listas.',
    'Row #{0}: Delivery of Item {1} is ensured by produced Serial No, but no Serial No is reserved against Sales Order {2}. Reserve the produced Serial Nos from the Sales Order.': 'Linha #{0}: A entrega do Item {1} é garantida pelo Nº de Série produzido, mas nenhum Nº de Série está reservado no Pedido de Venda {2}. Reserve os Nºs de Série produzidos a partir do Pedido de Venda.',
    'Scorecard variables can be used, as well as:\n{total_score} (the total score from that period),\n{period_number} (the number of periods to present day)\n': 'Podem ser usadas variáveis do Scorecard, além de:\n{total_score} (a pontuação total do período),\n{period_number} (o número de períodos até hoje)\n',
    'Select whether to get items from a Sales Order or a Material Request. For now select <b>Sales Order</b>.\n A Production Plan can also be created manually where you can select the Items to manufacture.': 'Selecione se os itens serão obtidos de um Pedido de Venda ou de uma Solicitação de Material. Por enquanto, selecione <b>Pedido de Venda</b>.\n Um Plano de Produção também pode ser criado manualmente, escolhendo os Itens a fabricar.',
    "Set automatically to the day after the previous Stock Closing Entry, or to the first stock transaction's date": 'Definido automaticamente como o dia seguinte ao Lançamento de Fechamento de Estoque anterior, ou como a data da primeira transação de estoque',
    "Speeds up Item search on large catalogues. Requires a single app server: the index is a file on that server's disk, and several servers would each answer from a different copy. Building it takes about 20 minutes for 3 million items, and runs in the background.": 'Acelera a busca de Itens em catálogos grandes. Exige um único servidor de aplicação: o índice é um arquivo no disco desse servidor, e vários servidores responderiam cada um com uma cópia diferente. A criação leva cerca de 20 minutos para 3 milhões de itens e roda em segundo plano.',
    'Tax detail table fetched from item master as a string and stored in this field.\nUsed for Taxes and Charges': 'Tabela de detalhes de impostos obtida do cadastro do item como texto e armazenada neste campo.\nUsada para Impostos e Taxas',
    "Total {0} of all items is zero. Set 'Distribute Charges Based On' to {1}.": "O total de {0} de todos os itens é zero. Defina 'Distribuir Encargos Com Base Em' como {1}.",
    '{0} is both a finished good serial no and batch no in {1}, please specify which one': '{0} é, ao mesmo tempo, nº de série e nº de lote de produto acabado em {1}; informe qual dos dois',
    '{0} is not a finished good serial / batch produced by {1}': '{0} não é um nº de série / lote de produto acabado produzido por {1}',
    '<a href="https://docs.frappe.io/framework/user/en/api/rest#1-token-based-authentication" target="_blank">\n  Click here to learn about token-based authentication\n</a>': '<a href="https://docs.frappe.io/framework/user/en/api/rest#1-token-based-authentication" target="_blank">\n  Clique aqui para saber mais sobre autenticação por token\n</a>',
    'Status of the ticket, when a customer replies on the ticket with this SLA.\n\nIf not selected, the value will be takes from HD Settings DocType.': 'Status do chamado quando um cliente responde ao chamado com este SLA.\n\nSe não for selecionado, o valor será obtido do DocType Configurações do HD.',
    'Status of the ticket, when it is created in the system with this SLA.\nIf not selected, the value will be taken from HD Settings DocType': 'Status do chamado quando ele é criado no sistema com este SLA.\nSe não for selecionado, o valor será obtido do DocType Configurações do HD',
}

adicionadas = 0
for k, v in novas.items():
    if k not in data:
        data[k] = v
        adicionadas += 1
json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("frases adicionadas:", adicionadas, "| total:", len(data))
