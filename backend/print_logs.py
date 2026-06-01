import asyncio
import sys
import io
# Force UTF-8 output encoding for Windows consoles to support emojis
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from database import AsyncSessionLocal, InferenceLogDB
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        try:
            # Query the latest telemetry logs
            logs_q = await session.execute(select(InferenceLogDB).order_by(InferenceLogDB.timestamp.desc()))
            logs = logs_q.scalars().all()
            print(f"| Timestamp | Provider | Model | Latency | Status | Redacted Input Preview | Redacted Output Preview |")
            print(f"| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
            for log in logs[:5]:
                # Safe print that handles characters correctly
                input_prev = log.input_preview.replace('\n', ' ') if log.input_preview else ""
                output_prev = log.output_preview.replace('\n', ' ') if log.output_preview else ""
                print(f"| {log.timestamp.strftime('%H:%M:%S')} | {log.provider} | {log.model} | {log.latency_ms:.1f}ms | {log.status} | `{input_prev}` | `{output_prev}` |")
        except Exception as e:
            print("Error querying database:", e)

if __name__ == "__main__":
    asyncio.run(main())
