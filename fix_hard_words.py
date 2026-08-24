import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r"frontend/public/mnemonics.json"
with open(path, encoding='utf-8') as f:
    m = json.load(f)

fixes = {
    # AQUA → Latin, not a common English word
    "acqua":    "AH-KWAH WATER — turn on the tap, WATER pours out.",

    # AERIE → very obscure English word
    "aere":     "(aria) AIR — AEH-reh floats in the AIR / ATMOSPHERE.",

    # MOGUL → not basic
    "ammoglia": "(ammogliarsi) A MAN MARRIES — TAKES A WIFE and settles down.",

    # AMOR → Latin/Italian, not English
    "amor":     "(amore) ah-MORE: always want MORE — that is LOVE.",

    # ANIMA → Latin
    "anima":    "AN ANIMAL has a SOUL — the living SOUL inside every creature.",

    # ATTRITION → advanced
    "attrista": "(attristare) A TRICK that SADDENS — it MAKES you SAD.",

    # BEATITUDE → very advanced
    "beate":    "(beato) BEAT with happiness — BLESSED / HAPPY people full of joy.",

    # COMPUNCTION → very advanced
    "compunto": "(compungere) COME PUNISHED — stabbed with GUILT / REGRET.",

    # DOLEFUL → somewhat advanced
    "dolenti":  "(dolente) DOLLY crying in pain — SAD / SORROWFUL, SUFFERING.",

    # DOLCE using Italian brand as anchor is circular
    "dolce":    "(dolce) DOLL in SWEET colors — SWEET / GENTLE and lovely.",

    # IMPIOUS → very advanced
    "empie":    "(empio) EMPTY of goodness — WICKED / EVIL acts, no shame.",

    # Misleading: looks like English 'face' but sounds/means totally different
    "face":     "(face) FAH-cheh FIRE — a burning TORCH / FLAME, not a human face.",

    # FIE → archaic English
    "fai":      "(fare) FAIRY who does magic — YOU DO, YOU MAKE things happen.",

    # FILIAL → academic/formal
    "figliuol": "(figliuolo) FEEL YOUR love — my SON, my own child.",

    # INTROIT → extremely obscure church term
    "intrai":   "(entrare) I ENTERED — walked right IN through the door.",

    # LACHRIMAL → medical term
    "lagrimar": "(lacrimare) Like RAIN falling from eyes — TO CRY / WEEP with tears.",

    # PELAGIC → scientific term
    "pelago":   "A PELICAN flying over the open SEA — the vast wide ocean.",

    # POLLS → awkward connection
    "polsi":    "(polso) PULSE at the WRIST — feel the WRISTS beat with PULSE.",

    # REGGIE → a name not universally known
    "raggi":    "(raggio) RAD RAYS shooting down — RADIANT beams of bright light.",

    # RED JAY → obscure bird
    "regge":    "(reggere) REGGAE HOLDS the beat — it GOVERNS and RULES the rhythm.",

    # PEONIES → obscure flower
    "ripigneva":"(ripingere) PINE trees PUSHED BACK by the wind — WERE PUSHED BACK.",

    # ESPERANZA → Spanish word
    "speranza": "SPARE a wish: always HOPE for better — HOPE rises.",

    # TRATTORIA → Italian restaurant, not English
    "trattar":  "(trattare) TREAT people well: TO TREAT / DEAL WITH them fairly.",

    # VERA-CHAI → made-up compound
    "verace":   "(verace) VERA says TRUE — VERA always tells the TRUTH.",

    # VEDIC → obscure religious/philosophical term
    "vede":     "(vedere) like a VIDEO, YOU SEE it play.",
    "vedi":     "(vedere) like a VIDEO, YOU SEE it clearly.",
    "vedrai":   "(vedere) VIDEO REEL: YOU WILL SEE it all.",
    "vide":     "(vedere) like a VIDEO, HE SAW it happen.",
    "vidi":     "(vedere) like a VIDEO, I SAW it happen.",

    # VOILÀ → French word
    "voglia":   "(volere) VOL-ya: I WANT it so badly — strong DESIRE / WISH.",
}

for k, v in fixes.items():
    m[k] = v

with open(path, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)
print(f"Applied {len(fixes)} fixes. Total: {len(m)}")
