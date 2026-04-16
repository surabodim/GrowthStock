# -*- coding: utf-8 -*-
"""
Growth Stock Scanner -- Flask Web Application
Backend: Python + Flask + yfinance (free data)
BugFix v2: robust fetching, fixed filters, better error handling
"""

from flask import Flask, jsonify, render_template, request
import yfinance as yf
import time
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

# --- Stock Universe ------------------------------------------------------------
US_TICKERS = [
    "CELH","CAVA","POWL","ASTS","RKLB","ACHR","JOBY","SOUN",
    "AXON","KTOS","PRCT","INSP","AAON","FTAI","CIEN",
    "SMCI","ONTO","FORM","ICHR","NVMI","OLED","ACLS","UCTT",
    "ENPH","FSLR","GNRC","ITRI","NOVA",
    "SAIA","ODFL","ARCB",
    "MDGL","FOLD","KRYS","RARE","ACAD",
    "TMDX","NVCR","IRTC","OMCL","DOCS","HIMS",
    "PLMR","RYAN","CSWC","MAIN","ARCC",
    "BOOT","CSWI","NVT","IESC","MYRG",
    "TTD","DV","BFAM","SPSC","PCTY","PAYC",
    "WING","OLLI","FIVE","ELF","FRPT","CRDO","LSCC",
    "SWAV","NARI","SILK","TELA","RVLV","YETI",
    "HALO","SKYW","FNKO","PUBM","MGNI",
    "NVDA","META","AMZN","GOOGL","MSFT","AAPL",
    "LLY","AVGO","ORCL","PANW","MA","V","JPM",
    "TSLA","AMD","INTC","MU","AMAT","KLAC",
]

ASIA_TICKERS = [
    "SE","BABA","JD","PDD","NTES","BILI",
    "SHOP","INFY","WIPRO","TCS",
    "9984.T","6758.T","7203.T",
    "005930.KS","000660.KS",
    "2330.TW","2317.TW",
]

EU_TICKERS = [
    "ASML","AZN","ARM","SAP",
    "ADYEN.AS","BESI.AS",
    "MC.PA",
]

ALL_TICKERS = list(dict.fromkeys(US_TICKERS + ASIA_TICKERS + EU_TICKERS))  # preserve order, dedupe

# --- Global State -------------------------------------------------------------
scan_state = {
    "running":   False,
    "progress":  0,
    "total":     0,
    "done":      0,
    "results":   [],
    "errors":    [],
    "last_scan": None,
    "elapsed":   0,
}
scan_lock = threading.Lock()


# --- Helpers ------------------------------------------------------------------
def safe_float(val, multiplier=1):
    try:
        if val is None:
            return None
        f = float(val)
        if f != f:          # NaN check
            return None
        return round(f * multiplier, 4)
    except Exception:
        return None


def fmt_cap(val):
    if val is None:
        return None
    try:
        v = float(val)
        if v >= 1e12: return f"${v/1e12:.2f}T"
        if v >= 1e9:  return f"${v/1e9:.1f}B"
        if v >= 1e6:  return f"${v/1e6:.0f}M"
        return f"${v:,.0f}"
    except Exception:
        return None


# --- Scoring Engine ------------------------------------------------------------
def score_stock(d: dict) -> dict:
    g = v = q = 0.0

    rev_g  = d.get("revenue_growth")  or 0
    earn_g = d.get("earnings_growth") or 0
    eps_g  = d.get("eps_growth")      or 0
    mom6   = d.get("price_mom_6m")    or 0
    mom12  = d.get("price_mom_12m")   or 0

    # Growth (0-40)
    g += min(max(rev_g,  0) * 0.25, 15)
    g += min(max(earn_g, 0) * 0.20, 12)
    g += min(max(eps_g,  0) * 0.15,  8)
    g += min(max(mom6,   0) * 0.04,  3)
    g += min(max(mom12,  0) * 0.03,  2)

    # Value (0-30)
    pe  = d.get("pe_ratio")  or 0
    peg = d.get("peg_ratio") or 0
    pe  = pe  if pe  > 0 else 999
    peg = peg if peg > 0 else 999
    v += max(0, 15 - pe * 0.15)
    if   peg < 1:   v += 15
    elif peg < 1.5: v += 10
    elif peg < 2:   v +=  5

    # Quality (0-30)
    roe     = d.get("roe")          or 0
    de      = d.get("debt_equity")  or 0
    de      = de if de > 0 else 999
    fcf     = d.get("fcf")          or 0
    insider = d.get("insider_own")  or 0

    q += min(max(roe, 0) * 0.20, 10)
    q += max(0, 8 - de * 0.8)
    q += 4 if fcf > 0 else 0
    if   insider > 0.10: q += 5
    elif insider > 0.05: q += 3

    total = round(g + v + q, 1)
    return {
        **d,
        "growth_score":  round(g, 1),
        "value_score":   round(v, 1),
        "quality_score": round(q, 1),
        "total_score":   total,
    }


