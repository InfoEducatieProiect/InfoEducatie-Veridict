#!/usr/bin/env python3
"""
Web plagiarism detection — Gemini Flash grounding + hybrid similarity (Cosine & Sentence Containment).
stdin JSON: {"text": "..."}  → stdout JSON only (diagnostics on stderr).
"""
from __future__ import annotations

import concurrent.futures
import json
import math
import os
import re
import sys
from collections import Counter
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

try:
    from google import genai
    from google.genai import types

    _GENAI_DISPONIBIL = True
except ImportError:
    _GENAI_DISPONIBIL = False
    genai = None  # type: ignore
    types = None  # type: ignore

_URL_RE = re.compile(
    r"https?://[^\s\)\]\"\'<>\u201d\u201c]+",
    re.IGNORECASE,
)
_VERTEX_PROXY_RE = re.compile(
    r"vertexaisearch\.cloud\.google\.com|grounding-api-redirect",
    re.IGNORECASE,
)
_INVALID_HOST_FRAGMENTS = ("w3.org", "schema.org", "xmlns.com", "purl.org")
_WRAP_HOST_FRAGMENTS = (
    "consent.google.com",
    "google.com/url",
    "google.ro/url",
    "vertexaisearch.cloud.google.com",
    "grounding-api-redirect",
    "webcache.googleusercontent",
)
_REDIRECT_QUERY_KEYS = ("continue", "url", "q", "u", "dest")
_MAX_PARALLEL_SOURCES = 10
_DOWNLOAD_TIMEOUT_SEC = 6


def _log(msg: str) -> None:
    print(f"[plagiat] {msg}", file=sys.stderr, flush=True)


def _curata_si_tokenizeaza(text: str) -> list[str]:
    text_normalizat = text.replace("\xa0", " ").replace("\n", " ").lower()
    text_curat = re.sub(r"[^\w\s]", "", text_normalizat)
    return [cuvant for cuvant in text_curat.split() if len(cuvant) > 2]


def calculeaza_cosinus_similitudine(text_a: str, text_b: str) -> float:
    """
    Calculează un scor hibrid performant: îmbină Similitudinea Cosinus nativă
    cu un test de conținere prin N-grame de cuvinte (Word Bigrams).
    Curăță automat zgomotul de Wikipedia (ex: [1], [modificare]) pentru a preveni eșecurile.
    """
    # 1. Pregătire și curățare text_b de paranteze pătrate/adnotări web specifice Wikipedia
    text_b_filtrat = re.sub(r'\[[^\]]*\]', ' ', text_b)

    cuvinte_a = _curata_si_tokenizeaza(text_a)
    cuvinte_b = _curata_si_tokenizeaza(text_b_filtrat)
    
    # --- A. Similitudinea Cosinus Clasică ---
    scor_cosinus = 0.0
    if cuvinte_a and cuvinte_b:
        vector_a = Counter(cuvinte_a)
        vector_b = Counter(cuvinte_b)
        toate = set(vector_a.keys()).union(set(vector_b.keys()))
        dot_product = sum(vector_a[c] * vector_b[c] for c in toate)
        magnitudine_a = math.sqrt(sum(vector_a[c] ** 2 for c in vector_a))
        magnitudine_b = math.sqrt(sum(vector_b[c] ** 2 for c in vector_b))
        if magnitudine_a > 0 and magnitudine_b > 0:
            scor_cosinus = dot_product / (magnitudine_a * magnitudine_b)

    # --- B. Algoritmul de Conținere prin N-grame (Garanție surse masive / Wikipedia) ---
    # Împărțim textul în bigrame (perechi de cuvinte succesive) pentru flexibilitate la punctuație
    scor_containment = 0.0
    if len(cuvinte_a) >= 2 and len(cuvinte_b) >= 2:
        ngrams_a = [tuple(cuvinte_a[i:i+2]) for i in range(len(cuvinte_a) - 1)]
        ngrams_b = set(tuple(cuvinte_b[i:i+2]) for i in range(len(cuvinte_b) - 1))
        
        if ngrams_a:
            gasite = sum(1 for ng in ngrams_a if ng in ngrams_b)
            scor_containment = gasite / len(ngrams_a)
    elif cuvinte_a and cuvinte_b:
        # Fallback instanțial pentru texte ultra-scurte
        set_b = set(cuvinte_b)
        gasite = sum(1 for w in cuvinte_a if w in set_b)
        scor_containment = gasite / len(cuvinte_a)

    # Returnăm cel mai bun rezultat dintre cele două strategii
    return float(max(scor_cosinus, scor_containment))


