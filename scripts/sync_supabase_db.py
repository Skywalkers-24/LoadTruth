#!/usr/bin/env python3
"""Sync tables and data from source Supabase DB to target Supabase DB."""

import asyncio
import os
import sys
from typing import Any
import asyncpg
from dotenv import load_dotenv

# Load workspace .env
load_dotenv()

SRC_URL = os.environ.get("DATABASE_URL")
if not SRC_URL:
    print("Error: DATABASE_URL not set in environment or .env")
    sys.exit(1)

# Normalize asyncpg URL if needed
if SRC_URL.startswith("postgresql+asyncpg://"):
    SRC_CONN_URL = SRC_URL.replace("postgresql+asyncpg://", "postgresql://")
else:
    SRC_CONN_URL = SRC_URL

# Target DB parameters
TGT_USER = os.environ.get("TARGET_DB_USER", "postgres.xigtwyxkriyigurtajuz")
TGT_PASSWORD = os.environ.get("TARGET_DB_PASSWORD", "HarshBhavya240202")
TGT_HOST = os.environ.get("TARGET_DB_HOST", "aws-1-us-west-2.pooler.supabase.com")
TGT_PORT = int(os.environ.get("TARGET_DB_PORT", "5432"))
TGT_DATABASE = os.environ.get("TARGET_DB_NAME", "postgres")

# Tables to sync in public schema (in topological order)
TABLES = [
    "users",
    "trucks",
    "events",
    "sources",
    "demo_videos",
    "analysis_jobs",
    "pipeline_stages",
    "ai_stage_results",
    "anomalies",
    "tickets",
    "ticket_evidence",
    "benchmark_collections",
    "benchmark_items",
    "clips",
    "pipeline_runs",
    "tracks",
    "benchmarks",
    "reports",
    "audit_log",
]


async def sync_database():
    print(f"Connecting to Source DB...")
    src = await asyncpg.connect(SRC_CONN_URL, ssl="require")
    print("Connected to Source DB.")

    print(f"Connecting to Target DB ({TGT_HOST}:{TGT_PORT})...")
    tgt = await asyncpg.connect(
        user=TGT_USER,
        password=TGT_PASSWORD,
        host=TGT_HOST,
        port=TGT_PORT,
        database=TGT_DATABASE,
        ssl="require",
    )
    print("Connected to Target DB.")

    # Enable replica mode to bypass foreign key checks / triggers during bulk sync
    await tgt.execute("SET session_replication_role = 'replica';")

    sync_results = []

    try:
        for tbl in TABLES:
            # Check if source table exists
            exists = await src.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = $1
                )
            """,
                tbl,
            )
            if not exists:
                print(f"Skipping {tbl} (does not exist in source)")
                continue

            # Fetch rows from source
            src_rows = await src.fetch(f'SELECT * FROM public."{tbl}"')
            src_count = len(src_rows)

            if src_count == 0:
                tgt_count = await tgt.fetchval(f'SELECT count(*) FROM public."{tbl}"')
                print(f"Table {tbl:25}: 0 rows in source (target has {tgt_count} rows)")
                sync_results.append((tbl, src_count, tgt_count, "OK"))
                continue

            # Truncate target table to ensure clean state
            await tgt.execute(f'TRUNCATE TABLE public."{tbl}" CASCADE;')

            # Prepare insert statement
            cols = list(src_rows[0].keys())
            col_names = ", ".join([f'"{c}"' for c in cols])
            placeholders = ", ".join([f"${i+1}" for i in range(len(cols))])
            insert_query = f'INSERT INTO public."{tbl}" ({col_names}) VALUES ({placeholders})'

            # Batch insert rows
            records = [[row[c] for c in cols] for row in src_rows]
            await tgt.executemany(insert_query, records)

            # Verify target count
            tgt_count = await tgt.fetchval(f'SELECT count(*) FROM public."{tbl}"')
            status = "MATCH" if src_count == tgt_count else "MISMATCH"
            print(f"Table {tbl:25}: Synced {src_count} rows -> Target has {tgt_count} rows [{status}]")
            sync_results.append((tbl, src_count, tgt_count, status))

    finally:
        # Restore default trigger/fk behavior
        await tgt.execute("SET session_replication_role = 'origin';")
        await src.close()
        await tgt.close()

    print("\n" + "=" * 65)
    print(f"{'Table':<25} | {'Source Rows':<12} | {'Target Rows':<12} | {'Status'}")
    print("-" * 65)
    for tbl, s_cnt, t_cnt, st in sync_results:
        print(f"{tbl:<25} | {s_cnt:<12} | {t_cnt:<12} | {st}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(sync_database())
