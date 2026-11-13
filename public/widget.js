/*
 * Widget de billetterie Event509.
 * Utilisation : <script src="https://VOTRE-SITE/widget.js" data-event="slug-de-l-evenement" async></script>
 * Options : data-theme="dark", data-height="460". L'achat se fait sur Event509 (page sécurisée) : aucun paiement ni donnée
 * d'acheteur ne transite par votre site.
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-event');
  if (!slug) return;
  var origin = new URL(s.src).origin;
  var f = document.createElement('iframe');
  f.src = origin + '/widget/' + encodeURIComponent(slug) + (s.getAttribute('data-theme') === 'dark' ? '?theme=dark' : '');
  f.title = 'Billetterie Event509';
  f.loading = 'lazy';
  f.style.cssText = 'width:100%;max-width:420px;height:' + (s.getAttribute('data-height') || '460') + 'px;border:0;border-radius:16px;display:block;';
  s.parentNode.insertBefore(f, s.nextSibling);
  // Le widget annonce sa hauteur réelle : l'iframe s'y ajuste (seuls les messages de notre origine sont lus)
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== 'event509:height' || e.data.slug !== slug) return;
    var h = Number(e.data.height);
    if (h > 120 && h < 2000) f.style.height = h + 'px';
  });
})();
