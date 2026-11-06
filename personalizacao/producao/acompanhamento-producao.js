/* Acompanhamento da Produção - Grupo Gferro (página "acompanhamento-producao")
 * Kanban das Ordens de Produção em andamento: uma coluna por etapa/centro de trabalho, o card fica na coluna da
 * operação atual (a primeira ainda não concluída). Lê Ordem de Produção, Job Card e Pedido de Venda com
 * frappe.client.get_list (respeita as permissões de quem está logado). */
frappe.pages["acompanhamento-producao"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Acompanhamento da Produção", single_column: true });
  $(wrapper).addClass("gf-prod");
  wrapper.gf_prod = new GfAcompProducao(page, wrapper);
};
frappe.pages["acompanhamento-producao"].on_page_show = function (wrapper) {
  if (wrapper.gf_prod) wrapper.gf_prod.carregar();
};

// colunas na ordem do fluxo; centros que não estiverem aqui entram no fim
var GFK_COLUNAS = ["CORTE", "CORTE/DOBRA", "CORTE/FORRO", "PINTURA", "COLAGEM", "EXPEDIÇÃO", "LOGÍSTICA"];
var GFK_ABERTAS = ["Not Started", "In Process", "Stopped"];
var GFK_ATUALIZA_MS = 60000;

function GfAcompProducao(page, wrapper) {
  var self = this;
  this.page = page;
  this.wrapper = wrapper;
  this.filtro = "todas";
  this.busca = "";
  this.cards = [];
  this.kpi = { prod: 0, aguard: 0, pausada: 0, primeiro: 0, semOS: 0 };
  this.montar();
  this.carregar();
  setInterval(function () {
    if ($(self.wrapper).is(":visible")) self.carregar(true);
  }, GFK_ATUALIZA_MS);
}

GfAcompProducao.prototype.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
};

GfAcompProducao.prototype.montar = function () {
  var self = this;
  var html =
    '<div class="gfk">' +
    '<div class="gfk-top">' +
    '<div class="gfk-titulo"><h1>ACOMPANHAMENTO DA PRODUÇÃO</h1><p>Acompanhe o status das ordens em cada etapa do processo.</p></div>' +
    '<div class="gfk-kpis">' +
    '<div class="gfk-kpi gfk-verde"><b data-k="prod">0</b><span>EM PRODUÇÃO</span></div>' +
    '<div class="gfk-kpi gfk-amarelo"><b data-k="aguard">0</b><span>AGUARDANDO</span></div>' +
    '<div class="gfk-kpi gfk-vermelho"><b data-k="pausada">0</b><span>PAUSADA</span></div>' +
    '<div class="gfk-kpi"><b data-k="primeiro">0</b><span>AGUARDANDO 1º PROCESSO</span></div>' +
    '<div class="gfk-kpi"><b data-k="semOS">0</b><span>LIBERADOS SEM PRODUÇÃO</span></div>' +
    "</div></div>" +
    '<div class="gfk-barra">' +
    '<input class="gfk-busca" type="search" placeholder="Buscar OS, pedido ou produto...">' +
    '<select class="gfk-filtro"><option value="todas">Todas as ordens</option><option value="prod">Em produção</option>' +
    '<option value="aguard">Aguardando</option><option value="pausada">Pausadas</option></select>' +
    '<button class="gfk-btn" type="button">&#8635; Atualizar</button>' +
    '<span class="gfk-auto"><i></i>Atualização automática</span>' +
    '<span class="gfk-msg"></span></div>' +
    '<div class="gfk-quadro"></div></div>';
  $(this.page.main).html(html);
  var $m = $(this.page.main);
  $m.find(".gfk-busca").on("input", function () { self.busca = $(this).val().toLowerCase(); self.desenhar(); });
  $m.find(".gfk-filtro").on("change", function () { self.filtro = $(this).val(); self.desenhar(); });
  $m.find(".gfk-btn").on("click", function () { self.carregar(); });
  $m.on("click", ".gfk-card", function () { frappe.set_route("Form", "Work Order", $(this).attr("data-os")); });
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
  if (!silencioso) $(this.page.main).find(".gfk-msg").text("Carregando...");
  var campoOS = ["name", "production_item", "item_name", "qty", "produced_qty", "status", "sales_order", "planned_start_date",
    "expected_delivery_date", "actual_start_date", "creation"];
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
    return self.operadores(d[2]).then(function () { self.montarCards(d[0], d[1], d[2]); });
  }).catch(function (e) {
    $(self.page.main).find(".gfk-msg").text("Erro ao carregar os dados.");
    if (window.console) console.error(e);
  }).then(function () {
    self.carregando = false;
    self.desenhar();
    $(self.page.main).find(".gfk-msg").text("Atualizado às " + new Date().toLocaleTimeString("pt-BR"));
  });
};

