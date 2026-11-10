/* Atlas en el navegador: mismas operaciones, mismos números, enlaces que sobreviven. */
import { chromium } from "playwright";
import { sirvePublicado } from "./publicado.mjs";

const fallos = [];
const js = [];
const ok = (c, t, d) => {
  console.log("  " + (c ? "✅" : "❌") + " " + t + (d ? " · " + d : ""));
  if (!c) fallos.push(t);
};
const server = sirvePublicado();
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => js.push(e.message));
  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() => window.FUT && window.CabinaBridge && window.CabinaAtlas, null, { timeout: 20000 });

  await page.evaluate(() => {
    FUT.createAccount({ id: "atlas1", firm: "Atlas", name: "Cuenta Atlas", kind: "Evaluación",
      size: 50000, dd: 2000, ddKind: "estatico", target: 3000, limit: 50, status: "activa", ledger: [] });
    FUT.createTrade({ accountId: "atlas1", instrument: "MNQ", date: "2026-09-18", time: "10:00", stop: 20990, entry: 21000, exit: 21010, qty: 1, direction: "long" });
    FUT.createTrade({ accountId: "atlas1", instrument: "MNQ", date: "2026-09-18", time: "11:00", stop: 20990, entry: 21000, exit: 20990, qty: 1, direction: "long" });
  });
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("cabina-mnq:v1") || "";
    return raw.includes("Cuenta Atlas") && raw.includes("21010");
  }, null, { timeout: 8000 });
  const canon = await page.evaluate(() => {
    const rows = FUT.filtered({ tipo: "futuros", acct: "atlas1" }).map(t => t.pnlEff);
    const st = CabinaAtlas.statsOf(rows.map(pnl => ({ pnl })));
    return { n: rows.length, net: st.net, wr: st.wr };
  });
  ok(canon.n === 2 && canon.net === 0 && Math.abs(canon.wr - 0.5) < 1e-9, "dos MNQ suman 0 y 50% de acierto", JSON.stringify(canon));

  await page.locator("#tabnav > .tabbtn[data-tab='operaciones']").click();
  await page.waitForFunction(() => location.hash === "#operaciones" && document.querySelectorAll("#opsBody tbody tr").length === 2);
  const meta = await page.locator("#opsMeta").innerText();
  ok(/\$0/.test(meta) && /50%/.test(meta), "Operaciones enseña el mismo neto y win rate", meta);
  await page.locator("#opsBody [data-res='win']").click();
  await page.waitForFunction(() => location.search.includes("resultado=win") && document.querySelectorAll("#opsBody tbody tr").length === 1);
  ok(true, "el filtro de ganadoras queda en la URL y deja una fila");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.FUT && document.querySelectorAll("#opsBody tbody tr").length === 1);
  ok(locationKeeps(await page.evaluate(() => location.search), "resultado=win"), "el filtro sobrevive a recargar");

  await page.locator("#opsClear").click();
  await page.waitForFunction(() => !location.search.includes("resultado=") && document.querySelectorAll("#opsBody tbody tr").length === 2);
  const download = page.waitForEvent("download");
  await page.locator("#opsExport").click();
  const file = await download;
  ok(/\.csv$/.test(file.suggestedFilename()), "la exportación reutiliza el CSV canónico", file.suggestedFilename());

  await page.locator("#opsImport").click();
  await page.waitForFunction(() => location.hash === "#futuros");
  ok(await page.locator("#panelImportar").count() === 1, "importar abre el importador único de Futuros");
  await page.locator("#tabnav > .tabbtn[data-tab='operaciones']").click();
  await page.locator("#opsBackup").click();
  await page.waitForFunction(() => location.hash === "#ajustes");
  ok(await page.locator("#panelDatos").count() === 1, "la copia abre Ajustes, no un segundo almacén");

  await page.locator("#tabnav > .tabbtn[data-tab='diario']").click();
  await page.locator("#diaNew").click();
  await page.locator("#diaDate").fill("2026-09-18");
  await page.locator("#diaMood").selectOption("FOMO");
  await page.locator("#diaTitle").fill("Sesión de prueba");
  await page.locator("#diaNote").fill("Entré con prisa y lo anoté.");
  await page.locator("#diaLesson").fill("Esperar el cierre de la vela.");
  await page.locator("#diaForm button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector("#diaBody [data-atlas-out]")?.textContent.includes("Sesión de prueba"));
  await page.waitForFunction(() => {
    try { return (localStorage.getItem("cabina-mnq:v1") || "").includes("Sesión de prueba"); } catch (e) { return false; }
  }, null, { timeout: 4000 });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.CabinaBridge);
  const diario = await page.evaluate(() => CabinaBridge.journalList().map(e => e.title + "|" + e.mood + "|" + e.lesson));
  ok(diario.some(x => x.startsWith("Sesión de prueba|FOMO|")), "el diario persiste en la configuración", diario.join(" ; "));

  await page.goto(base + "#rendimiento", { waitUntil: "load" });
  await page.waitForFunction(() => location.hash === "#analitica" && document.querySelector(".tab.active")?.dataset.tab === "analitica");
  ok(true, "#rendimiento abre Analítica");
  await page.goto(base + "#estadisticas", { waitUntil: "load" });
  await page.waitForFunction(() => location.hash === "#edge");
  ok(true, "#estadisticas abre el catálogo de Estadísticas");
  await page.goto(base + "#journal", { waitUntil: "load" });
  await page.waitForFunction(() => location.hash === "#futuros");
  ok(true, "#journal sigue siendo la sesión de Futuros");

  await page.goto(base + "?acct=atlas1#operaciones", { waitUntil: "load" });
  await page.waitForFunction(() => window.CabinaBridge);
  await page.locator("#tabnav > .tabbtn[data-tab='analitica']").click();
  const kept = await page.evaluate(() => ({ search: location.search, hash: location.hash }));
  ok(kept.search.includes("acct=atlas1") && kept.hash === "#analitica", "cambiar de pestaña conserva el filtro", JSON.stringify(kept));

  await page.locator("#tabnav > .tabbtn[data-tab='cuentas']").click();
  await page.locator("#atlasCuentas [data-acct='atlas1']").click();
  await page.waitForFunction(() => location.hash === "#operaciones" && location.search.includes("acct=atlas1"));
  const caja = await page.evaluate(() => {
    history.replaceState(null, "", location.pathname + "#cuentas");
    document.querySelector("#tabnav > .tabbtn[data-tab='cuentas']").click();
    const row = [...document.querySelectorAll("#atlasCuentas tr")].find(tr => tr.textContent.includes("Cuenta Atlas"));
    return row ? row.textContent : "";
  });
  ok(/desconocido/.test(caja), "sin costes ni cobros la caja no se presenta como cero", caja);

  await page.locator("#tabnav > .tabbtn[data-tab='correlaciones']").click();
  await page.waitForFunction(() => /No hay evidencia suficiente|Pearson|Sin variación/.test(document.querySelector("#corrBody")?.innerText || ""));
  await page.locator("#corrX").selectOption("simbolo");
  await page.waitForFunction(() => (document.querySelector("#corrBody")?.innerText || "").includes("MNQ"));
  ok(true, "Correlaciones cambia de factor numérico a símbolo");

  await page.locator("#tabnav > .tabbtn[data-tab='insights']").click();
  const insight = await page.locator("#insBody").innerText();
  ok(/No hay evidencia suficiente/.test(insight) && !/Revenge trading|Overtrading/.test(insight),
    "con dos operaciones no se inventa un patrón", insight.slice(0, 220));

  const collapsed = await page.evaluate(() => ({
    title: document.querySelector("#tabnav [data-tab='diario']")?.getAttribute("title"),
    toggle: !!document.getElementById("sidebarToggle")
  }));
  ok(collapsed.title === "Diario" && collapsed.toggle, "cada destino tiene tooltip y el sidebar se puede cerrar");

  await page.evaluate(() => {
    FUT.createTrade({ instrument: "MES", date: "2026-09-19", time: "12:00", stop: 5000, entry: 5000, exit: 5010, qty: 1, direction: "long" });
  });
  await page.waitForFunction(() => (localStorage.getItem("cabina-mnq:v1") || "").includes("2026-09-19"), null, { timeout: 4000 });
  await page.goto(base + "?acct=atlas1#edge", { waitUntil: "load" });
  await page.waitForFunction(() => window.FUT && document.querySelector("#mxAcct") && document.querySelector("#mxAcct").value === "atlas1");
  const muestra = await page.locator("#mxN").innerText();
  ok(/N = 2 /.test(muestra), "Estadísticas abre con la cuenta de la URL", muestra);
  await page.locator("#mxAcct").selectOption("");
  await page.waitForFunction(() => !location.search.includes("acct="));
  ok(true, "quitar la cuenta en Estadísticas limpia la URL");
  await page.locator("#mxAcct").selectOption("atlas1");
  await page.waitForFunction(() => location.search.includes("acct=atlas1"));
  await page.locator("#edgeVerOps").click();
  await page.waitForFunction(() => location.hash === "#operaciones" && location.search.includes("acct=atlas1"));
  await page.waitForFunction(() => document.querySelectorAll("#opsBody tbody tr").length === 2);
  ok(true, "Ver operaciones abre el mismo recorte de cuenta");

  await ctx.close();

  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const night = await dark.newPage();
  night.on("pageerror", e => js.push(e.message));
  await night.addInitScript(() => localStorage.setItem("cabina-appearance:v1", JSON.stringify({ mode: "dark", accent: "default", custom: "#1d4ed8" })));
  await night.goto(base, { waitUntil: "load" });
  await night.waitForFunction(() => window.FUT);
  for (const tab of ["operaciones", "calendario", "diario", "analitica", "correlaciones", "insights", "edge", "cuentas"]) {
    await night.locator("#tabnav > .tabbtn[data-tab='" + tab + "']").click();
  }
  ok(await night.evaluate(() => document.documentElement.dataset.cabinaTheme) === "dark", "el tema oscuro sigue aplicándose");
  await dark.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const movil = await phone.newPage();
  movil.on("pageerror", e => js.push(e.message));
  await movil.goto(base, { waitUntil: "load" });
  await movil.waitForFunction(() => window.FUT);
  await movil.locator("#mobileMoreBtn").click();
  await movil.locator("#mobileMoreOv [data-mobile-more-tab='operaciones']").click();
  await movil.waitForFunction(() => location.hash === "#operaciones");
  const overflow = await movil.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!overflow, "Operaciones no desborda a 390 px");
  await phone.close();

  ok(js.length === 0, "sin errores de página", js.join(" | "));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
function locationKeeps(search, bit) { return search.includes(bit); }
console.log("fallos: " + fallos.length);
if (fallos.length) process.exit(1);
console.log("PASS atlas-ui");
