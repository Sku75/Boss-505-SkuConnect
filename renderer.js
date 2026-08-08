// Sku505 Version 0.06, vollständige Werkstatt.
//
// Bedienung: Pfeil hoch und runter wandern innerhalb der Ebene, Pfeil rechts
// geht hinein, Pfeil links und Rücktaste gehen heraus, Enter aktiviert.
// Pos 1 und Ende springen an den Rand der Ebene, dort erklingt der Anschlagton.
//
// Grundregeln:
//  - Ein Ladeknopf bleibt stehen und behält den Fokus, Ergebnisse darunter.
//  - Große Listen werden erst beim Öffnen gebaut, damit nichts hakt.
//  - Geschrieben wird nur, was in felder.js beschrieben ist. Jeder Schreibvorgang
//    sichert vorher den Stand und liest danach zur Kontrolle zurück.

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");
const eingabefeld = document.getElementById("eingabefeld");

let stationsPfad = null;   // Pfad zum ROLAND-Ordner
let schreibbar = false;    // nur wahr, wenn die echte Station verbunden ist

function sage(text) {
  statuszeile.textContent = text;
}

// --- Anschlagton, erzeugt wie in Skularis: 220 Hertz, 400 Millisekunden ---

let audioKontext = null;
function spieleAnschlag() {
  if (!audioKontext) audioKontext = new (window.AudioContext || window.webkitAudioContext)();
  const oszillator = audioKontext.createOscillator();
  const pegel = audioKontext.createGain();
  oszillator.frequency.value = 220;
  oszillator.connect(pegel);
  pegel.connect(audioKontext.destination);
  const jetzt = audioKontext.currentTime;
  pegel.gain.setValueAtTime(0.3, jetzt);
  pegel.gain.exponentialRampToValueAtTime(0.001, jetzt + 0.4);
  oszillator.start(jetzt);
  oszillator.stop(jetzt + 0.4);
}

// =====================================================================
// Werte darstellen und Auswahllisten erzeugen
// =====================================================================

function wertText(art, roh, beschreibung) {
  const zahl = parseInt(roh, 10);
  if (art === "liste") {
    const w = beschreibung.werte || [];
    return w[zahl] !== undefined ? w[zahl] : String(roh);
  }
  if (art === "tempo") return String((zahl / 10).toFixed(1)).replace(".", ",") + " BPM";
  if (art === "looplaenge") return zahl === 0 ? "AUTO" : zahl + (zahl === 1 ? " Takt" : " Takte");
  return String(roh);
}

function auswahlBauen(art, beschreibung) {
  const liste = [];
  if (art === "liste") {
    (beschreibung.werte || []).forEach((t, i) => liste.push({ wert: i, text: t }));
  } else if (art === "tempo") {
    for (let bpm = 40; bpm <= 250; bpm++) liste.push({ wert: bpm * 10, text: bpm + " BPM" });
  } else if (art === "looplaenge") {
    liste.push({ wert: 0, text: "AUTO" });
    for (let t = 1; t <= 32; t++) liste.push({ wert: t, text: t + (t === 1 ? " Takt" : " Takte") });
  } else {
    const min = beschreibung.min !== undefined ? beschreibung.min : 0;
    const max = beschreibung.max !== undefined ? beschreibung.max : 100;
    for (let z = min; z <= max; z++) liste.push({ wert: z, text: String(z) });
  }
  return liste;
}

// =====================================================================
// Baum aufbauen
// =====================================================================

function neuerEintrag(eintrag, ebene) {
  const li = document.createElement("li");
  li.setAttribute("role", "treeitem");
  li.setAttribute("aria-level", String(ebene));
  li.dataset.typ = eintrag.typ;
  if (eintrag.id) li.dataset.id = eintrag.id;
  li.tabIndex = -1;

  const zeile = document.createElement("span");
  zeile.className = "zeile";
  li.appendChild(zeile);

  // Zusatzangaben übernehmen, etwa Speicherplatz, Abschnitt und Feld.
  for (const schluessel of ["datei", "nummer", "abschnitt", "feld", "rohwert", "art", "spur", "laden", "ziel"]) {
    if (eintrag[schluessel] !== undefined) li.dataset[schluessel] = eintrag[schluessel];
  }
  if (eintrag.beschreibung) li._beschreibung = eintrag.beschreibung;
  if (eintrag.tun) li._tun = eintrag.tun;

  // Eine Unterebene bekommt nur, wer auch wirklich eine hat. Ein Wert, der
  // sich nicht ändern lässt, bleibt darum ohne Auswahlliste.
  const hatUnterebene = eintrag.typ === "ordner" || (eintrag.typ === "wert" && eintrag.laden);
  if (hatUnterebene) {
    li.setAttribute("aria-expanded", "false");
    const gruppe = document.createElement("ul");
    gruppe.setAttribute("role", "group");
    gruppe.hidden = true;
    li.appendChild(gruppe);
    if (eintrag.kinder) baueEbene(eintrag.kinder, gruppe, ebene + 1);
  }

  li.dataset.text = eintrag.text;
  aktualisiereZeile(li);
  return li;
}

