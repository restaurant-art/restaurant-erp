from django.conf import settings
from django.db.backends.postgresql.base import DatabaseWrapper as PostgreSQLWrapper
from config.db.credentials import read_database_credentials


class DatabaseWrapper(PostgreSQLWrapper):
    def get_new_connection(self, conn_params):
        # Fresh credentials are read for every connection, including connections
        # opened by Celery after an RDS password rotation.
        for attempt in range(2):
            credentials = read_database_credentials(settings.DB_SECRET_ARN)
            params = {**conn_params, "user": credentials["username"], "password": credentials["password"]}
            try:
                return super().get_new_connection(params)
            except self.Database.OperationalError as error:
                # Retry only an authentication failure during rotation. Network
                # failures and SQL errors must not be silently retried.
                if attempt or getattr(error, "sqlstate", None) != "28P01":
                    raise
