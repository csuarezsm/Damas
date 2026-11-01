# Damas

Damas españolas para Android e iPhone: contra la máquina, dos jugadores en el mismo móvil, en línea y problemas de «juegan y ganan».
App Capacitor + web (`www/`). Todos los datos se guardan en el móvil; solo el juego en línea usa el servidor de juegos (nombre y jugadas, sin guardarlos).
Paquete: `com.itcanarias.damas` · versión 1.2.2

**iPhone y navegadores**: la misma app se publica como versión web instalable en https://csuarezsm.github.io/Damas/app/ (GitHub Pages, carpeta `docs/app`, copia de `www/`). En Safari: Compartir → «Añadir a pantalla de inicio». Tras cambiar `www/`, ejecuta `npm run web` antes del commit: las pruebas y el workflow comprueban que `docs/app` está al día. La página de descarga (https://csuarezsm.github.io/Damas/) ofrece Android e iPhone, y el mensaje de «Compartir la app» enlaza a ella.

© 2026 IT Canarias. Todos los derechos reservados.

Hecha con la misma plantilla y el mismo espíritu que Ajedrez, Chinchón y Pumba (tema por defecto: burdeos).

## Reglas (damas españolas)

- Tablero 8×8 con la gran diagonal a la derecha de cada jugador; se juega en las 32 casillas de juego (en la app se pintan del color oscuro). 12 peones por bando. Empiezan las blancas.
- El peón avanza una casilla en diagonal y come solo hacia delante. La dama **vuela**: se mueve y come a distancia, y cae en cualquier casilla libre detrás de la pieza comida.
- **Comer es obligatorio**, encadenando todas las capturas. **Ley de la cantidad**: la jugada que come más piezas. **Ley de la calidad**: a igual número, la que come más damas.
- Las piezas comidas se quitan al terminar la jugada (no se saltan dos veces ni se pasa por encima). El peón que corona comiendo termina la jugada.
- Pierde quien no puede mover (sin piezas o bloqueado). Tablas: triple repetición; 20 jugadas de dama por bando sin mover peón ni comer; tres damas (una en la gran diagonal) contra una dama sin ganar en 12 jugadas; una dama contra una dama; acuerdo.
- Notación española: casillas 1–32 desde la esquina de la derecha de las blancas (1 = h1, 32 = a8). `10-14` mueve, `14x23` come; en las capturas múltiples se anotan todas las casillas de llegada (`14x23x32`).

## Qué hace

- **Contra la máquina**: seis niveles (principiante, aficionado, intermedio, avanzado, experto y maestro), con blancas, negras o al azar. Deshacer, tablas y rendirse.
- **Modo aprendizaje**: pista y aviso cuando una jugada pierde 1,5 peones o más; se puede deshacer o seguir.
- **Dos jugadores** en el mismo móvil, con opción de girar el tablero en cada turno. **Reloj** opcional.
- **Jugar con el dedo**: tocar ficha y casilla, o arrastrar. Si hay que comer y tocas una ficha que no puede, avisa y marca las que sí. Si dos recorridos llegan a la misma casilla, pregunta por dónde. Una dama que come en círculo y vuelve a su casilla se juega tocándola otra vez.
- **Análisis** de cada partida: ★ mejor, ?! imprecisión, ? error, ?? error grave; mejor jugada en el tablero, barra de evaluación y precisión.
- **Problemas**: 162 de «juegan y ganan» (ganar material o la partida) en 1 a 5 jugadas, de fácil a difícil, casi todos con entrega y golpe. La máquina defiende; se acepta cualquier jugada que siga ganando. Pista, solución, problema del día y Elo de problemas.
- **Repasa tus errores**, **editor de posiciones** (FEN de damas: `W:W1,2,K10:B21,30`) y **jugar desde aquí**.
- **Jugar en línea** con el servidor común de IT Canarias (`wss://juegos.itcanarias.com/ws`, repo `csuarezsm/juegos-servidor`, juego `damas`): salas con código, el servidor valida las jugadas con las mismas reglas, reloj, tablas y revancha. Cuenta para el Elo.
- **Clasificación** con Elo, ficha de jugador, récords e historial. **PDN** (el formato de partidas de damas, `GameType 24`): exportar e importar.
- **Igual que la plantilla**: temas, colores del tablero, números de casilla, tamaño de letra, horizontal y tablet, sonidos sintetizados, bienvenida, copias automáticas, enviar partidas al grupo, actualizador del APK, compartir la app y borrar datos.

