import os

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from psycopg import sql

from config.db.credentials import read_database_credentials


class Command(BaseCommand):
    help = "Create/update the restricted PostgreSQL runtime role after migrations."

    def handle(self, *args, **options):
        secret_arn = os.getenv("RUNTIME_DB_SECRET_ARN", "")
        if not secret_arn or connection.vendor != "postgresql":
            raise CommandError("PostgreSQL and RUNTIME_DB_SECRET_ARN are required.")
        credentials = read_database_credentials(secret_arn)
        username = credentials["username"]
        if username != "uvpro_app":
            raise CommandError("The runtime secret username must be uvpro_app.")
        role = sql.Identifier(username)
        # Password literals are escaped by psycopg, and never printed.
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("SELECT current_user")
            owner = cursor.fetchone()[0]
            if owner == username:
                raise CommandError("Run this command with the migration database identity.")
            cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", [username])
            if not cursor.fetchone():
                cursor.execute(sql.SQL("CREATE ROLE {} LOGIN").format(role))
            cursor.execute(sql.SQL("ALTER ROLE {} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}").format(role, sql.Literal(credentials["password"])))
            cursor.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(connection.settings_dict["NAME"]), role))
            cursor.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
            cursor.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(role))
            cursor.execute(sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(role))
            cursor.execute(sql.SQL("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO {}").format(role))
            cursor.execute(sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}").format(sql.Identifier(owner), role))
            cursor.execute(sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {}").format(sql.Identifier(owner), role))
        self.stdout.write(self.style.SUCCESS("Restricted runtime database role is ready."))
