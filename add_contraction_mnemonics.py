import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r"frontend/public/mnemonics.json"
with open(path, encoding='utf-8') as f:
    m = json.load(f)

new_entries = {
    # contraction content parts
    "acqua":      "AQUA is the same word: WATER.",
    "aere":       "(aria) An AERIE — a bird's nest high in the AIR / ATMOSPHERE.",
    "altezza":    "(alto) ALTITUDE + ZA: measuring the HEIGHT of the mountain.",
    "altre":      "(altro) ALTAR shared with the OTHERS — the OTHER ones (fem pl).",
    "amor":       "(amore) AMOR — the Roman archer of LOVE. Amor = Love.",
    "animo":      "(anima) ANIMAL has a living SPIRIT / SOUL / MIND inside.",
    "apparve":    "(apparire) APPARITION: it APPEARED from nowhere.",
    "ammoglia":   "(ammogliarsi) A MOGUL MARRIES into power — TAKES A WIFE.",
    "attrista":   "(attristare) ATTRITION of joy: it SADDENS / MAKES SAD.",
    "anchise":    "ANCHOR-EASE: Anchises anchored the Trojan bloodline. (proper noun)",
    "avra":       "(avere) AVE — SHE WILL HAVE a blessing.",
    "aveva":      "(avere) AVE Maria: she HAD a vision. AVEVA = HAD.",
    "ei":         "(egli, archaic) AY — HE said it. Archaic 'he'.",
    "ella":       "ELLA Fitzgerald: SHE sang beautifully.",
    "eran":       "(erano) ERA + N — at that ERA THEY WERE there.",
    "erta":       "ERECT and steep — an ERTA is a STEEP SLOPE / CLIMB.",
    "esto":       "(questo, archaic) ESTO — THIS very thing. Archaic form of questo.",
    "impedisce":  "(impedire) IMPEDIMENT: it HINDERS / BLOCKS the way.",
    "impediva":   "(impedire) An IMPEDIMENT WAS BLOCKING — it WAS HINDERING.",
    "incontro":   "IN + COUNTER: walk INTO someone — an ENCOUNTER / MEETING.",
    "inferno":    "INFERNO — we use this in English: HELL / INFERNO.",
    "intrai":     "(entrare) INTROIT — I ENTERED the church. Archaic 'I entered'.",
    "invidia":    "IN-VIDEO: watching others' lives fills you with ENVY.",
    "ora":        "ORAL test at this very HOUR — happening NOW.",
    "uccide":     "(uccidere) OO-CHIDE: the beast KILLS without mercy.",
    "uno":        "UNO card game — ONE card, draw! ONE / A.",
    "un":         "UNO shortened — ONE, A/AN single thing.",
    "uscia":      "(uscire) USHER was GOING OUT / EXITING the hall.",
    "come":       "COME here — but in Italian: HOW / LIKE / AS you come.",
}

# Only add entries that don't already exist
new_entries.update(m)
m = new_entries

with open(path, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)
print(f"Total: {len(m)}")
