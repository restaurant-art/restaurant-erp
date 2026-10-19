from django.core.exceptions import ImproperlyConfigured
from storages.backends.s3 import S3Storage


class PrivateS3MediaStorage(S3Storage):
    file_overwrite = False
    default_acl = None
    querystring_auth = True

    def __init__(self, **settings):
        super().__init__(**settings)

        if not self.bucket_name:
            raise ImproperlyConfigured("Private S3 media storage requires a bucket name.")
        if not self.region_name:
            raise ImproperlyConfigured("Private S3 media storage requires an AWS region.")
        if self.endpoint_url:
            raise ImproperlyConfigured(
                "Private S3 media storage does not support custom endpoints."
            )
        if not self.querystring_auth:
            raise ImproperlyConfigured(
                "Private S3 media storage requires signed URLs."
            )
        if self.custom_domain and self.cloudfront_signer is None:
            raise ImproperlyConfigured(
                "A custom media domain requires a CloudFront signer so private URLs "
                "are never emitted unsigned."
            )
