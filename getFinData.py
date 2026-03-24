#!/usr/bin/env python3
"""
Fetch the most current inflation, FX (vs EUR), and PPP data for a list of ISO2 country codes.

Run: python3 getFinData.py IE AR

This script writes the fetched economic data directly into each
`src/core/config/tax-rules-<country>.json` file under the `economicData`
section (creating or updating it as needed).
It also fetches rental yields and writes
`economicData.typicalRentalYield` for each selected country.
"""

import sys, json, time, re, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from html.parser import HTMLParser
from typing import Dict, Any, List, Optional, Tuple
from collections import OrderedDict
from pathlib import Path

WB_BASE = "https://api.worldbank.org/v2"
IMF_BASE = "https://www.imf.org/external/datamapper/api/v1"
ECB_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
EXCHANGERATE_API_BASE = "https://api.exchangerate-api.com/v4/latest/EUR"
EXCHANGERATE_HOST_BASE = "https://api.exchangerate.host/latest"
RENTAL_YIELDS_URL = "https://www.numbeo.com/property-investment/rankings_by_country.jsp"

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

def wb_country_info(iso2: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    url = f"{WB_BASE}/country/{urllib.parse.quote(iso2)}?format=json"
    d = http_get_json(url)
    if isinstance(d, list) and len(d) == 2 and d[1]:
        info = d[1][0]
        currency = info.get("currencyIso3Code")
        iso3 = info.get("iso3Code")
        # Fallback: some responses omit iso3Code; use country id if present
        if not iso3:
            iso3 = info.get("id")
        if iso3:
            try:
                iso3 = iso3.upper()
            except Exception:
                pass
        return (
            currency,
            iso3,
            info.get("name")
        )
    return None, None, None

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

def exchangerate_api_fx() -> Tuple[Dict[str, float], Optional[str]]:
    """
    Fetch current FX rates from exchangerate-api.com (free tier, no API key required).
    Returns rates as currency per EUR and the date.
    """
    try:
        data = http_get_json(EXCHANGERATE_API_BASE)
        if not isinstance(data, dict):
            return {}, None
        rates = data.get("rates", {})
        date = data.get("date")
        # Rates are already per EUR, so we can use them directly
        result = {}
        for curr, rate in rates.items():
            try:
                result[curr.upper()] = float(rate)
            except (ValueError, TypeError):
                continue
        return result, date
    except Exception:
        return {}, None

def exchangerate_host_fx() -> Tuple[Dict[str, float], Optional[str]]:
    """
    Fetch current FX rates from exchangerate.host (free public API).
    Returns rates as currency per EUR and the date.
    """
    try:
        url = f"{EXCHANGERATE_HOST_BASE}?base=EUR"
        data = http_get_json(url)
        if not isinstance(data, dict) or not data.get("success"):
            return {}, None
        rates = data.get("rates", {})
        date = data.get("date")
        result = {}
        for curr, rate in rates.items():
            try:
                result[curr.upper()] = float(rate)
            except (ValueError, TypeError):
                continue
        return result, date
    except Exception:
        return {}, None

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


def imf_fetch_series(country_iso3: str, indicator: str) -> Dict[int, float]:
    url = f"{IMF_BASE}/{indicator}/{country_iso3}"
    data = http_get_json(url)
    if not isinstance(data, dict):
        return {}

    indicator_blob = None
    # Newer schema: values -> indicator -> country
    values_section = data.get("values")
    if isinstance(values_section, dict):
        candidate = values_section.get(indicator)
        if isinstance(candidate, dict):
            indicator_blob = candidate
    # Legacy/direct schema: indicator -> country
    if indicator_blob is None:
        direct = data.get(indicator)
        if isinstance(direct, dict):
            indicator_blob = direct
    if not isinstance(indicator_blob, dict):
        return {}

    country_key_candidates = [country_iso3, country_iso3.upper(), country_iso3.lower()]
    country_blob = None
    for k in country_key_candidates:
        v = indicator_blob.get(k)
        if isinstance(v, dict):
            country_blob = v
            break
    if not isinstance(country_blob, dict):
        return {}

    observations = None
    for nested_key in ("observations", "data", "series", "values"):
        nested = country_blob.get(nested_key)
        if isinstance(nested, dict):
            observations = nested
            break
    if observations is None and isinstance(country_blob, dict):
        observations = country_blob

    if not isinstance(observations, dict):
        return {}

    out: Dict[int, float] = {}
    for year, value in observations.items():
        if value is None:
            continue
        extracted = value
        if isinstance(value, dict):
            for key in ("value", "OBS_VALUE", "obs_value"):
                if key in value and value[key] is not None:
                    extracted = value[key]
                    break
        try:
            out[int(year)] = float(extracted)
        except Exception:
            continue
    return out


def imf_fetch_inflation_series(country_iso3: str) -> Dict[int, float]:
    # IMF WEO CPI (annual % change) - indicator PCPIPCH
    return imf_fetch_series(country_iso3, "PCPIPCH")


def imf_fetch_ppp_series(country_iso3: str) -> Dict[int, float]:
    # IMF WEO PPP implied conversion rate (LCU per international $) - indicator PPPEX
    return imf_fetch_series(country_iso3, "PPPEX")


def wb_fetch_fx_series(country_code: str, start_year: int = 1960, end_year: int = 2025) -> Dict[int, float]:
    # World Bank official FX rate (LCU per USD)
    url = (
        f"{WB_BASE}/country/{urllib.parse.quote(country_code)}/indicator/PA.NUS.FCRF"
        f"?format=json&per_page=2000&date={start_year}:{end_year}"
    )
    data = http_get_json(url)
    if not (isinstance(data, list) and len(data) > 1 and isinstance(data[1], list)):
        return {}
    out: Dict[int, float] = {}
    for row in data[1]:
        value = row.get("value")
        if value is None:
            continue
        try:
            out[int(row.get("date"))] = float(value)
        except Exception:
            continue
    return out


def _ordered_series(series: Dict[int, float]) -> OrderedDict:
    ordered = OrderedDict()
    for year in sorted(series.keys()):
        ordered[str(year)] = series[year]
    return ordered

def fetch(codes: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, float], Optional[str]]:
    # Try free FX APIs first for current rates, then fall back to ECB
    fx_map, fx_date = exchangerate_api_fx()
    if not fx_map:
        fx_map, fx_date = exchangerate_host_fx()
    if not fx_map:
        fx_map, fx_date = ecb_fx()
    
    # Get USD/EUR rate for fallback conversions (from whichever source we got)
    usd_per_eur = fx_map.get("USD") if fx_map else None
    out = []
    for c in [x.upper() for x in codes]:
        curr, iso3, wb_name = wb_country_info(c)
        if iso3 is None:
            iso3 = c
        infl, infl_y = wb_latest(c, "FP.CPI.TOTL.ZG")
        ppp, ppp_y = wb_latest(c, "PA.NUS.PPP")
        # Get latest FX rate from World Bank (LCU per USD) for fallback
        fx_latest_usd, _ = wb_latest(c, "PA.NUS.FCRF")
        
        # Fetch FX series for historical data
        fx_series = wb_fetch_fx_series(iso3)
        
        # Determine FX rate: EUR is always 1.0, otherwise try free APIs/ECB, then World Bank fallbacks
        fx = None
        curr_upper = curr.upper() if curr else ""
        if curr_upper == "EUR":
            fx = 1.0
        else:
            # Try free FX APIs or ECB (rates are currency per EUR)
            fx = fx_map.get(curr_upper) if fx_map else None
            
            # Fallback 1: use latest World Bank FX rate (LCU per USD) and convert to LCU per EUR
            # NOTE: World Bank FX data may be outdated (often only updated annually), especially for
            # volatile currencies. For more current rates, consider using a real-time FX API or
            # manually updating the exchangeRate.perEur value in the tax rules JSON file.
            if fx is None and fx_latest_usd is not None and usd_per_eur:
                # Convert: LCU/EUR = (LCU/USD) * (USD/EUR)
                fx = fx_latest_usd * usd_per_eur
            
            # Fallback 2: if latest not available, use most recent from historical series
            if fx is None and fx_series and usd_per_eur:
                if fx_series:
                    latest_year = max(fx_series.keys())
                    lcu_per_usd = fx_series[latest_year]
                    # Convert: LCU/EUR = (LCU/USD) * (USD/EUR)
                    fx = lcu_per_usd * usd_per_eur
        
        inflation_series = imf_fetch_inflation_series(iso3)
        ppp_series = imf_fetch_ppp_series(iso3)
        out.append({
            "country": c,
            "countryName": wb_name,
            "curr": curr,
            "infl": round(infl, 4) if infl is not None else None,
            "infl_year": infl_y,
            "ppp": round(ppp, 6) if ppp is not None else None,
            "ppp_year": ppp_y,
            "fx": round(fx, 6) if fx is not None else None,
            "fx_date": fx_date,
            "series": {
                "inflation": _ordered_series(inflation_series),
                "ppp": _ordered_series(ppp_series),
                "fx": _ordered_series(fx_series)
            }
        })
    return out, fx_map, fx_date

