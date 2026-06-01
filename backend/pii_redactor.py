import re
from typing import Optional

# Quick compilation of typical PII patterns
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_PATTERN = re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{3}[-.\s]?\d{4}\b')
SSN_PATTERN = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
API_KEY_PATTERN = re.compile(r'\b(?:sk|sk-proj|key|api|token|secret)[-_a-zA-Z0-9]{20,80}\b', re.IGNORECASE)

class PIIRedactor:
    @staticmethod
    def redact(text: Optional[str]) -> Optional[str]:
        if not text:
            return text
        
        redacted = text
        # Redact emails
        redacted = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", redacted)
        # Redact phones
        redacted = PHONE_PATTERN.sub("[REDACTED_PHONE]", redacted)
        # Redact SSNs
        redacted = SSN_PATTERN.sub("[REDACTED_SSN]", redacted)
        # Redact API Keys / secrets
        redacted = API_KEY_PATTERN.sub("[REDACTED_SECRET]", redacted)
        
        return redacted
