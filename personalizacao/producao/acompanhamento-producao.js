/* Acompanhamento da Produção - Grupo Gferro (página "acompanhamento-producao")
 * Tela para a TV da produção: Kanban das Ordens de Serviço (Work Order) em andamento, uma coluna por etapa/centro de trabalho;
 * o card fica na coluna da operação atual (a primeira ainda não concluída). Ao finalizar uma etapa a ordem passa sozinha para a
 * próxima, como "Aguardando". Clicar no card abre os detalhes e os apontamentos já realizados.
 * Lê Ordem de Serviço, Apontamento (Job Card) e Pedido de Venda com frappe.client.get_list (respeita as permissões de quem está logado).
 * Botões: recolher o menu lateral (fica salvo neste computador) e tela cheia. */
frappe.pages["acompanhamento-producao"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Acompanhamento da Produção", single_column: true });
  $(wrapper).addClass("gf-prod");
  wrapper.gf_prod = new GfAcompProducao(page, wrapper);
};
frappe.pages["acompanhamento-producao"].on_page_show = function (wrapper) {
  if (!wrapper.gf_prod) return;
  wrapper.gf_prod.sincronizarMenu();
  wrapper.gf_prod.carregar();
};

// colunas na ordem do fluxo; centros que não estiverem aqui entram no fim
var GFK_COLUNAS = ["CORTE", "CORTE/DOBRA", "CORTE/FORRO", "PINTURA", "COLAGEM", "EXPEDIÇÃO", "LOGÍSTICA"];
var GFK_ABERTAS = ["Not Started", "In Process", "Stopped"];
var GFK_ATUALIZA_MS = 30000;
var GFK_MENU = "gf-tv-menu-recolhido";
var GFK_ROTULO = { aguard: "AGUARDANDO", prod: "EM PRODUÇÃO", pausada: "PAUSADA", concluida: "CONCLUÍDA" };

function GfAcompProducao(page, wrapper) {
  var self = this;
  this.page = page;
  this.wrapper = wrapper;
  this.filtro = "todas";
  this.busca = "";
  this.cards = [];
  this.logs = {};
  this.conectado = true;
  this.kpi = { prod: 0, aguard: 0, pausada: 0, primeiro: 0, semOS: 0 };
  this.montar();
  this.carregar();
  setInterval(function () {
    if ($(self.wrapper).is(":visible")) self.carregar(true);
  }, GFK_ATUALIZA_MS);
  setInterval(function () { self.passarTempo(); }, 1000);
  // ao sair desta página o menu volta; ao voltar, recupera a escolha salva
  try { frappe.router.on("change", function () { self.sincronizarMenu(); }); } catch (e) { /* versão sem evento de rota */ }
}

