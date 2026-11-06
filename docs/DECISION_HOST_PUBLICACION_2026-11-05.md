# Un solo camino de publicación · 5 de noviembre de 2026

## El problema

El repositorio tiene **tres** caminos de publicación configurados a la vez:

| Camino | Qué hay en el repositorio | Señales de vida |
| --- | --- | --- |
| GitHub Pages | `pagina.yml`, con dominio propio en Settings | Despliega en cada verde de `pruebas` |
| Vercel | `vercel.json` (añadido en esta rama) | Publica un check en cada PR y un preview por rama · **sirve el dominio propio**, ver abajo |
| Netlify | `netlify.toml` y `netlify/database/migrations/` | Ninguna: ni check, ni workflow, ni referencia |

Y `pagina.yml` afirmaba «lo publicado es lo probado» comparando el sha256 de lo
servido en el dominio propio contra `sitio/index.html`. Los tres hosts servirían
el **mismo** `index.html` byte a byte para el mismo commit, así que el hash
coincide igual y la comparación no distingue de quién viene. El verde medía que
alguien se pusiera al día, no que lo subido por este workflow se sirva.

## Lo que está medido, y lo que no

Medido: el 5 de noviembre el run 204 de `pagina` falló tras 180 segundos. El
dominio servía `87bfb874…`, que es **exactamente** el `index.html` de #142,
mientras este workflow acababa de desplegar #143 (`99173df2…`). Veinte minutos
después el run 205 salió verde sin que nadie tocara nada. El dominio iba un
commit por detrás; no era otro build ni otro sitio.

Medido: `actions/deploy-pages` informa `http://www.cabina.site/`, no `https://`.
Pages no tiene certificado para ese dominio.

**No** medido: a qué host apunta el DNS de `www.cabina.site`. No se pudo resolver
desde el contenedor de revisión — el proxy deniega el dominio y también los
resolutores DNS-over-HTTPS. Así que esto no se decide por suposición.

## La decisión

**El dominio no se adivina: se le pregunta.** `pagina.yml` lleva ahora un paso,
antes de la comparación de hashes, que lee las cabeceras de quien contesta en
`page_url` y exige que sea GitHub Pages. Recorta al último bloque de cabeceras
para que un redirect desde Pages hacia el dominio propio no dé un falso positivo.

- Si contesta Pages → el paso siguiente verifica lo que dice verificar.
- Si contesta otro → **rojo**, nombrándolo, en el log del próximo despliegue.

Probado con cabeceras de Pages, Vercel, Netlify, un redirect Pages→Vercel y un
host desconocido: verde sólo en el primero.

## La recomendación, para cuando el hecho esté sobre la mesa

Quedarse con **Vercel** y retirar los otros dos. Es el único con integración
viva y verificable —check por PR y preview por rama, que es valor de revisión
que Pages y Netlify no dan aquí— y Netlify no da ninguna señal de uso. Retirar
un camino es borrar su configuración, no dejarla como documentación de algo que
no se aplica: `netlify.toml` razona con detalle por qué `app.js` debe revalidar
siempre, y ese razonamiento hoy no está en efecto en ningún sitio.

Lo que esa migración necesita, en orden: confirmar el DNS, portar los headers de
`netlify.toml` a `vercel.json`, y sólo entonces borrar `pagina.yml` y
`netlify.toml`. El segundo paso se hace ya, por separado, porque es seguro y
beneficioso pase lo que pase con el DNS.

---

## Lo que faltaba, ya medido · 6 de noviembre de 2026

La línea «**no** medido: a qué host apunta el DNS» ya no aplica, y conviene decir
primero por qué no se pudo medir ayer: **el dominio nunca estuvo roto.** El 403
era del proxy del contenedor de revisión, que deniega ese host y también los
resolutores DNS-over-HTTPS. Era mi ventana la que estaba tapiada, no el DNS.
Preguntado a la API de Vercel, el dominio está completo:

| Hecho | Valor |
| --- | --- |
| Registrador de `cabina.site` | Vercel (`registrar: new`, `renew: true`, expira 2027-11) |
| Nameservers | `ns1/ns2.vercel-dns.com`, **iguales** a `intendedNameservers` |
| Zona DNS | la sirve Vercel (`zone: true`) |
| `www.cabina.site` | atada al proyecto `cabina`, `verified: true`, `misconfigured: false` |
| Registros A de `www` | `64.29.17.65`, `216.198.79.65` |
| `cabina.site` | redirección 308 a `www.cabina.site` |
| Verificado por última vez | 2026-11-06 08:41:38 UTC |
| Producción en Vercel | `READY`, sigue `main`; la última es el merge de #143 (`6f7fb48`) |

Esas dos IPs son de Vercel. Las de GitHub Pages son `185.199.108-111.153`, y no
aparecen en la zona. **GitHub Pages no puede estar sirviendo `www.cabina.site`:
quien contesta ahí es Vercel.** Y `index.html` declara
`rel="canonical" href="https://www.cabina.site/"`, o sea que el host canónico que
la propia página anuncia es el de Vercel.

### Qué se sigue de esto

El paso «quién sirve el dominio publicado» de `pagina.yml` sigue siendo el
instrumento correcto, y ahora se sabe qué dos respuestas puede dar:

- `page_url` es `axcelsosa15.github.io/Cabina/` → **verde**, y lo que `pagina.yml`
  verifica es una copia espejo que nadie visita, porque su propio HTML le dice a
  los buscadores que la ignoren.
- `page_url` es el dominio propio → **rojo nombrando a Vercel**, y entonces queda
  demostrado que `pagina.yml` llevaba tiempo calificando a otro host. Eso
  explicaría el run 204 mejor que la propagación de Pages: veinte minutos de
  retraso es el ritmo de un tercero que despliega por su cuenta, no el de un CDN
  que acaba de recibir el artefacto.

Lo decide el próximo despliegue de `pagina` sobre `main`, que es el primero que
lleva el paso. No se puede forzar desde aquí: `workflow_dispatch` necesita
`actions: write` y la App no lo tiene.

### La decisión, ahora sin condicional

La recomendación de ayer tenía una precondición —«confirmar el DNS»— y está
cumplida: **el camino de publicación que sirve a los usuarios es Vercel.** El
orden que quedaba:

1. **Portar los headers a `vercel.json`** — hecho en esta rama, con
   `test/cache-publicada.mjs` detrás (12 aserciones).
2. **Retirar los otros dos caminos** — pendiente, y a propósito. Borrar
   `pagina.yml` y `netlify.toml` quita una vía de publicación viva: es
   reversible en git, pero no desde fuera, así que no se hace de tapadillo en
   la misma rama que un arreglo de CI. `netlify/database/migrations/` **no** se
   toca al retirar Netlify como host: son migraciones de base de datos y su
   relación con Supabase es otra pregunta.

Lo que sigue sin medirse, y no se puede desde aquí: si existe un sitio de
Netlify atado a este repositorio. No hay credenciales ni herramientas de Netlify
en esta sesión. `netlify.toml` no da ninguna otra señal de vida.