function baueEbene(eintraege, elternListe, ebene) {
  for (const eintrag of eintraege) elternListe.appendChild(neuerEintrag(eintrag, ebene));
}

function setzeKinder(li, eintraege) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  gruppe.innerHTML = "";
  const ebene = parseInt(li.getAttribute("aria-level"), 10) + 1;
  baueEbene(eintraege, gruppe, ebene);
  li.dataset.geladen = "ja";
}

// Grundregel: Der Ladeknopf bleibt an erster Stelle und behält den Fokus.
function zeigeErgebnisse(ordner, ladeEintrag, ergebnisse) {
  setzeKinder(ordner, [ladeEintrag].concat(ergebnisse));
  oeffne(ordner);
  fokussiere(ordner.querySelector(':scope > ul[role="group"] > li'));
}

function aktualisiereZeile(li) {
  const zeile = li.querySelector(":scope > .zeile");
  if (li.dataset.typ === "wert") {
    const text = wertText(li.dataset.art, li.dataset.rohwert, li._beschreibung || {});
    zeile.textContent = li.dataset.text + ": " + text;
  } else {
    zeile.textContent = li.dataset.text;
  }
}

// =====================================================================
// Navigation
// =====================================================================

function ebenenEintraege(li) {
  return Array.from(li.parentElement.children).filter(e => e.getAttribute("role") === "treeitem");
}

function fokussiere(li) {
  if (!li) return;
  baumElement.querySelectorAll('li[role="treeitem"]').forEach(e => e.tabIndex = -1);
  li.tabIndex = 0;
  li.focus();
}

function oeffne(li) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  if (!gruppe) return false;
  li.setAttribute("aria-expanded", "true");
  gruppe.hidden = false;
  return true;
}

function schliesse(li) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  if (!gruppe) return false;
  li.setAttribute("aria-expanded", "false");
  gruppe.hidden = true;
  return true;
}

function elternVon(li) {
  const elternListe = li.parentElement;
  if (elternListe && elternListe.getAttribute("role") === "group") return elternListe.parentElement;
  return null;
}

function ebeneZurueck(aktiv) {
  if (aktiv.getAttribute("aria-expanded") === "true") { schliesse(aktiv); return; }
  const eltern = elternVon(aktiv);
  if (eltern) { schliesse(eltern); fokussiere(eltern); }
  else spieleAnschlag();
}

// Öffnet einen Eintrag und lädt bei Bedarf vorher seinen Inhalt.
async function hineingehen(li) {
  if (!li.hasAttribute("aria-expanded")) { spieleAnschlag(); return; }
  if (li.dataset.laden && li.dataset.geladen !== "ja") {
    const fertig = await laden(li);
    if (!fertig) return;
    // Auswahllisten setzen den Fokus selbst auf den gerade gültigen Wert.
    if (fertig === "fokussiert") return;
  }
  oeffne(li);
  const erstes = li.querySelector(':scope > ul[role="group"] > li');
  if (erstes) fokussiere(erstes); else spieleAnschlag();
}

// =====================================================================
// Quelle der Daten
// =====================================================================

async function quelleSichern() {
  if (stationsPfad) return stationsPfad;
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) { stationsPfad = e.rolandPfad; schreibbar = true; return stationsPfad; }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) { stationsPfad = eigen.pfad; schreibbar = false; return stationsPfad; }
  return null;
}

// =====================================================================
// Inhalte nachladen
// =====================================================================

