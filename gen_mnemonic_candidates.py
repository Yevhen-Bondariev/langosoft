#!/usr/bin/env python3
"""
Generate mnemonic sound-alike candidates for Italian vocabulary.

Two-pass algorithm per Italian word:
  1. Character prefix match  (spelling similarity)
  2. Phoneme prefix match    (sound similarity via Italian rules + CMU dict)

Scoring:
  Character consecutive  → matched_chars   × 10
  Character one-gap      → matched_chars   × 8
  Phoneme  consecutive   → matched_phonemes × 20   (higher weight = sound trumps spelling)
  Phoneme  one-gap       → matched_phonemes × 16
  Tiebreak: word frequency rank (lower = more common)

Usage:
  python gen_mnemonic_candidates.py [--book-id 5] [--api http://localhost:5000]
"""

import argparse
import bisect
import json
import os
import re
import ssl
import subprocess
import sys
import unicodedata
import urllib.request

# ── SSL fix (Windows Python often fails HTTPS cert verification) ───────────────
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

# ── Constants ──────────────────────────────────────────────────────────────────
NORVIG_URL   = "https://www.norvig.com/ngrams/count_1w.txt"
NORVIG_CACHE = "norvig_10k.txt"
TOP_K        = 10_000
OUTPUT       = "frontend/public/mnemonic-candidates.json"

CHAR_SCORE   = 10   # per consecutive character matched
CHAR_GAP     = 8    # per character matched with one-letter gap
PHON_SCORE   = 18   # per consecutive phoneme matched  (>CHAR so sound beats spelling at equal depth)
PHON_GAP     = 8    # per phoneme with one-phoneme gap (= CHAR_GAP so it never trumps a char match)


# ── NLTK / CMU Pronouncing Dictionary ─────────────────────────────────────────

CMUDICT_URL = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/cmudict.zip"

def _ensure_cmudict():
    """
    Install nltk if needed, then download cmudict using our SSL context
    (bypasses Windows cert verification failures in the NLTK downloader).
    """
    # 1. Make sure nltk is installed
    try:
        import nltk
    except ImportError:
        print("Installing nltk …")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "nltk"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import nltk

    # 2. Check if cmudict is already available
    try:
        from nltk.corpus import cmudict
        cmudict.dict()
        return
    except Exception:
        pass

    # 3. Find (or create) the nltk data corpora directory
    import zipfile
    data_dir = nltk.data.path[0]            # e.g. C:\Users\...\nltk_data
    corpora_dir = os.path.join(data_dir, "corpora")
    cmudict_dir = os.path.join(corpora_dir, "cmudict")
    os.makedirs(corpora_dir, exist_ok=True)

    if not os.path.isdir(cmudict_dir):
        zip_path = os.path.join(corpora_dir, "cmudict.zip")
        print(f"Downloading cmudict …")
        with urllib.request.urlopen(CMUDICT_URL, context=_ssl_ctx, timeout=60) as r, \
             open(zip_path, "wb") as out:
            out.write(r.read())
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(corpora_dir)
        os.remove(zip_path)
        print("cmudict ready.")

    # 4. Reload
    from nltk.corpus import cmudict
    cmudict.dict()


# ── English word list ──────────────────────────────────────────────────────────