# --- Fetch Single Ticker -------------------------------------------------------
def fetch_ticker(ticker: str):
    """
    Returns a scored dict on success, None on failure.
    Uses yfinance .fast_info for quick fields + .info for fundamentals.
    """
    try:
        t = yf.Ticker(ticker)

        # -- Basic info (more reliable in newer yfinance) --
        try:
            info = t.info
        except Exception:
            info = {}

        # Must have a name to be useful
        name = (info.get("shortName") or info.get("longName") or "").strip()
        if not name:
            # fallback: try fast_info
            try:
                fi = t.fast_info
                name = getattr(fi, "name", "") or ""
            except Exception:
                name = ""
        if not name:
            return None

        # -- Price history for momentum --
        mom6 = mom12 = None
        try:
            hist = t.history(period="1y", auto_adjust=True, timeout=15)
            if hist is not None and len(hist) >= 21:
                cur  = float(hist["Close"].iloc[-1])
                p6m  = float(hist["Close"].iloc[-126]) if len(hist) >= 126 else float(hist["Close"].iloc[0])
                p12m = float(hist["Close"].iloc[0])
                if p6m  > 0: mom6  = round((cur - p6m)  / p6m  * 100, 2)
                if p12m > 0: mom12 = round((cur - p12m) / p12m * 100, 2)
        except Exception:
            pass

        # -- EPS growth --
        eps_growth = None
        try:
            eps_t = info.get("trailingEps")
            eps_f = info.get("forwardEps")
            if eps_t and eps_f and eps_t != 0:
                eps_growth = round((float(eps_f) - float(eps_t)) / abs(float(eps_t)) * 100, 2)
        except Exception:
            pass

        # -- Revenue / Earnings growth (yfinance returns as ratio e.g. 0.23 = 23%) --
        rev_raw  = info.get("revenueGrowth")
        earn_raw = info.get("earningsGrowth")

        # Some versions return percentage directly (>1), some return ratio (<1)
        def norm_growth(v):
            if v is None: return None
            v = float(v)
            if v != v: return None   # NaN
            # If abs value < 10, treat as ratio and multiply by 100
            return round(v * 100 if abs(v) < 10 else v, 2)

        rev_g  = norm_growth(rev_raw)
        earn_g = norm_growth(earn_raw)
        roe_raw = info.get("returnOnEquity")
        roe    = norm_growth(roe_raw)

        # -- Market cap --
        mkt_cap = info.get("marketCap")
        try:
            mkt_cap = int(mkt_cap) if mkt_cap else None
        except Exception:
            mkt_cap = None

        # -- Build row --
        row = {
            "ticker":          ticker,
            "name":            name[:38],
            "exchange":        str(info.get("exchange") or info.get("quoteType") or "--"),
            "sector":          str(info.get("sector")   or info.get("sectorDisp")   or "Other"),
            "industry":        str((info.get("industry") or info.get("industryDisp") or "--"))[:36],
            "country":         str(info.get("country")  or "--"),
            "market_cap":      mkt_cap,
            "market_cap_fmt":  fmt_cap(mkt_cap),
            "revenue_growth":  rev_g,
            "earnings_growth": earn_g,
            "eps_growth":      eps_growth,
            "pe_ratio":        safe_float(info.get("trailingPE") or info.get("forwardPE")),
            "peg_ratio":       safe_float(info.get("pegRatio")),
            "roe":             roe,
            "debt_equity":     safe_float(info.get("debtToEquity")),
            "fcf":             safe_float(info.get("freeCashflow")),
            "fcf_fmt":         fmt_cap(info.get("freeCashflow")),
            "insider_own":     safe_float(info.get("heldPercentInsiders")),
            "inst_own":        safe_float(info.get("heldPercentInstitutions")),
            "price_mom_6m":    mom6,
            "price_mom_12m":   mom12,
            "price":           safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
            "volume":          info.get("averageVolume"),
            "currency":        str(info.get("currency") or "USD"),
            "fetched_at":      datetime.now().strftime("%H:%M:%S"),
        }
        return score_stock(row)

    except Exception as e:
        # Record error for /api/debug but don't crash
        with scan_lock:
            scan_state["errors"].append(f"{ticker}: {str(e)[:80]}")
        return None


