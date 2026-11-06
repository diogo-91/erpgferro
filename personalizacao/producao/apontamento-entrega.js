/* Entregas - Grupo Gferro (página "apontamento-entrega")
 * Igual à tela Entregas do sistema anterior: Relatório (período Dia/Semana/Mês, indicadores, lista com busca, filtros e CSV),
 * Ranking de motoristas, Nova entrega e Caminhões e motoristas. Dados: Entrega de Pedido, Motorista de Entrega e Caminhao. */
frappe.pages["apontamento-entrega"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Entregas", single_column: true });
  $(wrapper).addClass("gf-ent");
  wrapper.gf_ent = new GfEntregas(page, wrapper);
};
frappe.pages["apontamento-entrega"].on_page_show = function (wrapper) {
  if (wrapper.gf_ent) wrapper.gf_ent.carregar();
};

var GFE_TAM = 10;
var GFE_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function gfeChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function gfeBr(s) { var p = String(s || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfeNum(n) { return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function gfeMoeda(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfeEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfePlural(n, a, b) { return n === 1 ? a : b; }

function gfeIntervalo(modo, ref) {
  var ini = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()), fim = new Date(ini), rotulo;
  if (modo === "semana") {
    ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    rotulo = ini.getDate() + "/" + (ini.getMonth() + 1) + " a " + fim.getDate() + "/" + (fim.getMonth() + 1) + "/" + fim.getFullYear();
  } else if (modo === "mes") {
    ini = new Date(ref.getFullYear(), ref.getMonth(), 1); fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    rotulo = GFE_MESES[ini.getMonth()] + " de " + ini.getFullYear();
  } else {
    rotulo = ini.getDate() + " de " + GFE_MESES[ini.getMonth()] + " de " + ini.getFullYear();
  }
  return { inicio: gfeChave(ini), fim: gfeChave(fim), rotulo: rotulo };
}
function gfeNavega(modo, ref, delta) {
  var d = new Date(ref);
  if (modo === "mes") d.setMonth(d.getMonth() + delta); else d.setDate(d.getDate() + delta * (modo === "semana" ? 7 : 1));
  return d;
}

function GfEntregas(page, wrapper) {
  this.page = page; this.wrapper = wrapper;
  this.aba = "relatorio"; this.modo = "dia"; this.ref = new Date(); this.busca = ""; this.fMot = ""; this.fCam = "";
  this.pagina = 1; this.ativos = false; this.dados = null;
  this.$ = $(page.main);
  this.$.html('<div class="gfe"></div>');
  this.$raiz = this.$.find(".gfe");
  var self = this;
  this.$raiz.on("click", "[data-aba]", function () { self.aba = $(this).data("aba"); self.pagina = 1; self.desenhar(); });
}

GfEntregas.prototype.carregar = function () {
  var self = this;
  function lista(dt, campos, ordem) {
    return frappe.call({ method: "frappe.client.get_list", args: { doctype: dt, fields: campos, limit_page_length: 0, order_by: ordem || "creation desc" } })
      .then(function (r) { return r.message || []; });
  }
  Promise.all([
    lista("Entrega de Pedido", ["name", "data", "motorista", "caminhao", "pedido", "cliente", "material", "metragem", "valor", "creation"]),
    lista("Motorista de Entrega", ["name", "nome", "ativo"], "nome asc"),
    lista("Caminhao", ["name", "placa", "modelo", "ativo"], "placa asc")
  ]).then(function (r) { self.dados = { entregas: r[0], motoristas: r[1], caminhoes: r[2] }; self.desenhar(); })
    .catch(function () { self.erro = "Não foi possível carregar as entregas."; self.desenhar(); });
};

GfEntregas.prototype.seletor = function (per) {
  var m = this.modo;
  function b(v, t) { return '<button type="button" class="gfe-seg' + (m === v ? " gfe-seg-ativo" : "") + '" data-modo="' + v + '">' + t + "</button>"; }
  return '<div class="gfe-controles"><div class="gfe-segmentado">' + b("dia", "Dia") + b("semana", "Semana") + b("mes", "Mês") + "</div>" +
    '<div class="gfe-nav"><button type="button" class="gfe-b gfe-ic" data-nav="-1" aria-label="Período anterior">&#8249;</button>' +
    '<span class="gfe-periodo">' + gfeEsc(per.rotulo) + "</span>" +
    '<button type="button" class="gfe-b gfe-ic" data-nav="1" aria-label="Próximo período">&#8250;</button>' +
    '<button type="button" class="gfe-b" data-hoje="1">Hoje</button>' +
    '<input type="date" class="gfe-data" value="' + gfeChave(this.ref) + '" aria-label="Escolher uma data"></div></div>';
};

GfEntregas.prototype.desenhar = function () {
  var self = this, h = "";
  h += '<div class="gfe-topo"><div><h1>Entregas</h1><p>Acompanhe pedidos, motoristas e resultados de entrega.</p></div><div class="gfe-acoes-topo">' +
    '<button type="button" class="gfe-b" data-aba="cadastro">Caminhões e motoristas</button>' +
    '<button type="button" class="gfe-b" data-aba="relatorio">Relatório</button>' +
    '<button type="button" class="gfe-b" data-aba="ranking">Ranking de motoristas</button>' +
    '<button type="button" class="gfe-b gfe-amarelo" data-aba="lancar">Nova entrega</button></div></div>';
  if (this.erro) h += '<p class="gfe-aviso gfe-erro">' + gfeEsc(this.erro) + "</p>";
  if (!this.dados) h += '<p class="gfe-vazio">Carregando...</p>';
  else if (this.aba === "lancar") h += this.htmlLancar();
  else if (this.aba === "cadastro") h += this.htmlCadastro();
  else if (this.aba === "ranking") h += this.htmlRanking();
  else h += this.htmlRelatorio();
  this.$raiz.html(h);
  this.ligar();
};

GfEntregas.prototype.doPeriodo = function () {
  var per = gfeIntervalo(this.modo, this.ref);
  return { per: per, lista: this.dados.entregas.filter(function (e) { return e.data >= per.inicio && e.data <= per.fim; }) };
};

GfEntregas.prototype.htmlRelatorio = function () {
  var self = this, d = this.doPeriodo(), per = d.per, doP = d.lista;
  var nomeM = {}, placaC = {};
  this.dados.motoristas.forEach(function (m) { nomeM[m.name] = m.nome; });
  this.dados.caminhoes.forEach(function (c) { placaC[c.name] = c.placa; });
  var met = 0, val = 0;
  doP.forEach(function (e) { met += e.metragem || 0; val += e.valor || 0; });
  var ativos = this.dados.motoristas.filter(function (m) { return m.ativo; });
  var termo = this.busca.trim().toLowerCase();
  var fil = doP.filter(function (e) {
    return (!self.fMot || e.motorista === self.fMot) && (!self.fCam || e.caminhao === self.fCam) &&
      (!termo || String(e.cliente || "").toLowerCase().indexOf(termo) >= 0 || String(e.pedido || "").toLowerCase().indexOf(termo) >= 0);
  }).sort(function (a, b) { return b.data.localeCompare(a.data) || String(b.creation).localeCompare(String(a.creation)); });
  this.filtradas = fil; this.nomeM = nomeM; this.placaC = placaC; this.per = per;
  var totalPag = Math.max(1, Math.ceil(fil.length / GFE_TAM));
  if (this.pagina > totalPag) this.pagina = totalPag;
  var pag = fil.slice((this.pagina - 1) * GFE_TAM, this.pagina * GFE_TAM);
  var nf = (this.fMot ? 1 : 0) + (this.fCam ? 1 : 0);

  var h = '<div class="gfe-painel">' + this.seletor(per) + '<div class="gfe-indicadores">' +
    '<div class="gfe-ind"><span>Entregas no período</span><b>' + doP.length + "</b><i>" + gfePlural(doP.length, "pedido concluído", "pedidos concluídos") + "</i></div>" +
    '<div class="gfe-ind"><span>Metragem total</span><b>' + gfeNum(met) + " m²</b><i>no período selecionado</i></div>" +
    '<div class="gfe-ind"><span>Valor total</span><b>' + gfeMoeda(val) + "</b><i>faturamento entregue no período</i></div>" +
    '<div class="gfe-ind"><span>Motoristas ativos</span><b>' + ativos.length + "</b><i>" +
    (ativos.length === 0 ? "nenhum motorista ativo" : ativos.length === 1 ? gfeEsc(ativos[0].nome) : "cadastrados") + "</i></div></div>";
  if (this.sucesso) h += '<p class="gfe-aviso gfe-ok">' + gfeEsc(this.sucesso) + "</p>";
  h += '<div class="gfe-lista-cab"><div><h2>Entregas do período</h2><p>' + fil.length + " " + gfePlural(fil.length, "registro", "registros") + "</p></div>" +
    '<div class="gfe-lista-acoes"><input type="search" class="gfe-busca" placeholder="Buscar cliente ou pedido" value="' + gfeEsc(this.busca) + '">' +
    '<div class="gfe-filtros-wrap"><button type="button" class="gfe-b' + (nf ? " gfe-ativo" : "") + '" data-filtros="1">Filtros' + (nf ? " (" + nf + ")" : "") + "</button>" +
    (this.filtrosAbertos ? '<div class="gfe-filtros-painel"><label>Motorista<select data-f="mot"><option value="">Todos</option>' +
      this.dados.motoristas.map(function (m) { return '<option value="' + gfeEsc(m.name) + '"' + (self.fMot === m.name ? " selected" : "") + ">" + gfeEsc(m.nome) + "</option>"; }).join("") +
      '</select></label><label>Caminhão<select data-f="cam"><option value="">Todos</option>' +
      this.dados.caminhoes.map(function (c) { return '<option value="' + gfeEsc(c.name) + '"' + (self.fCam === c.name ? " selected" : "") + ">" + gfeEsc(c.placa) + (c.modelo ? " · " + gfeEsc(c.modelo) : "") + "</option>"; }).join("") +
      "</select></label>" + (nf ? '<button type="button" class="gfe-b" data-limpar="1">Limpar filtros</button>' : "") + "</div>" : "") + "</div>" +
    '<button type="button" class="gfe-b" data-csv="1"' + (fil.length ? "" : " disabled") + ">Exportar CSV</button></div></div>";
  if (!fil.length) h += '<p class="gfe-vazio">Nenhuma entrega encontrada para os filtros selecionados.</p>';
  else {
    h += '<div class="gfe-tabela-wrap"><table class="gfe-tabela"><thead><tr><th>Data</th><th>Motorista</th><th>Caminhão</th><th>Pedido</th><th>Cliente</th><th>Material</th><th class="gfe-n">Metragem</th><th class="gfe-n">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
    pag.forEach(function (e) {
      h += "<tr><td>" + gfeBr(e.data) + "</td><td>" + gfeEsc(nomeM[e.motorista] || "—") + "</td><td>" + gfeEsc(placaC[e.caminhao] || "—") + "</td><td>" + gfeEsc(e.pedido) +
        '</td><td class="gfe-cli" title="' + gfeEsc(e.cliente || "—") + '">' + gfeEsc(e.cliente || "—") + "</td><td>" + gfeEsc(e.material || "—") +
        '</td><td class="gfe-n">' + (e.metragem != null ? gfeNum(e.metragem) + " m²" : "—") + '</td><td class="gfe-n">' + (e.valor != null ? gfeMoeda(e.valor) : "—") +
        '</td><td><span class="gfe-badge">Entregue</span></td><td><button type="button" class="gfe-b gfe-ic gfe-del" data-excluir="' + gfeEsc(e.name) + '" data-pedido="' + gfeEsc(e.pedido) + '" title="Excluir entrega">&#128465;</button></td></tr>';
    });
    h += '</tbody></table></div><div class="gfe-rodape"><span>Mostrando ' + pag.length + " de " + fil.length + " " + gfePlural(fil.length, "entrega", "entregas") + "</span>";
    if (totalPag > 1) h += '<div class="gfe-pag"><button type="button" class="gfe-b" data-pag="-1"' + (this.pagina <= 1 ? " disabled" : "") + '>Anterior</button><span>Página ' + this.pagina + " de " + totalPag +
      '</span><button type="button" class="gfe-b" data-pag="1"' + (this.pagina >= totalPag ? " disabled" : "") + ">Próxima</button></div>";
    h += "</div>";
  }
  return h + "</div>";
};

GfEntregas.prototype.htmlRanking = function () {
  var self = this, d = this.doPeriodo(), mapa = {};
  d.lista.forEach(function (e) {
    var r = mapa[e.motorista] || (mapa[e.motorista] = { pedidos: 0, metragem: 0, valor: 0 });
    r.pedidos++; r.metragem += e.metragem || 0; r.valor += e.valor || 0;
  });
  var info = {}; this.dados.motoristas.forEach(function (m) { info[m.name] = m; });
  var termo = this.busca.trim().toLowerCase();
  var rank = Object.keys(mapa).map(function (k) { var m = info[k]; return { nome: m ? m.nome : "Motorista removido", ativo: m ? !!m.ativo : false, r: mapa[k] }; })
    .filter(function (x) { return (!self.ativos || x.ativo) && (!termo || x.nome.toLowerCase().indexOf(termo) >= 0); })
    .sort(function (a, b) { return b.r.pedidos - a.r.pedidos || b.r.valor - a.r.valor; });
  var h = '<div class="gfe-painel">' + this.seletor(d.per) + '<div class="gfe-lista-cab"><div><h2>Ranking de motoristas</h2><p>' + rank.length + " " + gfePlural(rank.length, "registro", "registros") + "</p></div>" +
    '<div class="gfe-lista-acoes"><input type="search" class="gfe-busca" placeholder="Buscar motorista" value="' + gfeEsc(this.busca) + '">' +
    '<label class="gfe-toggle"><input type="checkbox" data-ativos="1"' + (this.ativos ? " checked" : "") + "> Somente ativos</label></div></div>";
  if (!rank.length) h += '<p class="gfe-vazio">Nenhum motorista com entregas nesse período.</p>';
  else {
    h += '<div class="gfe-tabela-wrap"><table class="gfe-tabela"><thead><tr><th class="gfe-n">#</th><th>Motorista</th><th class="gfe-n">Pedidos entregues</th><th class="gfe-n">Metragem total</th><th class="gfe-n">Valor total</th></tr></thead><tbody>';
    rank.forEach(function (x, i) {
      h += '<tr><td class="gfe-n"><span class="gfe-pos' + (i < 3 ? " gfe-pos-" + (i + 1) : "") + '">' + (i + 1) + "</span></td><td>" + gfeEsc(x.nome) + (x.ativo ? "" : ' <span class="gfe-inativo">(inativo)</span>') +
        '</td><td class="gfe-n">' + x.r.pedidos + '</td><td class="gfe-n">' + gfeNum(x.r.metragem) + ' m²</td><td class="gfe-n">' + gfeMoeda(x.r.valor) + "</td></tr>";
    });
    h += "</tbody></table></div>";
  }
  return h + "</div>";
};

GfEntregas.prototype.htmlLancar = function () {
  var op = function (lista, v, t) { return lista.filter(function (x) { return x.ativo; }).map(function (x) { return '<option value="' + gfeEsc(x.name) + '">' + gfeEsc(t(x)) + "</option>"; }).join(""); };
  return '<div class="gfe-painel gfe-form"><h2>Nova entrega</h2><div class="gfe-grid">' +
    '<label>Motorista<select id="gfe-mot"><option value="">Selecione</option>' + op(this.dados.motoristas, "name", function (m) { return m.nome; }) + "</select></label>" +
    '<label>Caminhão<select id="gfe-cam"><option value="">Selecione</option>' + op(this.dados.caminhoes, "name", function (c) { return c.placa + (c.modelo ? " · " + c.modelo : ""); }) + "</select></label>" +
    '<label>Data da entrega<input type="date" id="gfe-dt" value="' + gfeChave(new Date()) + '"></label>' +
    '<label>Pedido entregue<input type="text" id="gfe-ped" placeholder="Nº do pedido"></label>' +
    '<label>Metragem (m²)<input type="number" step="0.01" min="0" id="gfe-met" placeholder="Metragem (m²)"></label>' +
    '<label>Valor (R$)<input type="number" step="0.01" min="0" id="gfe-val" placeholder="Valor (R$)"></label>' +
    '<label class="gfe-l2">Cliente (opcional)<input type="text" id="gfe-cli" placeholder="Cliente (opcional)"></label>' +
    '<label class="gfe-l2">Material (opcional)<input type="text" id="gfe-mat" placeholder="Material (opcional)"></label></div>' +
    '<div class="gfe-form-b"><button type="button" class="gfe-b gfe-amarelo" data-salvar="1">Lançar entrega</button><button type="button" class="gfe-b" data-aba="relatorio">Cancelar</button></div></div>';
};

GfEntregas.prototype.htmlCadastro = function () {
  var lm = this.dados.motoristas.map(function (m) { return '<li><span>' + gfeEsc(m.nome) + (m.ativo ? "" : ' <em>(inativo)</em>') + '</span><button type="button" class="gfe-b" data-alt="Motorista de Entrega|' + gfeEsc(m.name) + "|" + (m.ativo ? 0 : 1) + '">' + (m.ativo ? "Desativar" : "Ativar") + "</button></li>"; }).join("") || '<li class="gfe-vazio">Nenhum motorista.</li>';
  var lc = this.dados.caminhoes.map(function (c) { return '<li><span>' + gfeEsc(c.placa) + (c.modelo ? " · " + gfeEsc(c.modelo) : "") + (c.ativo ? "" : ' <em>(inativo)</em>') + '</span><button type="button" class="gfe-b" data-alt="Caminhao|' + gfeEsc(c.name) + "|" + (c.ativo ? 0 : 1) + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></li>"; }).join("") || '<li class="gfe-vazio">Nenhum caminhão.</li>';
  return '<div class="gfe-duas"><div class="gfe-painel"><h2>Motoristas</h2><div class="gfe-add"><input type="text" id="gfe-nm" placeholder="Nome do motorista"><button type="button" class="gfe-b gfe-amarelo" data-novo="mot">Adicionar</button></div><ul class="gfe-ul">' + lm + "</ul></div>" +
    '<div class="gfe-painel"><h2>Caminhões</h2><div class="gfe-add"><input type="text" id="gfe-pl" placeholder="Placa"><input type="text" id="gfe-md" placeholder="Modelo (opcional)"><button type="button" class="gfe-b gfe-amarelo" data-novo="cam">Adicionar</button></div><ul class="gfe-ul">' + lc + "</ul></div></div>";
};

GfEntregas.prototype.msg = function (t, erro) { this.erro = erro ? t : null; this.sucesso = erro ? null : t; };

GfEntregas.prototype.ligar = function () {
  var self = this, $r = this.$raiz;
  function redesenha() { self.desenhar(); }
  $r.find("[data-modo]").on("click", function () { self.modo = $(this).data("modo"); self.pagina = 1; redesenha(); });
  $r.find("[data-nav]").on("click", function () { self.ref = gfeNavega(self.modo, self.ref, Number($(this).data("nav"))); self.pagina = 1; redesenha(); });
  $r.find("[data-hoje]").on("click", function () { self.ref = new Date(); self.pagina = 1; redesenha(); });
  $r.find(".gfe-data").on("change", function () { if (this.value) { self.ref = new Date(this.value + "T00:00:00"); self.pagina = 1; redesenha(); } });
  $r.find(".gfe-busca").on("input", function () {
    self.busca = this.value; self.pagina = 1; var pos = this.selectionStart; redesenha();
    var $i = $r.find(".gfe-busca").focus(); if ($i[0]) $i[0].setSelectionRange(pos, pos);
  });
  $r.find("[data-ativos]").on("change", function () { self.ativos = this.checked; redesenha(); });
  $r.find("[data-filtros]").on("click", function (ev) { ev.stopPropagation(); self.filtrosAbertos = !self.filtrosAbertos; redesenha(); });
  $r.find(".gfe-filtros-painel").on("click", function (ev) { ev.stopPropagation(); });
  $r.find("[data-f]").on("change", function () { if ($(this).data("f") === "mot") self.fMot = this.value; else self.fCam = this.value; self.pagina = 1; redesenha(); });
  $r.find("[data-limpar]").on("click", function () { self.fMot = ""; self.fCam = ""; redesenha(); });
  $r.find("[data-pag]").on("click", function () { self.pagina += Number($(this).data("pag")); redesenha(); });
  $r.find("[data-csv]").on("click", function () { self.exportar(); });
  $r.find("[data-excluir]").on("click", function () {
    var nome = $(this).data("excluir"), ped = $(this).data("pedido");
    frappe.confirm("Esta ação não poderá ser desfeita. Deseja excluir a entrega do pedido " + ped + "?", function () {
      frappe.call({ method: "frappe.client.delete", args: { doctype: "Entrega de Pedido", name: nome } }).then(function () {
        self.msg("Entrega do pedido " + ped + " excluída com sucesso."); self.carregar();
      });
    });
  });
  $r.find("[data-salvar]").on("click", function () { self.salvar(); });
  $r.find("[data-novo]").on("click", function () { self.novo($(this).data("novo")); });
  $r.find("[data-alt]").on("click", function () {
    var p = String($(this).data("alt")).split("|");
    frappe.call({ method: "frappe.client.set_value", args: { doctype: p[0], name: p[1], fieldname: "ativo", value: Number(p[2]) } }).then(function () { self.carregar(); });
  });
  if (!this._fora) {
    this._fora = true;
    $(document).on("click.gfe", function () { if (self.filtrosAbertos) { self.filtrosAbertos = false; if (self.aba === "relatorio") self.desenhar(); } });
  }
};

GfEntregas.prototype.salvar = function () {
  var self = this, v = function (id) { return (self.$raiz.find(id).val() || "").trim(); };
  var doc = { doctype: "Entrega de Pedido", motorista: v("#gfe-mot"), caminhao: v("#gfe-cam"), data: v("#gfe-dt"), pedido: v("#gfe-ped"),
    cliente: v("#gfe-cli"), material: v("#gfe-mat"), metragem: v("#gfe-met") ? Number(v("#gfe-met")) : null, valor: v("#gfe-val") ? Number(v("#gfe-val")) : null };
  if (!doc.motorista || !doc.caminhao || !doc.data || !doc.pedido) { frappe.show_alert({ message: "Informe motorista, caminhão, data e pedido.", indicator: "red" }); return; }
  frappe.call({ method: "frappe.client.insert", args: { doc: doc } }).then(function () {
    self.msg("Entrega do pedido " + doc.pedido + " lançada com sucesso."); self.aba = "relatorio"; self.ref = new Date(doc.data + "T00:00:00"); self.carregar();
  });
};

GfEntregas.prototype.novo = function (tipo) {
  var self = this, doc;
  if (tipo === "mot") doc = { doctype: "Motorista de Entrega", nome: (this.$raiz.find("#gfe-nm").val() || "").trim(), ativo: 1 };
  else doc = { doctype: "Caminhao", placa: (this.$raiz.find("#gfe-pl").val() || "").trim().toUpperCase(), modelo: (this.$raiz.find("#gfe-md").val() || "").trim(), ativo: 1 };
  if (!(doc.nome || doc.placa)) { frappe.show_alert({ message: "Preencha o nome ou a placa.", indicator: "red" }); return; }
  frappe.call({ method: "frappe.client.insert", args: { doc: doc } }).then(function () { self.carregar(); });
};

GfEntregas.prototype.exportar = function () {
  var self = this;
  function esc(s) { s = String(s == null ? "" : s); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var linhas = [["Data", "Motorista", "Caminhão", "Pedido", "Cliente", "Material", "Metragem (m²)", "Valor", "Status"].join(";")];
  this.filtradas.forEach(function (e) {
    linhas.push([gfeBr(e.data), self.nomeM[e.motorista] || "—", self.placaC[e.caminhao] || "—", e.pedido, e.cliente || "—", e.material || "—",
      e.metragem != null ? gfeNum(e.metragem) : "—", e.valor != null ? gfeMoeda(e.valor) : "—", "Entregue"].map(esc).join(";"));
  });
  var blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "entregas-" + this.per.inicio + "-a-" + this.per.fim + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
};
