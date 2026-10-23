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