async function laden(li) {
  const art = li.dataset.laden;
  const pfad = await quelleSichern();
  if (!pfad) { sage("Keine Daten. Erst Station suchen oder Einstellungen einlesen."); return false; }

  if (art === "platz") {
    sage("Lese Speicherplatz " + li.dataset.nummer + "...");
    const e = await window.sku505.speicherplatzLesen(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, platzEintraege(e.daten));
    sage(li.dataset.text);
    return true;
  }

  if (art === "wertoptionen") {
    const liste = auswahlBauen(li.dataset.art, li._beschreibung || {});
    const jetzt = String(li.dataset.rohwert);
    setzeKinder(li, liste.map(o => ({
      typ: "option", text: o.text, ziel: o.wert,
      id: "opt-" + o.wert
    })));
    // Auf den aktuell gültigen Wert springen, damit man sieht, wo man steht.
    const gruppe = li.querySelector(':scope > ul[role="group"]');
    const treffer = Array.from(gruppe.children).find(k => k.dataset.ziel === jetzt);
    if (treffer) { oeffne(li); fokussiere(treffer); return "fokussiert"; }
    return true;
  }

  if (art === "loops") {
    const e = await window.sku505.loopsAuflisten(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.spuren.map(s => ({
      typ: "ordner", text: "Spur " + s.spur + ": " + (s.datei ? s.sekunden.toFixed(1).replace(".", ",") + " Sekunden" : "leer"),
      nummer: li.dataset.nummer, spur: s.spur,
      kinder: [
        { typ: "aktion", id: "loop-export", text: "Aufnahme exportieren", nummer: li.dataset.nummer, spur: s.spur },
        { typ: "aktion", id: "loop-import", text: "WAV-Datei einspielen", nummer: li.dataset.nummer, spur: s.spur }
      ]
    })));
    return true;
  }

  if (art === "system") {
    const e = await window.sku505.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    for (const abschnitt of Object.keys(e.daten)) {
      eintraege.push({
        typ: "ordner", text: abschnittName(abschnitt),
        kinder: felderZuEintraegen("SYSTEM", 0, abschnitt, e.daten[abschnitt])
      });
    }
    setzeKinder(li, eintraege);
    return true;
  }

  if (art === "zielplatz") {
    const eintraege = [];
    for (let n = 1; n <= 99; n++) {
      eintraege.push({ typ: "aktion", id: li.dataset.id, text: "Platz " + String(n).padStart(2, "0"),
        nummer: li.dataset.nummer, ziel: n });
    }
    setzeKinder(li, eintraege);
    return true;
  }

  return false;
}

function abschnittName(abschnitt) {
  const namen = {
    SETUP: "Grundeinstellungen", INPUT_OUTPUT: "Ein- und Ausgang",
    USB: "USB", MIDI: "MIDI", MASTER: "Speicherplatz gesamt",
    REC_OPTION: "Aufnahme", PLAY_OPTION: "Wiedergabe", RHYTHM: "Rhythmus",
    INPUT_FX: "Input FX", TRACK_FX: "Track FX"
  };
  if (namen[abschnitt]) return namen[abschnitt];
  if (/^TRACK[1-5]$/.test(abschnitt)) return "Spur " + abschnitt.slice(5);
  if (/^ASSIGN(\d+)$/.test(abschnitt)) return "Zuweisung " + abschnitt.slice(6);
  if (/^INPUT_FX([123])$/.test(abschnitt)) return "Input FX, Parameter Taste " + "ABC"[abschnitt.slice(8) - 1];
  if (/^TRACK_FX([123])$/.test(abschnitt)) return "Track FX, Parameter Taste " + "ABC"[abschnitt.slice(8) - 1];
  return abschnitt;
}

// Wandelt die Felder eines Abschnitts in Menüeinträge um.
function felderZuEintraegen(datei, nummer, abschnitt, werte) {
  const eintraege = [];
  for (const feld of Object.keys(werte)) {
    const b = feldBeschreibung(abschnitt, feld);
    if (b) {
      eintraege.push({
        typ: "wert", text: b.text, art: b.art || "zahl",
        datei, nummer, abschnitt, feld, rohwert: werte[feld],
        beschreibung: b, laden: b.nurLesen ? undefined : "wertoptionen",
        id: b.nurLesen ? "nur-lesen" : "wert"
      });
    } else {
      // Unbekanntes Feld: ehrlich anzeigen, aber nicht änderbar.
      eintraege.push({
        typ: "aktion", id: "nur-lesen",
        text: feld + ": " + werte[feld]
      });
    }
  }
  return eintraege;
}

