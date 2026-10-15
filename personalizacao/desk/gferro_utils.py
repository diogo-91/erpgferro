"""Funcoes de apoio para os modelos de impressao Gferro (registradas como metodos Jinja)."""
import base64
import io
import re
from urllib.parse import quote


def gf_qr(texto, escala=4):
    """QR code em PNG (data URI) para colocar direto em <img src=...>."""
    import pyqrcode

    buf = io.BytesIO()
    pyqrcode.create(str(texto), error="M").png(buf, scale=escala, quiet_zone=1)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def gf_whatsapp(telefone, mensagem=""):
    """Link wa.me a partir de um telefone brasileiro, ex.: (15) 99850-7812."""
    digitos = re.sub(r"\D", "", telefone or "")
    if digitos and not digitos.startswith("55"):
        digitos = "55" + digitos
    url = "https://wa.me/" + digitos
    return url + ("?text=" + quote(mensagem) if mensagem else "")
