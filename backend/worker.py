import asyncio
import json
import logging
import sys
from database import AsyncSessionLocal, InferenceLogDB
from redis_broker import RedisEventBroker
from models import InferenceLogPayload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingestion_worker")

async def start_worker():
    logger.info("Initializing Ingestion Worker...")
    broker = RedisEventBroker()
    await broker.connect()
    
    pubsub = await broker.get_subscriber("inference_logs")
    logger.info("Subscribed to channel 'inference_logs'. Waiting for events...")
    
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                try:
                    data = json.loads(message["data"])
                    logger.info(f"Received log event for conversation: {data.get('conversation_id')}")
                    
                    # Validate payload using Pydantic
                    payload = InferenceLogPayload(**data)
                    
                    # Persist in DB
                    async with AsyncSessionLocal() as session:
                        db_log = InferenceLogDB(
                            conversation_id=payload.conversation_id,
                            message_id=payload.message_id,
                            provider=payload.provider,
                            model=payload.model,
                            latency_ms=payload.latency_ms,
                            prompt_tokens=payload.prompt_tokens,
                            completion_tokens=payload.completion_tokens,
                            total_tokens=payload.total_tokens,
                            status=payload.status,
                            error_message=payload.error_message,
                            input_preview=payload.input_preview,
                            output_preview=payload.output_preview,
                            timestamp=payload.timestamp,
                            request_id=payload.request_id,
                            streaming=payload.streaming
                        )
                        session.add(db_log)
                        await session.commit()
                        logger.info(f"Successfully stored log {db_log.id} in DB.")
                except Exception as ex:
                    logger.error(f"Error parsing/saving log to DB: {ex}")
            await asyncio.sleep(0.01)
    except KeyboardInterrupt:
        logger.info("Stopping Ingestion Worker gracefully...")
    except Exception as e:
        logger.critical(f"Worker crashed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(start_worker())