GfAcompProducao.prototype.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
};
GfAcompProducao.prototype.num = function (n) { return (+n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); };
GfAcompProducao.prototype.data = function (s) {
  if (!s) return "—";
  var d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

GfAcompProducao.prototype.montar = function () {
  var self = this;
  var lupa = '<svg class="gfk-lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var atualizar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>';
  var html =
    '<div class="gfk">' +
    '<div class="gfk-cab">' +
    '<div class="gfk-titulo"><h1>ACOMPANHAMENTO DA PRODUÇÃO</h1><p>Acompanhe o status das ordens em cada etapa do processo.</p></div>' +
    '<div class="gfk-kpis">' +
    '<div class="gfk-kpi gfk-verde"><b data-k="prod">0</b><span>EM PRODUÇÃO</span></div>' +
    '<div class="gfk-kpi gfk-amarelo"><b data-k="aguard">0</b><span>AGUARDANDO</span></div>' +
    '<div class="gfk-kpi gfk-vermelho"><b data-k="pausada">0</b><span>PAUSADA</span></div>' +
    '<div class="gfk-kpi"><b data-k="primeiro">0</b><span>AGUARDANDO 1º PROCESSO</span></div>' +
    '<div class="gfk-kpi gfk-link" data-ir="pedidos" title="Abrir os pedidos de venda"><b data-k="semOS">0</b><span>LIBERADOS SEM PRODUÇÃO</span></div>' +
    "</div></div>" +
    '<div class="gfk-barra">' +
    '<label class="gfk-busca-w">' + lupa + '<input class="gfk-busca" type="search" placeholder="Buscar OS, pedido ou produto..."></label>' +
    '<select class="gfk-filtro"><option value="todas">Todas as ordens</option><option value="prod">Em produção</option>' +
    '<option value="aguard">Aguardando</option><option value="pausada">Pausadas</option><option value="ocultas">Ocultas do quadro</option></select>' +
    '<button class="gfk-btn" type="button">' + atualizar + 'Atualizar</button>' +
    '<span class="gfk-auto"><i></i>Atualização automática</span>' +
    '<span class="gfk-vazio-geral" hidden>Nenhuma ordem em produção no momento.</span>' +
    '<span class="gfk-esp"></span>' +
    '<button class="gfk-btn gfk-btn-menu" type="button" data-tv="menu"></button>' +
    '<button class="gfk-btn" type="button" data-tv="tela">Tela cheia</button></div>' +
    '<div class="gfk-quadro"></div>' +
    '<div class="gfk-rodape"><span class="gfk-ult">Última atualização: —</span><span class="gfk-conectado"><i></i><em>sistema conectado</em></span></div>' +
    '<div class="gfk-modal" hidden></div></div>';
  $(this.page.main).html(html);
  var $m = $(this.page.main);
  $m.find(".gfk-busca").on("input", function () { self.busca = $(this).val().toLowerCase(); self.desenhar(); });
  $m.find(".gfk-filtro").on("change", function () { self.filtro = $(this).val(); self.desenhar(); });
  $m.find(".gfk-btn:not([data-tv])").on("click", function () { self.carregar(); });
  $m.on("click", ".gfk-card", function () { self.detalhe($(this).attr("data-os")); });
  $m.on("click", "[data-ir='pedidos']", function () { frappe.set_route("List", "Sales Order"); });
  $m.on("click", "[data-tv='menu']", function () { self.recolherMenu(!$("body").hasClass("gf-menu-recolhido"), true); });
  $m.on("click", "[data-tv='tela']", function () { self.telaCheia(); });
  // detalhe do card
  $m.on("click", ".gfk-modal", function (e) { if ($(e.target).is(".gfk-modal")) self.fecharDetalhe(); });
  $m.on("click", ".gfk-m-fechar", function () { self.fecharDetalhe(); });
  $m.on("click", ".gfk-m-ocultar", function () { self.ocultar($(this).attr("data-os"), $(this).attr("data-valor") === "1"); });
  $m.on("click", ".gfk-m-abrir", function () { frappe.set_route("Form", "Work Order", $(this).attr("data-os")); });
  $(document).on("keydown.gfk", function (e) { if (e.which === 27) self.fecharDetalhe(); });
  this.rotuloMenu();
};

// ---- menu lateral recolhido / tela cheia (modo TV) ----
GfAcompProducao.prototype.guardado = function () {
  try { return localStorage.getItem(GFK_MENU) === "1"; } catch (e) { return false; }
};
GfAcompProducao.prototype.recolherMenu = function (recolher, salvar) {
  $("body").toggleClass("gf-menu-recolhido", !!recolher);
  if (salvar) { try { localStorage.setItem(GFK_MENU, recolher ? "1" : "0"); } catch (e) { /* sem armazenamento */ } }
  this.rotuloMenu();
};
GfAcompProducao.prototype.rotuloMenu = function () {
  $(this.page.main).find("[data-tv='menu']").text($("body").hasClass("gf-menu-recolhido") ? "Mostrar menu" : "Recolher menu");
};
GfAcompProducao.prototype.sincronizarMenu = function () {
  var nestaPagina = (frappe.get_route && frappe.get_route()[0] === "acompanhamento-producao");
  $("body").toggleClass("gf-menu-recolhido", nestaPagina && this.guardado());
  this.rotuloMenu();
};
GfAcompProducao.prototype.telaCheia = function () {
  var self = this, d = document;
  if (!d.fullscreenElement) {
    this.recolherMenu(true, true);
    var el = d.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
  } else {
    (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
  }
  setTimeout(function () { self.rotuloMenu(); }, 200);
};

GfAcompProducao.prototype.buscar = function (doctype, fields, filters, extra) {
  var args = $.extend({ doctype: doctype, fields: fields, filters: filters || [], limit_page_length: 0 }, extra || {});
  return new Promise(function (ok, erro) {
    frappe.call({ method: "frappe.client.get_list", args: args, callback: function (r) { ok(r.message || []); }, error: erro });
  });
};

GfAcompProducao.prototype.carregar = function (silencioso) {
  var self = this;
  if (this.carregando) return;
  this.carregando = true;
  var campoOS = ["name", "production_item", "item_name", "qty", "stock_uom", "produced_qty", "status", "sales_order", "planned_start_date",
    "expected_delivery_date", "actual_start_date", "creation", "ocultar_no_quadro"];
  var ok = true;
  Promise.all([
    this.buscar("Work Order", campoOS, [["docstatus", "=", 1], ["status", "in", GFK_ABERTAS]], { order_by: "creation asc" }),
    this.buscar("Workstation", ["name", "workstation_type"], []),
    this.buscar("Work Order", ["sales_order"], [["docstatus", "<", 2], ["sales_order", "is", "set"]]),
    this.buscar("Sales Order", ["name"], [["docstatus", "=", 1], ["status", "not in", ["Closed", "Completed", "Cancelled", "On Hold"]]])
  ]).then(function (r) {
    var wos = r[0], nomes = wos.map(function (w) { return w.name; });
    self.tipoPosto = {};
    r[1].forEach(function (p) { self.tipoPosto[p.name] = p.workstation_type; });
    var comOS = {};
    r[2].forEach(function (w) { comOS[w.sales_order] = 1; });
    self.kpi.semOS = r[3].filter(function (s) { return !comOS[s.name]; }).length;
    if (!nomes.length) return [wos, [], []];
    return Promise.all([
      self.buscar("Work Order Operation", ["parent", "idx", "operation", "status", "sequence_id", "workstation", "workstation_type",
        "actual_start_time", "actual_end_time"], [["parent", "in", nomes]], { parent: "Work Order" }),
      self.buscar("Job Card", ["name", "work_order", "operation", "status", "workstation", "workstation_type", "actual_start_date",
        "modified", "operador", "is_paused"], [["work_order", "in", nomes], ["docstatus", "<", 2]])
    ]).then(function (x) { return [wos, x[0], x[1]]; });
  }).then(function (d) {
    return self.apontamentos(d[2]).then(function () { self.montarCards(d[0], d[1], d[2]); });
  }).catch(function (e) {
    ok = false;
    if (window.console) console.error(e);
  }).then(function () {
    self.carregando = false;
    self.conectado = ok;
    if (ok) self.ultima = new Date();
    self.desenhar();
  });
};

// linhas de tempo (apontamentos) de cada etapa: quem trabalhou, quando e por quanto tempo
GfAcompProducao.prototype.apontamentos = function (jcs) {
  var self = this;
  this.logs = {};
  var nomes = jcs.map(function (j) { return j.name; });
  if (!nomes.length) return Promise.resolve();
  return this.buscar("Job Card Time Log", ["parent", "from_time", "to_time", "time_in_mins", "completed_qty", "operador", "matricula"],
    [["parent", "in", nomes]], { parent: "Job Card", order_by: "from_time asc" }).then(function (logs) {
    logs.forEach(function (l) { (self.logs[l.parent] = self.logs[l.parent] || []).push(l); });
  }).catch(function () { /* sem permissão para ver os apontamentos: segue sem o tempo trabalhado */ });
};

GfAcompProducao.prototype.coluna = function (operacao, tipo) {
  var o = (operacao || "").toUpperCase();
  if (o.indexOf("CORTE") > -1 && o.indexOf("FORRO") > -1) return "CORTE/FORRO";
  return (tipo || "").toUpperCase() || "OUTROS";
};

GfAcompProducao.prototype.ms = function (s) { return s ? new Date(String(s).replace(" ", "T")).getTime() : null; };

GfAcompProducao.prototype.montarCards = function (wos, ops, jcs) {
  var self = this, agora = Date.now();
  var opsPor = {}, jcPor = {};
  ops.forEach(function (o) { (opsPor[o.parent] = opsPor[o.parent] || []).push(o); });
  jcs.forEach(function (j) { jcPor[j.work_order + "|" + j.operation] = j; });
  this.cards = [];
  this.kpi.primeiro = 0;
  this.carregadoEm = agora;
  wos.forEach(function (w) {
    var oculta = !!(+w.ocultar_no_quadro);
    var lista = (opsPor[w.name] || []).sort(function (a, b) { return (a.sequence_id || a.idx) - (b.sequence_id || b.idx) || a.idx - b.idx; });
    if (!lista.length) { if (!oculta) self.kpi.primeiro++; return; }
    var feitas = lista.filter(function (o) { return o.status === "Completed"; }).length;
    if (feitas === lista.length) return;  // todas as etapas feitas: a ordem saiu da produção
    var atual = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].status !== "Completed") { atual = lista[i]; break; }
    var jc = jcPor[w.name + "|" + atual.operation];
    var logs = jc ? (self.logs[jc.name] || []) : [];
    var aberto = null;
    logs.forEach(function (l) { if (l.from_time && !l.to_time) aberto = l; });
    var emAndamento = !!aberto || (jc && jc.status === "Work In Progress" && !jc.is_paused);
    var pausada = !!(jc && (jc.status === "On Hold" || jc.is_paused));
    var iniciada = feitas > 0 || emAndamento || pausada || w.status === "In Process" || (jc && jc.actual_start_date);
    if (!iniciada) { if (!oculta) self.kpi.primeiro++; return; }
    var estado = pausada ? "pausada" : emAndamento ? "prod" : "aguard";
    // tempo do card: em produção = tempo trabalhado; pausada = tempo parado; aguardando = espera desde a etapa anterior
    var seg = null;
    if (estado === "prod") {
      var trab = 0;
      logs.forEach(function (l) { if (l.to_time) trab += (+l.time_in_mins || 0) * 60; });
      var ini = aberto ? self.ms(aberto.from_time) : self.ms(jc && jc.actual_start_date);
      seg = trab + (ini ? Math.max(0, (agora - ini) / 1000) : 0);
    } else if (estado === "pausada") {
      var fim = null;
      logs.forEach(function (l) { if (l.to_time) fim = self.ms(l.to_time); });
      seg = fim ? Math.max(0, (agora - fim) / 1000) : null;
    } else {
      var anterior = lista.filter(function (o) { return o.status === "Completed" && o.actual_end_time; }).map(function (o) { return o.actual_end_time; }).sort().pop();
      var desde = self.ms(anterior || w.actual_start_date || w.creation);
      seg = desde ? Math.max(0, (agora - desde) / 1000) : null;
    }
    var operador = jc ? (jc.operador || "") : "";
    if (!operador) logs.forEach(function (l) { if (l.operador) operador = l.operador; });
    self.cards.push({
      os: w.name, pd: w.sales_order || "", codigo: w.production_item, produto: w.item_name || w.production_item, operacao: atual.operation,
      etapa: atual.sequence_id || atual.idx, feitas: feitas, total: lista.length, estado: estado, oculta: oculta,
      centro: (atual.workstation_type || (jc && jc.workstation_type) || self.tipoPosto[atual.workstation] || ""), jc: jc ? jc.name : "",
      coluna: self.coluna(atual.operation, atual.workstation_type || (jc && jc.workstation_type) || self.tipoPosto[atual.workstation]),
      operador: operador, seg: seg
    });
  });
  var k = { prod: 0, aguard: 0, pausada: 0 };
  this.cards.forEach(function (c) { if (!c.oculta) k[c.estado]++; });
  $.extend(this.kpi, k);
};

