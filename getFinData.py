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

Run: python3 getFinData.py IE AR >src/core/config/findata.json

"""

import sys, json, time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional, Tuple

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

def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_macro.py <ISO2> [<ISO2> ...]")
        sys.exit(1)
    data = fetch(sys.argv[1:])
    json.dump(data, sys.stdout, ensure_ascii=False, separators=(",", ":"))

if __name__ == "__main__":
    main()
