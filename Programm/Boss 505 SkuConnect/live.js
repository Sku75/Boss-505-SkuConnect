// Boss 505 SkuConnect, Live-Studio.
//
// Arbeitet mit der Station in der Betriebsart AUDIO/MIDI. Zwei Dinge sind
// technisch möglich und werden hier genutzt:
//
//  1. Zuhören. Die Station meldet über MIDI, welcher Speicherplatz gewählt
//     wurde, und sendet den Takt. Mehr sendet sie nicht, ein sprechender
//     Spiegel des Displays ist darum nicht baubar.
//  2. Steuern. Boss 505 SkuConnect kann den Speicherplatz umschalten und Steuerbefehle
//     senden, die in den Zuweisungen des Speicherplatzes hinterlegt sind.
//
// Dazu kommt die Aufnahme: Das Ausgangssignal der Station kommt als
// USB-Audio am Rechner an und wird hier als WAV mitgeschnitten.

let midiZugang = null;
let midiEingang = null;
let midiAusgang = null;
let midiKanal = 0;          // 0 heißt MIDI-Kanal 1
let ansagerAn = true;
let letzterPlatz = null;

// Tempo aus der MIDI-Uhr. Die Station sendet 24 Takte je Viertelnote.
let uhrZeiten = [];
let aktuellesTempo = null;

// Metronom. Es zählt die MIDI-Uhr der Station mit: 24 Zeichen sind eine
// Viertelnote, also ein Schlag. Kommt keine Uhr an, läuft es auf eigenem
// Tempo mit einer Zeitschaltung. Der erste Schlag im Takt klingt höher.
let metronomAn = false;
let metronomTakt = 4;             // Schläge je Takt
let metronomKlang = "klick";      // klick, holz oder ton
let metronomLaut = 0.5;
let metronomQuelle = "station";   // station oder eigen
let metronomTempo = 120;
let metronomSchlag = 0;           // 0 ist der erste Schlag im Takt
let uhrZeichen = 0;
let letzteUhr = 0;
let eigenerTakter = null;
let tonKontext = null;

// Wohin Windows den Ton des Rechners schickt. Aus heisst Kopfhoerer am
// Rechner, An heisst in die Station. Mit An und USB Audio Routing auf
// LOOP IN laesst sich eine Datei vom Rechner in eine Spur aufnehmen.
let usbTonZurStation = false;

// Effekte im Spielbetrieb. Die Station meldet nichts zurueck, darum fuehrt
// das Programm den Stand selbst mit. Grundlage ist die Ruecklage der
// Stationsdaten. Was am Geraet gedrueckt wird, sieht es nicht, darum gibt es
// Stand neu einlesen.
//
// Die Nummern muessen zu den Zuweisungen passen, die main.js schreibt.
const FX_CC = {
  input: { anaus: 20, weiter: 22, zurueck: 23, typWeiter: 26, typZurueck: 27, regler: 30 },
  track: { anaus: 21, weiter: 24, zurueck: 25, typWeiter: 28, typZurueck: 29, regler: 31 }
};

let fxStand = null;

// FX-Regler-Ansage. Die Station schickt beim Drehen Control Change, oft
// viele kurz hintereinander, darum wird die Ansage gebremst.
let fxAnsageAn = false;
let letzteFxAnsage = 0;

// --- Verbinden ---

async function midiVerbinden(li) {
  if (!navigator.requestMIDIAccess) {
    ergebnis(li, "MIDI nicht verfügbar", ["Dieser Rechner bietet keinen MIDI-Zugang"]);
    return;
  }
  try {
    midiZugang = await navigator.requestMIDIAccess({ sysex: false });
  } catch (fehler) {
    ergebnis(li, "MIDI verweigert", ["Zugriff verweigert", String(fehler.message || fehler)]);
    return;
  }

  midiEingang = null;
  midiAusgang = null;
  const namen = [];
  for (const anschluss of midiZugang.inputs.values()) {
    namen.push("Eingang: " + anschluss.name);
    if (/RC-?505/i.test(anschluss.name) && !midiEingang) midiEingang = anschluss;
  }
  for (const anschluss of midiZugang.outputs.values()) {
    namen.push("Ausgang: " + anschluss.name);
    if (/RC-?505/i.test(anschluss.name) && !midiAusgang) midiAusgang = anschluss;
  }
  if (midiEingang) midiEingang.onmidimessage = midiEmpfang;

  if (midiEingang || midiAusgang) {
    ergebnis(li, "MIDI verbunden", [
      "Station über MIDI verbunden",
      midiEingang ? "Zuhören möglich" : "Kein Eingang gefunden",
      midiAusgang ? "Steuern möglich" : "Kein Ausgang gefunden",
      "MIDI-Kanal " + (midiKanal + 1)
    ].concat(namen));
  } else {
    ergebnis(li, "Keine Station am MIDI", [
      "Keine RC-505 am MIDI gefunden",
      "Die Station muss in der Betriebsart AUDIO/MIDI angeschlossen sein",
      "Am Gerät: 1.3 ein Mal, 1.2 acht Mal, Regler auf Audio und MIDI, 2.2"
    ].concat(namen.length ? namen : ["Keine MIDI-Anschlüsse vorhanden"]));
  }
}