// Baut den Inhalt eines Speicherplatzes.
function platzEintraege(daten) {
  const n = daten.nummer;
  const eintraege = [];

  eintraege.push({ typ: "aktion", id: "name-aendern", text: "Name: " + daten.name.trim(), nummer: n });

  for (const a of ["PLAY_OPTION", "REC_OPTION", "MASTER", "RHYTHM"]) {
    eintraege.push({ typ: "ordner", text: abschnittName(a),
      kinder: felderZuEintraegen("MEMORY", n, a, daten[a]) });
  }

  for (let s = 1; s <= 5; s++) {
    eintraege.push({ typ: "ordner", text: abschnittName("TRACK" + s),
      kinder: felderZuEintraegen("MEMORY", n, "TRACK" + s, daten["TRACK" + s]) });
  }

  for (const bank of ["INPUT_FX", "TRACK_FX"]) {
    const kinder = felderZuEintraegen("MEMORY", n, bank, daten[bank]);
    for (let i = 1; i <= 3; i++) {
      const teil = bank + i;
      kinder.push({ typ: "ordner", text: abschnittName(teil),
        kinder: felderZuEintraegen("MEMORY", n, teil, daten[teil]) });
    }
    eintraege.push({ typ: "ordner", text: abschnittName(bank), kinder });
  }

  const zuweisungen = [];
  for (let i = 1; i <= 16; i++) {
    zuweisungen.push({ typ: "ordner", text: abschnittName("ASSIGN" + i),
      kinder: felderZuEintraegen("MEMORY", n, "ASSIGN" + i, daten["ASSIGN" + i]) });
  }
  eintraege.push({ typ: "ordner", text: "Zuweisungen, 16 Stück", kinder: zuweisungen });

  eintraege.push({ typ: "ordner", text: "Loop-Aufnahmen", nummer: n, laden: "loops" });
  eintraege.push({ typ: "ordner", text: "Einstellungen kopieren auf", nummer: n, laden: "zielplatz", id: "kopieren-nach" });
  eintraege.push({ typ: "ordner", text: "Einstellungen tauschen mit", nummer: n, laden: "zielplatz", id: "tauschen-mit" });

  return eintraege;
}

// =====================================================================
// Aktionen
// =====================================================================

async function stationSuchen() {
  sage("Suche die Station...");
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) {
    stationsPfad = e.rolandPfad; schreibbar = true;
    sage("Station gefunden auf Laufwerk " + e.laufwerk + ". Ändern ist möglich.");
  } else {
    const eigen = await window.sku505.datenordner();
    if (eigen.ok && eigen.vorhanden) {
      stationsPfad = eigen.pfad; schreibbar = false;
      sage("Keine Station. Arbeite mit dem eingelesenen Stand, nur Lesen möglich.");
    } else {
      stationsPfad = null; schreibbar = false;
      sage("Keine Station gefunden. Sie muss im Speicher-Modus angeschlossen sein.");
    }
  }
}

async function firmwarePruefen() {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden."); return; }
  const e = await window.sku505.kenndatenLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  const fw = e.revision === "2" ? "Firmware 2.0" : "unbekannte Firmware";
  sage("Gerät " + e.geraet + ", " + fw + ", Datenstand " + e.revision + ".");
}

async function speicherplaetzeLaden(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden. Erst Station suchen."); return; }
  sage("Lese Speicherplätze...");
  const e = await window.sku505.speicherplaetzeLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }

  const ordner = elternVon(li);
  const eintraege = e.plaetze.map(pl => {
    const laenge = pl.lpLen === 0 ? "AUTO" : pl.lpLen + " Takte";
    const spuren = pl.spuren === 0 ? "leer" : pl.spuren + " Spuren";
    return {
      typ: "ordner",
      text: String(pl.nummer).padStart(2, "0") + " " + pl.name.trim() + ", " + laenge + ", " + spuren,
      nummer: pl.nummer, laden: "platz"
    };
  });
  zeigeErgebnisse(ordner, { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }, eintraege);
  const belegt = e.plaetze.filter(x => x.spuren > 0).length;
  sage(e.plaetze.length + " Speicherplätze geladen, " + belegt + " davon belegt.");
}

