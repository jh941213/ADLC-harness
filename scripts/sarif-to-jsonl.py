#!/usr/bin/env python3
"""SARIF → 경량 JSONL 변환기

- SARIF에서 file_path, line_num, code_snippet만 추출
- 연속 라인 병합으로 토큰 절약
- MB 단위 SARIF → KB 단위 JSONL

사용법:
  python3 sarif-to-jsonl.py semgrep-output.sarif > candidates.jsonl
"""

import json
import sys
from collections import defaultdict


def parse_sarif(sarif_path: str) -> list[dict]:
    with open(sarif_path) as f:
        data = json.load(f)

    entries = []
    for run in data.get("runs", []):
        for result in run.get("results", []):
            for loc in result.get("locations", []):
                phys = loc.get("physicalLocation", {})
                artifact = phys.get("artifactLocation", {})
                region = phys.get("region", {})
                snippet = region.get("snippet", {})

                entries.append({
                    "file_path": artifact.get("uri", ""),
                    "line_num": region.get("startLine", 0),
                    "end_line": region.get("endLine", region.get("startLine", 0)),
                    "code_snippet": snippet.get("text", "").strip(),
                })

    return entries


def merge_consecutive(entries: list[dict]) -> list[dict]:
    """같은 파일의 연속 라인을 병합"""
    by_file = defaultdict(list)
    for e in entries:
        by_file[e["file_path"]].append(e)

    merged = []
    idx = 1

    for file_path, file_entries in sorted(by_file.items()):
        file_entries.sort(key=lambda x: x["line_num"])

        group = {**file_entries[0], "lines": {file_entries[0]["line_num"]}}
        for e in file_entries[1:]:
            if e["line_num"] <= group["end_line"] + 3:  # 3줄 이내면 병합
                group["end_line"] = max(group["end_line"], e["end_line"])
                if e["line_num"] not in group["lines"]:  # 같은 줄을 여러 규칙이 잡으면 한 번만
                    group["lines"].add(e["line_num"])
                    group["code_snippet"] += "\n" + e["code_snippet"]
            else:
                line = f"{group['line_num']}-{group['end_line']}" if group["line_num"] != group["end_line"] else str(group["line_num"])
                merged.append({
                    "id": idx,
                    "file_path": group["file_path"],
                    "line_num": line,
                    "code_snippet": group["code_snippet"],
                })
                idx += 1
                group = {**e, "lines": {e["line_num"]}}

        line = f"{group['line_num']}-{group['end_line']}" if group["line_num"] != group["end_line"] else str(group["line_num"])
        merged.append({
            "id": idx,
            "file_path": group["file_path"],
            "line_num": line,
            "code_snippet": group["code_snippet"],
        })
        idx += 1

    return merged


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 sarif-to-jsonl.py <sarif-file>", file=sys.stderr)
        sys.exit(1)

    # JSONL: 한 줄에 후보 하나. 후보가 없으면 아무것도 출력하지 않는다
    for item in merge_consecutive(parse_sarif(sys.argv[1])):
        print(json.dumps(item, ensure_ascii=False))


if __name__ == "__main__":
    main()
