// Sku505 Version 0.09, Werkstatt und Live-Studio.
//
// Bedienung:
//   Pfeil hoch und runter   wandern innerhalb der Ebene
//   Pfeil rechts            geht eine Ebene hinein
//   Pfeil links, Rücktaste  geht eine Ebene zurück
//   Enter                   aktiviert
//   Pos 1, Ende             an den Rand der Ebene
//   Shift und Pfeil runter  Tooltip mit den Einzelheiten
//   Buchstaben              Menüfilter, Escape hebt ihn auf
//
// Gesprochen wird nur, worauf der Fokus steht. Den Ebenenwechsel meldet ein
// Ton, nicht die Sprachausgabe. Darum trägt das Menü die Rolle application
// und die Zeilen sind Schaltflächen, genau wie in Skularis.

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");
const eingabefeld = document.getElementById("eingabefeld");

let stationsPfad = null;   // Pfad zum ROLAND-Ordner
let schreibbar = false;    // nur wahr, wenn die echte Station verbunden ist

// =====================================================================
// Ansagen
// =====================================================================

// Kurz und bühnentauglich. Die Einzelheiten stehen im Tooltip.
// Die Statuszeile meldet nur Änderungen, darum wird sie erst geleert.
// Ein wechselndes Leerzeichen am Ende sorgt dafür, dass die Statuszeile sich
// auch dann ändert, wenn derselbe Text noch einmal kommt. Sonst bliebe die
// Sprachausgabe stumm. Hörbar ist der Unterschied nicht.
let ansageWechsel = false;
function sage(text) {
  ansageWechsel = !ansageWechsel;
  statuszeile.textContent = ansageWechsel ? text + " " : text;
}

function ergebnis(li, ansage, zeilen) {
  if (li) li._ergebnis = zeilen && zeilen.length ? zeilen : [ansage];
  sage(ansage);
}

// =====================================================================
// Klänge
// =====================================================================

const KLAENGE = {
  ebeneVor:     new Audio("assets/sounds/ebene-vor.wav"),
  ebeneZurueck: new Audio("assets/sounds/ebene-zurueck.wav"),
  tooltipAuf:   new Audio("assets/sounds/tooltip-auf.ogg"),
  tooltipZu:    new Audio("assets/sounds/tooltip-zu.ogg")
};
// Die Ebenen-Töne bewusst leise, sie erklingen bei jedem Schritt.
KLAENGE.ebeneVor.volume = 0.25;
KLAENGE.ebeneZurueck.volume = 0.25;
KLAENGE.tooltipAuf.volume = 0.5;
KLAENGE.tooltipZu.volume = 0.5;

let audioKontext = null;

function klang(name) {
  if (name === "hauptmenue") { spieleHauptmenue(); return; }
  const k = KLAENGE[name];
  if (!k) return;
  try { k.currentTime = 0; k.play(); } catch { /* egal */ }
}

// Hauptmenü: ein eigener, klar abgesetzter Zweiklang. Bewusst erzeugt und
// nicht aus einer Datei, damit er keinem Klang der Sprachausgabe ähnelt.
function spieleHauptmenue() {
  if (!audioKontext) audioKontext = new (window.AudioContext || window.webkitAudioContext)();
  const start = audioKontext.currentTime;
  [[660, 0], [440, 0.14]].forEach(([hz, versatz]) => {
    const o = audioKontext.createOscillator();
    const g = audioKontext.createGain();
    o.type = "triangle";
    o.frequency.value = hz;
    o.connect(g); g.connect(audioKontext.destination);
    const t0 = start + versatz;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0); o.stop(t0 + 0.24);
  });
}

// Anschlag am Rand einer Ebene: erzeugter Ton, 220 Hertz, wie in Skularis.
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
    const w = (beschreibung && beschreibung.werte) || [];
    return w[zahl] !== undefined ? w[zahl] : String(roh);
  }
  if (art === "tempo") return String((zahl / 10).toFixed(1)).replace(".", ",") + " BPM";
  if (art === "looplaenge") return zahl === 0 ? "AUTO" : zahl + (zahl === 1 ? " Takt" : " Takte");
  return String(roh);
}

function auswahlBauen(art, beschreibung) {
  const liste = [];
  const b = beschreibung || {};
  if (art === "liste") {
    (b.werte || []).forEach((t, i) => liste.push({ wert: i, text: t }));
  } else if (art === "tempo") {
    for (let bpm = 40; bpm <= 250; bpm++) liste.push({ wert: bpm * 10, text: bpm + " BPM" });
  } else if (art === "looplaenge") {
    liste.push({ wert: 0, text: "AUTO" });
    for (let t = 1; t <= 32; t++) liste.push({ wert: t, text: t + (t === 1 ? " Takt" : " Takte") });
  } else {
    const min = b.min !== undefined ? b.min : 0;
    const max = b.max !== undefined ? b.max : 100;
    for (let z = min; z <= max; z++) liste.push({ wert: z, text: String(z) });
  }
  return liste;
}

// Stellt sicher, dass der gerade gültige Wert in der Liste steht, auch wenn er
// außerhalb des bekannten Bereichs liegt. Sonst ließe er sich nicht wiederherstellen.
function auswahlMitJetzt(art, beschreibung, jetzt) {
  const liste = auswahlBauen(art, beschreibung);
  const zahl = parseInt(jetzt, 10);
  if (!isNaN(zahl) && !liste.some(o => String(o.wert) === String(zahl))) {
    liste.push({ wert: zahl, text: String(zahl) });
    liste.sort((a, b2) => a.wert - b2.wert);
  }
  return liste;
}