// Schreibt einen gewählten Wert und meldet das Ergebnis.
async function wertSetzen(optionLi) {
  const wertLi = elternVon(optionLi);
  if (!schreibbar) {
    sage("Nur Lesen möglich. Die Station ist nicht im Speicher-Modus verbunden.");
    return;
  }
  const neu = optionLi.dataset.ziel;
  const auftrag = {
    datei: wertLi.dataset.datei,
    nummer: parseInt(wertLi.dataset.nummer, 10),
    abschnitt: wertLi.dataset.abschnitt,
    feld: wertLi.dataset.feld,
    wert: neu
  };
  sage("Schreibe " + wertLi.dataset.text + "...");
  const e = await window.sku505.wertSchreiben(stationsPfad, auftrag);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }

  if (!e.geaendert) {
    sage(wertLi.dataset.text + " stand schon auf diesem Wert.");
  } else if (e.bestaetigt) {
    wertLi.dataset.rohwert = neu;
    aktualisiereZeile(wertLi);
    sage(wertLi.dataset.text + " ist jetzt " + optionLi.dataset.text + ", geschrieben und geprüft.");
  } else {
    sage("Achtung: Rücklesen ergab " + e.gelesen + " statt " + neu + ". Nichts als sicher annehmen.");
    return;
  }
  schliesse(wertLi);
  wertLi.dataset.geladen = "";
  fokussiere(wertLi);
}

// Kleines Eingabefeld für Freitext, etwa den Namen.
function frageText(beschriftung, vorgabe) {
  return new Promise((fertig) => {
    eingabefeld.value = vorgabe || "";
    eingabefeld.setAttribute("aria-label", beschriftung + ", Enter bestätigt, Escape bricht ab");
    eingabefeld.hidden = false;
    eingabefeld.focus();
    eingabefeld.select();
    sage(beschriftung + ". Eingeben, dann Enter. Escape bricht ab.");
    function ende(wert) {
      eingabefeld.hidden = true;
      eingabefeld.removeEventListener("keydown", taste);
      fertig(wert);
    }
    function taste(ereignis) {
      if (ereignis.key === "Enter") { ereignis.preventDefault(); ende(eingabefeld.value); }
      else if (ereignis.key === "Escape") { ereignis.preventDefault(); ende(null); }
      ereignis.stopPropagation();
    }
    eingabefeld.addEventListener("keydown", taste);
  });
}

async function nameAendern(li) {
  if (!schreibbar) { sage("Nur Lesen möglich. Station nicht im Speicher-Modus verbunden."); return; }
  const alt = li.dataset.text.replace(/^Name: /, "");
  const neu = await frageText("Neuer Name, höchstens 12 Zeichen", alt);
  fokussiere(li);
  if (neu === null) { sage("Abgebrochen, der Name bleibt " + alt + "."); return; }
  sage("Schreibe Namen...");
  const e = await window.sku505.nameSchreiben(stationsPfad, parseInt(li.dataset.nummer, 10), neu);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  li.dataset.text = "Name: " + e.name;
  aktualisiereZeile(li);
  sage("Name ist jetzt " + e.name + ", geschrieben und geprüft.");
}

async function platzUebertragen(optionLi, tauschen) {
  if (!schreibbar) { sage("Nur Lesen möglich. Station nicht im Speicher-Modus verbunden."); return; }
  const von = parseInt(optionLi.dataset.nummer, 10);
  const nach = parseInt(optionLi.dataset.ziel, 10);
  if (von === nach) { sage("Quelle und Ziel sind derselbe Platz."); return; }
  const wort = tauschen ? "Tausche" : "Kopiere";
  sage(wort + " Platz " + von + " und " + nach + "...");
  const e = tauschen
    ? await window.sku505.platzTauschen(stationsPfad, von, nach)
    : await window.sku505.platzKopieren(stationsPfad, von, nach);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  if (e.bestaetigt) {
    sage((tauschen ? "Getauscht" : "Kopiert") + " und geprüft. Achtung: die Loop-Aufnahmen bleiben, wo sie waren.");
  } else {
    sage("Achtung: Die Kontrolle nach dem Schreiben hat nicht gestimmt.");
  }
}

