#!/usr/bin/env python3
"""Export lancedb knowledge vectors to a pre-bundled JSON file.

Source: old boss-agent lancedb_data/boss_agent_knowledge.lance
Output: data/skill-vectors.json

Usage:
    python scripts/export-vectors.py [--input PATH] [--output PATH]

Defaults:
    --input   /Users/dengxiongshihao/Library/Mobile Documents/com~apple~CloudDocs/boss-agent/lancedb_data
    --output  /Users/dengxiongshihao/Downloads/reup/data/skill-vectors.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore", category=DeprecationWarning)

DEFAULT_INPUT = "/Users/dengxiongshihao/Library/Mobile Documents/com~apple~CloudDocs/boss-agent/lancedb_data"
DEFAULT_OUTPUT = "/Users/dengxiongshihao/Downloads/reup/data/skill-vectors.json"
EXPECTED_DIM = 1024
MIN_CHUNKS = 50


def parse_sparse(raw: str | None) -> list[dict[str, Any]] | None:
    """Parse sparse_vector JSON string into a list of {index, value} entries.

    Returns None if the input is missing or not a valid JSON object/array.
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    if isinstance(parsed, dict):
        return [{"index": int(k), "value": float(v)} for k, v in parsed.items()]
    if isinstance(parsed, list):
        return [{"index": int(item.get("index", i)), "value": float(item["value"])} for i, item in enumerate(parsed) if "value" in item]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="LanceDB dataset directory")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output JSON path")
    parser.add_argument("--min-chunks", type=int, default=MIN_CHUNKS, help="Minimum chunk count to enforce")
    parser.add_argument("--expected-dim", type=int, default=EXPECTED_DIM, help="Expected vector dimension")
    args = parser.parse_args()

    try:
        import lancedb
    except ImportError:
        print("ERROR: lancedb is not installed. Activate the source venv or `pip install lancedb pyarrow pandas`.", file=sys.stderr)
        return 2

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"ERROR: input path does not exist: {input_path}", file=sys.stderr)
        return 2

    output_path.parent.mkdir(parents=True, exist_ok=True)

    db = lancedb.connect(str(input_path))
    table_names = db.table_names()
    if not table_names:
        print(f"ERROR: no tables found in {input_path}", file=sys.stderr)
        return 2

    table_name = table_names[0]
    print(f"Opening table: {table_name}")
    table = db.open_table(table_name)

    df = table.to_pandas()
    total = len(df)
    print(f"Total rows: {total}")

    vectors: list[dict[str, Any]] = []
    dim_seen: set[int] = set()
    for _, row in df.iterrows():
        raw_vec = row.get("vector")
        if raw_vec is None:
            vector: list[float] = []
        else:
            try:
                vector = [float(x) for x in raw_vec]
            except TypeError:
                vector = list(raw_vec)
        dim = len(vector)
        dim_seen.add(dim)
        sparse = parse_sparse(row.get("sparse_vector"))
        record = {
            "id": row.get("id"),
            "text": row.get("text"),
            "retrieval_text": row.get("retrieval_text"),
            "metadata": row.get("metadata"),
            "book": row.get("book"),
            "filename": row.get("filename"),
            "doc_title": row.get("doc_title"),
            "section_title": row.get("section_title"),
            "title_path": row.get("title_path"),
            "keyword_text": row.get("keyword_text"),
            "source_path": row.get("source_path"),
            "chunk_index": int(row.get("chunk_index") or 0),
            "vector": vector,
            "sparse_vector": sparse,
        }
        vectors.append(record)

    # Validation
    if len(vectors) < args.min_chunks:
        print(f"ERROR: chunk count {len(vectors)} < required {args.min_chunks}", file=sys.stderr)
        return 1
    if dim_seen - {args.expected_dim}:
        unexpected = dim_seen - {args.expected_dim}
        print(f"ERROR: unexpected vector dimensions found: {unexpected}", file=sys.stderr)
        return 1
    if args.expected_dim not in dim_seen:
        print(f"ERROR: no rows with expected dimension {args.expected_dim}", file=sys.stderr)
        return 1

    payload = {
        "version": 1,
        "source": str(input_path),
        "table": table_name,
        "dimension": args.expected_dim,
        "count": len(vectors),
        "vectors": vectors,
    }

    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Wrote {output_path} ({len(vectors)} chunks, dim={args.expected_dim}, size={size_mb:.2f}MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
