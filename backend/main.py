import os
import uuid
import datetime
import math
import json
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks

from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any



from database import engine, Base, get_db, AsyncSessionLocal, ConversationDB, MessageDB, InferenceLogDB

from models import ChatRequest, InferenceLogPayload, ConversationResponse, MessageResponse, ConversationDetailResponse
from sdk import LLMSDK
from redis_broker import RedisEventBroker

# Startup Table Initialization
async def init_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app = FastAPI(title="LLM Inference Logging & Ingestion System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sdk = LLMSDK(ingestion_url="http://localhost:8000/ingest/log")
broker = RedisEventBroker()

@app.on_event("startup")
async def startup_event():
    await init_tables()
    await broker.connect()

# Active streaming sessions cancellation tracker
ACTIVE_CANCELLATIONS = set()

# Direct database writer fallback for local runs without Redis
async def save_log_direct(payload_dict: dict):
    async with AsyncSessionLocal() as session:
        try:
            # Re-fetch log fields and write to DB
            db_log = InferenceLogDB(
                conversation_id=payload_dict.get("conversation_id"),
                message_id=payload_dict.get("message_id"),
                provider=payload_dict.get("provider"),
                model=payload_dict.get("model"),
                latency_ms=payload_dict.get("latency_ms"),
                prompt_tokens=payload_dict.get("prompt_tokens"),
                completion_tokens=payload_dict.get("completion_tokens"),
                total_tokens=payload_dict.get("total_tokens"),
                status=payload_dict.get("status"),
                error_message=payload_dict.get("error_message"),
                input_preview=payload_dict.get("input_preview"),
                output_preview=payload_dict.get("output_preview"),
                timestamp=datetime.datetime.utcnow(),
                request_id=payload_dict.get("request_id"),
                streaming=payload_dict.get("streaming", False)
            )
            session.add(db_log)
            await session.commit()
        except Exception as e:
            print("Failed to save log directly:", e)

# --- Ingestion Pipeline Routes ---

@app.post("/ingest/log", status_code=202)
async def ingest_log(payload: InferenceLogPayload, background_tasks: BackgroundTasks):
    """
    Ingest system logs from LLMSDK.
    Fulfills Event-Based Architecture (Bonus) via Redis Pub/Sub.
    """
    # If redis broker is connected and active, use pub/sub
    if broker.redis and broker.is_connected:
        background_tasks.add_task(
            broker.publish_log, "inference_logs", payload.dict()
        )
    else:
        # Fallback to direct DB write for local run without Redis
        background_tasks.add_task(
            save_log_direct, payload.dict()
        )
    return {"status": "accepted", "message": "Log sent to ingestion queue"}

@app.get("/ingest/metrics")
async def get_metrics(db: AsyncSession = Depends(get_db)):
    """
    Calculates aggregated metrics: Latency p50/p95/p99, error rate, throughput.
    """
    total_q = await db.execute(select(func.count(InferenceLogDB.id)))
    total_count = total_q.scalar() or 0
    
    error_q = await db.execute(select(func.count(InferenceLogDB.id)).where(InferenceLogDB.status == "error"))
    error_count = error_q.scalar() or 0
    
    error_rate = (error_count / total_count * 100) if total_count > 0 else 0.0
    
    # Latency percentiles
    latency_query = await db.execute(select(InferenceLogDB.latency_ms).order_by(InferenceLogDB.latency_ms))
    latencies = [r[0] for r in latency_query.all()]
    
    def get_percentile(lst, p):
        if not lst:
            return 0.0
        k = (len(lst) - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return lst[int(k)]
        return lst[f] * (c - k) + lst[c] * (k - f)

    p50 = get_percentile(latencies, 0.50)
    p95 = get_percentile(latencies, 0.95)
    p99 = get_percentile(latencies, 0.99)
    
    # Tokens
    tokens_query = await db.execute(select(func.sum(InferenceLogDB.total_tokens)))
    total_tokens = tokens_query.scalar() or 0
    
    return {
        "total_requests": total_count,
        "error_rate_percent": round(error_rate, 2),
        "latency_p50_ms": round(p50, 2),
        "latency_p95_ms": round(p95, 2),
        "latency_p99_ms": round(p99, 2),
        "total_tokens_consumed": total_tokens
    }

@app.get("/ingest/metrics/timeseries")
async def get_metrics_timeseries(db: AsyncSession = Depends(get_db)):
    """
    Timeseries data for Dashboard charting (latency, request count)
    """
    # Group by hourly interval (or minute interval for mock)
    # Using python-side formatting/grouping to remain SQL-dialect agnostic
    result = await db.execute(
        select(
            InferenceLogDB.timestamp,
            InferenceLogDB.latency_ms,
            InferenceLogDB.status
        ).order_by(InferenceLogDB.timestamp.asc())
    )
    rows = result.all()
    
    # Bucket in minutes
    buckets = {}
    for row in rows:
        ts = row[0]
        if not ts:
            continue
        minute_str = ts.strftime("%Y-%m-%d %H:%M")
        if minute_str not in buckets:
            buckets[minute_str] = {"latency": [], "requests": 0, "errors": 0}
        buckets[minute_str]["requests"] += 1
        buckets[minute_str]["latency"].append(row[1])
        if row[2] == "error":
            buckets[minute_str]["errors"] += 1
            
    chart_data = []
    for m, info in sorted(buckets.items()):
        avg_lat = sum(info["latency"]) / len(info["latency"]) if info["latency"] else 0.0
        chart_data.append({
            "time": m,
            "requests": info["requests"],
            "avg_latency_ms": round(avg_lat, 2),
            "errors": info["errors"]
        })
        
    return chart_data[-30:] # Return last 30 intervals

# --- Chat Application Router ---

@app.get("/api/conversations", response_model=List[ConversationResponse])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(ConversationDB).order_by(desc(ConversationDB.updated_at)))
    return q.scalars().all()

@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    conv = await db.get(ConversationDB, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    msg_q = await db.execute(
        select(MessageDB)
        .where(MessageDB.conversation_id == conversation_id)
        .order_by(MessageDB.created_at.asc())
    )
    messages = msg_q.scalars().all()
    
    # Fetch telemetry logs for this conversation
    log_q = await db.execute(
        select(InferenceLogDB)
        .where(InferenceLogDB.conversation_id == conversation_id)
        .order_by(InferenceLogDB.timestamp.asc())
    )
    logs = log_q.scalars().all()
    
    return {
        "conversation": conv,
        "messages": messages,
        "inference_logs": logs
    }

@app.post("/api/chat/cancel/{conversation_id}")
async def cancel_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    """
    Cancel conversation in real time (Bonus)
    """
    ACTIVE_CANCELLATIONS.add(str(conversation_id))
    conv = await db.get(ConversationDB, conversation_id)

    if conv:
        conv.status = "cancelled"
        await db.commit()
    return {"status": "cancelled", "conversation_id": conversation_id}

@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    provider = req.provider or "mock"
    model = req.model or "mock-model"
    
    # 1. Create or resume Conversation
    if req.conversation_id:
        conv = await db.get(ConversationDB, req.conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conv.status = "active"
        conv.updated_at = datetime.datetime.utcnow()
    else:
        conv = ConversationDB(
            session_id=str(uuid.uuid4()),
            title=req.message[:50],
            provider=provider,
            model=model,
            status="active"
        )
        db.add(conv)
        await db.flush()
        
    # 2. Store user message
    user_msg = MessageDB(
        conversation_id=conv.id,
        role="user",
        content=req.message,
        content_preview=req.message[:200]
    )
    db.add(user_msg)
    await db.flush()
    
    # 3. Create placeholder assistant message for SDK
    assistant_msg = MessageDB(
        conversation_id=conv.id,
        role="assistant",
        content="",
        content_preview=""
    )
    db.add(assistant_msg)
    await db.flush()
    
    await db.commit()
    
    # Read keys from env
    api_keys = {
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", ""),
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", "")
    }

    # Stream generator wrapper
    async def sse_generator():
        yield f"data: {json.dumps({'conversation_id': str(conv.id)})}\n\n"
        
        full_text = ""
        try:
            async for chunk in sdk.generate_response(
                provider=provider,
                model=model,
                prompt=req.message,
                conversation_id=conv.id,
                message_id=assistant_msg.id,
                api_keys=api_keys
            ):
                # Real-time cancellation check (Bonus)
                if str(conv.id) in ACTIVE_CANCELLATIONS:
                    ACTIVE_CANCELLATIONS.remove(str(conv.id))
                    yield f"data: [CANCELLED]\n\n"
                    break
                
                full_text += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        finally:
            # Sync final assistant message content
            async with AsyncSessionLocal() as final_session:
                msg = await final_session.get(MessageDB, assistant_msg.id)
                if msg:
                    msg.content = full_text
                    msg.content_preview = full_text[:200]
                    await final_session.commit()

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