## Archivos (`www/`)

| Archivo | Qué contiene |
|---|---|
| `damas.js` | Reglas: tablero 0x88, jugadas legales (cantidad y calidad, dama voladora), tablas, FEN y PDN. La partida es una lista de jugadas (`f3e4`, `e4c6e8`: salida y llegadas) y el estado se calcula a partir de ella. Es el mismo archivo que usa el servidor (`motores/damas/damas.js`). |
| `motor.js` | Motor propio: alfa-beta (PVS) con profundización iterativa, tabla de transposición, jugadas asesinas, reducciones y quiescencia de capturas. Evaluación propia (material, avance, centro, guardia de la última fila, gran diagonal). Niveles, análisis y búsqueda exacta para los problemas. |
| `motor-worker.js` | Ejecuta el motor en segundo plano. |
| `piezas.js` | Fichas en SVG dibujadas para esta app. |
| `problemas.js` | Problemas, generados con `tools/generar-problemas.js` y elegidos con `tools/elegir-problemas.js`. |
| `juego.js` | Tablero, partida, reloj, análisis, problemas, editor, PDN y juego en línea. |
| `index.html` | Estilos, menú, temas, actualizador, copias, clasificación y arranque. |

Sin librerías ni motores de terceros: motor, fichas y problemas son propios.

### Niveles

| Nivel | Cómo juega | Elo para la clasificación |
|---|---|---|
| 1 Principiante | 1 jugada, mucho azar y errores a propósito | 600 |
| 2 Aficionado | 2 jugadas, bastante azar | 800 |
| 3 Intermedio | 3 jugadas, algo de azar | 950 |
| 4 Avanzado | 5 jugadas, poco azar | 1150 |
| 5 Experto | 0,4 s por jugada | 1450 |
| 6 Maestro | 2,2 s por jugada | 1650 |

Calibrados con `tools/calibrar-niveles.js`: cada nivel saca al anterior entre un 79 % y un 92 % de los puntos.

## Publicar una versión

1. Sube `versionCode` y `versionName` en `android/app/build.gradle`, `APP_VERSION` en `www/index.html` y `CACHE` en `www/sw.js`.
2. `npm run web` (versión web) y push a `main`. El workflow pasa las pruebas, compila el **APK** (`damas.apk`, con actualizador) y el **AAB** de Google Play (`damas-play.aab`), los firma y crea la Release `vX.Y.Z`.

### Secretos del repositorio (Settings → Secrets and variables → Actions)

- `ANDROID_KEYSTORE_BASE64`: el archivo `damas-release.jks` en base64.
- `ANDROID_KEYSTORE_PASSWORD`: su contraseña (alias de la clave: `damas`).

**Guarda el `.jks` y la contraseña en un lugar seguro.** Si se pierden, las versiones ya instaladas no podrán actualizarse sin desinstalar la app.

## Pruebas

`npm test` (unos 3 minutos) comprueba las reglas (perft, capturas, cantidad, calidad, dama voladora, coronación, tablas), 300 partidas al azar con PDN de ida y vuelta, el motor, los 162 problemas (solución válida y, en los cortos, una sola primera jugada ganadora), la fuerza de los niveles, el juego en línea contra una copia local del servidor común (busca `../juegos-servidor` o `JUEGOS_SERVIDOR`; en GitHub lo clona el workflow) y toda la interfaz en móvil, horizontal y tablet.

## Desarrollo local

