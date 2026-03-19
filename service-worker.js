// Jared Clicker - Push Notification Service Worker

self.addEventListener('push', function(event) {
  var data = { title: 'Jared Clicker', body: 'Something happened!', tag: 'jc-general' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Jared Clicker', {
      body: data.body || '',
      icon: '/jared-coin.png',
      badge: '/jared-coin.png',
      tag: data.tag || 'jc-general',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
