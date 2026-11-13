/* =========================================================================
   Espace pro de Paule — ossature de l'application.
   Navigation, palette de commandes, notifications, thème, accueil,
   messagerie et réglages. Les autres vues (équipe, prospects, agenda,
   audience) s'enregistrent via ADM.vue() dans admin-vues.js et
   admin-audience.js. S'appuie sur le script de base d'admin.html :
   $, el, esc, api, TOKEN, logout, SCHEMAS, listView, formView, singletonView.
   ========================================================================= */
(function () {
  "use strict";

  var ADM = (window.ADM = { vues: {}, etat: { compteurs: {}, profil: {} } });

  /* ----------------------------------------------------------------------
     Outils partagés
  ---------------------------------------------------------------------- */
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function h(html) { var t = document.createElement("template"); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  function ic(n, cls) { return '<i class="ph-duotone ph-' + n + (cls ? " " + cls : "") + '" aria-hidden="true"></i>'; }
  ADM.$$ = $$; ADM.h = h; ADM.ic = ic;

  ADM.EQUIPE = {
    diagnostic: { prenom: "Nadia", cls: "nadia", poste: "Relation client" },
    prospection: { prenom: "Yann", cls: "yann", poste: "Développement commercial" },
    agenda: { prenom: "Awa", cls: "awa", poste: "Assistante de direction" },
  };
  ADM.avAgent = function (agent, taille, enLigne) {
    var e = ADM.EQUIPE[agent] || { prenom: "?", cls: "" };
    return '<span class="av ' + (taille || "") + " " + e.cls + '">' + esc(e.prenom.charAt(0)) +
      (enLigne === undefined ? "" : '<span class="etat' + (enLigne ? "" : " off") + '"></span>') + "</span>";
  };
  ADM.avInitiale = function (nom, taille) {
    return '<span class="av initiale ' + (taille || "") + '">' + esc(String(nom || "?").trim().charAt(0).toUpperCase() || "?") + "</span>";
  };
  ADM.verif = '<span class="verif" title="Profil officiel"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';

  ADM.aujourdhui = function () { return new Date(Date.now() + 3600000).toISOString().slice(0, 10); };
  ADM.ajouterJours = function (j, n) { var d = new Date(j + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  ADM.jourLong = function (j, opts) {
    return new Date(j + "T12:00:00+01:00").toLocaleDateString("fr-FR", Object.assign({ weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Libreville" }, opts || {}));
  };
  ADM.dateHeure = function (iso) {
    return iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Libreville" }) : "";
  };
  ADM.dateRel = function (iso) {
    if (!iso) return "";
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    var jour = function (x) { return new Date(x.getTime() + 3600000).toISOString().slice(0, 10); };
    if (s < 60) return "à l’instant";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (jour(d) === ADM.aujourdhui()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Libreville" });
    if (jour(d) === ADM.ajouterJours(ADM.aujourdhui(), -1)) return "hier";
    if (s < 6 * 86400) return d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "Africa/Libreville" });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Libreville" });
  };
  ADM.fcfa = function (n) { return (Number(n) || 0).toLocaleString("fr-FR") + " FCFA"; };
  ADM.nombre = function (n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (Math.round(n / 1e5) / 10).toLocaleString("fr-FR") + " M";
    if (n >= 1e4) return (Math.round(n / 100) / 10).toLocaleString("fr-FR") + " k";
    return n.toLocaleString("fr-FR");
  };
  ADM.court = function (s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  /** Texte d'un agent → HTML sûr (gras, italique, listes, liens). */
  ADM.markdown = function (txt) {
    function inline(s) {
      return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }
    var out = [], liste = null;
    esc(txt || "").split(/\n/).forEach(function (l) {
      var m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (m) { (liste = liste || []).push(m[1]); return; }
      if (liste) { out.push("<ul>" + liste.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>"); liste = null; }
      var t = l.replace(/^#{1,6}\s+/, "");
      if (t.trim()) out.push("<p>" + inline(t) + "</p>");
    });
    if (liste) out.push("<ul>" + liste.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>");
    return out.join("");
  };

  ADM.attente = function (btn, texte) {
    var avant = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + (texte ? " " + esc(texte) : "");
    return function () { btn.disabled = false; btn.innerHTML = avant; };
  };
  ADM.toast = function (texte, type) {
    var t = h('<div class="toast' + (type === "ko" ? " ko" : "") + '">' + ic(type === "ko" ? "warning-circle" : "check-circle") + "<span></span></div>");
    $("span", t).textContent = texte;
    $("#toasts").appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 3200);
  };
  ADM.copier = function (texte, btn) {
    var ok = function () { ADM.toast("Copié dans le presse-papiers"); };
    if (navigator.clipboard) navigator.clipboard.writeText(texte).then(ok, function () { prompt("Copiez :", texte); });
    else prompt("Copiez :", texte);
  };

  /* --- Couches : modale, tiroir, menus --- */
  var COUCHES = [];
  function ajouterCouche(noeud, opts) {
    var voile = opts && opts.sansVoile ? null : h('<div class="voile"></div>');
    var c = { noeud: noeud, voile: voile, surFermer: opts && opts.surFermer };
    if (voile) { $("#couches").appendChild(voile); voile.addEventListener("click", function () { ADM.fermer(c); }); }
    $("#couches").appendChild(noeud);
    COUCHES.push(c);
    return c;
  }
  ADM.fermer = function (c) {
    if (!c) c = COUCHES[COUCHES.length - 1];
    if (!c) return;
    COUCHES.splice(COUCHES.indexOf(c), 1);
    c.noeud.remove();
    if (c.voile) c.voile.remove();
    if (c.surFermer) c.surFermer();
  };
  ADM.toutFermer = function () { while (COUCHES.length) ADM.fermer(); };
  ADM.modale = function (titre, corps, opts) {
    var m = h('<div class="modale" role="dialog" aria-modal="true"><div class="modale-h"><h3></h3>' +
      '<button class="icobtn" aria-label="Fermer">' + ic("x") + '</button></div><div class="modale-b"></div></div>');
    $("h3", m).textContent = titre;
    if (opts && opts.large) m.style.width = "min(760px,calc(100vw - 32px))";
    var b = $(".modale-b", m);
    if (typeof corps === "string") b.innerHTML = corps; else if (corps) b.appendChild(corps);
    var c = ajouterCouche(m, opts);
    $(".modale-h button", m).addEventListener("click", function () { ADM.fermer(c); });
    var champ = m.querySelector("input,textarea,select");
    if (champ) setTimeout(function () { champ.focus(); }, 50);
    return { el: m, corps: b, fermer: function () { ADM.fermer(c); } };
  };
  ADM.tiroir = function (titre, corps, opts) {
    var t = h('<aside class="tiroir" role="dialog" aria-modal="true"><div class="tiroir-h"><h3></h3>' +
      '<button class="icobtn" aria-label="Fermer">' + ic("x") + '</button></div><div class="tiroir-b"></div></aside>');
    $("h3", t).textContent = titre;
    var b = $(".tiroir-b", t);
    if (typeof corps === "string") b.innerHTML = corps; else if (corps) b.appendChild(corps);
    var c = ajouterCouche(t, opts);
    $(".tiroir-h button", t).addEventListener("click", function () { ADM.fermer(c); });
    return { el: t, corps: b, fermer: function () { ADM.fermer(c); } };
  };
  ADM.menu = function (ancre, items) {
    var r = ancre.getBoundingClientRect();
    var m = h('<div class="notifs" style="width:240px;max-height:none"></div>');
    m.style.top = Math.min(innerHeight - 220, r.bottom + 6) + "px";
    m.style.left = Math.max(8, Math.min(innerWidth - 248, r.left)) + "px";
    m.style.right = "auto";
    items.forEach(function (it) {
      var b = h('<button class="ligne cliquable" style="width:100%;text-align:left;border-top:none">' + ic(it.icone) + '<span class="grow"></span></button>');
      $(".grow", b).textContent = it.label;
      b.addEventListener("click", function () { ADM.fermer(c); it.action(); });
      m.appendChild(b);
    });
    var c = ajouterCouche(m, { sansVoile: true });
    setTimeout(function () {
      document.addEventListener("click", function f(e) { if (!m.contains(e.target)) { document.removeEventListener("click", f); if (COUCHES.indexOf(c) !== -1) ADM.fermer(c); } });
    }, 0);
  };

  /* ----------------------------------------------------------------------
     Navigation
  ---------------------------------------------------------------------- */
  var NAV = [
    { sec: "Pilotage" },
    { id: "accueil", label: "Accueil", icone: "house" },
    { id: "messages", label: "Messages", icone: "chat-circle-text", badge: "nonLues" },
    { id: "equipe", label: "Équipe IA", icone: "users-three" },
    { id: "prospects", label: "Prospects", icone: "target", badge: "aContacter" },
    { id: "agenda", label: "Agenda", icone: "calendar-dots", badge: "aConfirmer", badgeCls: "chaud" },
    { id: "audience", label: "Audience", icone: "chart-line-up" },
    { sec: "Mon site" },
    { id: "site/posts", label: "Publications", icone: "squares-four" },
    { id: "site/creations", label: "Créations", icone: "palette" },
    { id: "site/videos", label: "Vidéos", icone: "film-slate" },
    { id: "site/etudes", label: "Études de cas", icone: "book-open-text" },
    { id: "site/registre", label: "Registre", icone: "handshake" },
    { id: "site/formules", label: "Formules", icone: "tag" },
    { id: "site/avis", label: "Avis clients", icone: "quotes" },
    { id: "profil", label: "Profil", icone: "user-circle" },
    { id: "apropos", label: "À propos", icone: "identification-card" },
    { sec: "Compte" },
    { id: "reglages", label: "Réglages", icone: "gear-six" },
  ];
  var MNAV = [
    { id: "accueil", label: "Accueil", icone: "house" },
    { id: "messages", label: "Messages", icone: "chat-circle-text", badge: "nonLues" },
    { id: "equipe", label: "Équipe", icone: "users-three" },
    { id: "agenda", label: "Agenda", icone: "calendar-dots", badge: "aConfirmer" },
    { id: "__menu", label: "Plus", icone: "dots-three-outline" },
  ];
  ADM.NAV = NAV;

  function route() {
    var brut = decodeURIComponent((location.hash || "").replace(/^#/, "")) || "accueil";
    var p = brut.split("/");
    return { brut: brut, base: p[0], params: p.slice(1) };
  }
  ADM.route = route;
  ADM.aller = function (hash) {
    if (location.hash === "#" + hash) rendre(); else location.hash = hash;
  };
  ADM.vue = function (nom, def) { ADM.vues[nom] = def; };
  ADM.titre = function (t, s) {
    $("#titre").textContent = t || "";
    $("#sousTitre").textContent = s || "";
    document.title = (t ? t + " — " : "") + "Espace pro de Paule";
  };

  function dessinerNav() {
    var nav = $("#nav");
    nav.innerHTML = "";
    NAV.forEach(function (n) {
      if (n.sec) { nav.appendChild(h('<div class="sb-sec">' + esc(n.sec) + "</div>")); return; }
      var b = h('<a class="sb-it" href="#' + n.id + '" data-nav="' + n.id + '">' + ic(n.icone) + "<span>" + esc(n.label) + "</span>" +
        (n.badge ? '<span class="n' + (n.badgeCls ? " " + n.badgeCls : "") + '" data-badge="' + n.badge + '" hidden></span>' : "") + "</a>");
      b.addEventListener("click", function () { $("#appView").classList.remove("menu-ouvert"); });
      nav.appendChild(b);
    });
    var mnav = $("#mnav");
    mnav.innerHTML = "";
    MNAV.forEach(function (n) {
      var b = h('<button data-nav="' + n.id + '">' + ic(n.icone) + "<span>" + esc(n.label) + "</span>" +
        (n.badge ? '<b class="n" data-badge="' + n.badge + '" hidden></b>' : "") + "</button>");
      b.addEventListener("click", function () {
        if (n.id === "__menu") $("#appView").classList.add("menu-ouvert");
        else ADM.aller(n.id);
      });
      mnav.appendChild(b);
    });
  }
  function marquerNav(base, brut) {
    $$("[data-nav]").forEach(function (b) {
      var id = b.dataset.nav;
      b.classList.toggle("on", id === brut || id === base || (base === "site" && id === brut.split("/").slice(0, 2).join("/")));
    });
  }
  ADM.majBadges = function () {
    var c = ADM.etat.compteurs;
    $$("[data-badge]").forEach(function (b) {
      var n = c[b.dataset.badge] || 0;
      b.textContent = n > 99 ? "99+" : n;
      b.hidden = !n;
    });
  };
  ADM.rafraichirCompteurs = function () {
    return api("/api/crm/dashboard").then(function (d) {
      ADM.etat.dash = d;
      ADM.etat.compteurs = {
        nonLues: d.demandes.nonLues, aConfirmer: d.aConfirmer || 0,
        aContacter: (d.prospects.parStatut || {}).a_contacter || 0, relances: (d.relances || []).length,
      };
      ADM.majBadges();
      return d;
    }).catch(function () {});
  };

  function dessinerEquipeLaterale() {
    api("/api/crm/equipe").then(function (liste) {
      ADM.etat.equipe = liste;
      var box = $("#sbTeam");
      box.innerHTML = '<div class="sb-sec">Votre équipe</div>';
      liste.forEach(function (a) {
        var b = h('<a class="sb-agent" href="#equipe/' + a.agent + '">' + ADM.avAgent(a.agent, "sm", a.configure) +
          "<span><b></b><small></small></span></a>");
        $("b", b).textContent = a.prenom;
        $("small", b).textContent = a.dernier ? ADM.court(a.dernier.texte, 40) : a.poste;
        b.addEventListener("click", function () { $("#appView").classList.remove("menu-ouvert"); });
        box.appendChild(b);
      });
    }).catch(function () {});
  }
  ADM.rafraichirEquipe = dessinerEquipeLaterale;

  function rendre() {
    var r = route();
    ADM.toutFermer();
    var bulle = document.querySelector(".tip");
    if (bulle) bulle.hidden = true;
    var panel = $("#panel");
    panel.className = "panel";
    panel.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    marquerNav(r.base, r.brut);
    window.scrollTo(0, 0);

    if (r.base === "site" && typeof SCHEMAS !== "undefined" && SCHEMAS[r.params[0]]) {
      var s = SCHEMAS[r.params[0]];
      ADM.titre(s.label, "Contenu de votre site");
      listView(r.params[0]);
      if (r.params[1] === "nouveau") {
        setTimeout(function () { var b = document.getElementById("addBtn"); if (b) b.click(); }, 400);
      }
      return;
    }
    if (r.base === "profil") { ADM.titre("Profil", "Votre carte de visite sur le site"); return singletonView("/api/profile", PROFILE_SCHEMA); }
    if (r.base === "apropos") { ADM.titre("À propos", "Votre parcours et vos services"); return singletonView("/api/apropos", APROPOS_SCHEMA); }

    var v = ADM.vues[r.base] || ADM.vues.accueil;
    ADM.titre(v.titre, v.sous);
    if (v.plein) panel.classList.add("plein");
    try { v.rendu(r.params, panel); }
    catch (e) { console.error(e); panel.innerHTML = '<div class="empty">' + ic("warning-circle") + esc(e.message) + "</div>"; }
  }
  ADM.rendre = rendre;
  window.addEventListener("hashchange", rendre);

  /** Erreur dans une vue : message lisible à la place du contenu. */
  ADM.erreur = function (panel) {
    return function (e) { panel.innerHTML = '<div class="empty">' + ic("warning-circle") + esc(e.message) + "</div>"; };
  };

  /* ----------------------------------------------------------------------
     Thème clair / sombre
  ---------------------------------------------------------------------- */
  function sombreActif() {
    var t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  ADM.appliquerTheme = function (choix) {
    if (choix === "dark" || choix === "light") document.documentElement.dataset.theme = choix;
    else delete document.documentElement.dataset.theme;
    try { if (choix === "dark" || choix === "light") localStorage.setItem("adm-theme", choix); else localStorage.removeItem("adm-theme"); } catch (e) {}
    var sombre = sombreActif();
    $("#themeBtn").innerHTML = ic(sombre ? "sun" : "moon");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = sombre ? "#0B0E15" : "#ffffff";
    if (ADM.surTheme) ADM.surTheme();
  };

  /* ----------------------------------------------------------------------
     Palette de commandes (Ctrl/⌘ K)
  ---------------------------------------------------------------------- */
  var ICONES_TYPE = { message: "chat-circle-text", prospect: "target", rdv: "calendar-dots", post: "squares-four", creation: "palette", etude: "book-open-text", equipe: "users-three" };
  var LIB_TYPE = { message: "Demandes", prospect: "Prospects", rdv: "Rendez-vous", post: "Publications", creation: "Créations", etude: "Études de cas", equipe: "Conversations" };
  function commandes() {
    var c = [
      { g: "Actions", icone: "chat-circle-dots", titre: "Discuter avec Nadia", sous: "Relation client", action: function () { ADM.aller("equipe/diagnostic"); } },
      { g: "Actions", icone: "chat-circle-dots", titre: "Discuter avec Yann", sous: "Prospection", action: function () { ADM.aller("equipe/prospection"); } },
      { g: "Actions", icone: "chat-circle-dots", titre: "Discuter avec Awa", sous: "Agenda & relances", action: function () { ADM.aller("equipe/agenda"); } },
      { g: "Actions", icone: "calendar-plus", titre: "Nouveau rendez-vous", action: function () { if (ADM.nouveauRdv) ADM.nouveauRdv(); else ADM.aller("agenda"); } },
      { g: "Actions", icone: "plus-square", titre: "Nouvelle publication", action: function () { ADM.aller("site/posts/nouveau"); } },
      { g: "Actions", icone: "magnifying-glass-plus", titre: "Trouver des prospects", action: function () { ADM.aller("prospects/trouver"); } },
      { g: "Actions", icone: "circle-half", titre: "Basculer le thème clair / sombre", action: function () { ADM.appliquerTheme(sombreActif() ? "light" : "dark"); } },
      { g: "Actions", icone: "arrow-square-out", titre: "Voir mon site", action: function () { window.open("/", "_blank", "noopener"); } },
    ];
    NAV.forEach(function (n) { if (n.id) c.push({ g: "Aller à", icone: n.icone, titre: n.label, action: function () { ADM.aller(n.id); } }); });
    c.push({ g: "Aller à", icone: "sign-out", titre: "Se déconnecter", action: function () { logout(); } });
    return c;
  }
  ADM.palette = function () {
    if ($(".cmd")) return;
    var p = h('<div class="cmd" role="dialog" aria-modal="true" aria-label="Rechercher">' +
      '<div class="cmd-in">' + ic("magnifying-glass") + '<input type="text" placeholder="Rechercher une demande, un prospect, un rendez-vous… ou une action" aria-label="Rechercher"></div>' +
      '<div class="cmd-l" role="listbox"></div>' +
      '<div class="cmd-f"><span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div></div>');
    var c = ajouterCouche(p);
    var input = $("input", p), liste = $(".cmd-l", p);
    var items = [], sel = 0, minuteur, jeton = 0;
    function dessiner(resultats) {
      var q = input.value.trim().toLowerCase();
      var cmds = commandes().filter(function (x) { return !q || (x.titre + " " + (x.sous || "")).toLowerCase().indexOf(q) !== -1; });
      items = (resultats || []).map(function (r) {
        return { g: LIB_TYPE[r.type] || "Résultats", icone: ICONES_TYPE[r.type] || "file", titre: r.titre, sous: r.sous, action: function () { ouvrirResultat(r); } };
      }).concat(cmds.slice(0, q ? 8 : 20));
      sel = 0;
      liste.innerHTML = "";
      var groupe = "";
      if (!items.length) liste.innerHTML = '<div class="empty" style="padding:28px">Aucun résultat</div>';
      items.forEach(function (it, i) {
        if (it.g !== groupe) { groupe = it.g; liste.appendChild(h('<div class="cmd-g">' + esc(groupe) + "</div>")); }
        var n = h('<div class="cmd-it" role="option">' + ic(it.icone) + '<span class="grow"><b></b><small></small></span></div>');
        $("b", n).textContent = it.titre;
        $("small", n).textContent = it.sous || "";
        n.addEventListener("mousemove", function () { if (sel !== i) { sel = i; marquer(); } });
        n.addEventListener("click", function () { lancer(i); });
        liste.appendChild(n);
      });
      marquer();
    }
    function marquer() {
      $$(".cmd-it", liste).forEach(function (n, i) { n.classList.toggle("on", i === sel); if (i === sel) n.scrollIntoView({ block: "nearest" }); });
    }
    function lancer(i) { var it = items[i]; if (!it) return; ADM.fermer(c); it.action(); }
    input.addEventListener("input", function () {
      clearTimeout(minuteur);
      var q = input.value.trim();
      dessiner(null);
      if (q.length < 2) return;
      var mon = ++jeton;
      minuteur = setTimeout(function () {
        api("/api/crm/recherche?q=" + encodeURIComponent(q)).then(function (d) { if (mon === jeton) dessiner(d.resultats); }).catch(function () {});
      }, 220);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); marquer(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); marquer(); }
      else if (e.key === "Enter") { e.preventDefault(); lancer(sel); }
    });
    dessiner(null);
    setTimeout(function () { input.focus(); }, 30);
  };
  function ouvrirResultat(r) {
    if (r.type === "message") ADM.aller("messages/" + r.id);
    else if (r.type === "prospect") ADM.aller("prospects/" + r.id);
    else if (r.type === "rdv") ADM.aller("agenda/rdv/" + r.id);
    else if (r.type === "equipe") ADM.aller("equipe/" + r.id);
    else if (r.type === "post") ADM.aller("site/posts");
    else if (r.type === "creation") ADM.aller("site/creations");
    else if (r.type === "etude") ADM.aller("site/etudes");
  }

  /* ----------------------------------------------------------------------
     Notifications (fil d'activité)
  ---------------------------------------------------------------------- */
  function vuLe() { try { return localStorage.getItem("adm-notif-vu") || ""; } catch (e) { return ""; } }
  ADM.verifierNotifs = function () {
    return api("/api/crm/activite").then(function (d) {
      ADM.etat.activite = d.evenements;
      var vu = vuLe();
      $("#notifDot").hidden = !d.evenements.some(function (e) { return e.date > vu; });
      return d.evenements;
    }).catch(function () { return []; });
  };
  ADM.ouvrirEvenement = function (e) {
    if (e.type === "message") ADM.aller("messages/" + e.id);
    else if (e.type === "rdv") ADM.aller("agenda/rdv/" + e.id);
    else if (e.type === "prospect") ADM.aller("prospects/" + e.id);
    else if (e.type === "ia") ADM.aller("equipe/" + e.id);
  };
  ADM.ligneEvenement = function (e, vu) {
    var cls = e.echec ? "ko" : e.type === "rdv" ? "chaud" : e.type === "prospect" ? "ok" : "";
    var visuel = e.agent ? ADM.avAgent(e.agent, "", undefined) : '<span class="ico-rond ' + cls + '">' + ic(e.icone || "bell") + "</span>";
    var l = h('<div class="ligne cliquable' + (vu !== undefined && e.date > vu ? " nouveau" : "") + '">' + visuel +
      '<div class="grow"><b></b><small></small></div><small class="faint">' + esc(ADM.dateRel(e.date)) + "</small></div>");
    $(".grow b", l).textContent = e.texte;
    $(".grow small", l).textContent = e.sous || "";
    l.addEventListener("click", function () { ADM.toutFermer(); ADM.ouvrirEvenement(e); });
    return l;
  };
  function ouvrirNotifs() {
    var p = h('<div class="notifs" role="dialog" aria-label="Notifications"><div class="notifs-h"><b>Notifications</b>' +
      '<button class="btn ghost sm">Tout marquer comme vu</button></div><div class="notifs-b"><div class="empty"><span class="spin"></span></div></div></div>');
    var c = ajouterCouche(p, { sansVoile: true });
    var vu = vuLe();
    ADM.verifierNotifs().then(function (ev) {
      var b = $(".notifs-b", p);
      b.innerHTML = ev.length ? "" : '<div class="empty">' + ic("bell-simple") + "Rien de nouveau pour le moment.</div>";
      ev.forEach(function (e) { b.appendChild(ADM.ligneEvenement(e, vu)); });
    });
    $(".notifs-h button", p).addEventListener("click", function () {
      try { localStorage.setItem("adm-notif-vu", new Date().toISOString()); } catch (e) {}
      $("#notifDot").hidden = true;
      $$(".ligne.nouveau", p).forEach(function (l) { l.classList.remove("nouveau"); });
    });
    setTimeout(function () {
      document.addEventListener("click", function f(e) {
        if (!p.contains(e.target) && !$("#notifBtn").contains(e.target)) { document.removeEventListener("click", f); if (COUCHES.indexOf(c) !== -1) ADM.fermer(c); }
      });
    }, 0);
  }

  /* ----------------------------------------------------------------------
     Démarrage
  ---------------------------------------------------------------------- */
  function chargerProfil() {
    return api("/api/profile").then(function (p) {
      ADM.etat.profil = p || {};
      if (p && p.photo) {
        $("#sbMeAv").style.backgroundImage = "url('" + p.photo.replace(/'/g, "%27") + "')";
        $("#sbMeAv").textContent = "";
      }
      return p;
    }).catch(function () { return {}; });
  }

  window.enter = function () {
    $("#loginView").hidden = true;
    $("#appView").hidden = false;
    if (!window.__admDemarre) {
      window.__admDemarre = true;
      dessinerNav();
      $$("[data-cmd]").forEach(function (b) { b.addEventListener("click", ADM.palette); });
      $("#notifBtn").addEventListener("click", function (e) { e.stopPropagation(); if ($(".notifs")) ADM.toutFermer(); else ouvrirNotifs(); });
      $("#themeBtn").addEventListener("click", function () { ADM.appliquerTheme(sombreActif() ? "light" : "dark"); });
      $("#menuBtn").addEventListener("click", function () { $("#appView").classList.add("menu-ouvert"); });
      $("#sbVoile").addEventListener("click", function () { $("#appView").classList.remove("menu-ouvert"); });
      $("#sbMe").addEventListener("click", function (e) {
        e.stopPropagation();
        ADM.menu(this, [
          { icone: "arrow-square-out", label: "Voir mon site", action: function () { window.open("/", "_blank", "noopener"); } },
          { icone: "gear-six", label: "Réglages", action: function () { ADM.aller("reglages"); } },
          { icone: "sign-out", label: "Se déconnecter", action: function () { logout(); } },
        ]);
      });
      if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $("#kbdCmd").textContent = "⌘ K";
      setInterval(function () { ADM.rafraichirCompteurs(); ADM.verifierNotifs(); }, 60000);
    }
    ADM.appliquerTheme(document.documentElement.dataset.theme || "systeme");
    chargerProfil();
    ADM.rafraichirCompteurs();
    ADM.verifierNotifs();
    dessinerEquipeLaterale();
    rendre();
  };

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k" && !$("#appView").hidden) { e.preventDefault(); ADM.palette(); }
    if (e.key === "Escape" && COUCHES.length) { e.preventDefault(); ADM.fermer(); }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (!document.documentElement.dataset.theme && !$("#appView").hidden) ADM.appliquerTheme("systeme");
  });

  document.addEventListener("DOMContentLoaded", function () {
    if (TOKEN) api("/api/messages?limite=1").then(function () { window.enter(); }).catch(function () { logout(); });
    else $("#loginView").hidden = false;
  });

  /* ======================================================================
     ACCUEIL
  ====================================================================== */
  ADM.vue("accueil", {
    titre: "Accueil",
    sous: "Votre activité en un coup d’œil",
    rendu: function (params, panel) {
      Promise.all([
        api("/api/crm/dashboard"), api("/api/profile").catch(function () { return {}; }), api("/api/crm/equipe").catch(function () { return []; }),
        api("/api/crm/activite").catch(function () { return { evenements: [] }; }), api("/api/crm/audience?jours=30").catch(function () { return null; }),
      ]).then(function (r) {
        var d = r[0], p = r[1] || {}, equipe = r[2] || [], ev = r[3].evenements || [], au = r[4];
        var heure = new Date(Date.now() + 3600000).getUTCHours();
        var salut = heure < 5 || heure >= 18 ? "Bonsoir" : "Bonjour";
        panel.innerHTML = "";

        /* --- Héros façon profil social --- */
        var visites30 = au ? au.totaux.visites : (d.trafic.mois.vue || 0);
        var hero = h('<section class="hero">' +
          '<div class="hero-cover" style="background-image:url(/media/asset-02-022842f5e9.jpg)"></div>' +
          '<div class="hero-av"><div></div><span class="enligne" title="En ligne"></span></div>' +
          '<h2 class="hero-nom"><span></span>' + ADM.verif + "</h2>" +
          '<p class="hero-meta"></p>' +
          '<p class="hero-salut"></p>' +
          '<div class="hero-stats">' +
          '<a class="hero-stat" href="#messages"><b>' + ADM.nombre(d.demandes.mois) + "</b><span>demandes (30 j)</span></a>" +
          '<a class="hero-stat" href="#prospects"><b>' + ADM.nombre(d.gagnes) + "</b><span>clients gagnés</span></a>" +
          '<a class="hero-stat" href="#prospects"><b>' + ADM.nombre(d.prospects.total) + "</b><span>prospects</span></a>" +
          '<a class="hero-stat" href="#audience"><b>' + ADM.nombre(visites30) + "</b><span>visites (30 j)</span></a>" +
          "</div>" +
          '<div class="hero-actions">' +
          '<a class="btn primary" href="#equipe">' + ic("chat-circle-dots") + "Écrire à l’équipe</a>" +
          '<button class="btn" data-a="rdv">' + ic("calendar-plus") + "Nouveau rendez-vous</button>" +
          '<a class="btn" href="#site/posts/nouveau">' + ic("plus-square") + "Nouvelle publication</a>" +
          '<a class="btn" href="/" target="_blank" rel="noopener">' + ic("arrow-square-out") + "Voir mon site</a>" +
          "</div></section>");
        if (p.photo) $(".hero-av div", hero).style.backgroundImage = "url('" + String(p.photo).replace(/'/g, "%27") + "')";
        $(".hero-nom span", hero).textContent = p.nom || "Paule Ackerman";
        $(".hero-meta", hero).textContent = [p.handle, p.titre, p.localisation].filter(Boolean).join(" · ");
        $(".hero-salut", hero).textContent = salut + " Paule, nous sommes " + ADM.jourLong(d.aujourdhui) + ".";
        $('[data-a="rdv"]', hero).addEventListener("click", function () { if (ADM.nouveauRdv) ADM.nouveauRdv(); else ADM.aller("agenda"); });
        panel.appendChild(hero);

        /* --- Alertes de configuration --- */
        var alertes = [];
        var ia = d.ia.agents;
        if (!ia.prospection.configure) alertes.push("Yann (prospection) attend sa clé : ajoutez ANTHROPIC_API_KEY dans Vercel.");
        if (!ia.diagnostic.configure) alertes.push("Nadia et Awa attendent leur clé : ajoutez OPENAI_API_KEY dans Vercel.");
        if (!d.alertesEmail) alertes.push("Alertes email inactives : ajoutez RESEND_API_KEY et NOTIFY_EMAIL pour être prévenue de chaque demande.");
        if (alertes.length) panel.appendChild(h('<div class="hint alerte">' + ic("info") + "<div>" + alertes.map(esc).join("<br>") + "</div></div>"));

        /* --- L'équipe --- */
        var strip = h('<div class="equipe-strip"></div>');
        equipe.forEach(function (a) {
          var c = h('<a class="employe" href="#equipe/' + a.agent + '"><div class="haut">' + ADM.avAgent(a.agent, "lg", a.configure) +
            '<div><b></b><small></small></div></div><p></p><div class="bas"><span class="pill ' + (a.configure ? "ok" : "ko") + '">' +
            (a.configure ? "En ligne" : "Clé manquante") + '</span><span class="pill contour">' + esc(a.fournisseur) + '</span><span class="sp"></span>' +
            '<span class="btn sm soft">' + ic("chat-circle-dots") + "Discuter</span></div></a>");
          $(".haut b", c).textContent = a.prenom;
          $(".haut small", c).textContent = a.poste;
          $("p", c).textContent = a.dernier ? (a.dernier.role === "assistant" ? "" : "Vous : ") + a.dernier.texte : a.presentation;
          strip.appendChild(c);
        });
        panel.appendChild(strip);

        /* --- À faire + activité --- */
        var grille = h('<div class="grille g-12"></div>');
        var faire = h('<section class="sec"><div class="sec-h"><h3>' + ic("check-square-offset") + "À faire</h3><small></small></div><div class=\"sec-b flush\"></div></section>");
        var fb = $(".sec-b", faire), n = 0;
        if (d.demandes.nonLues) {
          n++;
          var l1 = h('<a class="ligne cliquable" href="#messages"><span class="ico-rond">' + ic("chat-circle-text") + '</span><div class="grow"><b></b><small>Répondez vite : un client relancé tard est souvent perdu.</small></div>' + ic("caret-right") + "</a>");
          $("b", l1).textContent = d.demandes.nonLues + " demande" + (d.demandes.nonLues > 1 ? "s" : "") + " non lue" + (d.demandes.nonLues > 1 ? "s" : "");
          fb.appendChild(l1);
        }
        (d.rdvs || []).forEach(function (rv) {
          n++;
          var aConf = rv.statut === "a_confirmer";
          var l = h('<a class="ligne cliquable" href="#agenda/rdv/' + rv._id + '"><span class="ico-rond ' + (aConf ? "chaud" : "") + '">' + ic(aConf ? "calendar-check" : "calendar-dots") +
            '</span><div class="grow"><b></b><small></small></div>' + (aConf ? '<span class="pill chaud">à confirmer</span>' : "") + "</a>");
          $("b", l).textContent = (rv.titre || "Rendez-vous") + " · " + (rv.avec || "");
          $("small", l).textContent = rv.quand + " · " + (rv.dureeMin || 30) + " min";
          fb.appendChild(l);
        });
        (d.relances || []).forEach(function (rl) {
          n++;
          var retard = rl.relanceLe < d.aujourdhui;
          var l = h('<a class="ligne cliquable" href="#' + (rl.type === "message" ? "messages/" : "prospects/") + rl.id + '"><span class="ico-rond ' + (retard ? "ko" : "chaud") + '">' + ic("arrow-bend-up-right") +
            '</span><div class="grow"><b></b><small></small></div><span class="pill ' + (retard ? "ko" : "chaud") + '">' + (retard ? "en retard" : "aujourd’hui") + "</span></a>");
          $("b", l).textContent = "Relancer " + rl.nom;
          $("small", l).textContent = rl.note || rl.besoin || (rl.type === "message" ? "Demande reçue" : "Prospect");
          fb.appendChild(l);
        });
        if (!n) fb.appendChild(h('<div class="empty" style="padding:30px 16px">' + ic("coffee") + "Rien d’urgent. Profitez-en pour publier ou prospecter.</div>"));
        $(".sec-h small", faire).textContent = n ? n + " élément" + (n > 1 ? "s" : "") : "";

        var act = h('<section class="sec"><div class="sec-h"><h3>' + ic("pulse") + 'Activité récente</h3><button class="btn ghost sm" data-a="tout">Tout voir</button></div><div class="sec-b flush"></div></section>');
        var ab = $(".sec-b", act);
        if (!ev.length) ab.appendChild(h('<div class="empty" style="padding:30px 16px">' + ic("bell-simple") + "Aucune activité pour le moment.</div>"));
        ev.slice(0, 7).forEach(function (e) { ab.appendChild(ADM.ligneEvenement(e)); });
        $('[data-a="tout"]', act).addEventListener("click", function (e) { e.stopPropagation(); $("#notifBtn").click(); });
        grille.appendChild(faire);
        grille.appendChild(act);
        panel.appendChild(grille);

        /* --- Le site sur 30 jours --- */
        if (au && ADM.tuileDelta) {
          var t = au.totaux, pr = au.precedent;
          var tuiles = h('<div class="tuiles" style="margin-top:16px"></div>');
          tuiles.appendChild(ADM.tuileDelta("Visites", t.visites, pr.visites, "audience"));
          tuiles.appendChild(ADM.tuileDelta("Conversations ouvertes", t.conversations, pr.conversations, "audience"));
          tuiles.appendChild(ADM.tuileDelta("Demandes reçues", t.demandes, pr.demandes, "messages"));
          tuiles.appendChild(ADM.tuileDelta("Appels réservés", t.rdv, pr.rdv, "agenda"));
          var titreSec = h('<div class="bar" style="margin:22px 0 10px"><h2 style="font-size:16px">Votre site sur 30 jours</h2><a class="btn ghost sm" href="#audience">Voir l’audience' + ic("caret-right") + "</a></div>");
          panel.appendChild(titreSec);
          panel.appendChild(tuiles);
        }
      }).catch(ADM.erreur(panel));
    },
  });

  /* ======================================================================
     MESSAGES : boîte de réception en deux panneaux
  ====================================================================== */
  var ST_MSG = [["nouveau", "Nouveau"], ["en_discussion", "En discussion"], ["devis_envoye", "Devis envoyé"], ["gagne", "Gagné"], ["perdu", "Perdu"]];
  ADM.ST_MSG = ST_MSG;
  function options(liste, v) {
    return liste.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("");
  }
  ADM.options = options;
  function libelle(liste, v) { var x = liste.filter(function (o) { return o[0] === v; })[0]; return x ? x[1] : v; }
  ADM.libelle = libelle;
  var MSG = { filtre: "tous", statut: "", q: "" };

  ADM.vue("messages", {
    titre: "Messages",
    sous: "Les demandes reçues depuis votre site",
    plein: true,
    rendu: function (params, panel) {
      panel.innerHTML =
        '<div class="inbox">' +
        '<div class="inbox-l"><div class="inbox-f">' +
        '<div class="segs" role="tablist">' + [["tous", "Toutes"], ["nonlus", "Non lues"], ["relancer", "À relancer"], ["spam", "Spam"]].map(function (f) {
          return '<button data-f="' + f[0] + '"' + (MSG.filtre === f[0] ? ' class="on"' : "") + ">" + f[1] + "</button>";
        }).join("") + "</div>" +
        '<div style="display:flex;gap:8px"><input type="search" placeholder="Rechercher…" aria-label="Rechercher" style="height:34px">' +
        '<select aria-label="Étape" style="width:auto;height:34px;padding:0 8px"><option value="">Toutes les étapes</option>' + options(ST_MSG, MSG.statut) + "</select></div>" +
        '</div><div class="inbox-list"><div class="empty"><span class="spin"></span></div></div></div>' +
        '<div class="inbox-d"></div></div>';
      var boite = $(".inbox", panel), liste = $(".inbox-list", panel), detail = $(".inbox-d", panel);
      var champ = $("input[type=search]", panel), etape = $("select", panel);
      champ.value = MSG.q;
      var items = [], selId = params[0] || "";

      function charger() {
        var url = "/api/messages?limite=100&filtre=" + (MSG.filtre === "relancer" ? "tous" : MSG.filtre) +
          "&q=" + encodeURIComponent(MSG.q) + (MSG.statut ? "&statut=" + MSG.statut : "");
        return api(url).then(function (d) {
          items = d.items;
          if (MSG.filtre === "relancer") {
            var auj = ADM.aujourdhui();
            items = items.filter(function (m) { return m.relanceLe && m.relanceLe <= auj && !m.spam; });
          }
          dessinerListe();
          if (selId) {
            var m = items.find(function (x) { return x._id === selId; });
            if (m) ouvrir(m); else api("/api/messages?limite=100&filtre=tous").then(function (t) {
              var x = t.items.find(function (y) { return y._id === selId; });
              if (x) ouvrir(x); else vide();
            });
          } else vide();
        }).catch(ADM.erreur(liste));
      }
      function vide() {
        boite.classList.remove("detail");
        detail.innerHTML = '<div class="empty" style="padding-top:18vh">' + ic("chat-circle-text") + "Choisissez une demande pour la lire.</div>";
      }
      function dessinerListe() {
        liste.innerHTML = "";
        if (!items.length) { liste.innerHTML = '<div class="empty">' + ic("tray") + "Aucune demande ici.</div>"; return; }
        var auj = ADM.aujourdhui();
        items.forEach(function (m) {
          var prio = m.ia && m.ia.priorite;
          var it = h('<div class="it' + (m.lu ? "" : " nonlu") + (m._id === selId ? " on" : "") + '" data-id="' + esc(m._id) + '" tabindex="0">' + ADM.avInitiale(m.nom) +
            '<div class="grow"><div class="l1"><b></b><time>' + esc(ADM.dateRel(m.createdAt)) + '</time></div><div class="l2"></div><div class="l3"></div></div></div>');
          $(".l1 b", it).textContent = m.nom || "Anonyme";
          $(".l2", it).textContent = m.besoin ? m.besoin + " — " + ADM.court(m.message, 80) : ADM.court(m.message, 110);
          var l3 = $(".l3", it);
          if (m.spam) l3.appendChild(h('<span class="pill ko">spam</span>'));
          if (m.statut && m.statut !== "nouveau") l3.appendChild(h('<span class="pill ' + (m.statut === "gagne" ? "ok" : m.statut === "perdu" ? "ko" : "bleu") + '">' + esc(libelle(ST_MSG, m.statut)) + "</span>"));
          if (prio) l3.appendChild(h('<span class="pill ' + ({ haute: "ko", moyenne: "chaud" }[prio] || "") + '">' + ic("sparkle") + "priorité " + esc(prio) + "</span>"));
          if (m.relanceLe && m.relanceLe <= auj && !m.spam) l3.appendChild(h('<span class="pill chaud">' + ic("arrow-bend-up-right") + "à relancer</span>"));
          if (!l3.children.length) l3.remove();
          it.addEventListener("click", function () { ouvrir(m); });
          it.addEventListener("keydown", function (e) { if (e.key === "Enter") ouvrir(m); });
          liste.appendChild(it);
        });
      }
      function ouvrir(m) {
        selId = m._id;
        history.replaceState(null, "", "#messages/" + m._id);
        $$(".it", liste).forEach(function (x) { x.classList.toggle("on", x.dataset.id === m._id); });
        boite.classList.add("detail");
        if (!m.lu) {
          m.lu = true;
          api("/api/messages/" + m._id, { method: "PUT", body: { lu: true } }).then(function () { ADM.rafraichirCompteurs(); });
          var n = liste.querySelector('[data-id="' + m._id + '"]'); if (n) n.classList.remove("nonlu");
        }
        detail.innerHTML = "";
        detail.appendChild(lecture(m, {
          surMaj: function () { dessinerListe(); },
          surSuppr: function () { items = items.filter(function (x) { return x._id !== m._id; }); selId = ""; history.replaceState(null, "", "#messages"); dessinerListe(); vide(); ADM.rafraichirCompteurs(); },
          surRetour: function () { selId = ""; history.replaceState(null, "", "#messages"); vide(); dessinerListe(); },
        }));
        detail.scrollTop = 0;
      }

      $$(".segs button", panel).forEach(function (b) {
        b.addEventListener("click", function () {
          MSG.filtre = b.dataset.f;
          $$(".segs button", panel).forEach(function (x) { x.classList.toggle("on", x === b); });
          charger();
        });
      });
      var minuteur;
      champ.addEventListener("input", function () { clearTimeout(minuteur); minuteur = setTimeout(function () { MSG.q = champ.value.trim(); charger(); }, 280); });
      etape.addEventListener("change", function () { MSG.statut = etape.value; charger(); });
      charger();
    },
  });

  /** Fiche de lecture d'une demande (réutilisée ailleurs si besoin). */
  function lecture(m, cb) {
    var tel = waNum(m.telephone);
    var l = h('<div class="lecture">' +
      '<button class="btn ghost sm retour-m" style="margin-bottom:10px">' + ic("arrow-left") + "Toutes les demandes</button>" +
      '<div class="lecture-h">' + ADM.avInitiale(m.nom, "lg") + '<div class="grow"><h2></h2><div class="coord"></div></div></div>' +
      '<div class="lecture-acts"></div><div class="qualif"></div><div class="corps"></div>' +
      '<section class="sec"><div class="sec-h"><h3>' + ic("funnel") + 'Suivi</h3><span class="savemsg"></span></div><div class="sec-b" style="padding-top:2px">' +
      '<div class="row2" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><label>Étape</label><select data-k="statut">' + options(ST_MSG, m.statut || "nouveau") + "</select></div>" +
      '<div><label>Montant du devis (FCFA)</label><input data-k="valeur" type="number" min="0" step="1000" placeholder="ex : 150000"></div>' +
      '<div><label>Relancer le</label><input data-k="relanceLe" type="date"></div></div>' +
      '<label>À faire lors de la relance</label><input data-k="relanceNote" type="text" placeholder="ex : envoyer le devis, rappeler">' +
      '<label>Notes privées</label><textarea data-k="notes" rows="3" placeholder="Ce que vous savez du client, ce qui a été dit…"></textarea>' +
      '<div class="formfoot" style="margin-top:14px"><button class="btn primary" data-a="sauver">Enregistrer le suivi</button></div></div></section>' +
      '<div data-zone="diag"></div></div>');
    $("h2", l).textContent = m.nom || "Anonyme";
    var coord = $(".coord", l);
    if (m.email) coord.appendChild(h('<a href="mailto:' + esc(m.email) + '">' + ic("envelope-simple") + " " + esc(m.email) + "</a>"));
    if (m.telephone) coord.appendChild(h('<a href="tel:+' + esc(tel) + '">' + ic("phone") + " " + esc(m.telephone) + "</a>"));
    coord.appendChild(h("<span>" + ic("clock") + " " + esc(ADM.dateHeure(m.createdAt)) + "</span>"));

    var acts = $(".lecture-acts", l);
    var objet = "Votre demande sur pauleackerman.com";
    var corpsMail = "Bonjour " + (m.nom || "") + ",\n\n\n\n---\nVotre message :\n" + String(m.message || "").split("\n").map(function (x) { return "> " + x; }).join("\n");
    acts.appendChild(h('<a class="btn primary" href="mailto:' + encodeURIComponent(m.email || "") + "?subject=" + encodeURIComponent(objet) + "&body=" + encodeURIComponent(corpsMail) + '">' + ic("envelope-simple") + "Répondre par email</a>"));
    if (tel) acts.appendChild(h('<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + tel + "?text=" + encodeURIComponent("Bonjour " + (m.nom || "") + ", c’est Paule Ackerman. Merci pour votre message sur mon site" + (m.besoin ? " au sujet de « " + m.besoin + " »" : "") + ".") + '">' + ic("whatsapp-logo") + "WhatsApp</a>"));
    var bNadia = h('<button class="btn soft">' + ADM.avAgent("diagnostic", "sm") + "Demander à Nadia</button>");
    bNadia.addEventListener("click", function () { ADM.ouvrirEquipe("diagnostic", { contexte: { type: "message", id: m._id, label: "Demande de " + (m.nom || "Anonyme") }, texte: "Analyse cette demande et prépare-moi une réponse." }); });
    acts.appendChild(bNadia);
    acts.appendChild(h('<span style="flex:1"></span>'));
    var bLu = h('<button class="icobtn" title="Marquer comme non lue" aria-label="Marquer comme non lue">' + ic("envelope-simple-open") + "</button>");
    bLu.addEventListener("click", function () {
      api("/api/messages/" + m._id, { method: "PUT", body: { lu: false } }).then(function () { m.lu = false; ADM.toast("Marquée comme non lue"); ADM.rafraichirCompteurs(); cb.surMaj(); });
    });
    var bSpam = h('<button class="icobtn" title="' + (m.spam ? "Ce n’est pas un spam" : "Marquer comme spam") + '" aria-label="Spam">' + ic("prohibit") + "</button>");
    bSpam.addEventListener("click", function () {
      api("/api/messages/" + m._id, { method: "PUT", body: { spam: !m.spam } }).then(function () { m.spam = !m.spam; ADM.toast(m.spam ? "Classée en spam" : "Retirée des spams"); cb.surMaj(); });
    });
    var bDel = h('<button class="icobtn danger" title="Supprimer" aria-label="Supprimer">' + ic("trash") + "</button>");
    bDel.addEventListener("click", function () {
      if (!confirm("Supprimer définitivement la demande de " + (m.nom || "Anonyme") + " ? Cette action est irréversible.")) return;
      api("/api/messages/" + m._id, { method: "DELETE" }).then(function () { ADM.toast("Demande supprimée"); cb.surSuppr(); });
    });
    acts.appendChild(bLu); acts.appendChild(bSpam); acts.appendChild(bDel);

    var q = $(".qualif", l);
    [["Besoin", m.besoin], ["Budget", m.budget], ["Délai", m.delai]].forEach(function (x) {
      if (x[1]) { var s = h("<span><b></b><span></span></span>"); $("b", s).textContent = x[0]; $("span span", s).textContent = x[1]; q.appendChild(s); }
    });
    if (!q.children.length) q.remove();
    $(".corps", l).textContent = m.message || "";

    ["valeur", "relanceLe", "relanceNote", "notes"].forEach(function (k) { $('[data-k="' + k + '"]', l).value = m[k] || ""; });
    $('[data-a="sauver"]', l).addEventListener("click", function () {
      var body = {};
      $$("[data-k]", l).forEach(function (i) { body[i.dataset.k] = i.value; });
      var fin = ADM.attente(this);
      api("/api/messages/" + m._id, { method: "PUT", body: body }).then(function (n) {
        fin();
        Object.assign(m, n);
        ADM.toast("Suivi enregistré");
        cb.surMaj(); ADM.rafraichirCompteurs();
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    });
    $(".retour-m", l).addEventListener("click", cb.surRetour);
    rendreDiag($('[data-zone="diag"]', l), m, cb);
    return l;
  }
  ADM.lectureDemande = lecture;

  function rendreDiag(box, m, cb) {
    var d = m.ia;
    box.innerHTML = "";
    if (!d) {
      var vide = h('<section class="diag"><div class="diag-h">' + ADM.avAgent("diagnostic", "sm") + "<b>Analyse de Nadia</b></div>" +
        "<p class=\"muted\">Nadia peut lire cette demande, repérer les vrais problèmes du client, estimer son potentiel et vous préparer une réponse email et WhatsApp.</p>" +
        '<div class="acts-l"><button class="btn primary">' + ic("sparkle") + "Lancer l’analyse</button></div></section>");
      $("button", vide).addEventListener("click", function () { analyser(this); });
      box.appendChild(vide);
      return;
    }
    var prio = { haute: "ko", moyenne: "chaud" }[d.priorite] || "";
    var tel = waNum(m.telephone);
    var s = h('<section class="diag"><div class="diag-h">' + ADM.avAgent("diagnostic", "sm") + "<b>Analyse de Nadia</b>" +
      '<span class="pill ' + prio + '">priorité ' + esc(d.priorite) + '</span><span class="pill bleu">potentiel ' + esc(d.score) + "/100</span>" +
      (d.spam ? '<span class="pill ko">spam probable</span>' : "") + '<span style="flex:1"></span><button class="btn ghost sm" data-a="relancer">' + ic("arrow-clockwise") + "Refaire</button></div>" +
      "<p><b>En bref :</b> <span data-t=\"resume\"></span></p><p><b>Besoin réel :</b> <span data-t=\"besoinReel\"></span></p>" +
      '<div data-l="problemes"></div><p><b>Formule conseillée :</b> <span data-t="formuleConseillee"></span></p>' +
      '<div data-l="questions"></div><p><b>Prochaine étape :</b> <span data-t="prochaineEtape"></span></p>' +
      "<details open><summary>Brouillon d’email</summary><label>Objet</label><input data-c=\"objet\"><label>Message</label><textarea data-c=\"corps\" rows=\"9\"></textarea>" +
      '<div class="acts-l"><a class="btn primary" data-a="mail">' + ic("envelope-simple") + 'Ouvrir dans ma messagerie</a><button class="btn" data-a="copie-mail">' + ic("copy") + "Copier</button></div></details>" +
      "<details><summary>Brouillon WhatsApp</summary><textarea data-c=\"wa\" rows=\"4\"></textarea><div class=\"acts-l\">" +
      (tel ? '<a class="btn wa" data-a="wa" target="_blank" rel="noopener">' + ic("whatsapp-logo") + "Ouvrir WhatsApp</a>" : '<span class="pill">pas de numéro laissé</span>') +
      '<button class="btn" data-a="copie-wa">' + ic("copy") + "Copier</button></div></details>" +
      '<div class="diag-note"></div></section>');
    ["resume", "besoinReel", "formuleConseillee", "prochaineEtape"].forEach(function (k) { $('[data-t="' + k + '"]', s).textContent = d[k] || ""; });
    [["problemes", "Problèmes repérés"], ["questions", "Questions à poser"]].forEach(function (x) {
      var z = $('[data-l="' + x[0] + '"]', s);
      if (!(d[x[0]] || []).length) { z.remove(); return; }
      z.appendChild(h("<p><b>" + x[1] + " :</b></p>"));
      var ul = h("<ul></ul>");
      d[x[0]].forEach(function (t) { var li = h("<li></li>"); li.textContent = t; ul.appendChild(li); });
      z.appendChild(ul);
    });
    $(".diag-note", s).textContent = "Brouillons préparés par Nadia" + (d.modele ? " (" + d.modele + ")" : "") + ", " + ADM.dateRel(d.analyseLe) + " : relisez-les avant d’envoyer.";
    var objet = $('[data-c="objet"]', s), corps = $('[data-c="corps"]', s), wa = $('[data-c="wa"]', s);
    objet.value = (d.reponseEmail && d.reponseEmail.objet) || "";
    corps.value = (d.reponseEmail && d.reponseEmail.corps) || "";
    wa.value = d.reponseWhatsApp || "";
    var lienMail = $('[data-a="mail"]', s), lienWa = $('[data-a="wa"]', s);
    function maj() {
      lienMail.href = "mailto:" + encodeURIComponent(m.email || "") + "?subject=" + encodeURIComponent(objet.value) + "&body=" + encodeURIComponent(corps.value);
      if (lienWa) lienWa.href = "https://wa.me/" + tel + "?text=" + encodeURIComponent(wa.value);
    }
    [objet, corps, wa].forEach(function (x) { x.addEventListener("input", maj); });
    maj();
    $('[data-a="copie-mail"]', s).addEventListener("click", function () { ADM.copier("Objet : " + objet.value + "\n\n" + corps.value); });
    $('[data-a="copie-wa"]', s).addEventListener("click", function () { ADM.copier(wa.value); });
    $('[data-a="relancer"]', s).addEventListener("click", function () { analyser(this); });
    box.appendChild(s);

    function analyser(btn) {
      var fin = ADM.attente(btn, "Nadia analyse… (environ 30 s)");
      api("/api/crm/ia/diagnostic/" + m._id, { method: "POST" }).then(function (n) {
        fin();
        m.ia = n.ia;
        if (n.spam) m.spam = true;
        rendreDiag(box, m, cb);
        if (cb && cb.surMaj) cb.surMaj();
        ADM.toast("Analyse terminée");
      }).catch(function (e) { fin(); ADM.toast(e.message, "ko"); });
    }
  }
  function rendreDiagExterne(box, m, cb) { return rendreDiag(box, m, cb); }
  ADM.rendreDiag = rendreDiagExterne;

  /* ======================================================================
     RÉGLAGES
  ====================================================================== */
  ADM.vue("reglages", {
    titre: "Réglages",
    sous: "Sécurité, apparence, statistiques et équipe",
    rendu: function (params, panel) {
      Promise.all([api("/api/health"), api("/api/crm/ia").catch(function () { return null; })]).then(function (r) {
        var sante = r[0], ia = r[1];
        var theme = (function () { try { return localStorage.getItem("adm-theme") || "systeme"; } catch (e) { return "systeme"; } })();
        var exclu = (function () { try { return localStorage.getItem("pa_exclure") === "1"; } catch (e) { return false; } })();
        panel.innerHTML = "";
        var g = h('<div class="grille g2"></div>');

        var app = h('<section class="sec"><div class="sec-h"><h3>' + ic("circle-half") + "Apparence</h3></div><div class=\"sec-b\">" +
          '<div class="segs" style="max-width:360px">' + [["systeme", "Système"], ["light", "Clair"], ["dark", "Sombre"]].map(function (o) {
            return '<button data-t="' + o[0] + '"' + (theme === o[0] ? ' class="on"' : "") + ">" + o[1] + "</button>";
          }).join("") + '</div><p class="muted" style="font-size:13px;margin-top:10px">« Système » suit le réglage de votre téléphone ou de votre ordinateur.</p></div></section>');
        $$("[data-t]", app).forEach(function (b) {
          b.addEventListener("click", function () {
            ADM.appliquerTheme(b.dataset.t);
            $$("[data-t]", app).forEach(function (x) { x.classList.toggle("on", x === b); });
          });
        });
        g.appendChild(app);

        var st = h('<section class="sec"><div class="sec-h"><h3>' + ic("chart-line-up") + "Statistiques</h3></div><div class=\"sec-b\">" +
          '<label class="check" style="margin-top:0"><input type="checkbox"> Ne pas compter mes propres visites sur cet appareil</label>' +
          '<p class="muted" style="font-size:13px;margin-top:8px">À activer sur chacun de vos appareils (téléphone, ordinateur) pour que l’Audience ne reflète que vos visiteurs.</p></div></section>');
        var cb = $("input", st);
        cb.checked = exclu;
        cb.addEventListener("change", function () {
          try { if (cb.checked) localStorage.setItem("pa_exclure", "1"); else localStorage.removeItem("pa_exclure"); } catch (e) {}
          ADM.toast(cb.checked ? "Cet appareil n’est plus compté" : "Cet appareil est de nouveau compté");
        });
        g.appendChild(st);

        var mdp = h('<section class="sec"><div class="sec-h"><h3>' + ic("lock-key") + "Mot de passe</h3></div><div class=\"sec-b\" style=\"padding-top:2px\">" +
          '<label>Nouveau mot de passe <span class="help">— 8 caractères minimum</span></label><input type="password" data-p="1" autocomplete="new-password">' +
          '<label>Confirmez</label><input type="password" data-p="2" autocomplete="new-password">' +
          '<div class="formfoot" style="margin-top:14px"><button class="btn primary">Changer le mot de passe</button></div></div></section>');
        $("button", mdp).addEventListener("click", function () {
          var a = $('[data-p="1"]', mdp).value, b = $('[data-p="2"]', mdp).value;
          if (a !== b) return ADM.toast("Les deux mots de passe ne correspondent pas", "ko");
          api("/api/auth/password", { method: "POST", body: { password: a } })
            .then(function () { ADM.toast("Mot de passe changé"); $('[data-p="1"]', mdp).value = $('[data-p="2"]', mdp).value = ""; })
            .catch(function (e) { ADM.toast(e.message, "ko"); });
        });
        g.appendChild(mdp);

        var alerte = h('<section class="sec"><div class="sec-h"><h3>' + ic("bell-ringing") + "Alertes email</h3>" +
          '<span class="pill ' + (sante.alertesEmail ? "ok" : "ko") + '">' + (sante.alertesEmail ? "actives" : "inactives") + "</span></div><div class=\"sec-b\">" +
          '<p class="muted" style="font-size:13px">Un email à chaque nouvelle demande et à chaque appel réservé. Pour les activer, ajoutez dans Vercel → Settings → Environment Variables : ' +
          '<span class="mono">RESEND_API_KEY</span> (clé du service Resend) et <span class="mono">NOTIFY_EMAIL</span> (votre adresse), puis redéployez.</p></div></section>');
        g.appendChild(alerte);
        panel.appendChild(g);

        if (ia) {
          var eq = h('<section class="sec"><div class="sec-h"><h3>' + ic("users-three") + 'Équipe IA</h3><small>' + esc(ia.limiteJour) + " tâches par jour et par assistante, au maximum</small></div><div class=\"sec-b flush\"></div></section>");
          var vars = { diagnostic: "OPENAI_API_KEY", prospection: "ANTHROPIC_API_KEY", agenda: "OPENAI_API_KEY" };
          Object.keys(ADM.EQUIPE).forEach(function (k) {
            var a = ia.agents[k];
            var l = h('<a class="ligne cliquable" href="#equipe/' + k + '">' + ADM.avAgent(k, "", a.configure) + '<div class="grow"><b></b><small></small></div>' +
              '<span class="pill contour">' + esc(a.fournisseur) + "</span>" + (a.configure ? '<span class="pill ok">prête</span>' : '<span class="pill ko">clé manquante</span>') + "</a>");
            $("b", l).textContent = ADM.EQUIPE[k].prenom + " · " + a.nom;
            $("small", l).textContent = a.configure ? "Modèle " + a.modele + " · " + a.aujourdhui + " tâche(s) aujourd’hui · " + a.mois + " ce mois" +
              (a.coutMoisUsd != null ? " · environ " + a.coutMoisUsd + " $" : "") : "Ajoutez " + vars[k] + " dans Vercel puis redéployez";
            $(".sec-b", eq).appendChild(l);
          });
          panel.appendChild(eq);
        }
        var sortie = h('<div class="formfoot"><button class="btn danger">' + ic("sign-out") + "Se déconnecter</button></div>");
        $("button", sortie).addEventListener("click", function () { logout(); });
        panel.appendChild(sortie);
      }).catch(ADM.erreur(panel));
    },
  });
})();