def load_english_words() -> list[str]:
    """Download (once) and return top-10K English words — letters only, len ≥ 3."""
    if not os.path.exists(NORVIG_CACHE):
        print(f"Downloading {NORVIG_URL} …")
        with urllib.request.urlopen(NORVIG_URL, context=_ssl_ctx, timeout=30) as r, \
             open(NORVIG_CACHE, "wb") as out:
            out.write(r.read())
        print(f"Cached to {NORVIG_CACHE}")

    words: list[str] = []
    with open(NORVIG_CACHE, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= TOP_K:
                break
            parts = line.strip().split("\t")
            w = parts[0].lower().strip()
            if re.fullmatch(r"[a-z]+", w) and len(w) >= 3:
                words.append(w)
    return words


# ── Italian vocabulary ─────────────────────────────────────────────────────────

def fetch_italian_words(api: str, book_id: int) -> list[str]:
    """Return Italian word forms in reading order from the backend API."""
    url = f"{api}/api/books/{book_id}/words-ordered"
    try:
        with urllib.request.urlopen(url, context=_ssl_ctx, timeout=15) as r:
            data = json.loads(r.read())
        return [item["orig"] for item in data.get("words", [])]
    except Exception as e:
        print(f"ERROR fetching {url}: {e}", file=sys.stderr)
        return []


# ── Italian → ARPAbet phoneme rules ───────────────────────────────────────────

def _strip_to_ascii(w: str) -> str:
    """Lowercase + strip diacritics + keep only a-z."""
    w = w.lower()
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", w)


def italian_to_arpabet(word: str) -> list[str]:
    """
    Convert an Italian word to approximate ARPAbet phonemes.

    Rules applied in priority order (trigraphs → digraphs → diphthongs →
    double consonants → context-sensitive singles → vowels → consonants).
    """
    w = _strip_to_ascii(word)
    phonemes: list[str] = []
    i = 0
    n = len(w)

    while i < n:
        c  = w[i]
        c1 = w[i + 1] if i + 1 < n else ""
        c2 = w[i + 2] if i + 2 < n else ""

        # ── Trigraph ──────────────────────────────────────────────────────────
        if c == "g" and c1 == "l" and c2 == "i":           # gli → L Y
            phonemes += ["L", "Y"]; i += 3; continue

        # ── Digraphs ──────────────────────────────────────────────────────────
        if c == "c" and c1 == "h":                          # ch → K
            phonemes.append("K"); i += 2; continue
        if c == "g" and c1 == "h":                          # gh → G
            phonemes.append("G"); i += 2; continue
        if c == "g" and c1 == "n":                          # gn → N Y
            phonemes += ["N", "Y"]; i += 2; continue
        if c == "s" and c1 == "c" and c2 in "ei":          # sc + e/i → SH
            phonemes.append("SH"); i += 2; continue
        if c == "q" and c1 == "u":                          # qu → K W
            phonemes += ["K", "W"]; i += 2; continue

        # ── Diphthongs (most common Italian vowel pairs) ──────────────────────
        di = c + c1
        _diphthongs = {
            "au": ["AW"],          # paura, causa
            "ai": ["AY"],          # mai, dai
            "ei": ["EY"],          # lei, dei
            "oi": ["OY"],          # poi, noi
        }
        if di in _diphthongs:
            phonemes += _diphthongs[di]; i += 2; continue

        # ── Double consonants → skip first (Italian geminates) ────────────────
        if c1 == c and c not in "aeiou":
            i += 1; continue

        # ── Context-sensitive single letters ──────────────────────────────────
        if c == "c":                                         # c + e/i → CH, else K
            phonemes.append("CH" if c1 in "ei" else "K"); i += 1; continue
        if c == "g":                                         # g + e/i → JH, else G
            phonemes.append("JH" if c1 in "ei" else "G"); i += 1; continue
        if c == "h":                                         # h → silent
            i += 1; continue
        if c == "z":                                         # z → T S
            phonemes += ["T", "S"]; i += 1; continue

        # ── Vowels ────────────────────────────────────────────────────────────
        _vowels = {"a": "AH", "e": "EH", "i": "IY", "o": "OW", "u": "UW"}
        if c in _vowels:
            phonemes.append(_vowels[c]); i += 1; continue

        # ── Consonants (direct) ───────────────────────────────────────────────
        _cons = {
            "b": "B",  "d": "D",  "f": "F",  "j": "Y",  "k": "K",
            "l": "L",  "m": "M",  "n": "N",  "p": "P",  "r": "R",
            "s": "S",  "t": "T",  "v": "V",  "w": "W",  "x": "K",
            "y": "Y",
        }
        if c in _cons:
            phonemes.append(_cons[c]); i += 1; continue

        i += 1  # unknown char — skip

    return phonemes


# ── Phoneme prefix index ───────────────────────────────────────────────────────

def build_phoneme_index(words: list[str]) -> tuple[dict[tuple, list[str]], dict[str, int]]:
    """
    For each English word that appears in cmudict, index it under every
    phoneme prefix (first 1 phoneme, first 2, …).
    Stress numbers stripped so AH0 / AH1 / AH2 all become AH.
    Also returns word_lengths: {word: total_phoneme_count}.
    """
    from nltk.corpus import cmudict
    d = cmudict.dict()

    index: dict[tuple, list[str]] = {}
    word_lengths: dict[str, int] = {}
    for word in words:
        if word not in d:
            continue
        raw = d[word][0]                              # first pronunciation
        phonemes = [re.sub(r"\d+", "", p) for p in raw]
        word_lengths[word] = len(phonemes)
        for length in range(1, len(phonemes) + 1):
            prefix = tuple(phonemes[:length])
            index.setdefault(prefix, []).append(word)

    return index, word_lengths


# ── Scoring helpers ────────────────────────────────────────────────────────────

def _char_scores(italian: str, sorted_en: list[str]) -> dict[str, int]:
    """Character prefix scores for all matching English words."""
    iw = _strip_to_ascii(italian)
    if len(iw) < 2:
        return {}

    prefix_scores: dict[str, int] = {}
    for length in range(len(iw), 1, -1):
        p = iw[:length]
        prefix_scores[p] = max(prefix_scores.get(p, 0), length * CHAR_SCORE)

    for drop in range(len(iw)):
        derived = iw[:drop] + iw[drop + 1:]
        if len(derived) < 2:
            continue
        for length in range(len(derived), 1, -1):
            p = derived[:length]
            prefix_scores[p] = max(prefix_scores.get(p, 0), length * CHAR_GAP)

    scores: dict[str, int] = {}
    for prefix, score in prefix_scores.items():
        lo = bisect.bisect_left(sorted_en, prefix)
        hi = bisect.bisect_left(sorted_en, prefix[:-1] + chr(ord(prefix[-1]) + 1))
        for w in sorted_en[lo:hi]:
            if w != iw:
                scores[w] = max(scores.get(w, 0), score)
    return scores


def _phoneme_scores(
    italian: str,
    prefix_index: dict[tuple, list[str]],
    word_lengths: dict[str, int],
) -> dict[str, float]:
    """
    Phoneme prefix scores weighted by coverage of the English word.
    score = matched * WEIGHT * (matched / en_phoneme_count)
    This penalises long English words where only a short prefix matches,
    and rewards short words that are fully "consumed" by the Italian prefix.
    """
    phonemes = italian_to_arpabet(italian)
    if not phonemes:
        return {}

    scores: dict[str, float] = {}

    # Consecutive prefix matches
    for length in range(len(phonemes), 0, -1):
        prefix = tuple(phonemes[:length])
        for w in prefix_index.get(prefix, []):
            en_len = word_lengths.get(w, length)
            score = length * PHON_SCORE * (length / en_len)
            if scores.get(w, 0) < score:
                scores[w] = score

    # One-phoneme-gap matches
    for drop in range(len(phonemes)):
        derived = phonemes[:drop] + phonemes[drop + 1:]
        if not derived:
            continue
        for length in range(len(derived), 0, -1):
            prefix = tuple(derived[:length])
            for w in prefix_index.get(prefix, []):
                en_len = word_lengths.get(w, length)
                score = length * PHON_GAP * (length / en_len)
                if scores.get(w, 0) < score:
                    scores[w] = score

    return scores


# ── Main candidate function ────────────────────────────────────────────────────

def get_candidates(
    italian: str,
    sorted_en: list[str],
    rank: dict[str, int],
    prefix_index: dict[tuple, list[str]],
    word_lengths: dict[str, int],
    n: int = 10,
) -> list[str]:
    """Merge character and phoneme scores; return top n English candidates."""
    char = _char_scores(italian, sorted_en)
    phon = _phoneme_scores(italian, prefix_index, word_lengths)

    combined: dict[str, float] = {}
    for w in set(char) | set(phon):
        combined[w] = max(char.get(w, 0), phon.get(w, 0))

    return sorted(combined, key=lambda w: (-combined[w], rank.get(w, 99_999)))[:n]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--book-id", type=int, default=5)
    parser.add_argument("--api", default="http://localhost:5000")
    args = parser.parse_args()

    _ensure_cmudict()

    print("Loading English word list …")
    english = load_english_words()
    sorted_en = sorted(english)
    rank = {w: i for i, w in enumerate(english)}
    print(f"  {len(english)} words.")

    print("Building phoneme index …")
    prefix_index, word_lengths = build_phoneme_index(english)
    print(f"  {len(prefix_index)} phoneme prefixes indexed.")

    print("Fetching Italian vocabulary …")
    italian = fetch_italian_words(args.api, args.book_id)
    print(f"  {len(italian)} word forms.")
    if not italian:
        sys.exit("No words fetched — is the backend running on " + args.api + "?")

    print("Generating candidates …")
    output: dict[str, list[str]] = {}
    seen: set[str] = set()

    for i, word in enumerate(italian):
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)

        cands = get_candidates(word, sorted_en, rank, prefix_index, word_lengths)
        if cands:
            output[key] = cands

        if (i + 1) % 1000 == 0:
            print(f"  {i + 1}/{len(italian)} …")

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Done - {len(output)} entries -> {OUTPUT}")


if __name__ == "__main__":
    main()