GfAcompProducao.prototype.tempo = function (seg) {
  if (seg == null || seg === "") return "-";
  var t = Math.floor(seg), p = function (n) { return ("0" + n).slice(-2); };
  return p(Math.floor(t / 3600)) + ":" + p(Math.floor((t % 3600) / 60)) + ":" + p(t % 60);
};

// os cronômetros andam a cada segundo, sem precisar recarregar
GfAcompProducao.prototype.passarTempo = function () {
  var self = this, extra = (Date.now() - (this.carregadoEm || Date.now())) / 1000;
  $(this.page.main).find(".gfk-tempo[data-seg]").each(function () {
    var base = $(this).attr("data-seg");
    if (base !== "") $(this).find("span").text(self.tempo(parseFloat(base) + extra));
  });
};

GfAcompProducao.prototype.desenhar = function () {
  var self = this, $m = $(this.page.main);
  Object.keys(this.kpi).forEach(function (k) { $m.find('[data-k="' + k + '"]').text(self.kpi[k].toLocaleString("pt-BR")); });
  var relogio = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var visiveis = this.cards.filter(function (c) {
    if (self.filtro === "ocultas") return c.oculta;
    if (c.oculta) return false;
    if (self.filtro !== "todas" && c.estado !== self.filtro) return false;
    return !self.busca || (c.os + " " + c.pd + " " + c.codigo + " " + c.produto).toLowerCase().indexOf(self.busca) > -1;
  });
  var colunas = GFK_COLUNAS.slice();
  visiveis.forEach(function (c) { if (colunas.indexOf(c.coluna) < 0) colunas.push(c.coluna); });
  var html = colunas.map(function (nome) {
    var cs = visiveis.filter(function (c) { return c.coluna === nome; });
    var corpo = cs.length ? cs.map(function (c) {
      var pct = c.total ? Math.round(100 * c.feitas / c.total) : 0;
      var tempo = '<span class="gfk-tempo" data-seg="' + (c.seg == null ? "" : c.seg) + '">' + relogio + "<span>" + self.tempo(c.seg) + "</span></span>";
      var rodape = c.estado === "prod"
        ? (c.operador ? '<div class="gfk-oper">' + self.esc(c.operador) + "</div>" : "") +
          '<div class="gfk-st gfk-st-prod">' + GFK_ROTULO.prod + "</div>" + tempo
        : '<div class="gfk-linha-st"><span class="gfk-st gfk-st-' + c.estado + '">' + GFK_ROTULO[c.estado] + "</span>" + tempo + "</div>";
      return '<div class="gfk-card" data-os="' + self.esc(c.os) + '">' +
        '<div class="gfk-os"><span>' + self.esc(c.os) + "</span>" + (c.pd ? '<em class="gfk-pd">' + self.esc(c.pd) + "</em>" : "") + "</div>" +
        '<div class="gfk-prod">' + self.esc(c.produto) + "</div>" +
        '<div class="gfk-op">' + self.esc(c.operacao) + "</div>" +
        '<div class="gfk-etapa">Etapa ' + self.esc(c.etapa) + " · " + c.feitas + "/" + c.total + " etapas concluídas</div>" +
        '<div class="gfk-prog"><i style="width:' + pct + '%"></i></div>' + rodape + "</div>";
    }).join("") : '<div class="gfk-vazio">—</div>';
    return '<div class="gfk-col"><div class="gfk-col-cab"><span>' + self.esc(nome) + "</span><b>" + cs.length + '</b></div><div class="gfk-col-corpo">' + corpo + "</div></div>";
  }).join("");
  var rolagem = {};  // preserva a rolagem de cada coluna quando a tela atualiza sozinha
  $m.find(".gfk-col-corpo").each(function (i) { rolagem[i] = this.scrollTop; });
  $m.find(".gfk-quadro").html(html);
  $m.find(".gfk-col-corpo").each(function (i) { this.scrollTop = rolagem[i] || 0; });
  $m.find(".gfk-vazio-geral").prop("hidden", this.cards.length > 0 || this.carregando || this.filtro !== "todas" || !!this.busca);
  // rodapé: última atualização e estado da conexão
  $m.find(".gfk-ult").text("Última atualização: " + (this.ultima ? this.ultima.toLocaleString("pt-BR") : "—"));
  $m.find(".gfk-conectado").toggleClass("gfk-off", !this.conectado).find("em").text(this.conectado ? "sistema conectado" : "sem conexão com o sistema");
};

