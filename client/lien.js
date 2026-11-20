/* =========================================================================
   Page d'un client de Paule, ouverte par son lien secret (/lien/<jeton>) :
   validation des publications, brief, avis, devis ou facture, rapport.
   ========================================================================= */
(function () {
  "use strict";
  var jeton = (location.pathname.split("/").filter(Boolean)[1] || "").replace(/[^A-Za-z0-9_-]/g, "");
  var app = document.getElementById("app");
  var D = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function h(html) { var t = document.createElement("template"); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  function ic(n) { return '<i class="ph-duotone ph-' + n + '" aria-hidden="true"></i>'; }
  function txt(el, v) { el.textContent = v == null ? "" : String(v); return el; }
  function fcfa(n) { return (Number(n) || 0).toLocaleString("fr-FR") + " FCFA"; }
  function jourLong(j) { return j ? new Date(j + "T12:00:00+01:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Libreville" }) : ""; }
  function jourCourt(j) { return j ? new Date(j + "T12:00:00+01:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Libreville" }) : ""; }
  function libMois(m) { return new Date(m + "-15T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
  function waNum(tel) {
    var raw = String(tel || "").trim(), d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (raw.charAt(0) === "+") return d;
    if (d.indexOf("00") === 0) return d.slice(2);
    return d.length <= 9 ? "241" + d : d;
  }
  function envoyer(chemin, corps) {
    return fetch("/api/liens/" + encodeURIComponent(jeton) + chemin, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.erreur || "Erreur " + r.status); return d; }); });
  }
  function memo(k, v) { try { if (v === undefined) return localStorage.getItem("pa_lien_" + k) || ""; localStorage.setItem("pa_lien_" + k, v); } catch (e) { return ""; } }
  var ICONE_RESEAU = { Instagram: "instagram-logo", Facebook: "facebook-logo", TikTok: "tiktok-logo", LinkedIn: "linkedin-logo", WhatsApp: "whatsapp-logo", YouTube: "youtube-logo", X: "x-logo" };

  function erreurPage(msg) {
    app.innerHTML = "";
    var v = h('<div class="vide">' + ic("link-break") + "<p></p></div>");
    txt($("p", v), msg);
    app.appendChild(v);
  }

  fetch("/api/liens/" + encodeURIComponent(jeton)).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.erreur || "Ce lien n’est plus valable."); return d; });
  }).then(function (d) {
    D = d;
    var p = d.paule || {};
    txt($("#pNom"), p.nom);
    txt($("#pTitre"), p.titre);
    if (p.photo || p.logo) $("#pAv").style.backgroundImage = "url('" + String(p.photo || p.logo).replace(/'/g, "%27") + "')";
    var wa = waNum(p.whatsapp || p.telephone);
    if (wa) { $("#pWa").href = "https://wa.me/" + wa; $("#pWa").hidden = false; }
    app.innerHTML = "";
    ({ validation: validation, brief: brief, avis: avis, document: documentPage, rapport: rapport }[d.type] || function () { erreurPage("Lien inconnu."); })();
  }).catch(function (e) { erreurPage(e.message); });

  /* ======================================================================
     Validation des publications
  ====================================================================== */
  function validation() {
    document.title = "Vos publications à valider — " + D.paule.nom;
    var n = D.aValider.length;
    var tete = h('<div><h1>Vos publications à valider</h1><p class="sous"></p>' +
      '<label for="qui">Votre prénom <span style="font-weight:400;color:var(--ink-3)">(pour que Paule sache qui a répondu)</span></label><input id="qui" autocomplete="given-name"></div>');
    txt($(".sous", tete), n ? n + " publication" + (n > 1 ? "s" : "") + " préparée" + (n > 1 ? "s" : "") + " pour " + D.client.nom + ". Validez-les, ou dites ce qu’il faut changer." : "");
    var qui = $("#qui", tete);
    qui.value = memo("qui") || D.client.contact || "";
    qui.addEventListener("change", function () { memo("qui", qui.value.trim()); });
    app.appendChild(tete);
    if (!n) {
      app.appendChild(h('<div class="carte"><div class="vide">' + ic("check-circle") + "Rien à valider pour le moment. Paule vous enverra ce même lien quand de nouvelles publications seront prêtes.</div></div>"));
      $(".sous", tete).remove(); $("label", tete).remove(); qui.remove();
    }
    D.aValider.forEach(function (p) { app.appendChild(cartePublication(p, qui)); });
    if (D.recentes && D.recentes.length) {
      app.appendChild(h('<h2 style="font-size:16px;margin-top:34px">Déjà répondu</h2>'));
      D.recentes.forEach(function (p) { app.appendChild(cartePublication(p, qui, true)); });
    }
  }
  function cartePublication(p, qui, lecture) {
    var c = h('<article class="carte"><div class="carte-h">' + ic(ICONE_RESEAU[p.reseau] || "globe-simple") + "<span><b></b> · <span></span></span></div>" +
      '<div class="visuels"></div><div class="carte-b"><div class="sujet"></div><div class="legende"></div><div class="fil"></div></div></article>');
    txt($(".carte-h b", c), p.reseau + " · " + p.format);
    txt($(".carte-h span span", c), jourLong(p.date) + (p.heure ? " à " + p.heure : ""));
    var vis = $(".visuels", c);
    (p.visuels || []).forEach(function (u) {
      var video = /\.(mp4|webm|mov)(\?|$)/i.test(u) || u.indexOf("/video/upload/") !== -1;
      var m = document.createElement(video ? "video" : "img");
      m.src = u;
      if (video) { m.controls = true; m.playsInline = true; m.preload = "metadata"; } else { m.loading = "lazy"; m.alt = "Visuel de la publication"; }
      vis.appendChild(m);
    });
    if (!vis.children.length) vis.remove(); else if (vis.children.length > 1) vis.classList.add("plusieurs");
    if (p.sujet) txt($(".sujet", c), p.sujet); else $(".sujet", c).remove();
    if (p.legende) txt($(".legende", c), p.legende); else txt($(".legende", c), "(La légende sera ajoutée par Paule.)");
    var fil = $(".fil", c);
    (p.commentaires || []).forEach(function (x) {
      var com = h('<div class="com"><b></b><p></p></div>');
      txt($("b", com), x.auteur === "client" ? "Vous" : "Paule");
      txt($("p", com), x.texte);
      fil.appendChild(com);
    });
    if (lecture || p.statut !== "a_valider") {
      var ok = p.validation && p.validation.decision === "ok";
      c.appendChild(h('<div class="etat ' + (ok ? "ok" : "modif") + '">' + ic(ok ? "check-circle" : "pencil-simple-line") + (ok ? "Validée" : "Modification demandée") + "</div>"));
      return c;
    }
    var acts = h('<div class="actions"><button class="btn ok" data-a="ok">' + ic("check") + "Je valide</button><button class=\"btn\" data-a=\"modif\">" + ic("pencil-simple") + "Demander une modification</button></div>");
    var form = h('<div class="carte-b" hidden style="border-top:1px solid var(--line)"><label style="margin-top:0">Qu’est-ce qu’il faut changer ?</label><textarea rows="3" placeholder="ex : changer la photo, préciser le prix, publier plutôt vendredi"></textarea>' +
      '<div class="erreur"></div><button class="btn primary" data-a="envoyer">' + ic("paper-plane-tilt") + "Envoyer à Paule</button></div>");
    c.appendChild(acts);
    c.appendChild(form);
    function repondre(decision, btn) {
      var commentaire = decision === "modif" ? $("textarea", form).value.trim() : "";
      if (decision === "modif" && !commentaire) { txt($(".erreur", form), "Dites à Paule ce qu’il faut changer."); return; }
      btn.disabled = true;
      envoyer("/valider", { id: p.id, decision: decision, commentaire: commentaire, nom: qui.value.trim() }).then(function (n) {
        memo("qui", qui.value.trim());
        c.replaceWith(cartePublication(n, qui, true));
      }).catch(function (e) { btn.disabled = false; txt($(".erreur", form), e.message); if (decision === "ok") alert(e.message); });
    }
    $('[data-a="ok"]', acts).addEventListener("click", function () { repondre("ok", this); });
    $('[data-a="modif"]', acts).addEventListener("click", function () { form.hidden = false; $("textarea", form).focus(); });
    $('[data-a="envoyer"]', form).addEventListener("click", function () { repondre("modif", this); });
    return c;
  }

  /* ======================================================================
     Brief
  ====================================================================== */
  function brief() {
    document.title = "Votre brief — " + D.paule.nom;
    var f = h('<form><h1>Parlons de votre marque</h1><p class="sous"></p><div class="qs"></div>' +
      '<input class="pot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="erreur"></div><button class="btn primary" type="submit" style="margin-top:8px;width:100%">' + ic("paper-plane-tilt") + "Envoyer à Paule</button></form>");
    txt($(".sous", f), (D.dejaRempli ? "Vous avez déjà envoyé votre brief : vous pouvez le compléter et le renvoyer. " : "") +
      "Quelques questions pour que Paule connaisse " + (D.client.entreprise || D.client.nom) + " : répondez simplement, comme à l’oral. Tout est facultatif.");
    D.questions.forEach(function (q) {
      var l = h("<label></label>"); txt(l, q.label); l.htmlFor = "q_" + q.k;
      var champ = document.createElement(q.long ? "textarea" : "input");
      champ.id = "q_" + q.k; champ.name = q.k;
      if (q.long) champ.rows = 3;
      champ.value = (D.reponses || {})[q.k] || memo("brief_" + q.k) || "";
      champ.addEventListener("input", function () { memo("brief_" + q.k, champ.value); });
      $(".qs", f).appendChild(l); $(".qs", f).appendChild(champ);
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var reponses = {};
      $$(".qs [name]", f).forEach(function (c) { if (c.value.trim()) reponses[c.name] = c.value.trim(); });
      var b = $("button[type=submit]", f);
      b.disabled = true;
      envoyer("/brief", { reponses: reponses, website: $(".pot", f).value }).then(function () {
        app.innerHTML = "";
        app.appendChild(h('<div class="merci">' + ic("check-circle") + "<h1>Merci !</h1><p class=\"sous\">Paule a bien reçu votre brief. Elle revient vers vous très vite.</p></div>"));
        D.questions.forEach(function (q) { memo("brief_" + q.k, ""); });
      }).catch(function (er) { b.disabled = false; txt($(".erreur", f), er.message); });
    });
    app.appendChild(f);
  }

  /* ======================================================================
     Avis
  ====================================================================== */
  function avis() {
    document.title = "Votre avis — " + D.paule.nom;
    var note = 5;
    var f = h('<form><h1>Votre avis compte</h1><p class="sous"></p>' +
      '<label>Votre note</label><div class="etoiles" role="radiogroup" aria-label="Note sur 5"></div>' +
      '<label for="aTexte">Votre avis</label><textarea id="aTexte" rows="5" placeholder="Ce que Paule a fait pour vous, ce qui a changé, ce que vous avez apprécié…"></textarea>' +
      '<label for="aNom">Votre nom</label><input id="aNom" autocomplete="name">' +
      '<label for="aRole">Votre fonction et votre entreprise</label><input id="aRole" placeholder="ex : Gérante, Folie Douce">' +
      '<label class="check"><input type="checkbox" id="aOk" checked> J’accepte que Paule publie cet avis sur son site, avec mon nom et ma fonction.</label>' +
      '<input class="pot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="erreur"></div><button class="btn primary" type="submit" style="margin-top:8px;width:100%">' + ic("paper-plane-tilt") + "Envoyer mon avis</button></form>");
    txt($(".sous", f), "Merci de prendre une minute pour dire comment s’est passée votre collaboration avec " + D.paule.nom + ".");
    var et = $(".etoiles", f);
    for (var i = 1; i <= 5; i++) {
      (function (k) {
        var b = h('<button type="button" role="radio" aria-label="' + k + ' sur 5">★</button>');
        b.addEventListener("click", function () { note = k; dessiner(); });
        et.appendChild(b);
      })(i);
    }
    function dessiner() { $$("button", et).forEach(function (b, i2) { b.classList.toggle("on", i2 < note); b.setAttribute("aria-checked", i2 + 1 === note ? "true" : "false"); }); }
    dessiner();
    $("#aNom", f).value = D.client.contact || "";
    $("#aRole", f).value = D.client.entreprise || D.client.nom || "";
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = $("button[type=submit]", f);
      b.disabled = true;
      envoyer("/avis", { note: note, texte: $("#aTexte", f).value, nom: $("#aNom", f).value, role: $("#aRole", f).value, autorise: $("#aOk", f).checked, website: $(".pot", f).value })
        .then(function () {
          app.innerHTML = "";
          app.appendChild(h('<div class="merci">' + ic("heart") + "<h1>Merci beaucoup !</h1><p class=\"sous\">Votre avis a bien été envoyé à Paule.</p></div>"));
        }).catch(function (er) { b.disabled = false; txt($(".erreur", f), er.message); });
    });
    app.appendChild(f);
  }

  /* ======================================================================
     Devis ou facture
  ====================================================================== */
  function documentPage() {
    var d = D.document, em = D.emetteur || {}, cl = D.client || {}, t = d.totaux;
    var devis = d.type === "devis";
    document.title = (devis ? "Devis " : "Facture ") + d.numero + " — " + D.paule.nom;
    var outils = h('<div class="outils"><button class="btn primary" data-a="pdf">' + ic("file-pdf") + "Télécharger en PDF</button></div>");
    $('[data-a="pdf"]', outils).addEventListener("click", function () { window.print(); });
    app.appendChild(outils);
    var bandeau = null;
    if (d.statut === "annulee") bandeau = ["ko", "x-circle", "Cette facture a été annulée."];
    else if (d.statut === "payee") bandeau = ["ok", "check-circle", "Facture payée. Merci !"];
    else if (d.statut === "accepte") bandeau = ["ok", "seal-check", "Devis accepté" + (d.acceptation ? " par " + d.acceptation.nom + " le " + jourCourt(String(d.acceptation.date).slice(0, 10)) : "") + ". Merci !"];
    else if (d.statut === "refuse") bandeau = ["ko", "x-circle", "Ce devis n’est plus valable."];
    else if (d.enRetard) bandeau = ["ko", "warning-circle", "Le paiement de cette facture est attendu depuis le " + jourCourt(d.echeance) + "."];
    if (bandeau) { var bd = h('<div class="bandeau ' + bandeau[0] + '">' + ic(bandeau[1]) + "<span></span></div>"); txt($("span", bd), bandeau[2]); app.appendChild(bd); }

    var f = h('<article class="feuille"><div class="ent"><div class="em"></div><div><h2></h2><div class="num"></div></div></div>' +
      '<div class="cli"><small>' + (devis ? "Devis pour" : "Facturé à") + '</small><p class="nom" style="font-weight:700;color:#14171E;font-size:14px"></p><p class="det"></p></div>' +
      '<div class="objet"></div><table><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Prix unitaire</th><th class="n">Total</th></tr></thead><tbody></tbody></table>' +
      '<div class="tot"></div><div class="bas"></div></article>');
    var emb = $(".em", f);
    if (D.paule.logo) { var lg = document.createElement("img"); lg.className = "logo"; lg.src = D.paule.logo; lg.alt = ""; emb.appendChild(lg); }
    emb.appendChild(txt(document.createElement("b"), em.raisonSociale || D.paule.nom));
    [em.adresse, [em.telephone, em.email].filter(Boolean).join(" · "), [em.nif && "NIF " + em.nif, em.rccm && "RCCM " + em.rccm].filter(Boolean).join(" · ")]
      .filter(Boolean).forEach(function (l) { emb.appendChild(txt(document.createElement("p"), l)); });
    txt($("h2", f), devis ? "Devis" : "Facture");
    txt($(".num", f), "N° " + d.numero + " · " + jourCourt(d.dateEmission) + (d.echeance ? " · " + (devis ? "valable jusqu’au " : "à payer avant le ") + jourCourt(d.echeance) : ""));
    txt($(".cli .nom", f), cl.entreprise || cl.nom);
    txt($(".cli .det", f), [cl.entreprise && cl.nom !== cl.entreprise ? cl.nom : "", cl.adresse, cl.telephone, cl.email].filter(Boolean).join(" · "));
    if (d.objet) txt($(".objet", f), d.objet); else $(".objet", f).remove();
    (d.lignes || []).forEach(function (l) {
      var tr = h('<tr><td class="d"></td><td class="n"></td><td class="n"></td><td class="n"></td></tr>');
      var td = $$("td", tr);
      txt(td[0], l.designation); txt(td[1], String(l.quantite).replace(".", ",")); txt(td[2], fcfa(l.prixUnitaire)); txt(td[3], fcfa(Math.round(l.quantite * l.prixUnitaire)));
      $("tbody", f).appendChild(tr);
    });
    var tot = $(".tot", f);
    [["Sous-total", t.sousTotal], t.remise ? ["Remise", -t.remise] : null, d.tva ? ["TVA " + d.tva + " %", t.tva] : null, ["Total" + (d.tva ? " TTC" : ""), t.total, true],
      devis && d.acompte ? ["Acompte à la commande (" + d.acompte + " %)", t.acompte] : null,
      !devis && t.paye ? ["Déjà réglé", t.paye] : null, !devis && t.paye ? ["Reste à payer", t.reste, true] : null]
      .filter(Boolean).forEach(function (x) {
        var r = h('<div class="' + (x[2] ? "fort" : "") + '"><span></span><span></span></div>');
        txt(r.children[0], x[0]); txt(r.children[1], fcfa(x[1]));
        tot.appendChild(r);
      });
    txt($(".bas", f), [d.notes, em.paiement ? "Règlement : " + em.paiement : "", !d.tva ? "TVA non applicable." : "", em.mentions].filter(Boolean).join("\n\n"));
    app.appendChild(f);

    if (devis && d.statut === "envoye") {
      var acc = h('<div class="accepter"><b>Le devis vous convient ?</b><p class="note">En l’acceptant ici, vous donnez votre bon pour accord à Paule. Elle vous confirme la suite.</p>' +
        '<label for="accNom">Votre nom</label><input id="accNom" autocomplete="name"><div class="erreur"></div>' +
        '<button class="btn ok" style="width:100%">' + ic("seal-check") + "J’accepte ce devis</button></div>");
      $("#accNom", acc).value = memo("qui") || "";
      $("button", acc).addEventListener("click", function () {
        var b = this;
        b.disabled = true;
        envoyer("/accepter", { nom: $("#accNom", acc).value }).then(function (r) {
          memo("qui", $("#accNom", acc).value.trim());
          d.statut = r.statut; d.acceptation = r.acceptation;
          app.innerHTML = ""; documentPage();
        }).catch(function (e) { b.disabled = false; txt($(".erreur", acc), e.message); });
      });
      app.appendChild(acc);
    }
  }

  /* ======================================================================
     Rapport mensuel
  ====================================================================== */
  function rapport() {
    var r = D.rapport;
    document.title = (r.titre || "Bilan du mois") + " — " + D.paule.nom;
    var outils = h('<div class="outils"><button class="btn primary">' + ic("file-pdf") + "Télécharger en PDF</button></div>");
    $("button", outils).addEventListener("click", function () { window.print(); });
    app.appendChild(outils);
    var f = h('<article class="feuille"><div class="ent"><div class="em"></div><div><h2>Bilan</h2><div class="num"></div></div></div>' +
      '<div class="objet"></div><div class="chiffres"></div><div class="sections"></div></article>');
    var emb = $(".em", f);
    if (D.paule.logo) { var lg = document.createElement("img"); lg.className = "logo"; lg.src = D.paule.logo; lg.alt = ""; emb.appendChild(lg); }
    emb.appendChild(txt(document.createElement("b"), D.paule.nom));
    emb.appendChild(txt(document.createElement("p"), D.paule.titre));
    txt($(".num", f), D.client.nom + " · " + libMois(r.mois));
    txt($(".objet", f), r.titre);
    var ch = $(".chiffres", f);
    var liste = (r.chiffres || []).slice();
    if (r.publications && r.publications.publiees) liste.push({ libelle: "Publications mises en ligne", valeur: String(r.publications.publiees), evolution: "" });
    liste.forEach(function (x) {
      var c = h('<div class="chiffre"><span></span><b></b><small></small></div>');
      txt($("span", c), x.libelle); txt($("b", c), x.valeur);
      if (x.evolution) txt($("small", c), x.evolution); else $("small", c).remove();
      ch.appendChild(c);
    });
    if (!ch.children.length) ch.remove();
    var s = $(".sections", f);
    [["pointsForts", "Ce qui a bien marché"], ["aAmeliorer", "Ce qu’on peut améliorer"], ["recommandations", "Ce que je vous propose pour le mois prochain"]].forEach(function (x) {
      if (!(r[x[0]] || []).length) return;
      s.appendChild(txt(document.createElement("h3"), x[1]));
      var ul = document.createElement("ul");
      r[x[0]].forEach(function (t) { ul.appendChild(txt(document.createElement("li"), t)); });
      s.appendChild(ul);
    });
    if (r.bilan) {
      s.appendChild(txt(document.createElement("h3"), "Le bilan"));
      var p = txt(document.createElement("p"), r.bilan);
      p.style.whiteSpace = "pre-wrap"; p.style.marginTop = "6px";
      s.appendChild(p);
    }
    app.appendChild(f);
  }
})();
