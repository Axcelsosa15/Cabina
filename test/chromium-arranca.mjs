// Comprueba que el Chromium que la suite va a usar ARRANCA de verdad en esta
// máquina. Son cinco segundos y existe por una razón concreta:
//
// Las dependencias del sistema las instala `apt-get`, y el espejo de Azure se
// cae. Cuando se cayó, el paso de apt daba el trabajo por perdido y la corrida
// moría SIN HABER EJECUTADO UNA SOLA PRUEBA — un rojo que no mide nada y que
// cuesta igual que uno real (corrida 42121784515: 8 min colgado bajando
// `fonts-wqy-zenhei`, cero pruebas).
//
// Pero «apt no contestó» y «a Chromium le falta una biblioteca» no son la misma
// cosa, y sólo la segunda impide probar el código. La imagen del runner ya trae
// casi todo lo que Chromium necesita, así que lo primero no implica lo segundo.
// Este archivo distingue las dos: en vez de suponer, LANZA el navegador.
//
//   · arranca y pinta  → las dependencias dan, la suite sigue y ella decide.
//   · no arranca       → rojo aquí, con el motivo en una línea, en vez de 119
//                        archivos rojos cada uno quejándose de lo mismo.
//
// Lo que NO hace: desactivar nada ni aflojar la compuerta. Si falta una
// biblioteca de verdad, esto sale en rojo igual que antes; lo que ya no se
// pierde es la corrida en la que no faltaba.
import { chromium } from 'playwright';

const apt_caido = process.env.APT_CAIDO === 'si';
const t0 = Date.now();
let navegador;

try {
  navegador = await chromium.launch();
} catch (e) {
  console.log(`::error::Chromium no arranca en esta máquina: ${(e && e.message || e).toString().split('\n')[0]}`);
  if (apt_caido) console.log('::error::apt no pudo instalar las dependencias del sistema en esta corrida y al menos una faltaba. Ésa es la causa, no el código.');
  else console.log('::error::apt terminó bien, así que esto no es el espejo: falta algo que install-deps ya no cubre.');
  process.exit(1);
}

try {
  const pagina = await navegador.newPage();
  await pagina.setContent('<p id="p">vivo</p>');
  const texto = await pagina.textContent('#p');
  if (texto !== 'vivo') {
    console.log(`::error::Chromium arrancó pero no pinta: #p dice ${JSON.stringify(texto)} y debía decir "vivo".`);
    process.exit(1);
  }
} finally {
  await navegador.close();
}

console.log(`Chromium arranca y pinta una página en ${Date.now() - t0} ms.`);
if (apt_caido) console.log('::warning::apt no respondió en esta corrida, pero Chromium arranca: la suite continúa y ella es la que decide. Esto no arregla el espejo.');
