from storages.backends.s3boto3 import S3Boto3Storage


class CloudflareR2Storage(S3Boto3Storage):
    file_overwrite = False
    default_acl = "private"
    querystring_auth = True