// Verbindet MIDI leise im Hintergrund, ohne Ansage. Dadurch weiß Boss 505 SkuConnect
// jederzeit, ob die Station im Audio-Modus da ist, und meldet Änderungen
// sofort statt erst beim nächsten Blick.
async function midiStillVerbinden() {
  if (!navigator.requestMIDIAccess) return false;
  try {
    if (!midiZugang) midiZugang = await navigator.requestMIDIAccess({ sysex: false });
  } catch { return false; }
  midiEingang = null;
  midiAusgang = null;
  for (const a of midiZugang.inputs.values()) {
    if (/RC-?505/i.test(a.name) && !midiEingang) midiEingang = a;
  }
  for (const a of midiZugang.outputs.values()) {
    if (/RC-?505/i.test(a.name) && !midiAusgang) midiAusgang = a;
  }
  if (midiEingang) midiEingang.onmidimessage = midiEmpfang;
  return !!(midiEingang || midiAusgang);
}

// Ist die Station gerade als MIDI-Gerät da?
function midiHatStation() {
  if (!midiZugang) return false;
  for (const a of midiZugang.inputs.values()) if (/RC-?505/i.test(a.name)) return true;
  for (const a of midiZugang.outputs.values()) if (/RC-?505/i.test(a.name)) return true;
  return false;
}

// --- Zuhören ---

function midiEmpfang(nachricht) {
  const d = nachricht.data;
  const art = d[0] & 0xf0;

  // Uhr: 24 Zeichen je Viertelnote, daraus das Tempo errechnen.
  if (d[0] === 0xf8) {
    uhrZeiten.push(nachricht.timeStamp);
    if (uhrZeiten.length > 25) uhrZeiten.shift();
    if (uhrZeiten.length === 25) {
      const dauer = uhrZeiten[24] - uhrZeiten[0];   // eine Viertelnote
      if (dauer > 0) aktuellesTempo = 60000 / dauer;
    }
    letzteUhr = Date.now();
    uhrZeichen++;
    if (uhrZeichen >= 24) {
      uhrZeichen = 0;
      if (metronomAn && metronomQuelle === "station") metronomSchlagen();
    }
    return;
  }

  // Control Change kommt von den FX-Reglern, vom Expression-Pedal und von
  // Fußschaltern an CTL 1,2. Mehr sendet die Station nicht.
  if (art === 0xb0) {
    if (fxAnsageAn) {
      const jetzt = Date.now();
      if (jetzt - letzteFxAnsage > 350) {
        letzteFxAnsage = jetzt;
        sage("Regler " + d[1] + ", " + d[2]);
      }
    }
    return;
  }

  // Programmwechsel: die Station meldet den gewählten Speicherplatz.
  // Das ist zugleich die Bestätigung für einen Befehl, den wir gesendet haben.
  if (art === 0xc0) {
    const platz = d[1] + 1;
    if (wartetAufPlatz && wartetAufPlatz.nummer === platz) {
      wartetAufPlatz.melden(true);
      wartetAufPlatz = null;
      letzterPlatz = platz;
      return;
    }
    if (platz !== letzterPlatz) {
      letzterPlatz = platz;
      if (ansagerAn) sage(platzBeschreibung(platz));
    }
    return;
  }

  if (d[0] === 0xfa) {
    uhrZeichen = 0;
    metronomSchlag = 0;
    if (ansagerAn) sage("Start");
  }
  if (d[0] === 0xfc && ansagerAn) sage("Stopp");
}

// Ein Schlag. Der erste im Takt bekommt eine höhere Tonlage, damit man
// den Taktanfang hört, ohne mitzuzählen.
function metronomSchlagen() {
  const betont = metronomSchlag === 0;
  metronomSchlag = (metronomSchlag + 1) % metronomTakt;
  tonGeben(betont);
}

function tonGeben(betont) {
  try {
    if (!tonKontext) tonKontext = new (window.AudioContext || window.webkitAudioContext)();
    const k = tonKontext;
    const jetzt = k.currentTime;
    const huelle = k.createGain();
    huelle.connect(k.destination);

    if (metronomKlang === "holz") {
      // Rauschstoß, klingt wie ein Holzblock.
      const laenge = Math.floor(k.sampleRate * 0.03);
      const puffer = k.createBuffer(1, laenge, k.sampleRate);
      const daten = puffer.getChannelData(0);
      for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * (1 - i / laenge);
      const quelle = k.createBufferSource();
      quelle.buffer = puffer;
      const filter = k.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = betont ? 2400 : 1500;
      filter.Q.value = 6;
      quelle.connect(filter); filter.connect(huelle);
      huelle.gain.setValueAtTime(metronomLaut, jetzt);
      huelle.gain.exponentialRampToValueAtTime(0.0001, jetzt + 0.05);
      quelle.start(jetzt); quelle.stop(jetzt + 0.06);
      return;
    }

    const schwinger = k.createOscillator();
    schwinger.type = metronomKlang === "ton" ? "sine" : "square";
    schwinger.frequency.value = metronomKlang === "ton"
      ? (betont ? 880 : 587) : (betont ? 1600 : 1000);
    schwinger.connect(huelle);
    const dauer = metronomKlang === "ton" ? 0.09 : 0.03;
    huelle.gain.setValueAtTime(metronomLaut, jetzt);
    huelle.gain.exponentialRampToValueAtTime(0.0001, jetzt + dauer);
    schwinger.start(jetzt);
    schwinger.stop(jetzt + dauer + 0.01);
  } catch (f) {
    // Ohne Tonausgabe bleibt das Metronom still, es soll nichts abbrechen.
  }
}