// funcionário que está apontando em cada Job Card (só existe quando houver funcionários cadastrados)
GfAcompProducao.prototype.operadores = function (jcs) {
  var self = this;
  this.operador = {};
  var nomes = jcs.map(function (j) { return j.name; });
  if (!nomes.length) return Promise.resolve();
  return this.buscar("Job Card Time Log", ["parent", "employee", "from_time", "to_time"], [["parent", "in", nomes], ["employee", "is", "set"]],
    { parent: "Job Card", order_by: "from_time asc" }).then(function (logs) {
    var ids = {};
    logs.forEach(function (l) { self.operador[l.parent] = l.employee; ids[l.employee] = 1; });
    var lista = Object.keys(ids);
    if (!lista.length) return;
    return self.buscar("Employee", ["name", "employee_name"], [["name", "in", lista]]).then(function (emps) {
      var nome = {};
      emps.forEach(function (e) { nome[e.name] = e.employee_name; });
      Object.keys(self.operador).forEach(function (jc) { self.operador[jc] = nome[self.operador[jc]] || self.operador[jc]; });
    });
  }).catch(function () { /* sem permissão para ver funcionários: segue sem operador */ });
};

GfAcompProducao.prototype.coluna = function (operacao, tipo) {
  var o = (operacao || "").toUpperCase();
  if (o.indexOf("CORTE") > -1 && o.indexOf("FORRO") > -1) return "CORTE/FORRO";
  return (tipo || "").toUpperCase() || "OUTROS";
};

GfAcompProducao.prototype.montarCards = function (wos, ops, jcs) {
  var self = this, agora = Date.now();
  var opsPor = {}, jcPor = {};
  ops.forEach(function (o) { (opsPor[o.parent] = opsPor[o.parent] || []).push(o); });
  jcs.forEach(function (j) { jcPor[j.work_order + "|" + j.operation] = j; });
  this.cards = [];
  this.kpi.primeiro = 0;
  wos.forEach(function (w) {
    var lista = (opsPor[w.name] || []).sort(function (a, b) { return (a.sequence_id || a.idx) - (b.sequence_id || b.idx) || a.idx - b.idx; });
    if (!lista.length) { self.kpi.primeiro++; return; }
    var feitas = lista.filter(function (o) { return o.status === "Completed"; }).length;
    var atual = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].status !== "Completed") { atual = lista[i]; break; }
    if (!atual) atual = lista[lista.length - 1];
    var jc = jcPor[w.name + "|" + atual.operation];
    var emAndamento = (jc && jc.status === "Work In Progress") || atual.status === "Work in Progress";
    var pausada = jc && (jc.status === "On Hold" || jc.is_paused);
    var iniciada = feitas > 0 || emAndamento || pausada || w.status === "In Process" || (jc && jc.actual_start_date);
    if (!iniciada) { self.kpi.primeiro++; return; }
    var estado = pausada ? "pausada" : emAndamento ? "prod" : "aguard";
    var desde = null;
    if (estado === "prod") desde = (jc && jc.actual_start_date) || atual.actual_start_time;
    else {
      var anterior = lista.filter(function (o) { return o.status === "Completed" && o.actual_end_time; }).map(function (o) { return o.actual_end_time; }).sort().pop();
      desde = anterior || w.actual_start_date;
    }
    self.cards.push({
      os: w.name, pd: w.sales_order || "", codigo: w.production_item, produto: w.item_name || w.production_item, operacao: atual.operation,
      etapa: atual.sequence_id || atual.idx, feitas: feitas, total: lista.length, estado: estado,
      coluna: self.coluna(atual.operation, atual.workstation_type || (jc && jc.workstation_type) || self.tipoPosto[atual.workstation]),
      operador: jc ? (jc.operador || self.operador[jc.name] || "") : "", seg: desde ? Math.max(0, (agora - new Date(String(desde).replace(" ", "T")).getTime()) / 1000) : null
    });
  });
  var k = { prod: 0, aguard: 0, pausada: 0 };
  this.cards.forEach(function (c) { k[c.estado]++; });
  $.extend(this.kpi, k);
};