def _api_key() -> str:
    for name in (
        "GEMINI_API_KEY",
        "NEXT_PUBLIC_GEMINI_API_KEY",
        "GOOGLE_API_KEY",
    ):
        val = (os.environ.get(name) or "").strip()
        if val:
            _log(f"API key loaded from {name} (len={len(val)})")
            return val
    _log("API key missing: checked GEMINI_API_KEY, NEXT_PUBLIC_GEMINI_API_KEY, GOOGLE_API_KEY")
    return ""


def _curata_si_extrage_url_real(url: str) -> str:
    if not url or not isinstance(url, str):
        return ""

    try:
        url_decodat = unquote(url).strip()
    except Exception:
        url_decodat = url.strip()

    raw = url_decodat.rstrip(".,;")
    while raw.endswith(")") and raw.count(")") > raw.count("("):
        raw = raw[:-1].rstrip(".,;")

    if not raw.startswith(("http://", "https://")):
        return ""

    try:
        parsed = urlparse(raw)
        host = (parsed.netloc or "").lower()
        host_path = f"{host}{parsed.path or ''}".lower()

        if "google.com/search" in host_path or "google.ro/search" in host_path:
            return ""

        for fragment in _INVALID_HOST_FRAGMENTS:
            if fragment in host_path:
                return ""

        if any(wrap in host_path for wrap in _WRAP_HOST_FRAGMENTS):
            qs = parse_qs(parsed.query, keep_blank_values=False)
            for key in _REDIRECT_QUERY_KEYS:
                vals = qs.get(key)
                if not vals:
                    continue
                candidate = unquote(str(vals[0])).strip()
                if candidate.startswith(("http://", "https://")):
                    nested = _curata_si_extrage_url_real(candidate)
                    if nested:
                        return nested

        if parsed.netloc:
            return urlunparse(
                (parsed.scheme or "https", parsed.netloc, parsed.path or "/", "", "", "")
            )
    except Exception as exc:
        _log(f"URL unwrap error ({raw[:60]}): {exc}")
    return raw


def _extrage_urluri_din_text(text: str) -> list[str]:
    found: list[str] = []
    for raw in _URL_RE.findall(text or ""):
        clean = _curata_si_extrage_url_real(raw)
        if clean and clean not in found:
            found.append(clean)
    return found


def _append_url(linkuri: list[str], url: str | None) -> None:
    clean = _curata_si_extrage_url_real(url or "")
    if clean and clean not in linkuri:
        linkuri.append(clean)


def _extrage_din_grounding_metadata(metadata: Any, linkuri: list[str]) -> None:
    if metadata is None:
        return

    chunks = getattr(metadata, "grounding_chunks", None)
    if chunks is not None:
        for chunk in chunks:
            web = getattr(chunk, "web", None)
            if web is None:
                continue
            uri = getattr(web, "uri", None) or getattr(web, "url", None)
            title = getattr(web, "title", None)
            _append_url(linkuri, uri)
            if title and str(title).startswith("http"):
                _append_url(linkuri, str(title))

    supports = getattr(metadata, "grounding_supports", None)
    if supports:
        for support in supports:
            for idx in getattr(support, "grounding_chunk_indices", None) or []:
                if chunks and 0 <= idx < len(chunks):
                    web = getattr(chunks[idx], "web", None)
                    if web:
                        _append_url(linkuri, getattr(web, "uri", None) or getattr(web, "url", None))

    entry = getattr(metadata, "search_entry_point", None)
    if entry is not None:
        rendered = getattr(entry, "rendered_content", None) or str(entry)
        for u in _extrage_urluri_din_text(str(rendered)):
            _append_url(linkuri, u)


