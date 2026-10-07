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

## La R sale del dinero, no de los precios apuntados

`QE.calcularTradeApp` publica dos R, y son dos preguntas distintas:

| | qué contesta | de dónde sale |
|---|---|---|
| `rReal` | cuánto ganaste por cada unidad arriesgada | el **P&L que ves**: el escrito a mano si existe, ya neto de comisiones si las hay |
| `QE.rRealApp(t)` | hasta dónde llegó el precio frente a la distancia al stop | sólo los **precios** |

La primera alimenta la ventaja, la esperanza y el Monte Carlo. La segunda contesta
«¿dejé correr la pérdida más allá del stop?», que no la mueve una comisión.

Las dos salían del mismo número —la R de los precios— así que la de dinero estaba
mal siempre que el P&L y los precios no coincidieran. Medido:

| | P&L que ves | R que publicaba | R correcta |
|---|---|---|---|
| P&L escrito a mano (el fill fue peor) | −$7 | **+10R** | −0,35R |
| «Comisiones $» 25 en el journal | −$5 | **+1,0R** | −0,25R |
| comisiones automáticas del contrato | −$0,50 | **+0,05R** | −0,025R |

Siempre en la misma dirección: inflaba la ventaja justo cuando la ejecución había
sido peor de lo planeado. La Radiografía llegaba a publicar una esperanza de
**+4,5R** sobre un sistema perdedor, y Métricas decía −0,675R sobre las mismas
operaciones. Sin comisiones y sin P&L a mano las dos R son el mismo número, que es
el caso normal. `quant.test.js`, `radiografia.mjs` y `aviso.mjs` lo vigilan.

**El signo de «Comisiones $» y de «Contratos» no significa nada: son magnitudes.**
La dirección la dice el campo de dirección, no el signo de la cantidad; y una
comisión es un coste, nunca un cobro. Lo resuelve el motor, en un solo sitio
(`QE.contratosDe`, y `Math.abs` sobre la comisión), y publica `contratos` y
`comisiones` ya resueltos para que esta pestaña los lea en vez de volver a
resolverlos. Medido con el código anterior, MNQ, 10 puntos a favor, 1 contrato:

| | lo que publicaba | lo correcto |
|---|---|---|
| «Comisiones $» = −25 | **+$45** y **+2,25R** | −$5 y −0,25R |
| Contratos = −3 | journal **R = 1,00** / Métricas **R = 0,33** | la misma R en las dos |

El segundo caso es el que importa más de los dos: el P&L se valuaba sobre 1 contrato
y el riesgo de esta pestaña sobre 3, así que la misma operación tenía dos R. Un valor
que ha habido que interpretar deja su aviso (`CANTIDAD_NEGATIVA`,
`COMISION_NEGATIVA`), que la interfaz pinta. `quant.test.js` y `test/signos.mjs`.

**Una cantidad de cero no es una operación.** El motor hace `toNum(qty) || 1`, así
que 0 contratos contaban como 1: medido, 10 puntos a favor metían $20 de ganancia
inventada en la cuenta. El editor ya no lo guarda. La cantidad **vacía** sigue
valiendo 1, que está documentado más arriba.

Sólo se exige donde la cantidad **mueve unidades**: futuros, y en inversión las
compras, ventas y aportes. Un **cobro** —dividendo, cupón, prima, alquiler— no
tiene cantidad y su importe va en «Resultado $»; exigírsela fue el primer intento
de esta guarda y bloqueaba un caso legítimo. `aviso.mjs` vigila los dos lados.

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