GfAcompProducao.prototype.tempo = function (seg) {
  if (seg == null) return "-";
  var t = Math.floor(seg), p = function (n) { return ("0" + n).slice(-2); };
  return p(Math.floor(t / 3600)) + ":" + p(Math.floor((t % 3600) / 60)) + ":" + p(t % 60);
};

GfAcompProducao.prototype.desenhar = function () {
  var self = this, $m = $(this.page.main);
  Object.keys(this.kpi).forEach(function (k) { $m.find('[data-k="' + k + '"]').text(self.kpi[k].toLocaleString("pt-BR")); });
  var rotulo = { aguard: "AGUARDANDO", prod: "EM PRODUÇÃO", pausada: "PAUSADA" };
  var visiveis = this.cards.filter(function (c) {
    if (self.filtro !== "todas" && c.estado !== self.filtro) return false;
    return !self.busca || (c.os + " " + c.pd + " " + c.codigo + " " + c.produto).toLowerCase().indexOf(self.busca) > -1;
  });
  var colunas = GFK_COLUNAS.slice();
  visiveis.forEach(function (c) { if (colunas.indexOf(c.coluna) < 0) colunas.push(c.coluna); });
  var html = colunas.map(function (nome) {
    var cs = visiveis.filter(function (c) { return c.coluna === nome; });
    var corpo = cs.length ? cs.map(function (c) {
      var pct = c.total ? Math.round(100 * c.feitas / c.total) : 0;
      return '<div class="gfk-card" data-os="' + self.esc(c.os) + '">' +
        '<div class="gfk-os"><span>' + self.esc(c.os) + "</span>" + (c.pd ? '<em class="gfk-pd">' + self.esc(c.pd) + "</em>" : "") + "</div>" +
        '<div class="gfk-prod">' + self.esc(c.produto) + "</div>" +
        '<div class="gfk-op">' + self.esc(c.operacao) + "</div>" +
        '<div class="gfk-etapa">Etapa ' + self.esc(c.etapa) + " · " + c.feitas + "/" + c.total + " concluídas</div>" +
        '<div class="gfk-prog"><i style="width:' + pct + '%"></i></div>' +
        (c.operador ? '<div class="gfk-oper">' + self.esc(c.operador) + "</div>" : "") +
        '<div class="gfk-rodape"><span class="gfk-st gfk-st-' + c.estado + '">' + rotulo[c.estado] + "</span>" +
        '<span class="gfk-tempo">&#9719; ' + self.tempo(c.seg) + "</span></div></div>";
    }).join("") : '<div class="gfk-vazio">—</div>';
    return '<div class="gfk-col"><div class="gfk-col-cab"><span>' + self.esc(nome) + "</span><b>" + cs.length + '</b></div><div class="gfk-col-corpo">' + corpo + "</div></div>";
  }).join("");
  $m.find(".gfk-quadro").html(html);
};
