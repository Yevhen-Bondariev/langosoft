import json

path = r"frontend/public/mnemonics.json"
with open(path, encoding="utf-8") as f:
    m = json.load(f)

fixes = {
    # dicesti: DEE-CHESTY → CHEST (real word, same ch sound)
    "dicesti":   "(dicere) CHEST puffed: YOU SAID it loudly.",

    # discerno: DISH-SHERNO → DISHES (real word, sh sound matches sc+e)
    "discerno":  "(discernere) Washing DISHES I DISCERN what is clean.",

    # doglia: DOLL-YA / DOLL-YEAH → DOLLY (real word)
    "doglia":    "(doglia) My DOLLY is broken — cries from PAIN / GRIEF.",

    # dove/dov: DOH-VAY → DOUGH + WAY (real words)
    "dov":       "(dove) WHERE did the DOUGH go? On its WAY to the oven.",
    "dove":      "(dove) WHERE did the DOUGH go? On its WAY to the oven.",

    # face: FAH-CHAY → use same spelling (torch, not "face")
    "face":      "(face) Same letters as English FACE — but means TORCH / FLAME.",

    # figliuol: FEELY-WHOLE → FILIAL (real word, feel-yal ≈ feel-ywol)
    "figliuol":  "(figliuolo) FILIAL love: my SON, my child.",

    # fioco: FEE-YO-KO → FOCUS (real word, foh-kus ≈ fyoh-ko)
    "fioco":     "(fioco) Out of FOCUS: DIM / FAINT — the light is FEEBLE.",

    # grame: GRAM-MEY → GRAMMY (real word/name)
    "grame":     "(gramo) A GRAMMY for WRETCHEDNESS — grim award.",

    # guida: GWEE-DA / GWEE → GUIDE (real word, same meaning)
    "guida":     "(guidare) The GUIDE glides through — SWIFT and sure.",

    # ivi: EEVIE → IVY (real word, ayv ≈ eev, same letters nearly)
    "ivi":       "(ivi) IVY climbing right THERE on the wall.",

    # leggera: LEDGER-A → just LEDGER (real word)
    "leggera":   "(leggero) A LEDGER page — LIGHT and feathery, SWIFT.",

    # mio: MEE-OH / ME-OH → real words only
    "mio":       "(mio) OH ME, it's MINE — all MINE.",

    # ogne: OWN-YEH → OWN (real word)
    "ogne":      "(ogni, archaic) EVERY one is their OWN — EACH.",

    # ove: OH-VAY → real words only
    "ove":       "(ove, archaic) OH WHERE — WHERE did it go?",

    # pace: still has PAH-CH → clean up
    "pace":      "(pace) PATCHES of PEACE settle over the land.",

    # peggio: PEDGE-OH → WEDGE (real word)
    "peggio":    "(peggio) A WEDGE driven deeper — things get WORSE.",

    # pelle: PELL-EH → PEEL (real word, same el sound)
    "pelle":     "(pelle) PEEL that SKIN away — a layer falls off.",

    # perché / perch / perche: PER-KAY → PERKY (real word, per-kee ≈ per-keh)
    "perch":     "(perché) PERKY BECAUSE she is always cheerful.",
    "perche":    "(perché) PERKY BECAUSE she is always cheerful.",
    "perché":    "(perché) PERKY BECAUSE she is always cheerful.",

    # pria: PREE-A / PRE-A → PRE (real prefix, pree ≈ pria)
    "pria":      "(prima, archaic) PRE-ARRANGED: BEFORE the event — always first.",

    # raggi: RAD-JEE → remove, keep real words REGGIE + RADIANT
    "raggi":     "(raggio) REGGIE's RADIANT RAYS shine down.",

    # richeggio: REE-KED-JOE → RICKY (real name, ree-kee ≈ ree-ked)
    "richeggio": "(richiedere) RICKY demands: I REQUEST — give it here!",

    # ripigneva: REE-PEEN-YAY-VA → PEONIES (real word)
    "ripigneva": "(ripingere) The PEONIES WERE PUSHED BACK by the wind.",

    # sembiava: SEM-BYA-VA → SAMBA (real word)
    "sembiava":  "(sembrare) A SAMBA dance: it SEEMED beautiful.",

    # silenzio: SEE-LEN-ZEE-OH → real words only
    "silenzio":  "(silenzio) SEE LENNY demand SILENCE — shush!",

    # son: SOHN (German) → real English words
    "son":       "(essere, archaic) DRONE on: I AM the constant SOUND.",

    # stagione: STA-JOE-NEH → real words only
    "stagione":  "(stagione) STAY in SEASON — JOHN the farmer marks each SEASON.",

    # tace: TACH- → ATTACHED (real word)
    "tace":      "(tacere) ATTACHED to SILENCE — ATTACHED lips keep quiet.",

    # uccide: OO-CHIDE → OUCH (real word, owch ≈ oo-ch)
    "uccide":    "(uccidere) OUCH! It KILLS — the beast strikes without warning.",

    # umile: OO-MEE-LAY → real words only
    "umile":     "(umile) WHO, ME? I just LAY LOW — HUMBLE.",

    # uscito: OO-SHEE-TOE → SHOO (real word, sh ≈ sh)
    "uscito":    "(uscire) SHOO'd OUT the door — GONE OUT.",

    # vedere variants: VEH-DAY/DEE/DRY → VEDIC (real word, ved ≈ veh-d)
    "vede":      "(vedere) VEDIC truth: YOU SEE it clearly.",
    "vedi":      "(vedere) VEDIC sage: YOU SEE the truth.",
    "vedrai":    "(vedere) VEDIC light: YOU WILL SEE it.",
    "vide":      "(vedere) VEDIC vision: HE SAW it.",
    "vidi":      "(vedere) VEDIC revelation: I SAW it.",

    # vegna: VEN-YA → KENYA (real word, -enya ≈ -egna)
    "vegna":     "(venire, archaic) KENYA's rains MAY COME — let it come!",

    # viver: VEE-VER → BEAVER (real word, bee-ver ≈ vee-ver)
    "viver":     "(vivere) TO LIVE like a busy BEAVER — always building.",

    # vorrai: VOR-RY → WORRY (real word, wor ≈ vor)
    "vorrai":    "(volere) You will WORRY until you get what you WILL WANT.",

    # erta: the word ERTA itself in caps is wrong
    "erta":      "ERECT and steep — a STEEP SLOPE / CLIMB.",

    # caccera/caccerà: CATCH-A → CATCH (real word)
    "caccera":   "(cacciare) CATCH that rat: WILL CHASE / HUNT it down.",
    "caccerà":   "(cacciare) CATCH that rat: WILL CHASE / HUNT it down.",

    # cagione: CAGE-IONE → CAGE (real word)
    "cagione":   "(cagione) In a CAGE — the CAUSE / REASON is trapped.",

    # calle: CALLEY- → ALLEY (real word)
    "calle":     "(calle) A narrow ALLEY / LANE between walls — CALLE.",

    # cantai: CAN-TIE → CAN (real word) + TIED
    "cantai":    "(cantare) I SANG with all I CAN — TIED my best notes.",

    # cercar: SEARCH-CAR → SEARCH (real word)
    "cercar":    "(cercare) SEARCH party out: SEEKING / SEARCHING.",

    # ché: KEH → KEG (real word, keg ≈ keh)
    "ché":       "A KEG forgotten BECAUSE he left it out.",

    # dirò: DEER-OH → DEAR (real word, deer ≈ dee-r, oh is real)
    "diro":      "(dire) My DEAR — OH! I WILL SAY it to you.",
    "dirò":      "(dire) My DEAR — OH! I WILL SAY it to you.",

    # fece: FETCH-A → FETCH (real word)
    "fece":      "(fare) FETCH! He MADE it happen — go FETCH!",

    # ridir: READER → keep (user preferred this)
    # "ridir" already fixed

    # pien: already fixed

    # esto: ESTO is the Italian word itself, not useful as phonetic
    "esto":      "(questo, archaic) THIS very one — ESTATE: THIS property. Archaic questo.",

    # fia: FIA → the acronym is real but obscure; use FIAT (real word)
    "fia":       "(essere) FIAT: let IT BE — IT WILL BE declared.",
}

for k, v in fixes.items():
    m[k] = v

with open(path, "w", encoding="utf-8") as f:
    json.dump(m, f, ensure_ascii=False, indent=2)
print(f"Applied {len(fixes)} fixes. Total: {len(m)}")
