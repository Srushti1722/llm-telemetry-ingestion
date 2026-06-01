import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class MessageRole:
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class ConversationStatus:
    ACTIVE = "active"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

class InferenceLogPayload(BaseModel):
    conversation_id: str
    message_id: Optional[str] = None
    provider: str
    model: str
    latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    status: str  # "success" or "error" or "cancelled"
    error_message: Optional[str] = None
    input_preview: Optional[str] = None
    output_preview: Optional[str] = None
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    request_id: Optional[str] = None
    streaming: bool = False

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    message: str
    provider: Optional[str] = None # "gemini", "openai", "anthropic", "mock"
    model: Optional[str] = None
    conversation_id: Optional[str] = None

class ConversationResponse(BaseModel):
    id: str
    session_id: str
    title: Optional[str]
    provider: str
    model: str
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    content_preview: Optional[str]
    token_count: Optional[int]
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class ConversationDetailResponse(BaseModel):
    conversation: ConversationResponse
    messages: List[MessageResponse]
    inference_logs: List[InferenceLogPayload] = []

    class Config:
        from_attributes = True


