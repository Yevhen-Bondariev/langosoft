"""Fix all remaining colons acting as separators in mnemonic stories."""
import json, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r"frontend/public/mnemonics.json"
with open(path, encoding='utf-8') as f:
    m = json.load(f)

fixes = {
    "acquista":   "(acquistare) An ACQUISITION form gets stamped and the company BUYS and ACQUIRES new land.",
    "aiutami":    "(aiutare) MY EYE burns and I cry out for someone to HELP ME before it gets worse.",
    "alta":       "(alto) The ALTA ski slope rises HIGH and steep above the valley floor.",
    "altro":      "An ALTERNATIVE route appears as ANOTHER path and something ELSE to follow.",
    "amara":      "(amaro) AMARETTO liqueur fills the glass with its BITTER almond taste.",
    "aveà":       "(avere) AVE Maria plays and she HAD a vision that sent her to her knees in awe.",
    "ben":        "(bene) Big BEN strikes the hour and all is WELL and TRULY on time.",
    "caccera":    "(cacciare) CATCH that rat! She WILL CHASE and HUNT it down through every room.",
    "caccerà":    "(cacciare) CATCH that rat! She WILL CHASE and HUNT it down through every room.",
    "calle":      "(calle) A narrow ALLEY squeezes between the walls as a LANE through the old quarter.",
    "campar":     "(campare) At CAMP she masters survival art and learns TO LIVE and SURVIVE in the wild.",
    "cercar":     "(cercare) The SEARCH party heads out and keeps SEEKING and SEARCHING through every corner.",
    "color":      "(coloro) A COLORFUL crowd gathers and THOSE PEOPLE arrive in every hue.",
    "colui":      "The COOL ONE steps forward and HE IS THE ONE they all want.",
    "come":       "She says COME as you are and HOW you dress matters less than who you truly are.",
    "contra":     "A CONTRARY opinion rises as she speaks AGAINST the mainstream view.",
    "cosi":       "A COZY chair wraps her in comfort and THIS is how she rests, SO at ease.",
    "così":       "A COZY chair wraps her in comfort and THIS is how she rests, SO at ease.",
    "costui":     "THIS PERSON will COST YOU a fortune and always makes you pay more than expected.",
    "coverta":    "(coprire) A COVERT operation keeps everything COVERED and HIDDEN from view.",
    "create":     "(creare) Things get CREATED from nothing and MADE out of pure void.",
    "di":         "A DIAMOND ring carries a tag that reads property OF the crown.",
    "dicesti":    "(dicere) He puffed his CHEST out and declared that YOU SAID it first.",
    "diritta":    "(diritto) A DIRECTOR points at the set and yells go STRAIGHT!",
    "di":         "A DIAMOND ring carries a tag that reads property OF the crown.",
    "dolente":    "(dolere) DO LENT together and the fast leaves the heart SAD and SORROWFUL.",
    "dolenti":    "(dolente, pl.) DO LENT together and the SAD and SORROWFUL people fast in grief.",
    "dura":       "(duro) DURABLE material proves its HARD and LASTING quality over years.",
    "duro":       "(durare) A DURABLE stone shows how to ENDURE and LAST forever against the elements.",
    "ed":         "EDWARD stands with his brother AND the rest of the family follows close behind.",
    "ella":       "ELLA Fitzgerald stepped to the mic and SHE sang beautifully for the whole crowd.",
    "fa":         "(fare) The FACTORY hums all day and IT MAKES and PRODUCES everything.",
    "face":       "(face) Beware that FAH-cheh is not a human face and it burns bright as a TORCH and FLAME.",
    "falsi":      "(falso) FALSE IDs appear as COUNTERFEIT and LYING documents in the pile.",
    "fara":       "(fare) The PHARAOH commands and the people WILL DO and MAKE it happen.",
    "farà":       "(fare) The PHARAOH commands and the people WILL DO and MAKE it happen.",
    "fatto":      "(fare) The FACTORY output arrives DONE and MADE, a completed FACT.",
    "fattore":    "(fare) The FACTORY owner rules as the MAKER and CREATOR of all output.",
    "fe":         "(fede, archaic) FEH, she sighs wearily and holds FAITH despite every single doubt.",
    "fé":         "(fede, archaic) FEH, she sighs wearily and holds FAITH despite every single doubt.",
    "felice":     "FELIX the cat grins wide, always HAPPY and FORTUNATE in every adventure.",
    "feltro":     "FELT fabric drapes softly and the grey FELT wraps around the shoulders.",
    "fia":        "(essere) FIAT issues a decree and IT WILL BE exactly as IT IS declared from above.",
    "figliuol":   "(figliuolo) You FEEL YOUR child's hand and hold my SON, my own dear boy, close.",
    "fin":        "(fine) The FINISH line appears and the END of the race draws near at last.",
    "fiume":      "The FLUME at the waterpark flows like a RIVER of pure fun for everyone.",
    "fonte":      "A FONT design springs from the SOURCE and FOUNTAIN of all creative style.",
    "fronte":     "The FRONTMAN takes the stage and stands at the FRONT with one hand on his FOREHEAD.",
    "gran":       "(grande) A GRANDE at Starbucks arrives BIG and GREAT for the morning rush.",
    "grande":     "A GRAND piano fills the stage and BIG and GREAT music pours through the room.",
    "guardai":    "(guardare) The GUARD takes position and I LOOKED and WATCHED carefully for any sign.",
    "gente":      "(gente) A GENTLE crowd gathers and all the PEOPLE, the whole FOLK, arrive.",
    "ha":         "(avere) AH! SHE HAS it now and the H stays silent so ha sounds like 'ah' for HAVE.",
    "ho":         "(avere) OH! I HAVE it now and the H stays silent so ho sounds like 'oh' for HAVE.",
    "infin":      "(in fine) INFINITE time passes and AT LAST it reaches the very end.",
    "intrate":    "(entrare) ENTER the gate now and YOU WHO ENTER step forward from the cold.",
    "io":         "(io) EGO shines bright and all about ME rises up as the great I speaks.",
    "iulio":      "JULIUS Caesar crossed the Rubicon and became the great Roman leader of all.",
    "è":          "E with a grave accent bows down and IT IS so, right here and now.",
    "lascero":    "(lasciare) The LASSO flies through the air and I WILL LET GO and LEAVE it behind.",
    "lascerò":    "(lasciare) The LASSO flies through the air and I WILL LET GO and LEAVE it behind.",
    "lascia":     "(lasciare) She LASHES out and says LEAVE it and LET GO of it right now.",
    "lascio":     "(lasciare) The LASSO dropped to the ground and it LEFT and LET GO of everything.",
    "lasciò":     "(lasciare) The LASSO dropped to the ground and it LEFT and LET GO of everything.",
    "lei":        "A LEI of flowers adorns her and SHE wears it with grace.",
    "li":         "The LEE shore shelters THEM all, standing right over there on the quiet side.",
    "loco":       "(luogo) The LOCATION sign points to the PLACE to be and everyone follows it.",
    "lombardi":   "LOMBARDY people stride forward as the LOMBARDS of northern Italy.",
    "lume":       "A LUMINOUS glow spreads LIGHT from a lamp across the darkened room.",
    "lungo":      "A LONG espresso stretches the taste ALONG the LONG route to the finish.",
    "lupa":       "LUPUS strikes like a SHE-WOLF prowling the night in search of prey.",
    "ma":         "The MAD runner crosses the line yelling BUT she is still so tired.",
    "magrezza":   "(magro) MEAGER rations leave the body in extreme THINNESS and LEANNESS.",
    "mai":        "NEVER again she vows and MAI means NEVER so she will not say it once.",
    "mesti":      "(mesto) MISTY sadness fills the room with SAD and SORROWFUL expressions.",
    "mio":        "(mio) OH ME, she gasps as IT IS MINE and all MINE at last.",
    "molto":      "MOLTEN lava flows with SO MUCH and VERY intense heat below.",
    "monte":      "MONT Blanc rises as a MOUNTAIN of ice and glory above the Alps.",
    "ne":         "NEITHER this option NOR that one gets a yes and NE connects both sides of the refusal.",
    "né":         "NEITHER this option NOR that one gets a yes and NE connects both sides of the refusal.",
    "non":        "NON-sense fills the room and things simply do NOT make any sense.",
    "nostra":     "NOSTRADAMUS waves his cape and cries that OUR fate is written in the stars.",
    "od":         "She makes an ODD choice and selects this OR that strange option.",
    "or":         "(ora) She says OR stay and do it NOW, right away while the moment is NOW.",
    "ove":        "(ove, archaic) OH, WHERE did it vanish and she searches everywhere for WHERE it went.",
    "partia":     "(partire) A PARTING scene unfolds as she WAS LEAVING and DEPARTING from sight.",
    "partire":    "The DEPARTURE gate opens and she steps through TO LEAVE and TO PART from here.",
    "pasto":      "PASTA fills the table and the hearty MEAL draws everyone to their seats.",
    "peltro":     "(peltro) The PELT ROW hangs grey and a dull TIN cup sits at the far end.",
    "piange":     "(piangere) PIANO strings shake with sorrow as she keeps WEEPING and CRYING out with sobs.",
    "poco":       "POCKET change jingles as just a LITTLE and FEW coins rattle around.",
    "prima":      "The PRIMA donna sweeps in as FIRST and BEFORE all others on the stage.",
    "principio":  "The PRINCIPAL rule marks the BEGINNING and PRINCIPLE of it all.",
    "primo":      "She stands at PRIME position as FIRST in line and the PRIMARY one of all.",
    "qual":       "(quale) A QUALITY check runs and asks WHICH standard actually applies here.",
    "quasi":      "QUASI-modo shuffles forward ALMOST and NEARLY normal in his own twisted way.",
    "quei":       "(quegli) THOSE strangers stand over there and THEY watch from a distance.",
    "quel":       "(quello) She says QUELL that noise and THAT particular one causes all the trouble.",
    "quella":     "(quello) She moves to QUELL it and THAT one gets silenced at last.",
    "questa":     "(questo) The QUEST begins and THIS is the mission they all signed up for.",
    "questi":     "(questo) The QUESTING knight charges forward and THIS one leads the whole mission.",
    "questo":     "The QUEST begins right here and she picks THIS one with her own hand.",
    "richeggio":  "(richiedere) RICKY demands respect and I REQUEST it from everyone in the room.",
    "rinova":     "(rinnovare) A fresh wave arrives and RENEWS everything as it REFRESHES itself every spring.",
    "ritornar":   "(ritornare) RETURN home and TO GO BACK to where everything first began.",
    "ritorni":    "(ritornare) A RETURN journey waits and you RETURN to the place you left behind.",
    "san":        "The SAINT steps forward as a SAINTLY person who is holy and truly blessed.",
    "saranno":    "(essere) SARAH AND the others stop waiting because THEY WILL BE together at last.",
    "seconda":    "A SECONDARY plan kicks in as SECOND best and ACCORDING TO the rules it works.",
    "selvaggio":  "A SAVAGE beast runs WILD and totally untamed through the forest.",
    "sembiava":   "(sembrare) A SAMBA dancer swept past and it SEEMED beautiful to everyone watching.",
    "sia":        "(essere) A SEA of possibility opens wherever it MAY BE and the journey begins.",
    "sii":        "(essere) SEE! Just BE yourself and the command says BE who you truly are.",
    "so":         "(sapere) SO here we are and I KNOW what you are thinking right now.",
    "solo":       "A SOLO artist stands ALONE and ONLY on the vast empty stage.",
    "son":        "(essere, archaic) I DRONE on and I AM the constant SOUND filling the air.",
    "spiriti":    "(spirito) The SPIRITUAL realm opens and SPIRITS and SOULS drift through its gates.",
    "stilo":      "A STYLUS pen moves with a fine STYLE as a PEN instrument of precision.",
    "sua":        "(suo) A SUAVE manner reveals HIS and HER smooth style in every gesture.",
    "superbo":    "A SUPERB achievement makes him PROUD and the MAGNIFICENT result earns applause.",
    "tardi":      "The TARDY student shuffles in LATE to every single class.",
    "tenere":     "A TENACIOUS grip shows how TO HOLD and KEEP something firmly in hand.",
    "tenni":      "(tenere) In the TENNIS match I HELD the racket tight through every game.",
    "ti":         "TI sounds out and this musical note plays FOR YOU alone.",
    "tolsi":      "(togliere) TOLL-SEE reveals the cost and I TOOK AWAY the TOLL from the road.",
    "trattar":    "(trattare) TREAT people well and TO TREAT and DEAL WITH them fairly at all times.",
    "troia":      "The TROJAN Horse opens and TROY falls to its legendary wooden trick.",
    "tu":         "TOO late she realizes that YOU arrive TOO early, always invited and never on time.",
    "tua":        "(tuo) A TUTU skirt spins and that little costume is all YOUR own.",
    "tutte":      "(tutto) TOTALLY committed she goes ALL in as ALL things come together, feminine plural.",
    "tutti":      "(tutto) TOOT your horn and EVERYONE joins in as ALL cheer together.",
    "un":         "ONE umbrella stands alone as A single thing in the rain.",
    "una":        "ONE unicorn trots past as A single magical creature among many.",
    "veltro":     "VELOCITY ROW shows raw speed and the greyhound RUNS at full VELOCITY.",
    "vestite":    "(vestire) A VESTED ceremony demands everyone be DRESSED and CLOTHED for the occasion.",
    "vita":       "VITO Corleone squeezes an orange and says this is LIFE, my friend.",
    "voglia":     "(volere) A VOLCANO of DESIRE erupts and she WANTS it with a burning WISH.",
    "volontieri": "A VOLUNTARY act gets done WILLINGLY and GLADLY without any complaint.",
    "volse":      "(volgere) VOLTS surged and the energy TURNED on at the flick of a switch.",
    "vuo":        "(volere) She tries to WOO someone and WANTS to charm them with every word.",
    "vuol":       "(volere) A WOOL coat hangs there and she WANTS the warm wrap for the cold ahead.",
    "ella":       "ELLA Fitzgerald stepped to the mic and SHE sang beautifully for the whole crowd.",
    "di":         "A DIAMOND ring carries a tag that reads property OF the crown.",
    "nostra":     "NOSTRADAMUS waves his cape and cries that OUR fate is written in the stars.",
    "vita":       "VITO Corleone squeezes an orange and says this is LIFE, my friend.",
}

applied = 0
missing = []
for k, v in fixes.items():
    if k in m:
        m[k] = v
        applied += 1
    else:
        missing.append(k)

if missing:
    print(f"Missing keys: {missing}")

with open(path, 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print(f"Applied {applied} fixes. Total entries: {len(m)}")

# Verify: find any remaining colons outside parenthetical prefix
import re
label_re = re.compile(r':')
remaining = {}
for k, v in m.items():
    stripped = re.sub(r'^\([^)]+\)\s*', '', v)
    if label_re.search(stripped):
        remaining[k] = v

if remaining:
    print(f"\nWARNING: {len(remaining)} entries still have colons:")
    for k, v in remaining.items():
        print(f"  {repr(k)}: {repr(v)}")
else:
    print("OK: no colons remain outside parenthetical prefixes.")
