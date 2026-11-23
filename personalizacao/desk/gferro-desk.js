/*
  ERP GFerro - personalizacao do desk (carregada por app_include_js).
  - sempre abre na tela de menu (/desk)
  - barra lateral unica: modulos expansiveis com seus itens
  - logo do Grupo Gferro no topo
*/
(function () {
  var LOGO = "/assets/erpnext/gferro/gferro-logo.webp";
  var ORDER = ["Setup", "Accounts", "Selling", "Buying", "Stock", "Manufacturing", "Projects", "Assets", "Quality"];
  var STORE = "gf-sidebar-open";
  var KANBAN_ORCAMENTO = "/desk/quotation/view/kanban/Or%C3%A7amentos";
  var KANBAN_PEDIDO = "/desk/sales-order/view/kanban/Pedidos";

  // qualquer atalho para a lista de Orcamentos (menu, painel, link) cai no quadro Kanban;
  // quem escolhe "Lista" na troca de visualizacao continua na lista
  function irParaKanban() {
    try {
      var r = frappe.get_route();
      if (r && r[0] === "List" && !/\/view\//.test(location.pathname)) {
        if (r[1] === "Quotation") frappe.set_route("List", "Quotation", "Kanban", "Orçamentos");
        else if (r[1] === "Sales Order") frappe.set_route("List", "Sales Order", "Kanban", "Pedidos");
      }
    } catch (e) {}
  }
  function iniciarRedirecionamento() {
    try { frappe.router.on("change", function () { setTimeout(irParaKanban, 0); }); } catch (e) {}
    setTimeout(irParaKanban, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarRedirecionamento);
  else iniciarRedirecionamento();

  // rotulos que o Frappe deixa em ingles
  var PT = {
    "Access": "Acesso", "Branch": "Filial", "Appointment Booking": "Agendamento",
    "Stock Reposting": "Reprocessamento de Estoque", "Good morning": "Bom dia"
  };
  function tr(s) { return PT[s] || s; }

  // 1) sempre abre na tela de menu
  try {
    if (!sessionStorage.getItem("gf-menu-done")) {
      sessionStorage.setItem("gf-menu-done", "1");
      if (/^\/desk(\/[^\/]+\/home)?\/?$/.test(location.pathname) && location.pathname !== "/desk") {
        location.replace("/desk");
        return;
      }
    }
  } catch (e) {}

  function opened() { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } }
  function saveOpen(k, v) { try { var o = opened(); o[k] = v; localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function icon(name) {
    try { return name ? frappe.utils.icon(name, "sm") : ""; } catch (e) { return ""; }
  }
  var CHEV = '<svg class="gf-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3l5 5-5 5"/></svg>';

  function route(it) {
    try { return frappe.ui.sidebar_item.get_route(it, true) || ""; } catch (e) { return ""; }
  }
  function moduleIcon(mod) {
    var d = document.querySelector('.dock-item[title="' + mod + '"] svg');
    return d ? d.outerHTML : icon("layout-grid");
  }

  function linkHtml(it) {
    var href = route(it);
    // "Orcamento" no menu abre sempre o quadro Kanban
    if (it.link_type === "DocType" && it.link_to === "Quotation") href = KANBAN_ORCAMENTO;
    if (it.link_type === "DocType" && it.link_to === "Sales Order") href = KANBAN_PEDIDO;
    // "Painel" de Vendas abre o Painel de Vendas Gferro (pagina propria)
    if (it.link_type === "Dashboard" && it.link_to === "Selling") href = "/desk/painel-vendas";
    if (!href) return "";
    return '<a class="gf-link" href="' + esc(href) + '" data-href="' + esc(href) + '">' + icon(it.icon) +
      '<span class="gf-label">' + esc(tr(it.label)) + "</span></a>";
  }

  function moduleHtml(mod) {
    var ms = frappe.boot.module_sidebars[mod];
    if (!ms || !ms.items) return "";
    var top = "", sections = [], cur = null;
    ms.items.forEach(function (it) {
      if (it.type === "Section Break") { cur = { label: it.label, icon: it.icon, html: "" }; sections.push(cur); return; }
      if (it.type !== "Link") return;
      var h = linkHtml(it);
      if (!h) return;
      if (cur) cur.html += h; else top += h;
    });
    // Producao: Kanban de acompanhamento das OS (pagina propria) no topo do modulo
    if (mod === "Manufacturing") {
      top = '<a class="gf-link" href="/desk/acompanhamento-producao" data-href="/desk/acompanhamento-producao">' + icon("layout-grid") +
        '<span class="gf-label">Acompanhamento</span></a>' +
        '<a class="gf-link" href="/desk/producao-dashboard/painel" data-href="/desk/producao-dashboard/painel">' + icon("list") +
        '<span class="gf-label">Painel de produção</span></a>' +
        '<a class="gf-link" href="/desk/producao-dashboard/planejamento" data-href="/desk/producao-dashboard/planejamento">' + icon("list") +
        '<span class="gf-label">Planejamento da produção</span></a>' +
        '<a class="gf-link" href="/desk/apontamento-producao" data-href="/desk/apontamento-producao">' + icon("scan") +
        '<span class="gf-label">Apontamento</span></a>' +
        '<a class="gf-link" href="/desk/operador" data-href="/desk/operador">' + icon("users") +
        '<span class="gf-label">Operadores</span></a>' +
        '<a class="gf-link" href="/desk/apontamento-entrega" data-href="/desk/apontamento-entrega">' + icon("list") +
        '<span class="gf-label">Entregas</span></a>' +
        '<a class="gf-link" href="/desk/query-report/Empenhos de Material" data-href="/desk/query-report/Empenhos de Material">' + icon("list") +
        '<span class="gf-label">Empenhos de material</span></a>' +
        '<a class="gf-link" href="/desk/causa-de-parada" data-href="/desk/causa-de-parada">' + icon("list") +
        '<span class="gf-label">Causas de parada</span></a>' + top;
    }
    if (mod === "Buying") {
      top = '<a class="gf-link" href="/desk/importar-nfe-compra" data-href="/desk/importar-nfe-compra">' + icon("upload") +
        '<span class="gf-label">Entrada de NF (XML)</span></a>' +
        '<a class="gf-link" href="/desk/query-report/Necessidade de Compra" data-href="/desk/query-report/Necessidade de Compra">' + icon("list") +
        '<span class="gf-label">Necessidade de compra</span></a>' + top;
    }
    if (mod === "Accounts") {
      top = '<a class="gf-link" href="/desk/planejamento-financeiro" data-href="/desk/planejamento-financeiro">' + icon("list") +
        '<span class="gf-label">Planejamento financeiro</span></a>' +
        '<a class="gf-link" href="/desk/programacao-contas" data-href="/desk/programacao-contas">' + icon("list") +
        '<span class="gf-label">Programação</span></a>' +
        '<a class="gf-link" href="/desk/saidas-financeiras" data-href="/desk/saidas-financeiras">' + icon("list") +
        '<span class="gf-label">Saídas</span></a>' +
        '<a class="gf-link" href="/desk/placas-eps" data-href="/desk/placas-eps">' + icon("list") +
        '<span class="gf-label">Placas de EPS</span></a>' + top;
    }
    if (mod === "Selling") {
      top = '<a class="gf-link" href="/desk/pedidos-dashboard/liberados" data-href="/desk/pedidos-dashboard/liberados">' + icon("list") +
        '<span class="gf-label">Pedidos liberados</span></a>' +
        '<a class="gf-link" href="/desk/pedidos-dashboard/combinados" data-href="/desk/pedidos-dashboard/combinados">' + icon("list") +
        '<span class="gf-label">Pedidos combinados</span></a>' +
        '<a class="gf-link" href="/desk/pedidos-dashboard/formato2" data-href="/desk/pedidos-dashboard/formato2">' + icon("list") +
        '<span class="gf-label">Pedidos Formato 2</span></a>' +
        '<a class="gf-link" href="/desk/pedido-problematico?tipo=Urgente&status=N%C3%A3o%20realizada" data-href="/desk/pedido-problematico?tipo=Urgente&status=N%C3%A3o%20realizada">' + icon("list") +
        '<span class="gf-label">Pedidos urgentes</span></a>' +
        '<a class="gf-link" href="/desk/pedido-problematico?tipo=Devolu%C3%A7%C3%A3o&status=N%C3%A3o%20realizada" data-href="/desk/pedido-problematico?tipo=Devolu%C3%A7%C3%A3o&status=N%C3%A3o%20realizada">' + icon("list") +
        '<span class="gf-label">Pedidos de devolução</span></a>' +
        '<a class="gf-link" href="/desk/pedido-problematico?tipo=Defeito&status=N%C3%A3o%20realizada" data-href="/desk/pedido-problematico?tipo=Defeito&status=N%C3%A3o%20realizada">' + icon("list") +
        '<span class="gf-label">Clientes / defeitos</span></a>' +
        '<a class="gf-link" href="/desk/pedido-problematico?tipo=Devolu%C3%A7%C3%A3o&status=Realizada" data-href="/desk/pedido-problematico?tipo=Devolu%C3%A7%C3%A3o&status=Realizada">' + icon("list") +
        '<span class="gf-label">Pedidos convertidos</span></a>' +
        '<a class="gf-link" href="/desk/comissoes-fabrica" data-href="/desk/comissoes-fabrica">' + icon("list") +
        '<span class="gf-label">Comissões</span></a>' +
        '<a class="gf-link" href="/desk/gestao-metas" data-href="/desk/gestao-metas">' + icon("list") +
        '<span class="gf-label">Gestão (metas)</span></a>' +
        '<a class="gf-link" href="/desk/entregas-dashboard" data-href="/desk/entregas-dashboard">' + icon("list") +
        '<span class="gf-label">Entregas (painel)</span></a>' +
        '<a class="gf-link" href="/desk/mapa-pedidos" data-href="/desk/mapa-pedidos">' + icon("list") +
        '<span class="gf-label">Mapa de pedidos</span></a>' + top;
    }
    var secs = sections.filter(function (s) { return s.html; }).map(function (s) {
      var k = mod + "/" + s.label;
      return '<div class="gf-sec' + (opened()[k] ? " gf-open" : "") + '" data-k="' + esc(k) + '">' +
        '<button class="gf-sec-head" type="button">' + icon(s.icon) + '<span class="gf-label">' + esc(tr(s.label)) + "</span>" + CHEV + "</button>" +
        '<div class="gf-children">' + s.html + "</div></div>";
    }).join("");
    return '<div class="gf-mod' + (opened()[mod] ? " gf-open" : "") + '" data-k="' + esc(mod) + '">' +
      '<button class="gf-mod-head" type="button">' + moduleIcon(mod) + '<span class="gf-label">' + esc(tr(ms.label || mod)) + "</span>" + CHEV + "</button>" +
      '<div class="gf-children">' + top + secs + "</div></div>";
  }

  function markActive() {
    var nav = document.querySelector(".gf-nav");
    if (!nav) return;
    var path = decodeURIComponent(location.pathname);
    var best = null;
    // o Frappe abre listas como /desk/<modulo>/<doctype>; compara tambem pelo ultimo trecho
    var segs = path.split("/").filter(Boolean);
    var tail = segs[segs.length - 1] || "";
    nav.querySelectorAll(".gf-link").forEach(function (a) {
      a.classList.remove("gf-active");
      var h = decodeURIComponent(a.getAttribute("data-href").split("?")[0]);
      if (!h) return;
      var hs = h.split("/").filter(Boolean), score = 0;
      if (path === h) score = 1000 + h.length;
      else if (segs.length > 2 && hs.length > 1 && hs[hs.length - 1] === tail) score = 500 + h.length;
      else if (path.indexOf(h + "/") === 0) score = h.length;
      if (score && (!best || score > best.score)) best = { a: a, score: score };
    });
    nav.querySelectorAll(".gf-has-active").forEach(function (m) { m.classList.remove("gf-has-active"); });
    if (best) {
      best.a.classList.add("gf-active");
      var m = best.a.closest(".gf-mod");
      if (m) { m.classList.add("gf-has-active", "gf-open"); }
      var s = best.a.closest(".gf-sec");
      if (s) s.classList.add("gf-open");
    }
  }

  function build() {
    var side = document.querySelector(".body-sidebar");
    if (!side || side.querySelector(".gf-nav")) return;
    if (!window.frappe || !frappe.boot || !frappe.boot.module_sidebars) return;
    var mods = Array.prototype.map.call(document.querySelectorAll(".dock-item[title]"), function (b) { return b.getAttribute("title"); })
      .filter(function (t) { return frappe.boot.module_sidebars[t]; });
    if (!mods.length) mods = ORDER.filter(function (t) { return frappe.boot.module_sidebars[t]; });

    var brand = document.createElement("a");
    brand.className = "gf-brand"; brand.href = "/desk";
    brand.innerHTML = '<img src="' + LOGO + '" alt="Grupo Gferro">';

    var nav = document.createElement("div");
    nav.className = "gf-nav";
    nav.innerHTML = mods.map(moduleHtml).join("");

    var foot = document.createElement("div");
    foot.className = "gf-foot";
    var name = (frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "";
    foot.innerHTML = '<div class="gf-user">' + esc(name) + "<small>" + esc((frappe.session && frappe.session.user) || "") + "</small></div>" +
      '<a class="gf-home" href="/desk">Menu</a><a href="#" class="gf-logout">Sair</a>';
    foot.querySelector(".gf-logout").addEventListener("click", function (e) {
      e.preventDefault();
      if (frappe.app && frappe.app.logout) frappe.app.logout(); else location.href = "/?cmd=web_logout";
    });

    nav.addEventListener("click", function (e) {
      var h = e.target.closest(".gf-mod-head, .gf-sec-head");
      if (!h) return;
      var box = h.parentElement;
      box.classList.toggle("gf-open");
      saveOpen(box.getAttribute("data-k"), box.classList.contains("gf-open"));
    });

    side.insertBefore(brand, side.firstChild);
    side.appendChild(nav);
    side.appendChild(foot);
    markActive();
  }

  function start() {
    build();
    var mo = new MutationObserver(function () { build(); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", function () { setTimeout(markActive, 50); });
    try { frappe.router.on("change", function () { setTimeout(markActive, 50); }); } catch (e) {}
  }

  /* ---------- KPIs acima do quadro Kanban de orcamentos ---------- */
  var ABERTAS = ["Rascunho", "Enviado ao cliente", "Em negociação"];
  var GANHAS = ["Aprovado", "Pedido gerado"];
  var kpiBusy = false, kpiTimer = null;

  function brl(v) {
    try { return format_currency(v, "BRL"); } catch (e) { return "R$ " + (v || 0).toFixed(2); }
  }
  function isQuotationKanban() {
    return /\/(quotation|sales-order)\/view\/kanban/i.test(location.pathname);
  }
  function kpiCard(cor, rotulo, valor, detalhe) {
    return '<div class="gf-kpi gf-kpi-' + cor + '"><span class="gf-kpi-l">' + esc(rotulo) + '</span>' +
      '<b class="gf-kpi-v">' + esc(valor) + '</b><span class="gf-kpi-d">' + esc(detalhe) + "</span></div>";
  }
  function renderKpisPedido(rows) {
    var host = document.querySelector(".gf-kpis");
    if (!host) return;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var em7 = new Date(hoje.getTime() + 7 * 86400000);
    var mes = hoje.getFullYear() + "-" + ("0" + (hoje.getMonth() + 1)).slice(-2);
    var t = rows.length, and = 0, andV = 0, pagN = 0, pagV = 0, prodN = 0, prodV = 0, entN = 0, entV = 0;
    var prox = 0, atras = 0, mesN = 0;
    rows.forEach(function (r) {
      var v = flt(r.grand_total), e = r.etapa_pedido || "Novo pedido";
      if ((r.transaction_date || "").indexOf(mes) === 0) mesN++;
      if (e === "Entregue") { entN++; entV += v; return; }
      if (e === "Cancelado") { return; }
      and++; andV += v;
      if (e === "Aguardando pagamento") { pagN++; pagV += v; }
      if (e === "Em produção") { prodN++; prodV += v; }
      if (r.delivery_date) {
        var d = new Date(r.delivery_date + "T00:00:00");
        if (d < hoje) atras++; else if (d <= em7) prox++;
      }
    });
    host.innerHTML =
      kpiCard("cinza", "Pedidos", String(t), mesN + " neste mês") +
      kpiCard("amarelo", "Em andamento", brl(andV), and + " pedido(s)") +
      kpiCard("laranja", "Aguardando pagamento", brl(pagV), pagN + " pedido(s)") +
      kpiCard("azul", "Em produção", String(prodN), prodN ? brl(prodV) : "nenhum em produção") +
      kpiCard("verde", "Entregues", brl(entV), entN + " pedido(s)") +
      kpiCard(atras ? "vermelho" : (prox ? "amarelo" : "cinza"), "Entregas",
              atras ? atras + " atrasada(s)" : prox + " em 7 dias",
              atras ? "verifique os prazos" : (prox ? "preparar carga" : "nenhuma próxima"));
  }
  function renderKpis(rows) {
    if (/\/sales-order\//i.test(location.pathname)) { return renderKpisPedido(rows); }
    var host = document.querySelector(".gf-kpis");
    if (!host) return;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var em7 = new Date(hoje.getTime() + 7 * 86400000);
    var mes = hoje.getFullYear() + "-" + ("0" + (hoje.getMonth() + 1)).slice(-2);
    var t = rows.length, soma = 0, abN = 0, abV = 0, ganN = 0, ganV = 0, perN = 0, venc = 0, mesN = 0;
    rows.forEach(function (r) {
      var v = flt(r.grand_total), e = r.etapa || "Rascunho";
      soma += v;
      if ((r.transaction_date || "").indexOf(mes) === 0) mesN++;
      if (ABERTAS.indexOf(e) > -1) {
        abN++; abV += v;
        if (r.valid_till) {
          var d = new Date(r.valid_till + "T00:00:00");
          if (d >= hoje && d <= em7) venc++;
        }
      } else if (GANHAS.indexOf(e) > -1) { ganN++; ganV += v; }
      else if (e === "Perdido") { perN++; }
    });
    var decididos = ganN + perN;
    var conv = decididos ? Math.round(ganN * 100 / decididos) + "%" : "—";
    host.innerHTML =
      kpiCard("cinza", "Orçamentos", String(t), mesN + " neste mês") +
      kpiCard("amarelo", "Em aberto", brl(abV), abN + " orçamento(s)") +
      kpiCard("verde", "Aprovados", brl(ganV), ganN + " orçamento(s)") +
      kpiCard("azul", "Conversão", conv, decididos ? ganN + " de " + decididos + " decididos" : "sem decididos") +
      kpiCard("roxo", "Ticket médio", brl(t ? soma / t : 0), "valor médio por orçamento") +
      kpiCard(venc ? "vermelho" : "cinza", "Vencendo em 7 dias", String(venc), venc ? "peça retorno ao cliente" : "nenhum a vencer");
  }
  function loadKpis() {
    if (kpiBusy || !isQuotationKanban() || !window.frappe || !frappe.call) return;
    kpiBusy = true;
    frappe.call({
      method: "frappe.client.get_list",
      args: /\/sales-order\//i.test(location.pathname)
        ? { doctype: "Sales Order", fields: ["name", "etapa_pedido", "grand_total", "delivery_date", "transaction_date"],
            filters: [["docstatus", "<", 2]], limit_page_length: 0 }
        : { doctype: "Quotation", fields: ["name", "etapa", "grand_total", "valid_till", "transaction_date"],
            filters: [["docstatus", "<", 2]], limit_page_length: 0 },
      callback: function (r) { kpiBusy = false; renderKpis((r && r.message) || []); },
      error: function () { kpiBusy = false; }
    });
  }
  function ensureKpis() {
    if (!isQuotationKanban()) return;
    var board = document.querySelector(".kanban-v2-container");
    if (!board || board.previousElementSibling && board.previousElementSibling.classList.contains("gf-kpis")) return;
    if (document.querySelector(".gf-kpis")) return;
    var host = document.createElement("div");
    host.className = "gf-kpis";
    board.parentNode.insertBefore(host, board);
    loadKpis();
  }
  function kpiStart() {
    var mo = new MutationObserver(function (records) {
      // ignora as mudancas feitas pelos proprios KPIs (evita laco infinito)
      var fora = records.some(function (r) { return !(r.target.closest && r.target.closest(".gf-kpis")); });
      if (!fora) return;
      ensureKpis();
      // o quadro mudou (cartao movido, filtro): atualiza os numeros sem sobrecarregar
      if (document.querySelector(".gf-kpis")) {
        clearTimeout(kpiTimer);
        kpiTimer = setTimeout(loadKpis, 700);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    ensureKpis();
  }

  /* botao PDF da impressao: baixa o arquivo direto, em vez de abrir uma aba do navegador.
     O Frappe abre o PDF com window.open(); aqui a chamada vira um download. */
  (function () {
    var abrirOriginal = window.open;
    function baixarPdf(url) {
      var nome = "documento.pdf";
      try {
        var p = new URL(url, location.origin).searchParams;
        nome = String(p.get("name") || p.get("docname") || "documento").replace(/[\\\/\s]+/g, "-") + ".pdf";
      } catch (e) {}
      fetch(url, { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("falha " + r.status);
          return r.blob();
        })
        .then(function (blob) {
          var a = document.createElement("a");
          var obj = URL.createObjectURL(blob);
          a.href = obj; a.download = nome;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(obj); }, 4000);
        })
        .catch(function () { abrirOriginal.call(window, url, "_blank"); });
    }
    window.open = function (url) {
      try {
        if (url && /\/api\/method\/frappe\.utils\.(print_format|print_format_generator)\.download_pdf/.test(String(url))) {
          baixarPdf(String(url));
          return { closed: false, focus: function () {}, close: function () {} };
        }
      } catch (e) {}
      return abrirOriginal.apply(window, arguments);
    };
  })();

  /* a tela de impressao do ERPNext abre "Inserir Detalhes da Empresa" quando falta logo/site/endereco.
     O modelo Gferro ja traz esses dados, entao a consulta e respondida como "nada faltando". */
  try {
    var chamar = frappe.call;
    frappe.call = function (opts) {
      if (opts && opts.method === "erpnext.controllers.accounts_controller.get_missing_company_details") {
        if (typeof opts.callback === "function") { try { opts.callback({ message: null }); } catch (e) {} }
        return Promise.resolve({ message: null });
      }
      return chamar.apply(this, arguments);
    };
    for (var k in chamar) { if (Object.prototype.hasOwnProperty.call(chamar, k)) frappe.call[k] = chamar[k]; }
  } catch (e) {}

  /* clicar em qualquer parte do cartao do Kanban abre o documento */
  document.addEventListener("click", function (e) {
    var card = e.target.closest && e.target.closest(".kn-card");
    if (!card) return;
    // links, botoes, campos e o titulo (que ja abre sozinho) mantem o comportamento proprio
    if (e.target.closest("a, button, input, select, textarea, .kn-card-title, .dropdown-menu, [role=button]")) return;
    var name = card.getAttribute("data-name");
    var route = frappe.get_route ? frappe.get_route() : [];
    var doctype = (window.cur_list && cur_list.doctype) || (route[0] === "List" ? route[1] : null);
    if (!name || !doctype) return;
    e.preventDefault();
    frappe.set_route("Form", doctype, name);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kpiStart); else kpiStart();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