async function loopExportieren(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden."); return; }
  const vorschlag = "Platz" + String(li.dataset.nummer).padStart(2, "0") + "_Spur" + li.dataset.spur + ".wav";
  const wahl = await window.sku505.dateiWaehlen(true, vorschlag);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen."); return; }
  const e = await window.sku505.loopExportieren(p, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  sage("Exportiert, " + Math.round(e.bytes / 1024) + " Kilobyte.");
}

async function loopImportieren(li) {
  if (!schreibbar) { sage("Nur Lesen möglich. Station nicht im Speicher-Modus verbunden."); return; }
  const wahl = await window.sku505.dateiWaehlen(false);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen."); return; }
  sage("Spiele Datei ein...");
  const e = await window.sku505.loopImportieren(stationsPfad, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  sage("Eingespielt als " + e.datei + ". Die Liste zeigt es nach dem Neuladen.");
}

async function einstellungenEinlesen() {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Einstellungen ein...");
  const e = await window.sku505.einstellungenEinlesen(p);
  sage(e.ok ? "Einstellungen eingelesen, " + Math.round(e.bytes / 1024) + " Kilobyte." : "Fehler: " + e.fehler);
}

async function loopsEinlesen() {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Loop-Aufnahmen ein. Das dauert, das Menü bleibt bedienbar.");
  const e = await window.sku505.loopsEinlesen(p);
  if (e.ok && e.vollstaendig) sage("Loop-Aufnahmen eingelesen, " + e.kopie + " Dateien, vollständig.");
  else if (e.ok) sage("Achtung: unvollständig, Quelle " + e.quelle + ", Kopie " + e.kopie + ".");
  else sage("Fehler: " + e.fehler);
}

async function inGitSichern() {
  sage("Sichere den Stand in Git...");
  const e = await window.sku505.gitSichern("Stationsdaten gesichert");
  sage(e.ok ? e.meldung : "Fehler: " + e.fehler);
}

// =====================================================================
// Menü
// =====================================================================

const menue = [
  { typ: "ordner", text: "Werkstatt", kinder: [
    { typ: "aktion", id: "station-suchen", text: "Station suchen" },
    { typ: "aktion", id: "firmware", text: "Firmware und Datenstand prüfen" },
    { typ: "ordner", text: "Speicherplätze", kinder: [
      { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }
    ]},
    { typ: "ordner", text: "Systemeinstellungen der Station", laden: "system" },
    { typ: "ordner", text: "Einlesen und sichern", kinder: [
      { typ: "aktion", id: "einst-einlesen", text: "Einstellungen einlesen, schnell" },
      { typ: "aktion", id: "loops-einlesen", text: "Loop-Aufnahmen einlesen, dauert lange" },
      { typ: "aktion", id: "git-sichern", text: "Stand in Git sichern" }
    ]}
  ]},
  { typ: "ordner", text: "Live-Studio", kinder: [
    { typ: "aktion", id: "live-info", text: "Wird in einer späteren Stufe gebaut" }
  ]},
  { typ: "ordner", text: "Optionen", kinder: [
    { typ: "aktion", id: "ueber", text: "Über Sku505" }
  ]},
  { typ: "aktion", id: "beenden", text: "Sku505 beenden" }
];

// =====================================================================
// Tastensteuerung
// =====================================================================

async function aktiviere(li) {
  const typ = li.dataset.typ;
  if (typ === "ordner" || typ === "wert") { await hineingehen(li); return; }
  if (typ === "option") { await wertSetzen(li); return; }

  switch (li.dataset.id) {
    case "beenden": window.close(); return;
    case "ueber": sage("Sku505 Version 0.06, vollständige Werkstatt."); return;
    case "station-suchen": await stationSuchen(); return;
    case "firmware": await firmwarePruefen(); return;
    case "platz-laden": await speicherplaetzeLaden(li); return;
    case "einst-einlesen": await einstellungenEinlesen(); return;
    case "loops-einlesen": await loopsEinlesen(); return;
    case "git-sichern": await inGitSichern(); return;
    case "name-aendern": await nameAendern(li); return;
    case "kopieren-nach": await platzUebertragen(li, false); return;
    case "tauschen-mit": await platzUebertragen(li, true); return;
    case "loop-export": await loopExportieren(li); return;
    case "loop-import": await loopImportieren(li); return;
    case "nur-lesen": sage(li.dataset.text + ". Dieser Wert lässt sich hier nicht ändern."); return;
    default: sage(li.dataset.text); return;
  }
}

baumElement.addEventListener("keydown", async (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv.getAttribute("role") !== "treeitem") return;
  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag(); else fokussiere(ebene[index + 1]);
      break;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag(); else fokussiere(ebene[index - 1]);
      break;
    case "Home":
      ereignis.preventDefault();
      if (index === 0) spieleAnschlag();
      fokussiere(ebene[0]);
      break;
    case "End":
      ereignis.preventDefault();
      if (index === ebene.length - 1) spieleAnschlag();
      fokussiere(ebene[ebene.length - 1]);
      break;
    case "ArrowRight":
      ereignis.preventDefault();
      await hineingehen(aktiv);
      break;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      break;
    case "Enter":
      ereignis.preventDefault();
      await aktiviere(aktiv);
      break;
  }
});

baueEbene(menue, baumElement, 1);
fokussiere(baumElement.querySelector('li[role="treeitem"]'));
sage("Sku505 bereit.");