def load_tax_rules(path: Path) -> OrderedDict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=OrderedDict)

def _is_leaf_dict(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    for v in obj.values():
        if isinstance(v, (dict, list)):
            return False
    return True

def _dump_json_leaf_inline(obj: Any, indent: int = 2, level: int = 0) -> str:
    space = " " * (indent * level)
    next_space = " " * (indent * (level + 1))

    # Dict handling
    if isinstance(obj, dict):
        if _is_leaf_dict(obj):
            # Inline one-line map
            parts = []
            for k, v in obj.items():
                key_str = json.dumps(k, ensure_ascii=False)
                val_str = json.dumps(v, ensure_ascii=False)
                parts.append(f"{key_str}: {val_str}")
            return "{ " + ", ".join(parts) + " }"
        # Pretty multi-line map
        if not obj:
            return "{}"
        lines = ["{"]
        items = list(obj.items())
        rendered = []
        is_container_flags = []
        for _, v in items:
            is_container_flags.append(isinstance(v, (dict, list)))
            rendered.append(_dump_json_leaf_inline(v, indent, level + 1))
        for idx, (k, _v) in enumerate(items):
            # Spacing rules for top-level: add a blank line before entries that
            # are containers, and also before entries that follow a container.
            if level == 0:
                if idx == 0 and is_container_flags[idx]:
                    lines.append("")
                elif idx > 0 and (is_container_flags[idx] or is_container_flags[idx - 1]):
                    lines.append("")
            key_str = json.dumps(k, ensure_ascii=False)
            val_str = rendered[idx]
            comma = "," if idx != (len(items) - 1) else ""
            lines.append(f"{next_space}{key_str}: {val_str}{comma}")
        lines.append(f"{space}}}")
        return "\n".join(lines)

    # List handling
    if isinstance(obj, list):
        if not obj:
            return "[]"
        # Inline one-line array if all elements are scalars
        is_leaf_array = True
        for v in obj:
            if isinstance(v, (dict, list)):
                is_leaf_array = False
                break
        if is_leaf_array:
            parts = [json.dumps(v, ensure_ascii=False) for v in obj]
            return "[ " + ", ".join(parts) + " ]"
        # Pretty multi-line array otherwise
        lines = ["["]
        for idx, item in enumerate(obj):
            val_str = _dump_json_leaf_inline(item, indent, level + 1)
            comma = "," if idx < (len(obj) - 1) else ""
            lines.append(f"{next_space}{val_str}{comma}")
        lines.append(f"{space}]")
        return "\n".join(lines)

    # Scalars
    return json.dumps(obj, ensure_ascii=False)

def write_tax_rules(path: Path, data: OrderedDict):
    with path.open("w", encoding="utf-8") as f:
        f.write(_dump_json_leaf_inline(data, indent=2))
        f.write("\n")

def round_if(value: Optional[float], digits: int) -> Optional[float]:
    if value is None:
        return None
    return round(value, digits)

def calculate_blended_log_inflation(
    inflation_series: Dict[Any, float],
    window_years: int = 20,
    historical_weight_min: float = 1.0,
    historical_weight_max: float = 3.0,
    current_year_weight: float = 4.0,
    forecast_year_weights: Tuple[float, ...] = (3.0, 2.0, 1.0),
) -> Optional[float]:
    """
    Calculates a planning inflation anchor as a weighted average of annual log-changes.

    Policy:
    - Keep a long-run anchor from historical data (up to last 20 years).
    - Increase historical weights linearly toward recent years.
    - Add explicit influence from current-year inflation and near-term forecasts.

    This returns a single scalar annual inflation rate suitable as a long-horizon default
    in the simulator (a guideline, not a nowcast).
    """
    import math

    if not inflation_series:
        return None

    try:
        # Ensure keys are integers and values are numeric percentages.
        series_int = {int(k): float(v) for k, v in inflation_series.items() if v is not None}
    except (ValueError, TypeError):
        return None

    if not series_int:
        return None

    current_year = time.localtime().tm_year
    weighted_log_sum = 0.0
    total_weight = 0.0

    def add_weighted_observation(cpi_pct: float, weight: float) -> None:
        nonlocal weighted_log_sum, total_weight
        if cpi_pct is None:
            return
        if weight is None or weight <= 0:
            return
        if cpi_pct <= -100:
            return
        weighted_log_sum += float(weight) * math.log(1 + float(cpi_pct) / 100.0)
        total_weight += float(weight)

    # 1) Historical base: use years before current_year to avoid contaminating
    # "history" with current-year projections in partially observed years.
    historical = {y: v for y, v in series_int.items() if y < current_year}
    if not historical:
        # Fallback: if no strict history, allow <= current year.
        historical = {y: v for y, v in series_int.items() if y <= current_year}

    hist_years = sorted(historical.keys())
    if window_years > 0 and len(hist_years) > window_years:
        hist_years = hist_years[-window_years:]

    if hist_years:
        n_hist = len(hist_years)
        for idx, y in enumerate(hist_years):
            if n_hist <= 1:
                hist_weight = historical_weight_max
            else:
                t = float(idx) / float(n_hist - 1)
                hist_weight = historical_weight_min + (historical_weight_max - historical_weight_min) * t
            add_weighted_observation(historical[y], hist_weight)

    # 2) Current-year influence (if available in source series).
    if current_year in series_int:
        add_weighted_observation(series_int[current_year], current_year_weight)

    # 3) Near-term forecast influence.
    forecast_years = sorted([y for y in series_int.keys() if y > current_year])
    for idx, y in enumerate(forecast_years):
        if idx >= len(forecast_year_weights):
            break
        add_weighted_observation(series_int[y], forecast_year_weights[idx])

    if total_weight <= 0:
        return None

    blended_log_growth = weighted_log_sum / total_weight
    inflation_val = (math.exp(blended_log_growth) - 1.0) * 100.0
    return inflation_val

def _promote_key_first(d: OrderedDict, key: str) -> OrderedDict:
    if not isinstance(d, dict) or key not in d:
        return d
    out = OrderedDict()
    out[key] = d[key]
    for k, v in d.items():
        if k == key:
            continue
        out[k] = v
    return out

def _normalize_country_name(name: str) -> str:
    # Permissive normalizer for matching across data sources.
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())