function eigenenTakterStellen() {
  if (eigenerTakter) { clearInterval(eigenerTakter); eigenerTakter = null; }
  if (metronomAn && metronomQuelle === "eigen") {
    eigenerTakter = setInterval(metronomSchlagen, 60000 / metronomTempo);
  }
}

function metronomUmschalten(li) {
  metronomAn = !metronomAn;
  metronomSchlag = 0;
  uhrZeichen = 0;
  eigenenTakterStellen();
  li.dataset.text = "Metronom: " + (metronomAn ? "An" : "Aus");
  aktualisiereZeile(li);
  const zeilen = ["Metronom " + (metronomAn ? "eingeschaltet" : "ausgeschaltet")];
  if (metronomAn) {
    zeilen.push(metronomTakt + " Schläge je Takt, Klang " + metronomKlang);
    if (metronomQuelle === "station") {
      zeilen.push("Läuft auf der Uhr der Station");
      zeilen.push(uhrLaeuft() ? "Die Uhr kommt gerade an"
        : "Es kommt keine Uhr an, der Rhythmus oder eine Schleife muss laufen");
    } else {
      zeilen.push("Läuft auf eigenem Tempo " + metronomTempo);
    }
    zeilen.push("Der Ton geht dorthin, wo Windows die Wiedergabe hat");
  }
  ergebnis(li, "Metronom " + (metronomAn ? "an" : "aus"), zeilen);
}

// Schaltet das Wiedergabegeraet von Windows um. Die Sprachausgabe folgt
// dem Standardgeraet, wenn sie nicht fest auf den Kopfhoerer gestellt ist.
async function usbTonUmschalten(li) {
  const nachStation = !usbTonZurStation;
  const suche = nachStation ? "RC-505" : HOERGERAET;
  const e = await window.skuConnect.audioGeraete("setze", suche, "wiedergabe");
  if (!e.gesetzt) {
    ergebnis(li, "Gerät nicht gefunden", [
      "Das Wiedergabegerät " + suche + " ist gerade nicht da",
      nachStation ? "Steht die Station im Bühnen-Modus?" : "Steckt der Dongle?"
    ]);
    return;
  }
  usbTonZurStation = nachStation;
  li.dataset.text = "USB-Ton zur Station: " + (nachStation ? "An" : "Aus");
  aktualisiereZeile(li);
  ergebnis(li, nachStation ? "Ton geht in die Station" : "Ton geht auf den Kopfhörer",
    nachStation
      ? ["Windows hört: " + e.gesetzt,
         "Alles vom Rechner läuft jetzt über USB in die Station",
         "Mit USB Audio Routing auf LOOP IN landet es im Looper",
         "Routing umstellen: SYSTEM, vierzehn Mal Pfeil rechts, Regler auf LOOP IN",
         "Die Sprachausgabe folgt mit, wenn sie nicht fest auf dem Kopfhörer steht"]
      : ["Windows hört: " + e.gesetzt,
         "Der Rechner schickt nichts mehr in die Station"]);
}

function uhrLaeuft() {
  return Date.now() - letzteUhr < 1500;
}

function fxAnsageUmschalten(li) {
  fxAnsageAn = !fxAnsageAn;
  li.dataset.text = "FX-Regler ansagen: " + (fxAnsageAn ? "An" : "Aus");
  aktualisiereZeile(li);
  ergebnis(li, "FX-Regler " + (fxAnsageAn ? "an" : "aus"), [
    "Ansage der Reglerbewegungen " + (fxAnsageAn ? "eingeschaltet" : "ausgeschaltet"),
    "Gilt für die FX-Regler, das Expression-Pedal und Fußschalter an CTL 1,2",
    "Gesagt wird die Reglernummer und der Wert, höchstens drei Mal je Sekunde"
  ]);
}

function metronomWert(li) {
  const was = li.dataset.ziel;
  const wert = li.dataset.nummer;
  if (was === "takt") { metronomTakt = parseInt(wert, 10); metronomSchlag = 0;
    sage(metronomTakt + " Schläge je Takt"); return; }
  if (was === "klang") { metronomKlang = wert; tonGeben(true);
    sage("Klang " + wert); return; }
  if (was === "laut") { metronomLaut = parseInt(wert, 10) / 100; tonGeben(true);
    sage("Lautstärke " + wert); return; }
  if (was === "quelle") { metronomQuelle = wert; eigenenTakterStellen();
    sage(wert === "station" ? "Uhr der Station" : "Eigenes Tempo"); return; }
  if (was === "tempo") { metronomTempo = parseInt(wert, 10); eigenenTakterStellen();
    sage("Tempo " + metronomTempo); return; }
}

