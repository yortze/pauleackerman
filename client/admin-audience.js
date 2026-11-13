/* =========================================================================
   Espace pro de Paule — Audience du site.
   Graphiques SVG faits main : tracés fins, une seule échelle par graphique,
   couleur fixe par mesure (visites = bleu, demandes = orange), infobulle
   au survol et au clavier, tableau des données toujours accessible.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic, $$ = ADM.$$;
  var NS = "http://www.w3.org/2000/svg";
  var AU = { jours: 30, donnees: null };

  /* ----------------------------------------------------------------------
     Tuile chiffrée avec évolution
  ---------------------------------------------------------------------- */
  ADM.tuileDelta = function (label, val, prec, lien, suffixe, periode) {
    var tag = lien ? "a" : "div";
    var t = h("<" + tag + ' class="tuile"' + (lien ? ' href="#' + lien + '"' : "") + '><div class="lab"></div><b class="val"></b><div class="delta"></div></' + tag + ">");
    $(".lab", t).textContent = label;
    $(".val", t).textContent = ADM.nombre(val) + (suffixe || "");
    var d = $(".delta", t);
    var vs = " vs " + (periode || "30 jours") + " précédents";
    if (prec === null || prec === undefined) d.remove();
    else if (!prec && !val) { d.innerHTML = "<span>Pas encore de données</span>"; }
    else if (!prec) { d.classList.add("up"); d.innerHTML = ic("arrow-up-right") + "nouveau<span>" + esc(vs) + "</span>"; }
    else {
      var p = Math.round(((val - prec) / prec) * 100);
      if (p > 0) d.classList.add("up");
      else if (p < 0) d.classList.add("down");
      d.innerHTML = ic(p > 0 ? "arrow-up-right" : p < 0 ? "arrow-down-right" : "minus") + (p > 0 ? "+" : "") + p + " %<span>" + esc(vs) + "</span>";
    }
    return t;
  };

  /* ----------------------------------------------------------------------
     Infobulle partagée
  ---------------------------------------------------------------------- */
  var tip = null;
  function montrerTip(titre, lignes, x, y) {
    if (!tip) { tip = h('<div class="tip" role="status"></div>'); document.body.appendChild(tip); }
    tip.innerHTML = "";
    var t = h('<div class="t"></div>'); t.textContent = titre; tip.appendChild(t);
    lignes.forEach(function (l) {
      var r = h('<div class="r"><i></i><b></b><span></span></div>');
      if (l.couleur) $("i", r).style.background = l.couleur; else $("i", r).style.visibility = "hidden";
      $("b", r).textContent = l.valeur;
      $("span", r).textContent = l.nom;
      tip.appendChild(r);
    });
    tip.hidden = false;
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14)) + "px";
    tip.style.top = Math.max(8, Math.min(innerHeight - hh - 8, y - hh - 12)) + "px";
  }
  function cacherTip() { if (tip) tip.hidden = true; }
  function couleur(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  /* ----------------------------------------------------------------------
     Petits outils SVG
  ---------------------------------------------------------------------- */
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function pasRond(max, n) {
    var brut = max / n, p = Math.pow(10, Math.floor(Math.log10(brut || 1)));
    var r = brut / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
  }
  function echelle(max) {
    var pas = Math.max(1, pasRond(Math.max(max, 4), 4));
    pas = Math.ceil(pas);
    var haut = Math.max(pas * 4, Math.ceil(max / pas) * pas);
    var ticks = [];
    for (var v = 0; v <= haut; v += pas) ticks.push(v);
    return { haut: haut, ticks: ticks };
  }
  function etiquetteJour(j, court) {
    return new Date(j + "T12:00:00Z").toLocaleDateString("fr-FR", court ? { day: "numeric", month: "short", timeZone: "UTC" } : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  function colonneArrondie(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return "M" + x + "," + (y + hgt) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) +
      "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + hgt) + "Z";
  }

  /* ----------------------------------------------------------------------
     Graphique en ligne : visites par jour (+ infobulle multi-mesures)
  ---------------------------------------------------------------------- */
  function graphiqueLigne(boite, serie) {
    boite.innerHTML = "";
    var W = Math.max(280, boite.clientWidth), H = 240, m = { g: 40, d: 16, h: 14, b: 28 };
    var iw = W - m.g - m.d, ih = H - m.h - m.b;
    var max = Math.max.apply(null, serie.map(function (p) { return p.visites; }).concat([0]));
    var e = echelle(max);
    var n = serie.length;
    var x = function (i) { return m.g + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
    var y = function (v) { return m.h + ih - (v / e.haut) * ih; };
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", tabindex: "0", "aria-label": "Visites par jour. Utilisez les flèches pour parcourir les jours." });
    var g = s("g", { class: "grid" }, svg);
    e.ticks.forEach(function (t) {
      s("line", { x1: m.g, x2: W - m.d, y1: y(t), y2: y(t) }, g);
      var tx = s("text", { x: m.g - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      tx.textContent = t.toLocaleString("fr-FR");
    });
    s("line", { class: "axe", x1: m.g, x2: W - m.d, y1: y(0), y2: y(0) }, svg);
    var nbEtiq = Math.min(n, W < 520 ? 4 : 7);
    for (var k = 0; k < nbEtiq; k++) {
      var i = Math.round((k / (nbEtiq - 1 || 1)) * (n - 1));
      var tl = s("text", { x: x(i), y: H - 8, "text-anchor": k === 0 ? "start" : k === nbEtiq - 1 ? "end" : "middle" }, svg);
      tl.textContent = etiquetteJour(serie[i].jour, true);
    }
    var pts = serie.map(function (p, i) { return x(i) + "," + y(p.visites); });
    s("path", { class: "a1", d: "M" + x(0) + "," + y(0) + "L" + pts.join("L") + "L" + x(n - 1) + "," + y(0) + "Z" }, svg);
    s("path", { class: "lig s1", d: "M" + pts.join("L") }, svg);
    var dern = serie[n - 1];
    s("circle", { class: "pt", cx: x(n - 1), cy: y(dern.visites), r: 4.5, fill: "var(--series-1)" }, svg);
    var croix = s("line", { class: "croix", y1: m.h, y2: m.h + ih, opacity: 0 }, svg);
    var point = s("circle", { class: "pt", r: 5, fill: "var(--series-1)", opacity: 0 }, svg);
    var zone = s("rect", { x: m.g, y: m.h, width: iw, height: ih, fill: "transparent" }, svg);
    var courant = n - 1;
    function montrer(i, cx, cy) {
      courant = i;
      var p = serie[i];
      croix.setAttribute("x1", x(i)); croix.setAttribute("x2", x(i)); croix.setAttribute("opacity", 1);
      point.setAttribute("cx", x(i)); point.setAttribute("cy", y(p.visites)); point.setAttribute("opacity", 1);
      var r = svg.getBoundingClientRect();
      montrerTip(etiquetteJour(p.jour), [
        { couleur: couleur("--series-1"), valeur: p.visites.toLocaleString("fr-FR"), nom: "visites" },
        { valeur: p.conversations, nom: "conversations ouvertes" },
        { valeur: p.demandes, nom: "demandes reçues" },
        { valeur: p.rdv, nom: "appels réservés" },
      ], cx != null ? cx : r.left + (x(i) / W) * r.width, cy != null ? cy : r.top + (y(p.visites) / H) * r.height);
    }
    function cacher() { croix.setAttribute("opacity", 0); point.setAttribute("opacity", 0); cacherTip(); }
    zone.addEventListener("pointermove", function (ev) {
      var r = svg.getBoundingClientRect();
      var px = ((ev.clientX - r.left) / r.width) * W;
      var i = Math.max(0, Math.min(n - 1, Math.round(((px - m.g) / iw) * (n - 1))));
      montrer(i, ev.clientX, ev.clientY);
    });
    zone.addEventListener("pointerleave", cacher);
    svg.addEventListener("focus", function () { montrer(courant); });
    svg.addEventListener("blur", cacher);
    svg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft") { ev.preventDefault(); montrer(Math.max(0, courant - 1)); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); montrer(Math.min(n - 1, courant + 1)); }
    });
    boite.appendChild(svg);
  }

  /* ----------------------------------------------------------------------
     Colonnes : demandes par jour, ou visites par heure
  ---------------------------------------------------------------------- */
  function graphiqueColonnes(boite, valeurs, opts) {
    boite.innerHTML = "";
    var W = Math.max(280, boite.clientWidth), H = opts.hauteur || 200, m = { g: 36, d: 10, h: 18, b: 26 };
    var iw = W - m.g - m.d, ih = H - m.h - m.b;
    var n = valeurs.length;
    var max = Math.max.apply(null, valeurs.map(function (v) { return v.v; }).concat([0]));
    var e = echelle(max);
    var bande = iw / n, larg = Math.max(2, Math.min(24, bande - 2));
    var y = function (v) { return m.h + ih - (v / e.haut) * ih; };
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", "aria-label": opts.titre });
    var g = s("g", { class: "grid" }, svg);
    e.ticks.forEach(function (t) {
      s("line", { x1: m.g, x2: W - m.d, y1: y(t), y2: y(t) }, g);
      var tx = s("text", { x: m.g - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      tx.textContent = t.toLocaleString("fr-FR");
    });
    valeurs.forEach(function (v, i) {
      var cx = m.g + bande * i + (bande - larg) / 2;
      var hgt = (v.v / e.haut) * ih;
      var hit = s("rect", { x: m.g + bande * i, y: m.h, width: bande, height: ih, fill: "transparent", tabindex: "0", "aria-label": v.etiquette + " : " + v.v + " " + opts.unite });
      if (hgt > 0) s("path", { class: "barre " + (v.fort ? "bh" : opts.classe), d: colonneArrondie(cx, y(v.v), larg, hgt, 4) }, svg);
      hit.addEventListener("pointermove", function (ev) {
        montrerTip(v.etiquette, [{ couleur: couleur(v.fort ? "--series-hl" : opts.couleur), valeur: v.v.toLocaleString("fr-FR"), nom: opts.unite }], ev.clientX, ev.clientY);
      });
      hit.addEventListener("pointerleave", cacherTip);
      hit.addEventListener("focus", function () {
        var r = hit.getBoundingClientRect();
        montrerTip(v.etiquette, [{ couleur: couleur(v.fort ? "--series-hl" : opts.couleur), valeur: v.v.toLocaleString("fr-FR"), nom: opts.unite }], r.left + r.width / 2, r.top + 30);
      });
      hit.addEventListener("blur", cacherTip);
      svg.appendChild(hit);
      if (v.axe) {
        var tl = s("text", { x: m.g + bande * i + bande / 2, y: H - 8, "text-anchor": "middle" }, svg);
        tl.textContent = v.axe;
      }
      if (v.fort && hgt > 0) {
        var lab = s("text", { x: cx + larg / 2, y: y(v.v) - 6, "text-anchor": "middle", style: "fill:var(--ink);font-weight:600" }, svg);
        lab.textContent = v.v.toLocaleString("fr-FR");
      }
    });
    s("line", { class: "axe", x1: m.g, x2: W - m.d, y1: y(0), y2: y(0) }, svg);
    boite.appendChild(svg);
  }

  /* ----------------------------------------------------------------------
     Barres classées (sources, appareils, pays)
  ---------------------------------------------------------------------- */
  function barresClassees(liste, total, vide) {
    var box = h('<div class="rang"></div>');
    if (!liste.length || !total) { box.appendChild(h('<p class="faint" style="font-size:13px">' + esc(vide) + "</p>")); return box; }
    var max = liste[0].n || 1;
    liste.forEach(function (x) {
      var part = Math.round((x.n / total) * 100);
      var l = h('<div class="rang-l"><span class="nom"></span><span class="piste"><i></i></span><span class="v"></span></div>');
      $(".nom", l).textContent = x.libelle;
      $(".piste i", l).style.width = Math.max(1, (x.n / max) * 100) + "%";
      $(".v", l).innerHTML = esc(x.n.toLocaleString("fr-FR")) + "<small>" + part + " %</small>";
      l.title = x.libelle + " : " + x.n + " (" + part + " %)";
      box.appendChild(l);
    });
    return box;
  }

  /* ----------------------------------------------------------------------
     Liens de suivi + QR code
  ---------------------------------------------------------------------- */
  var qrCharge = null;
  function chargerQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrCharge) return qrCharge;
    qrCharge = new Promise(function (ok, ko) {
      var sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
      sc.onload = function () { window.qrcode ? ok(window.qrcode) : ko(new Error("QR indisponible")); };
      sc.onerror = function () { qrCharge = null; ko(new Error("Impossible de charger le générateur de QR code")); };
      document.head.appendChild(sc);
    });
    return qrCharge;
  }
  function montrerQr(lien) {
    var corps = h('<div style="text-align:center"><p class="muted" style="font-size:13.5px;margin-top:12px"></p><div class="qr"><span class="spin"></span></div>' +
      '<div class="acts-l" style="justify-content:center"></div></div>');
    $("p", corps).textContent = lien.url;
    ADM.modale("QR code · " + lien.nom, corps);
    chargerQr().then(function (qrcode) {
      var q = qrcode(0, "M");
      q.addData(lien.url);
      q.make();
      $(".qr", corps).innerHTML = q.createSvgTag(6, 8);
      var dl = h('<a class="btn primary" download="qr-' + esc(lien.slug) + '.gif">' + ic("download-simple") + "Télécharger l’image</a>");
      dl.href = q.createDataURL(10, 12);
      $(".acts-l", corps).appendChild(dl);
      var cp = h('<button class="btn">' + ic("copy") + "Copier le lien</button>");
      cp.addEventListener("click", function () { ADM.copier(lien.url); });
      $(".acts-l", corps).appendChild(cp);
    }).catch(function (e) { $(".qr", corps).textContent = e.message; });
  }

  function exporterCsv(d) {
    var lignes = [["jour", "visites", "conversations", "demandes", "appels réservés", "clics WhatsApp"]];
    d.serie.forEach(function (p) { lignes.push([p.jour, p.visites, p.conversations, p.demandes, p.rdv, p.wa]); });
    var csv = "﻿" + lignes.map(function (l) { return l.join(";"); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "audience-" + d.periode.debut + "-au-" + d.periode.fin + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ======================================================================
     LA VUE
  ====================================================================== */
  ADM.vue("audience", {
    titre: "Audience",
    sous: "Qui visite votre site, d’où, quand, et ce que ça rapporte",
    rendu: function (params, panel) {
      panel.innerHTML = "";
      var exclu = (function () { try { return localStorage.getItem("pa_exclure") === "1"; } catch (e) { return false; } })();
      var filtres = h('<div class="toolbar"><div class="segs" style="width:auto">' +
        [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"]].map(function (p) { return '<button data-j="' + p[0] + '"' + (AU.jours === p[0] ? ' class="on"' : "") + ">" + p[1] + "</button>"; }).join("") +
        '</div><span class="sp"></span><label class="check" style="margin:0;font-weight:500;color:var(--ink-2)"><input type="checkbox" data-a="exclu"> Ne pas compter cet appareil</label>' +
        '<button class="btn" data-a="csv">' + ic("file-csv") + "Exporter</button></div>");
      $('[data-a="exclu"]', filtres).checked = exclu;
      $('[data-a="exclu"]', filtres).addEventListener("change", function () {
        try { if (this.checked) localStorage.setItem("pa_exclure", "1"); else localStorage.removeItem("pa_exclure"); } catch (e) {}
        ADM.toast(this.checked ? "Vos visites sur cet appareil ne sont plus comptées" : "Cet appareil est de nouveau compté");
      });
      $('[data-a="csv"]', filtres).addEventListener("click", function () { if (AU.donnees) exporterCsv(AU.donnees); });
      panel.appendChild(filtres);
      var contenu = h("<div></div>");
      panel.appendChild(contenu);
      $$("[data-j]", filtres).forEach(function (b) {
        b.addEventListener("click", function () {
          AU.jours = Number(b.dataset.j);
          $$("[data-j]", filtres).forEach(function (x) { x.classList.toggle("on", x === b); });
          charger();
        });
      });

      var redessiner = null, minuteur;
      window.addEventListener("resize", function surResize() {
        if (!document.body.contains(contenu)) { window.removeEventListener("resize", surResize); return; }
        clearTimeout(minuteur);
        minuteur = setTimeout(function () { if (redessiner) redessiner(); }, 150);
      });

      function charger() {
        contenu.style.transition = "opacity .2s";
        contenu.style.opacity = AU.donnees ? ".55" : "1";
        if (!AU.donnees) contenu.innerHTML = '<div class="empty"><span class="spin"></span></div>';
        api("/api/crm/audience?jours=" + AU.jours).then(function (d) {
          AU.donnees = d;
          contenu.style.opacity = "1";
          dessiner(d);
        }).catch(ADM.erreur(contenu));
      }

      function dessiner(d) {
        contenu.innerHTML = "";
        var t = d.totaux, pr = d.precedent, per = d.periode.jours + " jours";
        var taux = t.visites ? Math.round((t.demandes / t.visites) * 1000) / 10 : 0;
        var tauxPrec = pr.visites ? Math.round((pr.demandes / pr.visites) * 1000) / 10 : 0;

        if (!t.visites && !pr.visites) {
          contenu.appendChild(h('<div class="hint">' + ic("info") + "<div>Les statistiques se remplissent au fil des visites de votre site. Elles sont anonymes : ni cookie, ni adresse IP, seulement des compteurs par jour.</div></div>"));
        }

        var tuiles = h('<div class="tuiles"></div>');
        tuiles.appendChild(ADM.tuileDelta("Visites", t.visites, pr.visites, null, "", per));
        tuiles.appendChild(ADM.tuileDelta("Nouveaux visiteurs", t.nouveaux, pr.nouveaux, null, "", per));
        tuiles.appendChild(ADM.tuileDelta("Conversations ouvertes", t.conversations, pr.conversations, null, "", per));
        tuiles.appendChild(ADM.tuileDelta("Demandes reçues", t.demandes, pr.demandes, "messages", "", per));
        tuiles.appendChild(ADM.tuileDelta("Appels réservés", t.rdv, pr.rdv, "agenda", "", per));
        var tt = ADM.tuileDelta("Visites → demandes", taux, null, null, " %", per);
        var dt = h('<div class="delta"></div>');
        dt.textContent = tauxPrec ? tauxPrec + " % sur les " + per + " précédents" : "taux de conversion";
        tt.appendChild(dt);
        tuiles.appendChild(tt);
        contenu.appendChild(tuiles);

        /* Visites par jour */
        var cVis = h('<section class="sec"><div class="sec-h"><h3>' + ic("chart-line-up") + "Visites par jour</h3>" +
          '<button class="btn ghost sm" data-a="tableau">' + ic("table") + "Voir le tableau</button></div><div class=\"sec-b\"><div class=\"chart\"></div><div data-z=\"tableau\" hidden></div></div></section>");
        contenu.appendChild(cVis);

        var grille1 = h('<div class="grille g2"></div>');
        var cDem = h('<section class="sec"><div class="sec-h"><h3>' + ic("chat-circle-text") + "Demandes reçues par jour</h3></div><div class=\"sec-b\"><div class=\"chart\"></div></div></section>");
        var cEnt = h('<section class="sec"><div class="sec-h"><h3>' + ic("funnel") + "Du visiteur au client</h3><small>sur " + esc(per) + "</small></div><div class=\"sec-b\"></div></section>");
        grille1.appendChild(cDem); grille1.appendChild(cEnt);
        contenu.appendChild(grille1);

        var cH = h('<section class="sec"><div class="sec-h"><h3>' + ic("clock") + "Quand vos visiteurs viennent</h3><small>heure de Libreville</small></div><div class=\"sec-b\"><p data-z=\"conseil\" style=\"font-size:13.5px;margin-bottom:8px\"></p><div class=\"chart\"></div></div></section>");
        contenu.appendChild(cH);

        var grille2 = h('<div class="grille g3"></div>');
        var totalSources = d.sources.reduce(function (a, x) { return a + x.n; }, 0);
        var cS = h('<section class="sec"><div class="sec-h"><h3>' + ic("share-network") + "D’où ils viennent</h3></div><div class=\"sec-b\"></div></section>");
        $(".sec-b", cS).appendChild(barresClassees(d.sources, totalSources, "Pas encore de visite sur la période."));
        var totalApp = d.appareils.reduce(function (a, x) { return a + x.n; }, 0);
        var cA = h('<section class="sec"><div class="sec-h"><h3>' + ic("device-mobile") + "Leurs appareils</h3></div><div class=\"sec-b\"></div></section>");
        $(".sec-b", cA).appendChild(barresClassees(d.appareils, totalApp, "Pas encore de visite sur la période."));
        var noms = null;
        try { noms = new Intl.DisplayNames(["fr"], { type: "region" }); } catch (e) {}
        var pays = d.pays.map(function (x) { return { libelle: noms ? noms.of(x.cle) : x.cle, n: x.n }; });
        var totalPays = pays.reduce(function (a, x) { return a + x.n; }, 0);
        var cP = h('<section class="sec"><div class="sec-h"><h3>' + ic("globe-hemisphere-east") + "Leurs pays</h3></div><div class=\"sec-b\"></div></section>");
        $(".sec-b", cP).appendChild(barresClassees(pays, totalPays, "Le pays s’affiche une fois le site en ligne sur Vercel."));
        grille2.appendChild(cS); grille2.appendChild(cA); grille2.appendChild(cP);
        contenu.appendChild(grille2);

        /* Contenus les plus vus */
        var cC = h('<section class="sec"><div class="sec-h"><h3>' + ic("fire") + "Ce qui les intéresse</h3><small>publications et stories ouvertes</small></div><div class=\"sec-b flush\"></div></section>");
        if (!d.contenus.length) $(".sec-b", cC).appendChild(h('<div class="empty" style="padding:26px">Aucun contenu ouvert sur la période.</div>'));
        else {
          var maxC = d.contenus[0].n || 1;
          var tab = h('<table class="table"><thead><tr><th>Contenu</th><th>Type</th><th class="n">Ouvertures</th></tr></thead><tbody></tbody></table>');
          d.contenus.forEach(function (c) {
            var tr = h('<tr><td><div></div><div class="rang-l" style="grid-template-columns:1fr;margin-top:6px"><span class="piste" style="height:6px"><i></i></span></div></td><td></td><td class="n"></td></tr>');
            var td = $$("td", tr);
            $("div", td[0]).textContent = c.titre;
            $(".piste i", td[0]).style.width = Math.max(1, (c.n / maxC) * 100) + "%";
            td[1].innerHTML = '<span class="pill">' + (c.type === "story" ? "Story" : "Publication") + "</span>";
            td[2].textContent = c.n.toLocaleString("fr-FR");
            $("tbody", tab).appendChild(tr);
          });
          $(".sec-b", cC).appendChild(tab);
        }
        contenu.appendChild(cC);

        /* Liens de suivi */
        var cL = h('<section class="sec"><div class="sec-h"><h3>' + ic("link-simple") + "Liens de suivi</h3><small>sur " + esc(per) + "</small></div>" +
          '<div class="sec-b"><p class="muted" style="font-size:13px;margin-bottom:10px">Créez un lien par endroit où vous partagez votre site (bio Instagram, statut WhatsApp, flyer, carte de visite…) : vous saurez exactement lequel vous amène des visiteurs.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><input data-z="nom" placeholder="ex : Bio Instagram" style="flex:1;min-width:200px"><button class="btn primary" data-a="creer">' + ic("plus") + "Créer le lien</button></div></div>" +
          '<div class="sec-b flush" data-z="liens"></div></section>');
        contenu.appendChild(cL);
        function dessinerLiens() {
          var z = $('[data-z="liens"]', cL);
          z.innerHTML = "";
          if (!d.liens.length) return;
          var tab = h('<table class="table"><thead><tr><th>Lien</th><th class="n">Visites</th><th></th></tr></thead><tbody></tbody></table>');
          d.liens.forEach(function (l) {
            var url = d.siteUrl + "/?src=" + l.slug;
            var tr = h('<tr><td><b></b><div class="faint mono" style="font-size:12px;word-break:break-all"></div></td><td class="n"></td><td style="white-space:nowrap;text-align:right"></td></tr>');
            $("b", tr).textContent = l.nom;
            $(".mono", tr).textContent = url;
            $$("td", tr)[1].textContent = l.n.toLocaleString("fr-FR");
            var actions = $$("td", tr)[2];
            var bc = h('<button class="icobtn" title="Copier le lien" aria-label="Copier le lien">' + ic("copy") + "</button>");
            bc.addEventListener("click", function () { ADM.copier(url); });
            var bq = h('<button class="icobtn" title="QR code" aria-label="QR code">' + ic("qr-code") + "</button>");
            bq.addEventListener("click", function () { montrerQr({ url: url, nom: l.nom, slug: l.slug }); });
            var bs = h('<button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button>");
            bs.addEventListener("click", function () {
              if (!confirm("Supprimer le lien « " + l.nom + " » ? Les visites déjà comptées restent dans les totaux.")) return;
              api("/api/crm/liens/" + encodeURIComponent(l.slug), { method: "DELETE" }).then(function () { d.liens = d.liens.filter(function (x) { return x.slug !== l.slug; }); dessinerLiens(); });
            });
            actions.appendChild(bc); actions.appendChild(bq); actions.appendChild(bs);
            $("tbody", tab).appendChild(tr);
          });
          z.appendChild(tab);
        }
        dessinerLiens();
        $('[data-a="creer"]', cL).addEventListener("click", function () {
          var nom = $('[data-z="nom"]', cL).value.trim();
          if (!nom) return ADM.toast("Donnez un nom au lien", "ko");
          api("/api/crm/liens", { method: "POST", body: { nom: nom } }).then(function (l) {
            d.liens.push({ slug: l.slug, nom: l.nom, n: 0 });
            $('[data-z="nom"]', cL).value = "";
            dessinerLiens();
            ADM.copier(l.url);
          }).catch(function (e) { ADM.toast(e.message, "ko"); });
        });

        /* Tableau des données (accessibilité) */
        $('[data-a="tableau"]', cVis).addEventListener("click", function () {
          var z = $('[data-z="tableau"]', cVis);
          z.hidden = !z.hidden;
          this.innerHTML = ic(z.hidden ? "table" : "chart-line-up") + (z.hidden ? "Voir le tableau" : "Masquer le tableau");
          if (!z.hidden && !z.children.length) {
            var tab = h('<div style="overflow-x:auto;margin-top:12px"><table class="table"><thead><tr><th>Jour</th><th class="n">Visites</th><th class="n">Conversations</th><th class="n">Demandes</th><th class="n">Appels</th><th class="n">WhatsApp</th></tr></thead><tbody></tbody></table></div>');
            d.serie.slice().reverse().forEach(function (p) {
              var tr = h('<tr><td></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>');
              var td = $$("td", tr);
              td[0].textContent = etiquetteJour(p.jour);
              [p.visites, p.conversations, p.demandes, p.rdv, p.wa].forEach(function (v, i) { td[i + 1].textContent = v; });
              $("tbody", tab).appendChild(tr);
            });
            z.appendChild(tab);
          }
        });

        /* Entonnoir */
        var etapes = [["Visites", t.visites], ["Conversations ouvertes", t.conversations], ["Demandes envoyées", t.demandes], ["Appels réservés", t.rdv]];
        var ent = h('<div class="entonnoir"></div>');
        var base = etapes[0][1] || 1;
        etapes.forEach(function (e, i) {
          var conv = i && etapes[i - 1][1] ? Math.round((e[1] / etapes[i - 1][1]) * 100) : null;
          var l = h('<div class="etape"><span></span><span class="piste"><i></i></span><span class="v"></span></div>');
          $("span", l).textContent = e[0];
          $(".piste i", l).style.width = Math.max(e[1] ? 1 : 0, (e[1] / base) * 100) + "%";
          $(".v", l).innerHTML = esc(e[1].toLocaleString("fr-FR")) + (i ? "<small>" + (conv === null ? "—" : conv + " % de l’étape précédente") + "</small>" : "<small>point de départ</small>");
          ent.appendChild(l);
        });
        $(".sec-b", cEnt).appendChild(ent);

        /* Conseil heure */
        var maxH = Math.max.apply(null, d.heures);
        var meilleure = maxH ? d.heures.indexOf(maxH) : -1;
        $('[data-z="conseil"]', cH).innerHTML = meilleure >= 0
          ? ic("lightbulb") + " Vos visiteurs sont les plus nombreux vers <b>" + meilleure + " h</b> : publiez un peu avant pour être vue au bon moment."
          : '<span class="faint">Pas encore assez de visites pour dégager une tendance.</span>';

        redessiner = function () {
          graphiqueLigne($(".chart", cVis), d.serie);
          var n = d.serie.length;
          graphiqueColonnes($(".chart", cDem), d.serie.map(function (p, i) {
            var pas = n <= 7 ? 1 : n <= 31 ? 7 : 15;
            return { v: p.demandes, etiquette: etiquetteJour(p.jour), axe: (n - 1 - i) % pas === 0 ? etiquetteJour(p.jour, true) : "" };
          }), { titre: "Demandes reçues par jour", unite: "demandes", classe: "b2", couleur: "--series-2" });
          graphiqueColonnes($(".chart", cH), d.heures.map(function (v, i) {
            return { v: v, etiquette: i + " h – " + (i + 1) + " h", axe: i % 3 === 0 ? i + " h" : "", fort: i === meilleure && v > 0 };
          }), { titre: "Visites selon l’heure", unite: "visites", classe: "b1", couleur: "--series-1", hauteur: 180 });
        };
        setTimeout(redessiner, 0);
      }

      charger();
    },
  });
})();
