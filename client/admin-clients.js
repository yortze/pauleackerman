/* =========================================================================
   Espace pro de Paule — Clients, devis et factures, finances.
   ========================================================================= */
(function () {
  "use strict";
  var ADM = window.ADM, h = ADM.h, ic = ADM.ic, $$ = ADM.$$;

  var ST_CLIENT = [["actif", "Actif"], ["pause", "En pause"], ["termine", "Terminé"]];
  var ST_DOC = {
    brouillon: ["Brouillon", ""], envoye: ["Envoyé", "bleu"], accepte: ["Accepté", "ok"], refuse: ["Refusé", "ko"],
    envoyee: ["Envoyée", "bleu"], partielle: ["Payée en partie", "chaud"], payee: ["Payée", "ok"], annulee: ["Annulée", "ko"],
  };
  var MODES = ["Mobile Money", "Virement", "Espèces", "Chèque", "Carte", "Autre"];

  function lienPublic(j) { return location.origin + "/lien/" + j; }
  ADM.lienPublic = lienPublic;
  function libMois(m) { return new Date(m + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
  ADM.libMois = libMois;
  function jourCourt(j) { return j ? new Date(j + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""; }
  ADM.jourCourt = jourCourt;
  function pillDoc(d) {
    var s = d.enRetard ? ["En retard", "ko"] : ST_DOC[d.statut] || [d.statut, ""];
    return '<span class="pill ' + s[1] + '">' + esc(s[0]) + "</span>";
  }
  function nomDoc(d) { return (d.type === "devis" ? "Devis " : "Facture ") + (d.numero || "(brouillon)"); }
  function nombreSaisi(v) { return Number(String(v || "").replace(/[\s  ]/g, "").replace(",", ".")) || 0; }

  /* ----------------------------------------------------------------------
     Clients en cache (listes déroulantes du calendrier, des coûts…)
  ---------------------------------------------------------------------- */
  var cacheClients = null;
  ADM.listeClients = function (frais) {
    if (!cacheClients || frais) cacheClients = api("/api/crm/clients").catch(function (e) { cacheClients = null; throw e; });
    return cacheClients;
  };
  ADM.optionsClients = function (liste, choisi, vide) {
    return (vide ? '<option value="">' + esc(vide) + "</option>" : "") + liste.filter(function (c) { return c.statut !== "termine" || c._id === choisi; })
      .map(function (c) { return '<option value="' + esc(c._id) + '"' + (c._id === choisi ? " selected" : "") + ">" + esc(c.nom) + "</option>"; }).join("");
  };

  /* ----------------------------------------------------------------------
     Partager un lien avec un client (WhatsApp, email, copie)
     o : { titre, url, telephone, email, message, sujet }
  ---------------------------------------------------------------------- */
  ADM.partager = function (o) {
    var tel = waNum(o.telephone);
    var corps = h('<div><p class="muted" style="font-size:13px;margin-top:12px"></p>' +
      '<label>Le lien</label><div style="display:flex;gap:8px"><input readonly data-k="url"><button class="btn" data-a="copier">' + ic("copy") + "Copier</button></div>" +
      '<label>Message</label><textarea data-k="msg" rows="4"></textarea>' +
      '<div class="acts-l" style="margin-top:12px"><a class="btn wa" data-a="wa" target="_blank" rel="noopener">' + ic("whatsapp-logo") + "<span></span></a>" +
      '<a class="btn" data-a="mail">' + ic("envelope-simple") + "Email</a>" +
      '<a class="btn ghost" data-a="ouvrir" target="_blank" rel="noopener">' + ic("arrow-square-out") + "Ouvrir</a></div></div>");
    $("p", corps).textContent = o.aide || "Envoyez ce lien à votre client : il l’ouvre sur son téléphone, sans compte ni mot de passe.";
    var url = $('[data-k="url"]', corps), msg = $('[data-k="msg"]', corps);
    url.value = o.url;
    msg.value = (o.message || "Bonjour, voici le lien :") + " " + o.url;
    $('[data-a="wa"] span', corps).textContent = tel ? "Envoyer sur WhatsApp" : "Partager sur WhatsApp";
    function maj() {
      $('[data-a="wa"]', corps).href = "https://wa.me/" + (tel || "") + "?text=" + encodeURIComponent(msg.value);
      $('[data-a="mail"]', corps).href = "mailto:" + encodeURIComponent(o.email || "") + "?subject=" + encodeURIComponent(o.sujet || o.titre || "") + "&body=" + encodeURIComponent(msg.value);
    }
    msg.addEventListener("input", maj);
    maj();
    $('[data-a="ouvrir"]', corps).href = o.url;
    $('[data-a="copier"]', corps).addEventListener("click", function () { ADM.copier(o.url); });
    if (!o.email) $('[data-a="mail"]', corps).remove();
    ADM.modale(o.titre || "Partager", corps);
  };

  /* ======================================================================
     CLIENTS : liste et fiche
  ====================================================================== */
  var CL = { filtre: "actifs", q: "" };

  ADM.vue("clients", {
    titre: "Clients",
    sous: "Vos clients, leurs contrats, devis, factures et liens",
    rendu: function (params, panel) {
      if (params[0]) return ficheClient(params[0], params[1] || "apercu", panel);
      listeClients(panel);
    },
  });

  function listeClients(panel) {
    Promise.all([ADM.listeClients(true), api("/api/crm/avis-recus").catch(function () { return []; })]).then(function (r) {
      var tous = r[0], avis = r[1];
      var aValider = avis.filter(function (a) { return a.statut === "a_valider"; }).length;
      panel.innerHTML = "";
      var bar = h('<div class="toolbar"><button class="btn primary" data-a="nouveau">' + ic("user-plus") + "Nouveau client</button>" +
        '<button class="btn" data-a="avis">' + ic("star") + "Avis reçus" + (aValider ? ' <span class="pill chaud">' + aValider + "</span>" : "") + "</button>" +
        '<button class="btn" data-a="modeles">' + ic("chat-text") + "Modèles de messages</button>" +
        '<span class="sp"></span><input type="search" placeholder="Rechercher un client…" aria-label="Rechercher">' +
        '<div class="segs" style="width:auto">' + [["actifs", "En cours"], ["tous", "Tous"], ["termine", "Terminés"]].map(function (f) {
          return '<button data-f="' + f[0] + '"' + (CL.filtre === f[0] ? ' class="on"' : "") + ">" + f[1] + "</button>";
        }).join("") + "</div></div>");
      panel.appendChild(bar);
      var zone = h('<div class="cl-grille"></div>');
      panel.appendChild(zone);
      var champ = $("input", bar);
      champ.value = CL.q;
      champ.addEventListener("input", function () { CL.q = champ.value.trim().toLowerCase(); dessiner(); });
      $$("[data-f]", bar).forEach(function (b) {
        b.addEventListener("click", function () { CL.filtre = b.dataset.f; $$("[data-f]", bar).forEach(function (x) { x.classList.toggle("on", x === b); }); dessiner(); });
      });
      $('[data-a="nouveau"]', bar).addEventListener("click", function () { formClient(null, function (c) { ADM.aller("clients/" + c._id); }); });
      $('[data-a="avis"]', bar).addEventListener("click", function () { avisRecus(function () { ADM.rendre(); }); });
      $('[data-a="modeles"]', bar).addEventListener("click", function () { if (ADM.gererModeles) ADM.gererModeles(); });

      function dessiner() {
        zone.innerHTML = "";
        var l = tous.filter(function (c) {
          var st = c.statut || "actif";
          if (CL.filtre === "actifs" && st === "termine") return false;
          if (CL.filtre === "termine" && st !== "termine") return false;
          return !CL.q || [c.nom, c.entreprise, c.contact, c.secteur, c.formule].some(function (v) { return String(v || "").toLowerCase().indexOf(CL.q) !== -1; });
        });
        if (!tous.length) {
          zone.appendChild(h('<div class="sec" style="grid-column:1/-1"><div class="empty">' + ic("address-book") +
            "Pas encore de client. Créez sa fiche ici, ou depuis une demande ou un prospect gagné : ses devis, factures, publications et rapports y seront rangés.</div></div>"));
          return;
        }
        if (!l.length) { zone.appendChild(h('<div class="empty" style="grid-column:1/-1">Aucun client ne correspond.</div>')); return; }
        l.forEach(function (c) {
          var st = c.statut || "actif", r = c.resume || {};
          var carte = h('<a class="cl-carte" href="#clients/' + esc(c._id) + '">' + ADM.avInitiale(c.nom, "lg") +
            '<div class="grow"><b></b><small></small><div class="l3"></div></div></a>');
          $("b", carte).textContent = c.nom;
          $("small", carte).textContent = [c.formule, c.montantMensuel ? ADM.fcfa(c.montantMensuel) + " / mois" : "", c.secteur].filter(Boolean).join(" · ") || "Fiche à compléter";
          var l3 = $(".l3", carte);
          if (st !== "actif") l3.appendChild(h('<span class="pill ' + (st === "pause" ? "chaud" : "") + '">' + esc(ADM.libelle(ST_CLIENT, st)) + "</span>"));
          if (r.enRetard) l3.appendChild(h('<span class="pill ko">' + ic("warning-circle") + "facture en retard</span>"));
          else if (r.aEncaisser) l3.appendChild(h('<span class="pill chaud">' + esc(ADM.fcfa(r.aEncaisser)) + " à encaisser</span>"));
          if (r.aValider) l3.appendChild(h('<span class="pill bleu">' + r.aValider + " à valider par le client</span>"));
          if (r.renouvellementProche) l3.appendChild(h('<span class="pill chaud">' + ic("arrows-clockwise") + "renouvellement le " + esc(jourCourt(c.renouvellement)) + "</span>"));
          if (c.brief && c.brief.recuLe) l3.appendChild(h('<span class="pill ok">' + ic("clipboard-text") + "brief reçu</span>"));
          if (!l3.children.length) l3.remove();
          zone.appendChild(carte);
        });
      }
      dessiner();
    }).catch(ADM.erreur(panel));
  }

  /* --- Formulaire client (création ou modification) --- */
  function formClient(c, surFin) {
    c = c || {};
    var f = h('<div><div class="row2"><div><label>Nom de la marque ou du client</label><input data-k="nom"></div><div><label>Personne à contacter</label><input data-k="contact"></div></div>' +
      '<div class="row2"><div><label>Téléphone / WhatsApp</label><input data-k="telephone" inputmode="tel"></div><div><label>Email</label><input data-k="email" type="email"></div></div>' +
      '<div class="row2"><div><label>Secteur</label><input data-k="secteur"></div><div><label>Ville</label><input data-k="ville"></div></div>' +
      '<label>Adresse <span class="help">(facultatif, pour les factures)</span></label><input data-k="adresse">' +
      '<div class="row2"><div><label>Formule</label><input data-k="formule" list="formulesPA" placeholder="ex : Gestion mensuelle"><datalist id="formulesPA"></datalist></div>' +
      '<div><label>Montant mensuel (FCFA)</label><input data-k="montantMensuel" inputmode="numeric" placeholder="ex : 150000"></div></div>' +
      '<div class="row2"><div><label>Début du contrat</label><input data-k="debutContrat" type="date"></div><div><label>Renouvellement</label><input data-k="renouvellement" type="date"></div></div>' +
      '<label>Statut</label><select data-k="statut">' + ADM.options(ST_CLIENT, c.statut || "actif") + "</select>" +
      '<label>Réseaux et liens <span class="help">— un par ligne</span></label><textarea data-k="reseaux" rows="3"></textarea>' +
      '<label>Ton et style de la marque <span class="help">— Léa s’en sert pour écrire ses légendes</span></label><textarea data-k="ton" rows="3" placeholder="ex : chaleureux, tutoiement, emojis légers, mots du quotidien gabonais"></textarea>' +
      '<label>Notes privées</label><textarea data-k="notes" rows="3"></textarea>' +
      '<div class="formfoot"><button class="btn primary" data-a="ok">' + (c._id ? "Enregistrer" : "Créer la fiche") + "</button></div></div>");
    ["nom", "contact", "telephone", "email", "secteur", "ville", "adresse", "formule", "montantMensuel", "debutContrat", "renouvellement", "reseaux", "ton", "notes"]
      .forEach(function (k) { $('[data-k="' + k + '"]', f).value = c[k] != null ? c[k] : k === "ville" ? "Libreville" : ""; });
    api("/api/content/formules").then(function (l) {
      l.forEach(function (x) { var op = document.createElement("option"); op.value = x.titre; $("datalist", f).appendChild(op); });
    }).catch(function () {});
    var m = ADM.modale(c._id ? "Modifier " + c.nom : "Nouveau client", f, { large: true });
    $('[data-a="ok"]', f).addEventListener("click", function () {
      var body = {};
      $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
      var fin = ADM.attente(this);
      api(c._id ? "/api/crm/clients/" + c._id : "/api/crm/clients", { method: c._id ? "PUT" : "POST", body: body }).then(function (n) {
        fin(); m.fermer(); ADM.listeClients(true);
        ADM.toast(c._id ? "Fiche enregistrée" : "Client créé");
        if (surFin) surFin(n);
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
  }
  ADM.formClient = formClient;

  /** Crée la fiche client depuis une demande reçue ou un prospect, puis l'ouvre. */
  ADM.creerClientDepuis = function (type, id) {
    api("/api/crm/clients/depuis", { method: "POST", body: { type: type, id: id } }).then(function (c) {
      ADM.listeClients(true);
      ADM.toast("Fiche client prête");
      ADM.aller("clients/" + c._id);
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  };

  /* --- Fiche client --- */
  var ONGLETS = [["apercu", "Aperçu", "user-circle"], ["documents", "Devis et factures", "receipt"], ["calendrier", "Publications", "calendar-blank"],
    ["rapports", "Rapports", "chart-bar"], ["brief", "Brief", "clipboard-text"], ["couts", "Temps et frais", "timer"]];

  function ficheClient(id, onglet, panel) {
    api("/api/crm/clients/" + id).then(function (d) {
      var c = d.client;
      ADM.titre(c.nom, "Fiche client");
      panel.innerHTML = "";
      var st = c.statut || "actif";
      var tete = h('<div class="cl-tete"><a class="btn ghost sm" href="#clients">' + ic("arrow-left") + "Clients</a>" +
        '<div class="cl-id">' + ADM.avInitiale(c.nom, "xl") + '<div class="grow"><h2></h2><p></p><div class="l3"></div></div></div>' +
        '<div class="acts-l"></div></div>');
      $("h2", tete).textContent = c.nom;
      $("p", tete).textContent = [c.contact, c.formule, c.montantMensuel ? ADM.fcfa(c.montantMensuel) + " / mois" : "", c.ville].filter(Boolean).join(" · ");
      var l3 = $(".l3", tete);
      l3.appendChild(h('<span class="pill ' + (st === "actif" ? "ok" : st === "pause" ? "chaud" : "") + '">' + esc(ADM.libelle(ST_CLIENT, st)) + "</span>"));
      if (c.renouvellement) l3.appendChild(h('<span class="pill">' + ic("arrows-clockwise") + "renouvellement le " + esc(jourCourt(c.renouvellement)) + "</span>"));
      if (c.source) l3.appendChild(h('<span class="pill contour">' + ic(c.source.type === "message" ? "chat-circle-text" : "target") + (c.source.type === "message" ? "venu d’une demande" : "venu de la prospection") + "</span>"));
      var acts = $(".acts-l", tete);
      var tel = waNum(c.telephone);
      if (tel) acts.appendChild(h('<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + tel + '">' + ic("whatsapp-logo") + "WhatsApp</a>"));
      var bEcrire = h('<button class="btn">' + ic("chat-text") + "Écrire avec un modèle</button>");
      bEcrire.addEventListener("click", function () { if (ADM.ecrireAvecModele) ADM.ecrireAvecModele(c, d); });
      acts.appendChild(bEcrire);
      var bDevis = h('<button class="btn">' + ic("file-plus") + "Devis</button>");
      bDevis.addEventListener("click", function () { nouveauDocument("devis", c._id, recharger); });
      var bFact = h('<button class="btn primary">' + ic("receipt") + "Facture</button>");
      bFact.addEventListener("click", function () { nouveauDocument("facture", c._id, recharger); });
      var bModif = h('<button class="icobtn" title="Modifier la fiche" aria-label="Modifier la fiche">' + ic("pencil-simple") + "</button>");
      bModif.addEventListener("click", function () { formClient(c, recharger); });
      var bPlus = h('<button class="icobtn" title="Plus" aria-label="Plus">' + ic("dots-three-outline") + "</button>");
      bPlus.addEventListener("click", function (e) {
        e.stopPropagation();
        ADM.menu(bPlus, [
          { icone: "users-three", label: "Débrief d’équipe sur ce client", action: function () { if (ADM.debriefClient) ADM.debriefClient(c); else ADM.aller("equipe"); } },
          { icone: "pen-nib", label: "Demander des idées à Léa", action: function () { ADM.ouvrirEquipe("contenu", { texte: "Propose-moi 5 idées de publications pour " + c.nom + " ce mois-ci." }); } },
          { icone: "trash", label: "Supprimer la fiche", action: function () {
            if (!confirm("Supprimer la fiche de " + c.nom + " ? Ses publications, rapports et brouillons seront supprimés aussi.")) return;
            api("/api/crm/clients/" + c._id, { method: "DELETE" }).then(function () { ADM.listeClients(true); ADM.toast("Fiche supprimée"); ADM.aller("clients"); })
              .catch(function (e) { ADM.toast(e.message, "ko"); });
          } },
        ]);
      });
      [bDevis, bFact, bModif, bPlus].forEach(function (b) { acts.appendChild(b); });
      panel.appendChild(tete);

      var segs = h('<div class="segs cl-onglets" role="tablist">' + ONGLETS.map(function (o) {
        return '<button data-o="' + o[0] + '"' + (o[0] === onglet ? ' class="on"' : "") + ">" + ic(o[2]) + "<span>" + o[1] + "</span></button>";
      }).join("") + "</div>");
      panel.appendChild(segs);
      var zone = h("<div></div>");
      panel.appendChild(zone);
      $$("[data-o]", segs).forEach(function (b) {
        b.addEventListener("click", function () {
          onglet = b.dataset.o;
          history.replaceState(null, "", "#clients/" + c._id + (onglet === "apercu" ? "" : "/" + onglet));
          $$("[data-o]", segs).forEach(function (x) { x.classList.toggle("on", x === b); });
          dessiner();
        });
      });
      function recharger() { ficheClient(c._id, onglet, panel); }
      function dessiner() {
        zone.innerHTML = "";
        ({ apercu: ongletApercu, documents: ongletDocuments, calendrier: ongletCalendrier, rapports: ongletRapports, brief: ongletBrief, couts: ongletCouts }[onglet] || ongletApercu)(zone, d, recharger);
      }
      dessiner();
    }).catch(ADM.erreur(panel));
  }

  function infoLigne(lib, val, lien) {
    var l = h('<div class="ligne" style="padding:9px 0"><span class="muted" style="min-width:150px"></span><span class="grow"></span></div>');
    $("span", l).textContent = lib;
    if (lien) { var a = h('<a target="_blank" rel="noopener"></a>'); a.href = lien; a.textContent = val; $(".grow", l).appendChild(a); }
    else $(".grow", l).textContent = val;
    return l;
  }

  function ongletApercu(zone, d, recharger) {
    var c = d.client, r = d.resume;
    var tuiles = h('<div class="tuiles"></div>');
    [["Encaissé", ADM.fcfa(r.encaisse)], ["À encaisser", ADM.fcfa(r.aEncaisser)], ["Coûts (temps et frais)", ADM.fcfa(r.couts)], ["Marge", ADM.fcfa(r.marge)]].forEach(function (x) {
      var t = h('<div class="tuile"><div class="lab"></div><b class="val"></b></div>');
      $(".lab", t).textContent = x[0]; $(".val", t).textContent = x[1];
      tuiles.appendChild(t);
    });
    zone.appendChild(tuiles);
    var g = h('<div class="grille g-12"></div>');
    var infos = h('<section class="sec"><div class="sec-h"><h3>' + ic("identification-card") + "Coordonnées et contrat</h3></div><div class=\"sec-b\" style=\"padding-top:4px;padding-bottom:6px\"></div></section>");
    var b = $(".sec-b", infos);
    if (c.contact) b.appendChild(infoLigne("Contact", c.contact));
    if (c.telephone) b.appendChild(infoLigne("Téléphone", c.telephone, "tel:+" + waNum(c.telephone)));
    if (c.email) b.appendChild(infoLigne("Email", c.email, "mailto:" + c.email));
    if (c.adresse || c.ville) b.appendChild(infoLigne("Adresse", [c.adresse, c.ville].filter(Boolean).join(", ")));
    if (c.formule) b.appendChild(infoLigne("Formule", c.formule + (c.montantMensuel ? " · " + ADM.fcfa(c.montantMensuel) + " par mois" : "")));
    if (c.debutContrat) b.appendChild(infoLigne("Client depuis le", jourCourt(c.debutContrat)));
    if (c.renouvellement) b.appendChild(infoLigne("Renouvellement", jourCourt(c.renouvellement)));
    String(c.reseaux || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s, i) {
      b.appendChild(infoLigne(i ? "" : "Réseaux et liens", s, /^https?:\/\//i.test(s) ? s : null));
    });
    if (!b.children.length) b.appendChild(h('<p class="muted" style="padding:10px 0">Fiche à compléter : ' + "cliquez sur le crayon en haut.</p>"));
    if (c.ton) { var t = h('<div style="padding:10px 0;border-top:1px solid var(--line)"><b style="font-size:12.5px;color:var(--ink-2)">Ton de la marque</b><p style="margin-top:4px;white-space:pre-wrap"></p></div>'); $("p", t).textContent = c.ton; b.appendChild(t); }
    if (c.notes) { var n = h('<div style="padding:10px 0;border-top:1px solid var(--line)"><b style="font-size:12.5px;color:var(--ink-2)">Notes privées</b><p style="margin-top:4px;white-space:pre-wrap"></p></div>'); $("p", n).textContent = c.notes; b.appendChild(n); }
    g.appendChild(infos);

    var liens = h('<section class="sec"><div class="sec-h"><h3>' + ic("link-simple") + "Liens à envoyer au client</h3></div><div class=\"sec-b flush\"></div></section>");
    [["validation", "check-square-offset", "Valider ses publications", "Il valide ou commente vos publications « à valider »."],
      ["brief", "clipboard-text", "Remplir son brief", "Son activité, ses cibles, son ton : tout arrive dans sa fiche."],
      ["avis", "star", "Laisser un avis", "Son témoignage arrive dans « Avis reçus », à publier sur votre site."]].forEach(function (x) {
      var jet = d.liens[x[0]];
      var l = h('<div class="ligne"><span class="ico-rond">' + ic(x[1]) + '</span><div class="grow"><b></b><small></small></div></div>');
      $("b", l).textContent = x[2];
      $("small", l).textContent = x[3];
      var bt = h('<button class="btn sm ' + (jet ? "" : "soft") + '">' + ic(jet ? "share-network" : "plus") + (jet ? "Envoyer" : "Créer le lien") + "</button>");
      bt.addEventListener("click", function () {
        api("/api/crm/clients/" + c._id + "/liens/" + x[0], { method: "POST", body: {} }).then(function (rep) {
          d.liens[x[0]] = rep.jeton;
          var msgs = {
            validation: "Bonjour" + (c.contact ? " " + c.contact : "") + ", vos prochaines publications sont prêtes. Pouvez-vous les valider ici ?",
            brief: "Bonjour" + (c.contact ? " " + c.contact : "") + ", pour bien démarrer, pouvez-vous remplir ce court questionnaire sur votre marque ?",
            avis: "Bonjour" + (c.contact ? " " + c.contact : "") + ", merci pour votre confiance ! Accepteriez-vous de laisser un petit avis sur notre collaboration ?",
          };
          ADM.partager({ titre: x[2], url: lienPublic(rep.jeton), telephone: c.telephone, email: c.email, message: msgs[x[0]], sujet: x[2] });
          if (!jet) recharger();
        }).catch(function (e) { ADM.toast(e.message, "ko"); });
      });
      l.appendChild(bt);
      if (jet) {
        var nv = h('<button class="icobtn" title="Remplacer le lien (l’ancien ne marchera plus)" aria-label="Remplacer le lien">' + ic("arrows-clockwise") + "</button>");
        nv.addEventListener("click", function () {
          if (!confirm("Créer un nouveau lien ? L’ancien ne marchera plus.")) return;
          api("/api/crm/clients/" + c._id + "/liens/" + x[0], { method: "POST", body: { nouveau: true } }).then(function () { ADM.toast("Nouveau lien créé"); recharger(); });
        });
        l.appendChild(nv);
      }
      $(".sec-b", liens).appendChild(l);
    });
    var col = h("<div></div>");
    col.appendChild(liens);
    if (d.avis.length) {
      var av = h('<section class="sec"><div class="sec-h"><h3>' + ic("star") + "Ses avis</h3></div><div class=\"sec-b flush\"></div></section>");
      d.avis.forEach(function (a) { $(".sec-b", av).appendChild(ligneAvis(a, recharger)); });
      col.appendChild(av);
    }
    g.appendChild(col);
    zone.appendChild(g);
  }

  function ongletDocuments(zone, d, recharger) {
    var c = d.client;
    var bar = h('<div class="toolbar"><button class="btn primary" data-a="f">' + ic("receipt") + "Nouvelle facture</button>" +
      '<button class="btn" data-a="d">' + ic("file-plus") + "Nouveau devis</button></div>");
    $('[data-a="f"]', bar).addEventListener("click", function () { nouveauDocument("facture", c._id, recharger); });
    $('[data-a="d"]', bar).addEventListener("click", function () { nouveauDocument("devis", c._id, recharger); });
    zone.appendChild(bar);
    zone.appendChild(tableDocuments(d.documents, recharger, true));
  }

  function tableDocuments(docs, recharger, sansClient) {
    var s = h('<section class="sec"><div class="sec-b flush" style="overflow-x:auto"><table class="table"><thead><tr><th>Document</th>' + (sansClient ? "" : "<th>Client</th>") +
      '<th>Date</th><th>Statut</th><th class="n">Total</th><th class="n">Reste</th></tr></thead><tbody></tbody></table></div></section>');
    var tb = $("tbody", s);
    if (!docs.length) tb.appendChild(h('<tr><td colspan="6" class="faint">Aucun devis ni facture pour le moment.</td></tr>'));
    docs.forEach(function (x) {
      var tr = h('<tr class="cliquable"><td><b></b><div class="faint" style="font-size:12px"></div></td>' + (sansClient ? "" : "<td></td>") +
        '<td></td><td>' + pillDoc(x) + '</td><td class="n"></td><td class="n"></td></tr>');
      var td = $$("td", tr), i = 0;
      $("b", td[i]).textContent = nomDoc(x);
      $("div", td[i++]).textContent = x.objet || "";
      if (!sansClient) td[i++].textContent = x.clientNom || "";
      td[i++].textContent = jourCourt(x.dateEmission) || "—";
      i++;
      td[i++].textContent = ADM.fcfa(x.totaux.total);
      td[i].textContent = x.type === "facture" && x.statut !== "brouillon" && x.statut !== "annulee" ? ADM.fcfa(x.totaux.reste) : "—";
      tr.addEventListener("click", function () { ouvrirDocument(x._id, recharger); });
      tb.appendChild(tr);
    });
    return s;
  }

  function ongletCalendrier(zone, d, recharger) {
    var c = d.client;
    var bar = h('<div class="toolbar"><button class="btn primary" data-a="n">' + ic("plus") + "Nouvelle publication</button>" +
      '<a class="btn" href="#calendrier">' + ic("calendar-blank") + "Ouvrir le calendrier</a>" +
      '<button class="btn soft" data-a="lea">' + ADM.avAgent("contenu", "sm") + "Idées avec Léa</button></div>");
    $('[data-a="n"]', bar).addEventListener("click", function () { if (ADM.editerPublication) ADM.editerPublication(null, { clientId: c._id }, recharger); });
    $('[data-a="lea"]', bar).addEventListener("click", function () { ADM.ouvrirEquipe("contenu", { texte: "Propose-moi 5 idées de publications pour " + c.nom + " ce mois-ci, avec une légende pour chacune." }); });
    zone.appendChild(bar);
    var s = h('<section class="sec"><div class="sec-b flush"></div></section>');
    if (!d.planning.length) $(".sec-b", s).appendChild(h('<div class="empty">' + ic("calendar-blank") + "Aucune publication prévue pour ce client.</div>"));
    d.planning.forEach(function (p) { $(".sec-b", s).appendChild(ADM.lignePublication ? ADM.lignePublication(p, recharger) : h("<div></div>")); });
    zone.appendChild(s);
  }

  function ongletRapports(zone, d, recharger) {
    var c = d.client;
    var bar = h('<div class="toolbar"><input type="month" data-k="mois" style="width:auto"><button class="btn primary" data-a="n">' + ic("chart-bar") + "Préparer le rapport</button></div>");
    var moisDernier = new Date(Date.now() + 3600000);
    moisDernier.setUTCDate(1); moisDernier.setUTCMonth(moisDernier.getUTCMonth() - 1);
    $('[data-k="mois"]', bar).value = moisDernier.toISOString().slice(0, 7);
    $('[data-a="n"]', bar).addEventListener("click", function () {
      api("/api/crm/rapports", { method: "POST", body: { clientId: c._id, mois: $('[data-k="mois"]', bar).value } }).then(function (r) { ADM.aller("rapport/" + r._id); })
        .catch(function (e) { ADM.toast(e.message, "ko"); });
    });
    zone.appendChild(bar);
    zone.appendChild(h('<div class="hint">' + ic("sparkle") + "<div>Envoyez à Léa les captures de statistiques du mois (Instagram, Facebook, TikTok) : elle relève les chiffres et rédige le bilan. Vous relisez, puis vous partagez un lien ou un PDF.</div></div>"));
    var s = h('<section class="sec"><div class="sec-b flush"></div></section>');
    if (!d.rapports.length) $(".sec-b", s).appendChild(h('<div class="empty">' + ic("chart-bar") + "Aucun rapport pour le moment.</div>"));
    d.rapports.forEach(function (r) {
      var l = h('<a class="ligne cliquable"><span class="ico-rond">' + ic("chart-bar") + '</span><div class="grow"><b></b><small></small></div>' + ic("caret-right") + "</a>");
      l.href = "#rapport/" + r._id;
      $("b", l).textContent = r.titre || libMois(r.mois);
      $("small", l).textContent = r.redigeLe ? "Rédigé " + ADM.dateRel(r.redigeLe) : "À rédiger";
      $(".sec-b", s).appendChild(l);
    });
    zone.appendChild(s);
  }

  function ongletBrief(zone, d) {
    var c = d.client, br = c.brief;
    var s = h('<section class="sec"><div class="sec-h"><h3>' + ic("clipboard-text") + 'Brief de la marque</h3><button class="btn sm soft" data-a="lien">' + ic("share-network") + "Envoyer le questionnaire</button></div><div class=\"sec-b\"></div></section>");
    $('[data-a="lien"]', s).addEventListener("click", function () {
      api("/api/crm/clients/" + c._id + "/liens/brief", { method: "POST", body: {} }).then(function (rep) {
        ADM.partager({ titre: "Questionnaire de brief", url: lienPublic(rep.jeton), telephone: c.telephone, email: c.email, sujet: "Votre brief",
          message: "Bonjour" + (c.contact ? " " + c.contact : "") + ", pour bien démarrer, pouvez-vous remplir ce court questionnaire sur votre marque ?" });
      }).catch(function (e) { ADM.toast(e.message, "ko"); });
    });
    var b = $(".sec-b", s);
    if (!br || !br.recuLe) b.appendChild(h('<p class="muted">Pas encore de brief. Envoyez le questionnaire : ses réponses arriveront ici, et Léa comme Awa pourront s’en servir.</p>'));
    else {
      b.appendChild(h('<p class="faint" style="font-size:12.5px;margin-bottom:8px"></p>')).textContent = "Reçu " + ADM.dateRel(br.recuLe) + (br.envois > 1 ? " (mis à jour " + br.envois + " fois)" : "");
      (br.questions || []).forEach(function (q) {
        var rep = br.reponses[q.k];
        if (!rep) return;
        var x = h('<div style="padding:10px 0;border-top:1px solid var(--line)"><b style="font-size:12.5px;color:var(--ink-2)"></b><p style="margin-top:4px;white-space:pre-wrap"></p></div>');
        $("b", x).textContent = q.label; $("p", x).textContent = rep;
        b.appendChild(x);
      });
    }
    zone.appendChild(s);
  }

  function ongletCouts(zone, d, recharger) {
    var c = d.client;
    var bar = h('<div class="toolbar"><button class="btn primary" data-a="t">' + ic("timer") + "Noter du temps</button><button class=\"btn\" data-a=\"f\">" + ic("money") + "Ajouter une dépense</button></div>");
    $('[data-a="t"]', bar).addEventListener("click", function () { formCout("temps", c._id, recharger); });
    $('[data-a="f"]', bar).addEventListener("click", function () { formCout("frais", c._id, recharger); });
    zone.appendChild(bar);
    zone.appendChild(h('<div class="hint">' + ic("info") + "<div>Le temps passé est valorisé avec votre taux horaire (Finances → Réglages de facturation) : c’est ce qui permet de calculer la vraie marge de chaque client.</div></div>"));
    zone.appendChild(listeCouts(d.couts, recharger));
  }

  function listeCouts(couts, recharger, nomClient) {
    var s = h('<section class="sec"><div class="sec-b flush"></div></section>');
    if (!couts.length) $(".sec-b", s).appendChild(h('<div class="empty">' + ic("timer") + "Rien de noté pour le moment.</div>"));
    couts.forEach(function (x) {
      var l = h('<div class="ligne"><span class="ico-rond">' + ic(x.type === "temps" ? "timer" : "money") + '</span><div class="grow"><b></b><small></small></div><b class="mono"></b>' +
        '<button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button></div>");
      $(".grow b", l).textContent = x.libelle;
      $(".grow small", l).textContent = jourCourt(x.date) + (nomClient ? " · " + nomClient(x.clientId) : "");
      $("b.mono", l).textContent = x.type === "temps" ? String(x.heures).replace(".", ",") + " h" : ADM.fcfa(x.montant);
      $("button", l).addEventListener("click", function () {
        if (!confirm("Supprimer cette ligne ?")) return;
        api("/api/crm/couts/" + x._id, { method: "DELETE" }).then(recharger);
      });
      $(".sec-b", s).appendChild(l);
    });
    return s;
  }

  function formCout(type, clientId, surFin) {
    ADM.listeClients().then(function (clients) {
      var f = h('<div><div class="segs" style="margin-top:12px"><button data-t="temps">' + ic("timer") + " Temps passé</button><button data-t=\"frais\">" + ic("money") + " Dépense</button></div>" +
        '<label>Client <span class="help">(facultatif)</span></label><select data-k="clientId">' + ADM.optionsClients(clients, clientId || "", "Aucun (frais généraux)") + "</select>" +
        '<div class="row2"><div><label>Date</label><input type="date" data-k="date"></div><div data-z="val"></div></div>' +
        '<label>Libellé</label><input data-k="libelle" placeholder="ex : tournage, abonnement Canva, crédit internet">' +
        '<div class="formfoot"><button class="btn primary" data-a="ok">Ajouter</button></div></div>');
      $('[data-k="date"]', f).value = ADM.aujourdhui();
      function choisir(t) {
        type = t;
        $$("[data-t]", f).forEach(function (b) { b.classList.toggle("on", b.dataset.t === t); });
        $('[data-z="val"]', f).innerHTML = t === "temps" ? '<label>Heures</label><input data-k="heures" inputmode="decimal" placeholder="ex : 2,5">' : '<label>Montant (FCFA)</label><input data-k="montant" inputmode="numeric">';
      }
      $$("[data-t]", f).forEach(function (b) { b.addEventListener("click", function () { choisir(b.dataset.t); }); });
      choisir(type || "temps");
      var m = ADM.modale("Temps et frais", f);
      $('[data-a="ok"]', f).addEventListener("click", function () {
        var body = { type: type };
        $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
        api("/api/crm/couts", { method: "POST", body: body }).then(function () { m.fermer(); ADM.toast("Ajouté"); if (surFin) surFin(); })
          .catch(function (e) { ADM.toast(e.message, "ko"); });
      });
    });
  }
  ADM.formCout = formCout;

  /* --- Avis reçus par lien --- */
  function ligneAvis(a, recharger) {
    var l = h('<div class="ligne" style="align-items:flex-start"><span class="ico-rond ' + (a.statut === "a_valider" ? "chaud" : a.statut === "publie" ? "ok" : "") + '">' + ic("star") + "</span>" +
      '<div class="grow"><b></b><small></small><p style="margin-top:6px;font-size:13px;line-height:1.55;white-space:pre-wrap"></p><div class="acts-l"></div></div></div>');
    $("b", l).textContent = a.nom + (a.role ? " · " + a.role : "");
    $("small", l).textContent = "★".repeat(a.note || 5) + " · reçu " + ADM.dateRel(a.createdAt) + (a.clientNom ? " · " + a.clientNom : "") +
      (a.statut === "publie" ? " · publié sur le site" : a.statut === "refuse" ? " · non publié" : a.autorise ? "" : " · publication non autorisée");
    $("p", l).textContent = a.texte;
    var acts = $(".acts-l", l);
    if (a.statut === "a_valider") {
      if (a.autorise) {
        var pub = h('<button class="btn sm primary">' + ic("check") + "Publier sur le site</button>");
        pub.addEventListener("click", function () {
          api("/api/crm/avis-recus/" + a._id + "/publier", { method: "POST", body: {} }).then(function () { ADM.toast("Avis publié dans Avis clients"); recharger(); })
            .catch(function (e) { ADM.toast(e.message, "ko"); });
        });
        acts.appendChild(pub);
      }
      var ref = h('<button class="btn sm ghost">Ne pas publier</button>');
      ref.addEventListener("click", function () { api("/api/crm/avis-recus/" + a._id + "/refuser", { method: "POST", body: {} }).then(recharger); });
      acts.appendChild(ref);
    } else acts.remove();
    return l;
  }
  function avisRecus(surFin) {
    api("/api/crm/avis-recus").then(function (l) {
      var corps = h('<div><p class="muted" style="font-size:13px;margin:12px 0">Les avis laissés par vos clients avec leur lien. Publiez-les en un clic : ils rejoignent « Avis clients » sur votre site.</p><section class="sec"><div class="sec-b flush"></div></section></div>');
      if (!l.length) $(".sec-b", corps).appendChild(h('<div class="empty">' + ic("star") + "Aucun avis reçu. Envoyez le lien « Laisser un avis » depuis la fiche d’un client.</div>"));
      var t;
      function rech() { t.fermer(); avisRecus(surFin); if (surFin) surFin(); }
      l.forEach(function (a) { $(".sec-b", corps).appendChild(ligneAvis(a, rech)); });
      t = ADM.tiroir("Avis reçus", corps);
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  }

  /* ======================================================================
     DEVIS ET FACTURES : éditeur
  ====================================================================== */
  function nouveauDocument(type, clientId, surMaj) {
    api("/api/crm/documents", { method: "POST", body: { type: type, clientId: clientId } }).then(function (d) {
      ouvrirDocument(d._id, surMaj);
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  }
  ADM.nouveauDocument = nouveauDocument;

  function ouvrirDocument(id, surMaj) {
    Promise.all([api("/api/crm/documents/" + id), ADM.listeClients()]).then(function (r) {
      var d = r[0], client = r[1].find(function (c) { return c._id === d.clientId; }) || {};
      var corps = h("<div></div>");
      var t = ADM.tiroir(nomDoc(d), corps, { surFermer: function () { if (surMaj) surMaj(); } });
      t.el.classList.add("large");
      function titre() { $(".tiroir-h h3", t.el).textContent = nomDoc(d) + " · " + (d.clientNom || ""); }
      function rendre() {
        titre();
        corps.innerHTML = "";
        if (d.statut === "brouillon") editer(); else consulter();
      }

      /* --- Brouillon : tout se modifie --- */
      function editer() {
        var f = h('<div class="doc-ed"><div class="hint" style="margin-top:14px">' + ic("pencil-simple") + "<div>Brouillon : modifiez librement. Une fois émis, le document reçoit son numéro définitif et un lien à envoyer au client.</div></div>" +
          '<label>Objet</label><input data-k="objet">' +
          '<div class="doc-lignes"><div class="doc-l doc-l-h"><span>Désignation</span><span>Qté</span><span>Prix unitaire</span><span class="n">Total</span><span></span></div></div>' +
          '<div class="acts-l"><button class="btn sm" data-a="ligne">' + ic("plus") + "Ligne</button><button class=\"btn sm\" data-a=\"formule\">" + ic("tag") + "Depuis une formule</button></div>" +
          '<div class="row2" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><label>Remise (FCFA)</label><input data-k="remise" inputmode="numeric"></div>' +
          '<div><label>TVA (%)</label><input data-k="tva" inputmode="decimal"></div>' +
          (d.type === "devis" ? '<div><label>Acompte (%)</label><input data-k="acompte" inputmode="numeric"></div>' : "<div></div>") + "</div>" +
          '<div class="row2"><div><label>' + (d.type === "devis" ? "Valable jusqu’au" : "À payer avant le") + '</label><input type="date" data-k="echeance"></div>' +
          '<div><label>Date du document</label><input type="date" data-k="dateEmission"></div></div>' +
          '<label>Conditions et notes <span class="help">— visibles par le client</span></label><textarea data-k="notes" rows="3"></textarea>' +
          '<div class="doc-totaux"></div>' +
          '<div class="formfoot"><button class="btn primary" data-a="emettre">' + ic("paper-plane-tilt") + (d.type === "devis" ? "Émettre le devis" : "Émettre la facture") + "</button>" +
          '<button class="btn" data-a="sauver">Enregistrer le brouillon</button><span style="flex:1"></span><button class="btn danger" data-a="suppr">' + ic("trash") + "Supprimer</button></div></div>");
        ["objet", "remise", "tva", "acompte", "echeance", "dateEmission", "notes"].forEach(function (k) { var i = $('[data-k="' + k + '"]', f); if (i) i.value = d[k] != null ? d[k] : ""; });
        var lignes = $(".doc-lignes", f);
        function ajouterLigne(l) {
          var row = h('<div class="doc-l"><textarea rows="1" data-c="designation" placeholder="ex : Gestion Instagram et Facebook — novembre"></textarea>' +
            '<input data-c="quantite" inputmode="decimal"><input data-c="prixUnitaire" inputmode="numeric"><b class="n"></b>' +
            '<button class="icobtn danger" title="Retirer la ligne" aria-label="Retirer la ligne">' + ic("x") + "</button></div>");
          $('[data-c="designation"]', row).value = l.designation || "";
          $('[data-c="quantite"]', row).value = l.quantite != null ? String(l.quantite).replace(".", ",") : "1";
          $('[data-c="prixUnitaire"]', row).value = l.prixUnitaire || "";
          $("button", row).addEventListener("click", function () { row.remove(); totaux(); });
          $$("input,textarea", row).forEach(function (i) { i.addEventListener("input", totaux); });
          lignes.appendChild(row);
        }
        (d.lignes && d.lignes.length ? d.lignes : [{ quantite: 1 }]).forEach(ajouterLigne);
        function lire() {
          var body = {};
          $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
          body.lignes = $$(".doc-l:not(.doc-l-h)", f).map(function (row) {
            return { designation: $('[data-c="designation"]', row).value, quantite: nombreSaisi($('[data-c="quantite"]', row).value), prixUnitaire: nombreSaisi($('[data-c="prixUnitaire"]', row).value) };
          });
          return body;
        }
        function totaux() {
          var b = lire(), st = 0;
          $$(".doc-l:not(.doc-l-h)", f).forEach(function (row, i) {
            var x = Math.round((b.lignes[i].quantite || 0) * (b.lignes[i].prixUnitaire || 0));
            st += x;
            $("b", row).textContent = x ? x.toLocaleString("fr-FR") : "";
          });
          var remise = Math.min(st, nombreSaisi(b.remise)), base = st - remise, tva = Math.round(base * nombreSaisi(b.tva) / 100), total = base + tva;
          var box = $(".doc-totaux", f);
          box.innerHTML = "";
          [["Sous-total", st], remise ? ["Remise", -remise] : null, nombreSaisi(b.tva) ? ["TVA " + b.tva + " %", tva] : null, ["Total", total, true],
            d.type === "devis" && nombreSaisi(b.acompte) ? ["Acompte à la commande (" + b.acompte + " %)", Math.round(total * nombreSaisi(b.acompte) / 100)] : null]
            .filter(Boolean).forEach(function (x) {
              var r2 = h('<div class="' + (x[2] ? "fort" : "") + '"><span></span><b></b></div>');
              $("span", r2).textContent = x[0]; $("b", r2).textContent = ADM.fcfa(x[1]);
              box.appendChild(r2);
            });
        }
        $$("[data-k]", f).forEach(function (i) { i.addEventListener("input", totaux); });
        totaux();
        $('[data-a="ligne"]', f).addEventListener("click", function () { ajouterLigne({ quantite: 1 }); totaux(); });
        $('[data-a="formule"]', f).addEventListener("click", function (e) {
          var btn = this;
          e.stopPropagation();
          api("/api/content/formules").then(function (l) {
            if (!l.length) return ADM.toast("Aucune formule : créez-les dans Mon site → Formules", "ko");
            ADM.menu(btn, l.map(function (x) {
              return { icone: "tag", label: x.titre + (x.prix ? " · " + x.prix : ""), action: function () {
                var prix = nombreSaisi((String(x.prix || "").match(/\d[\d\s  .]*/) || [""])[0].replace(/\./g, ""));
                var vides = $$(".doc-l:not(.doc-l-h)", f).filter(function (row) { return !$('[data-c="designation"]', row).value && !$('[data-c="prixUnitaire"]', row).value; });
                vides.forEach(function (row) { row.remove(); });
                ajouterLigne({ designation: x.titre + ((x.inclus || []).length ? " : " + x.inclus.join(", ") : ""), quantite: 1, prixUnitaire: prix });
                if (!$('[data-k="objet"]', f).value || /^(Devis|Facture)$/.test($('[data-k="objet"]', f).value)) $('[data-k="objet"]', f).value = x.titre;
                totaux();
              } };
            }));
          });
        });
        function sauver() { return api("/api/crm/documents/" + d._id, { method: "PUT", body: lire() }).then(function (n) { d = n; return n; }); }
        $('[data-a="sauver"]', f).addEventListener("click", function () {
          var fin = ADM.attente(this);
          sauver().then(function () { fin(); ADM.toast("Brouillon enregistré"); }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
        });
        $('[data-a="emettre"]', f).addEventListener("click", function () {
          var fin = ADM.attente(this);
          sauver().then(function () { return api("/api/crm/documents/" + d._id + "/emettre", { method: "POST" }); }).then(function (n) {
            fin(); d = n; ADM.toast(nomDoc(n) + " émis"); rendre(); partager();
          }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
        });
        $('[data-a="suppr"]', f).addEventListener("click", function () {
          if (!confirm("Supprimer ce brouillon ?")) return;
          api("/api/crm/documents/" + d._id, { method: "DELETE" }).then(function () { ADM.toast("Brouillon supprimé"); t.fermer(); });
        });
        corps.appendChild(f);
      }

      /* --- Document émis : consultation, envoi, paiements --- */
      function partager() {
        if (!d.lien) return;
        var tot = ADM.fcfa(d.totaux.total);
        ADM.partager({
          titre: "Envoyer " + nomDoc(d).toLowerCase(), url: lienPublic(d.lien), telephone: client.telephone, email: client.email, sujet: nomDoc(d) + " — " + (d.objet || ""),
          message: "Bonjour" + (client.contact ? " " + client.contact : "") + ", voici " + (d.type === "devis" ? "votre devis " : "votre facture ") + d.numero + " (" + tot + ")" +
            (d.type === "devis" ? " : vous pouvez l’accepter en ligne." : " :"),
        });
      }
      function consulter() {
        var v = h('<div><div class="doc-statut"></div><div class="doc-apercu"><table class="table"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Prix unitaire</th><th class="n">Total</th></tr></thead><tbody></tbody></table><div class="doc-totaux"></div></div>' +
          '<div class="acts-l" data-z="acts"></div><div data-z="paie"></div></div>');
        var stt = $(".doc-statut", v);
        stt.innerHTML = pillDoc(d) + "<span></span>";
        $("span:last-child", stt).textContent = [d.objet, "émis le " + jourCourt(d.dateEmission), d.echeance ? (d.type === "devis" ? "valable jusqu’au " : "à payer avant le ") + jourCourt(d.echeance) : ""].filter(Boolean).join(" · ");
        if (d.acceptation) stt.appendChild(h('<span class="pill ok">' + ic("seal-check") + "</span>")).appendChild(document.createTextNode("Accepté par " + d.acceptation.nom + ", " + ADM.dateRel(d.acceptation.date)));
        (d.lignes || []).forEach(function (l) {
          var tr = h('<tr><td style="white-space:pre-wrap"></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>');
          var td = $$("td", tr);
          td[0].textContent = l.designation; td[1].textContent = String(l.quantite).replace(".", ",");
          td[2].textContent = ADM.fcfa(l.prixUnitaire); td[3].textContent = ADM.fcfa(Math.round(l.quantite * l.prixUnitaire));
          $("tbody", v).appendChild(tr);
        });
        var tt = d.totaux, box = $(".doc-totaux", v);
        [["Sous-total", tt.sousTotal], tt.remise ? ["Remise", -tt.remise] : null, d.tva ? ["TVA " + d.tva + " %", tt.tva] : null, ["Total", tt.total, true],
          d.type === "devis" && d.acompte ? ["Acompte à la commande (" + d.acompte + " %)", tt.acompte] : null,
          d.type === "facture" && tt.paye ? ["Déjà payé", tt.paye] : null, d.type === "facture" && tt.paye ? ["Reste à payer", tt.reste, true] : null]
          .filter(Boolean).forEach(function (x) {
            var r2 = h('<div class="' + (x[2] ? "fort" : "") + '"><span></span><b></b></div>');
            $("span", r2).textContent = x[0]; $("b", r2).textContent = ADM.fcfa(x[1]);
            box.appendChild(r2);
          });
        if (d.notes) { var n = h('<p class="muted" style="font-size:12.5px;white-space:pre-wrap;margin-top:10px"></p>'); n.textContent = d.notes; $(".doc-apercu", v).appendChild(n); }

        var acts = $('[data-z="acts"]', v);
        function bouton(lib, icone, cls, fn) { var b = h('<button class="btn ' + (cls || "") + '">' + ic(icone) + "<span></span></button>"); $("span", b).textContent = lib; b.addEventListener("click", fn); acts.appendChild(b); return b; }
        function statut(s, msg) {
          api("/api/crm/documents/" + d._id + "/statut", { method: "POST", body: { statut: s } }).then(function (n) { d = n; ADM.toast(msg); rendre(); }).catch(function (e) { ADM.toast(e.message, "ko"); });
        }
        if (d.statut !== "annulee") bouton("Envoyer au client", "share-network", "primary", partager);
        if (d.lien) {
          var voir = h('<a class="btn" target="_blank" rel="noopener">' + ic("file-pdf") + "Voir · PDF</a>");
          voir.href = lienPublic(d.lien);
          acts.appendChild(voir);
        }
        if (d.type === "devis") {
          if (d.statut === "envoye") { bouton("Marquer accepté", "seal-check", "", function () { statut("accepte", "Devis accepté"); }); bouton("Refusé", "x-circle", "ghost", function () { statut("refuse", "Devis marqué refusé"); }); }
          if (d.statut === "envoye" || d.statut === "accepte") {
            bouton("Facturer", "receipt", "soft", function (e) {
              e.stopPropagation();
              ADM.menu(this, [
                { icone: "receipt", label: "Facture du montant total", action: function () { facturer("total"); } },
                { icone: "percent", label: "Facture d’acompte (" + (d.acompte || 50) + " %)", action: function () { facturer("acompte"); } },
                { icone: "check-square", label: "Facture de solde", action: function () { facturer("solde"); } },
              ]);
            });
          }
        }
        if (d.type === "facture" && (d.statut === "envoyee" || d.statut === "partielle")) bouton("Annuler la facture", "prohibit", "ghost", function () {
          if (confirm("Annuler cette facture ? Elle reste dans l’historique avec son numéro.")) statut("annulee", "Facture annulée");
        });
        bouton("Dupliquer", "copy", "ghost", function () {
          api("/api/crm/documents/" + d._id + "/dupliquer", { method: "POST" }).then(function (n) { d = n; client = client; ADM.toast("Copie créée en brouillon"); rendre(); });
        });
        function facturer(mode) {
          api("/api/crm/documents/" + d._id + "/facturer", { method: "POST", body: { mode: mode } }).then(function (n) { d = n; ADM.toast("Facture créée en brouillon"); rendre(); })
            .catch(function (e) { ADM.toast(e.message, "ko"); });
        }

        if (d.type === "facture" && d.statut !== "annulee") {
          var p = h('<section class="sec" style="margin-top:16px"><div class="sec-h"><h3>' + ic("hand-coins") + "Paiements</h3></div><div class=\"sec-b flush\"></div>" +
            '<div class="sec-b paie-f" style="border-top:1px solid var(--line)"><div class="row2" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
            '<div><label style="margin-top:0">Montant reçu</label><input data-p="montant" inputmode="numeric"></div><div><label style="margin-top:0">Date</label><input type="date" data-p="date"></div>' +
            '<div><label style="margin-top:0">Moyen</label><select data-p="mode">' + MODES.map(function (m) { return "<option>" + m + "</option>"; }).join("") + "</select></div></div>" +
            '<label>Note <span class="help">(facultatif : référence de la transaction…)</span></label><input data-p="note">' +
            '<div class="formfoot" style="margin-top:12px"><button class="btn primary" data-a="payer">' + ic("plus") + "Enregistrer le paiement</button></div></div></section>");
          var lp = $(".sec-b.flush", p);
          if (!(d.paiements || []).length) lp.appendChild(h('<div class="empty" style="padding:18px">Aucun paiement enregistré.</div>'));
          (d.paiements || []).forEach(function (x, i) {
            var l = h('<div class="ligne"><span class="ico-rond ok">' + ic("check") + '</span><div class="grow"><b></b><small></small></div><button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button></div>");
            $("b", l).textContent = ADM.fcfa(x.montant) + " · " + x.mode;
            $("small", l).textContent = jourCourt(x.date) + (x.note ? " · " + x.note : "");
            $("button", l).addEventListener("click", function () {
              if (!confirm("Supprimer ce paiement ?")) return;
              api("/api/crm/documents/" + d._id + "/paiements/" + i, { method: "DELETE" }).then(function (n) { d = n; rendre(); });
            });
            lp.appendChild(l);
          });
          $('[data-p="montant"]', p).value = d.totaux.reste || "";
          $('[data-p="date"]', p).value = ADM.aujourdhui();
          if (d.statut === "payee") $(".paie-f", p).remove();
          else $('[data-a="payer"]', p).addEventListener("click", function () {
            var body = {};
            $$("[data-p]", p).forEach(function (i) { body[i.dataset.p] = i.value; });
            var fin = ADM.attente(this);
            api("/api/crm/documents/" + d._id + "/paiements", { method: "POST", body: body }).then(function (n) {
              fin(); d = n; ADM.toast(n.statut === "payee" ? "Facture payée" : "Paiement enregistré"); rendre(); ADM.rafraichirCompteurs();
            }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
          });
          $('[data-z="paie"]', v).appendChild(p);
        }
        corps.appendChild(v);
      }
      rendre();
    }).catch(function (e) { ADM.toast(e.message, "ko"); });
  }
  ADM.ouvrirDocument = ouvrirDocument;

  /* ======================================================================
     FINANCES
  ====================================================================== */
  var FIN = { annee: null, filtre: "tous" };

  ADM.vue("finances", {
    titre: "Finances",
    sous: "Ce que vous encaissez, ce qui reste à encaisser, vos marges",
    rendu: function (params, panel) {
      FIN.annee = FIN.annee || ADM.aujourdhui().slice(0, 4);
      Promise.all([api("/api/crm/finances?annee=" + FIN.annee), api("/api/crm/documents"), api("/api/crm/couts?annee=" + FIN.annee), ADM.listeClients(true)]).then(function (r) {
        var f = r[0], docs = r[1], couts = r[2], clients = r[3];
        var nomClient = function (id) { return (clients.find(function (c) { return c._id === id; }) || {}).nom || ""; };
        panel.innerHTML = "";
        var bar = h('<div class="toolbar"><div class="segs" style="width:auto"><button data-a="moins" aria-label="Année précédente">' + ic("caret-left") + '</button><button class="on" data-a="an"></button><button data-a="plus" aria-label="Année suivante">' + ic("caret-right") + "</button></div>" +
          '<button class="btn primary" data-a="mois">' + ic("receipt") + "Factures du mois</button>" +
          '<button class="btn" data-a="cout">' + ic("plus") + "Temps ou dépense</button><span class=\"sp\"></span>" +
          '<button class="btn ghost" data-a="reglages">' + ic("gear-six") + "Réglages de facturation</button></div>");
        $('[data-a="an"]', bar).textContent = FIN.annee;
        $('[data-a="moins"]', bar).addEventListener("click", function () { FIN.annee = String(Number(FIN.annee) - 1); ADM.rendre(); });
        $('[data-a="plus"]', bar).addEventListener("click", function () { FIN.annee = String(Number(FIN.annee) + 1); ADM.rendre(); });
        $('[data-a="cout"]', bar).addEventListener("click", function () { formCout("temps", "", ADM.rendre); });
        $('[data-a="reglages"]', bar).addEventListener("click", function () { reglagesFacturation(ADM.rendre); });
        $('[data-a="mois"]', bar).addEventListener("click", function () { facturesDuMois(); });
        panel.appendChild(bar);

        var tuiles = h('<div class="tuiles"></div>');
        function tuile(lab, val, sous, cls) {
          var t = h('<div class="tuile"><div class="lab"></div><b class="val"></b><div class="delta"></div></div>');
          $(".lab", t).textContent = lab; $(".val", t).textContent = val;
          if (sous) { $(".delta", t).textContent = sous; if (cls) $(".delta", t).classList.add(cls); } else $(".delta", t).remove();
          tuiles.appendChild(t);
        }
        tuile("Encaissé ce mois", ADM.fcfa(f.moisCourant.encaisse), "marge " + ADM.fcfa(f.moisCourant.marge));
        tuile("À encaisser", ADM.fcfa(f.aEncaisser.montant), f.aEncaisser.nb + " facture" + (f.aEncaisser.nb > 1 ? "s" : "") + " en attente");
        tuile("En retard", ADM.fcfa(f.enRetard.montant), f.enRetard.nb ? f.enRetard.nb + " à relancer" : "aucune", f.enRetard.nb ? "down" : "");
        tuile("Devis en attente", ADM.fcfa(f.devisEnAttente.montant), f.devisEnAttente.nb + " devis envoyé" + (f.devisEnAttente.nb > 1 ? "s" : ""));
        tuile("Revenu mensuel récurrent", ADM.fcfa(f.recurrent.montant), f.recurrent.clients + " client" + (f.recurrent.clients > 1 ? "s" : "") + " actif" + (f.recurrent.clients > 1 ? "s" : ""));
        tuile("Marge " + f.annee, ADM.fcfa(f.annuel.marge), "encaissé " + ADM.fcfa(f.annuel.encaisse));
        panel.appendChild(tuiles);

        var graph = h('<section class="sec"><div class="sec-h"><h3>' + ic("chart-bar") + "Encaissé et coûts par mois</h3><small></small></div><div class=\"sec-b\"></div></section>");
        $(".sec-h small", graph).textContent = f.annee + (f.tauxHoraire ? " · temps valorisé à " + ADM.fcfa(f.tauxHoraire) + " de l’heure" : " · temps non valorisé (réglez votre taux horaire)");
        $(".sec-b", graph).appendChild(graphiqueMois(f.parMois));
        panel.appendChild(graph);

        if (f.enRetard.nb) {
          var ret = h('<section class="sec"><div class="sec-h"><h3>' + ic("warning-circle") + "Factures en retard</h3></div><div class=\"sec-b flush\"></div></section>");
          f.enRetard.liste.forEach(function (x) {
            var l = h('<div class="ligne cliquable"><span class="ico-rond ko">' + ic("receipt") + '</span><div class="grow"><b></b><small></small></div><b></b></div>');
            $(".grow b", l).textContent = x.numero + " · " + x.client;
            $(".grow small", l).textContent = "À payer avant le " + jourCourt(x.echeance);
            l.lastChild.textContent = ADM.fcfa(x.reste);
            l.addEventListener("click", function () { ouvrirDocument(x.id, ADM.rendre); });
            $(".sec-b", ret).appendChild(l);
          });
          panel.appendChild(ret);
        }

        var g = h('<div class="grille g2"></div>');
        var pc = h('<section class="sec"><div class="sec-h"><h3>' + ic("users") + "Par client</h3><small></small></div><div class=\"sec-b flush\" style=\"overflow-x:auto\"><table class=\"table\"><thead><tr><th>Client</th><th class=\"n\">Encaissé</th><th class=\"n\">Coûts</th><th class=\"n\">Marge</th></tr></thead><tbody></tbody></table></div></section>");
        $(".sec-h small", pc).textContent = f.annee;
        if (!f.parClient.length) $("tbody", pc).appendChild(h('<tr><td colspan="4" class="faint">Rien pour cette année.</td></tr>'));
        f.parClient.forEach(function (x) {
          var tr = h('<tr class="cliquable"><td></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>');
          var td = $$("td", tr);
          td[0].textContent = x.nom; td[1].textContent = ADM.fcfa(x.encaisse); td[2].textContent = ADM.fcfa(x.couts); td[3].textContent = ADM.fcfa(x.marge);
          tr.addEventListener("click", function () { ADM.aller("clients/" + x.id); });
          $("tbody", pc).appendChild(tr);
        });
        g.appendChild(pc);
        var cs = h('<section class="sec"><div class="sec-h"><h3>' + ic("timer") + "Temps et dépenses</h3><small></small></div></section>");
        $(".sec-h small", cs).textContent = f.annee;
        var lc = listeCouts(couts.slice(0, 30), ADM.rendre, nomClient);
        lc.style.margin = "0"; lc.style.border = "none"; lc.style.boxShadow = "none";
        cs.appendChild(lc);
        g.appendChild(cs);
        panel.appendChild(g);

        var ds = h('<div class="bar" style="margin-top:8px"><h2 style="font-size:16px">Devis et factures</h2><div class="segs" style="width:auto">' +
          [["tous", "Tous"], ["facture", "Factures"], ["devis", "Devis"], ["ouvertes", "À encaisser"]].map(function (x) {
            return '<button data-f="' + x[0] + '"' + (FIN.filtre === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>";
          }).join("") + "</div></div>");
        panel.appendChild(ds);
        var zoneDocs = h("<div></div>");
        panel.appendChild(zoneDocs);
        function dessinerDocs() {
          var l = docs.filter(function (x) {
            if (FIN.filtre === "facture" || FIN.filtre === "devis") return x.type === FIN.filtre;
            if (FIN.filtre === "ouvertes") return x.type === "facture" && (x.statut === "envoyee" || x.statut === "partielle");
            return true;
          });
          zoneDocs.innerHTML = "";
          zoneDocs.appendChild(tableDocuments(l.slice(0, 80), ADM.rendre));
        }
        $$("[data-f]", ds).forEach(function (b) {
          b.addEventListener("click", function () { FIN.filtre = b.dataset.f; $$("[data-f]", ds).forEach(function (x) { x.classList.toggle("on", x === b); }); dessinerDocs(); });
        });
        dessinerDocs();
      }).catch(ADM.erreur(panel));
    },
  });

  /** Barres groupées : encaissé et coûts par mois, une seule échelle (FCFA). */
  function graphiqueMois(parMois) {
    var W = 720, H = 240, M = { g: 64, d: 8, h: 12, b: 26 };
    var max = Math.max.apply(null, parMois.map(function (m) { return Math.max(m.encaisse, m.couts); }).concat([1]));
    var pas = [1, 2, 2.5, 5, 10];
    var mag = Math.pow(10, Math.floor(Math.log10(max)));
    var top = mag * (pas.find(function (p) { return p * mag >= max; }) || 10);
    var ih = H - M.h - M.b, iw = W - M.g - M.d, bande = iw / 12;
    var barre = Math.min(20, (bande - 12) / 2);
    var NS = "http://www.w3.org/2000/svg";
    var wrap = h('<div class="chart"><div class="legende"><span><i style="background:var(--series-1)"></i>Encaissé</span><span><i style="background:var(--series-2)"></i>Coûts (temps et frais)</span></div></div>');
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Encaissé et coûts par mois");
    function el(tag, a) { var e = document.createElementNS(NS, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); svg.appendChild(e); return e; }
    var y = function (v) { return M.h + ih - (v / top) * ih; };
    var g = el("g", { class: "grid" });
    for (var i = 0; i <= 4; i++) {
      var v = (top / 4) * i;
      var l = document.createElementNS(NS, "line");
      l.setAttribute("x1", M.g); l.setAttribute("x2", W - M.d); l.setAttribute("y1", y(v)); l.setAttribute("y2", y(v));
      g.appendChild(l);
      var t = el("text", { x: M.g - 8, y: y(v) + 4, "text-anchor": "end" });
      t.textContent = ADM.nombre(v);
    }
    // Barre à bout arrondi (4 px), base carrée posée sur l'axe
    function chemin(x, w, v) {
      var y0 = y(0), y1 = y(v), r = Math.min(4, w / 2, y0 - y1);
      if (y0 - y1 < 0.5) return "";
      return "M" + x + "," + y0 + "V" + (y1 + r) + "Q" + x + "," + y1 + " " + (x + r) + "," + y1 + "H" + (x + w - r) + "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 + r) + "V" + y0 + "Z";
    }
    var mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    parMois.forEach(function (m, k) {
      var cx = M.g + bande * k + bande / 2;
      var x1 = cx - barre - 1, x2 = cx + 1; // 2 px d'écart entre les deux barres
      var d1 = chemin(x1, barre, m.encaisse), d2 = chemin(x2, barre, m.couts);
      if (d1) el("path", { d: d1, class: "b1" });
      if (d2) el("path", { d: d2, class: "b2" });
      var lab = el("text", { x: cx, y: H - 8, "text-anchor": "middle" });
      lab.textContent = mois[k];
      var zone = el("rect", { x: M.g + bande * k, y: M.h, width: bande, height: ih, fill: "transparent", class: "barre", tabindex: "0" });
      zone.setAttribute("aria-label", mois[k] + " : encaissé " + ADM.fcfa(m.encaisse) + ", coûts " + ADM.fcfa(m.couts) + ", marge " + ADM.fcfa(m.marge));
      function montrer(e) {
        var r = zone.getBoundingClientRect();
        bulle(ADM.libMois(m.mois), [["Encaissé", m.encaisse, "var(--series-1)"], ["Coûts", m.couts, "var(--series-2)"], ["Marge", m.marge, ""]],
          e && e.clientX ? e.clientX : r.left + r.width / 2, e && e.clientY ? e.clientY : r.top + 20);
      }
      zone.addEventListener("mousemove", montrer);
      zone.addEventListener("focus", montrer);
      zone.addEventListener("mouseleave", cacher);
      zone.addEventListener("blur", cacher);
    });
    el("line", { x1: M.g, x2: W - M.d, y1: y(0), y2: y(0), class: "axe" });
    wrap.appendChild(svg);
    var det = h('<details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:12.5px">Voir les chiffres</summary><div style="overflow-x:auto"><table class="table"><thead><tr><th>Mois</th><th class="n">Encaissé</th><th class="n">Coûts</th><th class="n">Marge</th></tr></thead><tbody></tbody></table></div></details>');
    parMois.forEach(function (m) {
      var tr = h('<tr><td></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>');
      var td = $$("td", tr);
      td[0].textContent = ADM.libMois(m.mois); td[1].textContent = ADM.fcfa(m.encaisse); td[2].textContent = ADM.fcfa(m.couts); td[3].textContent = ADM.fcfa(m.marge);
      $("tbody", det).appendChild(tr);
    });
    wrap.appendChild(det);
    return wrap;
  }
  var tip = null;
  function bulle(titre, lignes, x, yy) {
    if (!tip) { tip = h('<div class="tip" role="status"></div>'); document.body.appendChild(tip); }
    tip.innerHTML = "";
    var t = h('<div class="t"></div>'); t.textContent = titre; tip.appendChild(t);
    lignes.forEach(function (l) {
      var r = h('<div class="r"><i></i><b></b><span></span></div>');
      if (l[2]) $("i", r).style.background = l[2]; else $("i", r).style.visibility = "hidden";
      $("b", r).textContent = ADM.fcfa(l[1]); $("span", r).textContent = l[0];
      tip.appendChild(r);
    });
    tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x + 14)) + "px";
    tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, yy - tip.offsetHeight - 12)) + "px";
  }
  function cacher() { if (tip) tip.hidden = true; }

  function facturesDuMois() {
    var f = h('<div><p class="muted" style="font-size:13px;margin-top:12px">Un brouillon de facture pour chaque client actif qui a un montant mensuel, s’il n’en a pas déjà une pour ce mois. Vous relisez, puis vous émettez.</p>' +
      '<label>Mois</label><input type="month" data-k="mois"><div class="formfoot"><button class="btn primary">' + ic("receipt") + "Préparer les factures</button></div></div>");
    $('[data-k="mois"]', f).value = ADM.aujourdhui().slice(0, 7);
    var m = ADM.modale("Factures du mois", f);
    $("button", f).addEventListener("click", function () {
      var fin = ADM.attente(this);
      api("/api/crm/documents/facturer-mois", { method: "POST", body: { mois: $('[data-k="mois"]', f).value } }).then(function (r) {
        fin(); m.fermer();
        ADM.toast(r.crees ? r.crees + " brouillon(s) de facture créé(s)" : "Rien à faire : les factures de ce mois existent déjà, ou aucun client n’a de montant mensuel.");
        FIN.filtre = "facture"; ADM.rendre();
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
  }

  function reglagesFacturation(surFin) {
    api("/api/crm/facturation").then(function (r) {
      var f = h('<div><p class="muted" style="font-size:13px;margin-top:12px">Ces informations apparaissent sur vos devis et vos factures.</p>' +
        '<label>Nom ou raison sociale</label><input data-k="raisonSociale"><label>Adresse</label><input data-k="adresse">' +
        '<div class="row2"><div><label>Téléphone</label><input data-k="telephone"></div><div><label>Email</label><input data-k="email"></div></div>' +
        '<div class="row2"><div><label>NIF <span class="help">(facultatif)</span></label><input data-k="nif"></div><div><label>RCCM <span class="help">(facultatif)</span></label><input data-k="rccm"></div></div>' +
        '<label>Comment vous payer</label><textarea data-k="paiement" rows="3" placeholder="ex : Airtel Money au 07 00 00 00, ou virement BGFI…"></textarea>' +
        '<label>Mentions en bas de page <span class="help">(facultatif)</span></label><textarea data-k="mentions" rows="2"></textarea>' +
        '<div class="row2" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><label>TVA par défaut (%)</label><input data-k="tva" inputmode="decimal"></div>' +
        '<div><label>Acompte des devis (%)</label><input data-k="acompte" inputmode="numeric"></div><div><label>Taux horaire (FCFA)</label><input data-k="tauxHoraire" inputmode="numeric"></div></div>' +
        '<div class="row2"><div><label>Validité d’un devis (jours)</label><input data-k="validiteDevis" inputmode="numeric"></div><div><label>Délai de paiement (jours)</label><input data-k="delaiPaiement" inputmode="numeric"></div></div>' +
        '<div class="formfoot"><button class="btn primary">Enregistrer</button></div></div>');
      $$("[data-k]", f).forEach(function (i) { i.value = r[i.dataset.k] != null ? r[i.dataset.k] : ""; });
      var m = ADM.modale("Réglages de facturation", f, { large: true });
      $("button.primary", f).addEventListener("click", function () {
        var body = {};
        $$("[data-k]", f).forEach(function (i) { body[i.dataset.k] = i.value; });
        api("/api/crm/facturation", { method: "PUT", body: body }).then(function () { m.fermer(); ADM.toast("Réglages enregistrés"); if (surFin) surFin(); })
          .catch(function (e) { ADM.toast(e.message, "ko"); });
      });
    });
  }
  ADM.reglagesFacturation = reglagesFacturation;
})();