function uhrPruefen(li) {
  const laeuft = uhrLaeuft();
  ergebnis(li, laeuft ? "Die Uhr kommt an" : "Keine Uhr", laeuft
    ? ["Die Station sendet die MIDI-Uhr",
       "Tempo " + (aktuellesTempo ? aktuellesTempo.toFixed(1).replace(".", ",") : "noch unbekannt"),
       "Das Metronom kann auf der Uhr der Station laufen"]
    : ["Es kommt gerade keine MIDI-Uhr an",
       "Die Station sendet sie nur, wenn der Rhythmus oder eine Schleife läuft",
       "Ist MIDI verbunden?",
       "Sonst das Metronom auf eigenes Tempo stellen"]);
}

function fxBankName(bank) { return bank === "input" ? "Input FX" : "Track FX"; }

function fxTypName(nummer) {
  const liste = (typeof FX_TYPEN !== "undefined") ? FX_TYPEN : [];
  return liste[nummer] !== undefined ? liste[nummer] : "Effekt " + nummer;
}

// Liest eine Effektbank aus den Werten eines Speicherplatzes. Im
// Multi-Betrieb gelten andere Felder als im Einzel-Betrieb, darum beides.
function fxBankLesen(d) {
  const zahl = (x, standard) => {
    const n = parseInt(x, 10);
    return isNaN(n) ? standard : n;
  };
  const multi = zahl(d.Mod, 1) === 0;
  return {
    multi,
    sw: multi ? zahl(d.MltSw, 0) : zahl(d.Sw, 0),
    sel: zahl(d.Sel, 0),
    typ: multi ? [zahl(d.MltTyp1, 0), zahl(d.MltTyp2, 0), zahl(d.MltTyp3, 0)]
               : [zahl(d.Typ1, 0), zahl(d.Typ2, 0), zahl(d.Typ3, 0)]
  };
}

// Holt den Stand aus der Ruecklage der Stationsdaten. Im Spielbetrieb gibt es
// kein Laufwerk, darum ist die Ruecklage die einzige Quelle. Sie stammt vom
// letzten Besuch in der Werkstatt.
async function fxEinlesen(li) {
  const eigen = await window.skuConnect.datenordner();
  if (!eigen.ok || !eigen.vorhanden) {
    if (li) ergebnis(li, "Keine Rücklage", [
      "Es liegt kein Stand der Station im Datenordner",
      "Einmal in der Werkstatt Station suchen wählen, dann ist er da"]);
    return false;
  }
  const platz = letzterPlatz || 1;
  const e = await window.skuConnect.speicherplatzLesen(eigen.pfad, platz);
  if (!e.ok) {
    if (li) ergebnis(li, "Fehler beim Einlesen", ["Fehler", e.fehler]);
    return false;
  }
  fxStand = {
    platz,
    input: fxBankLesen(e.daten.INPUT_FX || {}),
    track: fxBankLesen(e.daten.TRACK_FX || {})
  };
  if (li) {
    const i = fxStand.input, t = fxStand.track;
    ergebnis(li, "Stand von Platz " + platz + " eingelesen", [
      "Platz " + platz,
      "Input FX " + (i.multi ? "Multi" : "Einzel")
        + ", A " + fxTypName(i.typ[0]) + ", B " + fxTypName(i.typ[1]) + ", C " + fxTypName(i.typ[2]),
      "Track FX " + (t.multi ? "Multi" : "Einzel")
        + ", A " + fxTypName(t.typ[0]) + ", B " + fxTypName(t.typ[1]) + ", C " + fxTypName(t.typ[2]),
      "Gelesen aus der Rücklage, nicht aus der Station",
      "Nach Änderungen am Gerät noch einmal einlesen"]);
  }
  return true;
}

function warte(ms) { return new Promise(f => window.setTimeout(f, ms)); }

// Ein Tastendruck als Control Change: erst gedrueckt, dann gelassen.
async function ccPuls(nummer) {
  if (!midiSenden([0xb0 | midiKanal, nummer, 127])) return false;
  await warte(12);
  midiSenden([0xb0 | midiKanal, nummer, 0]);
  await warte(12);
  return true;
}

function fxBereit(li) {
  if (!midiAusgang) {
    ergebnis(li, "Nicht verbunden", ["Kein MIDI-Ausgang", "Erst MIDI verbinden wählen"]);
    return false;
  }
  if (!fxStand) {
    ergebnis(li, "Stand nicht eingelesen", [
      "Erst Stand neu einlesen wählen",
      "Sonst weiß das Programm nicht, welcher Effekt wo liegt"]);
    return false;
  }
  return true;
}

async function fxAnAus(li, an) {
  const bank = li.dataset.ziel;
  if (!fxBereit(li)) return;
  const cc = FX_CC[bank].anaus;
  if (!midiSenden([0xb0 | midiKanal, cc, an ? 127 : 0])) return;
  const b = fxStand[bank];
  b.sw = an ? (b.multi ? 7 : 1) : 0;
  ergebnis(li, fxBankName(bank) + (an ? " ein" : " aus"), [
    fxBankName(bank) + (an ? " eingeschaltet" : " ausgeschaltet"),
    "Gesendet: CC " + cc + " auf " + (an ? 127 : 0),
    b.multi ? "Multi-Betrieb, alle drei Tasten zusammen" : "Einzel-Betrieb, Taste "
      + "ABC".charAt(b.sel) + ", " + fxTypName(b.typ[b.sel])]);
}

