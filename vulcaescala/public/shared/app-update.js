/* Atualização automática — mesmo mecanismo dos Apps CTV Campo.
   Um único service worker (o da raiz do portal, ao lado deste arquivo) controla
   todos os módulos. Checa versão nova no load, a cada 30s, ao voltar ao primeiro
   plano e quando a rede volta. Recarrega quando o novo SW assume, mas nunca com
   um campo em edição ou uma janela aberta (para não perder o que está sendo digitado).
   Toda página do portal deve carregar este arquivo (portal, Escala, Emenda, Medidas). */
(function () {
  if (!('serviceWorker' in navigator)) return;

  // pasta deste script = raiz do portal (vale em /, /escala/, /emenda/ e /medidas/)
  var base = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*([?#].*)?$/, '');

  var refreshing = false;
  var pending = false;
  var hadController = !!navigator.serviceWorker.controller;
  var swReg = null;

  // só segura a atualização se houver texto digitado ou janela aberta
  // (campo vazio com o cursor não tem nada a perder)
  function editando() {
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value) return true;
    if (document.querySelector('[role="dialog"]')) return true;
    return false;
  }

  function tentarRecarregar() {
    if (!pending || refreshing) return;
    if (editando()) return;
    refreshing = true;
    try { location.reload(); } catch (e) {}
  }

  function checarUpdate() {
    if (swReg && swReg.update) { try { swReg.update(); } catch (e) {} }
  }

  function ativarWaiting(sw) {
    if (sw) { try { sw.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {} }
  }

  function monitorarInstalacao(sw) {
    sw.addEventListener('statechange', function () {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) ativarWaiting(sw);
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    pending = true;
    tentarRecarregar();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register(base + 'service-worker.js', { scope: base, updateViaCache: 'none' }).then(function (reg) {
      swReg = reg;
      if (reg.waiting) ativarWaiting(reg.waiting);
      if (reg.installing) monitorarInstalacao(reg.installing);
      reg.addEventListener('updatefound', function () {
        if (reg.installing) monitorarInstalacao(reg.installing);
      });
      checarUpdate();
      // Migração: remove os service workers antigos de /escala/ e /emenda/ (o da raiz
      // passa a controlar tudo). Só mexe em registros DENTRO do portal — outros apps
      // CTV no mesmo domínio não são tocados.
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          if (r.scope !== base && r.scope.indexOf(base) === 0) { try { r.unregister(); } catch (e) {} }
        });
      }).catch(function () {});
    }).catch(function () {});
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { checarUpdate(); tentarRecarregar(); }
  });
  window.addEventListener('online', checarUpdate);
  setInterval(checarUpdate, 30000);
  document.addEventListener('focusout', function () { setTimeout(tentarRecarregar, 100); }, true);
})();
