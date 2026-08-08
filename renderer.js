// Sku505 Version 0.03.
// Baummenü nach Anforderungsprofil: Pfeil hoch/runter wandern in der Ebene,
// Pfeil rechts hinein, Pfeil links (auch Rücktaste und Entfernen) heraus,
// Enter aktiviert. Werte-Zeilen öffnen mit Pfeil rechts ihre Auswahl.

const menue = [
  {
    id: "werkstatt", text: "Werkstatt", typ: "ordner", kinder: [
      { id: "station-suchen", text: "Station suchen", typ: "aktion" },
      { id: "daten-einlesen", text: "Stationsdaten einlesen", typ: "aktion" },
      { id: "firmware", text: "Firmware und Datenstand prüfen", typ: "aktion" },
      { id: "speicherplaetze", text: "Speicherplätze", typ: "ordner", kinder: [
        { id: "platz-info", text: "Erst Stationsdaten einlesen", typ: "aktion" }
      ]}
    ]
  },
  {
    id: "livestudio", text: "Live-Studio", typ: "ordner", kinder: [
      { id: "live-info", text: "Wird in einer späteren Stufe gebaut", typ: "aktion" }
    ]
  },
  {
    id: "optionen", text: "Optionen", typ: "ordner", kinder: [
      { id: "probe", text: "Probe-Bereich für die Abnahme", typ: "ordner", kinder: [
        { id: "test-schalter", text: "Testschalter", typ: "wert", wert: "Aus", auswahl: ["An", "Aus"] },
        { id: "test-effekt", text: "Test-Effekt", typ: "wert", wert: "Kein", auswahl: ["Kein", "Filter", "Phaser", "Flanger", "Delay", "Reverb"] },
        { id: "test-aktion", text: "Test-Aktion mit Ansage", typ: "aktion" }
      ]},
      { id: "ueber", text: "Über Sku505", typ: "aktion" }
    ]
  },
  { id: "beenden", text: "Sku505 beenden", typ: "aktion" }
];

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");

// Merkt sich die zuletzt gefundene Station für die Werkstatt-Aktionen.
let stationsPfad = null;

function sage(text) {
  statuszeile.textContent = text;
}

// Anschlagton wie in Skularis definiert: erzeugter Ton, 220 Hertz, 400 ms.
// Kein Dateizugriff, kann darum nicht ausfallen.
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

function baueEbene(eintraege, elternListe, ebene) {
  for (const eintrag of eintraege) {
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(ebene));
    li.dataset.id = eintrag.id;
    li.dataset.typ = eintrag.typ;
    li.tabIndex = -1;

    const zeile = document.createElement("span");
    zeile.className = "zeile";
    li.appendChild(zeile);
    elternListe.appendChild(li);

    if (eintrag.typ === "ordner") {
      li.setAttribute("aria-expanded", "false");
      const gruppe = document.createElement("ul");
      gruppe.setAttribute("role", "group");
      gruppe.hidden = true;
      baueEbene(eintrag.kinder, gruppe, ebene + 1);
      li.appendChild(gruppe);
    }

    if (eintrag.typ === "wert") {
      li.setAttribute("aria-expanded", "false");
      li.dataset.wert = eintrag.wert;
      const gruppe = document.createElement("ul");
      gruppe.setAttribute("role", "group");
      gruppe.hidden = true;
      for (const moeglichkeit of eintrag.auswahl) {
        const optionLi = document.createElement("li");
        optionLi.setAttribute("role", "treeitem");
        optionLi.setAttribute("aria-level", String(ebene + 1));
        optionLi.dataset.typ = "option";
        optionLi.dataset.option = moeglichkeit;
        optionLi.tabIndex = -1;
        const optionZeile = document.createElement("span");
        optionZeile.className = "zeile";
        optionZeile.textContent = moeglichkeit;
        optionLi.appendChild(optionZeile);
        gruppe.appendChild(optionLi);
      }
      li.appendChild(gruppe);
    }

    aktualisiereZeile(li, eintrag.text);
  }
}

function aktualisiereZeile(li, basisText) {
  const zeile = li.querySelector(":scope > .zeile");
  if (basisText) li.dataset.text = basisText;
  const text = li.dataset.text;
  if (li.dataset.typ === "wert") {
    zeile.textContent = text + ": " + li.dataset.wert;
  } else {
    zeile.textContent = text;
  }
}

// Nur die Geschwister der aktuellen Ebene. Bewegung bleibt strikt in der Ebene.
function ebenenEintraege(li) {
  return Array.from(li.parentElement.children)
    .filter(e => e.getAttribute("role") === "treeitem");
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
  if (elternListe && elternListe.getAttribute("role") === "group") {
    return elternListe.parentElement;
  }
  return null;
}