def lookup_rental_yield_pct(yields_by_norm_name: Dict[str, float], country_name: Optional[str]) -> Optional[float]:
    if not yields_by_norm_name or not country_name:
        return None
    key = _normalize_country_name(country_name)
    return yields_by_norm_name.get(key)

def update_economic_block(
    entry: Dict[str, Any],
    currency_code_from_locale: Optional[str] = None,
    typical_rental_yield_pct: Optional[float] = None,
) -> OrderedDict:
    econ = OrderedDict()
    
    if typical_rental_yield_pct is not None:
        econ["typicalRentalYield"] = round(float(typical_rental_yield_pct), 2)
    
    # Calculate inflation using a blended weighted-log anchor:
    # 20y historical baseline + current-year + near-term forecast influence.
    inflation_series = entry.get("series", {}).get("inflation", {})
    blended_inflation = calculate_blended_log_inflation(inflation_series)
    
    # Determine inflation value (prefer blended anchor, fallback to scalar)
    inflation_val = blended_inflation
    
    if inflation_val is None:
        inflation_val = entry.get("infl")

    if inflation_val is not None:
        # Schema: economicData.inflation is a scalar percentage.
        econ["inflation"] = round_if(inflation_val, 4)
            
    if entry.get("ppp") is not None:
        econ["purchasingPowerParity"] = OrderedDict()
        econ["purchasingPowerParity"]["value"] = round_if(entry["ppp"], 6)
        if entry.get("ppp_year") is not None:
            econ["purchasingPowerParity"]["year"] = entry["ppp_year"]
        if not econ["purchasingPowerParity"]:
            econ.pop("purchasingPowerParity")
    # Always include exchangeRate/asOf if we have FX value or date
    fx_val = entry.get("fx")
    fx_date_val = entry.get("fx_date")
    
    # Determine currency code: prefer locale, then entry
    curr_code = None
    if currency_code_from_locale:
        curr_code = currency_code_from_locale.upper()
    else:
        curr_code = (entry.get("curr") or "").upper()
    
    # For EUR, ensure we always have 1.0
    if curr_code == "EUR":
        fx_val = 1.0
    
    if fx_val is not None or fx_date_val is not None:
        econ["exchangeRate"] = OrderedDict()
        if fx_val is not None:
            econ["exchangeRate"]["perEur"] = round_if(fx_val, 6)
        if fx_date_val:
            # Schema: keep timestamp one level up at economicData.asOf
            econ["asOf"] = fx_date_val
        # Only remove if perEur is missing
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
        # Explicitly remove timeSeries as we don't want it anymore
        merged.pop("timeSeries", None)
        # Remove projectionWindowYears as it is now baked into the Python script (30y)
        merged.pop("projectionWindowYears", None)
        econ = _promote_key_first(merged, "typicalRentalYield")
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