// =====================================================================
// Menü aufbauen
// =====================================================================

function neuerEintrag(eintrag) {
  const li = document.createElement("li");
  li.className = "eintrag";
  li.dataset.typ = eintrag.typ;
  if (eintrag.id) li.dataset.id = eintrag.id;
  li.tabIndex = -1;

  const zeile = document.createElement("span");
  zeile.className = "zeile";
  li.appendChild(zeile);

  for (const schluessel of ["datei", "nummer", "abschnitt", "feld", "rohwert", "art", "spur", "laden", "ziel"]) {
    if (eintrag[schluessel] !== undefined) li.dataset[schluessel] = eintrag[schluessel];
  }
  if (eintrag.beschreibung) li._beschreibung = eintrag.beschreibung;

  const hatUnterebene = eintrag.typ === "ordner" || (eintrag.typ === "wert" && eintrag.laden);
  if (hatUnterebene) {
    const gruppe = document.createElement("ul");
    gruppe.setAttribute("role", "presentation");
    gruppe.hidden = true;
    li.appendChild(gruppe);
    li.dataset.unterebene = "ja";
    if (eintrag.kinder) baueEbene(eintrag.kinder, gruppe);
  }

  li.dataset.text = eintrag.text;
  aktualisiereZeile(li);
  return li;
}

function baueEbene(eintraege, elternListe) {
  for (const eintrag of eintraege) elternListe.appendChild(neuerEintrag(eintrag));
}

function setzeKinder(li, eintraege) {
  const gruppe = li.querySelector(":scope > ul");
  gruppe.innerHTML = "";
  baueEbene(eintraege, gruppe);
  li.dataset.geladen = "ja";
}

// Ein Ladeknopf bleibt an erster Stelle stehen und behält den Fokus.
function zeigeErgebnisse(ordner, ladeEintrag, ergebnisse) {
  setzeKinder(ordner, [ladeEintrag].concat(ergebnisse));
  oeffne(ordner);
  fokussiere(ordner.querySelector(":scope > ul > li"));
}

function aktualisiereZeile(li) {
  const zeile = li.querySelector(":scope > .zeile");
  let text = li.dataset.text;
  if (li.dataset.typ === "wert") {
    text = li.dataset.text + ": " + wertText(li.dataset.art, li.dataset.rohwert, li._beschreibung);
  }
  zeile.textContent = text;
  li.dataset.ansage = text;
}

// =====================================================================
// Navigation
// =====================================================================

// Nur die sichtbaren Geschwister der aktuellen Ebene. Zeilen, die der
// Menüfilter ausgeblendet hat, werden übersprungen.
function ebenenEintraege(li) {
  return Array.from(li.parentElement.children)
    .filter(e => e.classList.contains("eintrag") && e.style.display !== "none");
}

function fokussiere(li, stumm) {
  if (!li) return;
  baumElement.querySelectorAll(".eintrag").forEach(e => e.tabIndex = -1);
  li.tabIndex = 0;
  li.focus();
  // Die Zeilen tragen bewusst keine Rolle und keinen Namen. Dadurch sagt die
  // Sprachausgabe von sich aus nichts, und wir bestimmen den Wortlaut genau.
  if (!stumm) sage(li.dataset.ansage || li.dataset.text || "");
}

function hatUnterebene(li) {
  return li.dataset.unterebene === "ja";
}

function istOffen(li) {
  const g = li.querySelector(":scope > ul");
  return g && !g.hidden;
}

function oeffne(li) {
  const gruppe = li.querySelector(":scope > ul");
  if (!gruppe) return false;
  gruppe.hidden = false;
  return true;
}

function schliesse(li) {
  const gruppe = li.querySelector(":scope > ul");
  if (!gruppe) return false;
  gruppe.hidden = true;
  return true;
}

function elternVon(li) {
  const elternListe = li.parentElement;
  if (elternListe && elternListe !== baumElement) return elternListe.parentElement;
  return null;
}

function istHauptebene(li) {
  return li.parentElement === baumElement;
}

function ebeneZurueck(aktiv) {
  filterAufheben(true);
  if (istOffen(aktiv)) {
    schliesse(aktiv);
    klang("ebeneZurueck");
    return;
  }
  const eltern = elternVon(aktiv);
  if (eltern) {
    schliesse(eltern);
    fokussiere(eltern);
    klang(istHauptebene(eltern) ? "hauptmenue" : "ebeneZurueck");
  } else {
    spieleAnschlag();
  }
}

async function hineingehen(li) {
  if (!hatUnterebene(li)) { spieleAnschlag(); return; }
  filterAufheben(true);
  if (li.dataset.laden && li.dataset.geladen !== "ja") {
    const fertig = await laden(li);
    if (!fertig) return;
    if (fertig === "fokussiert") { klang("ebeneVor"); return; }
  }
  oeffne(li);
  const erstes = li.querySelector(":scope > ul > li");
  if (erstes) { fokussiere(erstes); klang("ebeneVor"); }
  else spieleAnschlag();
}

// =====================================================================
// Menüfilter
//
// Ein Buchstabe springt zum nächsten Eintrag mit diesem Anfangsbuchstaben.
// Zwei Buchstaben in weniger als einer halben Sekunde schalten das Sammeln
// ein: die Buchstaben werden gesammelt, und erst Pfeil runter zeigt das
// Ergebnis. Escape hebt den Filter wieder auf.
// =====================================================================

