import json

path = r"frontend/public/mnemonics.json"
with open(path, encoding="utf-8") as f:
    m = json.load(f)

# Rules applied:
#   c+e/i = "ch" sound  →  CHESS/CHAIR/CHERRY/CHEEKY/CHURCH words
#   c+a/o/u = "k"       →  KEY/KAY/CAR words
#   ch = "k"            →  KEY/KAY/PARK words
#   g+e/i = "j"         →  JAY/JEM/JOE/LEDGE words
#   gg+e/i = longer "j" →  LEDGER/BADGE/EDGE words
#   gn = "ny"           →  CANYON/ONION/KENYA words
#   gli = "ly"          →  MILLION/BILLION/LILY words
#   sc+e/i = "sh"       →  SHELL/DISH/SHEER words
#   h = silent          →  never use English "H-sound" words as phonetic anchor
#   vowels: a=ah, e=eh, i=ee, o=oh, u=oo

fixes = {
    # ché (keh = because) — CHEF was wrong ("sh"); use "k" anchor
    "ché":      "KEH! A KEG of wine forgotten — left out BECAUSE he forgot.",

    # basso (BAHS-so = low/deep) — BASS instrument = "bays"; use bass-the-fish (short a)
    "basso":    "(basso) BASS fish sinking to the BOTTOM — deep and LOW.",

    # cantai (kan-TAH-ee = I sang) — CHANT has wrong "ch"; cantai = "k" sound
    "cantai":   "(cantare) CAN-TIE: I SANG and TIED all the notes together.",

    # certo (CHER-to = certain) — CERTIFY = "S" sound; cer = "ch" in Italian
    "certo":    "(certo) CHERRY TORTE: CERTAIN this cake is delicious — no doubt.",

    # cibera/ciberà (chee-beh-RAH = will feed) — CUB = "k"; c+i = "ch"
    "cibera":   "(ciberà/ciberare) A CHEEKY BEAR A-FEEDING on wild berries — FEEDS.",
    "ciberà":   "(ciberà/ciberare) A CHEEKY BEAR A-FEEDING on wild berries — FEEDS.",

    # città (cheet-TAH = city) — CITY = "s"; c+i = "ch"
    "citta":    "A CHEETAH dashing through the CITY — cheet-TAH = CITY.",
    "città":    "A CHEETAH dashing through the CITY — cheet-TAH = CITY.",

    # dicesti (dee-CHES-tee = you said) — DICTATE = "k"; c+e = "ch"
    "dicesti":  "(dicere) DEE-CHESTY: YOU SAID it loudly, CHEST puffed out.",

    # dirò (dee-ROH = I will say) — DECLARE has no phonetic link
    "diro":     "(dire) DEER-OH! I WILL SAY it: 'Oh, deer!'",
    "dirò":     "(dire) DEER-OH! I WILL SAY it: 'Oh, deer!'",

    # ridir (ree-DEER = to say again) — REITERATE has no phonetic link; user prefers READER
    "ridir":    "(ridire) A READER going over the text again — TO SAY AGAIN / RETELL.",

    # pien (pyen = full) — PLENTY has no phonetic link; pien sounds like PIANO
    "pien":     "(pieno) A PIANO key pressed FULL DOWN — FULL / FILLED to the brim.",

    # discerno (dee-SHER-no = I discern) — DISCERN = "s"; sc+e = "sh"
    "discerno": "(discernere) DISH-SHERNO: washing DISHES, I DISCERN what is clean.",

    # doglia (DOL-ya = grief/pain) — DOLL misses the gli="ly" palatal
    "doglia":   "(doglia) DOLL-YA cries from PAIN — DOLL-YEAH, it HURTS.",

    # dove (DOH-veh = where) — DOVE bird = "duv", wrong vowel
    "dov":      "(dove) DOH-VAY: WHERE is the DOUGH? — baked somewhere.",
    "dove":     "(dove) DOH-VAY: WHERE is the DOUGH? — baked somewhere.",

    # face (FAH-cheh = torch) — FACE = "fays", wrong sound; c+e = "ch"
    "face":     "(face) FAH-CHAY — a FACE lit by a torch, FAH-CHAY glowing.",

    # fai (FAH-ee = you do/make) — DIY has no phonetic link
    "fai":      "(fare) FIE! YOU DO it — 'FIE on you!' YOU MAKE the mess.",

    # fece (FEH-cheh = he/she made) — FACE = "fays", wrong; c+e = "ch"
    "fece":     "(fare) FETCH-A! He MADE it happen by FETCHing everything.",

    # fé (feh = faith, archaic) — FAITH has no phonetic link
    "fe":       "(fede, archaic) FEH — a weary sigh of FAITH / TRUST.",
    "fé":       "(fede, archaic) FEH — a weary sigh of FAITH / TRUST.",

    # figliuol (feel-YWOL = son, child) — FILL YOUR misses gli="ly" palatal
    "figliuol": "(figliuolo) FEELY-WHOLE: my SON makes me feel whole.",

    # fioco (FYOH-ko = dim/faint) — FEEBLE has no phonetic link
    "fioco":    "(fioco) FEE-YO-KO: a FAINT little yodel — DIM and barely heard.",

    # già (jah = already) — YA has "y" not "j"; g+i = "j"
    "gia":      "JAH — ALREADY blessed. 'Jah!' it's ALREADY done.",
    "già":      "JAH — ALREADY blessed. 'Jah!' it's ALREADY done.",

    # grame (GRAH-meh = wretched/sorrowful) — GRIM has no phonetic link
    "grame":    "(gramo) GRAM-MEY: every GRAM of WRETCHEDNESS weighs heavy.",

    # guida (GWEE-da = guide) — GUIDE = "gyd", wrong vowel
    "guida":    "(guidare) GWEE-DA — a speedy GUIDE leads: GWEE fast!",

    # ha (ah = has) — H is silent; HA has audible H
    "ha":       "(avere) AH! SHE HAS it — the H is silent; ha = 'ah', HAS.",

    # ho (oh = I have) — H is silent; HO has audible H
    "ho":       "(avere) OH! I HAVE it — H is silent; ho = 'oh', HAVE.",

    # i (ee = the, masc pl) — English I = "eye", wrong vowel
    "i":        "EE! THE crowd — I is just 'EE' in Italian: THE (masc pl).",

    # io (EE-oh = I/me) — English I = "eye", wrong vowel
    "io":       "EE-OH: Old MacDonald's E-I-E-I-O — that 'EE-OH' is ME / I.",

    # ivi (EE-vee = there) — IVY = "EYE-vee", wrong vowel
    "ivi":      "(ivi) E.V. stood right THERE — EEVIE was THERE.",

    # legge (LED-jeh = law/reads) — LEGAL = "LEE-gul" has hard g, not j; gg+e = "j"
    "legge":    "(leggere/legge) LEDGER of the LAW — it READS and GOVERNS.",

    # leggera (led-JEH-ra = light/swift) — LIGHT has no phonetic link
    "leggera":  "(leggero) A LEDGER-A: a LIGHT ledger, SWIFT and feathery.",

    # mio (MEE-oh = my) — MY = "my", wrong vowel
    "mio":      "ME-OH — ME, OH! It's MINE — MEE-OH is MY own.",

    # ogne (ON-yeh = every) — no CAPS phonetic marker
    "ogne":     "(ogni, archaic) OWN-YEH: EVERY one is my OWN — EACH.",

    # onde (ON-deh = whence/from which) — WONDER = "WUN-der", wrong vowel
    "ond":      "(onde) ON-DAY: FROM WHENCE — it started ON that DAY.",
    "onde":     "(onde) ON-DAY: FROM WHENCE — it started ON that DAY.",

    # ove (OH-veh = where) — OVEN = "UV-en", wrong vowel
    "ove":      "(ove, archaic) OH-VAY: WHERE — 'OH-VAY, WHERE did it go?'",

    # pace (PAH-cheh = peace) — PACIFIC = "pa-SIF"; c+e = "ch"
    "pace":     "(pace) PAH-CHAY: PEACE — a PATCHY calm after the storm.",

    # peggio (PED-jo = worse) — PEG = "peg", no "j"; gg+i/o = "j"
    "peggio":   "(peggio) PEDGE-OH: even WORSE — the EDGE gets sharper.",

    # pelle (PEL-leh = skin) — PEEL = "peel", wrong vowel
    "pelle":    "(pelle) PELLET of SKIN — a PELL-EH layer comes off.",

    # peltro (PEL-tro = pewter) — PEWTER = "PYOO-ter", wrong vowel
    "peltro":   "(peltro) PELT-ROW: PEWTER armor on the rowing knight.",

    # penso (PEN-so = I think) — PONDER = "PON-der", wrong vowel
    "penso":    "(pensare) PEN-SO: I THINK with my PEN — so I write it down.",

    # perché (per-KEH = because/why) — PERCH = "perch" ("ch" sound), wrong; ch = "k"
    "perch":    "(perché) PER-KAY: BECAUSE — a PERK for the KEY reason.",
    "perché":   "(perché) PER-KAY: BECAUSE — a PERK for the KEY reason.",
    "perche":   "(perché) PER-KAY: BECAUSE — a PERK for the KEY reason.",

    # pietà (pyeh-TAH = pity/compassion) — PITY = "PIT-ee", no phonetic link
    "pieta":    "PYAY-TAH: Michelangelo's PIETÀ — marble COMPASSION / PITY.",
    "pietà":    "PYAY-TAH: Michelangelo's PIETÀ — marble COMPASSION / PITY.",

    # più (pyoo = more) — PLUS = "pluhs", missing "yoo"
    "piu":      "PEW: MORE seats in the PEW — one PEW MORE.",
    "più":      "PEW: MORE seats in the PEW — one PEW MORE.",

    # polsi (POL-see = wrists/pulses) — PULSE = "puls", wrong vowel
    "polsi":    "(polso) POLL-SEE: PULSE measured at the POLLS.",

    # pria (PREE-a = before, archaic) — PRIMAL = "PRY-mul", wrong vowel
    "pria":     "(prima, archaic) PREE-A: BEFORE — like a PRE-A(rranged) meeting.",

    # qui (kwee = here) — KEY = "kee", missing "w"
    "qui":      "QUEEN is HERE — KWEE, like a SQUEAKY queen standing HERE.",

    # quello (KWEL-lo = that) — YELLOW has "y" sound, totally wrong
    "quello":   "(quello) QUELL-OH: THAT rebellion — QUELL-OH right there.",

    # raggi (RAD-jee = rays) — RAYS = "rayz", no "j"; gg+i = "j"
    "raggi":    "(raggio) RAD-JEE: REGGIE's RADIANT RAYS — RAD-JEE beams.",

    # regge (RED-jeh = holds/governs) — REGGAE has hard "g", not "j"; gg+e = "j"
    "regge":    "(reggere) RED-JAY: the RED JAY HOLDS the branch — it GOVERNS.",

    # regna (REN-ya = rules) — REIGN = "rayn", missing "ny"; gn = "ny"
    "regna":    "(regnare) REN-YA RULES — the WREN-YA queen REIGNS.",

    # richeggio (ree-KED-jo = I demand/request) — RICHLY has "ch" sound; ch = "k"
    "richeggio":"(richiedere) REE-KED-JOE: I REQUEST — 'REE-KED-JO, give it!'",

    # ripigneva (ree-peen-YEH-va = was pushing back) — gn = "ny"
    "ripigneva":"(ripingere) REE-PEEN-YAY-VA: the PEONIES WERE PUSHED BACK by the wind.",

    # sembiava (sem-BYAH-va = seemed/appeared) — no CAPS phonetic
    "sembiava": "(sembrare) SEM-BYA-VA: SAMBA-VA — it SEEMED like dancing.",

    # sii (see = be!) — BE has no phonetic link
    "sii":      "(essere) SEE! Just BE yourself — SEE and BE.",

    # silenzio (see-LEN-tsyo = silence) — SILENCE = "SY-lens", wrong vowel
    "silenzio": "(silenzio) SEE-LEN-ZEE-OH — SILENCE! SEE LENNY, he demands quiet.",

    # son (sohn = am/are) — SON = "sun", wrong vowel
    "son":      "(essere, archaic) SOHN: I AM — like the German SOHN, I AM here.",

    # stagione (sta-JOH-neh = season) — STAGNANT has hard g; gi = "j"
    "stagione": "(stagione) STA-JOE-NEH: the SEASON of Saint JOE the farmer.",

    # tace (TAH-cheh = is silent) — TACO = "TAH-ko"; c+e = "ch"
    "tace":     "(tacere) TAH-CHAY: SILENCE — the taco shop gone QUIET.",

    # tolsi (TOL-see = I took away) — TOOLS = "toolz", wrong vowel
    "tolsi":    "(togliere) TOLL-SEE: I TOOK AWAY the TOLL — removed.",

    # trattar (trat-TAR = to deal with) — TREAT = "treet", wrong vowel
    "trattar":  "(trattare) TRATTORIA: TO TREAT / DEAL WITH guests well.",

    # umile (OO-mee-leh = humble) — HUMBLE has audible H; Italian H silent
    "umile":    "(umile) OO-MEE-LAY: 'WHO, ME? I just lay low.' — HUMBLE.",

    # uscito (oo-SHEE-to = gone out) — EXIT has no phonetic link
    "uscito":   "(uscire) OO-SHEE-TOE: she SHOO'd him OUT the door — GONE OUT.",

    # vedere/vedi/vedrai etc. (veh-DEH-reh = to see) — VIDEO = "VID", wrong vowel
    "vede":     "(vedere) VEH-DAY: YOU SEE the day — VAY-DAY, VICTORY seen.",
    "vedi":     "(vedere) VEH-DEE: YOU SEE clearly — a VED-EE (Vedic) vision.",
    "vedrai":   "(vedere) VEH-DRY: YOU WILL SEE — dried clear like VEH-DRY air.",
    "vide":     "(vedere) VEH-DEH: HE SAW — a VEDIC vision.",
    "vidi":     "(vedere) VEH-DEE: I SAW — like VEDIC truth revealed.",

    # vegna (VEN-ya = may come) — VEGAN = "VEE-gun", gn = "ny"
    "vegna":    "(venire, archaic) VEN-YA: 'VENYA! Come!' — MAY IT COME.",

    # verace (veh-RAH-cheh = truthful) — VERA ACE has "s"; c+e = "ch"
    "verace":   "(verace) VER-AH-CHAY: VERA-CHAI — a TRUE tea drinker.",

    # viver (VEE-ver = to live) — VITAL = "VYE-tul", wrong vowel
    "viver":    "(vivere) VEE-VER: TO LIVE like a busy BEAVER — VEE-VER away.",

    # voglia (VOL-ya = desire/wish) — VOGUE misses gli="ly" palatal
    "voglia":   "(volere) VOLL-YA: 'VOILÀ!' — bursting with DESIRE, I WANT it all.",

    # vorrai (vor-RAH-ee = you will want) — no CAPS phonetic marker
    "vorrai":   "(volere) VOR-RY: you'll WORRY until you get what you WILL WANT.",
}

# Apply fixes — these override existing entries
for k, v in fixes.items():
    m[k] = v

with open(path, "w", encoding="utf-8") as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print(f"Applied {len(fixes)} fixes. Total entries: {len(m)}")
