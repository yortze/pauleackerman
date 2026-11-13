/* =========================================================================
   Portfolio de Paule Ackerman — interface façon application sociale.
   Tout le contenu vient de GET /api/all (géré depuis /admin).
   ========================================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     Outils
  --------------------------------------------------------------------- */
  var D = {}, P = {}, A = {};
  var ITEMS = {};                  // id → publication normalisée
  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  /* icônes au trait, ou pleines (onglet actif, j'aime, enregistré) comme dans l'app */
  function ic(name, cls, plein) {
    return '<i class="ic ' + (plein ? "ph-fill" : "ph") + " ph-" + name + (cls ? " " + cls : "") + '" aria-hidden="true"></i>';
  }
  function fill(i, on) { if (i) { i.classList.toggle("ph-fill", !!on); i.classList.toggle("ph", !on); } }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k) || ""; localStorage.setItem(k, v); } catch (e) {}
    return "";
  }
  var VERIF = '<span class="verif" title="Profil officiel"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function user() { return String(P.handle || "@paule_ackerman").replace(/^@/, ""); }
  function short(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }

  /* Vraie date de publication d'un post (« 13 novembre », avec l'année si ce
     n'est pas l'année en cours). Repli : date de mise en ligne sur le site. */
  function datePost(p) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.publieLe || "")) return new Date(p.publieLe + "T12:00:00");
    return p.createdAt ? new Date(p.createdAt) : null;
  }
  function dateAffichee(p) {
    var d = datePost(p);
    if (!d || isNaN(d)) return "";
    var memeAnnee = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("fr-FR", memeAnnee ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  }
  function dateComplete(p) {
    var d = datePost(p);
    return d && !isNaN(d) ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  }

  /* Numéro au format wa.me : chiffres seuls avec indicatif (+241 par défaut). */
  function waNum(tel) {
    var raw = String(tel || "").trim();
    var d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (raw.charAt(0) === "+") return d.length >= 8 ? d : "";
    if (d.indexOf("00") === 0) return d.slice(2);
    if (d.length <= 9) return "241" + d;
    return d;
  }
  function waHref(text) {
    var n = waNum(String(P.whatsapp || "").trim() || P.telephone);
    if (!n) return "";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(text ||
      P.whatsappMessage || "Bonjour Paule, j’ai vu votre portfolio et j’aimerais parler de mon projet.");
  }

  function hashtag(c) {
    var t = String(c).split(/[\s\-\/·,&'’()]+/).filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
    try { t = t.replace(/[^\p{L}\p{N}_]/gu, ""); } catch (e) { t = t.replace(/[^\w]/g, ""); }
    return t ? "#" + t : "";
  }

  /* Lien YouTube / TikTok / Instagram / Facebook → lecteur intégré */
  function embedInfo(url) {
    if (!url) return null;
    var m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/)))
      return { src: "https://www.youtube-nocookie.com/embed/" + m[1], ratio: /shorts\//.test(url) ? "9/16" : "16/9" };
    if ((m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)))
      return { src: "https://www.tiktok.com/embed/v2/" + m[1], ratio: "9/16" };
    if ((m = url.match(/instagram\.com\/(?:p|reels?|tv)\/([\w-]+)/)))
      return { src: "https://www.instagram.com/p/" + m[1] + "/embed", ratio: "9/16" };
    if (/facebook\.com\/.*(?:\/videos?\/|watch|reel)|fb\.watch\//.test(url))
      return { src: "https://www.facebook.com/plugins/video.php?show_text=false&href=" + encodeURIComponent(url), ratio: "9/16" };
    return null;
  }

  /* Statistiques anonymes pour l'onglet Audience de Paule : aucun cookie,
     aucun identifiant, seulement des compteurs agrégés par jour. Paule peut
     exclure son propre appareil depuis l'admin (clé pa_exclure). */
  function sourceVisite() {
    var params = new URLSearchParams(location.search);
    var lien = (params.get("src") || "").toLowerCase();
    var utm = (params.get("utm_source") || params.get("ref") || lien).toLowerCase();
    var ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    var ua = navigator.userAgent || "";
    var regles = [
      ["instagram", /instagram|\big\b/], ["facebook", /facebook|\bfb\b|fb\.me|fbclid/], ["whatsapp", /whatsapp|wa\.me/],
      ["tiktok", /tiktok|bytedance|musical_ly/], ["linkedin", /linkedin|lnkd\.in/], ["google", /google\./],
      ["recherche", /bing\.|yahoo\.|duckduckgo|ecosia|qwant/], ["x", /(^|\.)t\.co$|twitter|(^|\.)x\.com/], ["youtube", /youtube|youtu\.be/],
    ];
    function classer(txt) { for (var i = 0; i < regles.length; i++) if (regles[i][1].test(txt)) return regles[i][0]; return ""; }
    var src = classer(utm) || (ref && ref !== location.hostname ? classer(ref) || "autre" : "") ||
      (/Instagram/.test(ua) ? "instagram" : /FBAN|FBAV/.test(ua) ? "facebook" : /musical_ly|BytedanceWebview|TikTok/.test(ua) ? "tiktok" : "") || "direct";
    return { src: src, lien: /^[a-z0-9-]{1,40}$/.test(lien) ? lien : "" };
  }
  function appareil() {
    var ua = navigator.userAgent || "";
    if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablette";
    return /Mobi|iPhone|Android/.test(ua) || innerWidth < 768 ? "mobile" : "ordinateur";
  }
  function track(evenement, extra) {
    try {
      if (localStorage.getItem("pa_exclure") === "1") return;
    } catch (e) {}
    try {
      var corps = JSON.stringify(Object.assign({ e: evenement }, extra || {}));
      if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([corps], { type: "application/json" }))) return;
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: corps, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function trackVisite() {
    var nouveau = true;
    try { nouveau = !localStorage.getItem("pa_deja"); localStorage.setItem("pa_deja", "1"); } catch (e) {}
    var s = sourceVisite();
    track("vue", { src: s.src, lien: s.lien || undefined, dev: appareil(), nouveau: nouveau });
  }

  function toast(txt) {
    var t = el('<div role="status" style="position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:400;' +
      'background:#262626;color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);' +
      'transition:opacity .3s">' + esc(txt) + "</div>");
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 2200);
  }

  /* ---------------------------------------------------------------------
     Publications normalisées (posts, créations, vidéos, études)
  --------------------------------------------------------------------- */
  function tagLabel(t) { return { client: "Projet client", perso: "Projet perso", exercice: "Exercice de style" }[t] || t || ""; }

  function fromPost(p) {
    var it = {
      id: String(p._id), kind: "post", type: p.type || "photo",
      images: p.images || [], video: p.video, poster: p.poster, alt: p.alt || "",
      bold: p.texteGras || "", text: p.texte || "", chips: p.chips || [],
      loc: p.tag || "", when: dateAffichee(p), whenFull: dateComplete(p), pinned: !!p.epingle, raw: p,
    };
    if (it.type === "texte") { it.tile = p.texte; it.bold = ""; it.text = ""; }
    if (it.type === "partage") { it.tile = p.partageTexte; it.bold = ""; it.text = p.texte || ""; }
    return it;
  }
  function fromCreation(c) {
    return { id: "c-" + c._id, kind: "creation", type: "photo", images: [c.image], alt: c.titre,
      bold: c.titre, text: "", chips: c.tag ? [tagLabel(c.tag)] : [], loc: "Créations visuelles", when: "" };
  }
  function fromVideo(v) {
    return { id: "v-" + v._id, kind: "video", type: "video", video: v.video, poster: v.poster,
      bold: v.titre, text: "", chips: v.tag ? [tagLabel(v.tag)] : [],
      loc: v.section === "perso" ? "Projet vidéo personnel" : "Montage vidéo", when: "" };
  }
  function fromEtude(e) {
    var imgs = [e.image].concat((e.galerie || []).map(function (g) { return g.image; }))
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var titre = String(e.titre || "").trim();
    return { id: "e-" + e._id, kind: "etude", type: "photo", images: imgs, alt: titre,
      bold: titre ? titre.replace(/\.$/, "") + ". " : "", text: e.texte || "", chips: e.chips || [],
      loc: (e.meta || []).join(" · "), when: "", meta: e.meta || [] };
  }
  function titleOf(it) { return short(String(it.bold || it.tile || it.text || "").replace(/^[\s,.;:—-]+|[\s,.;:]+$/g, ""), 90); }
  function isClientWork(it) { return it.type !== "texte" && it.type !== "partage"; }

  /* ---------------------------------------------------------------------
     Rendu des médias
  --------------------------------------------------------------------- */
  function mediaHTML(it) {
    if (it.type === "texte") {
      return '<div class="media"><div class="quote-tile"><div class="q">' + esc(it.tile) + '</div><div class="qs">@' + esc(user()) + "</div></div></div>";
    }
    if (it.type === "partage") {
      var r = it.raw || {};
      return '<div class="media"><div class="quote-tile cert"><div class="qbadge">' + esc(r.partageInitiale || (r.partageDe || "?").charAt(0)) + "</div>" +
        '<div class="q">' + esc(it.tile) + '</div><div class="qs">' + esc(r.partageDe || "") + (r.partageSous ? " · " + esc(r.partageSous) : "") + "</div></div></div>";
    }
    if (it.type === "video" && it.video) {
      var emb = embedInfo(it.video);
      if (emb) {
        return '<div class="media"><iframe src="' + esc(emb.src) + '" style="aspect-ratio:' + emb.ratio + '" loading="lazy" allowfullscreen ' +
          'allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" title="' + esc(titleOf(it)) + '"></iframe></div>';
      }
      return '<div class="media"><video data-auto muted loop playsinline preload="metadata" poster="' + esc(it.poster || "") + '" src="' + esc(it.video) + '"></video>' +
        '<button class="mute" data-act="mute" aria-label="Activer le son">' + ic("speaker-slash") + "</button>" +
        '<div class="big-heart">' + ic("heart", "", true) + "</div></div>";
    }
    var imgs = it.images || [];
    if (!imgs.length) return "";
    if (imgs.length === 1) {
      return '<div class="media"><img class="single" src="' + esc(imgs[0]) + '" alt="' + esc(it.alt) + '" loading="lazy">' +
        '<div class="big-heart">' + ic("heart", "", true) + "</div></div>";
    }
    return '<div class="media"><div class="track">' + imgs.map(function (u, i) {
        return '<img src="' + esc(u) + '" alt="' + esc(it.alt + " — " + (i + 1) + "/" + imgs.length) + '" loading="lazy">';
      }).join("") + "</div>" +
      '<span class="car-n">1/' + imgs.length + "</span>" +
      '<button class="car-btn prev" data-act="carPrev" aria-label="Image précédente" hidden>' + ic("caret-left") + "</button>" +
      '<button class="car-btn next" data-act="carNext" aria-label="Image suivante">' + ic("caret-right") + "</button>" +
      '<div class="big-heart">' + ic("heart", "", true) + "</div></div>" +
      '<div class="dots">' + imgs.map(function (_, i) { return i ? "<i></i>" : '<i class="on"></i>'; }).join("") + "</div>";
  }

  function wireTracks(scope) {
    $$(".track", scope).forEach(function (tr) {
      if (tr._wired) return;
      tr._wired = true;
      tr.addEventListener("scroll", function () {
        var n = tr.children.length, i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
        var wrap = tr.closest(".mwrap") || tr.parentNode;
        var c = $(".car-n", wrap); if (c) c.textContent = (i + 1) + "/" + n;
        $$(".dots i", wrap).forEach(function (d, j) { d.classList.toggle("on", j === i); });
        var pv = $(".car-btn.prev", wrap), nx = $(".car-btn.next", wrap);
        if (pv) pv.hidden = i <= 0;
        if (nx) nx.hidden = i >= n - 1;
      }, { passive: true });
    });
    observeVideos(scope);
  }

  /* lecture auto des vidéos visibles (muettes, comme dans une app) */
  var vidObs = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && e.intersectionRatio >= 0.6) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: [0, 0.6] }) : null;
  function observeVideos(scope) {
    $$("video[data-auto]", scope).forEach(function (v) {
      if (v._obs) return; v._obs = true;
      if (vidObs) vidObs.observe(v);
    });
  }

  /* ---------------------------------------------------------------------
     Fil d'accueil
  --------------------------------------------------------------------- */
  function headHTML(it) {
    return '<header class="p-head">' +
      '<button class="av ringed" data-act="storyAll" aria-label="Voir les stories de ' + esc(P.nom || "") + '"></button>' +
      '<div class="p-id"><div class="p-nm"><button data-go="profile">' + esc(user()) + "</button>" + VERIF +
      (it.when ? '<time class="dt" title="' + esc(it.whenFull || it.when) + '">• ' + esc(it.when) + "</time>" : "") + "</div>" +
      (it.loc ? '<div class="p-loc">' + esc(it.loc) + "</div>" : "") + "</div>" +
      (it.pinned ? '<span class="pin">' + ic("push-pin") + "Épinglé</span>" : "") +
      '<button class="p-more" data-act="postMore" aria-label="Plus d’options">' + ic("dots-three") + "</button></header>";
  }
  function actsHTML(it) {
    var liked = likes.indexOf(it.id) !== -1, saved = saves.indexOf(it.id) !== -1;
    return '<div class="acts">' +
      '<button class="act' + (liked ? " liked" : "") + '" data-act="like" aria-pressed="' + liked + '" aria-label="J’aime">' + ic("heart", "", liked) + "</button>" +
      '<button class="act" data-act="comment" aria-label="Écrire à Paule à propos de ce projet">' + ic("chat-circle") + "</button>" +
      '<button class="act" data-act="share" aria-label="Partager">' + ic("paper-plane-tilt") + "</button>" +
      '<span class="sp"></span>' +
      '<button class="act' + (saved ? " saved" : "") + '" data-act="save" aria-pressed="' + saved + '" aria-label="Enregistrer">' + ic("bookmark-simple", "", saved) + "</button></div>";
  }
  function capHTML(it, truncate) {
    var body = (it.bold ? "<b>" + esc(it.bold) + "</b>" : "") + esc(it.text || "");
    var full = (it.bold || "") + (it.text || "");
    if (!full && !it.chips.length) return "";
    var tags = (it.chips || []).map(hashtag).filter(Boolean).join(" ");
    if (truncate && full.length > 125) {
      return '<div class="cap"><button class="nm" data-go="profile">' + esc(user()) + "</button>" +
        '<span class="c-short">' + esc(short(full, 110)) + ' <button class="link-btn" data-act="moreCap" style="color:var(--ink-2);font-size:14px;font-weight:400">plus</button></span>' +
        '<span class="c-full" hidden>' + body + (tags ? '<span class="tags">' + esc(tags) + "</span>" : "") + "</span></div>";
    }
    return '<div class="cap"><button class="nm" data-go="profile">' + esc(user()) + "</button>" + body +
      (tags ? '<span class="tags">' + esc(tags) + "</span>" : "") + "</div>";
  }
  function addCommentHTML() {
    return '<form class="add-c" data-form="comment"><input type="text" maxlength="600" placeholder="Écrire à Paule à propos de ce projet…" ' +
      'aria-label="Écrire à Paule à propos de ce projet (message privé)" style="flex:1;border:none;background:transparent;outline:none;font-size:14px;padding:6px 0">' +
      '<button type="submit" class="link-btn" style="font-size:14px" disabled>Envoyer</button></form>';
  }
  function postHTML(it) {
    return '<article class="post" id="post-' + esc(it.id) + '" data-id="' + esc(it.id) + '">' +
      headHTML(it) + '<div class="mwrap">' + mediaHTML(it) + "</div>" + actsHTML(it) + capHTML(it, true) + addCommentHTML() + "</article>";
  }

  function brandCardHTML(r) {
    return '<div class="sugg-card"><div class="ini">' + esc(r.initiale || (r.nom || "?").charAt(0)) + "</div>" +
      "<b>" + esc(r.nom) + "</b><small>" + esc(short(r.detail || "", 60)) + "</small>" +
      '<button class="btn blue" data-act="brand" data-nom="' + esc(r.nom) + '">Voir</button></div>';
  }

  function renderFeed() {
    var posts = (D.posts || []).map(fromPost);
    posts.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
    var html = "";
    posts.forEach(function (it, i) {
      html += postHTML(it);
      if (i === 1 && (D.registre || []).length) {
        html += '<div class="sugg-strip"><h4>Marques accompagnées <button data-act="about">Tout voir</button></h4>' +
          '<div class="sugg-row">' + D.registre.map(brandCardHTML).join("") + "</div></div>";
      }
    });
    $("#feedPosts").innerHTML = html || '<div class="empty">Aucune publication pour le moment.</div>';
    wireTracks($("#feedPosts"));
  }

  function renderRight() {
    var reg = D.registre || [];
    var wa = waHref();
    var links = [
      '<button data-act="about">À propos</button>',
      '<button data-story="services">Services</button>',
      '<button data-act="contact">Contact</button>',
    ];
    if (wa) links.push('<a href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>');
    (P.reseaux || []).forEach(function (r) { links.push('<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.nom) + "</a>"); });
    links.push('<button data-act="theme">Mode sombre</button>');
    $("#rightCol").innerHTML =
      '<div class="me-row"><button class="av" data-go="profile" aria-label="Profil"></button>' +
      '<div class="p-id"><b>' + esc(user()) + VERIF + "</b><small>" + esc(P.nom || "") + "</small></div>" +
      '<button class="link-btn" data-act="contact">Contacter</button></div>' +
      (reg.length ? '<div class="r-h"><b>Marques accompagnées</b><button data-act="about">Tout voir</button></div>' +
        reg.map(function (r) {
          return '<button class="r-row" data-act="brand" data-nom="' + esc(r.nom) + '" style="width:100%;text-align:left">' +
            '<span class="ini">' + esc(r.initiale || (r.nom || "?").charAt(0)) + "</span>" +
            '<span class="p-id" style="min-width:0"><b>' + esc(r.nom) + (r.badge ? ' <span class="badge">' + esc(r.badge) + "</span>" : "") + "</b>" +
            "<small>" + esc(r.detail || "") + (r.periode ? " · " + esc(r.periode) : "") + "</small></span></button>";
        }).join("") : "") +
      '<div class="r-foot">' + links.join(" · ") + '<div class="copy">© ' + new Date().getFullYear() + " " + esc(P.nom || "Paule Ackerman") +
      (P.localisation ? " · " + esc(P.localisation) : "") + "</div></div>";
  }

  /* ---------------------------------------------------------------------
     Stories à la une
  --------------------------------------------------------------------- */
  var GROUPS = [];
  function buildGroups() {
    var g = [];
    var formules = D.formules || [];
    if (formules.length) g.push({ key: "services", label: "Services", icon: "briefcase", slides: formules.map(function (f) {
      return { cls: f.miseEnAvant ? "" : "dark",
        html: '<div class="st-k">' + (f.miseEnAvant ? "La plus demandée" : "Formule") + '</div><div class="st-t">' + esc(f.titre) + "</div>" +
          (f.accroche ? '<div class="st-p">' + esc(f.accroche) + "</div>" : "") +
          '<ul class="st-ul">' + (f.inclus || []).map(function (i) { return "<li>" + ic("check-circle") + "<span>" + esc(i) + "</span></li>"; }).join("") + "</ul>" +
          '<div class="st-price">' + esc(f.prix || "Sur devis") + (f.periode ? "<small>" + esc(f.periode) + "</small>" : "") + "</div>",
        cta: { label: "Demander un devis", icon: "paper-plane-tilt", run: function () { openDM({ besoin: f.titre }); } } };
    }) });
    var avis = D.avis || [];
    if (avis.length) g.push({ key: "avis", label: "Avis", icon: "quotes", slides: avis.map(function (a) {
      return { cls: "dark", html: '<div class="st-k">Avis client</div><div class="st-t" style="font-size:30px">« ' + esc(a.texte) + " »</div>" +
        '<div class="st-p" style="display:flex;align-items:center;gap:10px;margin-top:8px">' +
        (a.photo ? '<span class="av" style="width:40px;height:40px;background-image:url(\'' + esc(a.photo) + '\')"></span>' : "") +
        "<span><b>" + esc(a.nom) + "</b><br>" + esc(a.role || "") + "</span></div>",
        cta: { label: "Travailler avec Paule", icon: "paper-plane-tilt", run: function () { openDM(); } } };
    }) });
    var etudes = D.etudes || [];
    if (etudes.length) g.push({ key: "projets", label: "Projets", cover: etudes[0].image, slides: etudes.map(function (e) {
      return { photo: e.image, html: '<div class="st-k">' + esc((e.meta || []).join(" · ")) + '</div><div class="st-t">' + esc(e.titre) + "</div>",
        cta: { label: "Voir l’étude de cas", icon: "arrow-up-right", run: function () { openItem("e-" + e._id); } } };
    }) });
    if ((A.parcours || []).length) g.push({ key: "parcours", label: "Parcours", icon: "path", slides: A.parcours.map(function (p) {
      return { cls: "dark", html: '<div class="st-k">' + esc(p.annee) + '</div><div class="st-t">' + esc(p.titre) + '</div><div class="st-p">' + esc(String(p.detail || "").replace(/^·\s*/, "")) + "</div>" };
    }) });
    if ((A.certifications || []).length) g.push({ key: "certifs", label: "Certifs", icon: "certificate", slides: A.certifications.map(function (c) {
      return { cls: "dark", html: '<div class="st-k">Certification · ' + esc(c.annee) + '</div><div class="st-t">' + esc(c.titre) + '</div><div class="st-p">' + esc(String(c.detail || "").replace(/^·\s*/, "")) + "</div>" };
    }) });
    var ctas = [{ label: "Envoyer un message", icon: "paper-plane-tilt", run: function () { openDM(); } }];
    if (waHref()) ctas.push({ label: "Écrire sur WhatsApp", icon: "whatsapp-logo", wa: true, href: waHref() });
    g.push({ key: "contact", label: "Contact", icon: "chat-circle-dots", slides: [{ cls: "",
      html: '<div class="st-k">Un projet en tête ?</div><div class="st-t">Parlons de votre marque.</div><div class="st-p">' + esc(P.accrocheContact || "") + "</div>",
      ctas: ctas }] });
    GROUPS = g;
  }
  var seen = (store("pa_seen") || "").split(",");
  function storyBtns() {
    return GROUPS.map(function (g) {
      var inner = g.cover ? '<span class="ring-in" style="background-image:url(\'' + esc(g.cover) + '\')"></span>'
        : '<span class="ring-in">' + ic(g.icon) + "</span>";
      return '<button class="story-b" data-story="' + g.key + '" aria-label="Story à la une : ' + esc(g.label) + '">' +
        '<span class="ring' + (seen.indexOf(g.key) !== -1 ? " seen" : "") + '">' + inner + "</span><span>" + esc(g.label) + "</span></button>";
    }).join("");
  }

  var ST = null; // état du lecteur de stories
  var ST_DUREE = 6500;
  function openStory(key) {
    track("story", { id: key });
    var gi = 0;
    GROUPS.forEach(function (g, i) { if (g.key === key) gi = i; });
    closeLayers();
    var node = el('<div class="st" role="dialog" aria-modal="true" aria-label="Stories">' +
      '<button class="st-nav prev" data-st="prevG" aria-label="Story précédente">' + ic("caret-left") + "</button>" +
      '<div class="st-box"></div>' +
      '<button class="st-nav next" data-st="nextG" aria-label="Story suivante">' + ic("caret-right") + "</button>" +
      '<button class="st-x" data-st="close" aria-label="Fermer">' + ic("x") + "</button></div>");
    pushLayer(node, function () { if (ST) cancelAnimationFrame(ST.raf); ST = null; });
    ST = { gi: gi, si: 0, t0: 0, elapsed: 0, paused: false, raf: 0, node: node };
    node.addEventListener("click", function (e) {
      var b = e.target.closest("[data-st]");
      if (b) { e.stopPropagation(); stAction(b.dataset.st); }
      if (e.target === node) closeLayers();
    });
    stShow();
  }
  function stShow() {
    if (!ST) return;
    var g = GROUPS[ST.gi], s = g.slides[ST.si];
    if (seen.indexOf(g.key) === -1) { seen.push(g.key); store("pa_seen", seen.join(",")); $$('[data-story="' + g.key + '"] .ring').forEach(function (r) { r.classList.add("seen"); }); }
    var box = $(".st-box", ST.node);
    var cta = "";
    if (s.cta) cta = '<button class="st-cta" data-st="cta">' + ic(s.cta.icon) + esc(s.cta.label) + "</button>";
    if (s.ctas) cta = '<div class="st-ctas">' + s.ctas.map(function (c, i) {
      return c.href ? '<a class="st-cta' + (c.wa ? " wa" : "") + '" href="' + esc(c.href) + '" target="_blank" rel="noopener">' + ic(c.icon) + esc(c.label) + "</a>"
        : '<button class="st-cta" data-st="cta' + i + '">' + ic(c.icon) + esc(c.label) + "</button>";
    }).join("") + "</div>";
    box.innerHTML =
      '<div class="st-bars">' + g.slides.map(function (_, i) { return "<i><b" + (i < ST.si ? ' style="width:100%"' : "") + "></b></i>"; }).join("") + "</div>" +
      '<div class="st-head"><span class="av"></span><b>' + esc(user()) + '</b><span class="dt">' + esc(g.label) + '</span><span class="sp"></span>' +
      '<button data-st="pause" aria-label="Pause">' + ic("pause") + '</button><button data-st="close" aria-label="Fermer">' + ic("x") + "</button></div>" +
      '<div class="st-slide ' + (s.photo ? "photo st-photo-slide" : (s.cls || "")) + '"' + (s.photo ? ' style="background-image:url(\'' + esc(s.photo) + '\')"' : "") + ">" + s.html + "</div>" +
      '<div class="st-tap l" data-tap="prev"></div><div class="st-tap r" data-tap="next"></div>' + cta +
      '<form class="st-reply"><input type="text" maxlength="600" placeholder="Répondre à ' + esc(user()) + '…" aria-label="Répondre à la story">' +
      '<button type="submit" aria-label="Envoyer">' + ic("paper-plane-tilt") + "</button></form>";
    $$(".st-tap", box).forEach(function (z) {
      var down = 0;
      z.addEventListener("pointerdown", function () { down = Date.now(); ST && (ST.paused = true); });
      z.addEventListener("pointerup", function () {
        if (!ST) return;
        ST.paused = false;
        if (Date.now() - down < 250) stAction(z.dataset.tap);
      });
      z.addEventListener("pointerleave", function () { if (ST) ST.paused = false; });
    });
    var f = $(".st-reply", box), inp = $("input", f);
    inp.addEventListener("focus", function () { if (ST) ST.paused = true; });
    inp.addEventListener("blur", function () { if (ST) ST.paused = false; });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = inp.value.trim();
      if (!t) return;
      openDM({ text: "En réponse à votre story « " + g.label + " » : " + t });
    });
    ST.elapsed = 0; ST.t0 = performance.now();
    cancelAnimationFrame(ST.raf);
    var bar = $$(".st-bars i b", box)[ST.si];
    (function tick(now) {
      if (!ST) return;
      if (ST.paused) ST.t0 = now - ST.elapsed; else ST.elapsed = now - ST.t0;
      bar.style.width = Math.min(100, ST.elapsed / ST_DUREE * 100) + "%";
      if (ST.elapsed >= ST_DUREE) return stAction("next");
      ST.raf = requestAnimationFrame(tick);
    })(ST.t0);
  }
  function stAction(a) {
    if (!ST) return;
    var g = GROUPS[ST.gi], s = g.slides[ST.si];
    if (a === "close") return closeLayers();
    if (a === "pause") { ST.paused = !ST.paused; return; }
    if (a === "cta" && s.cta) { closeLayers(); return s.cta.run(); }
    if (/^cta\d$/.test(a) && s.ctas) { closeLayers(); return s.ctas[+a.slice(3)].run(); }
    if (a === "next") {
      if (ST.si < g.slides.length - 1) ST.si++;
      else if (ST.gi < GROUPS.length - 1) { ST.gi++; ST.si = 0; }
      else return closeLayers();
    } else if (a === "prev") {
      if (ST.si > 0) ST.si--;
      else if (ST.gi > 0) { ST.gi--; ST.si = GROUPS[ST.gi].slides.length - 1; }
    } else if (a === "nextG") {
      if (ST.gi < GROUPS.length - 1) { ST.gi++; ST.si = 0; } else return closeLayers();
    } else if (a === "prevG") {
      if (ST.gi > 0) { ST.gi--; ST.si = 0; }
    }
    stShow();
  }

  /* ---------------------------------------------------------------------
     Profil
  --------------------------------------------------------------------- */
  function instaUrl() {
    var r = (P.reseaux || []).filter(function (x) { return /instagram/i.test(x.nom + x.url); })[0];
    return r ? r.url : "";
  }
  function profileBtns(mobile) {
    var insta = instaUrl(), wa = waHref();
    return (insta ? '<a class="btn blue" href="' + esc(insta) + '" target="_blank" rel="noopener">Suivre</a>' : "") +
      '<button class="btn" data-act="dm">Message</button>' +
      (wa ? '<a class="btn wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ic("whatsapp-logo") + "WhatsApp</a>" : "") +
      '<button class="btn ico" data-act="contact" aria-label="Contacter">' + (mobile ? ic("address-book") : "Contacter") + "</button>";
  }
  var PF_TAB = "posts";
  function renderProfile() {
    var stats = (P.stats || []).map(function (s) { return "<div><b>" + esc(s.valeur) + "</b> " + esc(s.label) + "</div>"; }).join("");
    $("#profileView").innerHTML =
      '<header class="pf-head">' +
      '<button class="pf-av" data-act="storyAll" aria-label="Voir les stories"><div></div></button>' +
      '<div class="pf-info">' +
      '<div class="pf-top"><h1 class="pf-handle">' + esc(user()) + VERIF + '</h1><div class="pf-btns">' + profileBtns(false) +
      '<button class="btn ico" data-act="more" aria-label="Plus d’options" style="background:none">' + ic("dots-three") + "</button></div>" +
      '<button class="btn ico pf-mmore" data-act="more" aria-label="Plus d’options" style="background:none;margin-left:auto">' + ic("dots-three") + "</button></div>" +
      '<div class="pf-stats">' + stats + "</div>" +
      '<div class="pf-desc"><div class="pf-name">' + esc(P.nom || "") + "</div>" +
      (P.titre ? '<div class="pf-cat">' + esc(P.titre) + "</div>" : "") +
      '<div class="pf-bio">' + (P.bioAccroche ? '<span class="serif">' + esc(P.bioAccroche) + "</span> " : "") + esc(String(P.bio || "").replace(/^—\s*/, "— ")) + "</div>" +
      (P.localisation ? '<div class="pf-loc">' + ic("map-pin") + esc(P.localisation) + "</div>" : "") +
      '<div class="pf-links">' + (P.email ? '<a href="mailto:' + esc(P.email) + '">' + ic("link-simple") + esc(P.email) + "</a>" : "") + "</div>" +
      (P.disponibilite ? '<div class="pf-dispo"><i></i>' + esc(P.disponibilite) + "</div>" : "") +
      "</div></div></header>" +
      '<div class="pf-mbtns">' + profileBtns(true) + "</div>" +
      '<div class="hls">' + storyBtns() + "</div>" +
      '<nav class="tabs" role="tablist">' +
      tabBtn("posts", "squares-four", "Publications") + tabBtn("reels", "film-slate", "Reels") +
      ((D.etudes || []).length ? tabBtn("etudes", "book-open-text", "Études de cas") : "") + "</nav>" +
      '<div id="pfTab"></div>';
    renderPfTab();
  }
  function tabBtn(k, icon, label) {
    return '<button class="tab' + (PF_TAB === k ? " on" : "") + '" role="tab" aria-selected="' + (PF_TAB === k) + '" data-act="tab" data-tab="' + k + '">' + ic(icon, "", PF_TAB === k) + "<span>" + label + "</span></button>";
  }
  function tileHTML(it, list, extra) {
    var cls = "tile" + (extra || "");
    var icon = it.pinned ? "push-pin" : it.type === "video" ? "film-slate" : (it.images || []).length > 1 ? "copy" : "";
    var ov = '<span class="t-ov">' + esc(short(titleOf(it), 70)) + "</span>";
    var attrs = ' data-open="' + esc(it.id) + '" data-list="' + list + '" role="button" tabindex="0" aria-label="' + esc(titleOf(it) || "Publication") + '"';
    if (it.type === "texte" || it.type === "partage") {
      return '<div class="' + cls + " txt" + (it.type === "partage" ? " cert" : "") + '"' + attrs + ">" + esc(short(it.tile, 90)) + (icon ? ic(icon, "t-ic") : "") + "</div>";
    }
    var img = it.type === "video" ? it.poster : (it.images || [])[0];
    if (it.type === "video" && !img) {
      return '<div class="' + cls + '" style="background:#111"' + attrs + ">" + ic("film-slate", "t-ic") + ov + "</div>";
    }
    return '<div class="' + cls + '"' + attrs + '><img src="' + esc(img || "") + '" alt="" loading="lazy">' + (icon ? ic(icon, "t-ic") : "") + ov + "</div>";
  }
  var LISTS = {};
  function renderPfTab() {
    var box = $("#pfTab");
    if (!box) return;
    if (PF_TAB === "posts") {
      var posts = (D.posts || []).map(fromPost).filter(function (it) { return it.type !== "video" || it.poster || it.video; });
      posts.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
      var all = posts.concat((D.creations || []).map(fromCreation));
      LISTS.pf = all.map(function (i) { return i.id; });
      box.innerHTML = all.length ? '<div class="grid">' + all.map(function (it) { return tileHTML(it, "pf"); }).join("") + "</div>" : '<div class="empty">Aucune publication.</div>';
    } else if (PF_TAB === "reels") {
      var vids = (D.videos || []).map(fromVideo);
      box.innerHTML = vids.length ? '<div class="grid reels">' + vids.map(function (it) {
        return '<div class="tile" data-act="toReel" data-id="' + esc(it.id) + '" role="button" tabindex="0" aria-label="' + esc(it.bold) + '"' +
          (it.poster ? ' style="background-image:url(\'' + esc(it.poster) + '\')"' : ' style="background:#111"') + ">" + ic("film-slate", "t-ic") +
          '<span class="t-ov">' + esc(it.bold) + "</span></div>";
      }).join("") + "</div>" : '<div class="empty">Aucun reel pour le moment.</div>';
    } else {
      var et = (D.etudes || []).map(fromEtude);
      LISTS.et = et.map(function (i) { return i.id; });
      box.innerHTML = '<div class="grid guides">' + et.map(function (it) {
        return '<div class="guide" data-open="' + esc(it.id) + '" data-list="et" role="button" tabindex="0">' +
          '<div class="gimg" style="background-image:url(\'' + esc(it.images[0] || "") + '\')"></div>' +
          "<b>" + esc(it.bold.trim()) + "</b><small>" + esc(it.loc) + "</small></div>";
      }).join("") + "</div>";
    }
  }

  /* ---------------------------------------------------------------------
     Explorer & Reels
  --------------------------------------------------------------------- */
  function renderExplore() {
    var a = (D.creations || []).map(fromCreation);
    var b = (D.posts || []).map(fromPost).filter(function (it) { return (it.images || []).length; });
    var v = (D.videos || []).map(fromVideo);
    var e = (D.etudes || []).map(fromEtude);
    var mix = [], i = 0;
    while (a.length || b.length || v.length || e.length) {
      if (v.length && i % 5 === 2) mix.push(v.shift());
      else if (b.length && i % 3 === 0) mix.push(b.shift());
      else if (e.length && i % 7 === 4) mix.push(e.shift());
      else if (a.length) mix.push(a.shift());
      else mix.push((b.length ? b : v.length ? v : e).shift());
      i++;
    }
    LISTS.ex = mix.map(function (it) { return it.id; });
    $("#exploreGrid").innerHTML = mix.map(function (it) { return tileHTML(it, "ex", it.type === "video" ? " tall" : ""); }).join("");
  }
  function renderReels() {
    var vids = (D.videos || []).map(fromVideo);
    $("#reelsList").innerHTML = vids.length ? vids.map(function (it) {
      var emb = embedInfo(it.video);
      var media = emb ? '<iframe src="' + esc(emb.src) + '" loading="lazy" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" title="' + esc(it.bold) + '"></iframe>'
        : '<video data-auto muted loop playsinline preload="metadata" poster="' + esc(it.poster || "") + '" src="' + esc(it.video) + '"></video>' +
          '<button class="mute" data-act="mute" aria-label="Activer le son">' + ic("speaker-slash") + "</button>";
      var tags = it.chips.map(hashtag).filter(Boolean).join(" ");
      return '<div class="reel" id="reel-' + esc(it.id) + '" data-id="' + esc(it.id) + '"><div class="reel-box">' + media +
        '<div class="reel-info"><div class="who"><span class="av"></span>' + esc(user()) +
        '<button class="btn" data-act="dm">Contacter</button></div><div>' + esc(it.bold) + (tags ? ' <span style="opacity:.85">' + esc(tags) + "</span>" : "") + "</div></div></div>" +
        '<div class="reel-acts">' +
        '<button class="act' + (likes.indexOf(it.id) !== -1 ? " liked" : "") + '" data-act="like" aria-label="J’aime">' + ic("heart", "", likes.indexOf(it.id) !== -1) + "</button>" +
        '<button class="act" data-act="comment" aria-label="Écrire à Paule">' + ic("chat-circle") + "</button>" +
        '<button class="act" data-act="share" aria-label="Partager">' + ic("paper-plane-tilt") + "</button>" +
        '<button class="act" data-act="postMore" aria-label="Plus">' + ic("dots-three") + "</button></div></div>";
    }).join("") : '<div class="empty">Aucun reel pour le moment.</div>';
    observeVideos($("#reelsList"));
  }

  /* ---------------------------------------------------------------------
     Superpositions (publication ouverte, feuilles, à propos, notifications)
  --------------------------------------------------------------------- */
  var LAYERS = [];
  function pushLayer(node, onClose) {
    $("#layers").appendChild(node);
    LAYERS.push({ node: node, onClose: onClose });
    document.body.style.overflow = "hidden";
  }
  function closeLayers(onlyTop) {
    while (LAYERS.length) {
      var l = LAYERS.pop();
      $$("video", l.node).forEach(function (v) { v.pause(); });
      l.node.remove();
      if (l.onClose) l.onClose();
      if (onlyTop) break;
    }
    if (!LAYERS.length) document.body.style.overflow = "";
  }

  function openItem(id, listKey) {
    var it = ITEMS[id];
    if (!it) return;
    track("post", { id: id });
    closeLayers();
    var list = listKey && LISTS[listKey] ? LISTS[listKey] : null;
    var idx = list ? list.indexOf(id) : -1;
    var extra = "";
    if (isClientWork(it)) {
      extra = '<div class="com"><span class="av"></span><div><div class="cap"><button class="nm" data-go="profile">' + esc(user()) + "</button>" +
        "Vous voulez la même chose pour votre marque ? Écrivez-moi, je vous réponds sous 24 h.</div>" +
        '<div class="when"><button class="link-btn" data-act="dm">Envoyer un message</button>' +
        (waHref() ? ' · <a class="link-btn" href="' + esc(waHref()) + '" target="_blank" rel="noopener" style="color:var(--wa)">WhatsApp</a>' : "") + "</div></div></div>";
    }
    var cap = capHTML(it, false);
    var node = el('<div class="ov" role="dialog" aria-modal="true" aria-label="Publication">' +
      '<button class="ov-x" data-act="close" aria-label="Fermer">' + ic("x") + "</button>" +
      (idx > 0 ? '<button class="pm-nav prev" data-act="nav" data-to="' + esc(list[idx - 1]) + '" data-list="' + listKey + '" aria-label="Précédente">' + ic("caret-left") + "</button>" : "") +
      (list && idx < list.length - 1 ? '<button class="pm-nav next" data-act="nav" data-to="' + esc(list[idx + 1]) + '" data-list="' + listKey + '" aria-label="Suivante">' + ic("caret-right") + "</button>" : "") +
      '<div class="pm" data-id="' + esc(it.id) + '">' +
      '<div class="pm-media"><div class="mwrap" style="width:100%;height:100%">' + mediaHTML(it) + "</div></div>" +
      '<div class="pm-side">' + headHTML(it) +
      '<div class="pm-coms">' + (cap ? '<div class="com"><span class="av"></span><div>' + cap + (it.when ? '<div class="when">' + esc(it.when) + "</div>" : "") + "</div></div>" : "") + extra + "</div>" +
      '<div class="pm-bot">' + actsHTML(it) + "</div>" +
      '<div class="pm-add">' + ic("smiley") + addCommentHTML().replace('class="add-c"', 'class="add-c" style="padding:0;flex:1"') + "</div>" +
      "</div></div></div>");
    node.addEventListener("click", function (e) { if (e.target === node) closeLayers(); });
    pushLayer(node);
    wireTracks(node);
    var v = $("video", node); if (v) { v.muted = false; v.controls = true; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  }

  function openSheet(title, sub, rows) {
    closeLayers();
    var node = el('<div class="ov" role="dialog" aria-modal="true" aria-label="' + esc(title || "Options") + '"><div class="sheet">' +
      (title ? "<h3>" + esc(title) + "</h3>" : "") + (sub ? '<p class="sub">' + esc(sub) + "</p>" : "") +
      rows.map(function (r, i) {
        var inner = (r.icon ? ic(r.icon) : "") + "<span>" + esc(r.label) + (r.small ? "<small>" + esc(r.small) + "</small>" : "") + "</span>";
        return r.href ? '<a class="row ' + (r.cls || "") + '" href="' + esc(r.href) + '"' + (/^https?:/.test(r.href) ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>"
          : '<button class="row ' + (r.cls || "") + '" data-i="' + i + '">' + inner + "</button>";
      }).join("") +
      '<button class="row cancel" data-i="-1">Annuler</button></div></div>');
    node.addEventListener("click", function (e) {
      if (e.target === node) return closeLayers();
      var b = e.target.closest("[data-i]"), a = e.target.closest("a.row");
      if (a) return setTimeout(closeLayers, 50);
      if (!b) return;
      closeLayers();
      var r = rows[+b.dataset.i];
      if (r && r.run) r.run();
    });
    pushLayer(node);
  }
  function contactSheet() {
    var rows = [
      { icon: "paper-plane-tilt", label: "Envoyer un message", small: "Réponse sous 24 h ouvrées", cls: "blue", run: function () { openDM(); } },
      { icon: "calendar-plus", label: "Réserver un appel découverte", small: "Choisissez un créneau libre de Paule", cls: "blue", run: function () { openDM({ reserver: true }); } },
    ];
    if (waHref()) rows.push({ icon: "whatsapp-logo", label: "WhatsApp", small: P.whatsapp || P.telephone, cls: "wa", href: waHref() });
    if (P.telephone) rows.push({ icon: "phone", label: "Appeler", small: P.telephone, href: "tel:+" + waNum(P.telephone) });
    if (P.email) rows.push({ icon: "envelope-simple", label: "E-mail", small: P.email, href: "mailto:" + P.email });
    openSheet("Contacter", P.nom ? "Choisissez comment joindre " + P.nom.split(" ")[0] : "", rows);
  }
  function moreSheet() {
    var dark = root.dataset.theme === "dark";
    openSheet("", "", [
      { icon: dark ? "sun" : "moon", label: dark ? "Passer en mode clair" : "Passer en mode sombre", run: toggleTheme },
      { icon: "user-circle", label: "À propos de ce compte", run: openAbout },
      { icon: "address-book", label: "Contacter", run: contactSheet },
      { icon: "share-network", label: "Partager ce profil", run: function () { shareUrl(location.origin + "/#profil", P.nom || "Portfolio"); } },
    ]);
  }
  function postMoreSheet(id) {
    var it = ITEMS[id];
    if (!it) return;
    openSheet("", "", [
      { icon: "paper-plane-tilt", label: "Écrire à Paule à propos de ce projet", cls: "blue", run: function () { commentOn(it); } },
      { icon: "arrow-square-out", label: "Accéder à la publication", run: function () { openItem(id); } },
      { icon: "share-network", label: "Partager", run: function () { shareItem(it); } },
      { icon: "link-simple", label: "Copier le lien", run: function () { copy(itemUrl(it)); } },
      { icon: "user-circle", label: "À propos de ce compte", run: openAbout },
    ]);
  }

  function openAbout() {
    closeLayers();
    var reg = D.registre || [];
    function rows(list) {
      return (list || []).map(function (r) {
        return '<div class="ab-row"><span class="y">' + esc(r.annee || "") + "</span><div><b>" + esc(r.titre) + "</b> <span>" + esc(String(r.detail || "").replace(/^·\s*/, "")) + "</span></div></div>";
      }).join("");
    }
    var html =
      '<div class="about-top"><div class="av"></div><b>' + esc(user()) + "</b>" +
      (A.introLead ? '<p class="serif">' + esc(A.introLead) + "</p>" : "") + "</div>" +
      ((A.introParagraphes || []).length ? '<div class="ab-sec"><h4>' + ic("hand-waving") + esc(A.introTitre || "Présentation") + "</h4>" +
        A.introParagraphes.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" : "") +
      ((A.services || []).length ? '<div class="ab-sec"><h4>' + ic("briefcase") + "Ce que je fais</h4>" + A.services.map(function (s) {
        return '<div class="ab-row"><div><b>' + esc(s.titre) + "</b><br><span>" + esc(s.detail) + "</span></div></div>";
      }).join("") + '<p style="margin-top:8px"><button class="link-btn" data-story="services" style="font-size:14px">Voir les formules</button></p></div>' : "") +
      (reg.length ? '<div class="ab-sec"><h4>' + ic("handshake") + "Marques accompagnées</h4>" + reg.map(function (r) {
        return '<div class="ab-row"><span class="y">' + esc(r.periode ? r.periode.replace(/^.*(\d{4}).*$/, "$1") : "") + "</span><div><b>" + esc(r.nom) + "</b>" +
          (r.badge ? ' <span class="badge">' + esc(r.badge) + "</span>" : "") + "<br><span>" + esc(r.detail || "") + "</span></div></div>";
      }).join("") + "</div>" : "") +
      ((A.parcours || []).length ? '<div class="ab-sec"><h4>' + ic("path") + "Parcours</h4>" + rows(A.parcours) + "</div>" : "") +
      ((A.certifications || []).length ? '<div class="ab-sec"><h4>' + ic("certificate") + "Certifications &amp; formations</h4>" + rows(A.certifications) + "</div>" : "") +
      ((A.outilsMaitrise || []).length || (A.outilsApprentissage || []).length ? '<div class="ab-sec"><h4>' + ic("toolbox") + "Boîte à outils</h4>" +
        '<div class="pills">' + (A.outilsMaitrise || []).map(function (o) { return "<span>" + esc(o) + "</span>"; }).join("") +
        (A.outilsApprentissage || []).map(function (o) { return '<span class="dash">' + esc(o) + " · en cours</span>"; }).join("") + "</div></div>" : "") +
      ((A.langues || []).length ? '<div class="ab-sec"><h4>' + ic("translate") + "Langues</h4><div class=\"pills\">" +
        A.langues.map(function (l) { return "<span>" + esc(typeof l === "string" ? l : l.nom) + "</span>"; }).join("") + "</div></div>" : "") +
      ((A.atouts || []).length ? '<div class="ab-sec"><h4>' + ic("sparkle") + "Mes atouts</h4><div class=\"pills\">" +
        A.atouts.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</div></div>" : "") +
      ((P.reseaux || []).length ? '<div class="ab-sec"><h4>' + ic("globe-simple") + "Me retrouver ailleurs</h4><div class=\"ab-links\">" +
        P.reseaux.map(function (r) { return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.nom) + "<span>" + esc(r.detail || "") + "</span></a>"; }).join("") + "</div></div>" : "") +
      '<div class="ab-sec" style="display:flex;gap:8px"><button class="btn blue" data-act="dm" style="flex:1">Envoyer un message</button>' +
      (waHref() ? '<a class="btn wa" href="' + esc(waHref()) + '" target="_blank" rel="noopener" style="flex:1">' + ic("whatsapp-logo") + "WhatsApp</a>" : "") + "</div>";
    var node = el('<div class="ov" role="dialog" aria-modal="true" aria-label="À propos de ce compte"><div class="about">' +
      '<div class="about-h">À propos de ce compte<button data-act="close" aria-label="Fermer">' + ic("x") + "</button></div>" +
      '<div class="about-b">' + html + "</div></div></div>");
    node.addEventListener("click", function (e) { if (e.target === node) closeLayers(); });
    pushLayer(node);
  }

  var notifOpen = false;
  function toggleNotifs(force) {
    var open = force !== undefined ? force : !notifOpen;
    var old = $("#notifPanel");
    if (old) old.remove();
    notifOpen = open;
    document.body.classList.toggle("notif-open", open && innerWidth >= 768);
    if (!open) return;
    var rowsHtml = "";
    if (P.disponibilite) rowsHtml += '<div class="notif-s">Nouveau</div><div class="nrow"><span class="av"></span><div class="t"><b>' + esc(user()) + "</b> " +
      esc(P.disponibilite) + '</div><button class="btn blue" data-act="dm">Écrire</button></div>';
    var posts = (D.posts || []).map(fromPost);
    if (posts.length) {
      rowsHtml += '<div class="notif-s">Publications récentes</div>' + posts.slice(0, 8).map(function (it) {
        var th = (it.images || [])[0] || it.poster;
        return '<button class="nrow" data-open="' + esc(it.id) + '"><span class="av"></span><span class="t"><b>' + esc(user()) + "</b> a publié : " +
          esc(short(titleOf(it), 70)) + (it.when ? " <span>" + esc(it.when) + "</span>" : "") + "</span>" +
          (th ? '<span class="th" style="background-image:url(\'' + esc(th) + '\')"></span>' : "") + "</button>";
      }).join("");
    }
    (D.avis || []).slice(0, 4).forEach(function (a, i) {
      if (!i) rowsHtml += '<div class="notif-s">Avis</div>';
      rowsHtml += '<button class="nrow" data-story="avis"><span class="av" style="background-image:' + (a.photo ? "url('" + esc(a.photo) + "')" : "none") + ';background-color:var(--chip)"></span>' +
        '<span class="t"><b>' + esc(a.nom) + "</b> a laissé un avis : « " + esc(short(a.texte, 70)) + " »</span></button>";
    });
    (A.certifications || []).forEach(function (c, i) {
      if (!i) rowsHtml += '<div class="notif-s">Certifications</div>';
      rowsHtml += '<button class="nrow" data-story="certifs"><span class="av"></span><span class="t"><b>' + esc(user()) + "</b> a obtenu la certification « " +
        esc(c.titre) + " » <span>" + esc(c.annee) + "</span></span></button>";
    });
    var node = el('<aside class="notif" id="notifPanel" aria-label="Notifications"><div class="notif-h">Notifications' +
      '<button data-act="notifs" aria-label="Fermer">' + ic("x") + '</button></div><div class="notif-b">' + rowsHtml + "</div></aside>");
    document.body.appendChild(node);
  }

  /* ---------------------------------------------------------------------
     Partage, j'aime, enregistrements
  --------------------------------------------------------------------- */
  var likes = (store("pa_likes") || "").split(",").filter(Boolean);
  var saves = (store("pa_saves") || "").split(",").filter(Boolean);
  function itemUrl(it) { return location.origin + "/#post-" + it.id; }
  function copy(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Lien copié"); }, function () { prompt("Copiez ce lien :", url); });
    else prompt("Copiez ce lien :", url);
  }
  function shareUrl(url, title, id) {
    track("partage", id ? { id: id } : undefined);
    if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
    else copy(url);
  }
  function shareItem(it) { shareUrl(itemUrl(it), (P.nom || "Paule Ackerman") + " — " + titleOf(it), it.id); }
  function commentOn(it) { openDM({ message: "À propos de « " + titleOf(it) + " » : " }); }
  function toggleList(list, key, id) {
    var i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    store(key, list.join(","));
    return i === -1;
  }
  function setLike(id, on, fromDouble, scope) {
    var isOn = likes.indexOf(id) !== -1;
    if (on === undefined) on = !isOn;
    if (on !== isOn) toggleList(likes, "pa_likes", id);
    $$('[data-id="' + id + '"] [data-act="like"]').forEach(function (b) { b.classList.toggle("liked", on); b.setAttribute("aria-pressed", on); fill($(".ic", b), on); });
    if (fromDouble && scope) {
      var h = $(".big-heart", scope);
      if (h) { h.classList.remove("go"); void h.offsetWidth; h.classList.add("go"); }
    }
  }

  /* ---------------------------------------------------------------------
     Messagerie : conversation guidée (réponses rapides)
  --------------------------------------------------------------------- */
  var dmBody = $("#dmBody"), dmForm = $("#dmForm"), dmInput = $("#dmInput"), dmSend = $("#dmSend");
  var S = null, queue = Promise.resolve();
  var BUDGETS = ["Moins de 100 000 FCFA", "100 000 à 300 000 FCFA", "300 000 à 600 000 FCFA", "Plus de 600 000 FCFA", "Je ne sais pas encore"];
  var DELAIS = ["Dès que possible", "Dans le mois", "Dans 1 à 3 mois", "Je me renseigne"];
  var ORDRE = ["besoin", "budget", "delai", "message", "nom", "email", "tel", "send"];

  function scrollDM() { dmBody.scrollTop = dmBody.scrollHeight; }
  function themRow(inner) {
    var last = dmBody.lastElementChild;
    if (last && last.classList.contains("bub-row") && last.dataset.them) {
      var av = $(".av", last); if (av) av.outerHTML = '<span class="spacer"></span>';
    }
    var r = el('<div class="bub-row" data-them="1"><span class="av"></span>' + inner + "</div>");
    dmBody.appendChild(r);
    scrollDM();
    return r;
  }
  function bot(text, cls) {
    queue = queue.then(function () {
      return new Promise(function (res) {
        var t = themRow('<div class="bub them typing"><i></i><i></i><i></i></div>');
        setTimeout(function () {
          t.querySelector(".bub").outerHTML = '<div class="bub them' + (cls ? " " + cls : "") + '">' + esc(text) + "</div>";
          scrollDM();
          res();
        }, Math.min(1100, 450 + text.length * 6));
      });
    });
    return queue;
  }
  function me(text) {
    dmBody.appendChild(el('<div class="bub me">' + esc(text) + "</div>"));
    scrollDM();
  }
  function quick(options) {
    queue = queue.then(function () {
      $$(".quick", dmBody).forEach(function (q) { q.remove(); });
      var q = el('<div class="quick"></div>');
      options.forEach(function (o) {
        var b = o.href ? el('<a class="' + (o.wa ? "wa" : "") + '" href="' + esc(o.href) + '" target="_blank" rel="noopener">' + (o.icon ? ic(o.icon) : "") + esc(o.label) + "</a>")
          : el("<button type=\"button\">" + (o.icon ? ic(o.icon) : "") + esc(o.label) + "</button>");
        if (!o.href) b.addEventListener("click", function () { q.remove(); (o.run || function () { answer(o.value || o.label, true); })(); });
        q.appendChild(b);
      });
      dmBody.appendChild(q);
      scrollDM();
    });
  }
  function setPlaceholder(t, mode) {
    dmInput.placeholder = t;
    dmInput.type = mode === "email" ? "email" : mode === "tel" ? "tel" : "text";
    dmInput.autocomplete = mode === "email" ? "email" : mode === "tel" ? "tel" : mode === "name" ? "name" : "off";
  }

  function startFlow(ctx) {
    ctx = ctx || {};
    var known = { nom: store("pa_nom"), email: store("pa_email"), tel: store("pa_tel") };
    S = { step: null, besoin: "", budget: "", delai: "", message: "", nom: "", email: "", tel: "",
      known: known, opened: Date.now(), done: false, busy: false, askOtherEmail: false, veutRdv: !!ctx.reserver };
    if (!dmBody.children.length) {
      track("dm");
      dmBody.appendChild(el('<div class="dm-card"><div class="av"></div><b>' + esc(P.nom || "") + VERIF + "</b><small>" + esc(user()) +
        (P.titre ? " · " + esc(P.titre) : "") + '</small><button class="btn" data-go="profile">Voir le profil</button></div>'));
      dmBody.appendChild(el('<div class="ts">' + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + "</div>"));
      bot(P.dmBienvenue || "Bonjour ! Dites-moi tout sur votre marque et votre projet.");
    } else {
      bot("Avec plaisir, on repart sur une nouvelle demande.");
    }
    if (ctx.reserver) bot("Pour réserver un appel découverte, répondez d’abord à quelques questions rapides : je vous propose ensuite mes créneaux libres.");
    if (ctx.text) {
      queue = queue.then(function () { me(ctx.text); });
      S.message = ctx.text;
    }
    ask("besoin");
    if (ctx.besoin) queue = queue.then(function () { answer(ctx.besoin, true); });
    if (ctx.message) { dmInput.value = ctx.message; dmInput.dispatchEvent(new Event("input")); }
  }

  function ask(step) {
    S.step = step;
    S.askOtherEmail = false;
    var formules = (D.formules || []).map(function (f) { return f.titre; });
    if (step === "besoin") {
      bot("Qu’est-ce qui vous amène ?");
      quick(formules.map(function (t) { return { label: t }; }).concat([{ label: "Autre chose", value: "Autre / je ne sais pas encore" }]));
      setPlaceholder("Votre message…");
    } else if (step === "budget") {
      bot("Quel budget envisagez-vous ?");
      quick(BUDGETS.map(function (t) { return { label: t }; }));
      setPlaceholder("Votre budget, ou choisissez ci-dessus…");
    } else if (step === "delai") {
      bot("Pour quand ?");
      quick(DELAIS.map(function (t) { return { label: t }; }));
      setPlaceholder("Votre délai…");
    } else if (step === "message") {
      bot("Racontez-moi votre projet en quelques mots : votre marque, votre objectif, ce que vous attendez.");
      setPlaceholder("Décrivez votre projet…");
      focusInput();
    } else if (step === "nom") {
      bot("Comment vous appelez-vous ?");
      setPlaceholder("Votre nom", "name");
      focusInput();
    } else if (step === "email") {
      if (S.known.email) {
        bot("Je vous réponds à " + S.known.email + " ?");
        quick([{ label: "Oui" }, { label: "Autre email" }]);
      } else bot("Quelle adresse email pour vous répondre ?");
      setPlaceholder("vous@exemple.com", "email");
      if (!S.known.email) focusInput();
    } else if (step === "tel") {
      bot("Un numéro WhatsApp pour vous joindre plus vite ? (facultatif)");
      var o = [];
      if (S.known.tel) o.push({ label: "Utiliser le " + S.known.tel, value: "__known" });
      o.push({ label: "Passer", value: "__skip" });
      quick(o);
      setPlaceholder("+241 …", "tel");
    } else if (step === "send") {
      setPlaceholder("Votre message…");
      send();
    }
  }
  function focusInput() { queue.then(function () { if (innerWidth >= 768) dmInput.focus(); }); }

  function next() {
    var i = ORDRE.indexOf(S.step) + 1;
    while (i < ORDRE.length) {
      var s = ORDRE[i];
      if (s === "message" && S.message) { i++; continue; }
      if (s === "nom" && S.known.nom) { S.nom = S.known.nom; i++; continue; }
      break;
    }
    ask(ORDRE[i]);
  }

  function answer(text, fromChip) {
    if (!S || S.busy) return;
    text = String(text).trim();
    if (!text) return;
    $$(".quick", dmBody).forEach(function (q) { q.remove(); });
    var step = S.step;
    if (S.done) { startFlow({ text: text }); return; }
    if (step === "besoin" || step === "budget" || step === "delai") {
      me(text);
      if (fromChip || text.length <= 60) S[step] = text;
      else S.message = S.message ? S.message + "\n" + text : text;
      return next();
    }
    if (step === "message") { me(text); S.message = S.message ? S.message + "\n" + text : text; return next(); }
    if (step === "nom") { me(text); S.nom = text.slice(0, 120); return next(); }
    if (step === "email") {
      if (fromChip && text === "Oui") { me(text); S.email = S.known.email; return next(); }
      if (fromChip && text === "Autre email") { me(text); S.askOtherEmail = true; bot("Laquelle ?"); focusInput(); return; }
      me(text);
      if (!EMAIL_RE.test(text) || text.length > 200) {
        bot("Cet email ne semble pas valide, pouvez-vous le vérifier ?", "err");
        return;
      }
      S.email = text.toLowerCase();
      return next();
    }
    if (step === "tel") {
      if (text === "__skip") { me("Passer"); S.tel = ""; return next(); }
      if (text === "__known") { me(S.known.tel); S.tel = S.known.tel; return next(); }
      me(text);
      if (text.replace(/\D/g, "").length < 8) {
        bot("Ce numéro semble incomplet. Vérifiez-le, ou passez cette étape.", "err");
        quick([{ label: "Passer", value: "__skip" }]);
        return;
      }
      S.tel = text.slice(0, 30);
      return next();
    }
  }

  function send() {
    S.busy = true;
    queue = queue.then(function () {
      var t = themRow('<div class="bub them typing"><i></i><i></i><i></i></div>');
      return fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: S.nom, email: S.email, telephone: S.tel,
          besoin: S.besoin, budget: S.budget, delai: S.delai, message: S.message,
          website: $("#dmSite").value, ouvertureTs: S.opened,
        }),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          t.remove();
          S.busy = false;
          if (res.ok) {
            store("pa_nom", S.nom); store("pa_email", S.email); if (S.tel) store("pa_tel", S.tel);
            S.done = true;
            track("devis");
            bot(P.dmReponse || "Merci pour votre message ! Je reviens vers vous très vite.");
            if (S.veutRdv) return proposerRdv();
            var o = [{ label: "Réserver un appel découverte", icon: "calendar-plus", run: proposerRdv }];
            var wa = waHref("Bonjour Paule, je viens de vous écrire depuis votre site" + (S.besoin ? " au sujet de « " + S.besoin + " »" : "") + ".");
            if (wa) o.push({ label: "Continuer sur WhatsApp", icon: "whatsapp-logo", wa: true, href: wa });
            quick(o);
          } else {
            bot((res.d && res.d.erreur) || "Le message n’est pas parti. Réessayez dans un instant.", "err");
            quick([{ label: "Réessayer", run: function () { send(); } }]);
          }
        })
        .catch(function () {
          t.remove();
          S.busy = false;
          bot("Connexion interrompue, le message n’est pas parti.", "err");
          quick([{ label: "Réessayer", run: function () { send(); } }]);
        });
    });
  }

  /* --- Réservation d'un appel découverte, directement dans la conversation --- */
  var RDV = null;
  function majuscule(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function heureLisible(h) { return String(h).replace(":", " h "); }
  function dateGcal(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function lienAgenda(r) {
    var a = new Date(r.debut), b = new Date(a.getTime() + (r.dureeMin || 30) * 60000);
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("Appel découverte avec " + (P.nom || "Paule Ackerman")) +
      "&dates=" + dateGcal(a) + "/" + dateGcal(b) +
      "&details=" + encodeURIComponent("Rendez-vous pris sur " + location.origin + (r.lieu ? "\n" + r.lieu : "")) +
      (r.lieu ? "&location=" + encodeURIComponent(r.lieu) : "");
  }
  function proposerJours() {
    bot("Choisissez un jour pour un appel de " + RDV.dureeMin + " min :");
    quick(RDV.jours.map(function (j) {
      return { label: majuscule(j.libelle), run: function () { me(majuscule(j.libelle)); proposerHeures(j); } };
    }));
  }
  function proposerHeures(j) {
    bot("À quelle heure ? (heure de Libreville)");
    quick(j.heures.map(function (h) {
      return { label: heureLisible(h), run: function () { me(heureLisible(h)); reserverCreneau(j, h); } };
    }).concat([{ label: "Un autre jour", run: function () { me("Un autre jour"); proposerJours(); } }]));
  }
  function proposerRdv() {
    if (!S || !S.email) return startFlow({ reserver: true });
    S.step = "rdv";
    bot("Je regarde les disponibilités de Paule…");
    queue = queue.then(function () {
      return fetch("/api/rdv/creneaux").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }).then(function (d) {
      if (!d || !d.actif || !(d.jours || []).length) {
        bot("Pas de créneau libre en ligne pour le moment. Paule vous propose un horaire par email très vite.");
        return;
      }
      RDV = d;
      proposerJours();
    });
  }
  function reserverCreneau(j, h) {
    S.busy = true;
    queue = queue.then(function () {
      var t = themRow('<div class="bub them typing"><i></i><i></i><i></i></div>');
      return fetch("/api/rdv/reserver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: S.nom, email: S.email, telephone: S.tel, besoin: S.besoin,
          objet: String(S.message || "").slice(0, 900), debut: j.jour + "T" + h, website: $("#dmSite").value,
        }),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          t.remove();
          S.busy = false;
          if (res.ok) {
            track("rdv");
            bot("C’est noté : " + res.d.quand + " (" + res.d.dureeMin + " min)." + (res.d.lieu ? " " + res.d.lieu + "." : "") +
              " Paule vous confirme le rendez-vous très vite.");
            var o = [{ label: "Ajouter à mon agenda", icon: "calendar-plus", href: lienAgenda(res.d) }];
            var wa = waHref("Bonjour Paule, je viens de réserver un appel le " + res.d.quand + ".");
            if (wa) o.push({ label: "WhatsApp", icon: "whatsapp-logo", wa: true, href: wa });
            quick(o);
          } else {
            bot((res.d && res.d.erreur) || "La réservation n’a pas abouti. Réessayez.", "err");
            quick([{ label: "Voir les créneaux", run: function () { me("Voir les créneaux"); proposerRdv(); } }]);
          }
        })
        .catch(function () {
          t.remove();
          S.busy = false;
          bot("Connexion interrompue, la réservation n’est pas partie.", "err");
          quick([{ label: "Réessayer", run: function () { reserverCreneau(j, h); } }]);
        });
    });
  }

  dmInput.addEventListener("input", function () { dmSend.disabled = !dmInput.value.trim(); });
  dmForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = dmInput.value.trim();
    if (!t) return;
    if (!S) startFlow();
    dmInput.value = ""; dmSend.disabled = true;
    queue.then(function () { answer(t, false); });
  });

  function openDM(ctx) {
    ctx = ctx || {};
    closeLayers();
    go("messages");
    if (ctx.reserver && S && S.done) return proposerRdv();
    if (ctx.reserver && S) S.veutRdv = true;
    if (!S || S.done) return startFlow(ctx);
    if (ctx.text) { queue.then(function () { answer(ctx.text, false); }); return; }
    if (ctx.besoin && S.step === "besoin") queue.then(function () { answer(ctx.besoin, true); });
    if (ctx.message) { dmInput.value = ctx.message; dmInput.dispatchEvent(new Event("input")); dmInput.focus(); }
  }

  /* ---------------------------------------------------------------------
     Navigation entre les vues
  --------------------------------------------------------------------- */
  var SLUGS = { home: "", explore: "explorer", reels: "reels", messages: "messages", profile: "profil" };
  var CURRENT = "";
  function show(name) {
    if (!SLUGS.hasOwnProperty(name)) name = "home";
    closeLayers();
    toggleNotifs(false);
    $$(".view").forEach(function (v) { v.classList.toggle("on", v.dataset.view === name); });
    $$(".sb-item[data-go], .mbar [data-go]").forEach(function (b) { var on = b.dataset.go === name; b.classList.toggle("on", on); fill($(".ic", b), on); });
    document.body.classList.toggle("dm", name === "messages");
    if (name !== CURRENT) window.scrollTo(0, 0);
    if (name === "reels" && CURRENT !== "reels") track("reel");
    CURRENT = name;
    if (name === "messages") {
      store("pa_dm_vu", "1");
      $$(".js-dot").forEach(function (d) { d.hidden = true; });
      if (!S) startFlow();
    }
  }
  function go(name) {
    var h = "#" + SLUGS[name];
    if (location.hash === h || (!SLUGS[name] && !location.hash)) show(name);
    else location.hash = h;
  }
  function fromHash() {
    var h = decodeURIComponent((location.hash || "").slice(1));
    if (/^post-/.test(h)) {
      show("home");
      var t = document.getElementById(h);
      if (t) setTimeout(function () { t.scrollIntoView({ behavior: "smooth", block: "start" }); t.classList.add("flash"); }, 300);
      else if (ITEMS[h.slice(5)]) openItem(h.slice(5));
      return;
    }
    var name = "home";
    Object.keys(SLUGS).forEach(function (k) { if (SLUGS[k] === h && h) name = k; });
    show(name);
  }
  window.addEventListener("hashchange", fromHash);

  function toggleTheme() {
    var dark = root.dataset.theme === "dark";
    if (dark) delete root.dataset.theme; else root.dataset.theme = "dark";
    store("theme", dark ? "light" : "dark");
    var m = $('meta[name="theme-color"]'); if (m) m.content = dark ? "#ffffff" : "#000000";
  }

  /* ---------------------------------------------------------------------
     Clics (délégation)
  --------------------------------------------------------------------- */
  var lastTap = { t: 0, el: null };
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest && t.closest('a[href^="https://wa.me/"]')) track("wa");

    var g = t.closest("[data-go]");
    if (g) { e.preventDefault(); closeLayers(); toggleNotifs(false); return go(g.dataset.go); }

    var st = t.closest("[data-story]");
    if (st) { toggleNotifs(false); return openStory(st.dataset.story); }

    var op = t.closest("[data-open]");
    if (op) { toggleNotifs(false); return openItem(op.dataset.open, op.dataset.list); }

    var a = t.closest("[data-act]");
    if (a) {
      var act = a.dataset.act, host = a.closest("[data-id]"), id = host ? host.dataset.id : "";
      switch (act) {
        case "dm": return openDM();
        case "contact": return contactSheet();
        case "more": return moreSheet();
        case "notifs": return toggleNotifs();
        case "about": return openAbout();
        case "theme": return toggleTheme();
        case "close": return closeLayers(true);
        case "storyAll": return GROUPS.length && openStory(GROUPS[0].key);
        case "like": return setLike(id);
        case "save":
          var on = toggleList(saves, "pa_saves", id);
          $$('[data-id="' + id + '"] [data-act="save"]').forEach(function (b) { b.classList.toggle("saved", on); b.setAttribute("aria-pressed", on); fill($(".ic", b), on); });
          return toast(on ? "Enregistré" : "Retiré des enregistrements");
        case "share": return ITEMS[id] && shareItem(ITEMS[id]);
        case "comment": return ITEMS[id] && commentOn(ITEMS[id]);
        case "postMore": return postMoreSheet(id);
        case "nav": return openItem(a.dataset.to, a.dataset.list);
        case "tab": PF_TAB = a.dataset.tab; $$(".tab").forEach(function (b) { var on = b.dataset.tab === PF_TAB; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); fill($(".ic", b), on); }); return renderPfTab();
        case "toReel":
          go("reels");
          return setTimeout(function () { var r = document.getElementById("reel-" + a.dataset.id); if (r) r.scrollIntoView(); }, 60);
        case "moreCap":
          var cap = a.closest(".cap"); $(".c-short", cap).hidden = true; $(".c-full", cap).hidden = false; return;
        case "carPrev": case "carNext":
          var tr = $(".track", a.closest(".media"));
          return tr && tr.scrollBy({ left: (act === "carNext" ? 1 : -1) * tr.clientWidth, behavior: "smooth" });
        case "mute":
          var v = $("video", a.closest(".media, .reel-box"));
          if (!v) return;
          v.muted = !v.muted;
          a.innerHTML = ic(v.muted ? "speaker-slash" : "speaker-high");
          a.setAttribute("aria-label", v.muted ? "Activer le son" : "Couper le son");
          return;
        case "brand":
          var nom = (a.dataset.nom || "").toLowerCase();
          var et = (D.etudes || []).filter(function (x) { return (x.titre || "").toLowerCase().indexOf(nom) !== -1; })[0];
          return et ? openItem("e-" + et._id) : openAbout();
      }
    }

    /* double appui sur une photo = j'aime */
    var media = t.closest(".post .media, .pm .media, .reel-box");
    if (media && !t.closest("button, a, iframe")) {
      var now = Date.now();
      if (lastTap.el === media && now - lastTap.t < 320) {
        var h = media.closest("[data-id]");
        if (h) setLike(h.dataset.id, true, true, media);
        lastTap = { t: 0, el: null };
      } else lastTap = { t: now, el: media };
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (LAYERS.length) closeLayers(true); else toggleNotifs(false); }
    if (ST && e.key === "ArrowRight") stAction("next");
    if (ST && e.key === "ArrowLeft") stAction("prev");
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-open][tabindex], [data-act='toReel']")) e.target.click();
  });

  /* commentaires (messages privés à Paule depuis une publication) */
  document.addEventListener("input", function (e) {
    var f = e.target.closest && e.target.closest('form[data-form="comment"]');
    if (f) $("button", f).disabled = !e.target.value.trim();
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest('form[data-form="comment"]');
    if (!f) return;
    e.preventDefault();
    var host = f.closest("[data-id]"), it = host && ITEMS[host.dataset.id], inp = $("input", f), t = inp.value.trim();
    if (!t) return;
    inp.value = "";
    openDM({ text: "À propos de « " + (it ? titleOf(it) : "votre publication") + " » : " + t });
  });

  /* ---------------------------------------------------------------------
     Démarrage
  --------------------------------------------------------------------- */
  function render(d) {
    D = d || {}; P = D.profile || {}; A = D.apropos || {};
    try { if (!sessionStorage.getItem("pa_vu")) { sessionStorage.setItem("pa_vu", "1"); trackVisite(); } } catch (e) { trackVisite(); }
    ITEMS = {};
    (D.posts || []).map(fromPost).forEach(function (it) { ITEMS[it.id] = it; });
    (D.creations || []).map(fromCreation).forEach(function (it) { ITEMS[it.id] = it; });
    (D.videos || []).map(fromVideo).forEach(function (it) { ITEMS[it.id] = it; });
    (D.etudes || []).map(fromEtude).forEach(function (it) { ITEMS[it.id] = it; });
    if (P.photo) root.style.setProperty("--photo", "url('" + P.photo + "')");
    if (P.logo) $$(".sb-mono").forEach(function (mono) {
      mono.style.background = "#fff url('" + String(P.logo).replace(/'/g, "%27") + "') center/contain no-repeat";
      mono.textContent = "";
    });
    if (root.dataset.theme === "dark") { var m = $('meta[name="theme-color"]'); if (m) m.content = "#000000"; }
    $$(".js-handle").forEach(function (n) { n.textContent = user(); });
    $$(".js-name").forEach(function (n) { n.textContent = P.nom || ""; });
    $$(".js-dispo").forEach(function (n) { n.textContent = P.disponibilite || "Active maintenant"; });
    $$("[data-wa]").forEach(function (a) { var h = waHref(); a.hidden = !h; if (h) a.href = h; });
    if (store("pa_dm_vu")) $$(".js-dot").forEach(function (n) { n.hidden = true; });
    buildGroups();
    $("#homeStories").innerHTML = storyBtns();
    renderFeed();
    renderRight();
    renderProfile();
    renderExplore();
    renderReels();
    fromHash();
  }

  /* --- écran de chargement d'origine : nom lettre par lettre + polyèdre 3D --- */
  (function buildName() {
    var box = $("#emName");
    if (!box) return;
    var di = 0;
    "PAULE ACKERMAN".split("").forEach(function (c) {
      var s = document.createElement("span");
      if (c === " ") { s.className = "sp"; box.appendChild(s); return; }
      s.className = "ch"; s.textContent = c;
      s.style.animationDelay = (0.2 + di * 0.05) + "s";
      box.appendChild(s); di++;
    });
  })();

  var splash3D = null;
  function init3D() {
    if (splash3D || typeof THREE === "undefined" || !$("#splash")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var canvas = document.createElement("canvas");
    canvas.id = "bg3d";
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true }); } catch (e) { return; }
    document.body.appendChild(canvas);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
    cam.position.z = 8;
    var mobile = innerWidth < 760, N = mobile ? 45 : 80;
    var pos = new Float32Array(N * 3), speed = [];
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = (Math.random() - 0.5) * 10; pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
      speed.push(0.0008 + Math.random() * 0.0022);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7FA8F5, size: mobile ? 0.05 : 0.045, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(pts);
    var ico = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshBasicMaterial({ color: 0x4D86F2, wireframe: true, transparent: true, opacity: 0.5 }));
    var ico2 = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 0), new THREE.MeshBasicMaterial({ color: 0x2D6AE0, wireframe: true, transparent: true, opacity: 0.22 }));
    scene.add(ico); scene.add(ico2);
    var t = 0, alive = true;
    splash3D = { stop: function () {
      canvas.style.opacity = "0";
      setTimeout(function () { alive = false; renderer.dispose(); canvas.remove(); }, 1000);
    } };
    (function loop() {
      if (!alive) return;
      requestAnimationFrame(loop);
      t += 0.008;
      var p = geo.attributes.position.array;
      for (var k = 0; k < N; k++) { p[k * 3 + 1] += speed[k]; if (p[k * 3 + 1] > 5.4) p[k * 3 + 1] = -5.4; }
      geo.attributes.position.needsUpdate = true;
      pts.rotation.y = t * 0.05;
      ico.rotation.x = t * 0.35; ico.rotation.y = t * 0.5;
      ico2.rotation.x = -t * 0.22; ico2.rotation.y = -t * 0.3;
      renderer.render(scene, cam);
    })();
  }
  if (typeof THREE !== "undefined") init3D();
  else {
    var three = document.querySelector('script[src*="three.min.js"]');
    if (three) three.addEventListener("load", init3D);
  }

  /* Première visite de la session : animation complète (~3 s).
     Visites suivantes : écran raccourci pour ne pas faire attendre. */
  var dejaVu = false;
  try { dejaVu = !!sessionStorage.getItem("pa_splash"); sessionStorage.setItem("pa_splash", "1"); } catch (e) {}
  var splashMin = Date.now() + (dejaVu ? 1100 : 3200), dataPrete = false, splashFini = false;
  function hideSplash() {
    if (splashFini) return;
    splashFini = true;
    var s = $("#splash");
    if (splash3D) splash3D.stop();
    if (s) { s.classList.add("gone"); setTimeout(function () { s.remove(); }, 800); }
  }
  function maybeHide() { if (dataPrete) setTimeout(hideSplash, Math.max(0, splashMin - Date.now())); }
  setTimeout(hideSplash, 6000); // filet de sécurité si l'API ne répond pas
  fetch("/api/all")
    .then(function (r) { if (!r.ok) throw new Error("api"); return r.json(); })
    .then(function (d) { render(d); dataPrete = true; maybeHide(); })
    .catch(function (e) {
      console.warn("Contenu indisponible :", e);
      hideSplash();
      $("#feedPosts").innerHTML = '<div class="empty">Le contenu n’a pas pu être chargé. Rechargez la page dans un instant.</div>';
      show("home");
    });
})();