let filterText = "";
let filterSammelt = false;
let filterZeit = 0;
let filterEbene = null;

function filterAufheben(still) {
  if (filterEbene) {
    for (const e of filterEbene.children) {
      if (e.classList.contains("eintrag")) e.style.display = "";
    }
    filterEbene = null;
    if (!still) sage("Filter aufgehoben");
  }
  filterText = "";
  filterSammelt = false;
}

function springeZuBuchstabe(aktiv, buchstabe) {
  const ebene = ebenenEintraege(aktiv);
  const jetzt = ebene.indexOf(aktiv);
  for (let i = 1; i <= ebene.length; i++) {
    const kandidat = ebene[(jetzt + i) % ebene.length];
    if ((kandidat.dataset.text || "").trim().toLowerCase().startsWith(buchstabe)) {
      fokussiere(kandidat);
      return;
    }
  }
  spieleAnschlag();
}

function filterAnwenden(aktiv) {
  const liste = aktiv.parentElement;
  const suche = filterText.trim().toLowerCase();
  let treffer = 0;
  for (const e of liste.children) {
    if (!e.classList.contains("eintrag")) continue;
    const passt = (e.dataset.text || "").toLowerCase().includes(suche);
    e.style.display = passt ? "" : "none";
    if (passt) treffer++;
  }
  filterSammelt = false;
  if (!treffer) {
    for (const e of liste.children) {
      if (e.classList.contains("eintrag")) e.style.display = "";
    }
    filterEbene = null;
    filterText = "";
    sage("Kein Treffer");
    spieleAnschlag();
    return;
  }
  filterEbene = liste;
  const erste = Array.from(liste.children)
    .find(e => e.classList.contains("eintrag") && e.style.display !== "none");
  fokussiere(erste);
  sage(treffer + " Treffer für " + suche);
}

function filterTaste(ereignis, aktiv) {
  const zeichen = ereignis.key;
  if (zeichen.length !== 1 || ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) return;
  ereignis.preventDefault();
  const jetzt = Date.now();
  if (jetzt - filterZeit < 500 && filterText.length >= 1) {
    filterText += zeichen.toLowerCase();
    filterSammelt = true;
    sage("Filter " + filterText);
  } else {
    filterText = zeichen.toLowerCase();
    filterSammelt = false;
    springeZuBuchstabe(aktiv, filterText);
  }
  filterZeit = jetzt;
}

// =====================================================================
// Tooltip: Shift halten und Pfeil runter
// =====================================================================

const tooltip = document.getElementById("tooltip");
let tooltipOffen = false;
let tooltipRueckkehr = null;

function tooltipZeilen(li) {
  if (li.dataset.typ === "wert") {
    const b = li._beschreibung || {};
    const jetzt = wertText(li.dataset.art, li.dataset.rohwert, b);
    // Bewusst nur der eingestellte Zustand. Die wählbaren Werte stehen im
    // Untermenü und würden den Tooltip nur aufblähen.
    const zeilen = ["Eingestellt " + jetzt];
    if (b.nurLesen) zeilen.push("Lässt sich hier nicht ändern");
    return zeilen;
  }
  if (li._ergebnis) return li._ergebnis;
  // Aktionen, die noch nicht gelaufen sind, sagen was zu tun ist.
  if (li.dataset.typ === "aktion") return ["Bitte ausführen"];
  return null;
}

function oeffneTooltip(li) {
  const zeilen = tooltipZeilen(li);
  if (!zeilen || !zeilen.length) { sage("Keine weiteren Angaben"); return; }

  tooltip.innerHTML = "";
  for (const z of zeilen) {
    const zeile = document.createElement("li");
    zeile.textContent = z;
    zeile.dataset.ansage = z;
    zeile.tabIndex = -1;
    tooltip.appendChild(zeile);
  }
  tooltip.hidden = false;
  tooltipOffen = true;
  tooltipRueckkehr = li;
  klang("tooltipAuf");
  tooltip.children[0].focus();
  sage(zeilen[0]);
}

function tooltipWeiter(richtung) {
  const zeilen = Array.from(tooltip.children);
  const jetzt = zeilen.indexOf(document.activeElement);
  const ziel = jetzt + richtung;
  if (ziel < 0 || ziel >= zeilen.length) { spieleAnschlag(); return; }
  zeilen[ziel].focus();
  sage(zeilen[ziel].dataset.ansage || zeilen[ziel].textContent);
}

function schliesseTooltip() {
  if (!tooltipOffen) return;
  tooltip.hidden = true;
  tooltipOffen = false;
  klang("tooltipZu");
  if (tooltipRueckkehr) fokussiere(tooltipRueckkehr, true);
  tooltipRueckkehr = null;
}

document.addEventListener("keydown", (e) => {
  if (!e.shiftKey) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (!eingabefeld.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (!tooltipOffen) {
    const li = document.activeElement;
    if (!li || !li.classList || !li.classList.contains("eintrag")) return;
    oeffneTooltip(li);
    return;
  }
  tooltipWeiter(e.key === "ArrowDown" ? 1 : -1);
}, true);

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && tooltipOffen) schliesseTooltip();
}, true);

// =====================================================================
// Quelle der Daten
// =====================================================================