def get_fx_rate_from_apis(currency_code: str, fx_map: Dict[str, float]) -> Optional[float]:
    """
    Get FX rate (currency per EUR) from the free FX APIs using the currency code.
    Returns None if not found.
    """
    if not currency_code:
        return None
    curr_upper = currency_code.upper()
    if curr_upper == "EUR":
        return 1.0
    return fx_map.get(curr_upper) if fx_map else None

class _SimpleHtmlTableParser(HTMLParser):
    """
    Minimal table parser for extracting text rows from HTML tables.
    """
    def __init__(self):
        super().__init__()
        self.rows: List[List[str]] = []
        self._in_row = False
        self._in_cell = False
        self._current_row: List[str] = []
        self._current_cell_parts: List[str] = []

    def handle_starttag(self, tag, attrs):
        t = (tag or "").lower()
        if t == "tr":
            self._in_row = True
            self._current_row = []
        elif self._in_row and (t == "td" or t == "th"):
            self._in_cell = True
            self._current_cell_parts = []

    def handle_data(self, data):
        if self._in_cell and data:
            self._current_cell_parts.append(data)

    def handle_endtag(self, tag):
        t = (tag or "").lower()
        if self._in_row and (t == "td" or t == "th"):
            cell = "".join(self._current_cell_parts).strip()
            self._current_row.append(re.sub(r"\s+", " ", cell))
            self._in_cell = False
            self._current_cell_parts = []
        elif t == "tr":
            if self._in_row and self._current_row:
                self.rows.append(self._current_row)
            self._in_row = False
            self._current_row = []

