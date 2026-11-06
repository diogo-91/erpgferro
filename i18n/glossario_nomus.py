"""Troca o vocabulario de producao das traducoes pt-BR para o padrao do Nomus (o da fabrica).

  Ordem de Trabalho (Work Order)           -> Ordem de Servico (OS)
  Cartao de Trabalho (Job Card)            -> Apontamento
  Tipo de Estacao de Trabalho (Wk. Type)   -> Centro de Trabalho
  Estacao de Trabalho (Workstation)        -> Recurso   (maquina/equipamento do centro)

Uso: python glossario_nomus.py <pasta_apps>      (rodar DEPOIS de apply_translations.py, antes do bench build /
                                                  compile-po-to-mo). Idempotente: o que ja foi trocado nao casa de novo.
Cuida de genero e numero: "Estacao" e feminino e "Recurso" e masculino ("da Estacao" -> "do Recurso").
"""
import glob
import os
import re
import sys

import polib

apps_dir = sys.argv[1]
DRY = len(sys.argv) > 2 and sys.argv[2] == "--dry"  # so mostra exemplos, nao grava
amostras = []

# artigo/preposicao feminino -> masculino (singular e plural), mantendo maiuscula/minuscula
ART = {"da": "do", "na": "no", "pela": "pelo", "a": "o", "à": "ao", "esta": "este", "nesta": "neste", "essa": "esse",
       "nessa": "nesse", "uma": "um", "nova": "novo", "outra": "outro", "cada": "cada", "toda": "todo",
       "das": "dos", "nas": "nos", "pelas": "pelos", "as": "os", "às": "aos", "estas": "estes", "essas": "esses",
       "novas": "novos", "outras": "outros", "todas": "todos"}


def art_masc(m):
    a = m.group(1)
    novo = ART[a.lower()]
    if a.isupper() and len(a) > 1:
        return novo.upper() + m.group(2)
    return (novo.capitalize() if a[0].isupper() else novo) + m.group(2)


ART_RE = re.compile(r"\b(" + "|".join(sorted(ART, key=len, reverse=True)) + r")(\s+)(?=[Ee]sta[çc][ãa]o\s+de\s+[Tt]rabalho|[Ee]sta[çc][õo]es\s+de\s+[Tt]rabalho)", re.IGNORECASE)

TROCAS = [  # (padrao, substituicao) - do mais especifico para o mais geral
    (r"Tipos de Esta[çc][ãa]o de Trabalho", "Centros de Trabalho"),
    (r"Tipo de Esta[çc][ãa]o de Trabalho", "Centro de Trabalho"),
    (r"tipos de esta[çc][ãa]o de trabalho", "centros de trabalho"),
    (r"tipo de esta[çc][ãa]o de trabalho", "centro de trabalho"),
    (r"Esta[çc][õo]es de Trabalho", "Recursos"),
    (r"Esta[çc][ãa]o de Trabalho", "Recurso"),
    (r"esta[çc][õo]es de trabalho", "recursos"),
    (r"esta[çc][ãa]o de trabalho", "recurso"),
    (r"Ordens de Trabalho", "Ordens de Serviço"),
    (r"Ordem de Trabalho", "Ordem de Serviço"),
    (r"ordens de trabalho", "ordens de serviço"),
    (r"ordem de trabalho", "ordem de serviço"),
    (r"Cart[õo]es de Trabalho", "Apontamentos"),
    (r"Cart[ãa]o de Trabalho", "Apontamento"),
    (r"cart[õo]es de trabalho", "apontamentos"),
    (r"cart[ãa]o de trabalho", "apontamento"),
    (r"Posto de Trabalho", "Recurso"),
    (r"Ordens de Produção", "Ordens de Serviço"),
    (r"Ordem de Produção", "Ordem de Serviço"),
    (r"ordens de produção", "ordens de serviço"),
    (r"ordem de produção", "ordem de serviço"),
    # variantes com "trabalho" em minuscula (ex.: "Cartões de trabalho")
    (r"Cart[õo]es de trabalho", "Apontamentos"),
    (r"Cart[ãa]o de trabalho", "Apontamento"),
    (r"Ordens de trabalho", "Ordens de serviço"),
    (r"Ordem de trabalho", "Ordem de serviço"),
    (r"Esta[çc][õo]es de trabalho", "Recursos"),
    (r"Esta[çc][ãa]o de trabalho", "Recurso"),
]

# Routing (roteiro de producao): so troca nas frases cujo original em ingles fala de Routing
ROTEIRO = [(r"Encaminhamentos", "Roteiros"), (r"Encaminhamento", "Roteiro"), (r"encaminhamentos", "roteiros"), (r"encaminhamento", "roteiro")]


def converter(texto, msgid=""):
    if not texto:
        return texto
    novo = ART_RE.sub(art_masc, texto)
    if "Routing" in msgid:
        for padrao, subst in ROTEIRO:
            novo = re.sub(padrao, subst, novo)  # primeiro o artigo, enquanto ainda ha "Estacao" ao lado
    for padrao, subst in TROCAS:
        novo = re.sub(padrao, subst, novo)
    return novo


total = 0
for f in glob.glob(os.path.join(apps_dir, "*", "*", "locale", "pt_BR.po")):
    po = polib.pofile(f)
    n = 0
    for e in po:
        if e.msgstr:
            nv = converter(e.msgstr, e.msgid)
            if nv != e.msgstr:
                if DRY and len(amostras) < 40:
                    amostras.append((e.msgstr, nv))
                e.msgstr = nv
                n += 1
        if e.msgstr_plural:
            for k, v in list(e.msgstr_plural.items()):
                nv = converter(v, e.msgid)
                if nv != v:
                    e.msgstr_plural[k] = nv
                    n += 1
    if n and not DRY:
        po.save(f)
    print(f"{f}: {n} traducoes ajustadas")
    total += n
print("total", total)
if DRY:
    for a, b in amostras:
        print("ANTES :", a[:150])
        print("DEPOIS:", b[:150])
        print()
