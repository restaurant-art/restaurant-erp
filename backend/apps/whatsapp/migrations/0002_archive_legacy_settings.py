from django.db import migrations


def archive_and_prepare(apps, schema_editor):
    State = apps.get_model("core", "SharedAppState")
    Connection = apps.get_model("whatsapp", "StoreConnection")
    database = schema_editor.connection.alias
    states = State.objects.using(database)
    directory = states.filter(pk="vestora-stores").values_list("state_value", flat=True).first()
    if isinstance(directory, list):
        parents = {}
        for row in directory:
            if not isinstance(row, dict):
                continue
            store_id = row.get("id")
            if isinstance(store_id, str) and store_id and store_id != "GLOBAL" and len(store_id) <= 128:
                parents[store_id] = None if store_id in parents else row.get("parentStoreId") or ""
        for store_id in parents:
            seen = set()
            current = store_id
            while isinstance(current, str) and current in parents and current not in seen:
                parent = parents[current]
                if parent == "":
                    Connection.objects.using(database).get_or_create(store_id=store_id, defaults={"tenant_id": current})
                    break
                seen.add(current)
                current = parent

    archive = {}
    for row in states.filter(state_key__startswith="vestora-whatsapp-receipts-").iterator():
        if isinstance(row.state_value, dict):
            archive[row.pk] = {field: row.state_value[field] for field in ("enabled", "sendWhen")
                               if field in row.state_value and isinstance(row.state_value[field], (str, bool))}
    for row in states.filter(state_key__startswith="vestora-active-settings-").iterator():
        section = row.state_value.get("WhatsApp templates") if isinstance(row.state_value, dict) else None
        if isinstance(section, dict):
            archive[row.pk] = {field: section[field] for field in ("billTemplate", "orderTemplate", "sender", "language")
                               if field in section and isinstance(section[field], str)}
    if archive:
        states.get_or_create(state_key="uvpro-archive-whatsapp-settings-v1", defaults={"state_value": archive})


class Migration(migrations.Migration):
    dependencies = [("core", "0002_aws_cloud_compat"), ("whatsapp", "0001_initial")]
    operations = [migrations.RunPython(archive_and_prepare, migrations.RunPython.noop)]
