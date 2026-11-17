import re

from django.conf import settings
from django.urls import reverse

from .meta import MetaError, graph_list


LINK_PARAMETERS = ["store_name", "invoice_number", "total", "receipt_url"]


def invoice_templates(connection, token):
    templates = []
    for item in graph_list(
        f"{connection.waba_id}/message_templates", token,
        fields="name,language,status,category,parameter_format,components",
        params={"status": "APPROVED", "category": "UTILITY"},
    ):
        if item.get("status") != "APPROVED" or item.get("category") != "UTILITY":
            continue
        name, language = item.get("name", ""), item.get("language", "")
        if not re.fullmatch(r"[a-z0-9_]{1,512}", name) or not re.fullmatch(r"[A-Za-z_]{2,12}", language):
            continue
        components = item.get("components") or []
        bodies = [component for component in components if component.get("type") == "BODY"]
        if len(bodies) != 1 or any(
            component.get("type") not in {"HEADER", "BODY", "FOOTER"}
            or (component.get("type") == "HEADER" and component.get("format") != "TEXT")
            or (component.get("type") != "BODY" and "{{" in str(component.get("text") or ""))
            for component in components
        ):
            continue
        body = str(bodies[0].get("text") or "")
        parameters = re.findall(r"\{\{\s*([a-z0-9_]+)\s*\}\}", body)
        if item.get("parameter_format") == "NAMED" and set(parameters) == set(LINK_PARAMETERS):
            layout = "named_link"
        elif item.get("parameter_format") in ("POSITIONAL", None) and parameters == ["1", "2", "3", "4"]:
            layout = "link"
        elif (name == "uvpro_invoice_confirmation" and item.get("parameter_format") in ("POSITIONAL", None)
              and parameters == [str(index) for index in range(1, 9)]):
            layout = "existing_receipt"
        else:
            continue
        templates.append({"name": name, "language": language, "layout": layout, "body": body[:1024]})
    return sorted(templates, key=lambda template: (template["name"], template["language"]))


def message_payload(receipt, attempt_id):
    if not settings.META_WHATSAPP_RECEIPT_ORIGIN.startswith("https://"):
        raise MetaError("Set the HTTPS digital receipt origin.", code="configuration")
    invoice = receipt.invoice
    template = receipt.template
    url = settings.META_WHATSAPP_RECEIPT_ORIGIN + reverse("whatsapp-digital-receipt") + f"?key={receipt.public_token}"
    store = re.sub(r"\s+", " ", invoice["store"]).strip()[:160] or "Store"
    number = re.sub(r"\s+", " ", invoice["invoice_number"]).strip()[:128] or "Invoice"
    total = "₹" + invoice["total"]
    names = None
    if template["layout"] == "existing_receipt":
        # Keep the approved eight-parameter order. Long lists are available on
        # the digital bill in full, including when they exceed Meta's text limit.
        items = "; ".join(f"{item['quantity']} x {item['name']}" for item in invoice["items"])
        items = re.sub(r"\s+", " ", items).strip()
        if not items or len(items) > 480:
            items = f"View full bill {url}"
        values = [store, number, items, "₹" + (invoice.get("subtotal") or invoice["total"]),
                  "₹" + (invoice.get("discount") or "0.00"), "₹" + (invoice.get("tax") or "0.00"),
                  total, re.sub(r"\s+", " ", invoice.get("payment") or "Recorded")]
    else:
        values = [store, number, total, url]
        if template["layout"] == "named_link":
            names = LINK_PARAMETERS
        elif template["layout"] != "link":
            raise MetaError("Choose a supported approved invoice template.", code="template")
    params = [{"type": "text", "text": value} for value in values]
    if names:
        for parameter, name in zip(params, names):
            parameter["parameter_name"] = name
    return {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": receipt.recipient[1:],
        "type": "template", "biz_opaque_callback_data": str(attempt_id),
        "template": {
            "name": template["name"], "language": {"code": template["language"]},
            "components": [{"type": "body", "parameters": params}],
        },
    }
