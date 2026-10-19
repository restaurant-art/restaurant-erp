import json

import boto3
from botocore.config import Config
from django.core.exceptions import ImproperlyConfigured


def read_database_credentials(secret_arn):
    """Read AWSCURRENT without caching passwords across connections."""
    region = secret_arn.split(":")[3]
    client = boto3.client(
        "secretsmanager", region_name=region,
        config=Config(connect_timeout=5, read_timeout=5, retries={"max_attempts": 2}),
    )
    payload = client.get_secret_value(SecretId=secret_arn, VersionStage="AWSCURRENT")
    try:
        credentials = json.loads(payload["SecretString"])
        if not all(isinstance(credentials.get(key), str) and credentials[key]
                   for key in ("username", "password")):
            raise ValueError
    except (KeyError, ValueError, TypeError) as error:
        raise ImproperlyConfigured("Database secret must contain username and password.") from error
    return credentials