// Schaltet die gewaehlte Taste weiter, bis die gewuenschte erreicht ist.
async function fxTaste(li) {
  const bank = li.dataset.ziel;
  if (!fxBereit(li)) return;
  const ziel = parseInt(li.dataset.nummer, 10) - 1;
  const b = fxStand[bank];
  let schritte = 0;
  while (b.sel !== ziel && schritte < 3) {
    const vor = (ziel - b.sel + 3) % 3 <= 1;
    if (!await ccPuls(vor ? FX_CC[bank].weiter : FX_CC[bank].zurueck)) return;
    b.sel = (b.sel + (vor ? 1 : 2)) % 3;
    schritte++;
  }
  ergebnis(li, fxBankName(bank) + " Taste " + "ABC".charAt(b.sel) + ", " + fxTypName(b.typ[b.sel]),
    [fxBankName(bank) + ", Taste " + "ABC".charAt(b.sel),
     "Effekt " + fxTypName(b.typ[b.sel]),
     schritte + (schritte === 1 ? " Schritt" : " Schritte") + " gesendet",
     b.multi ? "Im Multi-Betrieb schaltet das nur die Auswahl, nicht ein oder aus" : ""]
      .filter(Boolean));
}

// Schaltet den Effekttyp der gewaehlten Taste bis zum Ziel weiter. Die
// Station kennt nur weiter und zurueck, darum zaehlt das Programm die
// Schritte und schickt sie in einem Zug.
async function fxTyp(li) {
  const bank = li.dataset.ziel;
  if (!fxBereit(li)) return;
  const ziel = parseInt(li.dataset.nummer, 10);
  const b = fxStand[bank];
  const jetzt = b.typ[b.sel];
  const anzahl = (typeof FX_TYPEN !== "undefined") ? FX_TYPEN.length : 31;
  let vorwaerts = ((ziel - jetzt + anzahl) % anzahl);
  let rueckwaerts = ((jetzt - ziel + anzahl) % anzahl);
  const vor = vorwaerts <= rueckwaerts;
  const schritte = vor ? vorwaerts : rueckwaerts;
  if (schritte === 0) {
    ergebnis(li, "Steht schon auf " + fxTypName(ziel), null);
    return;
  }
  sage("Schalte auf " + fxTypName(ziel));
  for (let i = 0; i < schritte; i++) {
    if (!await ccPuls(vor ? FX_CC[bank].typWeiter : FX_CC[bank].typZurueck)) return;
  }
  b.typ[b.sel] = ziel;
  ergebnis(li, fxBankName(bank) + " Taste " + "ABC".charAt(b.sel) + ", " + fxTypName(ziel), [
    fxBankName(bank) + ", Taste " + "ABC".charAt(b.sel),
    "Jetzt " + fxTypName(ziel) + ", vorher " + fxTypName(jetzt),
    schritte + (vor ? " Schritte vorwärts" : " Schritte zurück"),
    "Mit WRITE am Gerät bleibt das im Speicherplatz"]);
}

async function fxWert(li) {
  const bank = li.dataset.ziel;
  if (!fxBereit(li)) return;
  const wert = parseInt(li.dataset.nummer, 10);
  const cc = FX_CC[bank].regler;
  const midiwert = Math.round(wert * 1.27);
  if (!midiSenden([0xb0 | midiKanal, cc, Math.min(127, midiwert)])) return;
  ergebnis(li, fxBankName(bank) + " Reglerwert " + wert, [
    fxBankName(bank) + ", Reglerwert " + wert,
    "Gesendet: CC " + cc + " auf " + midiwert,
    "Wirkt auf den Parameter, der am FX-Regler hängt"]);
}

function tempoAnsagen(li) {
  if (aktuellesTempo === null) {
    ergebnis(li, "Kein Tempo empfangen", [
      "Die Station sendet gerade keine MIDI-Uhr",
      "Der Rhythmus oder eine Schleife muss laufen"
    ]);
    return;
  }
  const bpm = Math.round(aktuellesTempo * 10) / 10;
  ergebnis(li, String(bpm).replace(".", ",") + " BPM", [
    "Tempo " + String(bpm).replace(".", ",") + " BPM",
    letzterPlatz ? "Platz " + letzterPlatz : "Platz noch nicht gemeldet"
  ]);
}

function platzAnsagen(li) {
  if (letzterPlatz === null) {
    ergebnis(li, "Noch kein Platz gemeldet", [
      "Die Station meldet den Platz erst beim Umschalten",
      "Dafür muss am Gerät MIDI PC Out auf An stehen"
    ]);
    return;
  }
  ergebnis(li, platzBeschreibung(letzterPlatz), ["Zuletzt gemeldet: " + platzBeschreibung(letzterPlatz)]);
}

// --- Steuern ---

function midiSenden(bytes) {
  if (!midiAusgang) { sage("Nicht verbunden"); return false; }
  midiAusgang.send(bytes);
  return true;
}

