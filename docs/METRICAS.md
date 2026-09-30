# Métricas / Edge

Pestaña propia. Sólo operaciones de **futuros** del journal (`type: "futuros"`): una
operación de inversión no entra en ninguna cifra, y `edge.mjs` lo comprueba con una
de +$9.999. Todo **neto de comisiones**.

## De dónde sale cada número

| | Fórmula | Fuente |
|---|---|---|
| Win rate | p = ganadoras / total | cuentas de `QE.analizarEdge` |
| Expectancy $ | E = p·W − q·L, con **q = perdedoras / N** | W y L sin redondear, de los netos |
| Expectancy R | media del R neto | R neto = P&L neto ÷ riesgo inicial |
| b | W / L, neto | — |
| Reward-to-risk | (\|target − entrada\| × $/pt × cts − comisión) ÷ riesgo inicial | por operación, planeado |
| Tamaño | floor(riesgo ÷ (puntos de stop × $/pt + comisión ida y vuelta)) | con aviso de slippage y de rejilla de ticks |
| Kelly | f* = p − (1 − p)/b | **sólo referencia**; nunca sugiere tamaño |
| Profit factor | ganancia bruta ÷ \|pérdida bruta\| | `QE.analizarEdge` |
| Sharpe | media(r − rf) ÷ σ(r), diario y ×√252 | `QE.metricasCurva` con `tasaLibreAnual` |
| Max drawdown | max[(pico − equity) ÷ pico], operación a operación | capital + P&L neto acumulado |
| Break-even | p(BE) = 1/(1 + b) | verde si p real > p(BE) |
| Riesgo de ruina | Monte Carlo, 10.000 caminos, remuestreando R netos | `QE.simularCuenta` |

**Riesgo inicial** = \|entrada − stop\| × $/punto × contratos + comisión × contratos. Es el
mismo denominador que el cálculo de tamaño, así que 1R significa lo mismo en toda la
pestaña.

## Tres decisiones que cambian el número

1. **q = perdedoras / N, no 1 − p.** Con q = 1 − p, cada operación plana cuenta como
   una pérdida media entera. Probado: +38, −22 y una plana dan E = 5,33 (la media
   real); con 1 − p darían −2. Sin planas, las dos q coinciden.
2. **Neto sin descontar dos veces.** Si el journal ya trae la comisión (campo
   «Comisiones $» o comisiones automáticas), se respeta. Si no, se descuenta la
   comisión por contrato de los parámetros. El journal **no cambia**: esas
   operaciones siguen allí en bruto, y la pestaña dice cuántas y cuánto.
3. **Un P&L escrito a mano se toma como bruto**, porque el motor lo usa tal cual. Si
   los tuyos ya son netos, hay una casilla para decirlo.

## Lo que el journal necesita

Ningún campo nuevo: todos existían. Lo que hace falta es **rellenarlos**:

| Campo | Sin él |
|---|---|
| entrada, stop | la operación cuenta en $, pero no en R, ni en la simulación |
| target | no hay reward-to-risk planeado |
| contratos | se toma 1 |
| Comisiones $ | se descuenta la comisión por contrato de los parámetros |
| setup, cuenta, fecha | no se puede filtrar por ellos |

Los parámetros (comisión, tasa libre, capital, fuente del riesgo, stop, contrato) se
guardan en `settings.meta.mx`. No hubo que migrar nada: `normalize()` ya conserva
`meta` entero.

## Relación con la Radiografía de Futuros

Las dos pestañas llaman a las mismas funciones del motor (`analizarEdge`,
`metricasCurva`, `simularCuenta`). Lo que no se repite es lo que se ve:

- **Caída máxima y Sharpe** están sólo aquí, netos y sobre el capital de la cuenta.
  La Radiografía los pintaba también, en bruto y sobre $25.000 fijos; se quitaron
  de allí y la pantalla dice dónde están.
- **Úlcera y Sortino** siguen en la Radiografía, medidos sobre el capital de las
  cuentas del filtro (la misma regla que aquí). Sin cuenta no se pintan.
- **Tasa de acierto** de la Radiografía excluye las planas; el **win rate** de aquí
  las incluye. Son dos preguntas distintas y tienen nombres distintos.

`test/radiografia.mjs` lo comprueba.
