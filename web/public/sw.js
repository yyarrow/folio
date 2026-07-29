const CACHE_NAME = "folio-shell-v3";
const DB_NAME = "folio-mobile";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("notes")) {
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("by-updated-at", "updatedAt");
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("deletions")) {
        db.createObjectStore("deletions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("scoped-notes")) {
        const notes = db.createObjectStore("scoped-notes", { keyPath: "storageKey" });
        notes.createIndex("by-scope", "scope");
      }
      if (!db.objectStoreNames.contains("scoped-outbox")) {
        const outbox = db.createObjectStore("scoped-outbox", { keyPath: "storageKey" });
        outbox.createIndex("by-scope", "scope");
      }
      if (!db.objectStoreNames.contains("scoped-deletions")) {
        const deletions = db.createObjectStore("scoped-deletions", { keyPath: "storageKey" });
        deletions.createIndex("by-scope", "scope");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSharedContext(context) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("meta", "readwrite");
    transaction.objectStore("meta").put(context, "shared-context");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(["/", "/offline.html", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => {
    try {
      return new URL(url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urls)));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith((async () => {
      const form = await event.request.formData();
      await storeSharedContext({
        title: String(form.get("title") || ""),
        text: String(form.get("text") || ""),
        url: String(form.get("url") || ""),
      });
      return Response.redirect(new URL("/?shared=1", self.location.origin), 303);
    })());
    return;
  }

  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put("/", response.clone());
        return response;
      } catch {
        return (await caches.match("/")) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  if (["style", "script", "image", "font"].includes(event.request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    })());
  }
});
