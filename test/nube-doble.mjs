/* UN DOBLE DE SUPABASE para las pruebas: auth + la tabla cabina_docs, dentro del
   navegador de Playwright (ctx.route), sin red. Se comporta como el real en lo que
   importa: tokens con forma de JWT, una fila por (usuario, ruta), RLS (cada token
   sólo ve y escribe lo suyo), tokens que caducan, refresh que se gasta, y la API
   que corta en 1000 filas.

   Y se puede romper a propósito, desde el test (no desde la página):
     e.caida          la red no llega (fetch falla)
     e.roto           toda escritura se rechaza (403 permission-denied)
     e.rutaRota       sólo la escritura de esa ruta se rechaza (500 doc-roto)
     e.lecturasRotas  las lecturas de esa colección fallan (503 unavailable)
     e.retraso        { ruta: ms } — la lectura de ese documento tarda

   LO QUE ESTE DOBLE NO DEMUESTRA: que la base real aísle a los usuarios. Eso es
   supabase/pruebas/aislamiento.sql, contra el proyecto de verdad. */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const PATH_OK = /^[A-Za-z0-9_.~:@+-]+(\/[A-Za-z0-9_.~:@+-]+)+$/;

export function nubeDoble(html) {
  const NUBE = (html.match(/const NUBE_URL = "([^"]+)"/) || [])[1];
  const CLAVE = (html.match(/const NUBE_CLAVE = "([^"]+)"/) || [])[1];
  const e = {
    usuarios: new Map(), tokens: new Map(), refresh: new Map(), filas: new Map(), pedidas: [], n: 0,
    caida: false, roto: false, rutaRota: '', lecturasRotas: '', retraso: {},
    ultimoRegistro: null, ultimaRecuperacion: null,
  };
  function nuevoUsuario(email, pass, confirmado = true) {
    const id = `00000000-0000-4000-8000-${String(++e.n).padStart(12, '0')}`;
    e.usuarios.set(email, { id, email, pass, confirmado });
    return id;
  }
  function sesion(u) {
    const at = `${b64({ alg: 'HS256' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated' })}.firma${++e.n}`;
    const rt = `rt${++e.n}`;
    e.tokens.set(at, { uid: u.id, caduca: Date.now() + 3600e3 });
    e.refresh.set(rt, u.id);
    return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
  }
  const porId = id => [...e.usuarios.values()].find(u => u.id === id);
  const filasDe = uid => [...e.filas.values()].filter(f => f.user_id === uid);
  const siembra = (uid, path, data) => { e.filas.set(uid + '|' + path, { user_id: uid, path, data }); };
  const escriturasA = path => e.pedidas.filter(x => x.m === 'POST' && x.ruta.startsWith('/rest/') && (() => { try { return JSON.parse(x.body).path === path; } catch { return false; } })()).length;

  async function ruta(route) {
    if (e.caida) return route.abort('internetdisconnected');
    const req = route.request(), u = new URL(req.url()), h = req.headers();
    const cuerpo = () => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } };
    const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: obj == null ? '' : JSON.stringify(obj) });
    e.pedidas.push({ m: req.method(), ruta: u.pathname + u.search, auth: h.authorization || '', apikey: h.apikey || '', body: req.postData() || '' });
    if (h.apikey !== CLAVE) return json(401, { message: 'Invalid API key' });

    if (u.pathname === '/auth/v1/token') {
      const b = cuerpo() || {};
      if (u.searchParams.get('grant_type') === 'password') {
        const usr = e.usuarios.get(b.email);
        if (!usr || usr.pass !== b.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!usr.confirmado) return json(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return json(200, sesion(usr));
      }
      const uid = e.refresh.get(b.refresh_token);
      if (!uid) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      e.refresh.delete(b.refresh_token);
      return json(200, sesion(porId(uid)));
    }
    if (u.pathname === '/auth/v1/signup') {
      const b = cuerpo() || {};
      e.ultimoRegistro = { email: b.email, redirect: u.searchParams.get('redirect_to') };
      if (!e.usuarios.has(b.email)) nuevoUsuario(b.email, b.password, false);
      const usr = e.usuarios.get(b.email);
      return json(200, { id: usr.id, email: usr.email, confirmation_sent_at: new Date().toISOString() });
    }
    if (u.pathname === '/auth/v1/recover') { e.ultimaRecuperacion = { email: (cuerpo() || {}).email, redirect: u.searchParams.get('redirect_to') }; return json(200, {}); }

    const at = String(h.authorization || '').replace(/^Bearer /, '');
    const t = e.tokens.get(at);
    if (!t) return json(401, { code: 'PGRST301', message: 'No suitable key or wrong key type' });
    if (t.caduca < Date.now()) return json(401, { code: 'PGRST301', message: 'JWT expired' });
    const uid = t.uid;

    if (u.pathname === '/auth/v1/logout') { e.tokens.delete(at); return route.fulfill({ status: 204, body: '' }); }
    if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') {
      const usr = porId(uid); const b = cuerpo() || {};
      if (b.password === usr.pass) return json(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' });
      usr.pass = b.password; return json(200, { id: usr.id, email: usr.email });
    }
    if (u.pathname !== '/rest/v1/cabina_docs') return json(404, { message: 'no existe en el doble' });

    /* RLS del doble: todo lo que se lee, cambia o borra es SOLO del dueño del token. */
    const mias = filasDe(uid);
    const eq = k => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
    if (req.method() === 'GET') {
      if (e.lecturasRotas && eq('coll') === e.lecturasRotas) return json(503, { code: 'unavailable', message: 'base caída' });
      if (eq('path') != null && e.retraso[eq('path')]) await new Promise(r => setTimeout(r, e.retraso[eq('path')]));
      let a = mias;
      if (eq('path') != null) a = a.filter(f => f.path === eq('path'));
      if (eq('coll') != null) a = a.filter(f => f.path.replace(/\/[^/]+$/, '') === eq('coll'));
      const orden = (u.searchParams.get('order') || 'path.asc').split(',')[0];
      const m = orden.match(/^(?:data->>(\w+)|(path))\.(asc|desc)$/);
      if (m) { const k = f => String(m[1] ? (f.data[m[1]] ?? '') : f.path); const s = m[3] === 'desc' ? -1 : 1; a = a.slice().sort((x, y) => (k(x) < k(y) ? -s : k(x) > k(y) ? s : x.path < y.path ? -1 : 1)); }
      const off = Number(u.searchParams.get('offset') || 0);
      const lim = Math.min(1000, Number(u.searchParams.get('limit') || 1000));   // la API real corta en 1000
      a = a.slice(off, off + lim);
      const sel = (u.searchParams.get('select') || 'data').split(',');
      return json(200, a.map(f => Object.fromEntries(sel.map(c => [c, f[c]]))));
    }
    if (req.method() === 'POST') {
      const b = cuerpo();
      if (e.roto) return json(403, { code: 'permission-denied', message: 'sin permiso' });
      if (b && e.rutaRota && b.path === e.rutaRota) return json(500, { code: 'doc-roto', message: 'solo ese documento' });
      if (!b || b.user_id !== uid) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "cabina_docs"' });
      if (!PATH_OK.test(b.path)) return json(400, { code: '23514', message: 'violates check constraint "cabina_docs_path_forma"' });
      e.filas.set(uid + '|' + b.path, { user_id: uid, path: b.path, data: b.data });
      return route.fulfill({ status: 201, body: '' });
    }
    if (req.method() === 'DELETE') {
      if (e.roto) return json(403, { code: 'permission-denied', message: 'sin permiso' });
      const p = eq('path'); if (p != null) e.filas.delete(uid + '|' + p);
      return route.fulfill({ status: 204, body: '' });
    }
    return json(405, { message: 'metodo' });
  }

  /* Un contexto con sesión ya abierta: la página arranca directamente en la cuenta. */
  async function conSesion(ctx, email, pass = 'contrasena-de-prueba') {
    if (!e.usuarios.has(email)) nuevoUsuario(email, pass);
    const u = e.usuarios.get(email), s = sesion(u);
    await ctx.route(NUBE + '/**', ruta);
    await ctx.addInitScript(v => { try { localStorage.setItem('cabina-sesion:v1', JSON.stringify(v)); } catch (x) { } },
      { at: s.access_token, rt: s.refresh_token, exp: Date.now() + 3600e3, uid: u.id, email: u.email });
    return u.id;
  }

  return { NUBE, CLAVE, e, nuevoUsuario, sesion, filasDe, siembra, escriturasA, ruta, conSesion };
}
