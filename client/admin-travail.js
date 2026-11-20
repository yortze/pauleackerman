/* =========================================================================
   Espace pro de Paule — Calendrier éditorial et rapports mensuels.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic, $$ = ADM.$$;

  var ST_PLAN = [["idee", "Idée"], ["creation", "En création"], ["a_valider", "À valider"], ["valide", "Validée"], ["publie", "Publiée"]];
  var RESEAUX = ["Instagram", "Facebook", "TikTok", "LinkedIn", "WhatsApp", "YouTube", "X", "Autre"];
  var FORMATS = ["Post", "Carrousel", "Reel", "Story", "Vidéo", "Live", "Article", "Autre"];
  var ICONE_RESEAU = { Instagram: "instagram-logo", Facebook: "facebook-logo", TikTok: "tiktok-logo", LinkedIn: "linkedin-logo", WhatsApp: "whatsapp-logo", YouTube: "youtube-logo", X: "x-logo", Autre: "globe-simple" };
  var CLS_PLAN = { idee: "", creation: "bleu", a_valider: "chaud", valide: "ok", publie: "" };
  ADM.ST_PLAN = ST_PLAN;

  function pillPlan(p) {
    var modif = p.statut === "creation" && p.validation && p.validation.decision === "modif";
    return '<span class="pill ' + (modif ? "ko" : CLS_PLAN[p.statut] || "") + '">' + esc(modif ? "Modification demandée" : ADM.libelle(ST_PLAN, p.statut)) + "</span>";
  }

  /** Ligne d'une publication (fiche client, listes). */
  ADM.lignePublication = function (p, recharger) {
    var l = h('<div class="ligne cliquable"><span class="ico-rond">' + ic(ICONE_RESEAU[p.reseau] || "globe-simple") + '</span><div class="grow"><b></b><small></small></div>' + pillPlan(p) + "</div>");
    $(".grow b", l).textContent = p.sujet || p.format + " " + p.reseau;
    $(".grow small", l).textContent = ADM.jourLong(p.date, { year: "numeric" }) + (p.heure ? " · " + p.heure : "") + " · " + p.format + (p.clientNom ? " · " + p.clientNom : "");
    l.addEventListener("click", function () { ADM.editerPublication(p._id, null, recharger); });
    return l;
  };

  /* ======================================================================
     CALENDRIER ÉDITORIAL
  ====================================================================== */
  var CAL = { mois: null, client: "", vue: "mois" };
  function lundiDe(j) { var d = new Date(j + "T12:00:00Z"); return ADM.ajouterJours(j, -((d.getUTCDay() + 6) % 7)); }

  ADM.vue("calendrier", {
    titre: "Calendrier éditorial",
    sous: "Les publications de vos clients, de l’idée à la mise en ligne",
    rendu: function (params, panel) {
      CAL.mois = CAL.mois || ADM.aujourdhui().slice(0, 7);
      var debut = lundiDe(CAL.mois + "-01"), fin = ADM.ajouterJours(debut, 41);
      var url = CAL.vue === "liste" ? "/api/crm/planning?du=" + ADM.ajouterJours(ADM.aujourdhui(), -7) + "&au=" + ADM.ajouterJours(ADM.aujourdhui(), 90)
        : "/api/crm/planning?du=" + debut + "&au=" + fin;
      if (CAL.client) url += "&client=" + encodeURIComponent(CAL.client);
      Promise.all([api(url), ADM.listeClients()]).then(function (r) {
        var posts = r[0], clients = r[1];
        panel.innerHTML = "";
        var bar = h('<div class="toolbar"><div class="segs" style="width:auto"><button data-a="moins" aria-label="Mois précédent">' + ic("caret-left") + '</button><button class="on" data-a="titre"></button><button data-a="plus" aria-label="Mois suivant">' + ic("caret-right") + "</button></div>" +
          '<button class="btn" data-a="auj">Aujourd’hui</button>' +
          '<select data-a="client" style="width:auto;height:36px" aria-label="Client">' + ADM.optionsClients(clients, CAL.client, "Tous les clients") + "</select>" +
          '<span class="sp"></span><button class="btn soft" data-a="lea">' + ADM.avAgent("contenu", "sm") + "Idées avec Léa</button>" +
          '<button class="btn primary" data-a="nouveau">' + ic("plus") + "Nouvelle publication</button>" +
          '<div class="segs" style="width:auto"><button data-v="mois" title="Vue mois">' + ic("calendar-blank") + '</button><button data-v="liste" title="À venir">' + ic("list-bullets") + "</button></div></div>");
        $('[data-a="titre"]', bar).textContent = CAL.vue === "liste" ? "À venir" : ADM.libMois(CAL.mois);
        $$("[data-v]", bar).forEach(function (b) {
          b.classList.toggle("on", b.dataset.v === CAL.vue);
          b.addEventListener("click", function () { CAL.vue = b.dataset.v; ADM.rendre(); });
        });
        function decaler(n) { var d = new Date(CAL.mois + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); CAL.mois = d.toISOString().slice(0, 7); CAL.vue = "mois"; ADM.rendre(); }
        $('[data-a="moins"]', bar).addEventListener("click", function () { decaler(-1); });
        $('[data-a="plus"]', bar).addEventListener("click", function () { decaler(1); });
        $('[data-a="auj"]', bar).addEventListener("click", function () { CAL.mois = ADM.aujourdhui().slice(0, 7); ADM.rendre(); });
        $('[data-a="client"]', bar).addEventListener("change", function () { CAL.client = this.value; ADM.rendre(); });
        $('[data-a="nouveau"]', bar).addEventListener("click", function () { ADM.editerPublication(null, { clientId: CAL.client, date: ADM.aujourdhui() }, ADM.rendre); });
        $('[data-a="lea"]', bar).addEventListener("click", function () {
          var c = clients.find(function (x) { return x._id === CAL.client; });
          ADM.ouvrirEquipe("contenu", { texte: "Propose-moi un planning de publications pour " + (c ? c.nom : "mes clients") + " pour " + ADM.libMois(CAL.mois) + ", avec une légende pour chacune." });
        });
        panel.appendChild(bar);

        var aValider = posts.filter(function (p) { return p.statut === "a_valider"; }).length;
        var modifs = posts.filter(function (p) { return p.statut === "creation" && p.validation && p.validation.decision === "modif"; });
        if (modifs.length) {
          var al = h('<div class="hint alerte">' + ic("pencil-simple-line") + "<div></div></div>");
          $("div", al).textContent = modifs.length + " publication" + (modifs.length > 1 ? "s" : "") + " à reprendre : " + modifs.map(function (p) { return p.clientNom + " (" + (p.sujet || p.format) + ")"; }).join(", ") + ".";
          panel.appendChild(al);
        }
        if (CAL.client && aValider) {
          var c = clients.find(function (x) { return x._id === CAL.client; }) || {};
          var hv = h('<div class="hint">' + ic("check-square-offset") + '<div style="flex:1"></div><button class="btn sm primary">' + ic("share-network") + "Envoyer pour validation</button></div>");
          $("div", hv).textContent = aValider + " publication" + (aValider > 1 ? "s" : "") + " attend" + (aValider > 1 ? "ent" : "") + " la validation de " + c.nom + ".";
          $("button", hv).addEventListener("click", function () { envoyerValidation(c); });
          panel.appendChild(hv);
        }

        if (CAL.vue === "liste") {
          var s = h('<section class="sec"><div class="sec-b flush"></div></section>');
          var auj = ADM.aujourdhui();
          var avenir = posts.filter(function (p) { return p.date >= auj || p.statut !== "publie"; });
          if (!avenir.length) $(".sec-b", s).appendChild(h('<div class="empty">' + ic("calendar-blank") + "Rien de prévu. Ajoutez une publication ou demandez des idées à Léa.</div>"));
          var jourCourant = "";
          avenir.forEach(function (p) {
            if (p.date !== jourCourant) { jourCourant = p.date; var t = h('<div class="cal-jour-t"></div>'); t.textContent = ADM.jourLong(p.date); $(".sec-b", s).appendChild(t); }
            $(".sec-b", s).appendChild(ADM.lignePublication(p, ADM.rendre));
          });
          panel.appendChild(s);
          return;
        }

        var grille = h('<div class="cal"><div class="cal-h">' + ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map(function (j) { return "<div>" + j + "</div>"; }).join("") + '</div><div class="cal-b"></div></div>');
        var corps = $(".cal-b", grille), auj2 = ADM.aujourdhui();
        for (var i = 0; i < 42; i++) {
          (function (j) {
            var dansMois = j.slice(0, 7) === CAL.mois;
            var cell = h('<div class="cal-j' + (dansMois ? "" : " hors") + (j === auj2 ? " auj" : "") + '"><div class="cal-n"><span></span><button class="icobtn" aria-label="Ajouter ce jour-là">' + ic("plus") + "</button></div><div class=\"cal-l\"></div></div>");
            $(".cal-n span", cell).textContent = Number(j.slice(8, 10));
            $(".cal-n button", cell).addEventListener("click", function () { ADM.editerPublication(null, { clientId: CAL.client, date: j }, ADM.rendre); });
            var duJour = posts.filter(function (p) { return p.date === j; });
            duJour.forEach(function (p) {
              var modif = p.statut === "creation" && p.validation && p.validation.decision === "modif";
              var chip = h('<button class="cal-p ' + p.statut + (modif ? " modif" : "") + '">' + ic(ICONE_RESEAU[p.reseau] || "globe-simple") + "<span></span></button>");
              $("span", chip).textContent = (CAL.client ? "" : p.clientNom + " · ") + (p.sujet || p.format);
              chip.title = p.clientNom + " · " + p.reseau + " · " + p.format + " · " + ADM.libelle(ST_PLAN, p.statut) + (p.sujet ? " · " + p.sujet : "");
              chip.addEventListener("click", function () { ADM.editerPublication(p._id, null, ADM.rendre); });
              $(".cal-l", cell).appendChild(chip);
            });
            corps.appendChild(cell);
          })(ADM.ajouterJours(debut, i));
        }
        panel.appendChild(grille);
        var leg = h('<div class="legende" style="margin-top:12px"></div>');
        ST_PLAN.forEach(function (s2) { leg.appendChild(h('<span><i class="cal-pastille ' + s2[0] + '"></i>' + esc(s2[1]) + "</span>")); });
        panel.appendChild(leg);
        if (params[0]) ADM.editerPublication(params[0], null, ADM.rendre);
      }).catch(ADM.erreur(panel));
    },
  });

  function envoyerValidation(c) {
    api("/api/crm/clients/" + c._id + "/liens/validation", { method: "POST", body: {} }).then(function (r) {
      ADM.partager({ titre: "Validation des publications", url: ADM.lienPublic(r.jeton), telephone: c.telephone, email: c.email, sujet: "Vos publications à valider",
        message: "Bonjour" + (c.contact ? " " + c.contact : "") + ", vos prochaines publications sont prêtes. Pouvez-vous les valider ici ?" });
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  }
  ADM.envoyerValidation = envoyerValidation;

  /* --- Éditeur d'une publication (tiroir) --- */
  ADM.editerPublication = function (id, pre, surMaj) {
    Promise.all([id ? api("/api/crm/planning/" + encodeURIComponent(id)) : Promise.resolve(null), ADM.listeClients()]).then(function (r) {
      var p = r[0] || Object.assign({ reseau: "Instagram", format: "Post", statut: "idee", visuels: [], commentaires: [] }, pre || {});
      var clients = r[1];
      var f = h('<div><div class="row2"><div><label>Client</label><select data-k="clientId">' + ADM.optionsClients(clients, p.clientId || "", "Choisir…") + "</select></div>" +
        '<div class="row2" style="gap:0 10px"><div><label>Date</label><input type="date" data-k="date"></div><div><label>Heure</label><input type="time" data-k="heure"></div></div></div>' +
        '<div class="row2"><div><label>Réseau</label><select data-k="reseau">' + RESEAUX.map(function (x) { return "<option>" + x + "</option>"; }).join("") + "</select></div>" +
        '<div><label>Format</label><select data-k="format">' + FORMATS.map(function (x) { return "<option>" + x + "</option>"; }).join("") + "</select></div></div>" +
        '<label>Étape</label><div class="segs pl-etapes">' + ST_PLAN.map(function (s) { return '<button type="button" data-s="' + s[0] + '">' + esc(s[1]) + "</button>"; }).join("") + "</div>" +
        '<label>Sujet</label><input data-k="sujet" placeholder="ex : Nouveau menu du week-end">' +
        '<label>Légende <span class="help" data-z="compte"></span></label><textarea data-k="legende" rows="7"></textarea>' +
        '<div class="acts-l" style="margin-top:6px"><button class="btn sm soft" type="button" data-a="lea">' + ADM.avAgent("contenu", "sm") + "Écrire avec Léa</button><button class=\"btn sm ghost\" type=\"button\" data-a=\"copier\">" + ic("copy") + "Copier la légende</button></div>" +
        '<label>Visuels <span class="help">— photos ou vidéos, visibles par le client sur sa page de validation</span></label><div class="mlist"></div><button type="button" class="btn ghost sm" data-a="visuel" style="margin-top:6px">' + ic("plus") + "Ajouter un visuel</button>" +
        '<label>Notes internes <span class="help">(le client ne les voit pas)</span></label><textarea data-k="notes" rows="2"></textarea>' +
        '<div data-z="fil"></div>' +
        '<div class="formfoot"><button class="btn primary" data-a="sauver">Enregistrer</button><button class="btn" data-a="valider">' + ic("share-network") + "Envoyer en validation</button>" +
        '<span style="flex:1"></span>' + (p._id ? '<button class="btn danger" data-a="suppr">' + ic("trash") + "</button>" : "") + "</div></div>");
      ["date", "heure", "reseau", "format", "sujet", "legende", "notes"].forEach(function (k) { $('[data-k="' + k + '"]', f).value = p[k] || ""; });
      var statut = p.statut || "idee";
      function marquer() { $$("[data-s]", f).forEach(function (b) { b.classList.toggle("on", b.dataset.s === statut); }); }
      $$("[data-s]", f).forEach(function (b) { b.addEventListener("click", function () { statut = b.dataset.s; marquer(); }); });
      marquer();
      var leg = $('[data-k="legende"]', f);
      function compter() { $('[data-z="compte"]', f).textContent = "— " + leg.value.length + " caractères" + (leg.value.length > 2200 ? " (Instagram en accepte 2 200)" : ""); }
      leg.addEventListener("input", compter); compter();
      var ml = $(".mlist", f);
      (p.visuels || []).forEach(function (u) { addMediaRow(ml, u, "image/*,video/*"); });
      $('[data-a="visuel"]', f).addEventListener("click", function () { addMediaRow(ml, "", "image/*,video/*"); });
      $('[data-a="copier"]', f).addEventListener("click", function () { ADM.copier(leg.value); });

      // Fil de commentaires (client et Paule)
      if (p._id && ((p.commentaires || []).length || p.validation)) {
        var fil = h('<section class="sec" style="margin-top:16px"><div class="sec-h"><h3>' + ic("chats-circle") + "Échanges avec le client</h3></div><div class=\"sec-b\"></div></section>");
        var fb = $(".sec-b", fil);
        if (p.validation) {
          var v = h('<p class="muted" style="font-size:12.5px;margin-bottom:8px"></p>');
          v.textContent = (p.validation.decision === "ok" ? "Validée" : "Modification demandée") + (p.validation.nom ? " par " + p.validation.nom : "") + ", " + ADM.dateRel(p.validation.date);
          fb.appendChild(v);
        }
        (p.commentaires || []).forEach(function (x) {
          var b = h('<div class="pl-com ' + (x.auteur === "client" ? "client" : "") + '"><b></b><p></p></div>');
          $("b", b).textContent = (x.auteur === "client" ? (x.nom || "Le client") : "Vous") + " · " + ADM.dateRel(x.date);
          $("p", b).textContent = x.texte;
          fb.appendChild(b);
        });
        var rep = h('<div style="display:flex;gap:8px;margin-top:10px"><input placeholder="Répondre au client (il verra votre réponse sur sa page)"><button class="btn">' + ic("paper-plane-right") + "</button></div>");
        $("button", rep).addEventListener("click", function () {
          var t = $("input", rep).value.trim();
          if (!t) return;
          api("/api/crm/planning/" + p._id + "/commentaires", { method: "POST", body: { texte: t } }).then(function (n) { tiroir.fermer(); ADM.editerPublication(n._id, null, surMaj); });
        });
        fb.appendChild(rep);
        $('[data-z="fil"]', f).appendChild(fil);
      }

      function lire() {
        var body = { statut: statut, visuels: $$(".media-field", ml).map(function (m) { return m.dataset.url; }).filter(Boolean) };
        $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
        return body;
      }
      function sauver(extra) {
        var body = Object.assign(lire(), extra || {});
        if (!body.clientId) return Promise.reject(new Error("Choisissez le client"));
        return api(p._id ? "/api/crm/planning/" + p._id : "/api/crm/planning", { method: p._id ? "PUT" : "POST", body: body }).then(function (n) { p = n; return n; });
      }
      $('[data-a="sauver"]', f).addEventListener("click", function () {
        var fin = ADM.attente(this);
        sauver().then(function () { fin(); ADM.toast("Publication enregistrée"); tiroir.fermer(); }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
      });
      $('[data-a="valider"]', f).addEventListener("click", function () {
        var fin = ADM.attente(this);
        sauver({ statut: "a_valider" }).then(function (n) {
          fin(); tiroir.fermer();
          var c = clients.find(function (x) { return x._id === n.clientId; });
          if (c) envoyerValidation(c);
        }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
      });
      $('[data-a="lea"]', f).addEventListener("click", function () {
        var c = clients.find(function (x) { return x._id === $('[data-k="clientId"]', f).value; });
        var b = lire();
        ADM.ouvrirEquipe("contenu", { texte: "Écris-moi 3 légendes pour un " + b.format.toLowerCase() + " " + b.reseau + (c ? " de " + c.nom : "") +
          (b.sujet ? " sur « " + b.sujet + " »" : "") + (b.legende ? ". Ma première idée : " + b.legende : "") + "." });
      });
      if (p._id) $('[data-a="suppr"]', f).addEventListener("click", function () {
        if (!confirm("Supprimer cette publication du calendrier ?")) return;
        api("/api/crm/planning/" + p._id, { method: "DELETE" }).then(function () { ADM.toast("Publication supprimée"); tiroir.fermer(); });
      });
      var tiroir = ADM.tiroir(p._id ? (p.sujet || "Publication") : "Nouvelle publication", f, { surFermer: function () {
        if (location.hash.indexOf("#calendrier/") === 0) history.replaceState(null, "", "#calendrier");
        if (surMaj) surMaj();
      } });
      tiroir.el.classList.add("large");
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  };

  /* ======================================================================
     RAPPORT MENSUEL
  ====================================================================== */
  ADM.vue("rapport", {
    titre: "Rapport mensuel",
    sous: "Le bilan du mois pour votre client",
    rendu: function (params, panel) {
      if (!params[0]) { ADM.aller("clients"); return; }
      api("/api/crm/rapports/" + params[0]).then(function (r) { dessinerRapport(r, panel); }).catch(ADM.erreur(panel));
    },
  });

  function dessinerRapport(r, panel) {
    ADM.titre(r.titre || "Rapport", r.clientNom + " · " + ADM.libMois(r.mois));
    panel.innerHTML = "";
    var tete = h('<div class="toolbar"><a class="btn ghost sm" href="#clients/' + esc(r.clientId) + '/rapports">' + ic("arrow-left") + "<span></span></a><span class=\"sp\"></span>" +
      '<button class="btn" data-a="partager">' + ic("share-network") + "Envoyer au client</button>" +
      (r.lien ? '<a class="btn" target="_blank" rel="noopener" data-a="voir">' + ic("file-pdf") + "Voir · PDF</a>" : "") +
      '<button class="icobtn danger" data-a="suppr" title="Supprimer le rapport" aria-label="Supprimer le rapport">' + ic("trash") + "</button></div>");
    $("a span", tete).textContent = r.clientNom;
    if (r.lien) $('[data-a="voir"]', tete).href = ADM.lienPublic(r.lien);
    panel.appendChild(tete);

    // 1. Captures et rédaction par Léa
    var capt = h('<section class="sec"><div class="sec-h"><h3>' + ic("images") + "Captures de statistiques</h3><small></small></div><div class=\"sec-b\">" +
      '<div class="pj-zone rp-pieces"></div><div class="acts-l"><button class="btn" data-a="ajouter">' + ic("paperclip") + 'Ajouter des captures</button><input type="file" hidden multiple accept="image/*,.pdf"></div>' +
      '<label>Consignes pour Léa <span class="help">(facultatif)</span></label><input data-z="consignes" placeholder="ex : insister sur la vidéo du 12, le client veut plus de messages WhatsApp">' +
      '<div class="formfoot" style="margin-top:12px"><button class="btn primary" data-a="rediger">' + ADM.avAgent("contenu", "sm") + "Rédiger le bilan avec Léa</button></div></div></section>");
    $(".sec-h small", capt).textContent = (r.publications.publiees || 0) + " publication(s) publiée(s) sur " + (r.publications.prevues || 0) + " prévue(s) ce mois-là";
    var pieces = (r.pieces || []).slice();
    var zp = $(".rp-pieces", capt);
    function dessinerPieces() {
      zp.innerHTML = "";
      pieces.forEach(function (p, i) {
        var puce = h('<div class="pj-puce"><span class="pj-ic"></span><span class="pj-t"><b></b><small></small></span><button type="button" class="icobtn retirer" aria-label="Retirer">' + ic("x") + "</button></div>");
        if (p.apercu) { var im = document.createElement("img"); im.src = p.apercu; im.alt = ""; $(".pj-ic", puce).appendChild(im); } else $(".pj-ic", puce).innerHTML = ic("file-pdf");
        $("b", puce).textContent = p.nom;
        $("small", puce).textContent = ADM.pieces.libelle(p);
        $("b", puce).style.cursor = "pointer";
        $("b", puce).addEventListener("click", function () { ADM.pieces.ouvrir(p); });
        $("button", puce).addEventListener("click", function () {
          pieces.splice(i, 1);
          api("/api/crm/rapports/" + r._id, { method: "PUT", body: { pieces: pieces.map(function (x) { return x.id; }) } }).then(function () {
            api("/api/crm/pieces/" + encodeURIComponent(p.id), { method: "DELETE" }).catch(function () {});
            dessinerPieces();
          });
        });
        zp.appendChild(puce);
      });
    }
    dessinerPieces();
    var input = $("input[type=file]", capt);
    $('[data-a="ajouter"]', capt).addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var fichiers = Array.prototype.slice.call(input.files || []).slice(0, 8);
      input.value = "";
      if (!fichiers.length) return;
      var btn = $('[data-a="ajouter"]', capt), fin = ADM.attente(btn, "Envoi…");
      fichiers.reduce(function (ch, file) {
        return ch.then(function () {
          return ADM.pieces.preparer(file).then(function (p) {
            return api("/api/crm/pieces", { method: "POST", body: Object.assign({ pour: "rapport:" + r._id }, p) });
          }).then(function (d) { pieces.push(d); }).catch(function (e) { ADM.toast(e.message, "ko"); });
        });
      }, Promise.resolve()).then(function () {
        return api("/api/crm/rapports/" + r._id, { method: "PUT", body: { pieces: pieces.map(function (x) { return x.id; }) } });
      }).then(function () { fin(); dessinerPieces(); }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
    $('[data-a="rediger"]', capt).addEventListener("click", function () {
      var fin = ADM.attente(this, "Léa lit les captures… (environ 30 s)");
      api("/api/crm/rapports/" + r._id + "/rediger", { method: "POST", body: { pieces: pieces.map(function (x) { return x.id; }), consignes: $('[data-z="consignes"]', capt).value } })
        .then(function (n) { fin(); ADM.toast("Bilan rédigé : relisez-le avant de l’envoyer"); dessinerRapport(n, panel); })
        .catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
    panel.appendChild(capt);

    // 2. Le rapport, modifiable
    var ed = h('<section class="sec"><div class="sec-h"><h3>' + ic("chart-bar") + "Le rapport</h3><small></small></div><div class=\"sec-b\">" +
      '<label style="margin-top:0">Titre</label><input data-k="titre">' +
      '<label>Chiffres clés</label><div class="rp-chiffres"></div><button type="button" class="btn ghost sm" data-a="chiffre">' + ic("plus") + "Ajouter un chiffre</button>" +
      '<div class="grille g3" style="gap:0 14px"><div><label>Points forts <span class="help">— un par ligne</span></label><textarea data-l="pointsForts" rows="5"></textarea></div>' +
      '<div><label>À améliorer</label><textarea data-l="aAmeliorer" rows="5"></textarea></div><div><label>Recommandations</label><textarea data-l="recommandations" rows="5"></textarea></div></div>' +
      '<label>Bilan du mois</label><textarea data-k="bilan" rows="8"></textarea>' +
      '<div class="formfoot"><button class="btn primary" data-a="sauver">Enregistrer</button><span class="savemsg"></span></div></div></section>');
    $(".sec-h small", ed).textContent = r.redigeLe ? "Rédigé par Léa " + ADM.dateRel(r.redigeLe) + " : relisez avant d’envoyer" : "";
    $('[data-k="titre"]', ed).value = r.titre || "";
    $('[data-k="bilan"]', ed).value = r.bilan || "";
    ["pointsForts", "aAmeliorer", "recommandations"].forEach(function (k) { $('[data-l="' + k + '"]', ed).value = (r[k] || []).join("\n"); });
    var zc = $(".rp-chiffres", ed);
    function ligneChiffre(c) {
      var row = h('<div class="rp-c"><input data-c="libelle" placeholder="ex : Abonnés Instagram"><input data-c="valeur" placeholder="ex : 2 450"><input data-c="evolution" placeholder="ex : +12 %"><button type="button" class="icobtn danger" aria-label="Retirer">' + ic("x") + "</button></div>");
      ["libelle", "valeur", "evolution"].forEach(function (k) { $('[data-c="' + k + '"]', row).value = c[k] || ""; });
      $("button", row).addEventListener("click", function () { row.remove(); });
      zc.appendChild(row);
    }
    (r.chiffres && r.chiffres.length ? r.chiffres : [{}, {}, {}]).forEach(ligneChiffre);
    $('[data-a="chiffre"]', ed).addEventListener("click", function () { ligneChiffre({}); });
    function lire() {
      var b = { titre: $('[data-k="titre"]', ed).value, bilan: $('[data-k="bilan"]', ed).value };
      ["pointsForts", "aAmeliorer", "recommandations"].forEach(function (k) { b[k] = $('[data-l="' + k + '"]', ed).value.split("\n").map(function (s) { return s.replace(/^[-•*]\s*/, "").trim(); }).filter(Boolean); });
      b.chiffres = $$(".rp-c", ed).map(function (row) { return { libelle: $('[data-c="libelle"]', row).value, valeur: $('[data-c="valeur"]', row).value, evolution: $('[data-c="evolution"]', row).value }; });
      return b;
    }
    $('[data-a="sauver"]', ed).addEventListener("click", function () {
      var fin = ADM.attente(this);
      api("/api/crm/rapports/" + r._id, { method: "PUT", body: lire() }).then(function (n) { fin(); r = n; ADM.toast("Rapport enregistré"); })
        .catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
    panel.appendChild(ed);

    $('[data-a="partager"]', tete).addEventListener("click", function () {
      api("/api/crm/rapports/" + r._id, { method: "PUT", body: lire() }).then(function () {
        return Promise.all([api("/api/crm/rapports/" + r._id + "/partager", { method: "POST", body: {} }), ADM.listeClients()]);
      }).then(function (x) {
        var c = x[1].find(function (y) { return y._id === r.clientId; }) || {};
        ADM.partager({ titre: "Envoyer le rapport", url: ADM.lienPublic(x[0].jeton), telephone: c.telephone, email: c.email, sujet: r.titre,
          message: "Bonjour" + (c.contact ? " " + c.contact : "") + ", voici le bilan de " + ADM.libMois(r.mois) + " pour vos réseaux :" });
        if (!r.lien) { r.lien = x[0].jeton; }
      }).catch(function (e) { ADM.toast(e.message, "ko"); });
    });
    $('[data-a="suppr"]', tete).addEventListener("click", function () {
      if (!confirm("Supprimer ce rapport et ses captures ?")) return;
      api("/api/crm/rapports/" + r._id, { method: "DELETE" }).then(function () { ADM.toast("Rapport supprimé"); ADM.aller("clients/" + r.clientId + "/rapports"); });
    });
  }
})();