// Wartet nach dem Senden auf die Rückmeldung der Station. Sie meldet einen
// Speicherplatzwechsel von sich aus, sofern am Gerät die Einstellung
// Speicherplatz per MIDI melden auf An steht. Damit wissen wir sicher, ob der
// Befehl angekommen ist, statt nur zu hoffen.
let wartetAufPlatz = null;

async function platzUmschalten(li) {
  const platz = parseInt(li.dataset.ziel, 10);
  if (!midiAusgang) {
    ergebnis(li, "Nicht verbunden", ["Kein MIDI-Ausgang", "Erst MIDI verbinden wählen"]);
    return;
  }

  const bestaetigung = new Promise((fertig) => {
    wartetAufPlatz = { nummer: platz, melden: fertig };
    window.setTimeout(() => {
      if (wartetAufPlatz && wartetAufPlatz.nummer === platz) {
        wartetAufPlatz = null;
        fertig(false);
      }
    }, 1200);
  });

  midiSenden([0xc0 | midiKanal, platz - 1]);
  const bestaetigt = await bestaetigung;
  letzterPlatz = platz;

  if (bestaetigt) {
    ergebnis(li, platzBeschreibung(platz), [
      platzBeschreibung(platz),
      "Von der Station bestätigt"
    ]);
  } else {
    ergebnis(li, platzBeschreibung(platz) + ", nicht bestätigt", [
      platzBeschreibung(platz),
      "Der Befehl wurde gesendet, die Station hat nicht zurückgemeldet",
      "Am Gerät muss Speicherplatz per MIDI melden auf An stehen",
      "Zu finden in der Werkstatt unter Systemeinstellungen, MIDI"
    ]);
  }
}

function steuerbefehlSenden(li) {
  const nummer = parseInt(li.dataset.nummer, 10);
  const wert = parseInt(li.dataset.ziel, 10);
  if (!midiSenden([0xb0 | midiKanal, nummer, wert])) return;
  ergebnis(li, "CC " + nummer + " auf " + wert, [
    "Steuerbefehl gesendet", "CC-Nummer " + nummer, "Wert " + wert,
    "Wirkt nur, wenn dieser Befehl im Speicherplatz zugewiesen ist"
  ]);
}

function kanalSetzen(li) {
  midiKanal = parseInt(li.dataset.ziel, 10);
  ergebnis(li, "MIDI-Kanal " + (midiKanal + 1), ["MIDI-Kanal " + (midiKanal + 1) + " eingestellt"]);
}

function ansagerUmschalten(li) {
  ansagerAn = !ansagerAn;
  li.dataset.text = "Ansager: " + (ansagerAn ? "An" : "Aus");
  aktualisiereZeile(li);
  ergebnis(li, "Ansager " + (ansagerAn ? "an" : "aus"), [
    "Ansager " + (ansagerAn ? "eingeschaltet" : "ausgeschaltet"),
    "Sagt Platzwechsel, Start und Stopp an"
  ]);
}

// --- Aufnahme des Ausgangssignals über USB-Audio ---

let aufnahmeKontext = null;
let aufnahmeQuelle = null;
let aufnahmeKnoten = null;
let aufnahmeStrom = null;
let aufnahmeBloecke = [];
let aufnahmeRate = 44100;
let aufnahmeLaeuft = false;

async function aufnahmeStarten(li) {
  if (aufnahmeLaeuft) { sage("Läuft schon"); return; }
  let geraete;
  try {
    // Einmal fragen, damit die Namen der Geräte sichtbar werden.
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop());
    geraete = (await navigator.mediaDevices.enumerateDevices())
      .filter(g => g.kind === "audioinput");
  } catch (fehler) {
    ergebnis(li, "Kein Zugriff auf Audio", ["Fehler", String(fehler.message || fehler)]);
    return;
  }

  const station = geraete.find(g => /RC-?505/i.test(g.label));
  if (!station) {
    ergebnis(li, "Station nicht als Audiogerät gefunden", [
      "Kein Eingang mit RC-505 im Namen",
      "Die Station muss in der Betriebsart AUDIO/MIDI angeschlossen sein"
    ].concat(geraete.map(g => "Gefunden: " + (g.label || "ohne Namen"))));
    return;
  }

  try {
    aufnahmeStrom = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: station.deviceId }, echoCancellation: false,
               noiseSuppression: false, autoGainControl: false }
    });
  } catch (fehler) {
    ergebnis(li, "Aufnahme nicht möglich", ["Fehler", String(fehler.message || fehler)]);
    return;
  }

  aufnahmeKontext = new AudioContext();
  aufnahmeRate = aufnahmeKontext.sampleRate;
  aufnahmeQuelle = aufnahmeKontext.createMediaStreamSource(aufnahmeStrom);
  aufnahmeKnoten = aufnahmeKontext.createScriptProcessor(4096, 2, 2);
  aufnahmeBloecke = [];
  aufnahmeKnoten.onaudioprocess = (e) => {
    aufnahmeBloecke.push([
      new Float32Array(e.inputBuffer.getChannelData(0)),
      new Float32Array(e.inputBuffer.getChannelData(1))
    ]);
  };
  aufnahmeQuelle.connect(aufnahmeKnoten);
  // Ein stummer Ausgang, damit der Knoten läuft, ohne etwas zu hören.
  const stumm = aufnahmeKontext.createGain();
  stumm.gain.value = 0;
  aufnahmeKnoten.connect(stumm);
  stumm.connect(aufnahmeKontext.destination);

  aufnahmeLaeuft = true;
  ergebnis(li, "Aufnahme läuft", ["Aufnahme gestartet", station.label, aufnahmeRate + " Hertz"]);
}

