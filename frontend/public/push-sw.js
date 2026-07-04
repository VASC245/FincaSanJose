// Handlers de Web Push — inyectado al service worker de la PWA
// vía workbox.importScripts (ver vite.config.ts)

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* payload no-JSON */ }

  const title = data.title || 'Finca San José'
  const options = {
    body: data.body || '',
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
    tag: data.tag || 'finca-alert',
    data: { url: data.url || '/' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