async function quelleSichern() {
  if (stationsPfad) return stationsPfad;
  const gefunden = await window.sku505.stationSuchen();
  if (gefunden.gefunden) { stationsPfad = gefunden.rolandPfad; schreibbar = true; return stationsPfad; }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) { stationsPfad = eigen.pfad; schreibbar = false; return stationsPfad; }
  return null;
}

// =====================================================================
// Inhalte nachladen
// =====================================================================

async function laden(li) {
  const art = li.dataset.laden;

  // Die Listen des Live-Bereichs brauchen keine Stationsdaten.
  if (art === "midiplatz" || art === "midicc" || art === "midikanal") {
    setzeKinder(li, liveLaden(art, li));
    return true;
  }

  const pfad = await quelleSichern();
  if (!pfad) { sage("Keine Daten, erst Station suchen"); return false; }

  if (art === "platz") {
    const e = await window.sku505.speicherplatzLesen(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, platzEintraege(e.daten));
    return true;
  }

  if (art === "wertoptionen") {
    const liste = auswahlMitJetzt(li.dataset.art, li._beschreibung, li.dataset.rohwert);
    const jetzt = String(li.dataset.rohwert);
    setzeKinder(li, liste.map(o => ({ typ: "option", text: o.text, ziel: o.wert })));
    const gruppe = li.querySelector(":scope > ul");
    const treffer = Array.from(gruppe.children).find(k => k.dataset.ziel === jetzt);
    if (treffer) { oeffne(li); fokussiere(treffer); return "fokussiert"; }
    return true;
  }

  if (art === "loops") {
    const e = await window.sku505.loopsAuflisten(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.spuren.map(s => ({
      typ: "ordner",
      text: "Spur " + s.spur + ": " + (s.datei ? s.sekunden.toFixed(1).replace(".", ",") + " Sekunden" : "leer"),
      nummer: li.dataset.nummer, spur: s.spur,
      kinder: [
        { typ: "aktion", id: "loop-export", text: "Aufnahme exportieren", nummer: li.dataset.nummer, spur: s.spur },
        { typ: "aktion", id: "loop-import", text: "WAV-Datei einspielen", nummer: li.dataset.nummer, spur: s.spur }
      ]
    })));
    return true;
  }

  // Spiegel des Gerätemenüs: alle Systemwerte in genau der Reihenfolge, in
  // der sie auch an der Station stehen. Damit lässt sich am Bildschirm
  // abzählen, wie oft man am Gerät den Pfeil rechts drücken muss.
  //
  // Dass die Reihenfolge stimmt, ist belegt: In der Datei liegt Eingang auf
  // Line Out zwei Plätze vor der USB-Betriebsart, und genau dieser Abstand
  // hat sich am Gerät bestätigt.
  if (art === "geraetemenu") {
    const e = await window.sku505.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    let nummer = 0;
    for (const abschnitt of Object.keys(e.daten)) {
      for (const feld of Object.keys(e.daten[abschnitt])) {
        // Der zuletzt gewählte Speicherplatz steht zwar in der Datei, ist aber
        // kein Menüpunkt der Station. Er wird im Spielbildschirm mit dem
        // Regler gewählt. Darum bleibt er hier draußen, sonst würde er die
        // ganze Nummerierung um eins verschieben.
        if (abschnitt === "SETUP" && feld === "MemNum") continue;
        nummer++;
        const b = feldBeschreibung(abschnitt, feld);
        const nr = String(nummer).padStart(2, "0");
        // Der Anker wird eigens benannt, er ist der einzige Wert, den man
        // am Gerät hören kann.
        const anker = (abschnitt === "INPUT_OUTPUT" && feld === "InLineOut")
          ? ", Anker, Mikrofon im Lautsprecher" : "";
        if (b) {
          eintraege.push({
            typ: "wert", text: nr + " " + b.text + anker, art: b.art || "zahl",
            datei: "SYSTEM", nummer: 0, abschnitt, feld, rohwert: e.daten[abschnitt][feld],
            beschreibung: b, laden: b.nurLesen ? undefined : "wertoptionen",
            id: b.nurLesen ? "nur-lesen" : "wert"
          });
        } else {
          eintraege.push({ typ: "aktion", id: "nur-lesen",
            text: nr + " " + feld + ": " + e.daten[abschnitt][feld] });
        }
      }
    }
    setzeKinder(li, eintraege);
    return true;
  }

  if (art === "system") {
    const e = await window.sku505.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    for (const abschnitt of Object.keys(e.daten)) {
      eintraege.push({ typ: "ordner", text: abschnittName(abschnitt),
        kinder: felderZuEintraegen("SYSTEM", 0, abschnitt, e.daten[abschnitt]) });
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
  if (/^(INPUT_FX|TRACK_FX)[123]$/.test(abschnitt)) return "Parameter Taste " + "ABC"[abschnitt.slice(-1) - 1];
  if (/^BEAT_FX[123]$/.test(abschnitt)) return "Beat-Effekte Taste " + "ABC"[abschnitt.slice(-1) - 1];
  return abschnitt;
}

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
      eintraege.push({ typ: "aktion", id: "nur-lesen", text: feld + ": " + werte[feld] });
    }
  }
  return eintraege;
}

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
    if (bank === "TRACK_FX") {
      for (let i = 1; i <= 3; i++) {
        const teil = "BEAT_FX" + i;
        if (daten[teil] && Object.keys(daten[teil]).length) {
          kinder.push({ typ: "ordner", text: abschnittName(teil),
            kinder: felderZuEintraegen("MEMORY", n, teil, daten[teil]) });
        }
      }
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
// Aktionen der Werkstatt
// =====================================================================

async function stationSuchen(li) {
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) {
    stationsPfad = e.rolandPfad; schreibbar = true;
    ergebnis(li, "Station gefunden, Laufwerk " + e.laufwerk,
      ["Station gefunden", "Laufwerk " + e.laufwerk, "Ändern möglich"]);
    return;
  }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) {
    stationsPfad = eigen.pfad; schreibbar = false;
    ergebnis(li, "Keine Station, nur Lesen",
      ["Keine Station angeschlossen", "Arbeite mit dem eingelesenen Stand", "Ändern nicht möglich"]);
    return;
  }
  stationsPfad = null; schreibbar = false;
  ergebnis(li, "Keine Station gefunden", [
    "Keine Station gefunden", "Sie muss im Speicher-Modus angeschlossen sein",
    "Am Gerät: 1.3 ein Mal, 1.2 acht Mal, Regler auf Speicher, 2.2, dann Station aus und ein"
  ]);
}

