#!/bin/bash
# check-docs-freshness.sh — docs/docs.yaml 기반 문서 신선도(드리프트) 검사
# stale 판정: (1) covers 경로의 최신 커밋 > last_reviewed, (2) 검토 후 review_max_age_days 초과
# 종료 코드: 0 = 전부 신선, 1 = stale 문서 존재

set -uo pipefail

MANIFEST="${1:-docs/docs.yaml}"
[ -f "$MANIFEST" ] || { echo "매니페스트 없음: $MANIFEST — docs-ci 스킬로 생성하세요"; exit 0; }

python3 - "$MANIFEST" <<'PYEOF'
import re, subprocess, sys, datetime

manifest_path = sys.argv[1]
text = open(manifest_path, encoding="utf-8").read()

# 의존성 없는 최소 YAML 파싱 (docs.yaml 규약 형태만 지원)
max_age = 90
m = re.search(r"^review_max_age_days:\s*(\d+)", text, re.M)
if m: max_age = int(m.group(1))

entries = []
current = None
for line in text.splitlines():
    if re.match(r"^\s*-\s+path:", line):
        if current: entries.append(current)
        current = {"path": line.split("path:", 1)[1].strip(), "covers": [], "last_reviewed": None}
    elif current is not None:
        cm = re.match(r"^\s*covers:\s*\[(.*)\]", line)
        if cm:
            current["covers"] = [c.strip().strip('"').strip("'") for c in cm.group(1).split(",") if c.strip()]
        rm = re.match(r"^\s*last_reviewed:\s*([\d-]+)", line)
        if rm:
            current["last_reviewed"] = rm.group(1)
if current: entries.append(current)

def latest_commit_ts(paths):
    # covers는 glob(** = 하위 전체)이고 "!패턴"은 제외다. 포함 패턴이 없으면 검사하지 않는다
    if not any(not p.startswith("!") for p in paths): return 0
    spec = [":(exclude,glob)" + p[1:] if p.startswith("!") else ":(glob)" + p for p in paths]
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", *spec],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return int(out) if out else 0
    except Exception:
        return 0

today = datetime.date.today()
stale = []
for e in entries:
    if not e["last_reviewed"]:
        stale.append((e["path"], "last_reviewed 없음"))
        continue
    reviewed = datetime.date.fromisoformat(e["last_reviewed"])
    age = (today - reviewed).days
    if age > max_age:
        stale.append((e["path"], f"검토 후 {age}일 경과 (임계 {max_age}일)"))
        continue
    code_ts = latest_commit_ts(e["covers"])
    if code_ts:
        code_date = datetime.date.fromtimestamp(code_ts)
        if code_date > reviewed:
            stale.append((e["path"], f"코드 최신 변경({code_date}) > 문서 검토일({reviewed})"))

if stale:
    print("🟡 stale 문서:")
    for path, reason in stale:
        print(f"  - {path}: {reason}")
    sys.exit(1)
print(f"✅ 문서 {len(entries)}건 전부 신선")
sys.exit(0)
PYEOF