def _normalize_header_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())

def _parse_number(value: str) -> Optional[float]:
    if value is None:
        return None
    txt = str(value).strip()
    if not txt:
        return None
    m = re.search(r"-?\d+(?:[.,]\d+)?", txt)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except Exception:
        return None

def fetch_rental_yields_numbeo() -> Dict[str, float]:
    html_bytes = http_get_bytes(RENTAL_YIELDS_URL)
    if not html_bytes:
        raise RuntimeError("Failed to download rental-yield page from Numbeo.")

    html_text = html_bytes.decode("utf-8", errors="ignore")
    parser = _SimpleHtmlTableParser()
    parser.feed(html_text)

    rows = parser.rows
    if not rows:
        raise RuntimeError("No table rows found on Numbeo rental-yield page.")

    country_idx = None
    yield_idx = None
    header_row_index = None

    yield_headers = {
        "gross rental yield outside of centre",
        "gross rental yield outside of center",
    }

    for i, row in enumerate(rows):
        normalized = [_normalize_header_text(c) for c in row]
        if "country" not in normalized:
            continue
        found_yield = None
        for y in yield_headers:
            if y in normalized:
                found_yield = y
                break
        if found_yield is None:
            continue
        country_idx = normalized.index("country")
        yield_idx = normalized.index(found_yield)
        header_row_index = i
        break

    if header_row_index is None or country_idx is None or yield_idx is None:
        raise RuntimeError("Could not find Numbeo country/yield columns in table.")

    yields: Dict[str, float] = {}
    required_cells = max(country_idx, yield_idx)

    for row in rows[header_row_index + 1:]:
        if len(row) <= required_cells:
            continue
        country = (row[country_idx] or "").strip()
        if not country:
            continue
        value = _parse_number(row[yield_idx])
        if value is None:
            continue
        yields[country] = round(float(value), 2)

    if not yields:
        raise RuntimeError("Numbeo table parsed, but no rental-yield values were extracted.")
    return yields

