/* Entregas (Dashboard) - Grupo Gferro (página "entregas-dashboard")
 * Dashboard > Entregas da Intranet com os dados do ERP: as entregas lançadas na tela "Entregas" ligadas ao Pedido de Venda
 * (vendedor, loja, valor, recebimento na entrega e prazo prometido). Regras iguais às da Intranet:
 *  - cobrança na entrega = parcelas do pedido marcadas "entrega" (retirada não conta); sem parcela marcada, vale o que foi pago no dia da entrega;
 *  - atrasada = entregue depois do prazo; a pontualidade conta só a primeira entrega lançada de cada pedido. */
frappe.pages["entregas-dashboard"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Entregas", single_column: true });
  $(wrapper).addClass("gf-entd");
  wrapper.gf_entd = new GfEntDash(page);
};
frappe.pages["entregas-dashboard"].on_page_show = function (wrapper) { if (wrapper.gf_entd) wrapper.gf_entd.carregar(); };

var GFD_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function gfdChave(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function gfdBr(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—"; }
function gfdBrl(n) { return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function gfdInt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function gfdM2(n) { return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " m²"; }
function gfdPct(n) { return n === null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%"; }
function gfdEsc(s) { return frappe.utils.escape_html(s == null ? "" : String(s)); }
function gfdNorm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function gfdPl(n, a, b) { return n + " " + (n === 1 ? a : b); }
function gfdArred(v) { return Math.round(v * 100) / 100; }
function gfdDias(de, ate) { var a = de.split("-").map(Number), b = ate.split("-").map(Number); return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000); }

/** Entrega depois do prazo = atrasada (dias corridos); no dia ou antes = no prazo. */
function gfdPrazo(l) {
  if (!l.prazo) return { s: "sem-prazo", atraso: 0, antes: 0 };
  var d = gfdDias(l.prazo, l.data);
  return d > 0 ? { s: "atrasado", atraso: d, antes: 0 } : { s: "no-prazo", atraso: 0, antes: Math.max(0, -d) };
}
function gfdTotais(linhas) {
  var porPed = {}; linhas.forEach(function (l) { if (!porPed[l.pedido]) porPed[l.pedido] = l; });
  var unicos = Object.keys(porPed).map(function (k) { return porPed[k]; });
  var comPrazo = linhas.filter(function (l) { return l.primeiraDoPedido && l.pz.s !== "sem-prazo"; }), atr = comPrazo.filter(function (l) { return l.pz.s === "atrasado"; }).length;
  var soma = function (f) { return gfdArred(unicos.reduce(function (s, l) { return s + f(l); }, 0)); };
  return {
    entregas: linhas.length, pedidos: unicos.length, metragem: gfdArred(linhas.reduce(function (s, l) { return s + (l.metragem || 0); }, 0)), valorPedidos: soma(function (l) { return l.valorPedido || 0; }),
    recebidoNaEntrega: soma(function (l) { return l.recebimento ? l.recebimento.naEntrega : 0; }), comRecebimento: unicos.filter(function (l) { return l.recebimento && l.recebimento.naEntrega > 0; }).length,
    emAberto: soma(function (l) { return l.recebimento ? l.recebimento.emAberto : 0; }), comPrazo: comPrazo.length, atrasados: atr, pctNoPrazo: comPrazo.length ? Math.round(((comPrazo.length - atr) / comPrazo.length) * 1000) / 10 : null
  };
}

function GfEntDash(page) {
  this.page = page; this.modo = "mes"; this.ref = new Date(); this.dados = null; this.erro = ""; this.f = { busca: "", loja: "todas", motorista: "todos" };
  this.$ = $(page.main); this.$.html('<div class="gfd"></div>'); this.$r = this.$.find(".gfd");
  var self = this;
  this.$r.on("click", "[data-modo]", function () { self.modo = $(this).data("modo"); self.carregar(); });
  this.$r.on("click", "[data-mover]", function () { self.mover(+$(this).data("mover")); });
  this.$r.on("click", "[data-hoje]", function () { self.ref = new Date(); self.carregar(); });
  this.$r.on("change", "[data-data]", function () { if (this.value) { self.ref = new Date(this.value + "T00:00:00"); self.carregar(); } });
  this.$r.on("change", "[data-mesel]", function () { var p = this.value.split("-").map(Number); self.ref = new Date(p[0], p[1] - 1, 1); self.carregar(); });
  this.$r.on("change", "[data-fil]", function () { self.f[$(this).data("fil")] = this.value; self.desenhar(); });
  this.$r.on("input", ".gfd-busca", function () { self.f.busca = this.value; var p = this.selectionStart; self.desenhar(); var i = self.$r.find(".gfd-busca").trigger("focus")[0]; if (i) i.setSelectionRange(p, p); });
  this.$r.on("click", "[data-atualizar]", function () { self.carregar(); });
}

GfEntDash.prototype.mover = function (n) {
  var r = this.ref; this.ref = this.modo === "mes" ? new Date(r.getFullYear(), r.getMonth() + n, 1) : new Date(r.getFullYear(), r.getMonth(), r.getDate() + n * (this.modo === "semana" ? 7 : 1)); this.carregar();
};
GfEntDash.prototype.intervalo = function () {
  var r = this.ref;
  if (this.modo === "dia") return { inicio: gfdChave(r), fim: gfdChave(r) };
  if (this.modo === "semana") { var dom = new Date(r.getFullYear(), r.getMonth(), r.getDate() - r.getDay()); return { inicio: gfdChave(dom), fim: gfdChave(new Date(dom.getFullYear(), dom.getMonth(), dom.getDate() + 6)) }; }
  return { inicio: gfdChave(new Date(r.getFullYear(), r.getMonth(), 1)), fim: gfdChave(new Date(r.getFullYear(), r.getMonth() + 1, 0)) };
};
GfEntDash.prototype.rotulo = function (iv) {
  if (this.modo === "mes") { var p = iv.inicio.split("-").map(Number); return GFD_MESES[p[1] - 1] + " de " + p[0]; }
  return iv.inicio === iv.fim ? gfdBr(iv.inicio) : gfdBr(iv.inicio) + " a " + gfdBr(iv.fim);
};
GfEntDash.prototype.carregar = function () {
  var self = this, iv = this.intervalo(); this.chave = iv.inicio + iv.fim;
  frappe.call({ method: "erpnext.gferro_utils.entregas_dashboard", args: iv }).then(function (r) {
    if (r.message.inicio + r.message.fim !== self.chave) return; self.dados = r.message; self.erro = ""; self.desenhar();
  }).catch(function () { self.erro = "Não foi possível carregar as entregas."; self.desenhar(); });
};

GfEntDash.prototype.resumo = function (titulo, grupos, pont) {
  var h = '<section class="gfd-card"><h2>' + titulo + '</h2><div class="gfd-tw"><table class="gfd-t"><thead><tr><th>' + titulo.replace("Por ", "").replace(/^./, function (c) { return c.toUpperCase(); }) + '</th><th class="n">Entregas</th><th class="n">m²</th><th class="n">Valor</th><th class="n">Recebido na entrega</th>' + (pont ? '<th class="n">No prazo</th>' : "") + "</tr></thead><tbody>";
  if (!grupos.length) h += '<tr><td colspan="' + (pont ? 6 : 5) + '" class="gfd-vazio">Sem entregas.</td></tr>';
  grupos.forEach(function (g) { h += "<tr><td><b>" + gfdEsc(g.nome) + '</b></td><td class="n">' + gfdInt(g.t.entregas) + '</td><td class="n">' + gfdInt(Math.round(g.t.metragem)) + '</td><td class="n">' + gfdBrl(g.t.valorPedidos) + '</td><td class="n">' + gfdBrl(g.t.recebidoNaEntrega) + "</td>" + (pont ? '<td class="n">' + gfdPct(g.t.pctNoPrazo) + "</td>" : "") + "</tr>"; });
  return h + "</tbody></table></div></section>";
};

GfEntDash.prototype.desenhar = function () {
  var self = this, iv = this.intervalo(), f = this.f, d = this.dados, h = "";
  var opcoes = []; var hoje = new Date(); for (var i = 0; i < 13; i++) { var dt = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); opcoes.push([gfdChave(dt), GFD_MESES[dt.getMonth()] + " de " + dt.getFullYear()]); }
  h += '<div class="gfd-topo"><div><div class="gfd-trilha">Dashboard • Entregas</div><h1>Entregas</h1><p>As entregas lançadas na tela Entregas, ligadas ao pedido: vendedor, loja, valor, recebimento na entrega e prazo prometido.</p></div><div class="gfd-acoes">' +
    '<input type="search" class="gfd-busca" placeholder="Buscar pedido, cliente, motorista..." value="' + gfdEsc(f.busca) + '"><button type="button" class="gfd-b" data-atualizar="1">Atualizar</button></div></div>';
  h += '<div class="gfd-barra"><div class="gfd-seg">' + [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(function (m) { return '<button type="button" data-modo="' + m[0] + '" class="' + (self.modo === m[0] ? "gfd-on" : "") + '">' + m[1] + "</button>"; }).join("") + "</div>" +
    '<div class="gfd-nav"><button type="button" class="gfd-ic" data-mover="-1" aria-label="Período anterior">&#8249;</button><strong>' + this.rotulo(iv) + '</strong><button type="button" class="gfd-ic" data-mover="1" aria-label="Próximo período">&#8250;</button><button type="button" class="gfd-b gfd-p" data-hoje="1">Hoje</button>' +
    '<input type="date" data-data="1" value="' + gfdChave(this.ref) + '" aria-label="Escolher uma data">' + (this.modo === "mes" ? '<select data-mesel="1" class="gfd-sel">' + (opcoes.some(function (o) { return o[0] === iv.inicio; }) ? "" : '<option value="' + iv.inicio + '">' + this.rotulo(iv) + "</option>") + opcoes.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === iv.inicio ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" : "") + "</div>";
  var linhas = d ? d.entregas.map(function (l) { return $.extend({}, l, { pz: gfdPrazo(l) }); }) : [];
  var lojas = [], mots = []; linhas.forEach(function (l) { if (lojas.indexOf(l.loja) < 0) lojas.push(l.loja); if (mots.indexOf(l.motorista) < 0) mots.push(l.motorista); }); lojas.sort(); mots.sort();
  h += '<select data-fil="loja" class="gfd-sel"><option value="todas">Todas as lojas</option>' + lojas.map(function (l) { return '<option value="' + gfdEsc(l) + '"' + (f.loja === l ? " selected" : "") + ">" + gfdEsc(l) + "</option>"; }).join("") + "</select>" +
    '<select data-fil="motorista" class="gfd-sel"><option value="todos">Todos os motoristas</option>' + mots.map(function (m) { return '<option value="' + gfdEsc(m) + '"' + (f.motorista === m ? " selected" : "") + ">" + gfdEsc(m) + "</option>"; }).join("") + "</select></div>";
  if (this.erro) h += '<p class="gfd-aviso">' + gfdEsc(this.erro) + "</p>";
  if (!d) { this.$r.html(h + '<p class="gfd-vazio">Carregando...</p>'); return; }
  var termo = gfdNorm(f.busca.trim());
  var sel = linhas.filter(function (l) { return (f.loja === "todas" || l.loja === f.loja) && (f.motorista === "todos" || l.motorista === f.motorista) && (!termo || gfdNorm(l.pedido + " " + (l.cliente || "") + " " + l.motorista + " " + (l.vendedor || "") + " " + l.loja).indexOf(termo) >= 0); })
    .sort(function (a, b) { return b.data.localeCompare(a.data); });
  var t = gfdTotais(sel);
  var agr = function (campo) { var m = {}; sel.forEach(function (l) { (m[l[campo]] = m[l[campo]] || []).push(l); }); return Object.keys(m).map(function (k) { return { nome: k, t: gfdTotais(m[k]) }; }).sort(function (a, b) { return b.t.entregas - a.t.entregas; }); };
  var kpi = function (c, tt, v, s) { return '<div class="gfd-kpi ' + c + '"><span>' + tt + "</span><strong>" + v + "</strong><small>" + s + "</small></div>"; };
  h += '<section class="gfd-kpis">' + kpi("gfd-am", "Entregas", gfdInt(t.entregas), gfdPl(t.pedidos, "pedido entregue", "pedidos entregues")) + kpi("gfd-az", "Metragem", gfdM2(t.metragem), "somando todas as entregas") +
    kpi("gfd-cz", "Valor dos pedidos", gfdBrl(t.valorPedidos), "cada pedido conta uma vez") + kpi("gfd-vd", "Recebido na entrega", gfdBrl(t.recebidoNaEntrega), "em " + gfdPl(t.comRecebimento, "pedido", "pedidos")) + kpi("gfd-lj", "Falta receber", gfdBrl(t.emAberto), "dos pedidos entregues") + "</section>";
  h += '<div class="gfd-duas">' + this.resumo("Por loja", agr("loja"), true) + this.resumo("Por motorista", agr("motorista"), false) + "</div>";
  h += '<section class="gfd-card"><h2>Entregas do período</h2><div class="gfd-tw"><table class="gfd-t"><thead><tr><th>Data</th><th>Pedido / Cliente</th><th>Motorista</th><th>Vendedor / Loja</th><th class="n">Valor</th><th>Recebimento</th><th>Prazo</th></tr></thead><tbody>';
  if (!sel.length) h += '<tr><td colspan="7" class="gfd-vazio">' + (linhas.length ? "Nenhuma entrega encontrada para esses filtros." : "Nenhuma entrega lançada nesse período.") + "</td></tr>";
  sel.forEach(function (l) {
    var r = l.recebimento, rec;
    if (!r) rec = '<span class="gfd-mudo">' + (l.pedidoEncontrado ? "Sem dados" : "Pedido não encontrado no ERP") + "</span>";
    else {
      rec = (r.situacao === "RECEBIDO" ? '<b class="gfd-vd2">Recebido ' + gfdBrl(r.naEntrega) + "</b>" : r.situacao === "PARCIAL" ? '<b class="gfd-am2">Parcial ' + gfdBrl(r.naEntrega) + " de " + gfdBrl(r.cobranca) + "</b>" : r.situacao === "A_RECEBER" ? '<b class="gfd-vm2">A receber ' + gfdBrl(r.cobranca) + "</b>" : r.situacao === "PAGO_ANTES" ? "<b>Pago antes</b>" : '<span class="gfd-mudo">Sem cobrança na entrega</span>') +
        (r.formas.length && r.situacao !== "PAGO_ANTES" ? "<small>" + gfdEsc(r.formas.join(", ")) + "</small>" : "") + (r.emAberto > 0.5 ? "<small>falta receber " + gfdBrl(r.emAberto) + " do pedido</small>" : "");
    }
    var pz = !l.prazo ? "—" : gfdBr(l.prazo) + "<small>prazo do pedido</small>" + (l.pz.s === "atrasado" ? '<span class="gfd-selo gfd-vm">Atrasada ' + gfdPl(l.pz.atraso, "dia", "dias") + "</span>" : '<span class="gfd-selo gfd-vd">' + (l.pz.antes > 0 ? "No prazo (" + l.pz.antes + "d antes)" : "No prazo") + "</span>") + (!l.primeiraDoPedido ? "<small>pedido lançado " + l.lancamentosDoPedido + "x</small>" : "");
    h += "<tr><td>" + gfdBr(l.data) + "</td><td><b>" + gfdEsc(l.pedido) + "</b><small>" + gfdEsc(l.cliente || "—") + "</small>" + (l.liberado ? '<span class="gfd-selo gfd-am" title="Entregue, mas o pedido ainda não está como Entregue no ERP">Falta dar a baixa</span>' : "") + "</td><td><b>" + gfdEsc(l.motorista) + "</b><small>" + gfdEsc(l.caminhao) + (l.metragem != null ? " · " + gfdM2(l.metragem) : "") + "</small></td><td>" + gfdEsc(l.vendedor || "—") + "<small>" + gfdEsc(l.loja) + '</small></td><td class="n">' + (l.valorPedido != null ? gfdBrl(l.valorPedido) : "—") + "</td><td>" + rec + "</td><td>" + pz + "</td></tr>";
  });
  h += "</tbody></table></div></section>";
  var foco = this.$r.find(".gfd-busca:focus").length; this.$r.html(h); if (foco) this.$r.find(".gfd-busca").trigger("focus");
};