async function firmwarePruefen(li) {
  const p = await quelleSichern();
  if (!p) { ergebnis(li, "Keine Daten vorhanden", null); return; }
  const e = await window.sku505.kenndatenLesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Lesen", ["Fehler", e.fehler]); return; }
  const fw = e.revision === "2" ? "Firmware 2.0" : "Firmware unbekannt";
  ergebnis(li, e.geraet + ", " + fw,
    ["Gerät " + e.geraet, fw, "Datenstand " + e.revision, schreibbar ? "Ändern möglich" : "Nur Lesen"]);
}

async function speicherplaetzeLaden(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten, erst Station suchen"); return; }
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
  const belegt = e.plaetze.filter(x => x.spuren > 0);
  const neuerKnopf = ordner.querySelector(":scope > ul > li");
  ergebnis(neuerKnopf, e.plaetze.length + " Plätze, " + belegt.length + " belegt",
    [e.plaetze.length + " Speicherplätze", belegt.length + " davon belegt"].concat(
      belegt.map(x => "Platz " + x.nummer + ", " + x.name.trim() + ", " + x.spuren + " Spuren")));
}

async function wertSetzen(optionLi) {
  const wertLi = elternVon(optionLi);
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }

  const neu = optionLi.dataset.ziel;
  const alterText = wertText(wertLi.dataset.art, wertLi.dataset.rohwert, wertLi._beschreibung);
  const e = await window.sku505.wertSchreiben(stationsPfad, auftrag);
  if (!e.ok) { ergebnis(wertLi, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }

  if (!e.geaendert) {
    ergebnis(wertLi, "Steht schon auf " + optionLi.dataset.text, null);
  } else if (e.bestaetigt) {
    wertLi.dataset.rohwert = neu;
    aktualisiereZeile(wertLi);
    ergebnis(wertLi, wertLi.dataset.text + " geändert auf " + optionLi.dataset.text, null);
  } else {
    ergebnis(wertLi, "Achtung, Kontrolle fehlgeschlagen", [
      "Die Kontrolle nach dem Schreiben hat nicht gestimmt",
      "Gewünscht: " + neu, "Gelesen: " + e.gelesen, "Vorher: " + alterText,
      "Den Wert am Gerät prüfen"
    ]);
    return;
  }
  schliesse(wertLi);
  wertLi.dataset.geladen = "";
  fokussiere(wertLi, true);
  klang("ebeneZurueck");
}