```bash
npm install
npm test
npm run web               # copia www/ a docs/app (versión web)
npx cap sync android && npx cap open android
npm run icons             # iconos y splash a partir de assets/
node tools/generar-problemas.js 70 1 > cand1.json   # candidatos a problemas (semilla 1)
node tools/elegir-problemas.js cand*.json           # elige y escribe www/problemas.js
node tools/calibrar-niveles.js 5 4 16               # partidas entre dos niveles
```

## Web

- `docs/index.html`: página de descarga (Android e iPhone).
- `docs/app/`: la versión web instalable.
- `docs/privacidad.html`: política de privacidad (la pide Google Play).
- `docs/descargas.html`: contador de descargas del APK.

## Más juegos de IT Canarias

En el menú ⋮ → «🎲 Más juegos de IT Canarias» y en la página de descarga aparecen los otros juegos (Ajedrez, Damas, Chinchón, Pumba). El código es `www/masjuegos.js`, **el mismo archivo en todas las apps**, con la lista y los iconos (`www/juegos/`) dentro para que funcione sin conexión. Con internet, la app lee como mucho cada 12 horas el catálogo común `https://csuarezsm.github.io/juegos-servidor/juegos.json` (repo `juegos-servidor`, carpeta `docs/`): un juego nuevo añadido allí aparece en todas las apps sin actualizarlas. En Android, si el otro juego está instalado, el botón lo abre (plugin `OtrasApps` y `<queries>` del manifiesto); si no, lleva a su página de descarga, o a Google Play si el catálogo tiene su enlace `play` y esta es la versión de Play. En iPhone abre su versión web.

## Aviso de turno en línea

En una partida en línea, cuando pasa a ser tu turno suena un «ding-dong» corto y el móvil vibra (`www/turno.js`, el mismo archivo en todas las apps; sonido sintetizado). Se quita en ⋮ → Colores… → «🔔 Aviso de turno en línea». Suena con la app abierta; con la app en segundo plano el sistema puede pausarla.

**Despistes de la máquina (niveles 1 a 4)**: de vez en cuando la máquina juega a propósito una jugada peor, pero con un límite según el nivel (`maxLoss` en `www/motor.js`): Principiante puede perder bastante, mientras que Avanzado nunca pierde más de algo más de un peón en ese despiste. Nunca juega una jugada al azar que regale una pieza grande sin motivo.

## Idiomas (español e inglés)

⋮ → «🌐 Idioma · Language». La primera vez se usa el idioma del móvil (español si empieza por «es»; si no, inglés). La app está escrita en español y `www/idioma.js` traduce lo que se ve con el diccionario `www/i18n-en.js` (los dos, **los mismos archivos en todas las apps**): textos, plantillas con datos ({1}, {2}…), mensajes para compartir, imágenes, fechas y números. Cuando se añade o cambia un texto en español, hay que añadir su traducción al diccionario común (`comun/` en el chat de desarrollo) y copiarlo a todas las apps. Para otro idioma: un `i18n-<código>.js` y su nombre en `IDIOMAS` de `idioma.js`.

## Idiomas, invitaciones y avisos (noviembre 2026)

- **Idiomas**: español, inglés, francés, alemán e italiano (`www/i18n-*.js`, comunes a todas las apps). La primera vez se usa el del móvil.
- **Invitar con enlace** (`www/invitacion.js`, común): el mensaje lleva `https://csuarezsm.github.io/<repo>/unirse.html?c=CÓDIGO` (`docs/unirse.html`). En Android abre la app en la partida (`itc<juego>://unirse/CÓDIGO`, filtro en `AndroidManifest.xml`) o, si no está instalada, la página de descarga; en iPhone y ordenador abre la versión web ya dentro de la partida (`app/?unirse=CÓDIGO`).
- **Aviso de turno** (`www/turno.js`, común): sonido y vibración cuando te toca, en línea y contra la máquina. Se quita en ⋮ → Colores… → «🔔 Aviso de turno».
- **Nombre de la máquina**: al jugar contra la máquina se le puede poner nombre o elegir uno al azar (🎲).
