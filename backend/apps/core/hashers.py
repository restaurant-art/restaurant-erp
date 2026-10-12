import bcrypt

from django.contrib.auth.hashers import BasePasswordHasher, mask_hash


class LegacyBcryptPasswordHasher(BasePasswordHasher):
    """Verify imported legacy bcrypt hashes once, then upgrade to Django's default."""

    # Retain this stored-hash marker so existing AWS accounts keep working.
    algorithm = "supabase_bcrypt"

    def encode(self, password, salt=None):
        digest = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        return f"{self.algorithm}${digest}"

    def verify(self, password, encoded):
        try:
            algorithm, digest = encoded.split("$", 1)
            return algorithm == self.algorithm and bcrypt.checkpw(password.encode(), digest.encode())
        except (TypeError, ValueError):
            return False

    def safe_summary(self, encoded):
        algorithm, digest = encoded.split("$", 1)
        return {"algorithm": algorithm, "hash": mask_hash(digest)}

    def must_update(self, encoded):
        return True

    def harden_runtime(self, password, encoded):
        return None
