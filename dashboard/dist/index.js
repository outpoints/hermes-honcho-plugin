/** Backend-only dashboard registration.
 *
 * Hermes's web dashboard loads every enabled dashboard manifest, including
 * hidden API providers. Registering a null component completes that contract
 * without adding a second Honcho user interface.
 */
(function registerHonchoBackend() {
  const registry = window.__HERMES_PLUGINS__
  if (!registry || typeof registry.register !== 'function') {
    console.warn('[hermes-honcho-plugin] Dashboard plugin registry unavailable')
    return
  }

  function BackendOnly() {
    return null
  }

  registry.register('hermes-honcho-plugin', BackendOnly)
})()