def _extrage_din_raspuns_complet(raspuns: Any) -> list[str]:
    linkuri: list[str] = []

    text_raspuns = getattr(raspuns, "text", None) or ""
    if text_raspuns:
        for u in _extrage_urluri_din_text(text_raspuns):
            _append_url(linkuri, u)

    candidates = getattr(raspuns, "candidates", None) or []
    for cand in candidates:
        gm = getattr(cand, "grounding_metadata", None)
        if gm is not None:
            _extrage_din_grounding_metadata(gm, linkuri)

        content = getattr(cand, "content", None)
        if content is None:
            continue
        parts = getattr(content, "parts", None) or []
        for part in parts:
            part_text = getattr(part, "text", None) or ""
            if part_text:
                for u in _extrage_urluri_din_text(part_text):
                    _append_url(linkuri, u)
            part_gm = getattr(part, "grounding_metadata", None)
            if part_gm is not None:
                _extrage_din_grounding_metadata(part_gm, linkuri)

    return linkuri


def _fallback_gemini_fara_grounding(client: Any, text_suspect: str) -> list[str]:
    try:
        prompt = (
            "The following text may be copied from a public web page (Wikipedia, news, blog). "
            "List up to 5 full https URLs of the most likely original sources, one per line. "
            "Only output URLs, nothing else.\n\n"
            f"TEXT:\n{text_suspect[:6000]}"
        )
        raspuns = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            )
        return _extrage_din_raspuns_complet(raspuns)
    except Exception as exc:
        _log(f"fallback generate_content failed: {exc}")
        return []


def gaseste_surse_cu_gemini_search(text_suspect: str) -> list[str]:
    if not _GENAI_DISPONIBIL:
        return []

    key = _api_key()
    if not key:
        return []

    text_trim = (text_suspect or "").strip()

    try:
        client = genai.Client(api_key=key)
        instructiune = (
            "Find the exact public web sources (Wikipedia, news, encyclopedia, blog) "
            "where this text likely originated. Use Google Search grounding. "
            "Prioritize wikipedia.org if the prose matches an encyclopedia article.\n\n"
            f"TEXT TO ANALYZE:\n{text_trim[:8000]}"
        )

        raspuns = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=instructiune,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

        linkuri = _extrage_din_raspuns_complet(raspuns)
        if not linkuri:
            linkuri = _fallback_gemini_fara_grounding(client, text_trim)

        return linkuri
    except Exception as exc:
        _log(f"Gemini API error: {exc}")
        return []


def _descarca_si_curata_pagina(url: str) -> tuple[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
    }
    url_start = _curata_si_extrage_url_real(url)
    if not url_start:
        return "", ""

    url_rezolvat = url_start
    try:
        raspuns = requests.get(
            url_start,
            headers=headers,
            timeout=_DOWNLOAD_TIMEOUT_SEC,
            allow_redirects=True,
        )

        if raspuns.url:
            url_rezolvat = _curata_si_extrage_url_real(raspuns.url) or url_start

        if any(w in (url_rezolvat or "").lower() for w in ("consent.google.com", "accounts.google.com")):
            return "", ""

        if raspuns.status_code == 200:
            soup = BeautifulSoup(raspuns.text, "html.parser")
            for element in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
                element.decompose()
            text = soup.get_text(separator=" ", strip=True)
            return text, url_rezolvat
    except Exception:
        pass
    return "", url_rezolvat


