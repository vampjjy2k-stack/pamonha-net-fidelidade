// sw.js — Service Worker da Pamonha Net Fidelidade
// Responsável por: (1) receber notificações push mesmo com o app fechado,
// e (2) abrir o app na aba certa quando o cliente toca na notificação.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Pamonha Net', body: 'Você tem um novo aviso.', url: '#notifications' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [80, 40, 80],
    data: { url: data.url || '#notifications' },
    tag: 'pamonha-net-aviso',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '#notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.navigate ? client.navigate('/' + targetUrl) : null;
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/' + targetUrl);
      }
    })
  );
});
