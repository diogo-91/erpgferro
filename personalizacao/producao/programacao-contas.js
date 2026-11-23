/* Programação (Financeiro) - Grupo Gferro (página "programacao-contas")
 * Dashboard > Financeiro > Programação da Intranet: a lista de contas programadas (nome, data, valor, autorizado, pago), por mês ou período,
 * com busca, ordenação, totais e edição. Os registros ficam no cadastro "Conta Programada" do ERP. */
frappe.pages["programacao-contas"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Programação", single_column: true });
  $(wrapper).addClass("gf-prog");
  wrapper.gf_prog = new GfProg(page);
};
frappe.pages["programacao-contas"].on_page_show = function (wrapper) { if (wrapper.gf_prog) wrapper.gf_prog.carregar(); };

var GFP2_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function gfqBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfqBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfqEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfqNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function gfqMes(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }

function GfProg(page) {
  this.page = page; this.mes = gfqMes(new Date()); this.de = ""; this.ate = ""; this.busca = ""; this.fa = "todas"; this.ordem = "data"; this.dir = "asc"; this.dados = null; this.erro = "";
  this.$ = $(page.main); this.$.html('<div class="gfq"></div>'); this.$r = this.$.find(".gfq");
  var self = this;
  this.$r.on("click", "[data-mes]", function () { var p = self.mes.split("-").map(Number), d = new Date(p[0], p[1] - 1 + +$(this).data("mes"), 1); self.mes = gfqMes(d); self.carregar(); });
  this.$r.on("click", "[data-hoje]", function () { self.mes = gfqMes(new Date()); self.carregar(); });
  this.$r.on("change", "[data-de]", function () { self.de = this.value; self.carregar(); });
  this.$r.on("change", "[data-ate]", function () { self.ate = this.value; self.carregar(); });
  this.$r.on("click", "[data-limpar]", function () { self.de = ""; self.ate = ""; self.carregar(); });
  this.$r.on("input", ".gfq-busca", function () { self.busca = this.value; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfq-busca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("change", "[data-fa]", function () { self.fa = this.value; self.desenhar(); });
  this.$r.on("click", "[data-ord]", function () { var c = $(this).data("ord"); if (self.ordem === c) self.dir = self.dir === "asc" ? "desc" : "asc"; else { self.ordem = c; self.dir = c === "valor" ? "desc" : "asc"; } self.desenhar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-nova]", function () { self.editar(null); });
  this.$r.on("click", "[data-editar]", function () { var n = $(this).attr("data-editar"); self.editar(self.dados.filter(function (c) { return c.name === n; })[0]); });
  this.$r.on("click", "[data-excluir]", function () {
    var n = $(this).attr("data-excluir"), c = self.dados.filter(function (x) { return x.name === n; })[0];
    frappe.confirm("Excluir a conta “" + c.nome + "”? Esta ação não pode ser desfeita.", function () { frappe.call({ method: "frappe.client.delete", args: { doctype: "Conta Programada", name: n } }).then(function () { self.carregar(); }); });
  });
  this.$r.on("change", "[data-campo]", function () {
    var n = $(this).attr("data-n"), campo = $(this).attr("data-campo"), v = this.value === "sim" ? 1 : 0;
    frappe.call({ method: "frappe.client.set_value", args: { doctype: "Conta Programada", name: n, fieldname: campo, value: v } }).then(function () { self.carregar(); });
  });
}

GfProg.prototype.intervalo = function () {
  if (this.de && this.ate) return [this.de, this.ate];
  var p = this.mes.split("-").map(Number); return [this.mes + "-01", this.mes + "-" + ("0" + new Date(p[0], p[1], 0).getDate()).slice(-2)];
};
GfProg.prototype.carregar = function () {
  var self = this, iv = this.intervalo();
  frappe.call({ method: "frappe.client.get_list", args: { doctype: "Conta Programada", fields: ["name", "nome", "data", "valor", "autorizado", "pago", "owner"], filters: [["data", "between", iv]], limit_page_length: 0, order_by: "data asc" } }).then(function (r) {
    self.dados = r.message || []; self.erro = ""; self.desenhar();
  }).catch(function () { self.erro = "Não foi possível carregar as contas."; self.desenhar(); });
};

GfProg.prototype.editar = function (c) {
  var self = this;
  var dlg = new frappe.ui.Dialog({
    title: c ? "Editar conta" : "Nova conta",
    fields: [{ fieldname: "nome", label: "Nome da conta", fieldtype: "Data", reqd: 1, default: c ? c.nome : "" }, { fieldname: "data", label: "Data", fieldtype: "Date", reqd: 1, default: c ? c.data : frappe.datetime.get_today() },
      { fieldname: "valor", label: "Valor (R$)", fieldtype: "Currency", default: c ? c.valor : "" }, { fieldname: "autorizado", label: "Autorizado", fieldtype: "Check", default: c ? c.autorizado : 0 }, { fieldname: "pago", label: "Pago", fieldtype: "Check", default: c ? c.pago : 0 }],
    primary_action_label: "Salvar",
    primary_action: function (v) {
      var doc = $.extend({ doctype: "Conta Programada" }, v);
      var p = c ? frappe.call({ method: "frappe.client.set_value", args: { doctype: "Conta Programada", name: c.name, fieldname: { nome: v.nome, data: v.data, valor: v.valor || 0, autorizado: v.autorizado, pago: v.pago } } }) : frappe.call({ method: "frappe.client.insert", args: { doc: doc } });
      p.then(function () { dlg.hide(); self.carregar(); });
    }
  });
  dlg.show();
};

GfProg.prototype.desenhar = function () {
  var self = this, h = "", personalizado = !!(this.de && this.ate), mesAtual = gfqMes(new Date());
  var p = this.mes.split("-").map(Number);
  h += '<div class="gfq-topo"><div><div class="gfq-trilha">Financeiro • Programação</div><h1>Contas</h1><p>Gerencie as contas e seus pagamentos</p></div><div class="gfq-acoes"><input type="search" class="gfq-busca" placeholder="Buscar por nome da conta..." value="' + gfqEsc(this.busca) + '"><button type="button" class="gfq-nova" data-nova="1">+ Nova conta</button></div></div>';
  h += '<div class="gfq-barra">' + (personalizado ? "" : '<div class="gfq-mes"><button type="button" class="gfq-ic" data-mes="-1">&#8249;</button><strong>' + GFP2_MESES[p[1] - 1] + " de " + p[0] + '</strong><button type="button" class="gfq-ic" data-mes="1">&#8250;</button></div><button type="button" class="gfq-b" data-hoje="1"' + (this.mes === mesAtual ? " disabled" : "") + ">Mês atual</button>") +
    '<div class="gfq-intv' + (personalizado ? " gfq-on" : "") + '">De <input type="date" data-de="1" value="' + this.de + '"> Até <input type="date" data-ate="1" value="' + this.ate + '"' + (this.de ? ' min="' + this.de + '"' : "") + ">" + (personalizado ? ' <button type="button" class="gfq-lk" data-limpar="1">Limpar período</button>' : "") + '</div><button type="button" class="gfq-b" data-atualizar="1">Atualizar</button>';
  if (this.erro) h += '<p class="gfq-aviso">' + gfqEsc(this.erro) + "</p>";
  if (!this.dados) { this.$r.html(h + "</div>" + '<p class="gfq-vazio">Carregando...</p>'); return; }
  var t = gfqNorm(this.busca.trim()), fa = this.fa;
  var lista = this.dados.filter(function (c) { return (!t || gfqNorm(c.nome).indexOf(t) >= 0) && (fa === "todas" || (fa === "sim") === !!c.autorizado); });
  var k = this.dir === "asc" ? 1 : -1, o = this.ordem;
  lista.sort(function (a, b) { var x, y; if (o === "valor") { x = a.valor || 0; y = b.valor || 0; return k * (x - y); } if (o === "autorizado" || o === "pago") return k * ((a[o] ? 1 : 0) - (b[o] ? 1 : 0)); x = String(o === "criador" ? a.owner : a[o]); y = String(o === "criador" ? b.owner : b[o]); return k * x.localeCompare(y, "pt-BR"); });
  var pagas = lista.filter(function (c) { return c.pago; }), abertas = lista.filter(function (c) { return !c.pago; }), soma = function (l) { return l.reduce(function (s, c) { return s + (c.valor || 0); }, 0); };
  var naoAut = soma(abertas.filter(function (c) { return !c.autorizado; }));
  h += '<p class="gfq-res">' + lista.length + (lista.length === 1 ? " conta" : " contas") + " · Aguardando autorização <b>" + gfqBrl(naoAut) + "</b></p></div>";
  h += '<section class="gfq-kpis"><div class="gfq-kpi gfq-vd"><span>Pago</span><strong>' + gfqBrl(soma(pagas)) + "</strong><small>" + pagas.length + (pagas.length === 1 ? " conta" : " contas") + '</small></div><div class="gfq-kpi gfq-vm"><span>Não pago</span><strong>' + gfqBrl(soma(abertas)) + "</strong><small>" + abertas.length + (abertas.length === 1 ? " conta" : " contas") + "</small></div></section>";
  var cols = [["data", "Data"], ["nome", "Conta"], ["criador", "Criada por"], ["valor", "Valor", 1], ["autorizado", "Autorização"], ["pago", "Pagamento"]];
  h += '<div class="gfq-tw"><table class="gfq-t"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c[2] ? "n" : "") + '"><button type="button" data-ord="' + c[0] + '">' + c[1] + (self.ordem === c[0] ? (self.dir === "asc" ? " ▲" : " ▼") : " ↕") + "</button></th>"; }).join("") + "<th>Ações</th></tr></thead><tbody>";
  if (!lista.length) h += '<tr><td colspan="7" class="gfq-vazio">Nenhuma conta neste período.</td></tr>';
  lista.forEach(function (c) {
    var sel = function (campo, on, a, b) { return '<select class="gfq-sel ' + (on ? "gfq-ok" : "gfq-no") + '" data-campo="' + campo + '" data-n="' + gfqEsc(c.name) + '"><option value="nao"' + (on ? "" : " selected") + ">" + b + '</option><option value="sim"' + (on ? " selected" : "") + ">" + a + "</option></select>"; };
    h += "<tr><td>" + gfqBr(c.data) + "</td><td><b>" + gfqEsc(c.nome) + "</b></td><td>" + gfqEsc(c.owner) + '</td><td class="n">' + (c.valor ? gfqBrl(c.valor) : "—") + "</td><td>" + sel("autorizado", c.autorizado, "Autorizado", "Não autorizado") + "</td><td>" + sel("pago", c.pago, "Pago", "Não pago") +
      '</td><td><button type="button" class="gfq-lk2" data-editar="' + gfqEsc(c.name) + '">Editar</button> <button type="button" class="gfq-lk2 gfq-del" data-excluir="' + gfqEsc(c.name) + '">Excluir</button></td></tr>';
  });
  h += "</tbody></table></div>";
  var foco = this.$r.find(".gfq-busca:focus").length; this.$r.html(h); if (foco) this.$r.find(".gfq-busca").trigger("focus");
};
