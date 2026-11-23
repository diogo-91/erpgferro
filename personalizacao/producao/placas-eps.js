/* Placas de EPS (Financeiro) - Grupo Gferro (página "placas-eps")
 * Dashboard > Financeiro > Placas de EPS da Intranet com os dados do ERP: blocos usados e placas produzidas ("Lançamento de EPS"), com o custo
 * da produção interna (blocos × preço do bloco) contra o preço de compra no fornecedor (placas × preço da placa). A diferença é o "Caixa 2",
 * que o financeiro confirma como transferido. Preços em "Configuração de EPS". */
frappe.pages["placas-eps"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Placas de EPS", single_column: true });
  $(wrapper).addClass("gf-eps");
  wrapper.gf_eps = new GfEps(page);
};
frappe.pages["placas-eps"].on_page_show = function (wrapper) { if (wrapper.gf_eps) wrapper.gf_eps.carregar(); };

var GFE2_ROT = { TRAPEZIO_TR25: "Trapézio TR25", TRAPEZIO_TR40: "Trapézio TR40", FORRO_TR25: "Telha forro TR25", FORRO_TR40: "Telha forro TR40" };
function gfeChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function gfeBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfeInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function gfeBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfeEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfeArr(n) { return Math.round(n * 100) / 100; }
function gfeSinal(n) { return n > 0 ? "+" : n < 0 ? "−" : ""; }
function gfeDin(n) { return gfeSinal(n) + gfeBrl(Math.abs(n)); }
function gfePct(n) { return n === null ? "—" : (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; }
function gfePctS(n) { return n === null ? "—" : gfeSinal(n) + gfePct(Math.abs(n)); }
function gfeCls(n) { return n > 0 ? "gfe-pos" : n < 0 ? "gfe-neg" : "gfe-mudo"; }

function GfEps(page) {
  this.page = page; this.modo = "hoje"; this.de = gfeChave(new Date()); this.ate = this.de; this.dados = null; this.cfg = null; this.filtro = "todos"; this.erro = "";
  this.$ = $(page.main); this.$.html('<div class="gfe"></div>'); this.$r = this.$.find(".gfe");
  var self = this;
  this.$r.on("click", "[data-modo]", function () { self.modo = $(this).data("modo"); self.carregar(); });
  this.$r.on("change", "[data-de]", function () { self.de = this.value; self.carregar(); });
  this.$r.on("change", "[data-ate]", function () { self.ate = this.value; self.carregar(); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
  this.$r.on("click", "[data-filtro]", function () { self.filtro = $(this).data("filtro"); self.desenhar(); });
  this.$r.on("click", "[data-csv]", function () { self.csv(); });
  this.$r.on("click", "[data-novo]", function () { frappe.new_doc("Lancamento EPS"); });
  this.$r.on("click", "[data-transf]", function () { var ids = String($(this).attr("data-transf")).split(","), on = $(this).attr("data-on") === "1", txt = $(this).attr("data-txt"); self.marcar(ids, on, txt); });
}

GfEps.prototype.intervalo = function () {
  var h = new Date(), s = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  if (this.modo === "hoje") return { inicio: gfeChave(h), fim: gfeChave(h) };
  if (this.modo === "7dias") return { inicio: gfeChave(s(h, -6)), fim: gfeChave(h) };
  if (this.modo === "mes") return { inicio: gfeChave(new Date(h.getFullYear(), h.getMonth(), 1)), fim: gfeChave(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  return { inicio: this.de, fim: this.ate };
};
GfEps.prototype.carregar = function () {
  var self = this, iv = this.intervalo();
  if (!iv.inicio || !iv.fim || iv.inicio > iv.fim) { this.erro = iv.inicio > iv.fim ? "A data inicial passa da data final." : ""; this.desenhar(); return; }
  Promise.all([
    frappe.call({ method: "frappe.client.get_list", args: { doctype: "Lancamento EPS", fields: ["name", "data", "tipo", "blocos", "placas", "esperado", "colaborador", "observacao", "caixa2_transferido", "caixa2_valor", "caixa2_por", "caixa2_em", "creation"], filters: [["data", "between", [iv.inicio, iv.fim]]], limit_page_length: 0, order_by: "data desc, creation desc" } }),
    frappe.call({ method: "frappe.client.get", args: { doctype: "Configuracao EPS" } })
  ]).then(function (r) { self.dados = r[0].message || []; self.cfg = r[1].message; self.erro = ""; self.desenhar(); }).catch(function () { self.erro = "Não foi possível carregar os lançamentos."; self.desenhar(); });
};

GfEps.prototype.precos = function (tipo) {
  var c = this.cfg, f = String(tipo).toUpperCase().indexOf("FORRO") === 0 ? "forro" : "trap";
  return { nome: f === "forro" ? "Telha forro" : "Trapézio", bloco: +c[f + "_bloco"] || 0, placasBloco: +c[f + "_placas"] || 1, forn: +c[f + "_forn"] || 0, fam: f };
};
GfEps.prototype.comparar = function (tipo, blocos, placas) {
  var p = this.precos(tipo), ci = gfeArr(blocos * p.bloco), vf = gfeArr(placas * p.forn), dif = gfeArr(vf - ci);
  return { blocos: blocos, placas: placas, ci: ci, vf: vf, dif: dif, pct: vf > 0 ? dif / vf : null };
};
GfEps.prototype.somar = function (l) {
  var blocos = l.reduce(function (s, c) { return s + c.blocos; }, 0), placas = l.reduce(function (s, c) { return s + c.placas; }, 0), ci = gfeArr(l.reduce(function (s, c) { return s + c.ci; }, 0)), vf = gfeArr(l.reduce(function (s, c) { return s + c.vf; }, 0)), dif = gfeArr(vf - ci);
  return { blocos: blocos, placas: placas, ci: ci, vf: vf, dif: dif, pct: vf > 0 ? dif / vf : null };
};

GfEps.prototype.marcar = function (ids, on, txt) {
  if (!window.confirm(txt)) return;
  var self = this;
  Promise.all(ids.map(function (id) {
    var l = self.dados.filter(function (x) { return x.name === id; })[0], c = self.comparar(l.tipo, l.blocos, l.placas);
    return frappe.call({ method: "frappe.client.set_value", args: { doctype: "Lancamento EPS", name: id, fieldname: { caixa2_transferido: on ? 1 : 0, caixa2_valor: on ? c.dif : 0, caixa2_por: on ? frappe.session.user : "", caixa2_em: on ? frappe.datetime.now_datetime() : null } } });
  })).then(function () { self.carregar(); }).catch(function () { self.erro = "Não foi possível salvar a confirmação."; self.desenhar(); });
};

GfEps.prototype.desenhar = function () {
  var self = this, h = "", iv = this.intervalo();
  h += '<div class="gfe-topo"><div><div class="gfe-trilha">Dashboard › Financeiro › <b>Placas de EPS</b></div><h1>Placas de EPS</h1><p>Blocos usados e placas produzidas (lançamentos de EPS), com o custo da produção interna contra o preço de compra no fornecedor.</p></div>' +
    '<div class="gfe-acoes"><button type="button" class="gfe-b" data-novo="1">+ Novo lançamento</button><button type="button" class="gfe-b" data-atualizar="1">Atualizar</button></div></div>';
  h += '<div class="gfe-barra">' + [["hoje", "Hoje"], ["7dias", "Últimos 7 dias"], ["mes", "Mês"], ["periodo", "Período"]].map(function (m) { return '<button type="button" class="gfe-bp' + (self.modo === m[0] ? " gfe-on" : "") + '" data-modo="' + m[0] + '">' + m[1] + "</button>"; }).join("") +
    (this.modo === "periodo" ? '<span class="gfe-per"><input type="date" data-de="1" value="' + this.de + '" max="' + this.ate + '"> até <input type="date" data-ate="1" value="' + this.ate + '" min="' + this.de + '"></span>' : "") +
    '<button type="button" class="gfe-bp" data-csv="1"' + (this.dados && this.dados.length ? "" : " disabled") + ">Baixar Excel (CSV)</button></div>";
  if (this.erro) h += '<p class="gfe-aviso">' + gfeEsc(this.erro) + "</p>";
  if (!this.dados || !this.cfg) { this.$r.html(h + '<p class="gfe-vazio">Carregando...</p>'); return; }
  var L = this.dados.map(function (l) { return $.extend({}, l, { c: self.comparar(l.tipo, l.blocos, l.placas) }); });
  var total = this.somar(L.map(function (l) { return l.c; }));
  var comC2 = L.filter(function (l) { return l.c.dif > 0; }), pend = comC2.filter(function (l) { return !l.caixa2_transferido; });
  var vPend = gfeArr(pend.reduce(function (s, l) { return s + l.c.dif; }, 0)), vTransf = gfeArr(comC2.reduce(function (s, l) { return s + (l.caixa2_transferido ? l.caixa2_valor || 0 : 0); }, 0));
  var esperado = L.reduce(function (s, l) { return s + (l.esperado || 0); }, 0), rend = esperado > 0 ? total.placas / esperado : null;
  var card = function (t, v, s, cl) { return '<div class="gfe-card ' + (cl || "") + '"><span>' + t + "</span><strong>" + v + "</strong><small>" + s + "</small></div>"; };
  h += '<section class="gfe-cards">' + card("Blocos usados", gfeInt(total.blocos), gfeInt(total.placas) + " placas produzidas" + (rend !== null ? " · rendimento " + gfePct(rend) + " do esperado" : "")) + card("Custo da produção interna", gfeBrl(total.ci), "blocos usados × preço do bloco") +
    card("Se comprasse do fornecedor", gfeBrl(total.vf), "placas produzidas × preço da placa") +
    '<div class="gfe-card gfe-dest gfe-c2"><span>Diferença — Caixa 2</span><strong class="' + gfeCls(total.dif) + '">' + gfeDin(total.dif) + "</strong><small>" + gfePctS(total.pct) + " sobre o valor do fornecedor · " + (total.dif >= 0 ? "a produção interna saiu mais barata" : "a produção interna saiu mais cara") + "</small>" +
    (comC2.length ? '<div class="gfe-c2b"><span class="gfe-pos">✓ Transferido pelo financeiro: ' + gfeBrl(vTransf) + '</span><span class="' + (vPend > 0 ? "gfe-am" : "gfe-mudo") + '">A transferir: ' + gfeBrl(vPend) + "</span></div>" : "") + "</div></section>";
  // por tipo
  var porTipo = {}; L.forEach(function (l) { var t = porTipo[l.tipo] || (porTipo[l.tipo] = { blocos: 0, placas: 0 }); t.blocos += l.blocos; t.placas += l.placas; });
  var linhas = Object.keys(porTipo).sort().map(function (t) { return $.extend({ tipo: t }, self.comparar(t, porTipo[t].blocos, porTipo[t].placas)); });
  h += '<div class="gfe-grid"><section class="gfe-sec"><h2>Por tipo de placa</h2><div class="gfe-tw"><table class="gfe-t"><thead><tr><th>Tipo</th><th class="n">Blocos</th><th class="n">Placas</th><th class="n">Placa interna</th><th class="n">Placa fornecedor</th><th class="n" title="Custo interno ÷ placas produzidas (com a perda)">Custo real/placa</th><th class="n">Custo interno</th><th class="n">Valor fornecedor</th><th class="n">Diferença</th><th class="n">%</th></tr></thead><tbody>';
  if (!linhas.length) h += '<tr><td colspan="10" class="gfe-vazio">Nenhum lançamento neste período.</td></tr>';
  linhas.forEach(function (t) { var p = self.precos(t.tipo); h += "<tr><td><b>" + gfeEsc(GFE2_ROT[t.tipo] || t.tipo) + '</b></td><td class="n">' + gfeInt(t.blocos) + '</td><td class="n">' + gfeInt(t.placas) + '</td><td class="n">' + gfeBrl(p.bloco / p.placasBloco) + '</td><td class="n">' + gfeBrl(p.forn) + '</td><td class="n">' + (t.placas > 0 ? gfeBrl(t.ci / t.placas) : "—") + '</td><td class="n">' + gfeBrl(t.ci) + '</td><td class="n">' + gfeBrl(t.vf) + '</td><td class="n ' + gfeCls(t.dif) + '"><b>' + gfeDin(t.dif) + '</b></td><td class="n ' + gfeCls(t.dif) + '">' + gfePctS(t.pct) + "</td></tr>"; });
  if (linhas.length) h += '<tr class="gfe-tot"><td>Total</td><td class="n">' + gfeInt(total.blocos) + '</td><td class="n">' + gfeInt(total.placas) + '</td><td class="n gfe-mudo">—</td><td class="n gfe-mudo">—</td><td class="n">' + (total.placas > 0 ? gfeBrl(total.ci / total.placas) : "—") + '</td><td class="n">' + gfeBrl(total.ci) + '</td><td class="n">' + gfeBrl(total.vf) + '</td><td class="n ' + gfeCls(total.dif) + '">' + gfeDin(total.dif) + '</td><td class="n ' + gfeCls(total.dif) + '">' + gfePctS(total.pct) + "</td></tr>";
  h += '</tbody></table></div></section><section class="gfe-sec"><h2>Preços usados</h2>' + ["TRAPEZIO_TR25", "FORRO_TR25"].map(function (t) { var p = self.precos(t), i = p.bloco / p.placasBloco, d = p.forn - i; return '<div class="gfe-preco"><b>' + p.nome + '</b><dl><dt>Bloco</dt><dd>' + gfeBrl(p.bloco) + " (" + p.placasBloco + ' placas)</dd><dt>Placa na produção interna</dt><dd>' + gfeBrl(i) + '</dd><dt>Placa no fornecedor</dt><dd>' + gfeBrl(p.forn) + '</dd><dt><b>Diferença por placa</b></dt><dd class="' + gfeCls(d) + '"><b>' + gfeDin(d) + " (" + gfePctS(p.forn ? d / p.forn : null) + ")</b></dd></dl></div>"; }).join("") +
    '<p class="gfe-nota">Custo interno = blocos usados × preço do bloco (a perda já está no custo). Fornecedor = placas produzidas × preço da placa. Diferença = fornecedor − custo interno, apontada como Caixa 2. Os preços ficam em “Configuração de EPS”.</p></section></div>';
  // lançamentos
  var vis = L.filter(function (l) { return self.filtro === "pendentes" ? l.c.dif > 0 && !l.caixa2_transferido : self.filtro === "transferidos" ? !!l.caixa2_transferido : true; });
  h += '<section class="gfe-sec"><div class="gfe-lc"><h2>Lançamentos <small>(' + vis.length + ")</small></h2>" + [["todos", "Todos"], ["pendentes", "A transferir (" + pend.length + ")"], ["transferidos", "Transferidos (" + (comC2.length - pend.length) + ")"]].map(function (f) { return '<button type="button" class="gfe-chip' + (self.filtro === f[0] ? " gfe-on" : "") + '" data-filtro="' + f[0] + '">' + f[1] + "</button>"; }).join("") +
    (pend.length ? '<button type="button" class="gfe-conf" data-on="1" data-transf="' + pend.map(function (l) { return l.name; }).join(",") + '" data-txt="Confirmar que o financeiro transferiu o Caixa 2 de ' + pend.length + " lançamento(s), no total de " + gfeBrl(vPend) + '?">✓ Confirmar todos a transferir (' + gfeBrl(vPend) + ")</button>" : "") + '</div><div class="gfe-tw"><table class="gfe-t"><thead><tr><th>Data</th><th>Colaborador</th><th>Tipo</th><th class="n">Blocos</th><th class="n">Placas</th><th class="n">Esperado</th><th class="n">Custo interno</th><th class="n">Valor fornecedor</th><th class="n">Diferença</th><th class="n">%</th><th>Caixa 2</th><th>Observação</th></tr></thead><tbody>';
  if (!vis.length) h += '<tr><td colspan="12" class="gfe-vazio">' + (L.length ? "Nenhum lançamento com esse filtro." : "Nenhum lançamento neste período.") + "</td></tr>";
  vis.forEach(function (l) {
    var c = l.c, cx = c.dif <= 0 ? '<span class="gfe-mudo">—</span>' : l.caixa2_transferido ? '<span class="gfe-ok" title="Confirmado por ' + gfeEsc(l.caixa2_por) + '">✓ Transferido</span> <small>' + gfeEsc(l.caixa2_por) + "<br>" + gfeBr(l.caixa2_em) + '</small> <button type="button" class="gfe-lk" data-on="0" data-transf="' + gfeEsc(l.name) + '" data-txt="Desfazer a confirmação de transferência do Caixa 2 (' + gfeBrl(l.caixa2_valor) + ')?">desfazer</button>' :
      '<button type="button" class="gfe-pend" data-on="1" data-transf="' + gfeEsc(l.name) + '" data-txt="Confirmar que o financeiro transferiu o Caixa 2 deste lançamento (' + gfeBrl(c.dif) + ')?">Confirmar transferência</button>';
    h += "<tr><td>" + gfeBr(l.data) + "</td><td>" + gfeEsc(l.colaborador || "—") + "</td><td>" + gfeEsc(GFE2_ROT[l.tipo] || l.tipo) + '</td><td class="n">' + gfeInt(l.blocos) + '</td><td class="n">' + gfeInt(l.placas) + '</td><td class="n">' + (l.esperado ? gfeInt(l.esperado) : "—") + '</td><td class="n">' + gfeBrl(c.ci) + '</td><td class="n">' + gfeBrl(c.vf) + '</td><td class="n ' + gfeCls(c.dif) + '"><b>' + gfeDin(c.dif) + '</b></td><td class="n ' + gfeCls(c.dif) + '">' + gfePctS(c.pct) + "</td><td>" + cx + '</td><td class="gfe-obs">' + gfeEsc(l.observacao || "") + "</td></tr>";
  });
  this.$r.html(h + "</tbody></table></div></section>");
  this.L = L; this.total = total; this.iv = iv;
};

GfEps.prototype.csv = function () {
  var self = this;
  function esc(x) { var s = String(x == null ? "" : x); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function num(n) { return n.toFixed(2).replace(".", ","); }
  var cab = ["Data", "Colaborador", "Tipo", "Blocos", "Placas", "Esperado", "Custo interno (R$)", "Valor fornecedor (R$)", "Diferença - Caixa 2 (R$)", "% sobre fornecedor", "Caixa 2 transferido", "Observação"];
  var linhas = this.L.slice().sort(function (a, b) { return String(a.creation).localeCompare(String(b.creation)); }).map(function (l) { return [gfeBr(l.data), l.colaborador || "", GFE2_ROT[l.tipo] || l.tipo, l.blocos, l.placas, l.esperado || "", num(l.c.ci), num(l.c.vf), num(l.c.dif), l.c.pct === null ? "" : (l.c.pct * 100).toFixed(1).replace(".", ","), l.caixa2_transferido ? "Sim" : "Não", l.observacao || ""].map(esc).join(";"); });
  var t = this.total; linhas.push(["TOTAL", "", "", t.blocos, t.placas, "", num(t.ci), num(t.vf), num(t.dif), t.pct === null ? "" : (t.pct * 100).toFixed(1).replace(".", ","), "", ""].map(esc).join(";"));
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + [cab.join(";")].concat(linhas).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
  a.download = "placas-eps-" + this.iv.inicio + "-a-" + this.iv.fim + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
};