def write_rental_yields_tsv(path: Path, yields_by_country_name: Dict[str, float]):
    lines = []
    for country in sorted(yields_by_country_name.keys()):
        lines.append(f"{country}\t{yields_by_country_name[country]:.2f}")
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

def build_normalized_rental_yield_map(yields_by_country_name: Dict[str, float]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for country_name, pct in yields_by_country_name.items():
        out[_normalize_country_name(country_name)] = round(float(pct), 2)
    return out

def main():
    base_path = Path(__file__).parent / "src" / "core" / "config"
    yields_path = Path(__file__).parent / "yields"

    if len(sys.argv) < 2:
        print("Usage: python getFinData.py <ISO2> [<ISO2> ...]")
        sys.exit(1)

    codes = sys.argv[1:]
    data, fx_map_free, fx_date_free = fetch(codes)
    yields_by_country = fetch_rental_yields_numbeo()
    write_rental_yields_tsv(yields_path, yields_by_country)
    yields_by_norm_name = build_normalized_rental_yield_map(yields_by_country)
    
    for entry in data:
        country = entry["country"].lower()
        tax_file = base_path / f"tax-rules-{country}.json"
        if not tax_file.exists():
            print(f"[WARN] Tax rules file {tax_file} not found; skipping.", file=sys.stderr)
            continue
        rules = load_tax_rules(tax_file)
        # Extract currency code from locale for accurate EUR detection and FX lookup
        locale = rules.get("locale", {})
        currency_code = locale.get("currencyCode", "") if isinstance(locale, dict) else ""
        yield_pct = lookup_rental_yield_pct(
            yields_by_norm_name,
            (rules.get("countryName") or entry.get("countryName")),
        )
        
        # If entry's FX is missing or we have better free API data, use the locale currency code to look it up
        if currency_code and fx_map_free:
            fx_from_locale = get_fx_rate_from_apis(currency_code, fx_map_free)
            if fx_from_locale is not None:
                entry["fx"] = fx_from_locale
                if fx_date_free:
                    entry["fx_date"] = fx_date_free
        
        econ_block = update_economic_block(
            entry,
            currency_code_from_locale=currency_code,
            typical_rental_yield_pct=yield_pct,
        )
        updated = insert_economic_block(rules, econ_block)
        write_tax_rules(tax_file, updated)
        print(f"[OK] Updated economic data for {entry['country']} -> {tax_file}")

if __name__ == "__main__":
    main()
