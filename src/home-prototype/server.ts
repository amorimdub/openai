// Throwaway map-first intake on /prototype/home. No backend mutations.
const root = import.meta.dir;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PROTOTYPE_PORT ?? 4317),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/') return Response.redirect(new URL('/prototype/home', request.url));
    if (path === '/prototype/home' || path === '/prototype/home/') {
      const html = await Bun.file(`${root}/index.html`).text();
      return new Response(html.replace('__PROTOTYPE_REVIEW__', String(process.env.NODE_ENV !== 'production')), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const assets: Record<string, string> = {
      '/prototype/home/style.css': 'style.css',
      '/prototype/home/app.js': 'app.js',
      '/prototype/home/places.geojson': 'places.geojson',
      '/prototype/home/ireland.geojson': 'ireland.geojson',
    };
    return assets[path] ? new Response(Bun.file(`${root}/${assets[path]}`)) : new Response('Not found', { status: 404 });
  },
});
console.log(`Home-screen prototype: http://localhost:${server.port}/prototype/home`);
