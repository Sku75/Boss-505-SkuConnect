// Sku505 Version 0.01, Bediengerüst.
// Baummenü nach Anforderungsprofil: Pfeil hoch/runter wandern, Pfeil rechts hinein,
// Pfeil links heraus, Enter aktiviert. Werte-Zeilen öffnen mit Pfeil rechts ihre
// Auswahl, Enter stellt den Wert um.

// Menü-Definition. Typen:
// ordner  = Untermenü mit Kindern
// aktion  = mit Enter ausführbar
// wert    = umschaltbarer Wert; auswahl = Liste der möglichen Werte
const menue = [
  {
    id: "werkstatt", text: "Werkstatt", typ: "ordner", kinder: [
      { id: "verbindung", text: "Verbindung zur Station prüfen", typ: "aktion" },
      { id: "backup", text: "Backup erstellen", typ: "aktion" },
      { id: "speicherplaetze", text: "Speicherplätze", typ: "ordner", kinder: [
        { id: "platz-info", text: "Noch keine Station verbunden", typ: "aktion" }
      ]}
    ]
  },
  {
    id: "probe", text: "Probe-Bereich für die Abnahme", typ: "ordner", kinder: [
      { id: "test-schalter", text: "Testschalter", typ: "wert", wert: "Aus", auswahl: ["An", "Aus"] },
      { id: "test-effekt", text: "Test-Effekt", typ: "wert", wert: "Kein", auswahl: ["Kein", "Filter", "Phaser", "Flanger", "Delay", "Reverb"] },
      { id: "test-aktion", text: "Test-Aktion mit Ansage", typ: "aktion" }
    ]
  },
  {
    id: "system", text: "System", typ: "ordner", kinder: [
      { id: "ueber", text: "Über Sku505", typ: "aktion" },
      { id: "beenden", text: "Sku505 beenden", typ: "aktion" }
    ]
  }
];

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");

function sage(text) {
  statuszeile.textContent = text;
}

// Baut eine Menüebene als Liste. Werte-Zeilen bekommen ihre Auswahl als Kinder.
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

// Schreibt den sichtbaren und vorgelesenen Text einer Zeile.
// Werte-Zeilen zeigen ihren aktuellen Wert mit an, Beispiel: Testschalter: Aus.
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

// Liefert alle gerade sichtbaren Baum-Einträge in Lesereihenfolge.
function sichtbareEintraege() {
  return Array.from(baumElement.querySelectorAll('li[role="treeitem"]'))
    .filter(li => li.offsetParent !== null);
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

function aktiviere(li) {
  const typ = li.dataset.typ;

  if (typ === "ordner" || typ === "wert") {
    // Enter auf Ordner oder Wert wirkt wie Pfeil rechts: hinein.
    if (oeffne(li)) {
      const erstesKind = li.querySelector(':scope > ul[role="group"] > li');
      fokussiere(erstesKind);
    }
    return;
  }

  if (typ === "option") {
    // Enter auf einer Auswahl-Option: Wert übernehmen, zuklappen, zurück zur Wert-Zeile.
    const wertZeile = elternVon(li);
    wertZeile.dataset.wert = li.dataset.option;
    aktualisiereZeile(wertZeile);
    schliesse(wertZeile);
    fokussiere(wertZeile);
    sage(wertZeile.dataset.text + " ist jetzt " + li.dataset.option);
    return;
  }

  // Aktionen der Version 0.01
  const id = li.dataset.id;
  if (id === "beenden") {
    window.close();
    return;
  }
  if (id === "ueber") {
    sage("Sku505 Version 0.01. Bediengerüst zur Abnahme mit NVDA und Braille.");
    return;
  }
  if (id === "test-aktion") {
    sage("Test-Aktion ausgeführt. Ansagen funktionieren.");
    return;
  }
  sage(li.dataset.text + ": diese Funktion wird in einer späteren Version gebaut.");
}

baumElement.addEventListener("keydown", (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv.getAttribute("role") !== "treeitem") return;
  const sichtbar = sichtbareEintraege();
  const index = sichtbar.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      fokussiere(sichtbar[Math.min(index + 1, sichtbar.length - 1)]);
      break;
    case "ArrowUp":
      ereignis.preventDefault();
      fokussiere(sichtbar[Math.max(index - 1, 0)]);
      break;
    case "ArrowRight": {
      ereignis.preventDefault();
      if (aktiv.getAttribute("aria-expanded") === "false") {
        oeffne(aktiv);
        const erstesKind = aktiv.querySelector(':scope > ul[role="group"] > li');
        fokussiere(erstesKind);
      } else if (aktiv.getAttribute("aria-expanded") === "true") {
        const erstesKind = aktiv.querySelector(':scope > ul[role="group"] > li');
        fokussiere(erstesKind);
      }
      break;
    }
    case "ArrowLeft": {
      ereignis.preventDefault();
      if (aktiv.getAttribute("aria-expanded") === "true") {
        schliesse(aktiv);
      } else {
        const eltern = elternVon(aktiv);
        if (eltern) {
          schliesse(eltern);
          fokussiere(eltern);
        }
      }
      break;
    }
    case "Enter":
      ereignis.preventDefault();
      aktiviere(aktiv);
      break;
  }
});

baueEbene(menue, baumElement, 1);
const erster = baumElement.querySelector('li[role="treeitem"]');
fokussiere(erster);
sage("Sku505 bereit. Pfeiltasten und Enter bedienen das Menü.");