# --- Background Scanner --------------------------------------------------------
def run_scan():
    with scan_lock:
        if scan_state["running"]:
            return
        scan_state["running"]  = True
        scan_state["progress"] = 0
        scan_state["done"]     = 0
        scan_state["total"]    = len(ALL_TICKERS)
        scan_state["results"]  = []
        scan_state["errors"]   = []

    start = time.time()

    def fetch_and_update(ticker):
        result = fetch_ticker(ticker)
        with scan_lock:
            scan_state["done"] += 1
            pct = round(scan_state["done"] / scan_state["total"] * 100)
            scan_state["progress"] = pct
            if result is not None:
                scan_state["results"].append(result)

    # -- BUG FIX: reduced workers to avoid Yahoo rate-limiting --
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(fetch_and_update, t) for t in ALL_TICKERS]
        for _ in as_completed(futs):
            pass

    elapsed = round(time.time() - start, 1)
    with scan_lock:
        scan_state["running"]   = False
        scan_state["last_scan"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        scan_state["elapsed"]   = elapsed
        scan_state["progress"]  = 100


# --- Routes -------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/scan/start", methods=["POST"])
def api_start_scan():
    with scan_lock:
        already = scan_state["running"]
    if already:
        return jsonify({"ok": False, "msg": "Scan already running"})
    threading.Thread(target=run_scan, daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/scan/status")
def api_scan_status():
    with scan_lock:
        return jsonify({
            "running":   scan_state["running"],
            "progress":  scan_state["progress"],
            "done":      scan_state["done"],
            "total":     scan_state["total"],
            "count":     len(scan_state["results"]),
            "errors":    len(scan_state["errors"]),
            "last_scan": scan_state["last_scan"],
            "elapsed":   scan_state["elapsed"],
        })


@app.route("/api/debug")
def api_debug():
    """Show errors that occurred during scan"""
    with scan_lock:
        return jsonify({
            "total_results": len(scan_state["results"]),
            "total_errors":  len(scan_state["errors"]),
            "errors":        scan_state["errors"][:50],
            "sample":        scan_state["results"][:3] if scan_state["results"] else [],
        })


@app.route("/api/stocks")
def api_stocks():
    sector    = request.args.get("sector",    "All")
    search    = request.args.get("search",    "").strip().lower()
    cap_max   = request.args.get("cap_max",   "all")
    min_score = float(request.args.get("min_score", "0") or "0")
    sort_by   = request.args.get("sort_by",   "total_score")
    sort_dir  = request.args.get("sort_dir",  "desc")
    limit     = int(request.args.get("limit", "100") or "100")

    CAP_MAP = {
        "500m": 500e6, "1b": 1e9, "2b": 2e9,
        "5b":   5e9,   "10b": 10e9, "all": float("inf"),
    }
    cap_limit = CAP_MAP.get(cap_max, float("inf"))

    with scan_lock:
        data = list(scan_state["results"])

    out = []
    for d in data:
        # -- BUG FIX: search filter --
        if search:
            t_match = search in (d.get("ticker") or "").lower()
            n_match = search in (d.get("name")   or "").lower()
            if not t_match and not n_match:
                continue

        # -- BUG FIX: sector filter --
        if sector != "All":
            if (d.get("sector") or "Other") != sector:
                continue

        # -- BUG FIX: market cap filter -- don't filter out stocks with no market cap data --
        mc = d.get("market_cap")
        if mc is not None and cap_limit < float("inf"):
            if mc > cap_limit:
                continue
        # (if mc is None, we let it through so user can still see the stock)

        # -- score filter --
        if (d.get("total_score") or 0) < min_score:
            continue

        out.append(d)

    # -- BUG FIX: robust sort --
    reverse = (sort_dir == "desc")
    def sort_key(x):
        val = x.get(sort_by)
        if val is None:
            return float("-inf") if reverse else float("inf")
        try:
            return float(val)
        except Exception:
            return str(val)

    out.sort(key=sort_key, reverse=reverse)
    return jsonify({"stocks": out[:limit], "total": len(out)})


@app.route("/api/sectors")
def api_sectors():
    with scan_lock:
        sectors = sorted({
            d.get("sector") or "Other"
            for d in scan_state["results"]
            if d.get("sector")
        })
    return jsonify({"sectors": sectors})


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    print("\n" + "=" * 55)
    print("  Growth Stock Scanner -- Web App")
    print("=" * 55)
    print(f"  Open your browser:  http://localhost:{port}")
    print("  Press Ctrl+C to stop")
    print("=" * 55 + "\n")
    app.run(debug=False, host="0.0.0.0", port=port, threaded=True)
