/* Rendu dynamique — remplit le site avec le contenu géré depuis /admin.
   Toutes les données viennent de GET /api/all ; le balisage reproduit
   exactement les classes CSS du design d'origine. */
(function () {
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var put = function (id, html) {
    var el = document.getElementById(id);
    if (el != null && html != null) el.innerHTML = html;
  };
  var txt = function (id, value) {
    var el = document.getElementById(id);
    if (el != null && value != null) el.textContent = value;
  };

  var VERIF = '<span class="verified"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';
  var ENGAGE =
    '<div class="engage">' +
    '<button class="eg-btn like" aria-label="J\'aime"><svg class="ico" viewBox="0 0 24 24"><path d="M12 20s-7-4.3-9.2-9C1 7.5 3.5 4.5 7 4.5c2 0 3.8 1.2 5 3 1.2-1.8 3-3 5-3 3.5 0 6 3 4.2 6.5C19 15.7 12 20 12 20z"/></svg><span class="lc"></span></button>' +
    '<button class="eg-btn" aria-label="Commenter"><svg class="ico" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/></svg></button>' +
    '<button class="eg-btn" aria-label="Partager"><svg class="ico" viewBox="0 0 24 24"><path d="M4 12V7l5 5-5 5v-5h8a6 6 0 0 0 6-6"/></svg></button>' +
    '<div class="eg-spacer"></div>' +
    '<button class="eg-btn save" aria-label="Enregistrer"><svg class="ico" viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg></button>' +
    "</div>";
  var MORE =
    '<button class="post-more" aria-label="Plus d\'options"><svg class="ico sm" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></button>';

  function chips(list) {
    if (!list || !list.length) return "";
    return '<div class="results">' + list.map(function (c) {
      return '<span class="res-chip">' + esc(c) + "</span>";
    }).join("") + "</div>";
  }

  function postHead(profile, p) {
    var sub = p.type === "partage" ? "a partagé" : esc(profile.handle || "");
    if (p.date) sub += " · " + esc(p.date);
    return (
      '<div class="post-head">' +
      '<div class="mini-av" style="background:#141A2A var(--photo) center/cover no-repeat"><span>' + esc((profile.nom || "P").charAt(0)) + "</span></div>" +
      '<div class="ph-id">' +
      '<div class="ph-nm">' + esc(profile.nom || "") + VERIF + "</div>" +
      '<div class="ph-sub">' + sub + "</div>" +
      "</div>" +
      (p.epingle ? '<span class="pin-tag">épinglé</span>' : MORE) +
      "</div>"
    );
  }

  /* Lien de plateforme (YouTube, TikTok, Instagram, Facebook) → lecteur intégré.
     Retourne null pour un fichier vidéo classique (.mp4…). */
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

  function embedFrame(emb, style) {
    return (
      '<iframe src="' + esc(emb.src) + '" style="' + style + '" ' +
      'frameborder="0" loading="lazy" allowfullscreen ' +
      'allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"></iframe>'
    );
  }

  function postMedia(p) {
    var tag = p.tag ? '<span class="pm-tag">' + esc(p.tag) + "</span>" : "";
    if (p.type === "video" && p.video) {
      var emb = embedInfo(p.video);
      var inner = emb
        ? embedFrame(emb, "position:relative;width:100%;height:100%;border:0;z-index:1;display:block")
        : '<video controls preload="metadata" playsinline poster="' + esc(p.poster || "") + '"' +
          ' src="' + esc(p.video) + '"' +
          ' style="position:relative;width:100%;height:100%;object-fit:contain;z-index:1;display:block">' +
          "Votre navigateur ne peut pas lire cette vidéo.</video>";
      return '<div class="post-media has-photo post-video">' + tag + inner + "</div>";
    }
    var imgs = p.images || [];
    if (!imgs.length) return "";
    var multi = imgs.length > 1;
    var dots = "";
    if (multi) {
      dots = '<div class="carousel-dots">';
      for (var i = 0; i < imgs.length; i++) dots += i === 0 ? '<i class="on"></i>' : "<i></i>";
      dots += "</div>";
    }
    return (
      '<div class="post-media has-photo">' + tag +
      (multi ? '<span class="car-count">1 / ' + imgs.length + "</span>" : "") +
      '<img class="post-photo" src="' + esc(imgs[0]) + '" alt="' + esc(p.alt || "") + '"' +
      (multi ? " data-images='" + JSON.stringify(imgs).replace(/'/g, "&#39;") + "' data-idx=\"0\" style=\"cursor:pointer\" title=\"Cliquez pour voir la suite\"" : "") +
      ">" + dots + "</div>"
    );
  }

  function renderPost(profile, p) {
    var body = "";
    if (p.type === "texte") {
      body = '<div class="text-post"><div class="tp-body">' + esc(p.texte) + "</div></div>";
    } else if (p.type === "partage") {
      body =
        '<div class="reshare">' +
        '<div class="rs-head"><div class="rs-av">' + esc(p.partageInitiale || (p.partageDe || "?").charAt(0)) + "</div>" +
        "<div><div class=\"rs-nm\">" + esc(p.partageDe || "") + '</div><div class="rs-hd">' + esc(p.partageSous || "") + "</div></div></div>" +
        '<div class="rs-text">' + esc(p.partageTexte || "") + "</div></div>" +
        (p.texte ? '<div class="post-cap">' + esc(p.texte) + "</div>" : "");
    } else {
      body = postMedia(p) +
        '<div class="post-cap">' + (p.texteGras ? "<b>" + esc(p.texteGras) + "</b>" : "") + esc(p.texte || "") + "</div>" +
        chips(p.chips);
    }
    return '<article class="post">' + postHead(profile, p) + body + ENGAGE + "</article>";
  }

  function renderCreations(list) {
    return list.map(function (c) {
      return (
        '<figure class="gal-item">' +
        '<div class="gal-pic"><img src="' + esc(c.image) + '" alt="' + esc(c.titre) + '" loading="lazy"></div>' +
        "<figcaption><span class=\"gal-t\">" + esc(c.titre) + '</span><span class="gal-tag">' + esc(c.tag || "") + "</span></figcaption>" +
        "</figure>"
      );
    }).join("");
  }

  function videoFigure(v, wide) {
    var emb = embedInfo(v.video);
    var media = emb
      ? embedFrame(emb, "width:100%;aspect-ratio:" + emb.ratio + ";border:0;display:block;background:#06080F")
      : '<video controls preload="metadata" playsinline poster="' + esc(v.poster || "") + '" src="' + esc(v.video) + '">' +
        "Votre navigateur ne peut pas lire cette vidéo.</video>";
    return (
      '<figure class="vid-item' + (wide ? " vid-wide" : "") + '">' +
      media +
      "<figcaption><span class=\"gal-t\">" + esc(v.titre) + '</span><span class="gal-tag">' + esc(v.tag || "") + "</span></figcaption>" +
      "</figure>"
    );
  }

  function renderEtudes(list) {
    return list.map(function (e) {
      var strip = "";
      if (e.galerie && e.galerie.length) {
        strip = '<div class="identity-strip">' + e.galerie.map(function (g) {
          return (
            '<figure class="id-thumb gal-item"><img src="' + esc(g.image) + '" alt="' + esc(g.legende) + '" loading="lazy">' +
            "<figcaption>" + esc(g.legende) + "</figcaption></figure>"
          );
        }).join("") + "</div>";
      }
      return (
        '<article class="case' + (e.large ? " case-wide" : "") + '">' +
        '<div class="case-thumb has-img"><img src="' + esc(e.image) + '" alt="' + esc(e.titre) + '"></div>' +
        '<div class="case-body">' +
        '<div class="cmeta">' + (e.meta || []).map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" +
        "<h3>" + esc(e.titre) + "</h3>" +
        "<p>" + esc(e.texte) + "</p>" +
        '<div class="results" style="padding:0">' + (e.chips || []).map(function (c) { return '<span class="res-chip">' + esc(c) + "</span>"; }).join("") + "</div>" +
        strip +
        "</div></article>"
      );
    }).join("");
  }

  function renderRegistre(list) {
    return list.map(function (r) {
      return (
        '<div class="reg-row"><div class="reg-av">' + esc(r.initiale || (r.nom || "?").charAt(0)) + "</div>" +
        '<div class="rg-id"><div class="rg-nm">' + esc(r.nom) +
        (r.badge ? ' <span class="badge-fid">' + esc(r.badge) + "</span>" : "") +
        '</div><div class="rg-c">' + esc(r.detail || "") + "</div></div>" +
        '<div class="rg-y">' + esc(r.periode || "") + "</div></div>"
      );
    }).join("");
  }

  function tlRows(list) {
    return list.map(function (r) {
      return (
        '<div class="tl-row"><div class="tl-yr">' + esc(r.annee) + '</div><div class="tl-ev">' + esc(r.titre) +
        (r.detail ? " <span>" + esc(r.detail) + "</span>" : "") + "</div></div>"
      );
    }).join("");
  }

  function skillTags(list, cls) {
    return '<div class="skill-tags">' + list.map(function (s) {
      var name = typeof s === "string" ? s : s.nom;
      var extra = typeof s === "string" ? (cls || "") : (s.niveau || "");
      return '<span class="skill' + (extra ? " " + extra : "") + '">' + esc(name) + "</span>";
    }).join("") + "</div>";
  }

  function linkList(reseaux) {
    return (reseaux || []).map(function (l) {
      return (
        '<a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span>' + esc(l.nom) +
        '</span><span class="lh">' + esc(l.detail || "") + "</span></a>"
      );
    }).join("");
  }

  function renderApropos(a, profile) {
    var monoLabel = 'style="font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:9px"';
    return (
      '<div class="ap-card"><h3>' + esc(a.introTitre) + '</h3><div class="lead">' + esc(a.introLead) + "</div>" +
      (a.introParagraphes || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" +

      '<div class="ap-card"><h3>Parcours</h3>' + tlRows(a.parcours || []) + "</div>" +

      '<div class="ap-card"><h3>Ce que je fais</h3>' +
      (a.services || []).map(function (s, i) {
        return (
          '<div class="svc-row"><div class="svc-n">' + String(i + 1).padStart(2, "0") + "</div>" +
          '<div><div class="svc-t">' + esc(s.titre) + '</div><div class="svc-d">' + esc(s.detail) + "</div></div></div>"
        );
      }).join("") + "</div>" +

      '<div class="ap-card"><h3>Boîte à outils</h3>' +
      "<div " + monoLabel + ">Maîtrisés</div>" +
      '<div class="skill-tags" style="margin-bottom:18px">' +
      (a.outilsMaitrise || []).map(function (o) { return '<span class="skill key">' + esc(o) + "</span>"; }).join("") + "</div>" +
      "<div " + monoLabel + ">En cours d'apprentissage</div>" +
      '<div class="skill-tags">' +
      (a.outilsApprentissage || []).map(function (o) { return '<span class="skill learning">' + esc(o) + "</span>"; }).join("") + "</div></div>" +

      '<div class="ap-card"><h3>Langues</h3>' + skillTags(a.langues || []) + "</div>" +

      '<div class="ap-card"><h3>Certifications &amp; formations</h3>' + tlRows(a.certifications || []) + "</div>" +

      '<div class="ap-card"><h3>Mes atouts</h3>' + skillTags(a.atouts || []) + "</div>" +

      '<div class="ap-card"><h3>Me retrouver ailleurs</h3><div class="linklist">' + linkList(profile.reseaux) + "</div></div>" +

      '<div class="ap-card vcard"><div class="vh">Un projet en tête ?</div>' +
      "<p>" + esc(profile.accrocheContact || "") + "</p>" +
      '<button class="btn-msg" data-open-dm>' +
      '<svg class="ico sm" viewBox="0 0 24 24"><path d="M4 5h16v12H7l-3 3z"/></svg>' +
      "Composer un message</button></div>"
    );
  }

  function render(d) {
    var p = d.profile || {};
    window.__PROFILE = p;

    if (p.photo) document.documentElement.style.setProperty("--photo", "url('" + p.photo + "')");
    txt("brandName", p.nom);
    txt("brandHandle", p.handle);
    txt("igName", p.nom);
    txt("igHandle", (p.handle || "") + " · " + (p.titre || ""));
    txt("dispoTxt", p.disponibilite);
    txt("vcardText", p.accrocheContact);
    txt("dmWelcome", p.dmBienvenue);
    var mail = document.getElementById("dmMail");
    if (mail && p.email) { mail.href = "mailto:" + p.email; mail.textContent = p.email; }

    put("igStats", (p.stats || []).map(function (s) {
      return '<div class="ig-stat"><b>' + esc(s.valeur) + "</b><span>" + esc(s.label) + "</span></div>";
    }).join(""));
    put("igBio", '<span class="b-serif">' + esc(p.bioAccroche || "") + "</span> " + esc(p.bio || ""));
    put("bioMeta",
      '<span><svg class="ico sm" viewBox="0 0 24 24"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>' + esc(p.localisation || "") + "</span>" +
      '<span><svg class="ico sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>' + esc(p.telephone || "") + "</span>" +
      '<span><svg class="ico sm" viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M4 7l8 6 8-6"/></svg>' + esc(p.email || "") + "</span>");

    var posts = d.posts || [];
    put("feedPosts", posts.map(function (post) { return renderPost(p, post); }).join(""));

    var creations = d.creations || [], videos = d.videos || [];
    put("galGrid", renderCreations(creations));
    put("vidGrid", videos.filter(function (v) { return v.section !== "perso"; }).map(function (v) { return videoFigure(v, false); }).join(""));
    put("vidPerso", videos.filter(function (v) { return v.section === "perso"; }).map(function (v) { return videoFigure(v, true); }).join(""));

    put("etudesView", renderEtudes(d.etudes || []));
    put("regCard", renderRegistre(d.registre || []));
    put("aproposView", renderApropos(d.apropos || {}, p));

    txt("countReels", String(creations.length + videos.length));
    txt("countEtudes", String((d.etudes || []).length));
    txt("countRegistre", String((d.registre || []).length));

    put("sideCertifs",
      '<div class="sc-h"><span>Certifications</span><span>' + (p.certifsCote || []).length + "</span></div>" +
      (p.certifsCote || []).map(function (c) {
        return (
          '<div class="mot"><div class="mq">' + esc(c.titre) + "</div>" +
          '<div class="ma"><span class="mav">' + esc(c.initiale || "·") + "</span>" + esc(c.org) + "</div></div>"
        );
      }).join(""));
    put("sideLinks", linkList(p.reseaux));
  }

  fetch("/api/all")
    .then(function (r) { if (!r.ok) throw new Error("api"); return r.json(); })
    .then(render)
    .catch(function (e) { console.warn("Contenu dynamique indisponible :", e); });
})();
