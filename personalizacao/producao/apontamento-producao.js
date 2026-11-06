/* Apontamento de Produção - Grupo Gferro (página "apontamento-producao")
 * Leitura em sequência com a leitora de código de barras (ela digita o código e envia Enter):
 *   matrícula do colaborador (crachá) -> ordem de serviço -> etapa do processo.
 * Depois, Iniciar / Pausar / Finalizar processo. "Cancelar apontamento" desfaz o último registro da etapa lida.
 * Usa erpnext.gferro_utils.apontamento_operador / apontamento_buscar / apontamento_acao. */
frappe.pages["apontamento-producao"].on_page_load = function (wrapper) {
  var page = frappe.ui.make_app_page({ parent: wrapper, title: "Apontamento de Produção", single_column: true });
  $(wrapper).addClass("gf-apt");
  wrapper.gf_apt = new GfApontamento(page, wrapper);
};
frappe.pages["apontamento-producao"].on_page_show = function (wrapper) {
  if (wrapper.gf_apt) wrapper.gf_apt.zerar();
};

var GFA_API = "erpnext.gferro_utils.";
var GFA_ICONES = {
  cracha: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16c.6-1.8 4.8-1.8 6.4 0M14 10h4M14 13.5h4"/>',
  barras: '<path d="M4 6v12M7 6v12M10 6v12M13.5 6v12M17 6v12M20 6v12" stroke-width="1.8"/><path d="M5.5 6v12M15 6v12" stroke-width="3"/>',
  etapa: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  cancelar: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'
};

function GfApontamento(page, wrapper) {
  this.page = page;
  this.wrapper = wrapper;
  this.montar();
}

GfApontamento.prototype.icone = function (n) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + GFA_ICONES[n] + "</svg>";
};
GfApontamento.prototype.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
};

GfApontamento.prototype.linha = function (campo, icone, titulo, dica) {
  return '<div class="gfa2-linha" data-campo="' + campo + '"><div class="gfa2-esq"><span class="gfa2-ic">' + this.icone(icone) + '</span>' +
    '<div><div class="gfa2-tit">' + titulo + '</div><div class="gfa2-dica" data-dica="' + campo + '">' + dica + "</div></div></div>" +
    '<div class="gfa2-dir"><input class="gfa2-in" data-campo="' + campo + '" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<span class="gfa2-ic2">' + this.icone(icone) + "</span></div></div>";
};

GfApontamento.prototype.montar = function () {
  var self = this;
  $(this.page.main).html(
    '<div class="gfa2"><h1>APONTAMENTO DE PRODUÇÃO</h1><p class="gfa2-sub">Utilize o leitor de código de barras para identificar os dados abaixo.</p>' +
    '<div class="gfa2-linhas">' +
    this.linha("matricula", "cracha", "MATRÍCULA DO COLABORADOR", "Bipe o crachá antes de iniciar um processo") +
    this.linha("os", "barras", "1 - ORDEM DE SERVIÇO", "Escaneie o código de barras da ordem de serviço") +
    this.linha("etapa", "etapa", "2 - ETAPA DO PROCESSO", "Escaneie o código de barras da etapa do processo") +
    '</div><div class="gfa2-info"></div><div class="gfa2-msg"></div>' +
    '<div class="gfa2-botoes">' +
    '<button type="button" class="gfa2-b gfa2-verde" data-acao="iniciar">' + this.icone("play") + "INICIAR PROCESSO</button>" +
    '<button type="button" class="gfa2-b gfa2-marrom" data-acao="pausar">' + this.icone("pause") + "PAUSAR PROCESSO</button>" +
    '<button type="button" class="gfa2-b gfa2-vermelho" data-acao="finalizar">' + this.icone("stop") + "FINALIZAR PROCESSO</button></div>" +
    '<div class="gfa2-cancelar"><button type="button" class="gfa2-b gfa2-borda" data-acao="cancelar">' + this.icone("cancelar") + "CANCELAR APONTAMENTO</button></div>" +
    '<p class="gfa2-rodape">Apontou errado (quantidade ou operação)? Leia a ordem e a etapa e toque aqui.</p>' +
    '<div class="gfa2-modal" hidden><div class="gfa2-caixa"><h3>Finalizar processo</h3><label>Quantidade produzida<input class="gfa2-qtd" type="number" step="any" min="0"></label>' +
    '<div class="gfa2-caixa-b"><button type="button" class="gfa2-b gfa2-vermelho gfa2-conf">CONFIRMAR</button>' +
    '<button type="button" class="gfa2-b gfa2-borda gfa2-canc">VOLTAR</button></div></div></div></div>');
  var $m = $(this.page.main);
  $m.find(".gfa2-in").on("keydown", function (e) {
    if (e.which === 13) { e.preventDefault(); self.ler($(this).attr("data-campo"), $(this).val()); }
  });
  $m.find(".gfa2-in").on("focus", function () { $(this).closest(".gfa2-linha").addClass("gfa2-ativa"); })
    .on("blur", function () { $(this).closest(".gfa2-linha").removeClass("gfa2-ativa"); });
  $m.find(".gfa2-b[data-acao]").on("click", function () { self.acao($(this).attr("data-acao")); });
  $m.find(".gfa2-conf").on("click", function () { self.confirmarFinal(); });
  $m.find(".gfa2-canc").on("click", function () { $m.find(".gfa2-modal").attr("hidden", true); self.foco("etapa"); });
  $m.find(".gfa2-qtd").on("keydown", function (e) { if (e.which === 13) { e.preventDefault(); self.confirmarFinal(); } });
  this.zerar();
};

