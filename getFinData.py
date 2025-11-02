#!/usr/bin/env python3
"""
Fetch the most current inflation, FX (vs EUR), and PPP data for a list of ISO2 country codes.
Outputs compact JSON.

Example output:
[
  {
    "country": "IE",
    "curr": "EUR",
    "infl": 2.34,
    "infl_year": 2024,
    "ppp": 0.80,
    "ppp_year": 2024,
    "fx": 1.0,
    "fx_date": "2025-10-15"
  }
]

Run: python3 getFinData.py IE AR
This script now writes the fetched economic data directly into each
`src/core/config/tax-rules-<country>.json` file under the `economicData`
section (creating or updating it as needed).
"""

import sys, json, time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional, Tuple
from collections import OrderedDict
from pathlib import Path

WB_BASE = "https://api.worldbank.org/v2"
ECB_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

def http_get_json(url: str):
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.load(r)
        except Exception:
            time.sleep(0.5)
    return None

def http_get_bytes(url: str):
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return r.read()
        except Exception:
            time.sleep(0.5)
    return b""

def wb_country_currency(iso2: str) -> Optional[str]:
    url = f"{WB_BASE}/country/{urllib.parse.quote(iso2)}?format=json"
    d = http_get_json(url)
    if isinstance(d, list) and len(d) == 2 and d[1]:
        return d[1][0].get("currencyIso3Code")
    return None

def wb_latest(iso2: str, ind: str) -> Tuple[Optional[float], Optional[int]]:
    url = f"{WB_BASE}/country/{iso2}/indicator/{ind}?format=json&per_page=200"
    d = http_get_json(url)
    if not (isinstance(d, list) and len(d) == 2 and d[1]):
        return None, None
    for r in d[1]:
        v = r.get("value")
        if v is not None:
            try:
                return float(v), int(r.get("date"))
            except Exception:
                return None, None
    return None, None

def ecb_fx() -> Tuple[Dict[str, float], Optional[str]]:
    xml = http_get_bytes(ECB_XML_URL)
    root = ET.fromstring(xml)
    ns = {'d': 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref'}
    rates, date = {}, None
    for cube_time in root.findall('.//d:Cube[@time]', ns):
        date = cube_time.get('time')
        for c in cube_time.findall('d:Cube', ns):
            try:
                rates[c.get('currency').upper()] = float(c.get('rate'))
            except Exception:
                pass
        break
    return rates, date

def fetch(codes: List[str]) -> List[Dict[str, Any]]:
    fx_map, fx_date = ecb_fx()
    out = []
    for c in [x.upper() for x in codes]:
        curr = wb_country_currency(c)
        infl, infl_y = wb_latest(c, "FP.CPI.TOTL.ZG")
        ppp, ppp_y = wb_latest(c, "PA.NUS.PPP")
        fx = 1.0 if curr == "EUR" else fx_map.get(curr)
        out.append({
            "country": c,
            "curr": curr,
            "infl": round(infl,4) if infl is not None else None,
            "infl_year": infl_y,
            "ppp": round(ppp,6) if ppp is not None else None,
            "ppp_year": ppp_y,
            "fx": round(fx,6) if fx is not None else None,
            "fx_date": fx_date
        })
    return out

def load_tax_rules(path: Path) -> OrderedDict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=OrderedDict)

def write_tax_rules(path: Path, data: OrderedDict):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def round_if(value: Optional[float], digits: int) -> Optional[float]:
    if value is None:
        return None
    return round(value, digits)

def update_economic_block(entry: Dict[str, Any]) -> OrderedDict:
    econ = OrderedDict()
    if entry.get("infl") is not None or entry.get("cpi") is not None:
        econ["inflation"] = OrderedDict()
        cpi_val = entry.get("infl")
        if cpi_val is None:
            cpi_val = entry.get("cpi")
        if cpi_val is not None:
            econ["inflation"]["cpi"] = round_if(cpi_val, 4)
        if entry.get("infl_year") is not None:
            econ["inflation"]["year"] = entry["infl_year"]
        elif entry.get("cpi_year") is not None:
            econ["inflation"]["year"] = entry["cpi_year"]
        if not econ["inflation"]:
            econ.pop("inflation")
    if entry.get("ppp") is not None:
        econ["purchasingPowerParity"] = OrderedDict()
        econ["purchasingPowerParity"]["value"] = round_if(entry["ppp"], 6)
        if entry.get("ppp_year") is not None:
            econ["purchasingPowerParity"]["year"] = entry["ppp_year"]
        if not econ["purchasingPowerParity"]:
            econ.pop("purchasingPowerParity")
    if entry.get("fx") is not None or entry.get("fx_date") is not None:
        econ["exchangeRate"] = OrderedDict()
        if entry.get("fx") is not None:
            econ["exchangeRate"]["perEur"] = round_if(entry["fx"], 6)
        if entry.get("fx_date"):
            econ["exchangeRate"]["asOf"] = entry["fx_date"]
        if not econ["exchangeRate"]:
            econ.pop("exchangeRate")
    return econ

def insert_economic_block(data: OrderedDict, econ: OrderedDict):
    data.pop("inflationRate", None)
    # Remove empty block if nothing to write
    if not econ:
        data.pop("economicData", None)
        return data
    existing = data.get("economicData")
    if isinstance(existing, dict):
        merged = OrderedDict()
        merged.update(existing)
        merged.update(econ)
        econ = merged
    # Rebuild ordered dict placing economicData after locale when possible
    new_items = []
    inserted = False
    for key, value in data.items():
      if key == "economicData":
        continue
      new_items.append((key, value))
      if key == "locale":
        new_items.append(("economicData", econ))
        inserted = True
    if not inserted:
      new_items.append(("economicData", econ))
    return OrderedDict(new_items)

def main():
    if len(sys.argv) < 2:
        print("Usage: python getFinData.py <ISO2> [<ISO2> ...]")
        sys.exit(1)
    codes = sys.argv[1:]
    data = fetch(codes)
    base_path = Path(__file__).parent / "src" / "core" / "config"
    for entry in data:
        country = entry["country"].lower()
        tax_file = base_path / f"tax-rules-{country}.json"
        if not tax_file.exists():
            print(f"[WARN] Tax rules file {tax_file} not found; skipping.", file=sys.stderr)
            continue
        rules = load_tax_rules(tax_file)
        econ_block = update_economic_block(entry)
        updated = insert_economic_block(rules, econ_block)
        write_tax_rules(tax_file, updated)
        print(f"[OK] Updated economic data for {entry['country']} -> {tax_file}")

if __name__ == "__main__":
    main()
