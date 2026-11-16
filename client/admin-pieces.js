/* =========================================================================
   Pièces jointes de l'équipe IA : captures d'écran et documents.
   Chaque fichier est préparé dans le navigateur avant l'envoi :
   - images : JPEG de 2576 px au plus (la limite de Claude), vignette à part ;
   - PDF : tels quels, 3 Mo au plus ;
   - Word, Excel, PowerPoint (.docx, .xlsx, .pptx), CSV et texte : convertis en texte.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic;
  var MO = 1024 * 1024;
  var MAX_BINAIRE = 3 * MO, MAX_TEXTE = 199000, MAX_PAR_MESSAGE = 6;
  var COTE_MAX = 2576, PIXELS_MAX = 3600000, COTE_APERCU = 300;
  var ACCEPT = "image/*,.pdf,.docx,.xlsx,.pptx,.txt,.csv,.tsv,.md,.json";

  function ext(nom) { var m = /\.([a-z0-9]+)$/i.exec(nom || ""); return m ? m[1].toLowerCase() : ""; }
  function taille(n) {
    if (!n) return "";
    if (n < 1024) return n + " o";
    if (n < MO) return Math.round(n / 1024) + " Ko";
    return (n / MO).toFixed(1).replace(".", ",") + " Mo";
  }
  function icone(p) {
    if (String(p.type).indexOf("image/") === 0) return "image";
    if (p.type === "application/pdf") return "file-pdf";
    return { docx: "file-doc", xlsx: "file-xls", pptx: "file-ppt", csv: "file-csv", tsv: "file-csv", json: "file-code" }[ext(p.nom)] || "file-text";
  }
  function libelle(p) {
    var sorte = p.type === "application/pdf" ? "PDF" : String(p.type).indexOf("image/") === 0 ? "Image"
      : { docx: "Word", xlsx: "Excel", pptx: "PowerPoint", csv: "CSV", tsv: "CSV" }[ext(p.nom)] || "Texte";
    return sorte + (p.taille ? " · " + taille(p.taille) : "");
  }
  function erreur(nom, texte) { return new Error("« " + (nom || "Ce fichier") + " » " + texte); }

  /* ---------------- Images ---------------- */
  function chargerImage(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok({ src: img, w: img.naturalWidth, h: img.naturalHeight, fin: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); ko(erreur(file.name, "n’est pas une image lisible. Envoyez une capture PNG ou JPEG.")); };
      img.src = url;
    });
  }
  function enJpeg(src, w, hauteur, qualite) {
    var c = document.createElement("canvas");
    c.width = w; c.height = hauteur;
    var g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, hauteur);
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, w, hauteur);
    var url = c.toDataURL("image/jpeg", qualite);
    if (url.indexOf("data:image/jpeg;base64,") !== 0) throw new Error("canvas");
    return url;
  }
  function nomImage(nom) {
    if (!nom || /^image\.(png|jpe?g|gif|webp)$/i.test(nom)) { // capture collée : nommée d'après la date et l'heure locales
      var d = new Date(), deux = function (n) { return String(n).padStart(2, "0"); };
      return "capture-" + d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()) + "-" + deux(d.getHours()) + "h" + deux(d.getMinutes()) + ".jpg";
    }
    return nom.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
  }
  function image(file) {
    var nom = nomImage(file.name);
    return chargerImage(file).then(function (im) {
      try {
        if (!im.w || !im.h) throw erreur(nom, "est vide.");
        var k = Math.min(1, COTE_MAX / Math.max(im.w, im.h), Math.sqrt(PIXELS_MAX / (im.w * im.h)));
        var W = Math.max(1, Math.round(im.w * k)), H = Math.max(1, Math.round(im.h * k));
        var url = enJpeg(im.src, W, H, 0.85);
        if ((url.length - 23) * 0.75 > MAX_BINAIRE) url = enJpeg(im.src, W, H, 0.6);
        var data = url.slice(23);
        if (data.length * 0.75 > MAX_BINAIRE) throw erreur(nom, "est trop lourde, même compressée.");
        var ka = Math.min(1, COTE_APERCU / Math.max(im.w, im.h));
        var aw = Math.max(1, Math.round(im.w * ka)), ah = Math.max(1, Math.round(im.h * ka));
        var apercu = enJpeg(im.src, aw, ah, 0.65);
        if (apercu.length > 55000) apercu = enJpeg(im.src, aw, ah, 0.4);
        return { nom: nom, type: "image/jpeg", data: data, apercu: apercu, taille: Math.floor(data.length * 3 / 4) };
      } catch (e) {
        throw e.message === "canvas" ? erreur(nom, "n’a pas pu être préparée. Réessayez avec une capture plus petite.") : e;
      } finally {
        im.fin();
      }
    });
  }

  /* ---------------- PDF et texte ---------------- */
  function pdf(file) {
    if (file.size > MAX_BINAIRE) return Promise.reject(erreur(file.name, "pèse " + taille(file.size) + " : 3 Mo au plus. Compressez-le, ou joignez des captures des pages utiles."));
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""); ok({ nom: file.name, type: "application/pdf", data: s.slice(s.indexOf(",") + 1), taille: file.size }); };
      r.onerror = function () { ko(erreur(file.name, "n’a pas pu être lu.")); };
      r.readAsDataURL(file);
    });
  }
  function decoder(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); } // CSV enregistré par Excel sous Windows
  }
  function finTexte(nom, t) {
    t = String(t || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!t) throw erreur(nom, "ne contient pas de texte lisible.");
    if (t.length > MAX_TEXTE) t = t.slice(0, MAX_TEXTE) + "\n[… document coupé : trop long pour l’assistante]";
    return { nom: nom, type: "text/plain", texte: t, taille: new Blob([t]).size };
  }
  function texteBrut(file) {
    if (file.size > 5 * MO) return Promise.reject(erreur(file.name, "est trop long (5 Mo au plus)."));
    return file.arrayBuffer().then(function (buf) { return finTexte(file.name, decoder(buf)); });
  }

  /* ---------------- Word, Excel, PowerPoint : des archives ZIP de XML ---------------- */
  function zip(buf) {
    var dv = new DataView(buf), n = buf.byteLength, fin = -1, i;
    for (i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("zip");
    var total = dv.getUint16(fin + 10, true), p = dv.getUint32(fin + 16, true), dec = new TextDecoder(), entrees = {};
    for (i = 0; i < total; i++) {
      if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip");
      var lNom = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lCom = dv.getUint16(p + 32, true);
      entrees[dec.decode(new Uint8Array(buf, p + 46, lNom))] = { methode: dv.getUint16(p + 10, true), taille: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true) };
      p += 46 + lNom + lExtra + lCom;
    }
    return entrees;
  }
  function lireZip(buf, z, nom) {
    var e = z[nom];
    if (!e) return Promise.resolve("");
    var dv = new DataView(buf);
    if (dv.getUint32(e.local, true) !== 0x04034b50) return Promise.reject(new Error("zip"));
    var debut = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    var octets = new Uint8Array(buf, debut, e.taille);
    if (e.methode === 0) return Promise.resolve(new TextDecoder().decode(octets));
    if (e.methode !== 8) return Promise.reject(new Error("zip"));
    return new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }
  function entites(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, c) {
      if (c.charAt(0) === "#") {
        var n = c.charAt(1).toLowerCase() === "x" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
        try { return String.fromCodePoint(n); } catch (e) { return ""; }
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[c.toLowerCase()];
    });
  }
  function attr(balise, nom) { var m = new RegExp("\\s" + nom + '="([^"]*)"').exec(balise); return m ? entites(m[1]) : ""; }
  function textes(xml, balise) {
    var re = new RegExp("<" + balise + "(?:\\s[^>]*)?>[\\s\\S]*?</" + balise + ">", "g");
    return (xml.match(re) || []).map(function (t) { return t.replace(/<[^>]+>/g, ""); }).join("");
  }

  function docx(buf, z) {
    return lireZip(buf, z, "word/document.xml").then(function (x) {
      if (!x) throw new Error("docx");
      return x.split(/<\/w:p>/).map(function (p) {
        var t = "";
        p.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>/g, function (m, contenu) {
          t += contenu != null ? contenu : m.indexOf("<w:tab") === 0 ? "\t" : "\n";
          return m;
        });
        return entites(t);
      }).join("\n");
    });
  }
  function numero(n) { return Number((/(\d+)\.xml$/.exec(n) || [])[1] || 0); }
  function pptx(buf, z) {
    var diapos = Object.keys(z).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
      .sort(function (a, b) { return numero(a) - numero(b); });
    if (!diapos.length) return Promise.reject(new Error("pptx"));
    return Promise.all(diapos.map(function (n) { return lireZip(buf, z, n); })).then(function (xs) {
      return xs.map(function (x, i) {
        var lignes = x.split(/<\/a:p>/).map(function (p) { return entites(textes(p, "a:t")); }).filter(function (l) { return l.trim(); });
        return "Diapositive " + (i + 1) + " :\n" + lignes.join("\n");
      }).join("\n\n");
    });
  }
  function colonne(ref) {
    var l = (/^[A-Z]+/.exec(ref) || [""])[0], n = 0;
    for (var i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64);
    return n - 1;
  }
  function lignesFeuille(x, partages) {
    var out = [];
    (x.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || []).slice(0, 3000).forEach(function (row) {
      var cases = [];
      (row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach(function (c) {
        var tete = (/^<c\b[^>]*>/.exec(c) || [""])[0];
        var t = attr(tete, "t"), ref = attr(tete, "r"), v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
        var val = t === "s" ? partages[Number(v)] || "" : t === "inlineStr" ? entites(textes(c, "t"))
          : t === "b" ? (v === "1" ? "VRAI" : "FAUX") : v != null ? entites(v) : "";
        var col = ref ? colonne(ref) : cases.length;
        if (col >= 0 && col < 200) cases[col] = String(val).replace(/[\t\n]+/g, " ");
      });
      var ligne = Array.from(cases, function (v) { return v || ""; }).join("\t").replace(/\t+$/, "");
      if (ligne.trim()) out.push(ligne);
    });
    return out.join("\n");
  }
  function xlsx(buf, z) {
    return Promise.all(["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"].map(function (n) { return lireZip(buf, z, n); })).then(function (r) {
      var partages = (r[2].match(/<si>[\s\S]*?<\/si>/g) || []).map(function (si) { return entites(textes(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ""), "t")); });
      var cibles = {};
      (r[1].match(/<Relationship\b[^>]*>/g) || []).forEach(function (rel) { cibles[attr(rel, "Id")] = attr(rel, "Target").replace(/^\/?(xl\/)?/, "xl/"); });
      var feuilles = (r[0].match(/<sheet\b[^>]*>/g) || []).map(function (s) { return { nom: attr(s, "name"), cible: cibles[attr(s, "r:id")] }; })
        .filter(function (f) { return f.cible && z[f.cible]; });
      if (!feuilles.length) throw new Error("xlsx");
      return Promise.all(feuilles.map(function (f) { return lireZip(buf, z, f.cible); })).then(function (xs) {
        return xs.map(function (x, i) { return "Feuille « " + feuilles[i].nom + " » :\n" + lignesFeuille(x, partages); }).join("\n\n");
      });
    });
  }
  function office(file, sorte) {
    if (file.size > 30 * MO) return Promise.reject(erreur(file.name, "est trop lourd (30 Mo au plus)."));
    if (typeof DecompressionStream === "undefined") return Promise.reject(erreur(file.name, ": ce navigateur ne sait pas le lire. Enregistrez-le en PDF puis joignez-le."));
    return file.arrayBuffer().then(function (buf) {
      var z = zip(buf);
      return sorte === "docx" ? docx(buf, z) : sorte === "pptx" ? pptx(buf, z) : xlsx(buf, z);
    }).then(function (t) { return finTexte(file.name, t); }, function () {
      throw erreur(file.name, "est illisible. Enregistrez-le en PDF puis joignez-le.");
    });
  }

  /** Prépare un fichier pour l'envoi : { nom, type, data | texte, apercu?, taille }. */
  function preparer(file) {
    var e = ext(file.name), t = String(file.type || "").toLowerCase();
    if (t.indexOf("image/") === 0 || /^(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/.test(e)) return image(file);
    if (t === "application/pdf" || e === "pdf") return pdf(file);
    if (e === "docx" || e === "xlsx" || e === "pptx") return office(file, e);
    if (/^(txt|csv|tsv|md|json)$/.test(e) || t.indexOf("text/") === 0) return texteBrut(file);
    if (/^(doc|xls|ppt|odt|ods|odp|rtf|pages|numbers|key)$/.test(e)) return Promise.reject(erreur(file.name, ": enregistrez-le en PDF (ou en .docx, .xlsx, .pptx) puis joignez-le."));
    return Promise.reject(erreur(file.name, ": format non pris en charge. Joignez une image, un PDF, un Word, un Excel, un PowerPoint ou un fichier texte."));
  }

  /* ---------------- Affichage ---------------- */
  /**
   * Ouvre une pièce jointe dans une fenêtre de l'admin (pas de nouvel onglet : les
   * bloqueurs de fenêtres les refusent après un chargement) : l'image, le texte
   * d'un document converti, ou le PDF avec un lien pour l'ouvrir dans un onglet.
   */
  function ouvrir(p) {
    fetch("/api/crm/pieces/" + encodeURIComponent(p.id), { headers: { Authorization: "Bearer " + TOKEN } }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 ? "Cette pièce jointe a expiré : elles sont gardées 90 jours." : "Impossible d’ouvrir cette pièce jointe.");
      return r.blob();
    }).then(function (b) {
      if (p.type === "text/plain") return b.text().then(function (t) {
        var c = h('<div class="pj-vue"><pre></pre></div>');
        $("pre", c).textContent = t;
        return c;
      });
      var url = URL.createObjectURL(b), corps;
      if (p.type === "application/pdf") {
        corps = h('<div class="pj-vue"><iframe></iframe><a class="btn" target="_blank" rel="noopener">' + ic("arrow-square-out") + "Ouvrir dans un onglet</a></div>");
        $("iframe", corps).src = url;
        $("iframe", corps).title = p.nom;
        $("a", corps).href = url;
      } else {
        corps = h('<div class="pj-vue"><img alt=""></div>');
        $("img", corps).src = url;
        $("img", corps).alt = p.nom;
      }
      return corps;
    }).then(function (corps) {
      ADM.modale(p.nom, corps, { large: true });
    }).catch(function (e) {
      ADM.toast(e.message, "ko");
    });
  }

  /** Les pièces jointes d'un message, dans le fil : vignettes et documents cliquables. */
  function liste(pieces) {
    var l = h('<div class="pj-liste"></div>');
    (pieces || []).forEach(function (p) {
      var b;
      if (p.apercu) {
        b = h('<button type="button" class="pj-img"><img alt=""></button>');
        $("img", b).src = p.apercu;
        $("img", b).alt = p.nom;
      } else {
        b = h('<button type="button" class="pj-doc">' + ic(icone(p)) + "<span><b></b><small></small></span></button>");
        $("b", b).textContent = p.nom;
        $("small", b).textContent = libelle(p);
      }
      b.title = "Ouvrir " + p.nom;
      b.addEventListener("click", function () { ouvrir(p); });
      l.appendChild(b);
    });
    return l;
  }

  /** Texte d'aperçu d'un message (liste des discussions) : son texte, ou ses pièces jointes. */
  function resume(m) {
    if (!m) return "";
    if (m.texte) return m.texte;
    var n = (m.pieces || []).length;
    return !n ? "" : n > 1 ? n + " pièces jointes" : "Pièce jointe : " + m.pieces[0].nom;
  }

  /**
   * Ajoute le trombone à une zone de saisie. Les fichiers partent dès qu'ils sont choisis
   * (ou collés, ou déposés) ; l'envoi du message attend qu'ils soient arrivés.
   * o : { ligne, zone, champ, pour (« agent:… » ou « debrief:… »), change }
   */
  function brancher(o) {
    var input = h('<input type="file" multiple hidden>');
    input.accept = ACCEPT;
    var bouton = h('<button type="button" class="joindre" title="Joindre des captures ou des documents" aria-label="Joindre des captures ou des documents">' + ic("paperclip") + "</button>");
    o.ligne.insertBefore(bouton, o.ligne.firstChild);
    o.ligne.appendChild(input);
    var items = [];
    bouton.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { ajouter(input.files); input.value = ""; });
    o.champ.addEventListener("paste", function (e) {
      var f = e.clipboardData && e.clipboardData.files;
      if (f && f.length) { e.preventDefault(); ajouter(f); }
    });

    function retirer(it, effacer) {
      it.retire = true;
      it.el.remove();
      items = items.filter(function (x) { return x !== it; });
      if (effacer && it.piece) api("/api/crm/pieces/" + encodeURIComponent(it.piece.id), { method: "DELETE" }).catch(function () {});
      o.change();
    }
    function ajouter(fichiers) {
      var l = Array.prototype.slice.call(fichiers || []);
      if (!l.length) return;
      var place = MAX_PAR_MESSAGE - items.length;
      if (l.length > place) {
        ADM.toast(MAX_PAR_MESSAGE + " pièces jointes au plus par message", "ko");
        l = l.slice(0, Math.max(0, place));
      }
      l.forEach(function (f) {
        var it = { pret: false };
        it.el = h('<div class="pj-puce envoi"><span class="pj-ic">' + ic("circle-notch") + '</span><span class="pj-t"><b></b><small>Préparation…</small></span>' +
          '<button type="button" class="icobtn retirer" title="Retirer" aria-label="Retirer">' + ic("x") + "</button></div>");
        $("b", it.el).textContent = f.name || "capture";
        $(".retirer", it.el).addEventListener("click", function () { retirer(it, true); });
        o.zone.appendChild(it.el);
        items.push(it);
        it.promesse = preparer(f).then(function (p) {
          if (it.retire) return null;
          $("b", it.el).textContent = p.nom;
          $("small", it.el).textContent = "Envoi…";
          var vignette = $(".pj-ic", it.el);
          vignette.innerHTML = "";
          if (p.apercu) { var img = document.createElement("img"); img.src = p.apercu; img.alt = ""; vignette.appendChild(img); }
          else vignette.innerHTML = ic(icone(p));
          return api("/api/crm/pieces", { method: "POST", body: Object.assign({ pour: o.pour }, p) });
        }).then(function (d) {
          if (!d) return;
          it.piece = d;
          if (it.retire) { api("/api/crm/pieces/" + encodeURIComponent(d.id), { method: "DELETE" }).catch(function () {}); return; }
          it.pret = true;
          it.el.classList.remove("envoi");
          $("small", it.el).textContent = libelle(d);
        }).catch(function (e) {
          retirer(it, false);
          ADM.toast(/413/.test(e.message) ? "« " + (f.name || "Ce fichier") + " » est trop lourd." : e.message, "ko");
        }).then(function () { o.change(); });
      });
      o.change();
    }

    return {
      ajouter: ajouter,
      nombre: function () { return items.length; },
      enCours: function () { return items.some(function (it) { return !it.pret; }); },
      /** Les pièces prêtes, une fois tous les envois terminés. */
      pretes: function () {
        return Promise.all(items.map(function (it) { return it.promesse; })).then(function () {
          return items.filter(function (it) { return it.pret; }).map(function (it) { return it.piece; });
        });
      },
      /** Après l'envoi du message : les pièces lui appartiennent, on vide la zone sans les effacer. */
      vider: function () { items.forEach(function (it) { it.el.remove(); }); items = []; o.change(); },
    };
  }

  ADM.pieces = { MAX_PAR_MESSAGE: MAX_PAR_MESSAGE, preparer: preparer, brancher: brancher, liste: liste, ouvrir: ouvrir, resume: resume, libelle: libelle };
})();