GfApontamento.prototype.zerar = function () {
  this.op = null; this.ordem = null; this.etapa = null;
  var $m = $(this.page.main);
  $m.find(".gfa2-in").val("");
  $m.find('.gfa2-dica[data-dica="matricula"]').text("Bipe o crachá antes de iniciar um processo").removeClass("gfa2-ok");
  $m.find('.gfa2-dica[data-dica="os"]').text("Escaneie o código de barras da ordem de serviço").removeClass("gfa2-ok");
  $m.find('.gfa2-dica[data-dica="etapa"]').text("Escaneie o código de barras da etapa do processo").removeClass("gfa2-ok");
  $m.find(".gfa2-info").empty();
  $m.find(".gfa2-modal").attr("hidden", true);
  this.foco("matricula");
};
GfApontamento.prototype.foco = function (campo) {
  var $i = $(this.page.main).find('.gfa2-in[data-campo="' + campo + '"]');
  setTimeout(function () { $i.trigger("focus"); }, 40);
};
GfApontamento.prototype.aviso = function (t, tipo) {
  $(this.page.main).find(".gfa2-msg").attr("class", "gfa2-msg" + (tipo ? " gfa2-msg-" + tipo : "")).text(t || "");
};
GfApontamento.prototype.chamar = function (metodo, args) {
  return new Promise(function (ok, erro) {
    frappe.call({ method: GFA_API + metodo, args: args, freeze: false, callback: function (r) { ok(r.message); }, error: function () { erro(); } });
  });
};
GfApontamento.prototype.dica = function (campo, texto, ok) {
  $(this.page.main).find('.gfa2-dica[data-dica="' + campo + '"]').text(texto).toggleClass("gfa2-ok", !!ok);
};

