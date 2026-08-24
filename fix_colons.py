"""
Fix Rule 13 extension: remove colon-as-separator label pattern.
Every mnemonic must be a full story sentence — no 'ANCHOR: MEANING' shortcuts.
"""
import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

path = r"frontend/public/mnemonics.json"
with open(path, encoding='utf-8') as f:
    m = json.load(f)

fixes = {
    # ── a ─────────────────────────────────────────────────────────────────────
    "apparve":      "(apparire) An APPARITION APPEARED from nowhere and glowed in the dark.",
    "anchise":      "ANCHISES sounds like ANCHOR-EASE: he anchored the Trojan BLOODLINE for all of history.",
    "ambedui":      "An AMBIGUOUS DUO steps forward and BOTH of them remain completely unclear.",
    "augusto":      "AUGUST CAESAR walks in MAJESTIC strides and rules as the NOBLE emperor of Rome.",
    "autore":       "The AUTHOR writes alone at night and becomes the CREATOR of every story.",
    "aveva":        "(avere, archaic) She was AVID along every AVENUE and SHE HAD it all once.",
    "avea":         "(avere, archaic) She was AVID along every AVENUE and SHE HAD it all once.",

    # ── b ─────────────────────────────────────────────────────────────────────
    "belle":        "(bello) The BELLE of the ball dances BEAUTIFUL steps through the fairy-tale room.",

    # ── c ─────────────────────────────────────────────────────────────────────
    "ciascun":      "(ciascuno) In EACH SCENE of the play, EACH ONE performs their part separately.",
    "combusto":     "(comburere) COMBUSTION takes hold and everything gets BURNED and CONSUMED entirely.",
    "conoscesti":   "(conoscere) A CONNOISSEUR strides in and YOU KNEW and RECOGNIZED the finest wine.",
    "contenti":     "(contento) Stay CONTENT with what you have and feel SATISFIED and HAPPY inside.",
    "convien":      "(convenire) A CONVENIENT route opens when IT IS NECESSARY to make it work.",
    "corpo":        "A CORPSE lies still and shows what a BODY looks like when the life is gone.",
    "cosa":         "Every good CAUSE is a THING worth fighting for, she declared to the room.",
    "costui":       "COST YOU a fortune: THIS PERSON always makes you pay more than expected.",
    "cotanto":      "The QUOTA AMOUNT reached SO MUCH that it became SO GREAT beyond all measure.",
    "cui":          "The QUEUE forms and everyone wonders for WHOM they wait and for WHICH reason.",

    # ── d ─────────────────────────────────────────────────────────────────────
    "degna":        "(degno) She carries DIGNITY and proves herself WORTHY of every respect she earns.",
    "dilettoso":    "(diletto) A DELIGHTFUL scene unfolds around them, PLEASANT and enjoyable for all.",
    "diserta":      "(diserto) A DESERT stretches out, ABANDONED by rain and DESERTED by every creature.",
    "diserto":      "A DESERT spreads wide and the DESERTED wasteland stretches on without any end.",
    "disperate":    "(disperato) DESPERATE voices cry out as DESPAIRING people clutch at any last hope.",
    "divino":       "DIVINE light shines with GODLY perfection far beyond the reach of any human.",
    "durata":       "The DURATION stretches on and nobody can say how LONG this thing LASTS.",

    # ── e ─────────────────────────────────────────────────────────────────────
    "elegge":       "(eleggere) The crowd ELECTS by voting and voting CHOOSES and SELECTS the winner.",
    "esta":         "(questo, archaic) An ESTATE stands before her as THIS very property, THIS one.",
    "esto":         "(questo, archaic) She claims the ESTATE as THIS very property and calls it THIS one.",
    "etterno":      "(eterno) ETERNAL fire burns FOREVER and no one can foresee any end.",

    # ── f ─────────────────────────────────────────────────────────────────────
    "fame":         "FAMINE strikes and intense HUNGER spreads on a massive scale across the land.",
    "famoso":       "FAMOUS faces arrive and RENOWNED people fill every seat in the room.",
    "forte":        "Your FORTE rings out STRONG and LOUD when you play your very best card.",

    # ── g ─────────────────────────────────────────────────────────────────────
    "genti":        "(gente) The GENTRY arrives and all the PEOPLES and NATIONS stand tall together.",
    "giugne":       "(giungere) JUNE finally ARRIVES and summer heat wraps the whole city in warmth.",
    "giunto":       "(giungere) At the JUNCTION she ARRIVED and REACHED the crossroads at last.",
    "giusto":       "JUSTICE demands what is JUST and RIGHT, perfectly fair for all who stand before it.",
    "grame":        "(gramo) A GRAMMY award goes to WRETCHEDNESS and the grim prize celebrates grim work.",
    "gravezza":     "(grave) GRAVITY pulls with HEAVINESS and the BURDEN presses everyone steadily down.",
    "grida":        "(gridare) GRIDIRON players SHOUT at each other across the muddy field all game.",
    "gridai":       "(gridare) On the GRID I SHOUTED and my voice crossed the whole crowded space.",
    "gride":        "(gridare) On the GRID she CRIES out and her SHOUTS echo all around the walls.",

    # ── i ─────────────────────────────────────────────────────────────────────
    "il":           "An EEL slides past and THE slippery creature claims THE best spot in the water.",
    "impedisce":    "(impedire) An IMPEDIMENT blocks the road and it HINDERS every traveler who passes.",
    "imperador":    "(imperatore) The EMPEROR stands tall and COMMANDS all the lands that stretch below.",
    "invidia":      "She goes IN to watch VIDEO and watching others fills her with ENVY.",

    # ── l ─────────────────────────────────────────────────────────────────────
    "lago":         "A LAGOON stretches out as a calm LAKE sheltered perfectly from the storm.",
    "lasso":        "The LASSO drops from the WEARY cowboy's hand as he collapses on the dusty ground.",
    "legge":        "(leggere/legge) The LEDGER shows the LAW and he READS what GOVERNS the whole land.",
    "leone":        "LEON the LION rules as a proud king of beasts in the wild.",

    # ── m ─────────────────────────────────────────────────────────────────────
    "maestro":      "The MAESTRO lifts his baton and MASTERS the whole orchestra into silence.",
    "male":         "MALEVOLENT thoughts breed EVIL and BAD intentions spread through the crowd.",
    "malvagia":     "(malvagio) MALEVOLENT forces rise WICKED and EVIL, spreading vile darkness around.",
    "mantoani":     "(mantoano) The MANTUAN people of Mantua claim Virgil as their own great poet.",
    "meni":         "(menare) The MENU spreads wide and YOU LEAD everyone through the choices tonight.",
    "miei":         "(mio) MY EYE catches MY belongings lying scattered all across the table.",
    "miserere":     "MISERY descends and the crowd cries out to HAVE MERCY on all who suffer.",
    "molte":        "(molto) A MULTITUDE piles up as MANY things stack in one great heap, feminine.",
    "molti":        "(molto) MULTI-colored shirts fill the square as MANY people crowd noisily together.",
    "morir":        "(morire) The MORTUARY waits for all who TO DIE and get carried there at the end.",
    "mori":         "(morire) MOROSE and without hope, he DIED feeling deeply gloomy at the very end.",
    "morì":         "(morire) MOROSE and without hope, he DIED feeling deeply gloomy at the very end.",

    # ── n ─────────────────────────────────────────────────────────────────────
    "nacqui":       "(nascere) A natural KNACK appeared and I WAS BORN with that gift from the very start.",
    "natura":       "(natura) NATURE spreads out before them as the physical world exactly as it stands.",
    "nazion":       "(nazione) A NATION forms and the PEOPLE bind themselves together as one.",
    "noia":         "NOISE buzzes on and grows so ANNOYING and BORING that no one can ignore it.",
    "notte":        "A NOCTURNE plays and the piece carries the soul gently through the NIGHT.",

    # ── o ─────────────────────────────────────────────────────────────────────
    "ogne":         "(ogni, archaic) EVERY one stands on their OWN and EACH belongs to themselves.",
    "omo":          "(uomo) HOMO SAPIENS walks upright and proves himself a MAN of reason and wonder.",
    "onore":        "HONORABLE deeds earn HONOR and glory that lasts far beyond the grave.",
    "or":           "(ora) She says OR stay and do it NOW, right away while the moment is NOW.",

    # ── p ─────────────────────────────────────────────────────────────────────
    "parea":        "(parere) A PARABLE unfolded as a story that SEEMED full of deep meaning.",
    "parlar":       "(parlare) The PARLIAMENT gathers and SPEAKS for the whole nation at once.",
    "parti":        "(parte) A PARTITION divides the room into PARTS and LEAVES no open space.",
    "passar":       "(passare) At PASSOVER the people TO PASS and CROSS safely to the other side.",
    "pensier":      "(pensiero) A PENSIVE traveler sits lost in deep THOUGHT with no clear way out.",
    "perigliosa":   "(periglioso) PERILOUS roads twist DANGEROUS and RISKY at every single turn.",
    "pianeta":      "The PLANET spins and the whole world orbits around that PLANET in open space.",
    "podestate":    "(potere) A POTENT STATE holds all POWER and AUTHORITY above everyone below.",
    "porse":        "(porgere) She said POUR SOME into his cup and OFFERED an EXTENDED generous hand.",
    "porta":        "A PORTAL opens wide as a DOOR and GATE that leads to another world beyond.",

    # ── q ─────────────────────────────────────────────────────────────────────
    "quai":         "(quale) A QUAIL darts past and she asks WHICH bird that was exactly.",
    "quanto":       "QUANTIFY everything, she says, but nobody knows HOW MUCH is actually there.",
    "quelle":       "(quello) She tries to QUELL THOSE disturbances, all the feminine plural troubles.",
    "queta":        "(quieto) QUIET falls over the room and the space grows CALM and perfectly still.",
    "quivi":        "A QUIZ appears right HERE and IN THIS PLACE the test begins without warning.",

    # ── r ─────────────────────────────────────────────────────────────────────
    "rabbiosa":     "(rabbioso) A RABIES-infected dog runs FURIOUS and RABID, foaming at the mouth.",
    "rimessa":      "(rimettere) REMISSION comes and the sins get FORGIVEN and SENT BACK into the void.",
    "rimirar":      "(rimirare) She holds up the RE-MIRROR and starts TO GAZE AGAIN at her reflection.",
    "rinova":       "(rinnovare) A fresh wave arrives and RENEWS everything: it REFRESHES itself every spring.",
    "ripresi":      "(riprendere) The REPRISE plays again and I RESUMED and TOOK BACK full control.",
    "rispuos":      "(rispondere) RESPOND! He heard the cry and ANSWERED the call at once.",
    "rispuose":     "(rispondere) She had to RESPOND and she ANSWERED and REPLIED clearly to the question.",
    "riva":         "The RIVER BANK stretches out and she stands on the SHORE, feeling the BANK below.",
    "roma":         "ROME rises eternal across its seven hills for all the world to admire.",
    "rovinava":     "(rovinare) The whole RUIN WAS CRUMBLING and RUINING everything that once stood tall.",

    # ── s ─────────────────────────────────────────────────────────────────────
    "saggio":       "A SAGE steps forward and WISE old words full of WISDOM follow close behind.",
    "sara":         "(essere) SIR-AH bows low and IT WILL BE the Sir's final word on the matter.",
    "sarà":         "(essere) SIR-AH bows low and IT WILL BE the Sir's final word on the matter.",
    "saro":         "(essere) A knight gets dubbed SIR and I WILL BE loyal to the very end.",
    "sarò":         "(essere) A knight gets dubbed SIR and I WILL BE loyal to the very end.",
    "segui":        "(seguire) She watched the SEQUEL and urged everyone to FOLLOW the next chapter.",
    "selvaggia":    "(selvaggio) A SAVAGE beast runs WILD and SAVAGE, completely untamed and free.",
    "sol":          "(sole) A SOLO performer stands in the SUN, ONLY and ALONE on the vast stage.",
    "somma":        "A SUMMIT reaches the HIGHEST point and the SUPREME peak stands above everything.",
    "spandi":       "(spandere) EXPAND the wings and SPREAD them wide and far across the open sky.",
    "sperar":       "(sperare) She SPARES a moment of quiet HOPE and dares TO HOPE for better days.",
    "stelle":       "(stella) STELLAR light fills the night as STARS shine brilliantly above the earth.",
    "studio":       "The STUDIO holds a quiet room of STUDY and WORK where every creation happens.",
    "sub":          "A SUBMARINE dives BENEATH the waves and vanishes UNDER the surface without sound.",
    "suoi":         "(suo) A SOUVENIR sits in the drawer as HIS and HER keepsakes from the journey.",

    # ── t ─────────────────────────────────────────────────────────────────────
    "tal":          "(tale) A TALL TALE gets told and SUCH a story unfolds for everyone listening.",
    "tant":         "(tanto) A TANTRUM explodes with SUCH GREAT emotion unleashed all at once.",
    "tanto":        "TANTALIZE the crowd with SO MUCH promise and yet always keep it out of reach.",
    "temp":         "(tempo) The TEMPO of TIME beats its rhythm and nobody can slow it down.",
    "tempo":        "The TEMPO rises and the rhythm beats through every single second of TIME.",
    "terminava":    "(terminare) She called to TERMINATE and the run WAS ENDING and FINISHING without warning.",
    "terra":        "The TERRAIN spreads wide as EARTH and LAND stretch below the far horizon.",
    "test":         "(testa) The TEST lands on the HEAD of the list as the most important challenge.",
    "tremar":       "(tremare) A TREMOR hits and the ground TREMBLES and SHAKES under every foot.",
    "tuo":          "The TUTOR arrives as YOUR personal teacher and guides you through the whole lesson.",
    "turno":        "TURN comes for everyone and she waits patiently for her TURN to step forward.",
    "tutta":        "(tutto) TOTAL it all up and ALL of it adds to the whole complete thing.",
    "tutte":        "(tutto) TOTALLY committed: ALL things come together at once, feminine plural.",

    # ── u ─────────────────────────────────────────────────────────────────────
    "udirai":       "(udire) An AUDITORY test comes and YOU WILL HEAR every sound clearly.",
    "umile":        "(umile) WHO, ME? She shrugs and LAYS LOW, staying HUMBLE before the whole crowd.",

    # ── v ─────────────────────────────────────────────────────────────────────
    "vagliami":     "(valere) She cried out VALUE ME and prayed that MAY IT AVAIL and HELP ME now.",
    "valle":        "A VALLEY stretches wide and the low VALLEY dips between two mountain peaks.",
    "vederai":      "(vedere) A VIDEO plays and YOU WILL SEE the whole story unfold on screen.",
    "vedrai":       "(vedere) The VIDEO REEL starts rolling and YOU WILL SEE it all unfold.",
    "vegna":        "(venire, archaic) Rains COME to KENYA and LET IT COME, the farmer prays aloud.",
    "vene":         "(venire / vena) A VEIN runs deep and blood COMES through the VEINS without stopping.",
    "venisse":      "(venire) They said go to VENICE and everyone COMES to visit that floating city.",
    "venne":        "(venire) The VENUE filled as everyone CAME to the right meeting point at last.",
    "verace":       "(verace) VERA always tells the TRUTH and VERA speaks TRUTH every single time.",
    "vergine":      "A VIRGIN stands pure as an untouched MAIDEN before the whole world.",
    "vergognosa":   "(vergognoso) GONE in SHAME, she walked away ASHAMED and hid from every watching eye.",
    "verra":        "(venire) A VERANDA opens wide and it WILL COME right to your doorstep.",
    "verrà":        "(venire) A VERANDA opens wide and it WILL COME right to your doorstep.",
    "vi":           "VIA leads THERE and the road runs all the way to where you need to go.",
    "villa":        "A VILLA rises on the hill as a luxurious country ESTATE and grand HOUSE.",
    "virgilio":     "VIRGIL steps forward as the great Roman poet and Dante's steady guide.",
    "virtute":      "(virtu) VIRTUE shines as EXCELLENCE of character and shows its power.",
    "vissi":        "(vivere) With a VISA in hand I LIVED abroad for years on end.",
    "vista":        "A VISTA opens up and a stunning VIEW and SIGHT appear on the horizon.",
    "viaggio":      "(viaggio) A VOYAGE begins and the long JOURNEY takes them across the open sea.",
    "vïaggio":      "(viaggio) A VOYAGE begins and the long JOURNEY takes them across the open sea.",
    "volge":        "(volgere) The wheel REVOLVES and TURNS in endless circles all through the day.",
    "volsi":        "(volgere) VOLTS surged and I TURNED the electricity on with a single switch.",
    "volte":        "(volta) A VAULT arches above and TIMES and TURNS echo through the ancient stone.",
    "volto":        "(volto) A VOLT surges through and the FACE lights up with electric energy.",
    "vòlto":        "(volto) A VOLT surges through and the FACE lights up with electric energy.",
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

# Check for any remaining label-style colons after a CAPS word
import re
label_re = re.compile(r'[A-Z]{2,}[^a-z]*:')
remaining = {}
for k, v in m.items():
    stripped = re.sub(r'^\([^)]+\)\s*', '', v)
    if label_re.search(stripped):
        remaining[k] = v

if remaining:
    print(f"\nWARNING: {len(remaining)} entries still have CAPS-colon pattern:")
    for k, v in remaining.items():
        print(f"  {repr(k)}: {repr(v)}")
else:
    print("OK: no CAPS-colon label patterns remain.")

# Final check: no em-dashes or semicolons
bad = {k: v for k, v in m.items() if '—' in v or ';' in v}
if bad:
    print(f"\nWARNING: {len(bad)} entries still have em-dash or semicolon.")
else:
    print("OK: no em-dashes or semicolons.")
