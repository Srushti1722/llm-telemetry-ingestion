import os
import redis.asyncio as aioredis
import json
import logging
from typing import Optional
import datetime

logger = logging.getLogger("redis_broker")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

class RedisEventBroker:
    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.is_connected = False

    async def connect(self):
        try:
            self.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
            # Active ping to verify actual connection availability
            await self.redis.ping()
            self.is_connected = True
            logger.info("Connected to Redis Event Broker successfully.")
        except Exception as e:
            self.is_connected = False
            logger.error(f"Redis Broker connection failed: {e}")

    @staticmethod
    def json_converter(o):
        if isinstance(o, (datetime.date, datetime.datetime)):
            return o.isoformat()
        raise TypeError("Type not serializable")

    async def publish_log(self, channel: str, log_data: dict):
        if not self.redis:
            await self.connect()
        if self.redis:
            try:
                serialized = json.dumps(log_data, default=self.json_converter)
                await self.redis.publish(channel, serialized)
            except Exception as e:
                logger.error(f"Failed to publish to channel {channel}: {e}")


    async def get_subscriber(self, channel: str):
        if not self.redis:
            await self.connect()
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(channel)
        return pubsub
