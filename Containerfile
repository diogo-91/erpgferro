ARG FRAPPE_BRANCH=version-16
ARG FRAPPE_IMAGE_PREFIX=frappe

FROM ${FRAPPE_IMAGE_PREFIX}/build:${FRAPPE_BRANCH} AS builder

ARG FRAPPE_BRANCH=version-16
ARG FRAPPE_PATH=https://github.com/frappe/frappe

USER frappe

COPY --chown=frappe:frappe apps.json /tmp/apps.json

RUN bench init \
    --frappe-branch=${FRAPPE_BRANCH} \
    --frappe-path=${FRAPPE_PATH} \
    --no-procfile \
    --no-backups \
    --skip-redis-config-generation \
    --verbose \
    /home/frappe/frappe-bench

WORKDIR /home/frappe/frappe-bench

RUN python3 -c "import json;[print(a['url'], a['branch']) for a in json.load(open('/tmp/apps.json'))]" > /tmp/apps.txt && \
  cat /tmp/apps.txt && \
  while read -r url branch; do \
    echo ">>> get-app $url ($branch)"; \
    bench get-app --skip-assets --branch "$branch" "$url" || exit 1; \
  done < /tmp/apps.txt && \
  ls apps

# Marca: troca so os textos visiveis (NAO o app_name/modulo tecnico "erpnext")
RUN cd apps/erpnext/erpnext && \
  sed -i 's/^app_title = "ERPNext"/app_title = "ERP GFerro"/' hooks.py && \
  sed -i 's/"label": "ERPNext"/"label": "ERP GFerro"/' desktop_icon/erpnext.json && \
  sed -i 's/^product_name = "ERPNext"/product_name = "ERP GFerro"/' startup/__init__.py && \
  sed -i 's/"System Settings", "app_name", "ERPNext"/"System Settings", "app_name", "ERP GFerro"/' setup/install.py && \
  sed -i 's#>ERPNext</a>#>ERP GFerro</a>#' setup/install.py && \
  grep -q 'app_title = "ERP GFerro"' hooks.py && \
  grep -q '"label": "ERP GFerro"' desktop_icon/erpnext.json && \
  grep -q 'product_name = "ERP GFerro"' startup/__init__.py && \
  grep -q '"app_name", "ERP GFerro"' setup/install.py && \
  grep -n "GFerro" hooks.py desktop_icon/erpnext.json startup/__init__.py setup/install.py

# Desk GFerro: barra lateral unica, logo e abrir na tela de menu (app_include_css/js do erpnext)
COPY --chown=frappe:frappe personalizacao/desk /tmp/desk
COPY --chown=frappe:frappe personalizacao/painel /tmp/painel
COPY --chown=frappe:frappe personalizacao/producao /tmp/producao
RUN mkdir -p apps/erpnext/erpnext/public/gferro && \
  cp /tmp/desk/gferro-desk.css /tmp/desk/gferro-desk.js /tmp/desk/*.webp apps/erpnext/erpnext/public/gferro/ && \
  cp /tmp/desk/gferro_utils.py apps/erpnext/erpnext/gferro_utils.py && \
  mkdir -p apps/erpnext/erpnext/selling/page/painel_vendas && touch apps/erpnext/erpnext/selling/page/painel_vendas/__init__.py && \
  cp /tmp/painel/painel-vendas.js apps/erpnext/erpnext/selling/page/painel_vendas/painel_vendas.js && \
  cp /tmp/painel/painel-vendas.css apps/erpnext/erpnext/selling/page/painel_vendas/painel_vendas.css && \
  mkdir -p apps/erpnext/erpnext/selling/page/ranking_vendedores && touch apps/erpnext/erpnext/selling/page/ranking_vendedores/__init__.py && \
  cp /tmp/painel/ranking-vendedores.js apps/erpnext/erpnext/selling/page/ranking_vendedores/ranking_vendedores.js && \
  cp /tmp/painel/ranking-vendedores.css apps/erpnext/erpnext/selling/page/ranking_vendedores/ranking_vendedores.css && \
  mkdir -p apps/erpnext/erpnext/manufacturing/page/acompanhamento_producao && touch apps/erpnext/erpnext/manufacturing/page/acompanhamento_producao/__init__.py && \
  cp /tmp/producao/acompanhamento-producao.js apps/erpnext/erpnext/manufacturing/page/acompanhamento_producao/acompanhamento_producao.js && \
  cp /tmp/producao/acompanhamento-producao.css apps/erpnext/erpnext/manufacturing/page/acompanhamento_producao/acompanhamento_producao.css && \
  python3 /tmp/desk/patch_hooks.py apps/erpnext/erpnext/hooks.py && \
  grep -q gferro-desk.js apps/erpnext/erpnext/hooks.py && \
  grep -q gf_qr apps/erpnext/erpnext/hooks.py && ./env/bin/python -c "import pyqrcode"

# Traducoes pt-BR: preenche as frases ainda sem traducao (o bench build compila os .po)
COPY --chown=frappe:frappe i18n /tmp/i18n
RUN ./env/bin/pip install --quiet polib && \
  ./env/bin/python /tmp/i18n/apply_translations.py /tmp/i18n/translations.json apps && \
  ./env/bin/python /tmp/i18n/glossario_nomus.py apps

RUN bench build && \
  echo "{}" > sites/common_site_config.json && \
  find apps -mindepth 1 -path "*/.git" | xargs rm -fr

FROM ${FRAPPE_IMAGE_PREFIX}/base:${FRAPPE_BRANCH} AS backend

USER frappe

COPY --from=builder --chown=frappe:frappe /home/frappe/frappe-bench /home/frappe/frappe-bench

WORKDIR /home/frappe/frappe-bench

# Move assets to image-layer storage
RUN cp -r /home/frappe/frappe-bench/sites/assets /home/frappe/frappe-bench/assets && \
  rm -rf /home/frappe/frappe-bench/sites/assets

VOLUME [ \
  "/home/frappe/frappe-bench/sites", \
  "/home/frappe/frappe-bench/logs" \
]

USER root
# This entrypoint script link build assets of the image to the mounted sites volume at container initialization
COPY resources/core/main-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

COPY resources/core/start.sh /usr/local/bin/start.sh
RUN chmod 755 /usr/local/bin/start.sh

USER frappe
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

CMD ["start.sh"]