function ebeneZurueck(aktiv) {
  if (aktiv.getAttribute("aria-expanded") === "true") {
    schliesse(aktiv);
    return;
  }
  const eltern = elternVon(aktiv);
  if (eltern) {
    schliesse(eltern);
    fokussiere(eltern);
  } else {
    spieleAnschlag();
  }
}

// --- Werkstatt-Aktionen ---

async function stationSuchen() {
  sage("Suche die Station als Laufwerk...");
  const ergebnis = await window.sku505.stationSuchen();
  if (ergebnis.gefunden) {
    stationsPfad = ergebnis.rolandPfad;
    sage("Station gefunden auf Laufwerk " + ergebnis.laufwerk);
  } else {
    stationsPfad = null;
    sage("Keine Station gefunden. Sie muss im Speicher-Modus angeschlossen sein, USB Mode STORAGE.");
  }
}

async function datenEinlesen() {
  if (!stationsPfad) { await stationSuchen(); if (!stationsPfad) return; }
  sage("Lese Stationsdaten ein, bitte warten...");
  const ergebnis = await window.sku505.datenEinlesen(stationsPfad);
  if (ergebnis.ok && ergebnis.vollstaendig) {
    sage("Stationsdaten eingelesen, " + ergebnis.kopie + " Dateien, vollständig.");
  } else if (ergebnis.ok) {
    sage("Achtung: Einlesen unvollständig. Quelle " + ergebnis.quelle + " Dateien, Kopie " + ergebnis.kopie + ".");
  } else {
    sage("Fehler beim Einlesen: " + ergebnis.fehler);
  }
}

async function firmwarePruefen() {
  if (!stationsPfad) { await stationSuchen(); if (!stationsPfad) return; }
  const ergebnis = await window.sku505.kenndatenLesen(stationsPfad);
  if (!ergebnis.ok) {
    sage("Fehler beim Lesen: " + ergebnis.fehler);
    return;
  }
  let meldung = "";
  if (ergebnis.geraeteName) meldung += "Gerät " + ergebnis.geraeteName + ". ";
  if (ergebnis.revision) meldung += "Datenformat Revision " + ergebnis.revision + ". ";
  if (ergebnis.speicherDatei) meldung += "Speicherdatei " + ergebnis.speicherDatei + ".";
  if (!meldung) meldung = "Keine Speicherdatei gefunden. Ordner: " + ergebnis.ordner.join(", ");
  sage(meldung);
}

function aktiviere(li) {
  const typ = li.dataset.typ;

  if (typ === "ordner" || typ === "wert") {
    if (oeffne(li)) {
      const erstesKind = li.querySelector(':scope > ul[role="group"] > li');
      fokussiere(erstesKind);
    }
    return;
  }

  if (typ === "option") {
    const wertZeile = elternVon(li);
    wertZeile.dataset.wert = li.dataset.option;
    aktualisiereZeile(wertZeile);
    schliesse(wertZeile);
    fokussiere(wertZeile);
    sage(wertZeile.dataset.text + " ist jetzt " + li.dataset.option);
    return;
  }

  const id = li.dataset.id;
  if (id === "beenden") { window.close(); return; }
  if (id === "ueber") {
    sage("Sku505 Version 0.03. Werkstatt-Grundfunktionen: suchen, einlesen, prüfen.");
    return;
  }
  if (id === "test-aktion") { sage("Test-Aktion ausgeführt. Ansagen funktionieren."); return; }
  if (id === "station-suchen") { stationSuchen(); return; }
  if (id === "daten-einlesen") { datenEinlesen(); return; }
  if (id === "firmware") { firmwarePruefen(); return; }
  sage(li.dataset.text + ": diese Funktion wird in einer späteren Version gebaut.");
}

baumElement.addEventListener("keydown", (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv.getAttribute("role") !== "treeitem") return;
  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag();
      else fokussiere(ebene[index + 1]);
      break;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag();
      else fokussiere(ebene[index - 1]);
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
      if (aktiv.hasAttribute("aria-expanded")) {
        oeffne(aktiv);
        fokussiere(aktiv.querySelector(':scope > ul[role="group"] > li'));
      } else {
        spieleAnschlag();
      }
      break;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      break;
    case "Enter":
      ereignis.preventDefault();
      aktiviere(aktiv);
      break;
  }
});

baueEbene(menue, baumElement, 1);
fokussiere(baumElement.querySelector('li[role="treeitem"]'));
sage("Sku505 bereit.");
