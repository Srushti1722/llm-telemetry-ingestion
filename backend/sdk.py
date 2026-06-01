import time
import httpx
import json
import logging
import asyncio
from typing import Generator, AsyncGenerator, Dict, Any, Optional
from uuid import UUID
from pii_redactor import PIIRedactor


logger = logging.getLogger("sdk_client")

class LLMSDK:
    """
    Lightweight SDK / Wrapper around LLM calls to capture latency, tokens, providers,
    redact PII in previews, and send them to the Ingestion pipeline in near real-time.
    """
    def __init__(self, ingestion_url: str = "http://localhost:8000/ingest/log"):
        self.ingestion_url = ingestion_url
        self.client = httpx.AsyncClient()

    async def emit_log(self, payload: Dict[str, Any]):
        """
        Non-blocking/best-effort direct ingestion call.
        If using event-based Redis, the backend itself can also publish directly to Redis.
        """
        try:
            # We perform an async post to the ingestion service
            await self.client.post(self.ingestion_url, json=payload, timeout=2.0)
        except Exception as e:
            logger.error(f"Failed to emit log to ingestion endpoint: {e}")

    @staticmethod
    def estimate_tokens(text: str) -> int:
        # Quick fallback token estimation (approx 4 chars per token)
        if not text:
            return 0
        return max(1, len(text) // 4)

    @staticmethod
    def _generate_interactive_mock_response(prompt: str, provider: str, model: str) -> str:
        prompt_lower = prompt.lower().strip()
        
        # 1. Check for PII or Security Keywords first (highest priority)
        has_email = "@" in prompt_lower and "." in prompt_lower
        has_phone = any(c.isdigit() for c in prompt_lower) and len([c for c in prompt_lower if c.isdigit()]) >= 7
        if has_email or has_phone or any(k in prompt_lower for k in ["pii", "redact", "email", "phone", "ssn", "privacy", "security"]):
            return (
                f"**PII Security & Redaction System**\n\n"
                f"I have captured this telemetry event and redacted it. Go check the **Database Telemetry Logs** tab in the sidebar right now to see the exact redacted entry saved in the database!\n\n"
                f"**What it is & What it does:**\n"
                f"- **PII Protection:** Our SDK intercepts sensitive data like email addresses and phone numbers automatically.\n"
                f"- **Natural Conversations:** You see the raw text in the chat playground so your conversation flows seamlessly, but the SDK masks them before writing to the database.\n"
                f"- **Scrubbed Database Logging:** The backend worker saves only `[REDACTED_EMAIL]` and `[REDACTED_PHONE]` in the persistent log store to ensure developer logs remain completely safe and secure!"
            )
            
        # 2. Check for telemetry keywords
        elif any(k in prompt_lower for k in ["telemetry", "metrics", "dashboard", "logs", "ingest"]):
            return (
                f"**LLM Telemetry**!\n\n"
                f"Every single time you send me a message, our lightweight SDK wrapper captures crucial metrics:\n\n"
                f"- **Latency:** The round-trip generation speed in milliseconds.\n"
                f"- **Token Count:** Prompt and completion lengths (estimated instantly via char count ratios).\n"
                f"- **Session ID:** Tracking multi-turn conversations.\n\n"
                f"These metrics are published asynchronously to a **Redis Event Bus**, which handles the load seamlessly. "
                f"If you click the **'Observability Metrics'** tab in the sidebar, you'll see these values updated live!"
            )
            
        # 3. Check for specific greetings (strict word matching to avoid matching 'hi' inside 'srushtidt03')
        else:
            words = set(prompt_lower.translate(str.maketrans("", "", "?.,!:;()\"'-")).split())
            if any(w in words for w in ["hello", "hi", "hey", "greetings"]):
                return (
                    f"Hello there! Welcome to the premium AI Playground running on our telemetry platform ({model}).\n\n"
                    f"I can act as a fully interactive assistant. Go ahead and test my capabilities:\n\n"
                    f"1. Ask me to **'write python code'** to check how code blocks render.\n"
                    f"2. Ask me about **'pii redactor'** or type an email/phone number to see security in action.\n"
                    f"3. Ask for a **'joke'** to keep things fun.\n\n"
                    f"What would you like to build or explore today?"
                )
                
            elif any(k in prompt_lower for k in ["code", "python", "javascript", "program"]):
                return (
                    f"Here is a snippet of python code implementing our PII redaction layer:\n\n"
                    f"```python\n"
                    f"import re\n\n"
                    f"class PIIRedactor:\n"
                    f"    EMAIL_REGEX = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+'\n"
                    f"    PHONE_REGEX = r'\\b\\d{{3}}[-.]?\\d{{3}}[-.]?\\d{{4}}\\b'\n\n"
                    f"    @classmethod\n"
                    f"    def redact(cls, text: str) -> str:\n"
                    f"        text = re.sub(cls.EMAIL_REGEX, \"[REDACTED_EMAIL]\", text)\n"
                    f"        text = re.sub(cls.PHONE_REGEX, \"[REDACTED_PHONE]\", text)\n"
                    f"        return text\n"
                    f"```\n\n"
                    f"This regex compiles instantly and handles heavy text processing safely before metrics get stored."
                )
                
            elif any(k in prompt_lower for k in ["joke", "humor", "laugh"]):
                return (
                    f"Here is a developer joke for you:\n\n"
                    f"**Why do programmers wear glasses?**\n"
                    f"*Because they can't C#!*\n\n"
                    f"Bad joke? Let's try another one:\n\n"
                    f"**There are 10 types of people in the world:** those who understand binary, and those who don't!"
                )
                
            elif any(k in prompt_lower for k in ["cancel", "abort", "stop"]):
                return (
                    f"Real-Time Generation Cancellation\n\n"
                    f"If you send a very long request and realize you need to stop it, you can click the red **'Cancel'** button.\n"
                    f"This immediately terminates the Server-Sent Events (SSE) generator stream. The log status is then updated to "
                    f"`cancelled` on the dashboard, saving computational tokens and budget!"
                )
                
            else:
                # Generate a context-aware simulated answer
                prompt_clean = prompt.strip('?.!')
                if any(x in prompt_clean.lower() for x in ["coding concepts", "programming", "concepts"]):
                    return (
                        f"**Simulated LLM Conversation** ({model})\n\n"
                        f"I would love to discuss **coding concepts** with you! Programming paradigms generally fall into a few core categories:\n\n"
                        f"1. **Object-Oriented Programming (OOP):** Organized around objects and data rather than actions and logic. Core pillars include Inheritance, Encapsulation, Polymorphism, and Abstraction.\n"
                        f"2. **Functional Programming (FP):** Treats computation as the evaluation of mathematical functions, avoiding state changes and mutable data. Core pillars include Pure Functions, Immutability, and First-Class Functions.\n"
                        f"3. **Asynchronous Programming:** Extremely relevant for this telemetry project! Allows running operations in the background so the main application stays responsive.\n\n"
                        f"Which of these concepts would you like to explore deeper? We could write some code examples together!"
                    )
                elif any(x in prompt_clean.lower() for x in ["how are you", "who are you", "who is this", "what is this"]):
                    return (
                        f"Hello! I am a simulated AI assistant powered by our telemetry platform ({model}).\n\n"
                        f"I am feeling incredibly performant today! My system latency is running at sub-millisecond rates, "
                        f"my PII redaction layer is fully compiled, and I am ready to process logs.\n\n"
                        f"How are you doing? Let's keep exploring!"
                    )
                else:
                    return (
                        f"**Simulated LLM Response** ({model})\n\n"
                        f"Regarding *\"{prompt}\"*:\n\n"
                        f"That is an interesting topic! In a real deployment, I would query our foundational LLM providers "
                        f"(like OpenAI or Gemini) to generate a fully customized response based on their trillions of parameters.\n\n"
                        f"In this **Interactive Simulated Sandbox**, I am generated by our mock engine to verify the pipeline's end-to-end telemetry. "
                        f"Every character I output generates telemetry events that verify our Redis pub/sub queue and PII filters. "
                        f"Feel free to keep chatting, ask me to **'write python code'**, or check out the **'Observability Metrics'** dashboard!"
                    )

    async def generate_response(
        self,
        provider: str,
        model: str,
        prompt: str,
        conversation_id: UUID,
        message_id: UUID,
        api_keys: Dict[str, str],
        history: Optional[list] = None
    ) -> AsyncGenerator[str, None]:
        """
        Call LLM client in a streaming fashion, capture latency, token usage,
        redact inputs & outputs, and emit logs to ingestion pipeline.
        """
        start_time = time.time()
        full_response_text = ""
        status = "success"
        error_msg = None
        
        # Format conversation context
        # In a real environment, we'd invoke the official provider SDKs (openai, google-genai, etc.)
        # To make it zero-dependency on external keys if not provided, we fall back to a rich Mock Provider.
        api_key = api_keys.get(f"{provider.upper()}_API_KEY")
        
        try:
            if provider == "mock" or not api_key:
                # Provide an interactive premium simulated LLM streaming response
                simulated_text = self._generate_interactive_mock_response(prompt, provider, model)
                for char in simulated_text:
                    await asyncio.sleep(0.015) # Smooth streaming flow
                    full_response_text += char
                    yield char
            elif provider == "openai":
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": True
                }
                async with self.client.stream("POST", "https://api.openai.com/v1/chat/completions", headers=headers, json=data) as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: "):
                            line_content = line[6:].strip()
                            if line_content == "[DONE]":
                                break
                            try:
                                chunk = json.loads(line_content)
                                delta = chunk["choices"][0]["delta"].get("content", "")
                                full_response_text += delta
                                yield delta
                            except Exception:
                                pass
            elif provider == "gemini":
                # Google Gemini API REST Streaming Endpoint
                headers = {"Content-Type": "application/json"}
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}"
                data = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                async with self.client.stream("POST", url, headers=headers, json=data) as r:
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        try:
                            # Gemini sends JSON arrays or SSE chunks
                            chunk = json.loads(line.strip("[], \n"))
                            delta = chunk["candidates"][0]["content"]["parts"][0]["text"]
                            full_response_text += delta
                            yield delta
                        except Exception:
                            pass
            else:
                yield f"Error: Provider '{provider}' setup is not completed or missing API key."
                status = "error"
                error_msg = f"Provider {provider} not supported or key missing."
                
        except Exception as e:
            status = "error"
            error_msg = str(e)
            yield f"\n[Inference Error: {error_msg}]"
        
        # Calculate log metadata
        latency_ms = (time.time() - start_time) * 1000
        prompt_tokens = self.estimate_tokens(prompt)
        completion_tokens = self.estimate_tokens(full_response_text)
        total_tokens = prompt_tokens + completion_tokens
        
        # Redact PII in previews
        redacted_input = PIIRedactor.redact(prompt[:500])
        redacted_output = PIIRedactor.redact(full_response_text[:500])
        
        # Build payload
        log_payload = {
            "conversation_id": str(conversation_id),
            "message_id": str(message_id),
            "provider": provider,
            "model": model,
            "latency_ms": latency_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "status": status,
            "error_message": error_msg,
            "input_preview": redacted_input,
            "output_preview": redacted_output,
            "streaming": True
        }
        
        # Emit to ingestion pipeline in background
        await self.emit_log(log_payload)

