# Pulso · Monitor con Arduino

Monitor educativo con fondo crema, lecturas grandes, corazón ilustrado animado y gráfica PPG. Funciona sin instalar paquetes adicionales.

## Abrir en tu Windows

1. Descarga el proyecto y extrae el ZIP completo, o clona el repositorio. No abras los archivos desde dentro del ZIP.
2. Abre **Visual Studio Code → Archivo → Abrir carpeta** y selecciona la carpeta del proyecto que contiene `package.json`.
3. Ve a **Terminal → Nueva terminal**. Usa PowerShell.
4. Escribe este comando y presiona Enter:

```powershell
npm.cmd start
```

5. Abre **http://localhost:3010** en **Chrome o Microsoft Edge de escritorio**.
6. La página inicia en **demostración**. Todos sus valores son simulados y están identificados como tales.
7. Para detener el servidor, vuelve a la terminal y presiona **Ctrl + C**.

No necesitas `npm install`. Necesitas Node.js 20 o posterior. El servidor usa el puerto 3010.

## Lo que ya hace

- Muestra una señal PPG de demostración con corazón animado.
- Permite conectar un puerto USB con Web Serial y leer los datos de Arduino.
- Al conectar, borra los datos simulados y empieza una sesión nueva de datos USB.
- Muestra frecuencia en BPM, intervalo en ms y amplitud pico a pico de los últimos dos segundos.
- Permite pausar solo la gráfica; la recepción y las lecturas siguen activas.
- Cambia la ventana a 5, 10 o 15 segundos; activa o desactiva cuadrícula y marcas de latido.
- Exporta un CSV con el origen de los datos en cada fila. Mantiene hasta 90 000 registros recientes.
- Se adapta a pantallas pequeñas. La conexión física por USB debe probarse en un navegador de escritorio compatible.
- Ofrece una vía de conducción ilustrativa. No se calcula ni se mide con el sensor.

## Conectar tu montaje real

Hace falta que **el programa de tu Arduino envíe datos por el puerto serie**. La página no programa la placa ni puede conocer el modelo del sensor o los pines de tu montaje. No incluye un programa de Arduino porque aún falta revisar tu sensor y tu código OLED actual.

1. Carga tu programa con Arduino IDE.
2. Cierra el **Monitor Serie** y el **Serial Plotter**: el navegador necesita usar ese mismo puerto.
3. En la página, abre **Cómo funciona** y elige los mismos baudios que `Serial.begin(...)` en tu programa. La página usa 115200 por defecto; también permite 57600, 38400, 19200 y 9600.
4. Presiona **Conectar Arduino** y elige el puerto de tu placa.
5. Si no aparecen datos, revisa el formato siguiente. Un puerto conectado no garantiza que el código esté enviando un formato compatible.

### Formato recomendado

Una línea JSON por muestra, terminada en salto de línea:

```json
{"signal":512,"bpm":72,"ibi":833,"beat":true}
```

Los números del ejemplo solo explican el formato; no son mediciones de tu montaje.

- `signal`: valor de la señal, en cuentas ADC. Es la señal que se dibuja. La página no aplica un filtro adicional.
- `bpm`: estimación de pulsaciones por minuto calculada en Arduino.
- `ibi`: intervalo entre pulsos en milisegundos. Si solo llega el intervalo, la página calcula BPM = 60000 / ibi.
- `beat`: `true` únicamente en la muestra donde se detecta un nuevo pulso; `false` en las demás. Controla la animación y el contador.
- Los campos pueden omitirse cuando todavía no están disponibles. BPM o IBI en cero no se muestran como una medición válida.

También acepta mensajes `S512`, `B72` y `Q833`, cada uno en su propia línea (señal, BPM y tiempo entre pulsos respectivamente); CSV `512,72,833,1`; o un número como `512` por línea. Con números de señal solamente **se dibuja la gráfica y se muestra amplitud, pero no se inventan BPM, intervalos ni eventos de latido**.

La gráfica muestra la señal que envía Arduino: si quieres una PPG filtrada, el programa debe enviar la señal filtrada en `signal`. PPG no es ECG. El corazón es una ilustración y la amplitud ADC no mide la fuerza de contracción cardíaca.

## Archivos para editar

| Archivo | Contenido |
| --- | --- |
| `dist/index.html` | Estructura, textos y corazón SVG |
| `dist/styles.css` | Colores, tamaños y distribución |
| `dist/app.js` | Gráfica, demostración, conexión USB, botones y exportación |
| `dist/protocol.js` | Lectura de los formatos enviados por Arduino |
| `server.mjs` | Servidor local, sin dependencias |

Para ejecutar las pruebas del lector de datos:

```powershell
npm.cmd test
```

La conexión física, el sensor, el cálculo de BPM de la placa y la pantalla OLED deben verificarse con el montaje real. Esta versión no certifica exactitud clínica. Es un prototipo educativo para observar bioseñales, no un dispositivo de diagnóstico.

Documentación técnica: https://developer.chrome.com/docs/capabilities/serial
