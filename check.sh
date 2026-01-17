#!/usr/bin/env bash
set -euo pipefail

A_PATH="${1:-docs/demo-data-main.csv}"
B_PATH="${2:-docs/demo-data-relocation.csv}"

python3 - "$A_PATH" "$B_PATH" <<'PY'
import csv
import math
import re
import sys


def norm_title(title):
    t = " ".join(title.strip().split())
    t = re.sub(r"\s+\(([A-Za-z]{2,3})\)$", "", t)
    return t


def parse_number(s):
    x = s.strip()
    x = re.sub(r"[€$£¥,\u00A0\s]", "", x)
    x = re.sub(r"^(EUR|USD|GBP)", "", x, flags=re.IGNORECASE)
    x = re.sub(r"(EUR|USD|GBP)$", "", x, flags=re.IGNORECASE)
    if x in ("", "-", "+"):
        return None
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", x):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def norm_cell(s):
    raw = (s or "").strip()
    if raw == "":
        return ("", None)
    neg = False
    x = raw
    if x.startswith("(") and x.endswith(")"):
        neg = True
        x = x[1:-1].strip()

    if x.endswith("%"):
        n = parse_number(x[:-1])
        if n is not None:
            v = (n / 100.0) * (-1.0 if neg else 1.0)
            return ("num", v)

    n = parse_number(x)
    if n is not None:
        v = n * (-1.0 if neg else 1.0)
        return ("num", v)
    return ("str", " ".join(raw.split()))


def fmt_num(v):
    if v is None:
        return "-"
    if math.isfinite(v) and abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return ("{:.12g}".format(v)).rstrip(".")


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    if not rows:
        raise SystemExit(f"empty: {path}")
    header = rows[0]
    age_idx = None
    for i, h in enumerate(header):
        if h.strip().lower() == "age":
            age_idx = i
            break
    if age_idx is None:
        raise SystemExit(f"no Age column: {path}")

    counts = {}
    keys = []
    disp = {}
    for i, h in enumerate(header):
        base = norm_title(h)
        counts[base] = counts.get(base, 0) + 1
        key = f"{base}#{counts[base]}"
        keys.append(key)
        disp[key] = base if counts[base] == 1 else f"{base}#{counts[base]}"

    data = {}
    for r in rows[1:]:
        if not r:
            continue
        if len(r) < len(header):
            r = r + [""] * (len(header) - len(r))
        age_raw = r[age_idx].strip()
        if age_raw == "":
            continue
        age_num = parse_number(age_raw)
        age = int(round(age_num)) if age_num is not None else age_raw
        data[age] = r

    return header, keys, disp, age_idx, data


def cell_str(row, idx):
    if idx >= len(row):
        return ""
    return row[idx]


def is_same(a_kind, a_val, b_kind, b_val):
    if a_kind == "num" and b_kind == "num":
        return math.isclose(a_val, b_val, rel_tol=1e-9, abs_tol=1e-9)
    return (a_kind, a_val) == (b_kind, b_val)

def age_sort_key(age):
    if isinstance(age, int):
        return (0, age)
    return (1, str(age))


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: check.sh <a.csv> <b.csv>")
    a_path, b_path = sys.argv[1], sys.argv[2]

    a_header, a_keys, a_disp, a_age_idx, a_data = read_csv(a_path)
    b_header, b_keys, b_disp, b_age_idx, b_data = read_csv(b_path)

    a_key_to_idx = {k: i for i, k in enumerate(a_keys)}
    b_key_to_idx = {k: i for i, k in enumerate(b_keys)}

    a_keyset = set(a_keys)
    b_keyset = set(b_keys)
    common_keys = sorted(a_keyset & b_keyset, key=lambda k: (k.split("#", 1)[0].lower(), int(k.split("#", 1)[1])))

    out = []

    for k in sorted(a_keyset - b_keyset, key=str.lower):
        out.append(f"COL {a_disp.get(k, k)}: only in A")
    for k in sorted(b_keyset - a_keyset, key=str.lower):
        out.append(f"COL {b_disp.get(k, k)}: only in B")

    a_ages = set(a_data.keys())
    b_ages = set(b_data.keys())
    for age in sorted(a_ages - b_ages, key=age_sort_key):
        out.append(f"AGE {age}: only in A")
    for age in sorted(b_ages - a_ages, key=age_sort_key):
        out.append(f"AGE {age}: only in B")

    for age in sorted(a_ages & b_ages, key=age_sort_key):
        a_row = a_data[age]
        b_row = b_data[age]
        for k in common_keys:
            ai = a_key_to_idx[k]
            bi = b_key_to_idx[k]
            a_raw = cell_str(a_row, ai)
            b_raw = cell_str(b_row, bi)
            a_kind, a_val = norm_cell(a_raw)
            b_kind, b_val = norm_cell(b_raw)
            if is_same(a_kind, a_val, b_kind, b_val):
                continue
            col = a_disp.get(k) or b_disp.get(k) or k
            if a_kind == "num" and b_kind == "num":
                out.append(f"{col} @{age}: {fmt_num(a_val)} != {fmt_num(b_val)}")
            else:
                a_s = a_val if a_kind == "str" else fmt_num(a_val)
                b_s = b_val if b_kind == "str" else fmt_num(b_val)
                out.append(f"{col} @{age}: {a_s} != {b_s}")

    if not out:
        print("NO DIFFS")
    else:
        for line in out:
            print(line)


main()
PY
