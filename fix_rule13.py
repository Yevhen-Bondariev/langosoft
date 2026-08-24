"""
Fix Rule 13: remove all em-dashes (—) and semicolons; rewrite every entry as a
proper story sentence with a subject and a finite verb.
Also adds the missing 'com' entry for the com' contraction.
"""
import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r"frontend/public/mnemonics.json"
with open(path, encoding='utf-8') as f:
    m = json.load(f)

fixes = {
    # ── a ─────────────────────────────────────────────────────────────────────
    "abbandonai":   "(abbandonare) An ABANDONED BUNNY sits alone, I LEFT the group far behind.",
    "ahi":          "ACHY and bruised, she cries ALAS and clutches her side.",
    "aiutami":      "(aiutare) MY EYE burns and I cry out: HELP ME before it gets worse!",
    "allor":        "(allora) AL GORE steps up THEN and speaks at THAT TIME.",
    "altezza":      "(alto) ATLAS lifts the world to great HEIGHT, towering above everyone below.",
    "alto":         "The ALTAR stands HIGH and TALL, lifted above all the heads around it.",
    "altre":        "(altro) The ALTAR opens wide and the OTHERS step forward, the OTHER ones.",
    "altrui":       "ALTRUISM calls you to give to OTHERS and keep nothing for yourself.",
    "amor":         "(amore) She always wants MORE and that craving for MORE IS LOVE.",
    "ammoglia":     "(ammogliarsi) A MAN MARRIES and TAKES A WIFE, then settles down at last.",
    "ancora":       "An ANCHOR holds STILL in the current and AGAIN refuses to move.",
    "anima":        "AN ANIMAL carries a SOUL, a living spark inside every creature.",
    "animali":      "ANIMALS roam free in the wild, those very ANIMALS in every shape.",
    "attrista":     "(attristare) A cruel TRICK SADDENS the crowd and MAKES you SAD.",
    "avra":         "(avere) An AVID bird returns and SHE WILL HAVE the biggest nest.",
    "aveva":        "(avere, archaic) She was AVID for every AVENUE: SHE HAD it all once.",
    "avrà":         "(avere) An AVID bird returns and SHE WILL HAVE the biggest nest.",
    "avea":         "(avere, archaic) She was AVID for every AVENUE: SHE HAD it all once.",

    # ── b ─────────────────────────────────────────────────────────────────────
    "basso":        "(basso) A BASS fish sinks to the BOTTOM and lies deep and LOW.",
    "beate":        "(beato) BEAT a drum with happiness and the BLESSED people dance.",
    "bello":        "The BELLBOY greets every guest and calls it BEAUTIFUL service.",
    "bene":         "A BENEFACTOR gives freely and everything turns out WELL.",
    "buono":        "BONO plays a concert and does GOOD for the world.",

    # ── c ─────────────────────────────────────────────────────────────────────
    "cagione":      "(cagione) A bird in a CAGE has a REASON for singing every morning.",
    "calle":        "(calle) A narrow ALLEY squeezes between the walls: a LANE through the old quarter.",
    "cammilla":     "CAMILLA rides her horse into battle as a warrior maiden of legend.",
    "cantai":       "(cantare) She said I CAN TIE the notes together, so I SANG my heart out.",
    "certo":        "(certo) CHERRY TORTE bakes perfectly and she is CERTAIN it will be delicious.",
    "chi":          "A KEY opens the gate for WHOEVER holds it, choosing WHO may enter.",
    "cibera":       "(ciberà/ciberare) A CHEEKY BEAR FEEDS on wild berries all summer long.",
    "ciberà":       "(ciberà/ciberare) A CHEEKY BEAR FEEDS on wild berries all summer long.",
    "cio":          "A CELLO plays THAT specific note and the whole room falls silent.",
    "ciò":          "A CELLO plays THAT specific note and the whole room falls silent.",
    "color":        "(coloro) A COLORFUL crowd gathers: THOSE PEOPLE arrive in every hue.",
    "colui":        "The COOL ONE steps forward: HE IS THE ONE they all want.",
    "com":          "(come) She grabs a COMBO and asks HOW to do it, arriving AS she is.",
    "come":         "She says COME as you are: HOW you dress matters less than who you are.",
    "compunto":     "(compungere) She CAME PUNISHED and felt GUILT stab her deeply inside.",
    "cor":          "(cuore) The CORE of the apple holds the HEART of its sweetness.",
    "cosi":         "A COZY chair wraps her in comfort: THIS is how she rests, SO at ease.",
    "così":         "A COZY chair wraps her in comfort: THIS is how she rests, SO at ease.",
    "cu":           "(cui) The QUEUE forms and no one knows for WHOM they have been waiting.",

    # ── d ─────────────────────────────────────────────────────────────────────
    "dei":          "(dei) A DEITY appears and the plural GODS of Olympus all arrive.",
    "dèi":          "(dei) A DEITY appears and the plural GODS of Olympus all arrive.",
    "dio":          "DIOR designs feel GODLY, divine beauty crafted by hands above.",
    "dipartilla":   "(dipartire) He yelled DEPART and it LEFT sight in an instant.",
    "diro":         "(dire) Oh DEAR, I WILL SAY the words when the right moment comes.",
    "dirò":         "(dire) Oh DEAR, I WILL SAY the words when the right moment comes.",
    "doglia":       "(doglia) The DOLLY breaks apart and GRIEF fills the room with PAIN.",
    "dolce":        "(dolce) A DOLL wears SWEET colors and smiles gently at the world.",
    "dolente":      "(dolere) DO LENT together: the fast leaves the heart SAD and SORROWFUL.",
    "dolore":       "(dolore) A DOLLAR gets stolen and deep GRIEF fills the heart with PAIN.",

    # ── e ─────────────────────────────────────────────────────────────────────
    "e":            "An ampersand & looks like E and the letter E in Italian also means AND.",
    "ecco":         "The ECHO bounces back and says HERE IT IS, right in front of you.",
    "ei":           "(egli, archaic) AY! HE stepped forward, the one they call by that old name.",
    "èi":           "(egli, archaic) AY! HE stepped forward, the one they call by that old name.",
    "empie":        "(empio) An EMPTY heart grows WICKED with no goodness left inside.",
    "eran":         "(erano) In the ERA of knights THEY WERE the bravest souls around.",
    "era":          "The golden ERA fades and everything WAS brighter in those days.",
    "erta":         "(erta) EARTH piles up steep and forms a SLOPE to scramble up.",
    "esto":         "(questo, archaic) She claims the ESTATE: THIS very property, THIS one here.",
    "etterne":      "(eterno) ETERNAL stars shine FOREVER, lasting with no end in sight.",
    "eurialo":      "(Euryalus) A true EURO ALLY fights alongside in battle, brave Trojan warrior.",

    # ── f ─────────────────────────────────────────────────────────────────────
    "fa":           "(fare) The FACTORY hums all day: IT MAKES and PRODUCES everything.",
    "face":         "(face) Beware: FAH-cheh is not a human face, it burns as a TORCH and FLAME.",
    "fai":          "(fare) The FAIRY waves her wand and YOU MAKE, YOU DO the impossible.",
    "fece":         "(fare) FETCH! She ran out and MADE it happen, just go FETCH.",
    "fecemi":       "(fare) FETCH ME! He cried and HE MADE ME, brought me into being.",
    "fe":           "(fede, archaic) FEH, a weary sigh: she holds FAITH despite every doubt.",
    "fé":           "(fede, archaic) FEH, a weary sigh: she holds FAITH despite every doubt.",
    "fermo":        "FIRM and unmoving, the boulder has STOPPED and stands STILL.",
    "fia":          "(essere) FIAT decrees: IT WILL BE and so IT IS declared from above.",
    "figliuol":     "(figliuolo) You FEEL YOUR child's hand: my SON, my own dear boy.",
    "fioco":        "(fioco) The image goes OUT OF FOCUS and the light grows DIM and FAINT.",
    "fu":           "(essere) She spoke just a FEW words and then IT WAS over.",
    "fui":          "(essere) PHOOEY! I WAS wrong and I admit it now.",
    "furon":        "(essere) On the FUTON they rested and THEY WERE tired from the long journey.",

    # ── g ─────────────────────────────────────────────────────────────────────
    "gaetta":       "The GAZETTE prints the news of GAETA and the city sees its name in print.",
    "gente":        "(gente) A GENTLE crowd gathers: all the PEOPLE, the whole FOLK, arrive.",
    "gioia":        "A JOY GEM sparkles and pure JOY fills every corner of the soul.",
    "gia":          "JAH blesses and IT IS ALREADY done, the miracle ALREADY complete.",
    "già":          "JAH blesses and IT IS ALREADY done, the miracle ALREADY complete.",
    "giustizia":    "(giustizia) A JUDGE slams the gavel and JUSTICE gets delivered, fair and final.",
    "grame":        "(gramo) A GRAMMY award goes to WRETCHEDNESS: a grim prize for grim work.",
    "guida":        "(guidare) The GUIDE glides forward and leads the way with swift steps.",

    # ── h ─────────────────────────────────────────────────────────────────────
    "ha":           "(avere) AH! SHE HAS it now, the H stays silent: ha sounds like 'ah', HAVE.",
    "ho":           "(avere) OH! I HAVE it now, the H stays silent: ho sounds like 'oh', HAVE.",

    # ── i ─────────────────────────────────────────────────────────────────────
    "i":            "EE! THE crowd cheers as I walk through THE people below.",
    "ilion":        "ILION stands as Troy itself, the ancient city of legend.",
    "ilïón":        "ILION stands as Troy itself, the ancient city of legend.",
    "impediva":     "(impedire) An IMPEDIMENT WAS BLOCKING the road and WAS HINDERING all progress.",
    "in":           "IN a box it sits, simply inside and nowhere else.",
    "incontro":     "She walked INTO the COUNTER and the ENCOUNTER left her surprised.",
    "inferno":      "The INFERNO rages and swallows all into HELL down below.",
    "intrai":       "(entrare) IN I walked and I ENTERED through the open door.",
    "io":           "(io) EGO shines bright: all about ME, the great I speaks.",
    "italia":       "ITALY calls with its boot-shaped landscape of pasta and history.",

    # ── l ─────────────────────────────────────────────────────────────────────
    "l":            "(il/lo/la elided) An L-HOOK clips THE article short, THE one used before a consonant.",
    "lagrimar":     "(lacrimare) Like RAIN falling from eyes, she cries and WEEPS with her tears.",
    "lascero":      "(lasciare) The LASSO flies and releases: I WILL LET GO and LEAVE it behind.",
    "lascerò":      "(lasciare) The LASSO flies and releases: I WILL LET GO and LEAVE it behind.",
    "lasciate":     "(lasciare) LATCH the gate behind you and ABANDON all hope as you LEAVE.",
    "le":           "(le) LEMUR grabs THE branch and refuses to let THE others take THE best spot.",
    "legge":        "(leggere/legge) The LEDGER shows the LAW: he READS what GOVERNS the land.",
    "leggera":      "(leggero) A LEDGER page floats LIGHT and feathery through the morning air.",
    "lo":           "The LOW rider rolls through and THE smooth one slides by as HIM.",
    "lonza":        "A BRONZE LYNX leaps from the shadows, fierce and spotted in the dark.",

    # ── m ─────────────────────────────────────────────────────────────────────
    "macolato":     "(maculare) A MACAW spreads SPOTTED wings, feathers STAINED with wild color.",
    "mai":          "NEVER again she vows: MAI means NEVER and she will not say it once.",
    "mattino":      "(mattino) The MATINEE starts at MORNING and always gets the earliest crowd.",
    "mezzo":        "A MESSY cake gets cut right in the MIDDLE, half for you and half for me.",
    "mio":          "(mio) OH ME, she gasps: IT IS MINE, all MINE at last.",
    "mosse":        "(muovere) MOSES MOVED the sea and led his PEOPLE safely through the waters.",

    # ── n ─────────────────────────────────────────────────────────────────────
    "ne":           "NEITHER this option NOR that one: NE connects both sides of the refusal.",
    "né":           "NEITHER this option NOR that one: NE connects both sides of the refusal.",
    "niso":         "NISUS stands loyal in the fight, a brave Trojan warrior hero.",

    # ── o ─────────────────────────────────────────────────────────────────────
    "o":            "She says OR pick this one: O = OR, just one or the other.",
    "ogne":         "(ogni, archaic) EVERY one stands on their OWN: EACH belongs to themselves.",
    "ond":          "(onde) ON that DAY it rose FROM WHENCE it began and spread outward.",
    "onde":         "(onde) ON that DAY it flows FROM WHENCE it came and never stops.",
    "or":           "(ora) She says OR stay NOW: do it right away, the moment is NOW.",
    "ora":          "An ORAL exam begins at THIS HOUR and the student freezes NOW.",
    "ove":          "(ove, archaic) OH, WHERE did it vanish: she searches everywhere for WHERE it went.",

    # ── p ─────────────────────────────────────────────────────────────────────
    "paura":        "PARANOIA grips her with FEAR and the POWER of pure FEAR takes over.",
    "peggio":       "(peggio) A WEDGE drives deeper and things only get WORSE from here.",
    "pelago":       "A PELICAN flies above the open SEA, gliding over the vast wide ocean.",
    "pelle":        "(pelle) She PEELS that SKIN away and a fresh layer appears below.",
    "peltro":       "(peltro) The PELT ROW hangs grey: a dull TIN cup sits at the far end.",
    "penso":        "(pensare) PEN in hand, I THINK it through and write it down slowly.",
    "perdei":       "(perdere) The PEAR fell on that dark DAY and I LOST it forever.",
    "perduta":      "(perdere) A PEAR on DUTY vanishes without a trace, LOST from its post.",
    "persona":      "(persona) A PERSON takes the STAGE as a character, a face worn for the world.",
    "pie":          "(piede) She places a PIE at her FOOT and her FOOT lands right on it.",
    "piè":          "(piede) She places a PIE at her FOOT and her FOOT lands right on it.",
    "pieta":        "(pietà) PITY! AH! Michelangelo carved COMPASSION into the PIETÀ in marble.",
    "pietà":        "(pietà) PITY! AH! Michelangelo carved COMPASSION into the PIETÀ in marble.",
    "pietro":       "PETER the apostle built a STONE foundation that stands firm today.",
    "pien":         "(pieno) A PIANO key gets pressed FULL DOWN and fills the hall with sound.",
    "piu":          "In the PEW she asks for MORE seats and they bring her one MORE.",
    "più":          "In the PEW she asks for MORE seats and they bring her one MORE.",
    "poeta":        "(poeta) A POET climbs the cliff and shouts TRUTH into the wind below.",
    "poeti":        "(poeti) POETS gather in a circle and the verse-makers trade their lines.",
    "polsi":        "(polso) She checks the PULSE at her WRIST and the WRIST beats steady.",
    "pria":         "(prima, archaic) PRE-ARRANGED and done BEFORE the event, it always comes first.",
    "primo":        "She stands at PRIME position: FIRST in line, the PRIMARY one of all.",
    "punto":        "(punto, archaic) A PONTOON anchors at the exact POINT and the captain marks THAT MOMENT.",

    # ── q ─────────────────────────────────────────────────────────────────────
    "quei":         "(quegli) THOSE strangers stand over there: THEY watch from a distance.",
    "quel":         "(quello) She says QUELL that noise: THAT particular one causes the trouble.",
    "quello":       "(quello) She says QUELL-OH to stop THAT right there, THAT rebellion ends now.",
    "questo":       "THIS QUEST begins right here: she picks QUESTO, THIS one in her hand.",
    "qui":          "The QUEEN stands HERE and squeaks with a voice right HERE.",

    # ── r ─────────────────────────────────────────────────────────────────────
    "raggi":        "(raggio) RAD RAYS shoot downward as radiant beams of bright warm light.",
    "regge":        "(reggere) REGGAE HOLDS the beat and GOVERNS and RULES the whole rhythm.",
    "regna":        "(regnare) The WREN queen REIGNS and REN-YA RULES over all the birds.",
    "retro":        "RETRO style reaches BACK in time and the look moves BEHIND all trends.",
    "richeggio":    "(richiedere) RICKY demands respect: I REQUEST it, give it here.",
    "ridir":        "(ridire) A READER goes over the text again and SAYS IT AGAIN from the start.",
    "ripigneva":    "(ripingere) PINE trees bend hard and get PUSHED BACK by the strong wind.",

    # ── s ─────────────────────────────────────────────────────────────────────
    "sali":         "(salire) She calls SALUTE and starts to CLIMB, GOING UP the steep hill.",
    "salire":       "The SAILOR CLIMBS the mast hand over hand, GOING UP the tall rigging.",
    "san":          "The SAINT steps forward in short: a SAINTLY person, holy and blessed.",
    "sanza":        "(senza) SANTA ran out of gifts and arrived WITHOUT any presents at all.",
    "sempre":       "(sempre) A SENTRY guards the gate ALWAYS and stands EVER on duty.",
    "sii":          "(essere) SEE! Just BE yourself: the command says BE who you truly are.",
    "silenzio":     "(silenzio) SEE LENNY demand SILENCE and the crowd goes completely quiet.",
    "so":           "(sapere) SO here we are: I KNOW what you are thinking right now.",
    "sonno":        "(sonno) A long SONNET lulls her to SLEEP and deep SLUMBER takes over.",
    "spalle":       "(spalla) A PALLET balances on SHOULDERS and the heavy load gets carried.",
    "speran":       "(sperare) THEY HOPE for better and speranza rises in all their hearts.",
    "speranza":     "She SPARES a wish and always HOPES for better days ahead.",
    "stagione":     "(stagione) STAY through every SEASON and JOHN the farmer marks each one.",
    "su":           "SUPER powers send it UP and the hero rises elevated above all.",
    "sù":           "SUPER powers send it UP and the hero rises elevated above all.",

    # ── t ─────────────────────────────────────────────────────────────────────
    "tace":         "(tacere) She stays ATTACHED to SILENCE and her ATTACHED lips hold perfectly quiet.",
    "tolsi":        "(togliere) TOLL-SEE the cost: I TOOK AWAY the TOLL from the road.",
    "tremesse":     "(tremare) She lay TREMBLING in the dark and WAS SHAKING with uncontrollable fear.",
    "trovai":       "(trovare) The TROPHY sat in the corner and I FOUND the prize at last!",
    "tu":           "TOO late: YOU arrive TOO early, always invited and never on time.",
    "tutti":        "(tutto) TOOT your horn: EVERYONE joins in and ALL cheer together.",

    # ── u ─────────────────────────────────────────────────────────────────────
    "uccide":       "(uccidere) OUCH! The beast KILLS without warning and leaves only pain.",
    "umile":        "(umile) WHO, ME? She shrugs and LAYS LOW: staying HUMBLE before the crowd.",
    "una":          "ONE unicorn trots past: A single magical creature among many.",
    "uno":          "UNO! He plays ONE card and grins at the table, drawing just ONE.",
    "uscito":       "(uscire) She got SHOO'd OUT the door and walked away, GONE OUT at last.",

    # ── v ─────────────────────────────────────────────────────────────────────
    "va":           "(andare) VROOM! IT GOES forward and onward IT GOES without stopping.",
    "vegna":        "(venire, archaic) Rains COME to KENYA: LET IT COME, the farmer says.",
    "veltro":       "VELOCITY ROW shows raw speed: the greyhound RUNS at full VELOCITY.",
    "venendomi":    "(venire) VENOM CAME TO ME, approaching fast and without any warning.",
    "venire":       "The VENUE fills as people COME TO the stage from every direction.",
    "verace":       "(verace) VERA always tells the TRUTH: VERA speaks TRUTH every single time.",
    "vi":           "VIA leads THERE: the road runs THERE, right where you need to go.",
    "viver":        "(vivere) TO LIVE like a BEAVER who builds without stopping, always busy.",
    "voglia":       "(volere) A VOLCANO of DESIRE erupts: she WANTS it with burning WISH.",
    "voi":          "They launch a VOYAGE and YOU all set sail, YOU the whole crew together.",
    "volume":       "She turns the VOLUME knob on a big BOOK and the words grow louder.",

    # ── others already correct but with dash ──────────────────────────────────
    "create":       "(creare) Things get CREATED from nothing: MADE and CREATED out of pure void.",
    "divina":       "(divino) DIVINE beauty glows feminine and GODLY, perfect in every way.",
}

applied = 0
for k, v in fixes.items():
    if k in m:
        m[k] = v
        applied += 1
    else:
        print(f"  MISSING key: {k!r}")

# Add com entry (new — for com' contraction)
if "com" not in m:
    m["com"] = fixes["com"]
    print("  Added new key: 'com'")
    applied += 1

with open(path, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print(f"\nApplied {applied} fixes. Total entries: {len(m)}")

# Verify no em-dashes or semicolons remain
remaining = {k: v for k, v in m.items() if '—' in v or ';' in v}
if remaining:
    print(f"\nWARNING: {len(remaining)} entries still have em-dash or semicolon:")
    for k, v in remaining.items():
        print(f"  {k!r}: {v!r}")
else:
    print("OK: no em-dashes or semicolons remain.")