// ---- detalhe do card: informações da ordem + apontamentos já realizados ----
GfAcompProducao.prototype.fecharDetalhe = function () {
  $(this.page.main).find(".gfk-modal").attr("hidden", true).empty();
};

GfAcompProducao.prototype.detalhe = function (os) {
  var self = this, $mo = $(this.page.main).find(".gfk-modal");
  var c = this.cards.filter(function (x) { return x.os === os; })[0];
  if (!c) return;
  $mo.html('<div class="gfk-m-caixa"><div class="gfk-m-carregando">Carregando...</div></div>').removeAttr("hidden");
  var pedeDoc = new Promise(function (ok, erro) {
    frappe.call({ method: "frappe.client.get", args: { doctype: "Work Order", name: os }, callback: function (r) { ok(r.message || {}); }, error: erro });
  });
  var pedeJc = this.buscar("Job Card", ["name", "operation", "sequence_id", "status", "workstation", "workstation_type", "docstatus", "is_paused",
    "operador", "for_quantity", "total_completed_qty", "total_time_in_mins"], [["work_order", "=", os], ["docstatus", "<", 2]], { order_by: "sequence_id asc" });
  Promise.all([pedeDoc, pedeJc]).then(function (r) {
    var doc = r[0], jcs = r[1], nomes = jcs.map(function (j) { return j.name; });
    if (!nomes.length) return [doc, jcs, []];
    return self.buscar("Job Card Time Log", ["parent", "from_time", "to_time", "time_in_mins", "completed_qty", "operador"],
      [["parent", "in", nomes]], { parent: "Job Card", order_by: "from_time asc" }).then(function (logs) { return [doc, jcs, logs]; });
  }).then(function (d) {
    $mo.find(".gfk-m-caixa").replaceWith(self.htmlDetalhe(c, d[0], d[1], d[2]));
  }).catch(function () {
    $mo.find(".gfk-m-caixa").html('<div class="gfk-m-carregando">Não foi possível carregar os detalhes.</div><button class="gfk-m-btn gfk-m-fechar" type="button">Fechar</button>');
  });
};

