import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured


TRUE_VALUES = {"1", "true", "yes", "on"}
FALSE_VALUES = {"0", "false", "no", "off"}


def env_bool(name, default=False):
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return default

    value = raw_value.strip().lower()
    if value in TRUE_VALUES:
        return True
    if value in FALSE_VALUES:
        return False
    raise ImproperlyConfigured(
        f"{name} must be one of: {', '.join(sorted(TRUE_VALUES | FALSE_VALUES))}."
    )


def env_int(name, default, *, minimum=None, maximum=None):
    raw_value = os.getenv(name)
    try:
        value = default if raw_value is None or not raw_value.strip() else int(raw_value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be an integer.") from exc

    if minimum is not None and value < minimum:
        raise ImproperlyConfigured(f"{name} must be at least {minimum}.")
    if maximum is not None and value > maximum:
        raise ImproperlyConfigured(f"{name} must be at most {maximum}.")
    return value

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "django_filters",
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "channels",
    "storages",
    "apps.core",
]

MIDDLEWARE = [
    "apps.core.middleware.HealthCheckHostMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.core.middleware.TenantContextMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "core.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "apps.core.hashers.LegacyBcryptPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASE_SSL_REQUIRE = env_bool("DATABASE_SSL_REQUIRE", False)
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_SECRET_ARN = os.getenv("DB_SECRET_ARN", "").strip()
SPLIT_DATABASE_ENV = {
    "NAME": os.getenv("DB_NAME", "").strip(),
    "USER": os.getenv("DB_USER", "").strip(),
    "PASSWORD": os.getenv("DB_PASSWORD", ""),
    "HOST": os.getenv("DB_HOST", "").strip(),
    "PORT": os.getenv("DB_PORT", "").strip(),
}

if DB_SECRET_ARN:
    if DATABASE_URL:
        raise ImproperlyConfigured("Set DB_SECRET_ARN or DATABASE_URL, not both.")
    if len(DB_SECRET_ARN.split(":")) < 7 or ":secretsmanager:" not in DB_SECRET_ARN:
        raise ImproperlyConfigured("DB_SECRET_ARN must be a Secrets Manager ARN.")
    if not all(SPLIT_DATABASE_ENV[key] for key in ("HOST", "PORT", "NAME")):
        raise ImproperlyConfigured("DB_HOST, DB_PORT and DB_NAME are required with DB_SECRET_ARN.")
    DATABASES = {"default": {
        "ENGINE": "config.db.secrets_postgresql",
        **SPLIT_DATABASE_ENV,
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {"sslmode": "require"} if DATABASE_SSL_REQUIRE else {},
    }}
elif DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=600,
            ssl_require=DATABASE_SSL_REQUIRE,
        )
    }
elif any(
    value for key, value in SPLIT_DATABASE_ENV.items() if key != "PORT"
):
    missing_database_settings = [
        f"DB_{key}" for key, value in SPLIT_DATABASE_ENV.items() if not value
    ]
    if missing_database_settings:
        raise ImproperlyConfigured(
            "Incomplete split database configuration; missing "
            + ", ".join(missing_database_settings)
            + "."
        )

    database_options = {"sslmode": "require"} if DATABASE_SSL_REQUIRE else {}
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            **SPLIT_DATABASE_ENV,
            "CONN_MAX_AGE": 600,
            "OPTIONS": database_options,
        }
    }
else:
    DATABASES = {
        "default": dj_database_url.parse(
            f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
            conn_max_age=600,
        )
    }

DATABASE_SSL_ROOT_CERT = os.getenv("DATABASE_SSL_ROOT_CERT", "").strip()
if DATABASE_SSL_ROOT_CERT and DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
    DATABASES["default"].setdefault("OPTIONS", {}).update({
        "sslmode": "verify-full", "sslrootcert": DATABASE_SSL_ROOT_CERT,
    })

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "UVPRO API",
    "DESCRIPTION": "Multi-tenant restaurant ERP and POS API.",
    "VERSION": "1.0.0",
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "").strip()
AWS_S3_REGION_NAME = (
    os.getenv("AWS_S3_REGION_NAME", "").strip()
    or os.getenv("AWS_REGION", "").strip()
    or os.getenv("AWS_DEFAULT_REGION", "").strip()
)
USE_S3_STORAGE = env_bool("USE_S3_STORAGE", bool(AWS_STORAGE_BUCKET_NAME))
AWS_S3_CUSTOM_DOMAIN = os.getenv("AWS_S3_CUSTOM_DOMAIN", "").strip() or None
AWS_CLOUDFRONT_KEY_ID = os.getenv("AWS_CLOUDFRONT_KEY_ID", "").strip() or None
AWS_CLOUDFRONT_KEY = (
    os.getenv("AWS_CLOUDFRONT_KEY", "").replace("\\n", "\n").strip() or None
)
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = env_int(
    "AWS_QUERYSTRING_EXPIRE",
    3600,
    minimum=1,
    maximum=604800,
)
AWS_S3_FILE_OVERWRITE = False

if USE_S3_STORAGE:
    if not AWS_STORAGE_BUCKET_NAME:
        raise ImproperlyConfigured(
            "AWS_STORAGE_BUCKET_NAME is required when USE_S3_STORAGE is enabled."
        )
    if not AWS_S3_REGION_NAME:
        raise ImproperlyConfigured(
            "AWS_S3_REGION_NAME is required when USE_S3_STORAGE is enabled."
        )
    if bool(AWS_CLOUDFRONT_KEY_ID) ^ bool(AWS_CLOUDFRONT_KEY):
        raise ImproperlyConfigured(
            "AWS_CLOUDFRONT_KEY_ID and AWS_CLOUDFRONT_KEY must be provided together."
        )
    if AWS_S3_CUSTOM_DOMAIN:
        if "://" in AWS_S3_CUSTOM_DOMAIN or "/" in AWS_S3_CUSTOM_DOMAIN:
            raise ImproperlyConfigured(
                "AWS_S3_CUSTOM_DOMAIN must be a hostname without a scheme or path."
            )
        if not AWS_CLOUDFRONT_KEY_ID or not AWS_CLOUDFRONT_KEY:
            raise ImproperlyConfigured(
                "A private CloudFront domain requires AWS_CLOUDFRONT_KEY_ID and "
                "AWS_CLOUDFRONT_KEY so media URLs remain signed."
            )

    s3_options = {
        "bucket_name": AWS_STORAGE_BUCKET_NAME,
        "region_name": AWS_S3_REGION_NAME,
        "default_acl": None,
        "file_overwrite": False,
        "querystring_auth": True,
        "querystring_expire": AWS_QUERYSTRING_EXPIRE,
        "signature_version": "s3v4",
        "endpoint_url": None,
    }
    if AWS_S3_CUSTOM_DOMAIN:
        s3_options.update(
            {
                "custom_domain": AWS_S3_CUSTOM_DOMAIN,
                "cloudfront_key_id": AWS_CLOUDFRONT_KEY_ID,
                "cloudfront_key": AWS_CLOUDFRONT_KEY,
            }
        )

    STORAGES["default"] = {
        "BACKEND": "apps.core.storage.PrivateS3MediaStorage",
        "OPTIONS": s3_options,
    }

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", False)
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 0, minimum=0, maximum=63072000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
