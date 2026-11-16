/* =========================================================================
   Espace pro de Paule — Équipe IA, Prospects, Agenda.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic, $$ = ADM.$$;

  /* ======================================================================
     ÉQUIPE : discuter avec les assistantes comme avec des contacts
  ====================================================================== */
  var ACTIONS = {
    lister_demandes: "a consulté vos demandes", lire_demande: "a lu une demande", analyser_demande: "a analysé une demande",
    mettre_a_jour_demande: "a mis à jour un suivi", chercher_contact: "a cherché un contact", lister_rdv: "a consulté l’agenda",
    creneaux_libres: "a vérifié vos créneaux", creer_rdv: "a créé un rendez-vous", modifier_rdv: "a modifié un rendez-vous",
    lister_relances: "a consulté les relances", programmer_relance: "a programmé une relance", changer_statut: "a changé une étape",
    lister_prospects: "a consulté vos prospects", enregistrer_prospects: "a ajouté des prospects", mettre_a_jour_prospect: "a mis à jour un prospect",
    enregistrer_audit: "a enregistré un audit", lister_notes: "a lu le bloc-notes", ajouter_note: "a noté une tâche", cocher_note: "a coché une tâche",
  };
  var ECRITURES = ["analyser_demande", "mettre_a_jour_demande", "creer_rdv", "modifier_rdv", "programmer_relance", "changer_statut", "enregistrer_prospects", "mettre_a_jour_prospect", "enregistrer_audit", "ajouter_note", "cocher_note"];
  var LIB_CTX = { message: "Demande", prospect: "Prospect", rdv: "Rendez-vous" };
  var ATTENTE = {
    diagnostic: "Nadia lit vos demandes…",
    prospection: "Yann cherche sur le web… cela peut prendre une à deux minutes.",
    agenda: "Awa réfléchit…",
  };

  ADM.ouvrirEquipe = function (agent, opts) {
    ADM.etat.equipeAttente = Object.assign({ agent: agent }, opts || {});
    ADM.aller("equipe/" + agent);
  };

  var PRENOMS = { diagnostic: "Nadia", prospection: "Yann", agenda: "Awa" };
  var ORDRE = ["diagnostic", "prospection", "agenda"];
  /** Assistantes citées avec @Prénom dans un message de débrief (toutes si aucune). */
  function citees(texte) {
    var l = ORDRE.filter(function (k) { return new RegExp("@" + PRENOMS[k] + "(?![A-Za-zÀ-ÿ0-9])", "i").test(texte); });
    return l.length ? l : ORDRE.slice();
  }
  function listePrenoms(l) {
    var p = l.map(function (k) { return PRENOMS[k]; });
    return p.length > 1 ? p.slice(0, -1).join(", ") + " et " + p[p.length - 1] : p[0] || "";
  }
  function avGroupe(taille) { return '<span class="av groupe ' + (taille || "") + '">' + ic("users-three") + "</span>"; }
  function avIcone(icone, taille) { return '<span class="av outil ' + (taille || "") + '">' + ic(icone) + "</span>"; }
  /** Fait défiler un fil tout en bas, sans animation au premier affichage. */
  function enBasDe(fil, net) {
    if (!net) { fil.scrollTop = fil.scrollHeight; return; }
    fil.style.scrollBehavior = "auto";
    fil.scrollTop = fil.scrollHeight;
    requestAnimationFrame(function () { fil.scrollTop = fil.scrollHeight; fil.style.scrollBehavior = ""; });
  }
  function echeanceLib(j) {
    if (!j) return "";
    var auj = ADM.aujourdhui();
    if (j === auj) return "aujourd’hui";
    if (j === ADM.ajouterJours(auj, 1)) return "demain";
    return ADM.jourLong(j, { weekday: "short", month: "short" });
  }

  ADM.vue("equipe", {
    titre: "Équipe IA",
    sous: "Vos assistantes, vos débriefs d’équipe et votre bloc-notes",
    plein: true,
    rendu: function (params, panel) {
      panel.innerHTML = '<div class="chat"><div class="chat-l"><div class="chat-l-h"><b>Votre équipe</b>' +
        "<p>Trois assistantes IA qui travaillent pour vous, jour et nuit.</p></div>" +
        '<div class="chat-l-b"><div class="contacts" data-l="agents"></div>' +
        '<div class="chat-l-sec"><span>Débriefs d’équipe</span><button class="icobtn" data-a="nouveau" title="Nouveau débrief" aria-label="Nouveau débrief">' + ic("plus") + "</button></div>" +
        '<div class="contacts" data-l="debriefs"></div>' +
        '<div class="chat-l-sec"><span>Organisation</span></div><div class="contacts" data-l="outils"></div></div></div>' +
        '<div class="chat-r"></div></div>';
      var boite = $(".chat", panel), droite = $(".chat-r", panel);
      var lAgents = $('[data-l="agents"]', panel), lDebriefs = $('[data-l="debriefs"]', panel), lOutils = $('[data-l="outils"]', panel);
      var equipe = [], debriefs = [], notes = [];
      var actif = params[0] === "debrief" && params[1] ? "debrief:" + params[1] : params[0] || "";
      var saisieActive = null; // zone de saisie de la discussion ouverte (pour y déposer des fichiers)

      $('[data-a="nouveau"]', panel).addEventListener("click", function () { nouveauDebrief(); });

      // Glisser-déposer des captures ou documents sur la discussion ouverte
      function avecFichiers(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1; }
      droite.addEventListener("dragover", function (e) {
        if (!saisieActive || !avecFichiers(e)) return;
        e.preventDefault();
        droite.classList.add("depot");
      });
      droite.addEventListener("dragleave", function (e) { if (!droite.contains(e.relatedTarget)) droite.classList.remove("depot"); });
      droite.addEventListener("drop", function (e) {
        droite.classList.remove("depot");
        if (!saisieActive || !avecFichiers(e)) return;
        e.preventDefault();
        saisieActive.pj.ajouter(e.dataTransfer.files);
      });

      Promise.all([api("/api/crm/equipe"), api("/api/crm/debriefs"), api("/api/crm/notes")]).then(function (r) {
        equipe = r[0]; debriefs = r[1]; notes = r[2];
        dessinerListe();
        if (!actif && innerWidth > 900) actif = "diagnostic";
        ouvrirCle(actif);
      }).catch(ADM.erreur(lAgents));

      function fiche(agent) { return equipe.find(function (a) { return a.agent === agent; }) || {}; }
      function ouvrirCle(cle) {
        if (!cle) { droite.innerHTML = ""; return; }
        if (cle.indexOf("debrief:") === 0) ouvrirDebrief(cle.slice(8));
        else if (cle === "notes") ouvrirNotes();
        else ouvrir(cle);
      }
      function ligneContact(cle, avatar, titre, quand, poste, apercu) {
        var c = h('<div class="contact' + (cle === actif ? " on" : "") + '" tabindex="0" data-cle="' + esc(cle) + '">' + avatar +
          '<div class="grow"><div class="l1"><b></b><time></time></div>' + (poste != null ? '<div class="poste"></div>' : "") + '<div class="l2"></div></div></div>');
        $(".l1 b", c).textContent = titre;
        $(".l1 time", c).textContent = quand || "";
        if (poste != null) $(".poste", c).textContent = poste;
        $(".l2", c).textContent = String(apercu || "").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
        c.addEventListener("click", function () { ouvrirCle(cle); });
        c.addEventListener("keydown", function (e) { if (e.key === "Enter") ouvrirCle(cle); });
        return c;
      }
      function dessinerListe() {
        lAgents.innerHTML = "";
        equipe.forEach(function (a) {
          lAgents.appendChild(ligneContact(a.agent, ADM.avAgent(a.agent, "lg", ADM.statutAgent(a).dispo), a.prenom,
            a.dernier ? ADM.dateRel(a.dernier.date) : "", a.poste + " · " + a.fournisseur,
            a.dernier ? (a.dernier.role === "user" ? "Vous : " : "") + ADM.pieces.resume(a.dernier) : a.presentation));
        });
        lDebriefs.innerHTML = "";
        if (!debriefs.length) {
          var vide = h('<button class="chat-l-vide">' + ic("plus-circle") + "<span>Réunir l’équipe sur un client ou un sujet</span></button>");
          vide.addEventListener("click", function () { nouveauDebrief(); });
          lDebriefs.appendChild(vide);
        }
        debriefs.forEach(function (d) {
          var der = d.dernier;
          var apercu = der ? (der.role === "user" ? "Vous : " : (PRENOMS[der.agent] || "") + " : ") + ADM.pieces.resume(der) : "Nadia, Yann et Awa";
          lDebriefs.appendChild(ligneContact("debrief:" + d.id, avGroupe("lg"), d.titre, der ? ADM.dateRel(der.date) : ADM.dateRel(d.creeLe),
            d.contexte ? d.contexte.label : "Sujet libre", apercu));
        });
        lOutils.innerHTML = "";
        var aFaire = notes.filter(function (n) { return !n.fait; }).length;
        lOutils.appendChild(ligneContact("notes", avIcone("note-pencil", "lg"), "Bloc-notes", "", "Vos tâches et celles notées par Awa",
          aFaire ? aFaire + " tâche" + (aFaire > 1 ? "s" : "") + " à faire" : "Rien à faire pour l’instant"));
      }
      function marquer(cle, hash) {
        actif = cle;
        saisieActive = null;
        history.replaceState(null, "", "#equipe/" + hash);
        $$(".contact", panel).forEach(function (c) { c.classList.toggle("on", c.dataset.cle === cle); });
        boite.classList.add("detail");
        droite.innerHTML = "";
      }
      function boutonRetour(tete) {
        $(".retour-m", tete).addEventListener("click", function () { boite.classList.remove("detail"); history.replaceState(null, "", "#equipe"); actif = ""; });
      }
      function rechargerNotes() {
        return api("/api/crm/notes").then(function (l) { notes = l; dessinerListe(); return l; });
      }

      /* Zone de saisie commune aux discussions et aux débriefs, avec ses pièces jointes.
         `pour` : « agent:<assistante> » ou « debrief:<id> ». */
      function zoneSaisie(placeholder, note, surEnvoi, pour) {
        var compo = h('<div class="compose"><div class="compose-in"><div class="ctx-zone"></div><div class="pj-zone"></div><div class="compose-row">' +
          '<textarea rows="1" aria-label="Votre message"></textarea>' +
          '<button class="envoyer" disabled aria-label="Envoyer">' + ic("paper-plane-right") + "</button></div></div>" +
          '<div class="compose-note"></div></div>');
        var zone = $("textarea", compo), bouton = $(".envoyer", compo), pj = null, occupee = false;
        zone.placeholder = placeholder;
        $(".compose-note", compo).textContent = note;
        function ajuster() {
          zone.style.height = "auto";
          zone.style.height = Math.min(200, zone.scrollHeight) + "px";
          bouton.disabled = occupee || (!zone.value.trim() && !(pj && pj.nombre()));
        }
        /** Pendant que les pièces jointes finissent d'arriver avant l'envoi. */
        function occuper(oui) {
          occupee = oui;
          zone.disabled = oui;
          bouton.classList.toggle("occupe", oui);
          bouton.innerHTML = ic(oui ? "circle-notch" : "paper-plane-right");
          ajuster();
        }
        pj = ADM.pieces.brancher({ ligne: $(".compose-row", compo), zone: $(".pj-zone", compo), champ: zone, pour: pour, change: ajuster });
        zone.addEventListener("input", ajuster);
        zone.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); surEnvoi(); } });
        bouton.addEventListener("click", function () { surEnvoi(); });
        setTimeout(function () { if (innerWidth > 900) zone.focus(); }, 60);
        saisieActive = { pj: pj };
        return { el: compo, zone: zone, ctxZone: $(".ctx-zone", compo), ajuster: ajuster, pj: pj, occuper: occuper };
      }
      /** Pièces jointes d'un message de Paule, au-dessus de sa bulle (la bulle disparaît s'il n'y a pas de texte). */
      function avecPieces(b, pieces, garderBulle) {
        if (!pieces || !pieces.length) return;
        var c = b.parentNode.classList.contains("bulle-c") ? b.parentNode : null;
        if (!c) { c = h('<div class="bulle-c"></div>'); b.parentNode.insertBefore(c, b); c.appendChild(b); }
        c.insertBefore(ADM.pieces.liste(pieces), b);
        if (!garderBulle) b.remove();
      }
      function pastillesActions(filIn, prenom, actions) {
        var faits = (actions || []).filter(function (x, i, t) { return t.findIndex(function (y) { return y.outil === x.outil && y.ok === x.ok; }) === i; });
        if (!faits.length) return;
        var f = h('<div class="faits"></div>');
        faits.forEach(function (x) {
          var ecrit = ECRITURES.indexOf(x.outil) !== -1;
          f.appendChild(h('<span class="pill ' + (!x.ok ? "ko" : ecrit ? "ok" : "") + '">' + ic(!x.ok ? "warning-circle" : ecrit ? "check-circle" : "eye") +
            esc(prenom + " " + (ACTIONS[x.outil] || x.outil)) + "</span>"));
        });
        filIn.appendChild(f);
      }
      function aNote(actions) { return (actions || []).some(function (x) { return x.ok && (x.outil === "ajouter_note" || x.outil === "cocher_note"); }); }

      /* ---------------- Discussion avec une assistante ---------------- */
      function ouvrir(agent) {
        if (!ADM.EQUIPE[agent]) { ouvrirCle(innerWidth > 900 ? "diagnostic" : ""); return; }
        marquer(agent, agent);
        var a = fiche(agent);
        var meta = ADM.EQUIPE[agent] || {};
        var tete = h('<div class="chat-h"><button class="icobtn retour-m" aria-label="Retour">' + ic("arrow-left") + "</button>" + ADM.avAgent(agent, "", ADM.statutAgent(a).dispo) +
          '<div class="grow"><b></b><small><span class="dot"></span><span class="st"></span></small></div>' +
          '<button class="icobtn" data-a="fiche" title="Sa fiche" aria-label="Sa fiche">' + ic("identification-card") + "</button>" +
          '<button class="icobtn" data-a="vider" title="Effacer la conversation" aria-label="Effacer la conversation">' + ic("broom") + "</button></div>");
        $(".grow b", tete).textContent = (a.prenom || meta.prenom) + " · " + (a.poste || meta.poste);
        function majStatut() {
          var st = ADM.statutAgent(a);
          $(".dot", tete).className = "dot " + st.cls;
          $(".st", tete).textContent = st.dispo ? "En ligne · " + a.fournisseur + " (" + a.modele + ")" :
            !a.configure ? "Clé " + a.fournisseur + " manquante" : "Budget de tokens du jour atteint · reprend demain";
          var etat = $(".av .etat", tete);
          if (etat) etat.classList.toggle("off", !st.dispo);
        }
        majStatut();
        boutonRetour(tete);
        $('[data-a="fiche"]', tete).addEventListener("click", function () { ouvrirFiche(a); });
        $('[data-a="vider"]', tete).addEventListener("click", function () {
          if (!confirm("Effacer toute la conversation avec " + a.prenom + " ? Ce qu’elle a fait (rendez-vous, prospects…) reste enregistré.")) return;
          api("/api/crm/equipe/" + agent, { method: "DELETE" }).then(function () { a.dernier = null; dessinerListe(); ouvrir(agent); ADM.rafraichirEquipe(); });
        });
        droite.appendChild(tete);

        var fil = h('<div class="fil"><div class="fil-in"></div></div>');
        var filIn = $(".fil-in", fil);
        droite.appendChild(fil);

        var saisie = zoneSaisie("Écrire à " + (a.prenom || "") + "…", (a.prenom || "") + " est une assistante IA : vérifiez ce qu’elle prépare avant de l’envoyer à un client.", envoyer, "agent:" + agent);
        droite.appendChild(saisie.el);
        var zone = saisie.zone, ajuster = saisie.ajuster, ctxZone = saisie.ctxZone;
        var contexte = null;

        var attente = ADM.etat.equipeAttente;
        if (attente && attente.agent === agent) {
          ADM.etat.equipeAttente = null;
          if (attente.contexte) poserContexte(attente.contexte);
          if (attente.texte) { zone.value = attente.texte; ajuster(); }
        }
        function poserContexte(c) {
          contexte = c;
          ctxZone.innerHTML = "";
          if (!c) return;
          var chip = h('<span class="ctx-chip">' + ic("paperclip") + "<span></span><button class=\"icobtn\" style=\"width:22px;height:22px\" aria-label=\"Retirer\">" + ic("x") + "</button></span>");
          $("span span", chip).textContent = c.label || LIB_CTX[c.type] || "Pièce jointe";
          $("button", chip).addEventListener("click", function () { poserContexte(null); });
          ctxZone.appendChild(chip);
        }

        function intro() {
          var st = ADM.statutAgent(a);
          var p = h('<div class="presente">' + ADM.avAgent(agent, "xl", st.dispo) + '<b></b><p></p><div class="meta"></div><div class="idees" style="margin-top:14px"></div></div>');
          $("b", p).textContent = a.prenom + " · " + a.poste;
          $("p", p).textContent = a.presentation || "";
          $(".meta", p).appendChild(h('<span class="pill contour">' + esc(a.fournisseur) + " · " + esc(a.modele || "") + "</span>"));
          $(".meta", p).appendChild(h('<span class="pill ' + st.cls + '">' + esc(st.dispo ? "Prête" : st.texte) + "</span>"));
          (a.suggestions || []).forEach(function (s) {
            var b = h("<button></button>");
            b.textContent = s;
            b.addEventListener("click", function () { zone.value = s; ajuster(); envoyer(); });
            $(".idees", p).appendChild(b);
          });
          filIn.appendChild(p);
        }
        function bulle(m) {
          var moi = m.role === "user";
          var r = h('<div class="msg-r ' + (moi ? "moi" : "lui") + (m.erreur ? " erreur" : "") + '">' + (moi ? "" : ADM.avAgent(agent, "sm")) + '<div class="bulle"></div></div>');
          var b = $(".bulle", r);
          if (moi) {
            if (m.contexte) b.appendChild(h('<span class="ctx">' + ic("paperclip") + esc(LIB_CTX[m.contexte.type] || "Pièce jointe") + "</span>"));
            b.appendChild(document.createTextNode(m.texte || ""));
            if (m.contexte && m.texte) b.insertBefore(document.createElement("br"), b.lastChild);
            avecPieces(b, m.pieces, !!(m.texte || m.contexte));
          } else if (m.erreur) b.textContent = m.texte;
          else b.innerHTML = ADM.markdown(m.texte);
          filIn.appendChild(r);
          var meta = h('<div class="msg-meta"></div>');
          meta.textContent = m.date ? ADM.dateRel(m.date) : "";
          filIn.appendChild(meta);
          pastillesActions(filIn, a.prenom || "", m.actions);
        }

        api("/api/crm/equipe/" + agent).then(function (d) {
          filIn.innerHTML = "";
          intro();
          (d.messages || []).forEach(bulle);
          enBasDe(fil, true);
          if (attente && attente.envoyer) envoyer();
        }).catch(ADM.erreur(filIn));

        var envoiEnCours = false;
        function envoyer() {
          var texte = zone.value.trim();
          if ((!texte && !saisie.pj.nombre()) || envoiEnCours) return;
          if (!a.configure) { ADM.toast(a.prenom + " attend sa clé " + a.fournisseur + " (voir Réglages).", "ko"); return; }
          if (!ADM.statutAgent(a).dispo) { ADM.toast(a.prenom + " a utilisé son budget de tokens du jour : elle reprend demain.", "ko"); return; }
          envoiEnCours = true;
          if (saisie.pj.enCours()) saisie.occuper(true);
          saisie.pj.pretes().then(function (pieces) {
            saisie.occuper(false);
            if (!texte && !pieces.length) { envoiEnCours = false; return; }
            partir(texte, pieces);
          });
        }
        function partir(texte, pieces) {
          var ctx = contexte;
          bulle({ role: "user", texte: texte, date: new Date().toISOString(), contexte: ctx, pieces: pieces });
          zone.value = ""; ajuster(); poserContexte(null); saisie.pj.vider();
          var ecrit = h('<div class="msg-r lui">' + ADM.avAgent(agent, "sm") + '<div class="bulle" style="padding:0"><div class="ecrit"><i></i><i></i><i></i></div></div></div>');
          var note = h('<div class="msg-meta"></div>');
          note.textContent = pieces.length ? (a.prenom || "") + " lit vos pièces jointes…" : ATTENTE[agent] || "";
          filIn.appendChild(ecrit); filIn.appendChild(note);
          enBasDe(fil);
          api("/api/crm/equipe/" + agent, { method: "POST", body: {
            texte: texte, contexte: ctx ? { type: ctx.type, id: ctx.id } : null, pieces: pieces.map(function (p) { return p.id; }),
          } }).then(function (r) {
            ecrit.remove(); note.remove();
            bulle(r.message);
            enBasDe(fil);
            a.dernier = r.message;
            dessinerListe();
            ADM.rafraichirEquipe();
            ADM.rafraichirCompteurs();
            var outils = (r.actions || []).filter(function (x) { return x.ok; }).map(function (x) { return x.outil; });
            if (outils.indexOf("creer_rdv") !== -1 || outils.indexOf("modifier_rdv") !== -1) ADM.toast("Agenda mis à jour");
            if (outils.indexOf("enregistrer_prospects") !== -1) ADM.toast("Nouveaux prospects ajoutés");
            if (aNote(r.actions)) { ADM.toast("Bloc-notes mis à jour"); rechargerNotes(); }
          }).catch(function (e) {
            ecrit.remove(); note.remove();
            bulle({ role: "assistant", texte: e.message, erreur: true, date: new Date().toISOString() });
            enBasDe(fil);
            if (/budget du jour/i.test(e.message || "")) {
              a.jetonsJour = Math.max(a.jetonsJour || 0, a.limiteJetons || 0);
              majStatut(); dessinerListe(); ADM.rafraichirEquipe();
            }
          }).then(function () { envoiEnCours = false; });
        }
      }

      /* ---------------- Débrief d'équipe ---------------- */
      function nouveauDebrief() {
        var corps = h('<div><label style="margin-top:0">Sujet</label><input data-k="titre" maxlength="120" placeholder="Ex. : Préparer le devis de Folie Douce">' +
          '<label>Client concerné <span class="help">(facultatif)</span></label><select data-k="client"><option value="">Aucun, sujet libre</option></select>' +
          '<p class="muted" style="font-size:12.5px;margin:4px 0 14px">Nadia et Yann donnent leur avis, puis Awa fait la synthèse : les grands points, et les tâches à faire qu’elle note dans votre bloc-notes.</p>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn ghost" data-a="annuler">Annuler</button><button class="btn primary" data-a="creer">' + ic("users-three") + "Réunir l’équipe</button></div></div>");
        var m = ADM.modale("Nouveau débrief", corps);
        var sel = $('[data-k="client"]', corps), titre = $('[data-k="titre"]', corps), clients = [];
        api("/api/crm/debriefs-clients").then(function (l) {
          clients = l;
          [["message", "Demandes reçues"], ["prospect", "Prospects"]].forEach(function (g) {
            var dans = l.filter(function (c) { return c.type === g[0]; });
            if (!dans.length) return;
            var og = document.createElement("optgroup");
            og.label = g[1];
            dans.forEach(function (c, i) {
              var o = document.createElement("option");
              o.value = c.type + ":" + c.id;
              o.textContent = c.label + (c.sous ? " · " + c.sous : "");
              og.appendChild(o);
            });
            sel.appendChild(og);
          });
        }).catch(function () {});
        sel.addEventListener("change", function () {
          var c = clients.find(function (x) { return x.type + ":" + x.id === sel.value; });
          if (c && !titre.value.trim()) titre.value = "Point sur " + c.label;
        });
        $('[data-a="annuler"]', corps).addEventListener("click", function () { m.fermer(); });
        var creer = $('[data-a="creer"]', corps);
        function valider() {
          if (!titre.value.trim()) { titre.focus(); ADM.toast("Donnez un sujet au débrief", "ko"); return; }
          var v = sel.value.split(":");
          creer.disabled = true;
          api("/api/crm/debriefs", { method: "POST", body: { titre: titre.value.trim(), contexte: v[1] ? { type: v[0], id: v[1] } : null } }).then(function (d) {
            m.fermer();
            debriefs.unshift(d);
            dessinerListe();
            ouvrirDebrief(d.id);
          }).catch(function (e) { creer.disabled = false; ADM.toast(e.message, "ko"); });
        }
        creer.addEventListener("click", valider);
        titre.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); valider(); } });
      }

      function ouvrirDebrief(id) {
        var d = debriefs.find(function (x) { return x.id === id; });
        if (!d) { ADM.toast("Ce débrief n’existe plus", "ko"); ouvrirCle(innerWidth > 900 ? "diagnostic" : ""); return; }
        marquer("debrief:" + id, "debrief/" + id);
        var tete = h('<div class="chat-h"><button class="icobtn retour-m" aria-label="Retour">' + ic("arrow-left") + "</button>" + avGroupe() +
          '<div class="grow"><b></b><small></small></div>' +
          '<button class="icobtn danger" data-a="suppr" title="Supprimer le débrief" aria-label="Supprimer le débrief">' + ic("trash") + "</button></div>");
        $(".grow b", tete).textContent = d.titre;
        $(".grow small", tete).textContent = (d.contexte ? d.contexte.label + " · " : "") + "Nadia, Yann et Awa";
        boutonRetour(tete);
        $('[data-a="suppr"]', tete).addEventListener("click", function () {
          if (!confirm("Supprimer le débrief « " + d.titre + " » ? Les tâches notées dans le bloc-notes restent.")) return;
          api("/api/crm/debriefs/" + id, { method: "DELETE" }).then(function () {
            debriefs = debriefs.filter(function (x) { return x.id !== id; });
            dessinerListe();
            ouvrirCle(innerWidth > 900 ? "diagnostic" : "");
            if (innerWidth <= 900) boite.classList.remove("detail");
          }).catch(function (e) { ADM.toast(e.message, "ko"); });
        });
        droite.appendChild(tete);

        var fil = h('<div class="fil"><div class="fil-in"></div></div>');
        var filIn = $(".fil-in", fil);
        droite.appendChild(fil);
        var saisie = zoneSaisie("Écrire à l’équipe…",
          "Nadia et Yann répondent, puis Awa fait la synthèse. Vérifiez ce qu’elles préparent avant de l’envoyer à un client.", envoyer, "debrief:" + id);
        droite.appendChild(saisie.el);
        var zone = saisie.zone, ajuster = saisie.ajuster;
        var cibles = h('<div class="cibles"></div>');
        ORDRE.forEach(function (k) {
          var b = h('<button type="button">' + ADM.avAgent(k, "xs") + '<span class="lib"></span></button>');
          $(".lib", b).textContent = "@" + PRENOMS[k];
          b.addEventListener("click", function () {
            var t = "@" + PRENOMS[k] + " ";
            if (zone.value.indexOf(t.trim()) === -1) zone.value = t + zone.value.replace(/^\s+/, "");
            ajuster(); zone.focus();
          });
          cibles.appendChild(b);
        });
        saisie.ctxZone.appendChild(cibles);

        function intro() {
          var p = h('<div class="presente">' + avGroupe("xl") + '<b></b><p></p><div class="meta"></div><div class="idees" style="margin-top:14px"></div></div>');
          $("b", p).textContent = d.titre;
          $("p", p).textContent = "Posez votre question à toute l’équipe. Nadia et Yann donnent leur avis, puis Awa réagit et fait la synthèse : " +
            "les grands points, et les tâches à faire qu’elle note dans votre bloc-notes. Écrivez @Nadia, @Yann ou @Awa pour ne parler qu’à une seule.";
          if (d.contexte) $(".meta", p).appendChild(h('<span class="pill bleu">' + ic(d.contexte.type === "prospect" ? "target" : "chat-circle-text") + esc(d.contexte.label) + "</span>"));
          var idees = d.contexte
            ? ["Faisons le point sur ce client", "Quel prix proposer, et avec quelle marge ?", "Qu’attend ce client de moi ?"]
            : ["Faisons le point de la semaine", "Comment trouver 3 nouveaux clients ce mois-ci ?", "Quelles priorités pour les 7 prochains jours ?"];
          idees.forEach(function (s) {
            var b = h("<button></button>");
            b.textContent = s;
            b.addEventListener("click", function () { zone.value = s; ajuster(); envoyer(); });
            $(".idees", p).appendChild(b);
          });
          filIn.appendChild(p);
        }
        function bulle(m) {
          var moi = m.role === "user";
          var prenom = PRENOMS[m.agent] || "";
          var r = h('<div class="msg-r ' + (moi ? "moi" : "lui") + (m.erreur ? " erreur" : "") + '">' + (moi ? "" : ADM.avAgent(m.agent, "sm")) +
            '<div class="bulle-c">' + (moi ? "" : '<span class="qui"></span>') + '<div class="bulle"></div></div></div>');
          if (!moi) $(".qui", r).textContent = prenom;
          var b = $(".bulle", r);
          if (moi || m.erreur) b.textContent = m.texte || ""; else b.innerHTML = ADM.markdown(m.texte);
          if (moi) avecPieces(b, m.pieces, !!m.texte);
          filIn.appendChild(r);
          var meta = h('<div class="msg-meta"></div>');
          meta.textContent = m.date ? ADM.dateRel(m.date) : "";
          filIn.appendChild(meta);
          if (!moi) pastillesActions(filIn, prenom, m.actions);
        }

        api("/api/crm/debriefs/" + id).then(function (r) {
          filIn.innerHTML = "";
          intro();
          (r.messages || []).forEach(bulle);
          enBasDe(fil, true);
        }).catch(ADM.erreur(filIn));

        var envoiEnCours = false;
        function envoyer() {
          var texte = zone.value.trim();
          if ((!texte && !saisie.pj.nombre()) || envoiEnCours) return;
          var qui = citees(texte);
          var dispo = qui.filter(function (k) { return ADM.statutAgent(fiche(k)).dispo; });
          if (!dispo.length) { ADM.toast(qui.length > 1 ? "Aucune assistante n’est disponible (clé manquante ou budget du jour atteint)." : PRENOMS[qui[0]] + " n’est pas disponible.", "ko"); return; }
          envoiEnCours = true;
          if (saisie.pj.enCours()) saisie.occuper(true);
          saisie.pj.pretes().then(function (pieces) {
            saisie.occuper(false);
            if (!texte && !pieces.length) { envoiEnCours = false; return; }
            partir(texte, qui, pieces);
          });
        }
        function partir(texte, qui, pieces) {
          bulle({ role: "user", texte: texte, date: new Date().toISOString(), pieces: pieces });
          zone.value = ""; ajuster(); saisie.pj.vider();
          var ecrit = h('<div class="msg-r lui"><span class="av-pile"></span><div class="bulle" style="padding:0"><div class="ecrit"><i></i><i></i><i></i></div></div></div>');
          qui.forEach(function (k) { $(".av-pile", ecrit).insertAdjacentHTML("beforeend", ADM.avAgent(k, "sm")); });
          var note = h('<div class="msg-meta"></div>');
          var avant = qui.filter(function (k) { return k !== "agenda"; });
          note.textContent = qui.indexOf("agenda") !== -1 && avant.length
            ? listePrenoms(avant) + (avant.length > 1 ? " répondent" : " répond") + ", puis Awa fait la synthèse…" + (avant.indexOf("prospection") !== -1 ? " Jusqu’à deux minutes si Yann cherche sur le web." : "")
            : listePrenoms(qui) + (qui.length > 1 ? " réfléchissent…" : " réfléchit…");
          filIn.appendChild(ecrit); filIn.appendChild(note);
          enBasDe(fil);
          api("/api/crm/debriefs/" + id, { method: "POST", body: { texte: texte, pieces: pieces.map(function (p) { return p.id; }) } }).then(function (r) {
            ecrit.remove(); note.remove();
            (r.reponses || []).forEach(bulle);
            enBasDe(fil);
            var der = (r.reponses || []).slice(-1)[0] || r.message;
            d.dernier = der; d.nbMessages = (d.nbMessages || 0) + 1 + (r.reponses || []).length;
            debriefs.sort(function (x, y) { return String((y.dernier && y.dernier.date) || y.creeLe).localeCompare(String((x.dernier && x.dernier.date) || x.creeLe)); });
            dessinerListe();
            ADM.rafraichirEquipe();
            var toutes = [];
            (r.reponses || []).forEach(function (x) { toutes = toutes.concat(x.actions || []); });
            if (aNote(toutes)) { ADM.toast("Awa a mis à jour le bloc-notes"); rechargerNotes(); }
            api("/api/crm/equipe").then(function (l) { equipe = l; dessinerListe(); }).catch(function () {});
          }).catch(function (e) {
            ecrit.remove(); note.remove();
            bulle({ role: "assistant", agent: "agenda", texte: e.message, erreur: true, date: new Date().toISOString() });
            enBasDe(fil);
          }).then(function () { envoiEnCours = false; });
        }
      }

      /* ---------------- Bloc-notes ---------------- */
      function ouvrirNotes() {
        marquer("notes", "notes");
        var tete = h('<div class="chat-h"><button class="icobtn retour-m" aria-label="Retour">' + ic("arrow-left") + "</button>" + avIcone("note-pencil") +
          '<div class="grow"><b>Bloc-notes</b><small>Vos tâches, et celles qu’Awa note pendant les débriefs</small></div></div>');
        boutonRetour(tete);
        droite.appendChild(tete);
        var fil = h('<div class="fil"><div class="fil-in notes"></div></div>');
        var zoneNotes = $(".fil-in", fil);
        droite.appendChild(fil);

        var form = h('<form class="note-ajout"><input data-k="texte" maxlength="500" placeholder="Ajouter une tâche…" aria-label="Nouvelle tâche">' +
          '<div class="note-ajout-l"><input data-k="client" maxlength="120" placeholder="Client (facultatif)" aria-label="Client concerné" list="notes-clients">' +
          '<input data-k="echeance" type="date" aria-label="Échéance"><button class="btn primary" type="submit">' + ic("plus") + "Ajouter</button></div>" +
          '<datalist id="notes-clients"></datalist></form>');
        zoneNotes.appendChild(form);
        var liste = h("<div></div>");
        zoneNotes.appendChild(liste);
        api("/api/crm/debriefs-clients").then(function (l) {
          var dl = $("datalist", form), vus = {};
          l.forEach(function (c) { if (vus[c.label]) return; vus[c.label] = 1; var o = document.createElement("option"); o.value = c.label; dl.appendChild(o); });
        }).catch(function () {});
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var t = $('[data-k="texte"]', form);
          if (!t.value.trim()) { t.focus(); return; }
          api("/api/crm/notes", { method: "POST", body: { texte: t.value, client: $('[data-k="client"]', form).value, echeance: $('[data-k="echeance"]', form).value } }).then(function () {
            t.value = ""; $('[data-k="client"]', form).value = ""; $('[data-k="echeance"]', form).value = "";
            t.focus();
            return rechargerNotes().then(dessiner);
          }).catch(function (er) { ADM.toast(er.message, "ko"); });
        });

        function ligne(n) {
          var retard = !n.fait && n.echeance && n.echeance < ADM.aujourdhui();
          var r = h('<div class="note' + (n.fait ? " fait" : "") + '"><input type="checkbox" aria-label="Fait"><div class="grow"><div class="t"></div><div class="m"></div></div>' +
            '<button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button></div>");
          $(".t", r).textContent = n.texte;
          var m = $(".m", r);
          if (n.client) m.appendChild(h('<span class="pill">' + ic("user") + esc(n.client) + "</span>"));
          if (n.echeance) m.appendChild(h('<span class="pill ' + (retard ? "ko" : n.fait ? "" : "bleu") + '">' + ic("calendar-dots") + esc((retard ? "En retard · " : "") + echeanceLib(n.echeance)) + "</span>"));
          if (n.auteur && n.auteur !== "Paule") m.appendChild(h('<span class="pill">' + ic("sparkle") + "Noté par " + esc(n.auteur) + "</span>"));
          var cb = $("input", r);
          cb.checked = n.fait;
          cb.addEventListener("change", function () {
            api("/api/crm/notes/" + n.id, { method: "PUT", body: { fait: cb.checked } }).then(function () { return rechargerNotes().then(dessiner); })
              .catch(function (e) { cb.checked = !cb.checked; ADM.toast(e.message, "ko"); });
          });
          $("button", r).addEventListener("click", function () {
            api("/api/crm/notes/" + n.id, { method: "DELETE" }).then(function () { return rechargerNotes().then(dessiner); }).catch(function (e) { ADM.toast(e.message, "ko"); });
          });
          return r;
        }
        function dessiner() {
          liste.innerHTML = "";
          var aFaire = notes.filter(function (n) { return !n.fait; }), faites = notes.filter(function (n) { return n.fait; });
          liste.appendChild(h('<div class="notes-t">À faire <span class="faint">' + aFaire.length + "</span></div>"));
          if (!aFaire.length) liste.appendChild(h('<p class="muted notes-vide">Rien à faire pour l’instant. Ajoutez une tâche, ou demandez à Awa de noter les actions d’un débrief.</p>'));
          aFaire.forEach(function (n) { liste.appendChild(ligne(n)); });
          if (faites.length) {
            liste.appendChild(h('<div class="notes-t">Fait <span class="faint">' + faites.length + "</span></div>"));
            faites.slice(0, 50).forEach(function (n) { liste.appendChild(ligne(n)); });
          }
        }
        dessiner();
      }

      function ouvrirFiche(a) {
        var acces = {
          diagnostic: ["Lire vos demandes reçues et leurs coordonnées", "Analyser une demande et enregistrer l’analyse", "Mettre à jour l’étape, la relance et vos notes"],
          prospection: ["Chercher et lire des pages web publiques", "Ajouter et mettre à jour des prospects", "Enregistrer des audits de présence en ligne"],
          agenda: ["Consulter et créer des rendez-vous", "Déplacer, confirmer ou annuler un rendez-vous", "Programmer des relances et changer les étapes",
            "Vous conseiller sur vos prix, vos marges et les attentes de vos clients", "Lire vos demandes reçues et vos prospects", "Noter et cocher des tâches dans le bloc-notes"],
        }[a.agent] || [];
        var corps = h('<div><div class="presente" style="padding-top:18px">' + ADM.avAgent(a.agent, "xl", ADM.statutAgent(a).dispo) + "<b></b><p></p></div>" +
          '<section class="sec"><div class="sec-b">' +
          '<div class="ligne" style="padding:8px 0;border:none"><span class="grow muted">Fournisseur</span><b></b></div>' +
          '<div class="ligne" style="padding:8px 0"><span class="grow muted">Modèle</span><b class="mono"></b></div>' +
          '<div class="ligne" style="padding:8px 0"><span class="grow muted">Tokens aujourd’hui</span><b></b></div>' +
          '<div class="ligne" style="padding:8px 0"><span class="grow muted">Tokens ce mois</span><b></b></div>' +
          '<div class="ligne" style="padding:8px 0"><span class="grow muted">Coût estimé ce mois</span><b></b></div>' +
          '</div></section><section class="sec"><div class="sec-h"><h3>' + ic("key") + "Ce qu’elle peut faire</h3></div><div class=\"sec-b\"><ul style=\"margin-left:18px;line-height:1.8\"></ul>" +
          '<p class="muted" style="font-size:12.5px;margin-top:8px">Elle ne supprime rien et n’envoie aucun message à vos clients : c’est vous qui envoyez.</p></div></section></div>');
        $(".presente b", corps).textContent = a.prenom + " · " + a.poste;
        $(".presente p", corps).textContent = a.presentation || "";
        var v = $$(".ligne b", corps);
        v[0].textContent = a.fournisseur;
        v[1].textContent = a.modele || "—";
        v[2].textContent = (a.jetonsJour || 0).toLocaleString("fr-FR") + " / " + (a.limiteJetons || 0).toLocaleString("fr-FR") +
          (a.configure && !ADM.statutAgent(a).dispo ? " · atteint, reprend demain" : "");
        v[3].textContent = (a.jetonsMois || 0).toLocaleString("fr-FR") + " (" + (a.mois || 0) + " tâche" + ((a.mois || 0) > 1 ? "s" : "") + ")";
        v[4].textContent = a.coutMoisUsd != null ? a.coutMoisUsd + " $" : "voir le tableau de bord " + a.fournisseur;
        acces.forEach(function (x) { var li = h("<li></li>"); li.textContent = x; $("ul", corps).appendChild(li); });
        ADM.tiroir("Fiche de " + a.prenom, corps);
      }
    },
  });

  /* ======================================================================
     PROSPECTS : pipeline en colonnes
  ====================================================================== */
  var ST_PRO = [["a_contacter", "À contacter"], ["contacte", "Contacté"], ["en_discussion", "En discussion"], ["gagne", "Devenu client"], ["ecarte", "Écarté"]];
  var SECTEURS = ["Restaurants et maquis", "Instituts de beauté et ongleries", "Boutiques de mode", "Hôtels et résidences", "Écoles privées et centres de formation",
    "Salles de sport", "Pâtisseries et boulangeries", "Agences immobilières", "Organisateurs d’événements", "Cliniques et pharmacies"];
  var PRO = { vue: "colonnes", q: "" };
  function telDans(s) { var m = String(s || "").match(/(\+?\d[\d .()-]{7,}\d)/); return m ? m[1] : ""; }
  function emailDans(s) { var m = String(s || "").match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i); return m ? m[0] : ""; }
  function lienSur(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }

  ADM.vue("prospects", {
    titre: "Prospects",
    sous: "Votre pipeline commercial",
    rendu: function (params, panel) {
      api("/api/crm/prospects").then(function (tous) {
        panel.innerHTML = "";
        var bar = h('<div class="toolbar">' +
          '<button class="btn primary" data-a="trouver">' + ic("magnifying-glass-plus") + "Trouver des prospects</button>" +
          '<button class="btn soft" data-a="yann">' + ADM.avAgent("prospection", "sm") + "Demander à Yann</button>" +
          '<button class="btn" data-a="ajout">' + ic("plus") + 'Ajouter</button><span class="sp"></span>' +
          '<input type="search" placeholder="Rechercher un prospect…" aria-label="Rechercher">' +
          '<div class="segs" style="width:auto"><button data-v="colonnes">' + ic("kanban") + '</button><button data-v="liste">' + ic("list-bullets") + "</button></div></div>");
        panel.appendChild(bar);
        var zone = h("<div></div>");
        panel.appendChild(zone);
        var champ = $("input", bar);
        champ.value = PRO.q;
        $$("[data-v]", bar).forEach(function (b) {
          b.title = b.dataset.v === "colonnes" ? "Vue en colonnes" : "Vue en liste";
          b.classList.toggle("on", b.dataset.v === PRO.vue);
          b.addEventListener("click", function () { PRO.vue = b.dataset.v; $$("[data-v]", bar).forEach(function (x) { x.classList.toggle("on", x === b); }); dessiner(); });
        });
        var minuteur;
        champ.addEventListener("input", function () { clearTimeout(minuteur); minuteur = setTimeout(function () { PRO.q = champ.value.trim(); dessiner(); }, 200); });
        $('[data-a="trouver"]', bar).addEventListener("click", function () { trouver(); });
        $('[data-a="yann"]', bar).addEventListener("click", function () { ADM.ouvrirEquipe("prospection"); });
        $('[data-a="ajout"]', bar).addEventListener("click", function () { ajouter(); });

        function filtres() {
          var q = PRO.q.toLowerCase();
          return tous.filter(function (p) {
            return !q || [p.nom, p.secteur, p.ville, p.contactPublic, p.notes, p.constat].some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
          });
        }
        function carte(p) {
          var pot = { fort: "ok", moyen: "chaud" }[p.potentiel] || "";
          var c = h('<div class="pc" draggable="true" tabindex="0" data-id="' + esc(p._id) + '"><b></b><small></small><p></p><div class="l3"></div></div>');
          $("b", c).textContent = p.nom;
          $("small", c).textContent = [p.secteur, p.ville].filter(Boolean).join(" · ");
          if (p.constat) $("p", c).textContent = p.constat; else $("p", c).remove();
          var l3 = $(".l3", c);
          if (p.potentiel) l3.appendChild(h('<span class="pill ' + pot + '">potentiel ' + esc(p.potentiel) + "</span>"));
          if (p.source === "IA") l3.appendChild(h('<span class="pill bleu">' + ic("sparkle") + "Yann</span>"));
          if (p.audit) l3.appendChild(h('<span class="pill">' + ic("magnifying-glass") + "audité</span>"));
          if (p.relanceLe) l3.appendChild(h('<span class="pill ' + (p.relanceLe <= ADM.aujourdhui() ? "chaud" : "") + '">' + ic("arrow-bend-up-right") + esc(p.relanceLe.slice(8, 10) + "/" + p.relanceLe.slice(5, 7)) + "</span>"));
          if (!l3.children.length) l3.remove();
          c.addEventListener("click", function () { ouvrirFiche(p); });
          c.addEventListener("keydown", function (e) { if (e.key === "Enter") ouvrirFiche(p); });
          c.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", p._id); c.classList.add("drag"); });
          c.addEventListener("dragend", function () { c.classList.remove("drag"); });
          return c;
        }
        function dessiner() {
          zone.innerHTML = "";
          var l = filtres();
          if (!tous.length) {
            zone.appendChild(h('<div class="sec"><div class="empty">' + ic("target") + "Votre fichier est vide. Lancez une recherche : Yann vous trouvera des entreprises qui ont besoin de vous.<br><br>" +
              '<button class="btn primary">' + ic("magnifying-glass-plus") + "Trouver des prospects</button></div></div>"));
            $("button", zone).addEventListener("click", function () { trouver(); });
            return;
          }
          if (PRO.vue === "liste") {
            var t = h('<section class="sec"><div class="sec-b flush" style="overflow-x:auto"><table class="table"><thead><tr><th>Entreprise</th><th>Secteur</th><th>Étape</th><th>Potentiel</th><th>Relance</th></tr></thead><tbody></tbody></table></div></section>');
            l.forEach(function (p) {
              var tr = h('<tr style="cursor:pointer"><td><b></b><div class="faint" style="font-size:12px"></div></td><td></td><td></td><td></td><td></td></tr>');
              var td = $$("td", tr);
              $("b", td[0]).textContent = p.nom;
              $("div", td[0]).textContent = p.ville || "";
              td[1].textContent = p.secteur || "—";
              td[2].innerHTML = '<span class="pill">' + esc(ADM.libelle(ST_PRO, p.statut || "a_contacter")) + "</span>";
              td[3].textContent = p.potentiel || "—";
              td[4].textContent = p.relanceLe || "—";
              tr.addEventListener("click", function () { ouvrirFiche(p); });
              $("tbody", t).appendChild(tr);
            });
            if (!l.length) $("tbody", t).appendChild(h('<tr><td colspan="5" class="faint">Aucun prospect ne correspond.</td></tr>'));
            zone.appendChild(t);
            return;
          }
          var k = h('<div class="kanban"></div>');
          ST_PRO.forEach(function (s) {
            var dans = l.filter(function (p) { return (p.statut || "a_contacter") === s[0]; });
            var col = h('<div class="col" data-statut="' + s[0] + '"><div class="col-h"><span class="dot ' + (s[0] === "gagne" ? "ok" : s[0] === "ecarte" ? "ko" : "bleu") + '"></span><b></b><span class="n"></span></div><div class="col-b"></div></div>');
            $(".col-h b", col).textContent = s[1];
            $(".col-h .n", col).textContent = dans.length;
            dans.forEach(function (p) { $(".col-b", col).appendChild(carte(p)); });
            col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("survol"); });
            col.addEventListener("dragleave", function () { col.classList.remove("survol"); });
            col.addEventListener("drop", function (e) {
              e.preventDefault();
              col.classList.remove("survol");
              var id = e.dataTransfer.getData("text/plain");
              var p = tous.find(function (x) { return x._id === id; });
              if (!p || (p.statut || "a_contacter") === s[0]) return;
              p.statut = s[0];
              dessiner();
              api("/api/crm/prospects/" + id, { method: "PUT", body: { statut: s[0] } })
                .then(function () { ADM.toast(p.nom + " → " + s[1]); ADM.rafraichirCompteurs(); })
                .catch(function (er) { ADM.toast(er.message, "ko"); });
            });
            k.appendChild(col);
          });
          zone.appendChild(k);
        }

        function ouvrirFiche(p) {
          history.replaceState(null, "", "#prospects/" + p._id);
          var tel = telDans(p.contactPublic), mail = emailDans(p.contactPublic);
          var corps = h('<div><div class="qualif" style="margin-top:14px"></div>' +
            '<div data-z="textes"></div><div class="lecture-h" style="margin:12px 0 0" data-z="liens"></div>' +
            '<section class="sec" style="margin-top:14px"><div class="sec-h"><h3>' + ic("paper-plane-tilt") + "Message d’approche</h3></div><div class=\"sec-b\" style=\"padding-top:4px\">" +
            '<textarea data-k="messageApproche" rows="4" placeholder="Votre premier message à ce prospect"></textarea><div class="acts-l" data-z="envoi"></div></div></section>' +
            '<div data-z="audit"></div>' +
            '<section class="sec"><div class="sec-h"><h3>' + ic("funnel") + "Suivi</h3></div><div class=\"sec-b\" style=\"padding-top:2px\">" +
            '<div class="row2"><div><label>Étape</label><select data-k="statut">' + ADM.options(ST_PRO, p.statut || "a_contacter") + "</select></div>" +
            '<div><label>Montant si gagné (FCFA)</label><input data-k="valeur" type="number" min="0" step="1000"></div></div>' +
            '<div class="row2"><div><label>Relancer le</label><input data-k="relanceLe" type="date"></div><div><label>À faire à la relance</label><input data-k="relanceNote"></div></div>' +
            '<label>Notes privées</label><textarea data-k="notes" rows="3"></textarea>' +
            '<div class="formfoot" style="margin-top:14px"><button class="btn primary" data-a="sauver">Enregistrer</button>' +
            '<button class="btn soft" data-a="yann">' + ADM.avAgent("prospection", "sm") + "Demander à Yann</button>" +
            '<span style="flex:1"></span><button class="btn danger" data-a="suppr">' + ic("trash") + "Supprimer</button></div></div></section></div>");
          var q = $(".qualif", corps);
          [["Secteur", p.secteur], ["Ville", p.ville], ["Potentiel", p.potentiel], ["Source", p.source === "IA" ? "Trouvé par Yann" : "Ajouté à la main"]].forEach(function (x) {
            if (x[1]) { var s = h("<span><b></b><span></span></span>"); $("b", s).textContent = x[0]; $("span span", s).textContent = x[1]; q.appendChild(s); }
          });
          var tx = $('[data-z="textes"]', corps);
          [["Constat", p.constat], ["Votre angle", p.angle]].forEach(function (x) {
            if (!x[1]) return;
            var para = h('<p style="margin:8px 0;font-size:13.5px;line-height:1.6"><b></b> <span></span></p>');
            $("b", para).textContent = x[0] + " :"; $("span", para).textContent = x[1];
            tx.appendChild(para);
          });
          var li = $('[data-z="liens"]', corps);
          li.style.flexWrap = "wrap"; li.style.gap = "8px";
          if (lienSur(p.siteWeb)) li.appendChild(h('<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p.siteWeb) + '">' + ic("globe-simple") + "Site</a>"));
          if (lienSur(p.reseaux)) li.appendChild(h('<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p.reseaux) + '">' + ic("instagram-logo") + "Réseaux</a>"));
          if (tel) li.appendChild(h('<a class="btn sm" href="tel:+' + esc(waNum(tel)) + '">' + ic("phone") + esc(tel) + "</a>"));
          if (mail) li.appendChild(h('<a class="btn sm" href="mailto:' + esc(mail) + '">' + ic("envelope-simple") + esc(mail) + "</a>"));
          (p.sources || []).filter(lienSur).slice(0, 3).forEach(function (s, i) { li.appendChild(h('<a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(s) + '">' + ic("link-simple") + "Source " + (i + 1) + "</a>")); });
          if (!li.children.length) li.remove();

          var msg = $('[data-k="messageApproche"]', corps);
          ["messageApproche", "valeur", "relanceLe", "relanceNote", "notes"].forEach(function (k) { $('[data-k="' + k + '"]', corps).value = p[k] || ""; });
          var envoi = $('[data-z="envoi"]', corps);
          var bWa = tel ? h('<a class="btn wa" target="_blank" rel="noopener">' + ic("whatsapp-logo") + "Envoyer sur WhatsApp</a>") : null;
          var bMail = mail ? h('<a class="btn">' + ic("envelope-simple") + "Envoyer par email</a>") : null;
          var bCopie = h('<button class="btn">' + ic("copy") + "Copier</button>");
          [bWa, bMail, bCopie].forEach(function (b) { if (b) envoi.appendChild(b); });
          function majLiens() {
            if (bWa) bWa.href = "https://wa.me/" + waNum(tel) + "?text=" + encodeURIComponent(msg.value);
            if (bMail) bMail.href = "mailto:" + encodeURIComponent(mail) + "?subject=" + encodeURIComponent("Votre communication sur les réseaux") + "&body=" + encodeURIComponent(msg.value);
          }
          msg.addEventListener("input", majLiens);
          majLiens();
          bCopie.addEventListener("click", function () { ADM.copier(msg.value); });
          [bWa, bMail].forEach(function (b) {
            if (!b) return;
            b.addEventListener("click", function () {
              if ((p.statut || "a_contacter") !== "a_contacter") return;
              var d = ADM.ajouterJours(ADM.aujourdhui(), 3);
              api("/api/crm/prospects/" + p._id, { method: "PUT", body: { statut: "contacte", messageApproche: msg.value, relanceLe: d, relanceNote: "Relancer si pas de réponse" } })
                .then(function (n) { Object.assign(p, n); $('[data-k="statut"]', corps).value = "contacte"; $('[data-k="relanceLe"]', corps).value = d; dessiner(); ADM.toast("Passé en « Contacté », relance le " + d); });
            });
          });

          function rendreAudit() {
            var z = $('[data-z="audit"]', corps);
            z.innerHTML = "";
            var a = p.audit;
            var s = h('<section class="diag"><div class="diag-h">' + ADM.avAgent("prospection", "sm") + "<b>Audit de présence en ligne</b><span style=\"flex:1\"></span>" +
              '<button class="btn ' + (a ? "ghost sm" : "primary sm") + '">' + ic(a ? "arrow-clockwise" : "magnifying-glass") + (a ? "Refaire" : "Demander l’audit à Yann") + "</button></div></section>");
            if (!a) s.appendChild(h('<p class="muted">Yann visite le site, la fiche Google et les réseaux de cette entreprise, puis vous dit ce qui cloche et ce que vous pouvez lui apporter.</p>'));
            else {
              s.appendChild(h("<p></p>")).textContent = a.resume || "";
              if ((a.presence || []).length) {
                var ul = h("<ul></ul>");
                a.presence.forEach(function (x) { var li2 = h("<li><b></b> </li>"); $("b", li2).textContent = x.canal + " :"; li2.appendChild(document.createTextNode(" " + x.constat)); ul.appendChild(li2); });
                s.appendChild(ul);
              }
              [["problemes", "Problèmes"], ["opportunites", "Ce que vous pouvez lui apporter"]].forEach(function (x) {
                if (!(a[x[0]] || []).length) return;
                s.appendChild(h("<p><b>" + x[1] + " :</b></p>"));
                var ul2 = h("<ul></ul>");
                a[x[0]].forEach(function (t) { var li3 = h("<li></li>"); li3.textContent = t; ul2.appendChild(li3); });
                s.appendChild(ul2);
              });
              if (a.formuleConseillee) { var f = h("<p><b>Formule conseillée :</b> <span></span></p>"); $("span", f).textContent = a.formuleConseillee; s.appendChild(f); }
              var note = h('<div class="diag-note"></div>');
              note.textContent = "Audit réalisé par Yann, " + ADM.dateRel(a.auditeLe) + " : vérifiez avant de vous en servir.";
              s.appendChild(note);
            }
            $("button", s).addEventListener("click", function () {
              var fin = ADM.attente(this, "Yann audite… (1 à 2 min)");
              api("/api/crm/ia/audit/" + p._id, { method: "POST" }).then(function (n) {
                fin(); Object.assign(p, n); rendreAudit(); dessiner(); ADM.toast("Audit terminé");
                if (!msg.value && p.audit && p.audit.messageApproche) { msg.value = p.audit.messageApproche; majLiens(); }
              }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
            });
            z.appendChild(s);
          }
          rendreAudit();

          $('[data-a="sauver"]', corps).addEventListener("click", function () {
            var body = {};
            $$("[data-k]", corps).forEach(function (i) { body[i.dataset.k] = i.value; });
            var fin = ADM.attente(this);
            api("/api/crm/prospects/" + p._id, { method: "PUT", body: body }).then(function (n) {
              fin(); Object.assign(p, n); dessiner(); ADM.toast("Prospect enregistré"); ADM.rafraichirCompteurs();
            }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
          });
          $('[data-a="yann"]', corps).addEventListener("click", function () {
            ADM.ouvrirEquipe("prospection", { contexte: { type: "prospect", id: p._id, label: "Prospect " + p.nom }, texte: "Que me conseilles-tu pour décrocher ce client ?" });
          });
          $('[data-a="suppr"]', corps).addEventListener("click", function () {
            if (!confirm("Supprimer « " + p.nom + " » de vos prospects ? Cette action est irréversible.")) return;
            api("/api/crm/prospects/" + p._id, { method: "DELETE" }).then(function () {
              tous = tous.filter(function (x) { return x._id !== p._id; });
              ADM.toutFermer(); dessiner(); ADM.toast("Prospect supprimé"); ADM.rafraichirCompteurs();
            });
          });
          ADM.tiroir(p.nom, corps, { surFermer: function () { history.replaceState(null, "", "#prospects"); } });
        }

        function trouver() {
          var f = h('<div><p class="muted" style="font-size:13.5px;margin-top:12px">Yann cherche sur le web des entreprises qui ont besoin d’une social media manager, explique ce qui cloche dans leur communication et prépare un premier message.</p>' +
            '<label>Secteur visé</label><input data-k="secteur" list="secteursPA" placeholder="ex : Instituts de beauté"><datalist id="secteursPA">' +
            SECTEURS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + "</datalist>" +
            '<div class="row2"><div><label>Zone</label><input data-k="zone" value="Libreville, Gabon"></div>' +
            '<div><label>Nombre</label><select data-k="nombre"><option>3</option><option selected>5</option><option>8</option><option>10</option></select></div></div>' +
            '<label>Consignes <span class="help">(facultatif)</span></label><input data-k="consignes" placeholder="ex : plutôt des marques récentes, quartier Louis">' +
            '<div class="formfoot"><button class="btn primary" data-a="go">' + ic("sparkle") + "Lancer la recherche</button></div><div data-z=\"etat\"></div></div>");
          var m = ADM.modale("Trouver de nouveaux clients", f);
          $('[data-a="go"]', f).addEventListener("click", function () {
            var body = {};
            $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
            var fin = ADM.attente(this, "Recherche en cours…");
            $('[data-z="etat"]', f).innerHTML = '<div class="hint" style="margin-top:14px">' + ADM.avAgent("prospection", "sm") + "<div>Yann cherche sur le web : comptez une à trois minutes. Vous pouvez laisser cette fenêtre ouverte.</div></div>";
            api("/api/crm/ia/prospection", { method: "POST", body: body }).then(function (r) {
              fin(); m.fermer();
              ADM.toast(r.ajoutes.length + " prospect(s) ajouté(s)" + (r.ignores ? ", " + r.ignores + " déjà connu(s)" : ""));
              api("/api/crm/prospects").then(function (l) {
                tous = l; dessiner(); ADM.rafraichirCompteurs();
                if (r.bilan) panel.insertBefore(h('<div class="hint ok">' + ic("check-circle") + "<div></div></div>"), zone).querySelector("div").textContent = r.bilan;
              });
            }).catch(function (e) { fin(); $('[data-z="etat"]', f).innerHTML = ""; ADM.toast(e.message, "ko"); });
          });
        }

        function ajouter() {
          var f = h('<div><div class="row2"><div><label>Nom de l’entreprise</label><input data-k="nom"></div><div><label>Secteur</label><input data-k="secteur"></div></div>' +
            '<div class="row2"><div><label>Ville</label><input data-k="ville" value="Libreville"></div><div><label>Téléphone ou email pro</label><input data-k="contactPublic"></div></div>' +
            '<div class="row2"><div><label>Site web</label><input data-k="siteWeb" placeholder="https://"></div><div><label>Réseaux sociaux</label><input data-k="reseaux" placeholder="https://"></div></div>' +
            '<label>Notes</label><textarea data-k="notes" rows="3"></textarea><div class="formfoot"><button class="btn primary">Ajouter</button></div></div>');
          var m = ADM.modale("Nouveau prospect", f);
          $("button", f).addEventListener("click", function () {
            var body = {};
            $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value.trim(); });
            api("/api/crm/prospects", { method: "POST", body: body }).then(function (p) {
              m.fermer(); tous.unshift(p); dessiner(); ADM.toast("Prospect ajouté"); ADM.rafraichirCompteurs();
            }).catch(function (e) { ADM.toast(e.message, "ko"); });
          });
        }

        dessiner();
        if (params[0] === "trouver") trouver();
        else if (params[0]) { var p = tous.find(function (x) { return x._id === params[0]; }); if (p) ouvrirFiche(p); }
      }).catch(ADM.erreur(panel));
    },
  });

  /* ======================================================================
     AGENDA : vue semaine + disponibilités
  ====================================================================== */
  var JOURS_COURTS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
  var NOMS_JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  var ST_RDV = { confirme: ["Confirmé", "bleu"], a_confirmer: ["À confirmer", "chaud"], annule: ["Annulé", "ko"], fait: ["Fait", "ok"] };
  var AG = { lundi: null };
  var H_LIGNE = 52;
  function lundiDe(j) { var d = new Date(j + "T12:00:00Z"); var w = (d.getUTCDay() + 6) % 7; return ADM.ajouterJours(j, -w); }
  function minutesDe(iso) { var d = new Date(new Date(iso).getTime() + 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }

  ADM.nouveauRdv = function (pre) { formRdv(null, pre || {}); };

  function formRdv(x, pre) {
    var v = x ? { titre: x.titre, avec: x.avec, jour: x.local.jour, heure: x.local.heure, dureeMin: x.dureeMin, lieu: x.lieu, email: x.email, telephone: x.telephone, notes: x.notes, statut: x.statut }
      : Object.assign({ titre: "Rendez-vous", jour: ADM.aujourdhui(), heure: "10:00", dureeMin: 30 }, pre || {});
    var f = h('<div><div class="row2"><div><label>Objet</label><input data-k="titre" placeholder="ex : Appel découverte"></div><div><label>Avec</label><input data-k="avec" placeholder="Nom ou marque"></div></div>' +
      '<div class="row2"><div><label>Date</label><input data-k="jour" type="date"></div><div><label>Heure (Libreville)</label><input data-k="heure" type="time" step="300"></div></div>' +
      '<div class="row2"><div><label>Durée (min)</label><input data-k="dureeMin" type="number" min="5" step="5"></div><div><label>Lieu ou lien</label><input data-k="lieu" placeholder="WhatsApp, Google Meet, adresse…"></div></div>' +
      '<div class="row2"><div><label>Email</label><input data-k="email" type="email"></div><div><label>Téléphone</label><input data-k="telephone"></div></div>' +
      (x ? '<label>Statut</label><select data-k="statut">' + ADM.options([["confirme", "Confirmé"], ["a_confirmer", "À confirmer"], ["fait", "Fait"], ["annule", "Annulé"]], x.statut) + "</select>" : "") +
      '<label>Notes</label><textarea data-k="notes" rows="3"></textarea><div class="formfoot"><button class="btn primary">Enregistrer</button></div></div>');
    $$("[data-k]", f).forEach(function (i) { if (v[i.dataset.k] != null) i.value = v[i.dataset.k]; });
    var m = ADM.modale(x ? "Modifier le rendez-vous" : "Nouveau rendez-vous", f);
    $(".formfoot button", f).addEventListener("click", function () {
      var b = {};
      $$("[data-k]", f).forEach(function (i) { b[i.dataset.k] = i.value.trim(); });
      if (!b.jour || !b.heure) return ADM.toast("Date et heure obligatoires", "ko");
      b.debutLocal = b.jour + "T" + b.heure;
      delete b.jour; delete b.heure;
      api(x ? "/api/crm/rdv/" + x._id : "/api/crm/rdv", { method: x ? "PUT" : "POST", body: b }).then(function () {
        m.fermer();
        ADM.toast(x ? "Rendez-vous modifié" : "Rendez-vous ajouté");
        ADM.rafraichirCompteurs();
        if (ADM.route().base === "agenda") { AG.lundi = lundiDe(v.jour && !x ? b.debutLocal.slice(0, 10) : b.debutLocal.slice(0, 10)); ADM.rendre(); }
      }).catch(function (e) { ADM.toast(e.message, "ko"); });
    });
  }

  function ficheRdv(x, recharger) {
    var st = ST_RDV[x.statut] || [x.statut, ""];
    var tel = waNum(x.telephone);
    var conf = "Bonjour " + (x.avec || "") + ", c’est Paule Ackerman. Je vous confirme notre rendez-vous " + x.quand + (x.lieu ? " (" + x.lieu + ")" : "") + ". À très vite !";
    var corps = h('<div><div class="qualif" style="margin-top:14px"></div><div class="corps" style="white-space:normal"></div><div class="acts-l" data-z="a"></div>' +
      '<div class="formfoot" style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px" data-z="b"></div></div>');
    var q = $(".qualif", corps);
    [["Quand", x.quand], ["Durée", (x.dureeMin || 30) + " min"], ["Statut", st[0]], ["Origine", x.source === "site" ? "Réservé sur le site" : x.source === "assistant IA" ? "Créé par Awa" : "Ajouté à la main"]].forEach(function (y) {
      var s = h("<span><b></b><span></span></span>"); $("b", s).textContent = y[0]; $("span span", s).textContent = y[1]; q.appendChild(s);
    });
    var c = $(".corps", corps);
    var lignes = [];
    if (x.lieu) lignes.push(ic("map-pin") + " " + esc(x.lieu));
    if (x.email) lignes.push(ic("envelope-simple") + ' <a href="mailto:' + esc(x.email) + '">' + esc(x.email) + "</a>");
    if (x.telephone) lignes.push(ic("phone") + ' <a href="tel:+' + esc(tel) + '">' + esc(x.telephone) + "</a>");
    if (x.notes) lignes.push(ic("note") + " " + esc(x.notes));
    c.innerHTML = lignes.length ? lignes.join("<br>") : '<span class="faint">Aucun détail.</span>';
    var a = $('[data-z="a"]', corps);
    function maj(patch, msg) {
      api("/api/crm/rdv/" + x._id, { method: "PUT", body: patch }).then(function () { ADM.toast(msg); ADM.toutFermer(); ADM.rafraichirCompteurs(); recharger(); })
        .catch(function (e) { ADM.toast(e.message, "ko"); });
    }
    if (x.statut === "a_confirmer") {
      var b1 = h('<button class="btn primary">' + ic("check") + "Confirmer</button>");
      b1.addEventListener("click", function () { maj({ statut: "confirme" }, "Rendez-vous confirmé"); });
      a.appendChild(b1);
      if (tel) a.appendChild(h('<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + tel + "?text=" + encodeURIComponent(conf) + '">' + ic("whatsapp-logo") + "Prévenir sur WhatsApp</a>"));
      if (x.email) a.appendChild(h('<a class="btn" href="mailto:' + encodeURIComponent(x.email) + "?subject=" + encodeURIComponent("Confirmation de notre rendez-vous") + "&body=" + encodeURIComponent(conf) + '">' + ic("envelope-simple") + "Prévenir par email</a>"));
    }
    if (x.statut !== "fait" && x.statut !== "annule") {
      var b2 = h('<button class="btn">' + ic("check-circle") + "Marquer fait</button>");
      b2.addEventListener("click", function () { maj({ statut: "fait" }, "Rendez-vous marqué comme fait"); });
      var b3 = h('<button class="btn">' + ic("x-circle") + "Annuler</button>");
      b3.addEventListener("click", function () { if (confirm("Annuler ce rendez-vous ?")) maj({ statut: "annule" }, "Rendez-vous annulé"); });
      a.appendChild(b2); a.appendChild(b3);
    }
    var b = $('[data-z="b"]', corps);
    var be = h('<button class="btn">' + ic("pencil-simple") + "Modifier</button>");
    be.addEventListener("click", function () { ADM.toutFermer(); formRdv(x); });
    var ba = h('<button class="btn soft">' + ADM.avAgent("agenda", "sm") + "Demander à Awa</button>");
    ba.addEventListener("click", function () { ADM.ouvrirEquipe("agenda", { contexte: { type: "rdv", id: x._id, label: "Rendez-vous avec " + (x.avec || "") } }); });
    var bs = h('<button class="btn danger">' + ic("trash") + "Supprimer</button>");
    bs.addEventListener("click", function () {
      if (!confirm("Supprimer définitivement ce rendez-vous ?")) return;
      api("/api/crm/rdv/" + x._id, { method: "DELETE" }).then(function () { ADM.toast("Rendez-vous supprimé"); ADM.toutFermer(); ADM.rafraichirCompteurs(); recharger(); });
    });
    b.appendChild(be); b.appendChild(ba); b.appendChild(h('<span style="flex:1"></span>')); b.appendChild(bs);
    ADM.tiroir((x.titre || "Rendez-vous") + " · " + (x.avec || ""), corps, { surFermer: function () { if (ADM.route().base === "agenda") history.replaceState(null, "", "#agenda"); } });
  }

  function formDispos(cfg, recharger) {
    var s = h('<div><p class="muted" style="font-size:13.5px;margin-top:12px">Vos visiteurs réservent un appel découverte depuis la messagerie du site, sur vos créneaux libres. Chaque réservation arrive dans l’agenda « à confirmer ».</p>' +
      '<label class="check"><input type="checkbox" data-k="actif"> Proposer la réservation d’appel sur le site</label>' +
      '<div class="row2"><div><label>Durée d’un appel (min)</label><input data-k="dureeAppel" type="number" min="10" max="120" step="5"></div>' +
      '<div><label>Délai minimum avant un appel (h)</label><input data-k="delaiMinHeures" type="number" min="0" max="168"></div></div>' +
      '<div class="row2"><div><label>Réservable sur (jours)</label><input data-k="joursAVenir" type="number" min="1" max="60"></div>' +
      '<div><label>Lieu de l’appel</label><input data-k="lieuAppel"></div></div>' +
      '<label>Plages horaires (heure de Libreville)</label><div data-z="plages"></div>' +
      '<button class="btn sm" data-a="plage" style="margin-top:4px">' + ic("plus") + "Ajouter une plage</button>" +
      '<div class="formfoot"><button class="btn primary" data-a="sauver">Enregistrer</button></div></div>');
    $('[data-k="actif"]', s).checked = cfg.actif !== false;
    ["dureeAppel", "delaiMinHeures", "joursAVenir", "lieuAppel"].forEach(function (k) { $('[data-k="' + k + '"]', s).value = cfg[k] != null ? cfg[k] : ""; });
    var box = $('[data-z="plages"]', s);
    function plage(p) {
      var r = h('<div class="plage"><select>' + [1, 2, 3, 4, 5, 6, 0].map(function (j) { return '<option value="' + j + '">' + NOMS_JOURS[j] + "</option>"; }).join("") +
        '</select><input type="time" class="pd"><input type="time" class="pf"><button class="icobtn danger" aria-label="Retirer">' + ic("x") + "</button></div>");
      $("select", r).value = String(p.jour);
      $(".pd", r).value = p.debut; $(".pf", r).value = p.fin;
      $("button", r).addEventListener("click", function () { r.remove(); });
      box.appendChild(r);
    }
    (cfg.plages || []).forEach(plage);
    $('[data-a="plage"]', s).addEventListener("click", function () { plage({ jour: 1, debut: "09:00", fin: "12:00" }); });
    var t = ADM.tiroir("Disponibilités", s);
    $('[data-a="sauver"]', s).addEventListener("click", function () {
      var plages = $$(".plage", box).map(function (r) { return { jour: Number($("select", r).value), debut: $(".pd", r).value, fin: $(".pf", r).value }; });
      api("/api/crm/agenda-reglages", { method: "PUT", body: {
        actif: $('[data-k="actif"]', s).checked, dureeAppel: $('[data-k="dureeAppel"]', s).value, delaiMinHeures: $('[data-k="delaiMinHeures"]', s).value,
        joursAVenir: $('[data-k="joursAVenir"]', s).value, lieuAppel: $('[data-k="lieuAppel"]', s).value, plages: plages,
      } }).then(function (n) {
        var ecartees = plages.length - (n.plages || []).length;
        ADM.toast("Disponibilités enregistrées" + (ecartees ? " (" + ecartees + " plage(s) invalide(s) ignorée(s))" : ""));
        t.fermer(); recharger();
      }).catch(function (e) { ADM.toast(e.message, "ko"); });
    });
  }

  ADM.vue("agenda", {
    titre: "Agenda",
    sous: "Rendez-vous, disponibilités et réservations du site",
    rendu: function (params, panel) {
      var cible = params[0] === "rdv" ? params[1] : "";
      if (!AG.lundi) AG.lundi = lundiDe(ADM.aujourdhui());

      function charger() {
        var dim = ADM.ajouterJours(AG.lundi, 6);
        var url = cible ? "/api/crm/rdv?du=" + ADM.ajouterJours(ADM.aujourdhui(), -120) + "&au=" + ADM.ajouterJours(ADM.aujourdhui(), 365) : "/api/crm/rdv?du=" + AG.lundi + "&au=" + dim;
        return Promise.all([api(url), api("/api/crm/agenda-reglages")]).then(function (r) {
          var rdvs = r[0], cfg = r[1];
          if (cible) {
            var x = rdvs.find(function (y) { return y._id === cible; });
            cible = "";
            if (x) {
              AG.lundi = lundiDe(x.local.jour);
              return charger().then(function () { ficheRdv(x, charger); });
            }
          }
          dessiner(rdvs.filter(function (y) { return y.local.jour >= AG.lundi && y.local.jour <= dim; }), cfg);
        }).catch(ADM.erreur(panel));
      }

      function dessiner(rdvs, cfg) {
        panel.innerHTML = "";
        var dim = ADM.ajouterJours(AG.lundi, 6);
        var debutD = new Date(AG.lundi + "T12:00:00Z"), finD = new Date(dim + "T12:00:00Z");
        var titre = debutD.getUTCMonth() === finD.getUTCMonth()
          ? debutD.getUTCDate() + " – " + finD.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
          : debutD.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }) + " – " + finD.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        var bar = h('<div class="toolbar"><button class="btn ico" data-a="prec" aria-label="Semaine précédente">' + ic("caret-left") + "</button>" +
          '<button class="btn" data-a="auj">Aujourd’hui</button><button class="btn ico" data-a="suiv" aria-label="Semaine suivante">' + ic("caret-right") + "</button>" +
          '<b style="font-size:16px;margin-left:6px"></b><span class="sp"></span>' +
          '<button class="btn" data-a="dispos">' + ic("clock") + "Disponibilités</button>" +
          '<button class="btn soft" data-a="awa">' + ADM.avAgent("agenda", "sm") + "Demander à Awa</button>" +
          '<button class="btn primary" data-a="nouveau">' + ic("plus") + "Rendez-vous</button></div>");
        $("b", bar).textContent = titre;
        $('[data-a="prec"]', bar).addEventListener("click", function () { AG.lundi = ADM.ajouterJours(AG.lundi, -7); charger(); });
        $('[data-a="suiv"]', bar).addEventListener("click", function () { AG.lundi = ADM.ajouterJours(AG.lundi, 7); charger(); });
        $('[data-a="auj"]', bar).addEventListener("click", function () { AG.lundi = lundiDe(ADM.aujourdhui()); charger(); });
        $('[data-a="dispos"]', bar).addEventListener("click", function () { formDispos(cfg, charger); });
        $('[data-a="awa"]', bar).addEventListener("click", function () { ADM.ouvrirEquipe("agenda"); });
        $('[data-a="nouveau"]', bar).addEventListener("click", function () { formRdv(null, {}); });
        panel.appendChild(bar);

        var aConf = rdvs.filter(function (r) { return r.statut === "a_confirmer"; }).length;
        if (aConf) panel.appendChild(h('<div class="hint alerte">' + ic("calendar-check") + "<div>" + aConf + " rendez-vous réservé" + (aConf > 1 ? "s" : "") + " sur le site attend" + (aConf > 1 ? "ent" : "") + " votre confirmation cette semaine.</div></div>"));
        if (cfg.actif === false) panel.appendChild(h('<div class="hint">' + ic("info") + "<div>La réservation d’appel est désactivée sur le site. Activez-la dans « Disponibilités ».</div></div>"));

        if (innerWidth <= 900) return dessinerListe(rdvs);

        var hDeb = 8, hFin = 19;
        (cfg.plages || []).forEach(function (p) { hDeb = Math.min(hDeb, Number(p.debut.slice(0, 2))); hFin = Math.max(hFin, Math.ceil(Number(p.fin.slice(0, 2)) + Number(p.fin.slice(3)) / 60)); });
        rdvs.forEach(function (r) { var m = minutesDe(r.debut); hDeb = Math.min(hDeb, Math.floor(m / 60)); hFin = Math.max(hFin, Math.ceil((m + (r.dureeMin || 30)) / 60)); });
        hFin = Math.min(24, hFin);
        var auj = ADM.aujourdhui();
        var sem = h('<div class="semaine"><div class="sem-h"><div></div></div><div class="sem-b"><div class="sem-heures"></div></div></div>');
        var tete = $(".sem-h", sem), corps = $(".sem-b", sem), heures = $(".sem-heures", corps);
        for (var hh = hDeb; hh < hFin; hh++) heures.appendChild(h("<div>" + (hh === hDeb ? "" : hh + " h") + "</div>"));
        for (var i = 0; i < 7; i++) {
          var j = ADM.ajouterJours(AG.lundi, i);
          var th = h('<div class="' + (j === auj ? "auj" : "") + '">' + JOURS_COURTS[i] + "<b>" + Number(j.slice(8, 10)) + "</b></div>");
          tete.appendChild(th);
          var col = h('<div class="sem-jour' + (j === auj ? " auj" : "") + '"></div>');
          var js = (i + 1) % 7;
          (cfg.plages || []).filter(function (p) { return Number(p.jour) === js; }).forEach(function (p) {
            var a = (Number(p.debut.slice(0, 2)) * 60 + Number(p.debut.slice(3))) - hDeb * 60;
            var b = (Number(p.fin.slice(0, 2)) * 60 + Number(p.fin.slice(3))) - hDeb * 60;
            col.appendChild(h('<div class="dispo" style="top:' + (a / 60 * H_LIGNE) + "px;height:" + ((b - a) / 60 * H_LIGNE) + 'px"></div>'));
          });
          for (var hh2 = hDeb; hh2 < hFin; hh2++) {
            (function (jour, heure) {
              var cr = h('<div class="creneau" title="Ajouter un rendez-vous"></div>');
              cr.addEventListener("click", function () { formRdv(null, { jour: jour, heure: (heure < 10 ? "0" : "") + heure + ":00" }); });
              col.appendChild(cr);
            })(j, hh2);
          }
          rdvs.filter(function (r) { return r.local.jour === j; }).forEach(function (r) {
            var m = minutesDe(r.debut) - hDeb * 60;
            var ev = h('<div class="ev ' + esc(r.statut || "") + '" tabindex="0" style="top:' + (m / 60 * H_LIGNE + 1) + "px;height:" + Math.max(24, (r.dureeMin || 30) / 60 * H_LIGNE - 3) + 'px"><b></b><span></span></div>');
            $("b", ev).textContent = r.local.heure + " · " + (r.avec || r.titre || "");
            $("span", ev).textContent = r.titre || "";
            ev.addEventListener("click", function (e) { e.stopPropagation(); ficheRdv(r, charger); });
            ev.addEventListener("keydown", function (e) { if (e.key === "Enter") ficheRdv(r, charger); });
            col.appendChild(ev);
          });
          if (j === auj) {
            var maint = minutesDe(new Date().toISOString()) - hDeb * 60;
            if (maint >= 0 && maint <= (hFin - hDeb) * 60) col.appendChild(h('<div class="maintenant" style="top:' + (maint / 60 * H_LIGNE) + 'px"></div>'));
          }
          corps.appendChild(col);
        }
        panel.appendChild(sem);
        panel.appendChild(h('<p class="faint" style="font-size:12px;margin-top:10px">Zones bleutées : vos disponibilités pour les appels réservés sur le site. Cliquez sur une case pour ajouter un rendez-vous.</p>'));
      }

      function dessinerListe(rdvs) {
        var box = h('<div class="liste-rdv"></div>');
        if (!rdvs.length) box.appendChild(h('<div class="sec"><div class="empty">' + ic("calendar-blank") + "Aucun rendez-vous cette semaine.</div></div>"));
        var jour = "", sec = null;
        rdvs.forEach(function (r) {
          if (r.local.jour !== jour) {
            jour = r.local.jour;
            box.appendChild(h('<div class="jour-t">' + esc(ADM.jourLong(jour)) + "</div>"));
            sec = h('<section class="sec" style="margin-bottom:6px"></section>');
            box.appendChild(sec);
          }
          var st = ST_RDV[r.statut] || [r.statut, ""];
          var l = h('<div class="ligne cliquable"><b class="mono" style="min-width:48px"></b><div class="grow"><b></b><small></small></div><span class="pill ' + st[1] + '">' + esc(st[0]) + "</span></div>");
          $("b.mono", l).textContent = r.local.heure;
          $(".grow b", l).textContent = (r.titre || "Rendez-vous") + " · " + (r.avec || "");
          $(".grow small", l).textContent = (r.dureeMin || 30) + " min" + (r.lieu ? " · " + r.lieu : "");
          l.addEventListener("click", function () { ficheRdv(r, charger); });
          sec.appendChild(l);
        });
        panel.appendChild(box);
      }

      charger();
    },
  });
})();