async function aufnahmeStoppen(li) {
  if (!aufnahmeLaeuft) { sage("Keine Aufnahme"); return; }
  aufnahmeLaeuft = false;
  try { aufnahmeKnoten.disconnect(); aufnahmeQuelle.disconnect(); } catch { /* egal */ }
  aufnahmeStrom.getTracks().forEach(t => t.stop());
  await aufnahmeKontext.close();

  let anzahl = 0;
  for (const b of aufnahmeBloecke) anzahl += b[0].length;
  if (!anzahl) { ergebnis(li, "Nichts aufgenommen", null); return; }

  const sekunden = anzahl / aufnahmeRate;
  const wahl = await window.skuConnect.dateiWaehlen(true, "Boss 505 SkuConnect Aufnahme.wav");
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }

  const daten = wavBauen(aufnahmeBloecke, anzahl, aufnahmeRate);
  const e = await window.skuConnect.wavSchreiben(wahl.pfad, daten);
  aufnahmeBloecke = [];
  if (!e.ok) { ergebnis(li, "Speichern fehlgeschlagen", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Aufnahme gespeichert, " + Math.round(sekunden) + " Sekunden", [
    "Aufnahme gespeichert", Math.round(sekunden) + " Sekunden",
    Math.round(daten.length / 1024) + " Kilobyte", "Datei: " + wahl.pfad
  ]);
}

// Baut aus den gesammelten Blöcken eine fertige WAV-Datei, 16 Bit Stereo.
function wavBauen(bloecke, anzahl, rate) {
  const kopf = 44;
  const puffer = new Uint8Array(kopf + anzahl * 4);
  const sicht = new DataView(puffer.buffer);
  const text = (pos, s) => { for (let i = 0; i < s.length; i++) sicht.setUint8(pos + i, s.charCodeAt(i)); };

  text(0, "RIFF");
  sicht.setUint32(4, 36 + anzahl * 4, true);
  text(8, "WAVEfmt ");
  sicht.setUint32(16, 16, true);
  sicht.setUint16(20, 1, true);
  sicht.setUint16(22, 2, true);
  sicht.setUint32(24, rate, true);
  sicht.setUint32(28, rate * 4, true);
  sicht.setUint16(32, 4, true);
  sicht.setUint16(34, 16, true);
  text(36, "data");
  sicht.setUint32(40, anzahl * 4, true);

  let pos = kopf;
  for (const [links, rechts] of bloecke) {
    for (let i = 0; i < links.length; i++) {
      let l = Math.max(-1, Math.min(1, links[i]));
      let r = Math.max(-1, Math.min(1, rechts[i]));
      sicht.setInt16(pos, l < 0 ? l * 32768 : l * 32767, true); pos += 2;
      sicht.setInt16(pos, r < 0 ? r * 32768 : r * 32767, true); pos += 2;
    }
  }
  return puffer;
}

// --- Menü des Live-Bereichs ---

function liveMenue() {
  return [
    { typ: "aktion", id: "midi-verbinden", text: "MIDI verbinden" },
    { typ: "aktion", id: "metronom", text: "Metronom: Aus" },
    { typ: "ordner", text: "Metronom einstellen", laden: "metronom-einstellen" },
    { typ: "aktion", id: "fx-ansage", text: "FX-Regler ansagen: Aus" },
    { typ: "aktion", id: "usb-ton", text: "USB-Ton zur Station: Aus" },
    { typ: "ordner", text: "Effekte", laden: "fx" },
    { typ: "aktion", id: "ansager", text: "Ansager: An" },
    { typ: "aktion", id: "platz-ansagen", text: "Gewählten Platz ansagen" },
    { typ: "aktion", id: "tempo-ansagen", text: "Tempo ansagen" },
    { typ: "ordner", text: "Speicherplatz umschalten", laden: "midiplatz" },
    { typ: "ordner", text: "Steuerbefehl senden", laden: "midicc" },
    { typ: "ordner", text: "MIDI-Kanal", laden: "midikanal" },
    { typ: "ordner", text: "Aufnahme über USB-Audio", kinder: [
      { typ: "aktion", id: "aufnahme-start", text: "Aufnahme starten" },
      { typ: "aktion", id: "aufnahme-stopp", text: "Aufnahme stoppen und speichern" }
    ]}
  ];
}

