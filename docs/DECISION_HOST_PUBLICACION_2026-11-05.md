# Un solo camino de publicación · 5 de noviembre de 2026

## El problema

El repositorio tiene **tres** caminos de publicación configurados a la vez:

| Camino | Qué hay en el repositorio | Señales de vida |
| --- | --- | --- |
| GitHub Pages | `pagina.yml`, con dominio propio en Settings | Despliega en cada verde de `pruebas` |
| Vercel | **nada** · ni `vercel.json` | Publica un check en cada PR y un preview por rama |
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
