/*
  Personalizacao da tela de login - Sorocaba Motores (SRCB)
  Onde colar: Site > Personalizar > Script de website (Website Script)
  Logo: envie personalizacao/srcb-logo.png como arquivo PUBLICO em File (ajuste LOGO_URL se o nome mudar)
  Cores: troque --sm-accent para a cor da marca
*/
(function () {
  var LOGO_URL = "/files/srcb-logo.png";

  var css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --sm-accent: #2E86FF;
  --sm-black: #141414;
  --sm-text: #1c1c1c;
  --sm-muted: #6b6b6b;
}

/* ---------- Só na tela de login ---------- */
body[data-path="login"] {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  /* fundo escuro (o logo e branco): brilho azul no canto + faixas diagonais discretas */
  background:
    radial-gradient(ellipse 60% 70% at 18% 30%, rgba(46,134,255,.20), transparent 70%),
    repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0 2px, transparent 2px 46px),
    linear-gradient(135deg, #0d0f14 0%, #171a22 55%, #0b0c10 100%);
  background-attachment: fixed;
}

/* esconde o topo e o rodapé padrão (o rodapé vai para dentro do cartão) */
body[data-path="login"] .navbar,
body[data-path="login"] .page-breadcrumbs,
body[data-path="login"] .page-header-wrapper,
body[data-path="login"] .web-footer { display: none !important; }

/* painel de boas-vindas à esquerda: logo + texto */
.sm-hero {
  position: fixed; left: 6vw; top: 50%; transform: translateY(-50%);
  width: 38vw; max-width: 560px; z-index: 1; color: #fff;
}
.sm-hero .sm-logo { display: block; width: clamp(180px, min(22vw, 38vh), 340px); height: auto; margin: 0 0 clamp(20px, 5vh, 48px); }
.sm-hero h2 {
  font-size: clamp(24px, min(3.2vw, 6vh), 54px); line-height: 1.1; font-weight: 500;
  margin: 0 0 clamp(12px, 3vh, 24px); letter-spacing: -.01em; color: #fff;
}
.sm-hero h2 span { color: var(--sm-accent); font-weight: 700; }
.sm-hero .sm-bar { width: 52px; height: 4px; background: var(--sm-accent); border-radius: 2px; margin-bottom: clamp(10px, 2.4vh, 20px); }
.sm-hero p { font-size: clamp(13px, min(1.2vw, 2.4vh), 19px); color: rgba(255,255,255,.78); margin: 0; line-height: 1.55; }

/* container: centraliza o cartão, mas rola se a tela for baixa demais */
body[data-path="login"] #page-login,
body[data-path="login"] #page-login .page-content-wrapper { min-height: 100vh; padding: 0 !important; margin: 0 !important; }
body[data-path="login"] #page-login .page-footer { display: none !important; }
body[data-path="login"] #page-login main.container {
  max-width: none; width: 100%; margin: 0; box-sizing: border-box;
  min-height: 100vh; display: flex; justify-content: flex-end;
  padding: clamp(12px, 3vh, 28px) 6vw clamp(12px, 3vh, 28px) 0;
}
body[data-path="login"] #page-login .page_content {
  position: relative; z-index: 2; width: 100%; max-width: 460px; margin: auto 0; min-height: 0 !important;
}
body[data-path="login"] .for-login,
body[data-path="login"] .for-login > div { min-height: 0 !important; height: auto !important; }

/* cartão (medidas escalam com a altura da tela) */
body[data-path="login"] .login-content.page-card {
  background: rgba(255,255,255,.97); border: 0; border-radius: 26px;
  padding: clamp(20px, 4.4vh, 40px) clamp(22px, 3vw, 42px) clamp(14px, 2.6vh, 26px);
  max-width: 460px; width: 100%; margin: 0; min-height: 0 !important; height: auto !important;
  box-shadow: 0 30px 70px rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.2);
}
body[data-path="login"] .page-card-head { text-align: left; margin-bottom: clamp(10px, 2.4vh, 22px); }
body[data-path="login"] .page-card-head .app-logo { display: none !important; } /* logo fica so no painel */
body[data-path="login"] .page-card-head h4 { font-size: clamp(26px, 4.6vh, 36px); font-weight: 800; color: var(--sm-text); letter-spacing: -.02em; margin: 0 0 4px; }
body[data-path="login"] .page-card-subtitle { color: var(--sm-muted); font-size: clamp(13px, 2vh, 16px); margin: 0; }

