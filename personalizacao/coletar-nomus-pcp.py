"""Coleta os dados de PCP do Nomus (somente leitura) e grava um JSON por recurso.

Uso: python personalizacao/coletar-nomus-pcp.py [recurso ...]
Le NOMUS_BASE_URL e NOMUS_API_KEY de um .env (padrao: o do projeto GFERRO INTRANET;
outro caminho em NOMUS_ENV). Grava em personalizacao/nomus-dados/<recurso>.json.
Recursos ja coletados (arquivo existente) sao pulados; apague o arquivo para recoletar.
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENV = os.environ.get("NOMUS_ENV", r"C:\Users\Admin\Documents\GFERRO INTRANET\.env")
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nomus-dados")
RECURSOS = ["centrosTrabalho", "roteirosProduto", "listasMateriais",
            "componentesListaMateriais", "ordens", "operacoesRoteiroOrdem"]
PAGE_SIZE = 50
MAX_PAGINAS = 3000
PAUSA = 0.5

env = {}
for linha in open(ENV, encoding="utf-8"):
    linha = linha.strip()
    if linha and not linha.startswith("#") and "=" in linha:
        k, v = linha.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
BASE = env["NOMUS_BASE_URL"].rstrip("/")
CHAVE = env["NOMUS_API_KEY"]


def get(url, teto=False):
    tentativa = rede = 0
    while True:
        req = urllib.request.Request(url, headers={"Authorization": f"Basic {CHAVE}", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", "ignore")
            if e.code == 429:
                try:
                    espera = float(json.loads(corpo).get("tempoAteLiberar", 5))
                except Exception:
                    espera = 5
                print(f"  429, aguardando {espera + 1:.0f}s", flush=True)
                time.sleep(espera + 1)
                continue
            if e.code == 401:
                sys.exit("401: chave do Nomus invalida")
            if e.code == 400 and teto:
                return None  # passou do teto de paginacao da consulta
            # 400 esporadico = instancia engasgada (chave compartilhada com outros apps): espera e tenta de novo
            tentativa += 1
            if tentativa > 8:
                raise RuntimeError(f"HTTP {e.code} em {url}: {corpo[:200]}")
            time.sleep(min(10 * tentativa, 60))
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            # sem rede / DNS (visto na pratica: getaddrinfo failed): espera voltar, ate ~2h
            rede += 1
            if rede > 120:
                raise
            if rede == 1 or rede % 10 == 0:
                print(f"  sem rede ({type(e).__name__}), tentativa {rede}/120, aguardando 60s", flush=True)
            time.sleep(60)
        except Exception:
            tentativa += 1
            if tentativa > 8:
                raise
            time.sleep(min(10 * tentativa, 60))


JANELA = {"ordens": "dataHoraCriacao", "operacoesRoteiroOrdem": "dataHoraEdicao"}
CAMPOS_DATA = ["dataHoraEdicao", "dataModificacao", "dataHoraCriacao", "dataCriacao", "dataEmissao", "dataHora"]
TETO = 300  # a API devolve no maximo 6 paginas (300 registros) por consulta; a pagina 7 da 400


def fmt(d):
    return d.strftime("%Y-%m-%dT%H:%M:%S")


def salvar_ck(ck, forcar=False):
    if not forcar and time.time() - ck["ultimo"] < 20:
        return
    dados = {"desde": ck["desde"], "fim": ck["fim"], "feitas": sorted(ck["feitas"]),
             "divididas": sorted(ck["divididas"]), "registros": ck["acc"]}
    with open(ck["path"] + ".tmp", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False)
    os.replace(ck["path"] + ".tmp", ck["path"])
    ck["ultimo"] = time.time()


def janela(recurso, campo, a, b, ck):
    """Coleta registros com a < campo < b; se bater no teto, divide a janela ao meio."""
    chave = f"{fmt(a)}|{fmt(b)}"
    if chave in ck["feitas"]:
        return
    meio = a + (b - a) / 2
    if chave not in ck["divididas"]:
        query = urllib.parse.quote(f"{campo}>{fmt(a)};{campo}<{fmt(b)}")
        lote_total, pagina, capado = [], 1, False
        while True:
            lote = get(f"{BASE}/{recurso}?pagina={pagina}&query={query}", teto=True)
            if lote is None:
                capado = True
                break
            if not isinstance(lote, list) or not lote:
                break
            lote_total.extend(lote)
            if len(lote) < PAGE_SIZE:
                break
            pagina += 1
            time.sleep(PAUSA)
        if not ((capado or len(lote_total) >= TETO) and (b - a).total_seconds() > 60):
            ck["acc"].extend(lote_total)
            ck["feitas"].add(chave)
            print(f"  {recurso} {fmt(a)} -> {fmt(b)}: {len(lote_total)} (acumulado {len(ck['acc'])})", flush=True)
            salvar_ck(ck)
            time.sleep(PAUSA)
            return
        ck["divididas"].add(chave)
        salvar_ck(ck, forcar=True)
    janela(recurso, campo, a, meio, ck)
    janela(recurso, campo, meio, b, ck)


def coletar_por_janelas(recurso):
    nome = recurso.replace(chr(47), chr(95))
    destino = os.path.join(SAIDA, f"{nome}.json")
    if os.path.exists(destino):
        print(f"{recurso}: ja coletado, pulando", flush=True)
        return
    inicio = time.time()
    ck_path = os.path.join(SAIDA, f"{nome}.janelas.json")
    if os.path.exists(ck_path):  # retoma de onde parou
        salvo = json.load(open(ck_path, encoding="utf-8"))
        ck = {"path": ck_path, "desde": salvo["desde"], "fim": salvo["fim"], "feitas": set(salvo["feitas"]),
              "divididas": set(salvo["divididas"]), "acc": salvo["registros"], "ultimo": time.time()}
        print(f"{recurso}: retomando ({len(ck['feitas'])} janelas feitas, {len(ck['acc'])} registros)", flush=True)
    else:
        desde = datetime.datetime(2019, 1, 1)
        arq_ordens = os.path.join(SAIDA, "ordens.json")
        if recurso == "operacoesRoteiroOrdem" and os.path.exists(arq_ordens):
            # so interessam as operacoes de OS ainda abertas: comeca na criacao da mais antiga delas
            abertas = [datetime.datetime.strptime(o["dataHoraCriacao"][:10], "%d/%m/%Y")
                       for o in json.load(open(arq_ordens, encoding="utf-8")) if o["status"] != "Encerrada"]
            if abertas:
                desde = min(abertas) - datetime.timedelta(days=1)
                print(f"{recurso}: so OS abertas, a partir de {desde:%d/%m/%Y}", flush=True)
        fim = datetime.datetime.now() + datetime.timedelta(days=2)
        ck = {"path": ck_path, "desde": desde.isoformat(), "fim": fim.isoformat(), "feitas": set(),
              "divididas": set(), "acc": [], "ultimo": 0}
    janela(recurso, JANELA[recurso], datetime.datetime.fromisoformat(ck["desde"]), datetime.datetime.fromisoformat(ck["fim"]), ck)
    unicos = {r["id"]: r for r in ck["acc"]}
    with open(destino + ".tmp", "w", encoding="utf-8") as f:
        json.dump(list(unicos.values()), f, ensure_ascii=False)
    os.replace(destino + ".tmp", destino)
    os.remove(ck_path)
    print(f"{recurso}: CONCLUIDO, {len(unicos)} registros unicos em {time.time() - inicio:.0f}s", flush=True)


def coletar(recurso):
    if recurso in JANELA:
        return coletar_por_janelas(recurso)
    destino = os.path.join(SAIDA, f"{recurso.replace(chr(47), chr(95))}.json")
    if os.path.exists(destino):
        print(f"{recurso}: ja coletado, pulando", flush=True)
        return
    parcial = os.path.join(SAIDA, f"{recurso.replace(chr(47), chr(95))}.parcial.json")
    registros, pagina, inicio = [], 1, time.time()
    if os.path.exists(parcial):  # retoma de onde parou
        salvo = json.load(open(parcial, encoding="utf-8"))
        registros, pagina = salvo["registros"], salvo["proxima"]
        print(f"{recurso}: retomando na pagina {pagina} ({len(registros)} registros)", flush=True)
    while pagina <= MAX_PAGINAS:
        lote = get(f"{BASE}/{recurso}?pagina={pagina}", teto=True)
        if lote is None:  # bateu no teto de 300: refaz por janelas de data, se houver campo de data
            campo = next((c for c in CAMPOS_DATA if registros and c in registros[0]), None)
            if not campo:
                print(f"{recurso}: TETO de 300 sem campo de data para janelas; guardando so os {len(registros)} primeiros", flush=True)
                break
            print(f"{recurso}: teto de 300 atingido, recoletando por janelas de {campo}", flush=True)
            JANELA[recurso] = campo
            if os.path.exists(parcial):
                os.remove(parcial)
            return coletar_por_janelas(recurso)
        if not isinstance(lote, list) or not lote:
            break
        registros.extend(lote)
        if pagina % 10 == 0:
            json.dump({"registros": registros, "proxima": pagina + 1}, open(parcial, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"{recurso}: pagina {pagina}, {len(registros)} registros, {time.time() - inicio:.0f}s", flush=True)
        if len(lote) < PAGE_SIZE:
            break
        pagina += 1
        time.sleep(PAUSA)
    with open(destino + ".tmp", "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False)
    os.replace(destino + ".tmp", destino)
    if os.path.exists(parcial):
        os.remove(parcial)
    print(f"{recurso}: CONCLUIDO, {len(registros)} registros em {time.time() - inicio:.0f}s", flush=True)


os.makedirs(SAIDA, exist_ok=True)
for r in (sys.argv[1:] or RECURSOS):
    coletar(r)
print("FIM", flush=True)