def ruleaza_verificare_plagiat_globala(text_elev: str) -> dict[str, Any]:
    _log("=== Starting Asynchronous High-Speed Web Plagiarism Scan ===")
    surse_web = gaseste_surse_cu_gemini_search(text_elev)

    if not surse_web:
        return {
            "verdict": "TEXT AUTENTIC: Nu s-au extras URL-uri din Google Grounding.",
            "scor_maxim": 0.0,
            "sursa_principala": None,
            "plagiarism_urls": [],
            "grounding_ok": False,
        }

    targets: list[str] = []
    for raw_u in surse_web[:_MAX_PARALLEL_SOURCES]:
        clean_u = _curata_si_extrage_url_real(raw_u)
        if clean_u and clean_u not in targets:
            targets.append(clean_u)

    if not targets:
        return {
            "verdict": "TEXT AUTENTIC: Nu s-au extras URL-uri valide din Google Grounding.",
            "scor_maxim": 0.0,
            "sursa_principala": None,
            "plagiarism_urls": [],
            "grounding_ok": True,
        }

    raport_surse: list[dict[str, Any]] = []
    scor_maxim = 0.0
    sursa_principala: str | None = None
    skipped_empty = 0
    skipped_zero_pct = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=_MAX_PARALLEL_SOURCES) as executor:
        viitoare_sarcini = {
            executor.submit(_descarca_si_curata_pagina, url): url for url in targets
        }

        for viitor in concurrent.futures.as_completed(viitoare_sarcini):
            text_extern, url_curat = viitor.result()
            url_display = _curata_si_extrage_url_real(url_curat) or url_curat

            if not text_extern.strip() or not url_display:
                skipped_empty += 1
                continue

            scor = calculeaza_cosinus_similitudine(text_elev, text_extern)
            
            # 🔥 RERANKING AUTHORITY BOOST: Dacă sursa este Wikipedia și avem un match puternic (>55%),
            # îi aplicăm un bonus la scorul de sortare structurală (+6%) pentru a devansa clonele tip Prezi/Scribd.
            scor_clasare = scor
            if "wikipedia.org" in url_display.lower() and scor >= 0.55:
                scor_clasare = min(1.0, scor + 0.06)

            pct = round(scor_clasare * 100, 1)

            if pct <= 0.0:
                skipped_zero_pct += 1
                continue

            raport_surse.append({
                "url": url_display, 
                "scor": pct,
                "_raw_scor": scor  # Ținem minte scorul original intern
            })
            
            if scor_clasare > scor_maxim:
                scor_maxim = scor_clasare
                sursa_principala = url_display

    # Sortăm după noul sistem hibrid ajustat cu rang de autoritate
    raport_surse.sort(key=lambda x: x["scor"], reverse=True)

    if not raport_surse:
        return {
            "verdict": "TEXT AUTENTIC: Nu s-au detectat potriviri valide in indexul public online.",
            "scor_maxim": 0.0,
            "sursa_principala": None,
            "plagiarism_urls": [],
            "grounding_ok": True,
        }

    # Curățăm proprietățile auxiliare interne folosite la sortare
    for r in raport_surse:
        r.pop("_raw_scor", None)

    if scor_maxim >= 0.40:
        verdict = f"❌ ALERTĂ DETECTATĂ: Text preluat de pe internet (Similitudine Cosinus: {scor_maxim * 100:.1f}%)."
    elif scor_maxim >= 0.15:
        verdict = f"❓ SUSPECT: Structură parțial similară sau parafrazare inteligentă ({scor_maxim * 100:.1f}%)."
    else:
        verdict = f"✅ TEXT AUTENTIC: Text original în raport cu indexul public online ({scor_maxim * 100:.1f}%)."

    return {
        "verdict": verdict,
        "scor_maxim": round(scor_maxim, 4),
        "sursa_principala": sursa_principala,
        "plagiarism_urls": raport_surse[:10],
        "grounding_ok": True,
    }


def _citeste_text_din_stdin() -> str:
    raw = sys.stdin.read()
    if not raw.strip():
        return ""
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            return raw.strip()
        return str(payload.get("text", "") or "").strip()
    except json.JSONDecodeError:
        return raw.strip()


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def main() -> None:
    _configure_utf8_streams()

    if len(sys.argv) > 1 and sys.argv[1] not in ("--stdin", "-"):
        text_elev = sys.argv[1]
    else:
        text_elev = _citeste_text_din_stdin()

    text_verificabil = re.sub(r"[\s\xa0\u200b\u200c\u200d]+", " ", text_elev).strip()

    if not text_verificabil or len(text_verificabil) < 5:
        json.dump({
            "verdict": "Textul transmis lipsește sau conține doar spații.",
            "scor_maxim": 0.0,
            "sursa_principala": None,
            "plagiarism_urls": [],
            "grounding_ok": False
        }, sys.stdout, ensure_ascii=False)
        sys.exit(0)

    rezultat = ruleaza_verificare_plagiat_globala(text_verificabil)
    json.dump(rezultat, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()