GfApontamento.prototype.ler = function (campo, valor) {
  var self = this;
  valor = (valor || "").trim();
  if (!valor) return;
  this.aviso("");
  if (campo === "matricula") {
    this.chamar("apontamento_operador", { matricula: valor }).then(function (o) {
      self.op = o;
      self.dica("matricula", "✓ " + o.nome, true);
      self.foco("os");
    }).catch(function () { self.op = null; self.dica("matricula", "Matrícula não reconhecida", false); self.aviso("Matrícula não cadastrada ou inativa.", "erro"); self.limparCampo("matricula"); });
  } else if (campo === "os") {
    this.chamar("apontamento_buscar", { codigo: valor }).then(function (c) {
      if (c.tipo === "etapa") { self.ordem = { os: c.os }; self.dica("os", "✓ " + c.os, true); self.definirEtapa(c); return; }
      self.ordem = c;
      self.dica("os", "✓ " + c.os + " — " + c.produto, true);
      self.foco("etapa");
    }).catch(function () { self.ordem = null; self.aviso("Ordem de serviço não encontrada: " + valor, "erro"); self.limparCampo("os"); });
  } else {
    this.chamar("apontamento_buscar", { codigo: valor }).then(function (c) {
      if (c.tipo !== "etapa") { self.aviso("Esse código é de uma ordem. Bipe o código da ETAPA do processo.", "erro"); self.limparCampo("etapa"); return; }
      if (self.ordem && self.ordem.os && self.ordem.os !== c.os) {
        self.aviso("A etapa lida é da ordem " + c.os + ", mas a ordem bipada é " + self.ordem.os + ".", "erro"); self.limparCampo("etapa"); return;
      }
      if (!self.ordem) { self.ordem = { os: c.os }; self.dica("os", "✓ " + c.os, true); $(self.page.main).find('.gfa2-in[data-campo="os"]').val(c.os); }
      self.definirEtapa(c);
    }).catch(function () { self.etapa = null; self.aviso("Etapa não encontrada: " + valor, "erro"); self.limparCampo("etapa"); });
  }
};
GfApontamento.prototype.limparCampo = function (campo) {
  var $i = $(this.page.main).find('.gfa2-in[data-campo="' + campo + '"]');
  $i.val(""); this.foco(campo);
};
GfApontamento.prototype.definirEtapa = function (c) {
  this.etapa = c;
  this.dica("etapa", "✓ " + c.operacao, true);
  var st = { aguardando: "Aguardando", producao: "Em produção", pausada: "Pausada", concluida: "Concluída" }[c.estado];
  $(this.page.main).find(".gfa2-info").html(
    "<b>" + this.esc(c.os) + "</b> · " + this.esc(c.produto) + "<br><b>" + this.esc(c.operacao) + "</b> · " + this.esc(c.recurso || "-") +
    " · Quantidade " + c.feito + " / " + c.qtd + " · <span class='gfa2-st'>" + st + "</span>" + (c.operador ? " · Operador: " + this.esc(c.operador) : ""));
  $(this.page.main).find(".gfa2-botoes .gfa2-b").first().trigger("focus");
};

GfApontamento.prototype.pronto = function (acao) {
  if (!this.op) { this.aviso("Bipe primeiro o crachá do colaborador.", "erro"); this.foco("matricula"); return false; }
  if (!this.ordem) { this.aviso("Bipe a ordem de serviço.", "erro"); this.foco("os"); return false; }
  if (!this.etapa) { this.aviso("Bipe a etapa do processo.", "erro"); this.foco("etapa"); return false; }
  return true;
};

GfApontamento.prototype.acao = function (nome, qtd) {
  var self = this;
  if (!this.pronto(nome)) return;
  if (nome === "finalizar" && qtd === undefined) {
    var resta = Math.max(0, +(this.etapa.qtd - this.etapa.feito).toFixed(4));
    var $m = $(this.page.main).find(".gfa2-modal");
    $m.find(".gfa2-qtd").val(resta);
    $m.removeAttr("hidden");
    setTimeout(function () { $m.find(".gfa2-qtd").trigger("focus").trigger("select"); }, 40);
    return;
  }
  if (nome === "cancelar" && !window.confirm("Cancelar o último apontamento desta etapa?")) return;
  this.aviso("Registrando...");
  this.chamar("apontamento_acao", { job_card: this.etapa.job_card, acao: nome, matricula: this.op.matricula, qtd: qtd, os: this.ordem.os }).then(function (novo) {
    var rot = { iniciar: "iniciado", pausar: "pausado", finalizar: "finalizado", cancelar: "cancelado (apontamento desfeito)" }[nome];
    var texto = "Processo " + rot + ": " + novo.operacao + " (" + novo.os + ") — " + self.op.nome;
    var tipo = "ok", est = novo.estoque;
    if (est) {  // última etapa da ordem: resultado da baixa de estoque
      if (est.status === "lancado") texto += ". Ordem concluída e estoque baixado (" + est.documento + ").";
      else if (est.status === "existente" || est.status === "nenhum") texto += ". Ordem concluída.";
      else { texto += ". Ordem concluída, mas o ESTOQUE NÃO FOI LANÇADO" + (est.documento ? " (rascunho " + est.documento + ")" : "") + ": " + est.mensagem + " Avise o estoque."; tipo = "erro"; }
    }
    self.zerar();
    self.aviso(texto, tipo);
  }).catch(function () {
    self.aviso("Não foi possível registrar. Veja a mensagem do sistema.", "erro");
    $(self.page.main).find(".gfa2-modal").attr("hidden", true);
  });
};
GfApontamento.prototype.confirmarFinal = function () {
  var q = $(this.page.main).find(".gfa2-qtd").val();
  $(this.page.main).find(".gfa2-modal").attr("hidden", true);
  this.acao("finalizar", q);
};