// Baut die Unterlisten des Live-Bereichs.
function liveLaden(art, li) {
  if (art === "fx") {
    // Im Hintergrund den Stand holen, damit die Effektnamen gleich dastehen.
    if (!fxStand) fxEinlesen(null);
    return [
      { typ: "ordner", text: "Input FX", laden: "fx-bank", ziel: "input" },
      { typ: "ordner", text: "Track FX", laden: "fx-bank", ziel: "track" },
      { typ: "aktion", id: "fx-einlesen", text: "Stand neu einlesen" }
    ];
  }
  if (art === "fx-bank") {
    const bank = li.dataset.ziel;
    const b = fxStand ? fxStand[bank] : null;
    const e = [
      { typ: "aktion", id: "fx-an", ziel: bank, text: "Ein" },
      { typ: "aktion", id: "fx-aus", ziel: bank, text: "Aus" }
    ];
    for (let i = 0; i < 3; i++) {
      e.push({ typ: "aktion", id: "fx-taste", ziel: bank, nummer: i + 1,
               text: "Taste " + "ABC".charAt(i) + (b ? ", " + fxTypName(b.typ[i]) : "") });
    }
    e.push({ typ: "ordner", text: "Effekt wählen für die gewählte Taste",
             laden: "fx-typen", ziel: bank });
    e.push({ typ: "ordner", text: "Reglerwert", laden: "fx-regler", ziel: bank });
    return e;
  }
  if (art === "fx-typen") {
    const bank = li.dataset.ziel;
    const liste = (typeof FX_TYPEN !== "undefined") ? FX_TYPEN : [];
    return liste.map((name, i) => ({ typ: "aktion", id: "fx-typ", ziel: bank, nummer: i, text: name }));
  }
  if (art === "fx-regler") {
    const bank = li.dataset.ziel;
    const e = [];
    for (let w = 0; w <= 100; w += 5) {
      e.push({ typ: "aktion", id: "fx-wert", ziel: bank, nummer: w, text: "Reglerwert " + w });
    }
    return e;
  }
  if (art === "metronom-einstellen") {
    return [
      { typ: "ordner", text: "Schläge je Takt", laden: "metronom-takt" },
      { typ: "ordner", text: "Klang", laden: "metronom-klang" },
      { typ: "ordner", text: "Lautstärke", laden: "metronom-laut" },
      { typ: "ordner", text: "Tempoquelle", laden: "metronom-quelle" },
      { typ: "ordner", text: "Eigenes Tempo", laden: "metronom-tempo" },
      { typ: "aktion", id: "uhr-pruefen", text: "Uhr der Station prüfen" }
    ];
  }
  if (art === "metronom-takt") {
    const e = [];
    for (let n = 2; n <= 8; n++) {
      e.push({ typ: "aktion", id: "metronom-wert", ziel: "takt", nummer: n,
               text: n + " Schläge je Takt" + (n === metronomTakt ? ", eingestellt" : "") });
    }
    return e;
  }
  if (art === "metronom-klang") {
    return [
      { typ: "aktion", id: "metronom-wert", ziel: "klang", nummer: "klick", text: "Klick, kurz und hart" },
      { typ: "aktion", id: "metronom-wert", ziel: "klang", nummer: "holz", text: "Holz, trockener Schlag" },
      { typ: "aktion", id: "metronom-wert", ziel: "klang", nummer: "ton", text: "Ton, weicher Piepser" }
    ];
  }
  if (art === "metronom-laut") {
    const e = [];
    for (let n = 10; n <= 100; n += 10) {
      e.push({ typ: "aktion", id: "metronom-wert", ziel: "laut", nummer: n, text: "Lautstärke " + n });
    }
    return e;
  }
  if (art === "metronom-quelle") {
    return [
      { typ: "aktion", id: "metronom-wert", ziel: "quelle", nummer: "station",
        text: "Uhr der Station, läuft mit dem Rhythmus und den Schleifen" },
      { typ: "aktion", id: "metronom-wert", ziel: "quelle", nummer: "eigen",
        text: "Eigenes Tempo, läuft unabhängig" }
    ];
  }
  if (art === "metronom-tempo") {
    const e = [];
    for (let n = 40; n <= 240; n += 5) {
      e.push({ typ: "aktion", id: "metronom-wert", ziel: "tempo", nummer: n, text: "Tempo " + n });
    }
    return e;
  }
  if (art === "midiplatz") {
    const e = [];
    for (let n = 1; n <= 99; n++) {
      e.push({ typ: "aktion", id: "midi-platz", text: "Platz " + String(n).padStart(2, "0"), ziel: n });
    }
    return e;
  }
  if (art === "midikanal") {
    const e = [];
    for (let k = 0; k < 16; k++) {
      e.push({ typ: "aktion", id: "midi-kanal", text: "Kanal " + (k + 1), ziel: k });
    }
    return e;
  }
  if (art === "midicc") {
    // Die Station nimmt CC 1 bis 31 und 64 bis 95 als Quelle für Zuweisungen.
    const e = [];
    const nummern = [];
    for (let n = 1; n <= 31; n++) nummern.push(n);
    for (let n = 64; n <= 95; n++) nummern.push(n);
    for (const n of nummern) {
      e.push({ typ: "ordner", text: "CC " + n, kinder: [
        { typ: "aktion", id: "midi-cc", text: "Auslösen, Wert 127", nummer: n, ziel: 127 },
        { typ: "aktion", id: "midi-cc", text: "Loslassen, Wert 0", nummer: n, ziel: 0 },
        { typ: "aktion", id: "midi-cc", text: "Mitte, Wert 64", nummer: n, ziel: 64 }
      ]});
    }
    return e;
  }
  return null;
}
