#!/usr/bin/env python3
"""
Web plagiarism detection — Gemini Flash grounding + cosine similarity.
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
    cuvinte_a = _curata_si_tokenizeaza(text_a)
    cuvinte_b = _curata_si_tokenizeaza(text_b)
    if not cuvinte_a or not cuvinte_b:
        return 0.0

    vector_a = Counter(cuvinte_a)
    vector_b = Counter(cuvinte_b)
    toate = set(vector_a.keys()).union(set(vector_b.keys()))
    dot_product = sum(vector_a[c] * vector_b[c] for c in toate)
    magnitudine_a = math.sqrt(sum(vector_a[c] ** 2 for c in vector_a))
    magnitudine_b = math.sqrt(sum(vector_b[c] ** 2 for c in vector_b))
    if magnitudine_a == 0 or magnitudine_b == 0:
        return 0.0
    return dot_product / (magnitudine_a * magnitudine_b)


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
    """
    Unwrap Google proxy/consent/redirect frames; strip tracking query strings;
    discard invalid namespaces (w3.org, etc.).
    """
    if not url or not isinstance(url, str):
        return ""

    raw = url.strip().rstrip(".,;)")
    if not raw.startswith(("http://", "https://")):
        return ""

    try:
        parsed = urlparse(raw)
        host = (parsed.netloc or "").lower()
        host_path = f"{host}{parsed.path or ''}".lower()

        for fragment in _INVALID_HOST_FRAGMENTS:
            if fragment in host_path:
                _log(f"Discarded invalid namespace URL: {raw[:90]}")
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
                        _log(f"Unwrapped redirect ({key}) -> {nested[:90]}")
                        return nested

        if host and "wikipedia.org" in host:
            return urlunparse(
                (parsed.scheme or "https", parsed.netloc, parsed.path.rstrip("/") or "/", "", "", "")
            )

        if parsed.netloc:
            return urlunparse(
                (parsed.scheme or "https", parsed.netloc, parsed.path or "/", "", "", "")
            )
        return raw
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
        _log("grounding_metadata is None")
        return

    _log(f"grounding_metadata type={type(metadata).__name__}")

    chunks = getattr(metadata, "grounding_chunks", None)
    if chunks is None:
        _log("grounding_chunks is None")
    else:
        _log(f"grounding_chunks count={len(chunks)}")
        for i, chunk in enumerate(chunks):
            web = getattr(chunk, "web", None)
            if web is None:
                _log(f"  chunk[{i}] web=None")
                continue
            uri = getattr(web, "uri", None) or getattr(web, "url", None)
            title = getattr(web, "title", None)
            domain = getattr(web, "domain", None)
            _log(f"  chunk[{i}] uri={uri!r} title={title!r} domain={domain!r}")
            _append_url(linkuri, uri)
            if title and str(title).startswith("http"):
                _append_url(linkuri, str(title))

    supports = getattr(metadata, "grounding_supports", None)
    if supports:
        _log(f"grounding_supports count={len(supports)}")
        for i, support in enumerate(supports):
            seg = getattr(support, "segment", None)
            if seg:
                _log(f"  support[{i}] segment text len={len(getattr(seg, 'text', '') or '')}")
            for idx in getattr(support, "grounding_chunk_indices", None) or []:
                if chunks and 0 <= idx < len(chunks):
                    web = getattr(chunks[idx], "web", None)
                    if web:
                        _append_url(linkuri, getattr(web, "uri", None) or getattr(web, "url", None))

    queries = getattr(metadata, "web_search_queries", None)
    if queries:
        _log(f"web_search_queries={list(queries)}")

    entry = getattr(metadata, "search_entry_point", None)
    if entry is not None:
        rendered = getattr(entry, "rendered_content", None) or str(entry)
        _log(f"search_entry_point rendered len={len(str(rendered))}")
        for u in _extrage_urluri_din_text(str(rendered)):
            _append_url(linkuri, u)


def _extrage_din_raspuns_complet(raspuns: Any) -> list[str]:
    linkuri: list[str] = []

    text_raspuns = getattr(raspuns, "text", None) or ""
    if text_raspuns:
        _log(f"response.text len={len(text_raspuns)}")
        for u in _extrage_urluri_din_text(text_raspuns):
            _append_url(linkuri, u)

    candidates = getattr(raspuns, "candidates", None) or []
    _log(f"candidates count={len(candidates)}")
    for ci, cand in enumerate(candidates):
        gm = getattr(cand, "grounding_metadata", None)
        if gm is not None:
            _log(f"candidate[{ci}] has grounding_metadata")
            _extrage_din_grounding_metadata(gm, linkuri)
        else:
            _log(f"candidate[{ci}] grounding_metadata=None")

        content = getattr(cand, "content", None)
        if content is None:
            continue
        parts = getattr(content, "parts", None) or []
        for pi, part in enumerate(parts):
            part_text = getattr(part, "text", None) or ""
            if part_text:
                for u in _extrage_urluri_din_text(part_text):
                    _append_url(linkuri, u)
            # Some SDK versions attach grounding inline on parts
            part_gm = getattr(part, "grounding_metadata", None)
            if part_gm is not None:
                _log(f"candidate[{ci}] part[{pi}] inline grounding_metadata")
                _extrage_din_grounding_metadata(part_gm, linkuri)

    return linkuri


def _fallback_gemini_fara_grounding(client: Any, text_suspect: str) -> list[str]:
    """Second pass: ask model to list source URLs explicitly (no Search tool)."""
    _log("fallback: requesting explicit URLs in model text (no grounding tool)")
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
        _log("google-genai not installed — pip install google-genai")
        return []

    key = _api_key()
    if not key:
        return []

    text_trim = (text_suspect or "").strip()
    _log(f"text_suspect char_count={len(text_trim)}")

    try:
        client = genai.Client(api_key=key)
        _log("genai.Client initialized successfully")

        instructiune = (
            "Find the exact public web sources (Wikipedia, news, encyclopedia, blog) "
            "where this text likely originated. Use Google Search grounding. "
            "Prioritize wikipedia.org if the prose matches an encyclopedia article.\n\n"
            f"TEXT TO ANALYZE:\n{text_trim[:8000]}"
        )

        _log("calling generate_content with google_search tool (gemini-2.5-flash)")
        raspuns = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=instructiune,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

        linkuri = _extrage_din_raspuns_complet(raspuns)
        _log(f"URLs after grounding extraction: {len(linkuri)}")
        for u in linkuri[:5]:
            _log(f"  -> {u[:100]}")

        if not linkuri:
            linkuri = _fallback_gemini_fara_grounding(client, text_trim)
            _log(f"URLs after text fallback: {len(linkuri)}")

        return linkuri
    except Exception as exc:
        _log(f"Gemini API error: {type(exc).__name__}: {exc}")
        return []


def _descarca_si_curata_pagina(url: str) -> tuple[str, str]:
    """
    Parallel worker: unwrap URL, follow redirects, scrape destination HTML.
    Returns (extracted_text, final_clean_url).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
    }
    url_start = _curata_si_extrage_url_real(url)
    if not url_start:
        return "", ""

    url_rezolvat = url_start
    try:
        _log(f"Parallel fetch: {url_start[:75]}...")
        raspuns = requests.get(
            url_start,
            headers=headers,
            timeout=_DOWNLOAD_TIMEOUT_SEC,
            allow_redirects=True,
        )

        if raspuns.url:
            url_rezolvat = _curata_si_extrage_url_real(raspuns.url) or url_start
            if _VERTEX_PROXY_RE.search(url) and not _VERTEX_PROXY_RE.search(url_rezolvat):
                _log(f" -> Unmasked via HTTP redirect: {url_rezolvat[:90]}")
            else:
                _log(f" -> Landed on: {url_rezolvat[:90]}")

        if any(w in (url_rezolvat or "").lower() for w in ("consent.google.com", "accounts.google.com")):
            _log(" -> Consent/login page detected; skipping scrape")
            return "", ""

        if raspuns.status_code == 200:
            soup = BeautifulSoup(raspuns.text, "html.parser")
            for element in soup(
                ["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]
            ):
                element.decompose()
            text = soup.get_text(separator=" ", strip=True)
            _log(f" -> extracted chars={len(text)}")
            return text, url_rezolvat
    except Exception as exc:
        _log(f"Parallel download failed for {url_start[:50]}: {exc}")
    return "", url_rezolvat


def ruleaza_verificare_plagiat_globala(text_elev: str) -> dict[str, Any]:
    _log("=== Starting Asynchronous High-Speed Web Plagiarism Scan ===")
    surse_web = gaseste_surse_cu_gemini_search(text_elev)

    if not surse_web:
        return {
            "verdict": (
                "TEXT AUTENTIC (sau scan incomplet): Nu s-au extras URL-uri din Google Grounding. "
                "Verifica GEMINI_API_KEY și logurile stderr."
            ),
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
            "verdict": (
                "TEXT AUTENTIC: Nu s-au extras URL-uri valide din Google Grounding "
                "(doar proxy-uri sau domenii filtrate)."
            ),
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

    _log(
        f"Launching ThreadPoolExecutor for {len(targets)} clean sources "
        f"(max_workers={_MAX_PARALLEL_SOURCES})..."
    )
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
            pct = round(scor * 100, 1)

            if pct <= 0.0:
                skipped_zero_pct += 1
                _log(f"Dropped 0% match: {url_display[:80]}")
                continue

            raport_surse.append({"url": url_display, "scor": pct})
            if scor > scor_maxim:
                scor_maxim = scor
                sursa_principala = url_display

    raport_surse.sort(key=lambda x: x["scor"], reverse=True)
    _log(
        f"Pool complete. Valid hits: {len(raport_surse)}, max={scor_maxim:.4f}, "
        f"skipped_empty={skipped_empty}, skipped_0pct={skipped_zero_pct}"
    )

    if not raport_surse:
        return {
            "verdict": (
                "TEXT AUTENTIC: Nu s-au detectat potriviri valide in indexul public online."
            ),
            "scor_maxim": 0.0,
            "sursa_principala": None,
            "plagiarism_urls": [],
            "grounding_ok": True,
        }

    este_plagiat = scor_maxim >= 0.40
    if este_plagiat:
        verdict = (
            f"ALERTA DETECTATA: Text preluat de pe internet "
            f"(Similitudine Cosinus: {scor_maxim * 100:.1f}%)."
        )
    elif scor_maxim >= 0.20:
        verdict = (
            f"SUSPECT: Structură parțial similară sau parafrazare "
            f"({scor_maxim * 100:.1f}%)."
        )
    else:
        verdict = (
            f"TEXT AUTENTIC: Text original față de sursa online "
            f"({scor_maxim * 100:.1f}%)."
        )

    return {
        "verdict": verdict,
        "scor_maxim": round(scor_maxim, 4),
        "sursa_principala": sursa_principala,
        "plagiarism_urls": raport_surse[:10],
        "grounding_ok": True,
    }


def _citeste_text_din_stdin() -> str:
    """Next.js sends JSON: {"text": "..."} on stdin — read full buffer once."""
    raw = sys.stdin.read()
    if not raw.strip():
        _log("stdin buffer empty")
        return ""
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            _log("stdin JSON is not an object; treating as raw text")
            return raw.strip()
        text = str(payload.get("text", "") or "").strip()
        _log(f"stdin JSON parsed; text key len={len(text)}")
        return text
    except json.JSONDecodeError as exc:
        _log(f"stdin JSON parse failed ({exc}); using raw buffer")
        return raw.strip()


def _configure_utf8_streams() -> None:
    """Avoid Windows cp1252 crashes when piping Romanian text to Node.js."""
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

    # Production path: Node spawns with --stdin and writes JSON payload
    if len(sys.argv) > 1 and sys.argv[1] not in ("--stdin", "-"):
        text_elev = sys.argv[1]
        _log(f"CLI arg mode; text len={len(text_elev)}")
    else:
        text_elev = _citeste_text_din_stdin()

    if not text_elev.strip():
        json.dump({"error": "empty_text"}, sys.stdout, ensure_ascii=False)
        sys.exit(1)

    rezultat = ruleaza_verificare_plagiat_globala(text_elev)
    json.dump(rezultat, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