body[data-path="login"] .form-group { margin-bottom: clamp(8px, 1.8vh, 16px); }
body[data-path="login"] .form-label { color: var(--sm-muted); font-size: 14px; font-weight: 500; margin-bottom: 4px; }
body[data-path="login"] .form-control {
  height: clamp(42px, 6vh, 50px); border-radius: 12px; border: 1px solid #e3e6ee; background: #f3f5fb;
  font-size: 15px; transition: box-shadow .15s, border-color .15s, background .15s;
}
body[data-path="login"] .form-control:focus {
  background: #fff; border-color: var(--sm-accent); box-shadow: 0 0 0 4px rgba(46,134,255,.25);
}
body[data-path="login"] .forgot-password-message { text-align: right; margin: 6px 0 0; }
body[data-path="login"] .forgot-password-message a {
  color: var(--sm-text); font-weight: 600; text-decoration: none;
  border-bottom: 2px solid var(--sm-accent); padding-bottom: 1px;
}

/* botão principal */
body[data-path="login"] .btn-login {
  height: clamp(44px, 6.4vh, 52px); border-radius: 12px; background: var(--sm-black); border: 0; color: #fff;
  font-size: 16px; font-weight: 700; letter-spacing: .01em;
  box-shadow: 0 8px 20px rgba(0,0,0,.22); transition: transform .12s, box-shadow .12s, background .12s;
}
body[data-path="login"] .btn-login:hover { background: #000; transform: translateY(-1px); box-shadow: 0 12px 26px rgba(0,0,0,.28); }
body[data-path="login"] .btn-login::after { content: "  →"; color: var(--sm-accent); }

/* remove o botão "Entrar com link de e-mail" */
body[data-path="login"] .for-login .btn-login-with-email-link { display: none !important; }

/* rodapé dentro do cartão */
.sm-card-foot { margin-top: clamp(12px, 2.4vh, 22px); padding-top: clamp(8px, 1.8vh, 16px); border-top: 1px solid #ececec;
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px; color: var(--sm-muted); font-size: 12.5px; }
.sm-card-foot .sm-copy { font-weight: 600; }
.sm-card-foot .sm-addr { line-height: 1.4; font-size: 12px; }

/* telas baixas (notebooks, janelas pequenas): enxuga o cartão */
@media (max-height: 700px) {
  .sm-card-foot .sm-addr { display: none; }
  body[data-path="login"] .page-card-subtitle { display: none; }
}
@media (max-height: 560px) {
  .sm-card-foot { display: none; }
}

/* telas medias: cartao um pouco menor para nao encostar no texto */
@media (max-width: 1200px) {
  body[data-path="login"] #page-login .page_content,
  body[data-path="login"] .login-content.page-card { max-width: 410px; }
}

/* tablet e celular: logo no topo e o cartão centralizado abaixo */
@media (max-width: 991px) {
  .sm-hero { position: absolute; left: 0; right: 0; top: 0; transform: none; width: 100%; max-width: none; padding: 28px 14px 0; text-align: center; }
  .sm-hero .sm-logo { width: clamp(150px, 42vw, 230px); margin: 0 auto; }
  .sm-hero h2, .sm-hero .sm-bar, .sm-hero p { display: none; }
  body[data-path="login"] #page-login main.container {
    justify-content: center; align-items: flex-start;
    padding: calc(clamp(150px, 42vw, 230px) * .31 + 56px) 14px 28px;
  }
  body[data-path="login"] #page-login .page_content { margin: 0 auto; }
  body[data-path="login"] #page-login .page_content,
  body[data-path="login"] .login-content.page-card { max-width: 440px; }
}
@media (max-width: 480px) {
  body[data-path="login"] .login-content.page-card { border-radius: 20px; }
}
`;

  if (!document.getElementById("sm-login-style")) {
    var st = document.createElement("style");
    st.id = "sm-login-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    if (document.body.getAttribute("data-path") !== "login" || document.querySelector(".sm-hero")) return;

    var hero = document.createElement("div");
    hero.className = "sm-hero";
    hero.innerHTML =
      '<img class="sm-logo" src="' + encodeURI(LOGO_URL) + '" alt="Sorocaba Motores">' +
      '<h2>Energia e precisão para a <span>sua indústria.</span></h2>' +
      '<div class="sm-bar"></div>' +
      '<p>Motores elétricos e serviços industriais com qualidade e confiança.</p>';
    document.body.appendChild(hero);

    // rodapé (copyright + endereço) dentro do cartão de login
    var card = document.querySelector(".for-login .login-content");
    var info = document.querySelector(".footer-info .footer-col-left");
    if (card && !card.querySelector(".sm-card-foot")) {
      var lines = info ? info.innerText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var foot = document.createElement("div");
      foot.className = "sm-card-foot";
      foot.innerHTML =
        '<div class="sm-copy">' + (lines[0] || "") + '</div>' +
        '<div class="sm-addr">' + (lines[1] || "") + '</div>';
      card.appendChild(foot);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
