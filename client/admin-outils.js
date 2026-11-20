/* =========================================================================
   Espace pro de Paule — outils pour parler à l'équipe et à ses clients :
   mémoire de l'équipe, raccourcis, dictée vocale, leçons des affaires,
   modèles de messages.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic, $$ = ADM.$$;
  var CATEGORIES = [["preference", "Préférence"], ["regle", "Règle"], ["client", "Client"], ["lecon", "Leçon"], ["fait", "À savoir"]];
  var AGENTS = [["tous", "Toute l’équipe"], ["diagnostic", "Nadia"], ["prospection", "Yann"], ["contenu", "Léa"], ["agenda", "Awa"]];
  var MAX_MEMOIRE = 6000;

  /* ======================================================================
     Mémoire de l'équipe
  ====================================================================== */
  ADM.panneauMemoire = function (zone, surMaj) {
    zone.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    api("/api/crm/memoire").then(function (r) {
      var notes = r.notes;
      zone.innerHTML = "";
      zone.appendChild(h('<div class="hint">' + ic("brain") + "<div>Ce que vos assistantes retiennent de vous : chacune relit ces notes à chaque échange. " +
        "Elles proposent ce qu’elles ont appris, vous gardez ce qui est juste. Vos corrections (pouce baissé sous une réponse) arrivent ici directement.</div></div>"));

      var f = h('<form class="note-ajout"><textarea data-k="texte" rows="2" maxlength="400" placeholder="Apprenez quelque chose à l’équipe… ex : « Je ne descends jamais sous 100 000 FCFA par mois »"></textarea>' +
        '<div class="note-ajout-l"><select data-k="categorie" style="width:auto">' + ADM.options(CATEGORIES, "preference") + '</select><input data-k="client" placeholder="Client concerné (facultatif)">' +
        '<button class="btn primary" type="submit">' + ic("plus") + "Retenir</button></div></form>");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var body = {};
        $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
        api("/api/crm/memoire", { method: "POST", body: body }).then(function () { ADM.toast("Retenu"); ADM.panneauMemoire(zone, surMaj); })
          .catch(function (er) { ADM.toast(er.message, "ko"); });
      });
      zone.appendChild(f);

      var proposees = notes.filter(function (n) { return n.statut === "proposee"; });
      var actives = notes.filter(function (n) { return n.statut === "active"; });
      var utilise = actives.reduce(function (s, n) { return s + n.texte.length + 20; }, 0);
      if (proposees.length) {
        zone.appendChild(h('<div class="notes-t">' + ic("hourglass") + " À valider</div>"));
        proposees.forEach(function (n) { zone.appendChild(ligne(n)); });
      }
      var t = h('<div class="notes-t"></div>');
      t.textContent = "Retenu (" + actives.length + ")";
      zone.appendChild(t);
      if (utilise > MAX_MEMOIRE * 0.8) {
        var al = h('<div class="hint alerte">' + ic("warning-circle") + "<div></div></div>");
        $("div", al).textContent = "La mémoire est presque pleine (" + Math.round((utilise / MAX_MEMOIRE) * 100) + " %). Au-delà, les notes les plus anciennes ne sont plus relues : épinglez l’essentiel, supprimez ce qui ne sert plus.";
        zone.appendChild(al);
      }
      if (!actives.length) zone.appendChild(h('<p class="muted notes-vide">Rien pour le moment. Dites à une assistante « retiens que… », corrigez une réponse avec le pouce baissé, ou écrivez une note ci-dessus.</p>'));
      actives.forEach(function (n) { zone.appendChild(ligne(n)); });

      function ligne(n) {
        var auteur = n.auteur === "Paule" ? "Vous" : (ADM.EQUIPE[n.auteur] || {}).prenom || "L’équipe";
        var l = h('<div class="note mem' + (n.statut === "proposee" ? " prop" : "") + '"><span class="ico-rond" style="width:30px;height:30px">' + ic(n.epingle ? "push-pin" : "brain") +
          '</span><div class="grow"><div class="t"></div><div class="m"></div></div><div class="acts"></div></div>');
        $(".t", l).textContent = n.texte;
        var m = $(".m", l);
        m.appendChild(h('<span class="pill">' + esc(ADM.libelle(CATEGORIES, n.categorie)) + "</span>"));
        if (n.client) m.appendChild(h('<span class="pill">' + ic("user") + esc(n.client) + "</span>"));
        m.appendChild(h('<span class="pill contour">' + (n.statut === "proposee" ? "proposé par " : "par ") + esc(auteur) + " · " + esc(ADM.dateRel(n.createdAt)) + "</span>"));
        var acts = $(".acts", l);
        function bouton(icone, titre, cls, fn) { var b = h('<button class="icobtn ' + (cls || "") + '" title="' + esc(titre) + '" aria-label="' + esc(titre) + '">' + ic(icone) + "</button>"); b.addEventListener("click", fn); acts.appendChild(b); }
        function maj(patch, msg) {
          api("/api/crm/memoire/" + n._id, { method: "PUT", body: patch }).then(function () { if (msg) ADM.toast(msg); ADM.panneauMemoire(zone, surMaj); if (surMaj) surMaj(); ADM.rafraichirCompteurs(); })
            .catch(function (e) { ADM.toast(e.message, "ko"); });
        }
        if (n.statut === "proposee") {
          var ok = h('<button class="btn sm primary">' + ic("check") + "Retenir</button>");
          ok.addEventListener("click", function () { maj({ statut: "active" }, "Retenu : toute l’équipe s’en souviendra"); });
          acts.appendChild(ok);
        } else bouton("push-pin", n.epingle ? "Désépingler" : "Épingler (toujours relu en premier)", n.epingle ? "on" : "", function () { maj({ epingle: !n.epingle }); });
        bouton("pencil-simple", "Modifier", "", function () {
          var nv = prompt("Modifier la note :", n.texte);
          if (nv && nv.trim() && nv.trim() !== n.texte) maj({ texte: nv.trim() }, "Note modifiée");
        });
        bouton("trash", n.statut === "proposee" ? "Écarter" : "Oublier", "danger", function () {
          if (n.statut === "active" && !confirm("Oublier cette note ? L’équipe ne s’en servira plus.")) return;
          api("/api/crm/memoire/" + n._id + (n.statut === "proposee" ? "?si=proposee" : ""), { method: "DELETE" })
            .catch(function (e) { ADM.toast(e.message, "ko"); })
            .then(function () { ADM.panneauMemoire(zone, surMaj); if (surMaj) surMaj(); ADM.rafraichirCompteurs(); });
        });
        return l;
      }
    }).catch(ADM.erreur(zone));
  };

  /** Awa tire la leçon d'une affaire gagnée ou perdue : propositions à valider dans la mémoire. */
  ADM.tirerLecon = function (type, id, btn) {
    var fin = btn ? ADM.attente(btn, "Awa réfléchit…") : function () {};
    api("/api/crm/memoire/bilan", { method: "POST", body: { type: type, id: id } }).then(function (r) {
      fin();
      var n = (r.propositions || []).length;
      ADM.toast(n ? "Awa propose " + n + " leçon" + (n > 1 ? "s" : "") + " : validez-les dans la mémoire de l’équipe" : "Pas de nouvelle leçon à retenir");
      ADM.rafraichirCompteurs();
    }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
  };

  /* ======================================================================
     Raccourcis : demandes toutes prêtes
  ====================================================================== */
  var cacheRacc = null;
  function raccourcis(frais) {
    if (!cacheRacc || frais) cacheRacc = api("/api/crm/raccourcis").catch(function (e) { cacheRacc = null; throw e; });
    return cacheRacc;
  }
  ADM.menuRaccourcis = function (ancre, agent, inserer) {
    raccourcis().then(function (l) {
      var choix = l.filter(function (r) { return agent === "tous" || r.agent === "tous" || r.agent === agent; });
      var items = choix.map(function (r) { return { icone: "lightning", label: r.titre, action: function () { inserer(r.texte); } }; });
      items.push({ icone: "gear-six", label: "Gérer les raccourcis", action: function () { ADM.aller("equipe/raccourcis"); } });
      ADM.menu(ancre, items);
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  };
  ADM.panneauRaccourcis = function (zone) {
    zone.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    raccourcis(true).then(function (l) {
      zone.innerHTML = "";
      zone.appendChild(h('<div class="hint">' + ic("lightning") + "<div>Vos demandes toutes prêtes : le bouton éclair de la zone de saisie les insère d’un clic. Les mots entre crochets [ ] sont à remplacer.</div></div>"));
      var f = h('<form class="note-ajout"><div class="note-ajout-l"><input data-k="titre" placeholder="Nom du raccourci (ex : Devis express)" maxlength="80"><select data-k="agent" style="width:auto">' + ADM.options(AGENTS, "tous") + "</select></div>" +
        '<textarea data-k="texte" rows="2" placeholder="La demande, avec des [crochets] pour ce qui change"></textarea><div><button class="btn primary" type="submit">' + ic("plus") + "Ajouter</button></div></form>");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var body = {};
        $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
        api("/api/crm/raccourcis", { method: "POST", body: body }).then(function () { ADM.toast("Raccourci ajouté"); ADM.panneauRaccourcis(zone); }).catch(function (er) { ADM.toast(er.message, "ko"); });
      });
      zone.appendChild(f);
      l.forEach(function (r) {
        var x = h('<div class="note"><span class="ico-rond" style="width:30px;height:30px">' + ic("lightning") + '</span><div class="grow"><div class="t"></div><div class="m"></div></div>' +
          '<button class="icobtn" title="Modifier" aria-label="Modifier">' + ic("pencil-simple") + '</button><button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button></div>");
        $(".t", x).textContent = r.titre;
        var m = $(".m", x);
        m.appendChild(h('<span class="pill">' + esc(ADM.libelle(AGENTS, r.agent || "tous")) + "</span>"));
        var sp = h('<span class="muted" style="font-size:12.5px"></span>'); sp.textContent = r.texte; m.appendChild(sp);
        var b = $$("button", x);
        b[0].addEventListener("click", function () {
          var nv = prompt("Texte du raccourci « " + r.titre + " » :", r.texte);
          if (nv && nv.trim()) api("/api/crm/raccourcis/" + r._id, { method: "PUT", body: { texte: nv.trim() } }).then(function () { ADM.panneauRaccourcis(zone); });
        });
        b[1].addEventListener("click", function () {
          if (!confirm("Supprimer le raccourci « " + r.titre + " » ?")) return;
          api("/api/crm/raccourcis/" + r._id, { method: "DELETE" }).then(function () { ADM.panneauRaccourcis(zone); });
        });
        zone.appendChild(x);
      });
    }).catch(ADM.erreur(zone));
  };

  /* ======================================================================
     Dictée vocale (micro dans la zone de saisie)
  ====================================================================== */
  ADM.dictee = function (zone, ajuster) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var b = h('<button type="button" class="joindre micro" title="Dicter : parlez, le texte s’écrit" aria-label="Dicter">' + ic("microphone") + "</button>");
    var rec = null;
    b.addEventListener("click", function () {
      if (rec) { rec.stop(); return; }
      var base = zone.value.trim() ? zone.value.replace(/\s*$/, " ") : "";
      try { rec = new SR(); } catch (e) { ADM.toast("La dictée n’est pas disponible dans ce navigateur", "ko"); return; }
      rec.lang = "fr-FR";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = function (e) {
        var t = "";
        for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        zone.value = base + t.replace(/^\s+/, "");
        ajuster();
      };
      rec.onerror = function (e) {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") ADM.toast("Autorisez le micro pour dicter", "ko");
        else if (e.error !== "no-speech" && e.error !== "aborted") ADM.toast("Dictée interrompue", "ko");
      };
      rec.onend = function () { rec = null; b.classList.remove("on"); b.title = "Dicter : parlez, le texte s’écrit"; };
      try { rec.start(); b.classList.add("on"); b.title = "Arrêter la dictée"; } catch (e) { rec = null; }
    });
    return b;
  };

  /* ======================================================================
     Modèles de messages pour les clients
  ====================================================================== */
  var AIDE_VARIABLES = "Variables remplies toutes seules : {contact}, {client}, {formule}, {montant}, {renouvellement}, {paule}, et les liens {lien_validation}, {lien_brief}, {lien_avis}. Les [crochets] sont à compléter à la main.";
  ADM.gererModeles = function () {
    api("/api/crm/modeles").then(function (l) {
      var corps = h('<div><p class="muted" style="font-size:13px;margin:12px 0"></p><form class="note-ajout"><input data-k="titre" placeholder="Nom du modèle" maxlength="80"><textarea data-k="texte" rows="3" placeholder="Bonjour {contact}, …"></textarea><div><button class="btn primary" type="submit">' + ic("plus") + "Ajouter</button></div></form><div data-z=\"l\"></div></div>");
      $("p", corps).textContent = AIDE_VARIABLES;
      var t = ADM.tiroir("Modèles de messages", corps);
      function rech() { t.fermer(); ADM.gererModeles(); }
      $("form", corps).addEventListener("submit", function (e) {
        e.preventDefault();
        var body = {};
        $$("[data-k]", corps).forEach(function (i) { body[i.dataset.k] = i.value; });
        api("/api/crm/modeles", { method: "POST", body: body }).then(function () { ADM.toast("Modèle ajouté"); rech(); }).catch(function (er) { ADM.toast(er.message, "ko"); });
      });
      l.forEach(function (m) {
        var x = h('<div class="note"><div class="grow"><div class="t"></div><p class="muted" style="font-size:12.5px;white-space:pre-wrap;margin-top:4px"></p></div>' +
          '<button class="icobtn" title="Modifier" aria-label="Modifier">' + ic("pencil-simple") + '</button><button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button></div>");
        $(".t", x).textContent = m.titre; $("p", x).textContent = m.texte;
        var b = $$("button", x);
        b[0].addEventListener("click", function () {
          var nv = prompt("Texte du modèle « " + m.titre + " » :", m.texte);
          if (nv && nv.trim()) api("/api/crm/modeles/" + m._id, { method: "PUT", body: { texte: nv.trim() } }).then(rech);
        });
        b[1].addEventListener("click", function () { if (confirm("Supprimer le modèle « " + m.titre + " » ?")) api("/api/crm/modeles/" + m._id, { method: "DELETE" }).then(rech); });
        $('[data-z="l"]', corps).appendChild(x);
      });
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  };

  /** Écrire à un client avec un modèle : variables et liens remplis, puis WhatsApp, email ou copie. */
  ADM.ecrireAvecModele = function (c) {
    api("/api/crm/modeles").then(function (l) {
      if (!l.length) { ADM.gererModeles(); return; }
      var tel = waNum(c.telephone);
      var corps = h('<div><label>Modèle</label><select data-k="modele">' + l.map(function (m, i) { return '<option value="' + i + '">' + esc(m.titre) + "</option>"; }).join("") + "</select>" +
        '<label>Message <span class="help">— complétez les [crochets]</span></label><textarea data-k="texte" rows="7"></textarea>' +
        '<div class="acts-l" style="margin-top:12px"><a class="btn wa" data-a="wa" target="_blank" rel="noopener">' + ic("whatsapp-logo") + "WhatsApp</a>" +
        '<a class="btn" data-a="mail">' + ic("envelope-simple") + "Email</a><button class=\"btn\" data-a=\"copier\">" + ic("copy") + "Copier</button>" +
        '<span style="flex:1"></span><button class="btn ghost sm" data-a="gerer">' + ic("gear-six") + "Gérer les modèles</button></div></div>");
      var sel = $('[data-k="modele"]', corps), zone = $('[data-k="texte"]', corps);
      var valeurs = {
        contact: c.contact || c.nom, client: c.nom, formule: c.formule || "[formule]", montant: c.montantMensuel ? ADM.fcfa(c.montantMensuel) : "[montant]",
        renouvellement: c.renouvellement ? ADM.jourCourt(c.renouvellement) : "[date]", paule: (ADM.etat.profil || {}).nom || "Paule",
      };
      function remplir() {
        var m = l[Number(sel.value)];
        var texte = m.texte;
        var liens = ["validation", "brief", "avis"].filter(function (t) { return texte.indexOf("{lien_" + t + "}") !== -1; });
        Promise.all(liens.map(function (t) {
          return api("/api/crm/clients/" + c._id + "/liens/" + t, { method: "POST", body: {} }).then(function (r) { valeurs["lien_" + t] = ADM.lienPublic(r.jeton); });
        })).then(function () {
          zone.value = texte.replace(/\{(\w+)\}/g, function (x, k) { return valeurs[k] != null ? valeurs[k] : x; });
          maj();
        }).catch(function (e) { ADM.toast(e.message, "ko"); });
      }
      function maj() {
        $('[data-a="wa"]', corps).href = "https://wa.me/" + (tel || "") + "?text=" + encodeURIComponent(zone.value);
        $('[data-a="mail"]', corps).href = "mailto:" + encodeURIComponent(c.email || "") + "?subject=" + encodeURIComponent(l[Number(sel.value)].titre) + "&body=" + encodeURIComponent(zone.value);
      }
      sel.addEventListener("change", remplir);
      zone.addEventListener("input", maj);
      $('[data-a="copier"]', corps).addEventListener("click", function () { ADM.copier(zone.value); });
      if (!c.email) $('[data-a="mail"]', corps).remove();
      var mo = ADM.modale("Écrire à " + c.nom, corps, { large: true });
      $('[data-a="gerer"]', corps).addEventListener("click", function () { mo.fermer(); ADM.gererModeles(); });
      remplir();
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  };

  /** Débrief d'équipe consacré à un client. */
  ADM.debriefClient = function (c) {
    api("/api/crm/debriefs", { method: "POST", body: { titre: "Point sur " + c.nom } }).then(function (d) { ADM.aller("equipe/debrief/" + d.id); })
      .catch(function (e) { ADM.toast(e.message, "ko"); });
  };

  /* ======================================================================
     Réglages : sections ajoutées par ce fichier (affichées après Google Agenda)
  ====================================================================== */
  ADM.sectionsReglages = ADM.sectionsReglages || [];
  function section(icone, titre) {
    var s = h('<section class="sec"><div class="sec-h"><h3>' + ic(icone) + '<span></span></h3><span class="pill" hidden></span></div>' +
      '<div class="sec-b"><div class="empty" style="padding:12px"><span class="spin"></span></div></div></section>');
    $("h3 span", s).textContent = titre;
    return {
      el: s, corps: $(".sec-b", s),
      pill: function (cls, t) { var p = $(".sec-h .pill", s); p.className = "pill " + (cls || ""); p.textContent = t; p.hidden = !t; },
      para: function (t, style) { var p = h('<p class="muted" style="font-size:13px;line-height:1.6;' + (style || "") + '"></p>'); p.textContent = t; $(".sec-b", s).appendChild(p); return p; },
      hint: function (icone2, t, cls) { var x = h('<div class="hint ' + (cls || "") + '" style="margin:12px 0 0">' + ic(icone2) + "<div></div></div>"); $("div", x).textContent = t; $(".sec-b", s).appendChild(x); return x; },
      pied: function () { var f = h('<div class="formfoot" style="margin-top:14px;gap:8px;flex-wrap:wrap"></div>'); $(".sec-b", s).appendChild(f); return f; },
    };
  }
  ADM.sectionReglage = section;
  function bouton(pied, libelle, icone, cls, fn) {
    var b = h('<button class="btn ' + (cls || "") + '">' + ic(icone) + "<span></span></button>");
    $("span", b).textContent = libelle;
    b.addEventListener("click", function () { fn(b); });
    pied.appendChild(b);
    return b;
  }
  function caseACocher(parent, libelle, coche, fn) {
    var l = h('<label class="check"><input type="checkbox"> <span></span></label>');
    $("span", l).textContent = libelle;
    var i = $("input", l);
    i.checked = !!coche;
    i.addEventListener("change", function () { fn(i.checked, i); });
    parent.appendChild(l);
    return i;
  }

  /* --- Brief du matin --- */
  ADM.sectionsReglages.push(function sectionBrief() {
    var s = section("sun-horizon", "Brief du matin");
    function charger() {
      api("/api/crm/brief").then(function (d) {
        var r = d.reglages;
        s.pill(!d.emailConfigure ? "ko" : r.actif ? "ok" : "", !d.emailConfigure ? "email inactif" : r.actif ? "actif" : "désactivé");
        s.corps.innerHTML = "";
        s.para("Chaque matin vers 7 h, un email avec votre journée : rendez-vous, publications prévues, relances, demandes non lues, retouches demandées par vos clients, factures en retard et renouvellements de la semaine.");
        if (!d.emailConfigure) s.hint("warning-circle", "Le brief passe par les alertes email : ajoutez RESEND_API_KEY et NOTIFY_EMAIL dans Vercel, puis redéployez.", "alerte");
        function maj(patch, msg) {
          api("/api/crm/brief", { method: "PUT", body: patch }).then(function () { ADM.toast(msg); charger(); }).catch(function (e) { ADM.toast(e.message, "ko"); });
        }
        caseACocher(s.corps, "Recevoir le brief chaque matin", r.actif, function (v) { maj({ actif: v }, v ? "Brief du matin activé" : "Brief du matin arrêté"); });
        caseACocher(s.corps, "Le recevoir aussi les jours calmes (sinon, pas d’email quand il n’y a rien)", r.siVide, function (v) { maj({ siVide: v }, "C’est noté"); });
        if (r.dernierLe) s.para("Dernier brief : " + r.dernierResultat + " · " + ADM.dateRel(r.dernierLe), "margin-top:10px");
        var pied = s.pied();
        bouton(pied, "Aperçu de ce matin", "eye", "soft", function (b) {
          var fin = ADM.attente(b);
          api("/api/crm/brief/apercu").then(function (a) {
            fin();
            var corps = h('<div><p class="muted" style="font-size:13px;margin-bottom:10px"></p><iframe sandbox="" title="Aperçu du brief" style="width:100%;height:min(70vh,640px);border:1px solid var(--line);border-radius:12px;background:#f4f5f7"></iframe></div>');
            $("p", corps).textContent = "Objet : " + a.sujet + (a.vide && !r.siVide ? " — journée calme : avec vos réglages, aucun email ne partirait aujourd’hui." : "");
            $("iframe", corps).srcdoc = a.html;
            ADM.modale("Brief du matin", corps, { large: true });
          }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
        });
        if (d.emailConfigure) bouton(pied, "M’envoyer un test", "paper-plane-tilt", "", function (b) {
          var fin = ADM.attente(b, "Envoi…");
          api("/api/crm/brief/test", { method: "POST" }).then(function (x) { fin(); ADM.toast(x.message); }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
        });
      }).catch(ADM.erreur(s.corps));
    }
    charger();
    return s.el;
  });

  /* --- Double authentification --- */
  function montrerCodesSecours(codes, titre) {
    var corps = h('<div><div class="hint alerte" style="margin:12px 0">' + ic("warning-circle") + "<div>Notez ces codes maintenant : ils ne seront plus affichés. Chacun ouvre votre espace pro une seule fois si vous perdez votre téléphone. Gardez-les hors de ce téléphone (papier, autre appareil).</div></div>" +
      '<div class="codes-secours mono"></div><div class="acts-l" style="margin-top:14px"><button class="btn" data-a="copier">' + ic("copy") + 'Copier</button><a class="btn" data-a="dl" download="codes-de-secours-espace-pro.txt">' + ic("download-simple") + "Télécharger</a></div></div>");
    codes.forEach(function (c) { var x = h("<span></span>"); x.textContent = c; $(".codes-secours", corps).appendChild(x); });
    var texte = "Codes de secours — espace pro de Paule Ackerman\nChaque code ne sert qu’une fois.\n\n" + codes.join("\n") + "\n";
    $('[data-a="copier"]', corps).addEventListener("click", function () { ADM.copier(texte); });
    $('[data-a="dl"]', corps).href = URL.createObjectURL(new Blob([texte], { type: "text/plain;charset=utf-8" }));
    ADM.modale(titre || "Vos codes de secours", corps);
  }
  /** Demande le code de l'application (ou un code de secours) puis appelle fn(code). */
  function demanderCode(titre, texteBouton, fn) {
    var corps = h('<form><p class="muted" style="font-size:13px;margin:12px 0">Saisissez le code à 6 chiffres de votre application (ou un code de secours).</p>' +
      '<input data-k="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="11" style="font-size:18px;letter-spacing:.15em;text-align:center">' +
      '<div class="formfoot" style="margin-top:14px"><button class="btn primary" type="submit"></button></div></form>');
    $('button[type="submit"]', corps).textContent = texteBouton;
    var m = ADM.modale(titre, corps);
    corps.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = $('button[type="submit"]', corps), fin = ADM.attente(b);
      fn($('[data-k="code"]', corps).value).then(function () { m.fermer(); }).catch(function (er) { fin(); ADM.toast(er.message, "ko"); $('[data-k="code"]', corps).select(); });
    });
  }
  function activer2fa(apres) {
    api("/api/auth/2fa/preparer", { method: "POST" }).then(function (p) {
      var corps = h('<form><ol class="etapes-2fa"><li>Installez <b>Google Authenticator</b> (ou Microsoft Authenticator, 2FAS) sur votre téléphone.</li>' +
        "<li>Dans l’application, touchez <b>+</b> puis <b>Scanner un code QR</b>.</li><li>Saisissez ci-dessous le code à 6 chiffres qui s’affiche.</li></ol>" +
        '<div class="qr"><span class="spin"></span></div><details class="muted" style="font-size:12.5px;margin:4px 0 12px"><summary>Impossible de scanner ? Saisissez la clé à la main</summary>' +
        '<p class="mono" style="word-break:break-all;margin-top:6px;font-size:13px"></p></details>' +
        '<label>Code affiché par l’application</label><input data-k="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="7" style="font-size:18px;letter-spacing:.15em;text-align:center">' +
        '<div class="formfoot" style="margin-top:14px"><button class="btn primary" type="submit">' + ic("shield-check") + "Activer</button></div></form>");
      $("details p", corps).textContent = p.secret.replace(/(.{4})/g, "$1 ").trim();
      var m = ADM.modale("Activer la double authentification", corps);
      (ADM.chargerQr ? ADM.chargerQr() : Promise.reject(new Error("QR indisponible"))).then(function (qrcode) {
        var q = qrcode(0, "M");
        q.addData(p.uri);
        q.make();
        $(".qr", corps).innerHTML = q.createSvgTag(5, 8);
      }).catch(function () { $(".qr", corps).textContent = "QR code indisponible : utilisez la clé ci-dessous."; $("details", corps).open = true; });
      corps.addEventListener("submit", function (e) {
        e.preventDefault();
        var b = $('button[type="submit"]', corps), fin = ADM.attente(b);
        api("/api/auth/2fa/activer", { method: "POST", body: { code: $('[data-k="code"]', corps).value } }).then(function (r) {
          m.fermer();
          ADM.toast("Double authentification activée");
          montrerCodesSecours(r.codes);
          apres();
        }).catch(function (er) { fin(); ADM.toast(er.message, "ko"); });
      });
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  }
  ADM.sectionsReglages.push(function section2fa() {
    var s = section("shield-check", "Double authentification");
    function charger() {
      api("/api/auth/2fa").then(function (d) {
        s.pill(d.suspendue ? "ko" : d.actif ? "ok" : "", d.suspendue ? "suspendue" : d.actif ? "active" : "inactive");
        s.corps.innerHTML = "";
        s.para("En plus du mot de passe, un code à 6 chiffres affiché par une application de votre téléphone. Même si quelqu’un découvre votre mot de passe, il ne peut pas entrer sans votre téléphone.");
        if (d.suspendue) s.hint("warning-circle", "Suspendue par la variable ADMIN_2FA_OFF dans Vercel : la connexion ne demande plus de code. Désactivez-la ou réactivez-la ici, puis faites retirer cette variable.", "alerte");
        if (d.actif && !d.lisible) s.hint("warning-circle", "Le secret enregistré est illisible (JWT_SECRET a changé ?) : désactivez puis réactivez la double authentification.", "alerte");
        if (d.actif) {
          s.para("Active depuis le " + new Date(d.depuis).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " · " + d.secoursRestants + " code(s) de secours restant(s).", "margin-top:8px;color:var(--ink)");
          if (d.secoursRestants < 3) s.hint("warning-circle", "Il vous reste peu de codes de secours : créez-en de nouveaux.", "alerte");
        }
        var pied = s.pied();
        if (!d.actif) bouton(pied, "Activer", "shield-check", "primary", function () { activer2fa(charger); });
        else {
          bouton(pied, "Nouveaux codes de secours", "key", "soft", function () {
            demanderCode("Nouveaux codes de secours", "Créer de nouveaux codes", function (code) {
              return api("/api/auth/2fa/secours", { method: "POST", body: { code: code } }).then(function (r) { montrerCodesSecours(r.codes, "Vos nouveaux codes de secours"); charger(); });
            });
          });
          bouton(pied, "Désactiver", "shield-slash", "danger", function () {
            if (d.suspendue) {
              if (!confirm("Désactiver la double authentification ?")) return;
              api("/api/auth/2fa/desactiver", { method: "POST", body: {} }).then(function () { ADM.toast("Double authentification désactivée"); charger(); }).catch(function (e) { ADM.toast(e.message, "ko"); });
              return;
            }
            demanderCode("Désactiver la double authentification", "Désactiver", function (code) {
              return api("/api/auth/2fa/desactiver", { method: "POST", body: { code: code } }).then(function () { ADM.toast("Double authentification désactivée"); charger(); });
            });
          });
        }
      }).catch(ADM.erreur(s.corps));
    }
    charger();
    return s.el;
  });

  /* ======================================================================
     Référencement : bilan, aperçu Google, textes et Search Console
  ====================================================================== */
  var LIMITES = { titre: [30, 60], description: [120, 155] };
  function couper(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + " …" : t; }
  ADM.vue("seo", {
    titre: "Référencement",
    sous: "Être trouvée sur Google",
    rendu: function (params, panel) {
      api("/api/crm/seo").then(function (d) { dessinerSeo(panel, d); }).catch(ADM.erreur(panel));
    },
  });
  function dessinerSeo(panel, d) {
    var r = d.reglages, a = d.audit;
    panel.innerHTML = "";
    var tete = h('<section class="sec seo-tete"><div class="seo-score"><b></b><span>/ 100</span></div><div class="grow"><h3></h3><p class="muted"></p>' +
      '<div class="meter" role="img"><i></i></div></div></section>');
    $(".seo-score b", tete).textContent = a.score;
    $("h3", tete).textContent = a.ok + " point" + (a.ok > 1 ? "s" : "") + " sur " + a.total + " au vert";
    $("p", tete).textContent = a.score >= 80 ? "Votre site est bien préparé. Continuez à publier des études de cas et à collecter des avis."
      : "Chaque point ci-dessous rapproche votre site de la première page de Google. Commencez par ceux du haut.";
    $(".meter i", tete).style.width = a.score + "%";
    $(".meter", tete).setAttribute("aria-label", "Score de référencement : " + a.score + " sur 100");
    panel.appendChild(tete);

    var g = h('<div class="grille g2 seo-g"></div>');
    // Bilan, groupé, points à faire en premier dans chaque groupe
    var bilan = h('<section class="sec"><div class="sec-h"><h3>' + ic("list-checks") + "Bilan</h3></div><div class=\"sec-b flush\"></div></section>");
    var groupes = [];
    a.points.forEach(function (x) { if (groupes.indexOf(x.groupe) === -1) groupes.push(x.groupe); });
    groupes.forEach(function (gr) {
      var t = h('<div class="seo-gr"></div>'); t.textContent = gr; $(".sec-b", bilan).appendChild(t);
      a.points.filter(function (x) { return x.groupe === gr; }).sort(function (x, y) { return (x.ok ? 1 : 0) - (y.ok ? 1 : 0); }).forEach(function (x) {
        var l = h('<div class="ligne seo-pt' + (x.ok ? " ok" : "") + '"><span class="ico-rond">' + ic(x.ok ? "check-circle" : "arrow-circle-right") + '</span><div class="grow"><b></b><small></small></div></div>');
        $("b", l).textContent = x.titre;
        $("small", l).textContent = x.detail;
        if (x.action && !x.ok) {
          var b = h('<a class="btn sm ghost"></a>');
          b.textContent = x.action.libelle;
          if (x.action.url) { b.href = x.action.url; b.target = "_blank"; b.rel = "noopener"; }
          else if (x.action.lien) b.href = "#" + x.action.lien;
          else b.addEventListener("click", function (e) { e.preventDefault(); var c = $('[data-k="' + x.action.champ + '"]', panel); if (c) { c.focus(); c.scrollIntoView({ block: "center", behavior: "smooth" }); } });
          l.appendChild(b);
        } else if (x.action && x.action.url && x.ok) {
          var o2 = h('<a class="btn sm ghost" target="_blank" rel="noopener"></a>'); o2.textContent = x.action.libelle; o2.href = x.action.url; l.appendChild(o2);
        }
        $(".sec-b", bilan).appendChild(l);
      });
    });
    g.appendChild(bilan);

    // Aperçu Google et textes
    var f = h('<section class="sec"><div class="sec-h"><h3>' + ic("google-logo") + "Sur Google</h3></div><div class=\"sec-b\">" +
      '<div class="serp" aria-label="Aperçu dans les résultats Google"><div class="serp-site"><img src="/api/favicon" alt=""><span><b>Paule Ackerman</b><small></small></span></div><div class="serp-t"></div><div class="serp-d"></div></div>' +
      '<label>Titre <span class="help compteur" data-c="titre"></span></label><input data-k="titre" maxlength="120">' +
      '<label>Description <span class="help compteur" data-c="description"></span></label><textarea data-k="description" rows="3" maxlength="320"></textarea>' +
      '<label>Mots-clés visés <span class="help">— ce que vos clients tapent sur Google, séparés par des virgules</span></label><input data-k="motsCles">' +
      '<div class="acts-l"><button class="btn primary" data-a="enr">' + ic("check") + 'Enregistrer</button><button class="btn soft" data-a="lea">' + ic("sparkle") + "Proposer avec Léa</button></div>" +
      '<p class="muted" style="font-size:12px;margin-top:10px;line-height:1.5">Google relit votre site régulièrement : les changements apparaissent dans ses résultats en quelques jours. L’aperçu des liens partagés sur WhatsApp et Facebook ne change pas.</p>' +
      "</div></section>");
    $(".serp-site small", f).textContent = d.site + " › accueil";
    var champs = { titre: $('[data-k="titre"]', f), description: $('[data-k="description"]', f), motsCles: $('[data-k="motsCles"]', f) };
    champs.titre.value = r.titre; champs.description.value = r.description; champs.motsCles.value = (r.motsCles || []).join(", ");
    function apercu() {
      $(".serp-t", f).textContent = couper(champs.titre.value, 62);
      $(".serp-d", f).textContent = couper(champs.description.value, 158);
      ["titre", "description"].forEach(function (k) {
        var n = champs[k].value.trim().length, lim = LIMITES[k], c = $('[data-c="' + k + '"]', f);
        c.textContent = "— " + n + " caractères (idéal : " + lim[0] + " à " + lim[1] + ")";
        c.classList.toggle("trop", n > lim[1] + 5 || n < lim[0]);
      });
    }
    champs.titre.addEventListener("input", apercu);
    champs.description.addEventListener("input", apercu);
    apercu();
    function enregistrer(patch, btn, msg) {
      var fin = btn ? ADM.attente(btn) : function () {};
      return api("/api/crm/seo", { method: "PUT", body: patch }).then(function (d2) {
        fin(); ADM.toast(msg || "Enregistré");
        d2.site = d.site; dessinerSeo(panel, d2);
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    }
    $('[data-a="enr"]', f).addEventListener("click", function () {
      enregistrer({ titre: champs.titre.value, description: champs.description.value, motsCles: champs.motsCles.value }, this, "Textes enregistrés : Google les verra à son prochain passage");
    });
    $('[data-a="lea"]', f).addEventListener("click", function () {
      ADM.ouvrirEquipe("contenu", {
        texte: "Pour le référencement Google de mon site, propose-moi 3 titres (60 caractères maximum, avec mon métier et Libreville) et 3 descriptions (155 caractères maximum, qui donnent envie de me contacter). " +
          "Mes mots-clés : " + (champs.motsCles.value || "community manager Libreville") + ". Titre actuel : « " + champs.titre.value + " ».",
      });
    });
    g.appendChild(f);
    panel.appendChild(g);

    // Search Console et fiche Google
    var pres = h('<section class="sec"><div class="sec-h"><h3>' + ic("map-pin-area") + "Présence sur Google</h3></div><div class=\"sec-b\"><div class=\"grille g2\" style=\"gap:24px\">" +
      '<div><b style="font-size:14px">Google Search Console</b><ol class="etapes-2fa"><li>Ouvrez <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Search Console</a> et ajoutez la propriété « Préfixe de l’URL » : <span class="mono"></span></li>' +
      "<li>Choisissez la validation par <b>Fichier HTML</b> et copiez le nom du fichier (google….html).</li><li>Collez-le ici, enregistrez, puis cliquez sur <b>Valider</b> chez Google.</li><li>Ensuite, dans « Sitemaps », envoyez : <span class=\"mono\">sitemap.xml</span></li></ol>" +
      '<label>Nom du fichier de validation</label><input data-k="verificationGoogle" placeholder="google1a2b3c4d5e6f7a8b.html" spellcheck="false">' +
      '<div class="acts-l"><button class="btn" data-a="console">' + ic("check") + 'Enregistrer</button><a class="btn ghost" data-a="tester" target="_blank" rel="noopener" hidden>' + ic("arrow-square-out") + "Tester le fichier</a></div></div>" +
      '<div><b style="font-size:14px">Fiche Google (Maps)</b><p class="muted" style="font-size:13px;line-height:1.6;margin:8px 0">Gratuite, elle vous fait apparaître sur Google Maps et dans l’encadré à droite des résultats. Créez-la sur <a href="https://www.google.com/business/" target="_blank" rel="noopener">Google Business Profile</a>, ' +
      "puis collez ici son lien (bouton « Partager » de la fiche) pour le retrouver et l’envoyer à vos clients avec une demande d’avis.</p>" +
      '<label>Lien de votre fiche</label><input data-k="ficheGoogle" placeholder="https://g.page/…" spellcheck="false">' +
      '<div class="acts-l"><button class="btn" data-a="fiche">' + ic("check") + "Enregistrer</button></div></div></div></div></section>");
    $("ol .mono", pres).textContent = d.site + "/";
    var v = $('[data-k="verificationGoogle"]', pres), fi = $('[data-k="ficheGoogle"]', pres);
    v.value = r.verificationGoogle || ""; fi.value = r.ficheGoogle || "";
    if (r.verificationGoogle) { var t2 = $('[data-a="tester"]', pres); t2.hidden = false; t2.href = "/" + r.verificationGoogle; }
    $('[data-a="console"]', pres).addEventListener("click", function () { enregistrer({ verificationGoogle: v.value }, this, v.value ? "Fichier en place : validez maintenant chez Google" : "Validation retirée"); });
    $('[data-a="fiche"]', pres).addEventListener("click", function () { enregistrer({ ficheGoogle: fi.value }, this, "Lien de la fiche enregistré"); });
    panel.appendChild(pres);
  }

  /* ======================================================================
     Application installable et notifications sur les appareils
  ====================================================================== */
  var SW = null, invitation = null;
  if ("serviceWorker" in navigator) {
    SW = navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).catch(function () { return null; });
    // Clic sur une notification alors que l'espace pro est déjà ouvert : on y va sans recharger
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "aller") ADM.aller(e.data.lien || "accueil");
    });
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); invitation = e; });
  window.addEventListener("appinstalled", function () { invitation = null; ADM.toast("Espace pro installé"); });
  function installee() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  function estIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function nomAppareil() {
    var ua = navigator.userAgent;
    var sys = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad"
      : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "Appareil";
    var nav = /edg\//i.test(ua) ? "Edge" : /firefox|fxios/i.test(ua) ? "Firefox" : /crios|chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "";
    return sys + (nav ? " · " + nav : "") + (installee() ? " (application)" : "");
  }
  function cleVapid(b64) {
    var brut = atob((b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(brut.length);
    for (var i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
    return out;
  }
  function notificationsPossibles() { return !!SW && "PushManager" in window && "Notification" in window; }
  function abonnementActuel() {
    if (!notificationsPossibles()) return Promise.resolve(null);
    return SW.then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).catch(function () { return null; });
  }
  function activerIci(clePublique) {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("Notifications refusées : autorisez-les pour les recevoir");
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      // Repart d'un abonnement neuf (la clé du serveur a pu changer)
      return reg.pushManager.getSubscription().then(function (ancien) { return ancien ? ancien.unsubscribe() : null; })
        .then(function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(clePublique) }); });
    }).then(function (sub) {
      return api("/api/crm/notifications/abonnement", { method: "POST", body: { abonnement: sub.toJSON(), appareil: nomAppareil() } });
    });
  }
  function sectionNotifications() {
    var s = section("bell-ringing", "Notifications et application");
    function charger() {
      Promise.all([api("/api/crm/notifications"), abonnementActuel()]).then(function (r) {
        var d = r[0], sub = r[1];
        var ici = !!sub && d.appareils.some(function (a) { return a.endpoint === sub.endpoint; });
        s.pill(ici ? "ok" : "", ici ? "actives ici" : d.appareils.length ? d.appareils.length + " appareil" + (d.appareils.length > 1 ? "s" : "") : "");
        s.corps.innerHTML = "";

        // 1. L'espace pro comme une application
        var app = h('<div class="notif-bloc"><b>' + ic("device-mobile") + 'Application</b><p class="muted"></p><div class="acts-l"></div></div>');
        var pa = $("p", app);
        if (installee()) pa.textContent = "Vous utilisez l’espace pro installé : il s’ouvre comme une application, sans barre d’adresse.";
        else if (invitation) {
          pa.textContent = "Installez l’espace pro : il s’ouvre d’un geste depuis l’écran d’accueil ou le bureau, comme une application.";
          bouton($(".acts-l", app), "Installer l’espace pro", "download-simple", "primary", function () {
            invitation.prompt();
            invitation.userChoice.then(function () { invitation = null; charger(); });
          });
        } else if (estIos()) pa.textContent = "Sur iPhone : dans Safari, touchez le bouton Partager puis « Sur l’écran d’accueil ». Ouvrez ensuite l’espace pro depuis son icône pour activer les notifications.";
        else pa.textContent = "Dans Chrome ou Edge : menu ⋮ puis « Installer l’application » (sur Android : « Ajouter à l’écran d’accueil »).";
        s.corps.appendChild(app);

        // 2. Notifications sur cet appareil
        var nb = h('<div class="notif-bloc"><b>' + ic("bell-ringing") + 'Sur cet appareil</b><p class="muted"></p><div class="acts-l"></div></div>');
        var pn = $("p", nb), an = $(".acts-l", nb);
        if (!notificationsPossibles()) {
          pn.textContent = estIos() && !installee() ? "Sur iPhone, les notifications fonctionnent une fois l’espace pro ajouté à l’écran d’accueil (iOS 16.4 ou plus récent)."
            : "Ce navigateur ne gère pas les notifications.";
        } else if (Notification.permission === "denied") {
          pn.textContent = "Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur (icône à gauche de l’adresse), puis revenez ici.";
        } else if (ici) {
          pn.textContent = "Cet appareil reçoit vos notifications, même quand l’espace pro est fermé.";
          bouton(an, "Envoyer un test", "paper-plane-tilt", "soft", function (b) {
            var fin = ADM.attente(b);
            api("/api/crm/notifications/test", { method: "POST" }).then(function (x) { fin(); ADM.toast("Test envoyé à " + x.appareils + " appareil" + (x.appareils > 1 ? "s" : "")); })
              .catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
          });
          bouton(an, "Désactiver ici", "bell-slash", "ghost", function (b) {
            var fin = ADM.attente(b);
            var ep = sub.endpoint;
            sub.unsubscribe().catch(function () {}).then(function () { return api("/api/crm/notifications/desabonnement", { method: "POST", body: { endpoint: ep } }); })
              .then(function () { ADM.toast("Notifications désactivées sur cet appareil"); charger(); }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
          });
        } else {
          pn.textContent = "Soyez prévenue tout de suite d’une nouvelle demande, d’un rendez-vous ou d’un retour client, même quand l’espace pro est fermé.";
          bouton(an, "Activer sur cet appareil", "bell-ringing", "primary", function (b) {
            var fin = ADM.attente(b, "Activation…");
            activerIci(d.clePublique).then(function () { ADM.toast("Notifications activées sur cet appareil"); charger(); })
              .catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
          });
        }
        s.corps.appendChild(nb);

        // 3. Ce qui déclenche une notification
        var pref = h('<div class="notif-bloc"><b>' + ic("sliders-horizontal") + "Me prévenir pour</b></div>");
        Object.keys(d.types).forEach(function (k) {
          caseACocher(pref, d.types[k], d.preferences[k], function (v, input) {
            var t = {}; t[k] = v;
            api("/api/crm/notifications/preferences", { method: "PUT", body: { types: t } }).catch(function (e) { input.checked = !v; ADM.toast(e.message, "ko"); });
          });
        });
        s.corps.appendChild(pref);

        // 4. Appareils abonnés
        if (d.appareils.length) {
          var ap = h('<div class="notif-bloc"><b>' + ic("devices") + "Appareils qui reçoivent les notifications</b></div>");
          d.appareils.forEach(function (a) {
            var l = h('<div class="ligne" style="padding:8px 0;border-top:none"><span class="grow"></span><button class="icobtn danger" title="Retirer cet appareil" aria-label="Retirer cet appareil">' + ic("trash") + "</button></div>");
            $(".grow", l).textContent = a.appareil + (sub && a.endpoint === sub.endpoint ? " — cet appareil" : "") + (a.depuis ? " · depuis le " + new Date(a.depuis).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "");
            $("button", l).addEventListener("click", function () {
              api("/api/crm/notifications/desabonnement", { method: "POST", body: { id: a.id } }).then(charger).catch(function (e) { ADM.toast(e.message, "ko"); });
            });
            ap.appendChild(l);
          });
          s.corps.appendChild(ap);
        }
      }).catch(ADM.erreur(s.corps));
    }
    charger();
    return s.el;
  }
  // Juste après le brief du matin
  ADM.sectionsReglages.splice(1, 0, sectionNotifications);

  /* --- Sauvegarde des données --- */
  ADM.sectionsReglages.push(function sectionSauvegarde() {
    var s = section("database", "Sauvegarde de vos données");
    s.corps.innerHTML = "";
    s.para("Téléchargez une copie de tout votre espace pro : clients, devis et factures, calendrier, demandes, prospects, rendez-vous, discussions avec l’équipe et contenu du site. " +
      "Le fichier ne contient ni mot de passe ni fichiers joints (les photos restent sur Cloudinary). Gardez-le en lieu sûr : il contient les coordonnées de vos clients.");
    var pied = s.pied();
    bouton(pied, "Télécharger la sauvegarde", "download-simple", "soft", function (b) {
      var fin = ADM.attente(b, "Préparation…");
      fetch("/api/crm/export", { headers: { Authorization: "Bearer " + TOKEN } }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.erreur || "Erreur " + r.status); });
        var nom = ((r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/) || [])[1] || "sauvegarde-espace-pro.json";
        return r.blob().then(function (blob) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = nom;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          fin();
          ADM.toast("Sauvegarde téléchargée");
        });
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
    return s.el;
  });
})();
