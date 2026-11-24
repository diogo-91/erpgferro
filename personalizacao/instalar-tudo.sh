#!/bin/bash
# Instalador GFerro: registra no site todas as personalizacoes (telas, campos, formatos de impressao, perfis, traducoes).
# Uso (terminal do container backend no Easypanel):
#   bash /home/frappe/gferro-setup/instalar-tudo.sh [site]
# Pode rodar de novo; cada etapa que falhar e listada no fim e nao impede as outras.
SITE="${1:-erp.gferro.com.br}"
SETUP=/home/frappe/gferro-setup
cd /home/frappe/frappe-bench || exit 1

# os scripts esperam seus arquivos soltos em /tmp
find "$SETUP" -type f ! -name '*.sh' -exec cp -f {} /tmp/ \;

ETAPAS="traduzir-cadastros aplicar-no-site aplicar-orcamento aplicar-formulario-orcamento aplicar-layout-orcamento aplicar-kanban-orcamento aplicar-pedido-venda aplicar-permissoes-lojas aplicar-estoque aplicar-apontamento aplicar-acompanhamento-producao aplicar-entregas aplicar-parciais aplicar-nfe-compra aplicar-painel-vendas aplicar-comissoes aplicar-pedidos-dashboard aplicar-entregas-mapa aplicar-financeiro aplicar-planejamento aplicar-producao-dashboard aplicar-gestao"

bench set-config -g server_script_enabled 1
FALHAS=""
for e in $ETAPAS; do
  echo "=== $e"
  if [ ! -f "/tmp/$e.py" ]; then echo "arquivo ausente"; FALHAS="$FALHAS $e(ausente)"; continue; fi
  out=$(echo "exec(open('/tmp/$e.py').read(), globals())" | bench --site "$SITE" console 2>&1)
  echo "$out" | tail -n 15
  if echo "$out" | grep -q "Traceback"; then FALHAS="$FALHAS $e"; fi
done

echo "=== ajustes finais"
echo "frappe.db.set_single_value('Website Settings','home_page','login'); frappe.db.commit()" | bench --site "$SITE" console 2>&1 | tail -n 3
bench --site "$SITE" migrate && bench --site "$SITE" clear-cache

echo
if [ -z "$FALHAS" ]; then echo "INSTALACAO CONCLUIDA SEM ERROS. Reinicie o backend."; else echo "CONCLUIDA COM FALHAS em:$FALHAS"; fi