GfAcompProducao.prototype.htmlDetalhe = function (c, doc, jcs, logs) {
  var self = this, e = this.esc, un = doc.stock_uom || "";
  var linha = function (rot, val) { return '<div class="gfk-m-linha"><span>' + rot + "</span><b>" + val + "</b></div>"; };
  var estadoJc = function (j) {
    if (j.docstatus === 1 || j.status === "Completed") return ["CONCLUÍDA", "gfk-st-ok"];
    if (j.is_paused || j.status === "On Hold") return ["PAUSADA", "gfk-st-pausada"];
    if (j.status === "Work In Progress") return ["EM PRODUÇÃO", "gfk-st-prod"];
    return ["AGUARDANDO", "gfk-st-aguard"];
  };
  var materiais = (doc.required_items || []).map(function (m) {
    return '<div class="gfk-m-mat"><span>' + e(m.item_name || m.item_code) + "</span><b>" + self.num(m.required_qty) + " " + e(m.stock_uom || m.uom || "") + "</b></div>";
  }).join("") || '<div class="gfk-m-vazio">Sem materiais cadastrados na ordem.</div>';
  jcs = jcs.slice().sort(function (x, y) { return (x.sequence_id || 0) - (y.sequence_id || 0); });
  var etapas = jcs.map(function (j) {
    var meus = logs.filter(function (l) { return l.parent === j.name; });
    var st = estadoJc(j), total = 0;
    meus.forEach(function (l) { total += +l.time_in_mins || 0; });
    var tab = meus.length ? '<table class="gfk-m-tab"><tr><th>Operador</th><th>Início</th><th>Fim</th><th>Tempo</th><th>Qtd.</th></tr>' + meus.map(function (l) {
      return "<tr><td>" + e(l.operador || "—") + "</td><td>" + self.data(l.from_time) + "</td><td>" + (l.to_time ? self.data(l.to_time) : "em andamento") +
        "</td><td>" + (l.to_time ? self.tempo((+l.time_in_mins || 0) * 60) : "—") + "</td><td>" + (+l.completed_qty ? self.num(l.completed_qty) : "—") + "</td></tr>";
    }).join("") + "</table>" : '<div class="gfk-m-vazio">Sem apontamentos ainda.</div>';
    return '<div class="gfk-m-etapa"><div class="gfk-m-et-cab"><span>' + e(j.sequence_id) + ". " + e(j.operation) +
      (j.workstation_type ? " · " + e(j.workstation_type) : "") + '</span><span class="gfk-st ' + st[1] + '">' + st[0] + "</span></div>" + tab +
      (total ? '<div class="gfk-m-total">Tempo trabalhado na etapa: <b>' + self.tempo(total * 60) + "</b></div>" : "") + "</div>";
  }).join("");
  var jcAtual = c.jc || "";
  return '<div class="gfk-m-caixa" role="dialog">' +
    '<div class="gfk-m-tit"><span>' + e(c.os) + "</span>" + (c.pd ? '<em class="gfk-pd">' + e(c.pd) + "</em>" : "") + "</div>" +
    linha("STATUS", '<span class="gfk-st gfk-st-' + c.estado + '">' + GFK_ROTULO[c.estado] + "</span>") +
    linha("CENTRO DE TRABALHO", e(c.centro || "—")) +
    linha("ETAPA ATUAL", e(c.etapa) + " — " + e(c.operacao)) +
    linha("PROGRESSO DO ROTEIRO", c.feitas + "/" + c.total + " etapas concluídas") +
    linha("PRODUTO", e(c.produto)) +
    linha("QUANTIDADE", self.num(doc.qty) + " " + e(un)) +
    '<div class="gfk-m-sec">MATERIAL NECESSÁRIO</div>' + materiais +
    linha("OPERADOR", e(c.operador || "—")) +
    linha("TEMPO", '<span class="gfk-m-tempo">' + self.tempo(c.seg) + "</span>") +
    linha("ID INTERNO (ORDEM / ETAPA)", e(c.os) + (jcAtual ? " / " + e(jcAtual) : "")) +
    '<div class="gfk-m-sec">ETAPAS E APONTAMENTOS REALIZADOS</div>' + etapas +
    '<div class="gfk-m-acoes">' +
    '<button class="gfk-m-btn gfk-m-ocultar" type="button" data-os="' + e(c.os) + '" data-valor="' + (c.oculta ? "0" : "1") + '">' + (c.oculta ? "Mostrar no quadro" : "Ocultar pedido do quadro") + "</button>" +
    '<button class="gfk-m-btn gfk-m-sec2 gfk-m-fechar" type="button">Fechar</button></div>' +
    '<a class="gfk-m-abrir" data-os="' + e(c.os) + '">Abrir a ordem no sistema</a></div>';
};

GfAcompProducao.prototype.ocultar = function (os, ocultar) {
  var self = this;
  frappe.call({
    method: "frappe.client.set_value", args: { doctype: "Work Order", name: os, fieldname: "ocultar_no_quadro", value: ocultar ? 1 : 0 },
    callback: function () { self.fecharDetalhe(); self.carregando = false; self.carregar(); },
    error: function () { frappe.msgprint("Não foi possível alterar. Veja se você tem permissão para editar a ordem."); }
  });
};