function frageText(beschriftung, vorgabe) {
  return new Promise((fertig) => {
    eingabefeld.value = vorgabe || "";
    eingabefeld.setAttribute("aria-label", beschriftung + ", Enter bestätigt, Escape bricht ab");
    eingabefeld.hidden = false;
    eingabefeld.focus();
    eingabefeld.select();
    sage(beschriftung);
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
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const alt = li.dataset.text.replace(/^Name: /, "");
  const neu = await frageText("Neuer Name, höchstens 12 Zeichen", alt);
  fokussiere(li);
  if (neu === null) { sage("Abgebrochen"); return; }
  const e = await window.sku505.nameSchreiben(stationsPfad, parseInt(li.dataset.nummer, 10), neu);
  if (!e.ok) { ergebnis(li, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }
  li.dataset.text = "Name: " + e.name;
  aktualisiereZeile(li);
  ergebnis(li, "Name geändert auf " + e.name,
    ["Name geändert", "Jetzt: " + e.name, "Vorher: " + alt]);
}

async function platzUebertragen(optionLi, tauschen) {
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const von = parseInt(optionLi.dataset.nummer, 10);
  const nach = parseInt(optionLi.dataset.ziel, 10);
  if (von === nach) { sage("Quelle und Ziel sind gleich"); return; }
  const e = tauschen
    ? await window.sku505.platzTauschen(stationsPfad, von, nach)
    : await window.sku505.platzKopieren(stationsPfad, von, nach);
  if (!e.ok) { ergebnis(optionLi, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.bestaetigt) {
    ergebnis(optionLi, (tauschen ? "Getauscht mit Platz " : "Kopiert auf Platz ") + nach, [
      (tauschen ? "Getauscht" : "Kopiert"), "Von Platz " + von, "Nach Platz " + nach,
      "Nur die Einstellungen", "Die Loop-Aufnahmen bleiben liegen"
    ]);
  } else {
    ergebnis(optionLi, "Achtung, Kontrolle fehlgeschlagen",
      ["Die Kontrolle nach dem Schreiben hat nicht gestimmt", "Den Platz am Gerät prüfen"]);
  }
}

async function loopExportieren(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden"); return; }
  const vorschlag = "Platz" + String(li.dataset.nummer).padStart(2, "0") + "_Spur" + li.dataset.spur + ".wav";
  const wahl = await window.sku505.dateiWaehlen(true, vorschlag);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  const e = await window.sku505.loopExportieren(p, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Fehler beim Export", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Exportiert, " + Math.round(e.bytes / 1024) + " Kilobyte",
    ["Export fertig", Math.round(e.bytes / 1024) + " Kilobyte", "Datei: " + wahl.pfad]);
}

async function loopImportieren(li) {
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const wahl = await window.sku505.dateiWaehlen(false);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  const e = await window.sku505.loopImportieren(stationsPfad, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Einspielen nicht möglich", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Eingespielt auf Spur " + li.dataset.spur,
    ["Eingespielt", "Spur " + li.dataset.spur, "Datei: " + e.datei]);
}

async function einstellungenEinlesen(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden"); return; }
  const e = await window.sku505.einstellungenEinlesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Einlesen", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Einstellungen eingelesen",
    ["Einstellungen eingelesen", Math.round(e.bytes / 1024) + " Kilobyte", "2 Dateien"]);
}

async function loopsEinlesen(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden"); return; }
  sage("Lese Loop-Aufnahmen ein");
  const e = await window.sku505.loopsEinlesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Einlesen", ["Fehler", e.fehler]); return; }
  if (e.vollstaendig) {
    ergebnis(li, "Loops eingelesen, " + e.kopie + " Dateien",
      ["Loop-Aufnahmen eingelesen", e.kopie + " Dateien", "Vollständig"]);
  } else {
    ergebnis(li, "Achtung, unvollständig",
      ["Unvollständig eingelesen", "Quelle " + e.quelle + " Dateien", "Kopie " + e.kopie + " Dateien"]);
  }
}

// Trennen und Wiederverbinden der USB-Verbindung, ohne das Kabel anzufassen.
//
// Die Station bringt dafür einen eigenen Weg mit, der im Handbuch steht:
// Erst am Rechner die Schreibpuffer leeren, dann am Gerät EXIT drücken und
// die Rückfrage mit WRITE bestätigen. Erst danach verlässt die Station den
// Zustand Idling, das Bedienfeld reagiert wieder und die Betriebsart lässt
// sich umstellen. Solange sie als Laufwerk verbunden ist, sind die Tasten
// am Gerät wirkungslos.
// =====================================================================
// Betriebsart der Station
//
// Die Station kann immer nur eines von beidem: als Laufwerk erscheinen
// (Werkstatt) oder als Audio- und MIDI-Gerät (Bühne). Was sie beim
// Verbinden wird, steht in ihrer Systemeinstellung USB-Betriebsart.
//
// Weil das Display nicht lesbar ist, überwacht Sku505 den Zustand laufend
// und meldet jede Änderung von selbst. So ist immer klar, woran man ist.
// =====================================================================

let letzterZustand = null;

// Die Namen der Speicherplätze aus dem zuletzt eingelesenen Stand. Im
// Bühnen-Modus gibt es kein Laufwerk, darum stammen sie aus der Kopie im
// Programmordner. So kann Sku505 auch live sagen, wie ein Platz heißt.
let platzListe = null;

async function platzListeLaden() {
  const eigen = await window.sku505.datenordner();
  if (!eigen.ok || !eigen.vorhanden) return;
  const e = await window.sku505.speicherplaetzeLesen(eigen.pfad);
  if (e.ok) platzListe = e.plaetze;
}

// Beschreibt einen Speicherplatz so kurz wie möglich, mit Namen wenn bekannt.
function platzBeschreibung(nummer) {
  if (!nummer) return "Kein Platz gemeldet";
  const p = platzListe && platzListe.find(x => x.nummer === nummer);
  if (!p) return "Platz " + nummer;
  const name = (p.name || "").trim();
  const inhalt = p.spuren === 0 ? "leer" : p.spuren + " Spuren";
  return "Platz " + nummer + (name ? ", " + name : "") + ", " + inhalt;
}

async function zustandLesen() {
  const l = await window.sku505.laufwerkDa();
  if (l.ok && l.gefunden) return "werkstatt";
  if (typeof midiHatStation === "function" && midiHatStation()) return "buehne";
  return "getrennt";
}

function zustandText(z) {
  if (z === "werkstatt") return "Werkstatt, Datenmodus";
  if (z === "buehne") return "Bühne, Audio und MIDI";
  return "Station nicht verbunden";
}

async function zustandPruefen(ansagen) {
  const z = await zustandLesen();
  if (z !== letzterZustand) {
    letzterZustand = z;
    // Bei jedem Wechsel die Erkennung zurücksetzen, damit Sku505 nicht mit
    // einem veralteten Pfad weiterarbeitet.
    stationsPfad = null;
    schreibbar = false;
    if (ansagen) sage(zustandText(z));
  }
  return z;
}

async function betriebsartAnsagen(li) {
  const z = await zustandLesen();
  letzterZustand = z;
  const zeilen = [zustandText(z)];
  if (z === "werkstatt") {
    zeilen.push("Einstellen ist möglich", "Spielen mit gestecktem USB nicht");
  } else if (z === "buehne") {
    zeilen.push("Spielen ist möglich", "Ansager, Fernbedienung und Aufnahme gehen");
    zeilen.push("Einstellungen sind jetzt nicht erreichbar");
  } else {
    zeilen.push("Kein Laufwerk und kein MIDI-Gerät", "USB einschalten oder Station einschalten");
  }
  ergebnis(li, zustandText(z), zeilen);
}

// Stellt die Betriebsart um. ziel ist buehne oder werkstatt.
async function betriebsartWechseln(li, ziel) {
  const z = await zustandLesen();
  letzterZustand = z;

  if (z === ziel) {
    ergebnis(li, "Steht schon auf " + zustandText(ziel), null);
    return;
  }

  // Schreiben geht nur, solange die Station als Laufwerk da ist.
  if (z === "werkstatt") {
    const pfad = await quelleSichern();
    if (!pfad || !schreibbar) { sage("Station nicht erreichbar"); return; }
    const e = await window.sku505.wertSchreiben(pfad, {
      datei: "SYSTEM", nummer: 0, abschnitt: "USB", feld: "Mod",
      wert: ziel === "buehne" ? "1" : "0"
    });
    if (!e.ok) { ergebnis(li, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }
    if (e.geaendert && !e.bestaetigt) {
      ergebnis(li, "Achtung, Kontrolle fehlgeschlagen",
        ["Der Wert wurde nicht bestätigt", "Gelesen: " + e.gelesen]);
      return;
    }
    ergebnis(li, "Eingestellt, jetzt Station aus und wieder ein", [
      "Betriebsart auf " + zustandText(ziel) + " gesetzt und geprüft",
      "Wichtig: Die Station liest diese Einstellung nur beim Einschalten",
      "Ein bloßes Trennen der USB-Verbindung genügt nicht",
      "Schritt 1: Netzknopf drücken und halten, bis die Station aus ist",
      "Schritt 2: Netzknopf wieder drücken, ein paar Sekunden warten",
      "Schritt 3: USB verbinden",
      "Sku505 sagt von selbst an, was danach da ist"
    ]);
    return;
  }

  // In der Bühne gibt es kein Laufwerk. Dafür reagiert dort das Bedienfeld,
  // also geht es am Gerät. Der Regler-Schritt ist der entscheidende, er wird
  // am häufigsten vergessen.
  ergebnis(li, "Am Gerät umstellen, Schritt für Schritt", [
    "Im Bühnen-Modus gibt es kein Laufwerk, Sku505 kann nichts schreiben",
    "Dafür reagiert jetzt das Bedienfeld der Station",
    "Schritt 1: Taste 2.2, EXIT, drei Mal drücken, damit du sicher im Spielbildschirm bist",
    "Schritt 2: Taste 1.3, SYSTEM, genau ein Mal drücken",
    "Schritt 3: Taste 1.2, Pfeil rechts, genau acht Mal drücken",
    "Damit stehst du auf der USB-Betriebsart",
    "Schritt 4: den Regler MEMORY VALUE eine Raste drehen, es gibt nur zwei Werte",
    "Schritt 5: Taste 2.2, EXIT, einmal drücken",
    "Am Gerät geändert wirkt sofort, kein Aus- und Einschalten nötig",
    "Danach USB verbinden, Sku505 sagt an, was da ist"
  ]);
}

async function usbVorbereiten(li) {
  sage("Bereite Trennung vor");
  stationsPfad = null;
  schreibbar = false;
  const e = await window.sku505.usbSteuern("vorbereiten");
  if (!e.ok) { ergebnis(li, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.problem) { ergebnis(li, "Hat nicht geklappt", ["Fehler", e.problem]); return; }

  ergebnis(li, "Bereit, jetzt am Gerät EXIT drücken", [
    "Die Schreibpuffer sind geleert, es kann nichts verloren gehen",
    "Schritt 1: am Gerät Taste 2.2, EXIT, drücken",
    "Schritt 2: im Display steht Disconnect OK, mit Taste 2.1, WRITE, bestätigen",
    "Danach reagiert das Bedienfeld wieder",
    "Betriebsart umstellen: 1.3 ein Mal, dann 1.2 acht Mal, Regler eine Raste, 2.2",
    "Meldet sich die Station nicht von selbst, hier Verbindung erneuern wählen"
  ]);
}

async function usbErneuern(li) {
  sage("Erneuere Verbindung");
  stationsPfad = null;
  schreibbar = false;
  const e = await window.sku505.usbSteuern("erneuern");
  if (!e.ok) { ergebnis(li, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.problem) { ergebnis(li, "Hat nicht geklappt", ["Fehler", e.problem]); return; }
  const zustand = e.zustand === "SPEICHER" ? "Speicher-Modus"
    : e.zustand === "AUDIO" ? "Audio und MIDI"
    : "nicht angemeldet";
  ergebnis(li, "Station im " + zustand, [
    "Zustand der Verbindung",
    "Station jetzt im " + zustand,
    e.zustand === "GETRENNT" ? "Die Station meldet sich von selbst, sobald sie bereit ist" : "Verbindung steht"
  ]);
}

async function inGitSichern(li) {
  const e = await window.sku505.gitSichern("Stationsdaten gesichert");
  if (!e.ok) { ergebnis(li, "Fehler beim Sichern", ["Fehler", e.fehler]); return; }
  ergebnis(li, e.neu ? "In Git gesichert" : "Nichts Neues zu sichern", [e.meldung]);
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
    { typ: "ordner", text: "Gerätemenü, gleiche Reihenfolge wie an der Station", laden: "geraetemenu" },
    { typ: "ordner", text: "Einlesen und sichern", kinder: [
      { typ: "aktion", id: "einst-einlesen", text: "Einstellungen einlesen, schnell" },
      { typ: "aktion", id: "loops-einlesen", text: "Loop-Aufnahmen einlesen, dauert lange" },
      { typ: "aktion", id: "git-sichern", text: "Stand in Git sichern" }
    ]}
  ]},
  { typ: "ordner", text: "Live-Studio", kinder: liveMenue() },
  { typ: "ordner", text: "Betriebsart und USB", kinder: [
    { typ: "aktion", id: "art-ansagen", text: "Betriebsart ansagen" },
    { typ: "aktion", id: "art-buehne", text: "Auf Bühne umstellen, Audio und MIDI" },
    { typ: "aktion", id: "art-werkstatt", text: "Auf Werkstatt umstellen, Datenmodus" },
    { typ: "aktion", id: "usb-vorbereiten", text: "Trennung vorbereiten" },
    { typ: "aktion", id: "usb-erneuern", text: "Verbindung erneuern" }
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
    case "ueber": sage("Sku505 Version 0.22"); return;
    case "station-suchen": await stationSuchen(li); return;
    case "firmware": await firmwarePruefen(li); return;
    case "platz-laden": await speicherplaetzeLaden(li); return;
    case "einst-einlesen": await einstellungenEinlesen(li); return;
    case "loops-einlesen": await loopsEinlesen(li); return;
    case "art-ansagen": await betriebsartAnsagen(li); return;
    case "art-buehne": await betriebsartWechseln(li, "buehne"); return;
    case "art-werkstatt": await betriebsartWechseln(li, "werkstatt"); return;
    case "usb-vorbereiten": await usbVorbereiten(li); return;
    case "usb-erneuern": await usbErneuern(li); return;
    case "git-sichern": await inGitSichern(li); return;
    case "name-aendern": await nameAendern(li); return;
    case "kopieren-nach": await platzUebertragen(li, false); return;
    case "tauschen-mit": await platzUebertragen(li, true); return;
    case "loop-export": await loopExportieren(li); return;
    case "loop-import": await loopImportieren(li); return;
    case "midi-verbinden": await midiVerbinden(li); return;
    case "ansager": ansagerUmschalten(li); return;
    case "platz-ansagen": platzAnsagen(li); return;
    case "tempo-ansagen": tempoAnsagen(li); return;
    case "midi-platz": platzUmschalten(li); return;
    case "midi-cc": steuerbefehlSenden(li); return;
    case "midi-kanal": kanalSetzen(li); return;
    case "aufnahme-start": await aufnahmeStarten(li); return;
    case "aufnahme-stopp": await aufnahmeStoppen(li); return;
    case "nur-lesen": sage("Lässt sich hier nicht ändern"); return;
    default: sage(li.dataset.text); return;
  }
}

baumElement.addEventListener("keydown", async (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || !aktiv.classList || !aktiv.classList.contains("eintrag")) return;

  // Sammelt der Filter gerade Buchstaben, zeigt Pfeil runter das Ergebnis.
  if (ereignis.key === "ArrowDown" && filterSammelt) {
    ereignis.preventDefault();
    filterAnwenden(aktiv);
    return;
  }

  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag(); else fokussiere(ebene[index + 1]);
      return;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag(); else fokussiere(ebene[index - 1]);
      return;
    case "Home":
      ereignis.preventDefault();
      if (index === 0) spieleAnschlag();
      fokussiere(ebene[0]);
      return;
    case "End":
      ereignis.preventDefault();
      if (index === ebene.length - 1) spieleAnschlag();
      fokussiere(ebene[ebene.length - 1]);
      return;
    case "ArrowRight":
      ereignis.preventDefault();
      await hineingehen(aktiv);
      return;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      return;
    case "Enter":
      ereignis.preventDefault();
      filterAufheben(true);
      await aktiviere(aktiv);
      return;
    case "Escape":
      ereignis.preventDefault();
      // Wie die Rücktaste: eine Ebene zurück, ohne etwas zu ändern.
      ebeneZurueck(aktiv);
      return;
    case "PageDown": {
      ereignis.preventDefault();
      const ziel = Math.min(index + 10, ebene.length - 1);
      if (ziel === index) spieleAnschlag();
      fokussiere(ebene[ziel]);
      return;
    }
    case "PageUp": {
      ereignis.preventDefault();
      const ziel = Math.max(index - 10, 0);
      if (ziel === index) spieleAnschlag();
      fokussiere(ebene[ziel]);
      return;
    }
  }

  filterTaste(ereignis, aktiv);
});

baueEbene(menue, baumElement);
fokussiere(baumElement.querySelector(".eintrag"));
sage("Sku505 bereit");

// MIDI still im Hintergrund verbinden und den Zustand ab jetzt überwachen.
// Beim ersten Blick wird noch nichts angesagt, danach jede Änderung.
(async () => {
  if (typeof midiStillVerbinden === "function") await midiStillVerbinden();
  await platzListeLaden();
  await zustandPruefen(false);
  if (midiZugang) {
    midiZugang.onstatechange = async () => {
      if (typeof midiStillVerbinden === "function") await midiStillVerbinden();
      await zustandPruefen(true);
    };
  }
  window.setInterval(() => zustandPruefen(true), 2000);
})();
