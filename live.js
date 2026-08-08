// Sku505, Live-Studio.
//
// Arbeitet mit der Station in der Betriebsart AUDIO/MIDI. Zwei Dinge sind
// technisch möglich und werden hier genutzt:
//
//  1. Zuhören. Die Station meldet über MIDI, welcher Speicherplatz gewählt
//     wurde, und sendet den Takt. Mehr sendet sie nicht, ein sprechender
//     Spiegel des Displays ist darum nicht baubar.
//  2. Steuern. Sku505 kann den Speicherplatz umschalten und Steuerbefehle
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
      "Am Gerät: SYSTEM drei Mal, Regler auf AUDIO/MIDI, EXIT, Kabel neu stecken"
    ].concat(namen.length ? namen : ["Keine MIDI-Anschlüsse vorhanden"]));
  }
}

// Verbindet MIDI leise im Hintergrund, ohne Ansage. Dadurch weiß Sku505
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
    return;
  }

  // Programmwechsel: die Station meldet den gewählten Speicherplatz.
  if (art === 0xc0) {
    const platz = d[1] + 1;
    if (platz !== letzterPlatz) {
      letzterPlatz = platz;
      if (ansagerAn) sage("Platz " + platz);
    }
    return;
  }

  if (d[0] === 0xfa && ansagerAn) sage("Start");
  if (d[0] === 0xfc && ansagerAn) sage("Stopp");
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
  ergebnis(li, "Platz " + letzterPlatz, ["Zuletzt gemeldet: Platz " + letzterPlatz]);
}

// --- Steuern ---

function midiSenden(bytes) {
  if (!midiAusgang) { sage("Nicht verbunden"); return false; }
  midiAusgang.send(bytes);
  return true;
}

function platzUmschalten(li) {
  const platz = parseInt(li.dataset.ziel, 10);
  if (!midiSenden([0xc0 | midiKanal, platz - 1])) return;
  letzterPlatz = platz;
  ergebnis(li, "Platz " + platz, ["Umgeschaltet auf Platz " + platz, "MIDI-Kanal " + (midiKanal + 1)]);
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
  const wahl = await window.sku505.dateiWaehlen(true, "Sku505 Aufnahme.wav");
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }

  const daten = wavBauen(aufnahmeBloecke, anzahl, aufnahmeRate);
  const e = await window.sku505.wavSchreiben(wahl.pfad, daten);
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
