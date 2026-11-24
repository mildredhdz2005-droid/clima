
// 1. Seleccionar los elementos HTML
const formulario = document.querySelector("#formulario");
const campoCiudad = document.querySelector("#ciudad");
const estado = document.querySelector("#estado");
const resultado = document.querySelector("#resultado");
const botonConsulta = formulario.querySelector('button[type="submit"]');
let controladorConsulta;
let numeroConsulta = 0;

// 2. Escuchar el envío del formulario
formulario.addEventListener("submit", consultarClima);


// 3. Función asíncrona para consultar las API
async function consultarClima(evento) {
    evento.preventDefault();

    const ciudad = campoCiudad.value.trim();

    if (!ciudad) {
        estado.textContent = "Escribe el nombre de una ciudad.";
        campoCiudad.focus();
        return;
    }

    const consultaId = ++numeroConsulta;
    controladorConsulta?.abort();
    controladorConsulta = new AbortController();
    const { signal } = controladorConsulta;

    resultado.hidden = true;
    estado.textContent = "Buscando ciudad...";
    botonConsulta.disabled = true;
    formulario.setAttribute("aria-busy", "true");

    try {
        const urlGeo = new URL(
            "https://geocoding-api.open-meteo.com/v1/search"
        );

        urlGeo.search = new URLSearchParams({
            name: ciudad,
            count: "1",
            language: "es",
            format: "json"
        }).toString();

        const respuestaGeo = await fetch(urlGeo, { signal });

        if (!respuestaGeo.ok) {
            throw new Error("No se pudo buscar la ciudad.");
        }

        const datosGeo = await respuestaGeo.json();

        // Comprobar que se encontró una ciudad
        const lugar = datosGeo.results?.[0];

        if (!lugar) {
            const error = new Error("No encontramos esa ciudad.");
            error.name = "CityNotFoundError";
            throw error;
        }

        estado.textContent = "Consultando el clima...";

        const urlClima = new URL(
            "https://api.open-meteo.com/v1/forecast"
        );

        urlClima.search = new URLSearchParams({
            latitude: lugar.latitude,
            longitude: lugar.longitude,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            daily: "weather_code,temperature_2m_max,temperature_2m_min",
            forecast_days: "10",
            timezone: "auto",
            temperature_unit: "celsius",
            wind_speed_unit: "kmh"
        }).toString();

        const respuestaClima = await fetch(urlClima, { signal });

        if (!respuestaClima.ok) {
            throw new Error("No se pudo consultar el clima.");
        }

        const datosClima = await respuestaClima.json();
        const actual = datosClima.current;

        if (!actual ||
            actual.temperature_2m == null ||
            !Number.isFinite(Number(actual.temperature_2m)) ||
            actual.relative_humidity_2m == null ||
            !Number.isFinite(Number(actual.relative_humidity_2m)) ||
            actual.apparent_temperature == null ||
            !Number.isFinite(Number(actual.apparent_temperature)) ||
            actual.wind_speed_10m == null ||
            !Number.isFinite(Number(actual.wind_speed_10m)) ||
            actual.weather_code == null ||
            !Number.isFinite(Number(actual.weather_code)) ||
            typeof actual.time !== "string") {
            throw new Error("La respuesta no incluye datos meteorológicos actuales válidos.");
        }

        const condicion = describirClima(actual.weather_code);

        mostrarPronosticos(datosClima.daily, actual.time.slice(0, 10));

        document.querySelector("#ubicacion").textContent =
            [lugar.name, lugar.admin1, lugar.country]
            .filter(Boolean).join(", ");

        document.querySelector("#icono").textContent =
            condicion.icono;
        document.querySelector("#icono").setAttribute(
            "aria-label",
            condicion.texto
        );

        document.querySelector("#temperatura").textContent =
            Number(actual.temperature_2m).toFixed(1) + " °C";

        document.querySelector("#descripcion").textContent =
            condicion.texto;

        document.querySelector("#humedad").textContent =
            actual.relative_humidity_2m + " %";

        document.querySelector("#sensacion").textContent =
            Number(actual.apparent_temperature).toFixed(1) + " °C";

        document.querySelector("#viento").textContent =
            actual.wind_speed_10m + " km/h";

        document.querySelector("#actualizacion").textContent =
            "Datos para " + actual.time.replace("T", " ") +
            " (hora local).";

        resultado.hidden = false;
        estado.textContent = "Consulta completada.";

    } catch (error) {
        if (consultaId !== numeroConsulta ||
            (error instanceof Error && error.name === "AbortError")) {
            return;
        }

        if (error instanceof TypeError) {
            estado.textContent =
                "No se pudo conectar con el servicio meteorológico. Comprueba tu conexión e inténtalo de nuevo.";
        } else if (error instanceof SyntaxError) {
            estado.textContent =
                "El servicio meteorológico devolvió una respuesta no válida.";
        } else {
            estado.textContent = error instanceof Error
                ? error.message
                : "Ocurrió un error al consultar el clima.";
        }
        if (!(error instanceof Error) ||
            error.name !== "CityNotFoundError") {
            console.error(error);
        }
    } finally {
        if (consultaId === numeroConsulta) {
            botonConsulta.disabled = false;
            formulario.removeAttribute("aria-busy");
        }
    }
}

function mostrarPronosticos(pronostico, fechaActual) {
    if (!pronostico ||
        !Array.isArray(pronostico.time) ||
        !Array.isArray(pronostico.weather_code) ||
        !Array.isArray(pronostico.temperature_2m_min) ||
        !Array.isArray(pronostico.temperature_2m_max)) {
        throw new Error("No se pudo interpretar el pronóstico.");
    }

    const cantidadDias = Math.min(
        10,
        pronostico.time.length,
        pronostico.weather_code.length,
        pronostico.temperature_2m_min.length,
        pronostico.temperature_2m_max.length
    );

    if (cantidadDias < 4 ||
        pronostico.time.slice(0, cantidadDias).some(fecha =>
            typeof fecha !== "string" ||
            Number.isNaN(Date.parse(`${fecha}T12:00:00`))
        )) {
        throw new Error("No hay suficientes datos para el pronóstico de tres días.");
    }

    const contenedorDiario = document.querySelector("#pronostico-diario");
    const contenedorDiezDias = document.querySelector("#pronostico-diez-dias");
    contenedorDiario.replaceChildren();
    contenedorDiezDias.replaceChildren();

    for (let indice = 1; indice < Math.min(4, cantidadDias); indice++) {
        contenedorDiario.append(
            crearDiaPronostico(pronostico, indice, fechaActual, true)
        );
    }

    const minimos = pronostico.temperature_2m_min
        .slice(0, cantidadDias)
        .map(Number);
    const maximos = pronostico.temperature_2m_max
        .slice(0, cantidadDias)
        .map(Number);
    const minimoGlobal = Math.min(...minimos);
    const maximoGlobal = Math.max(...maximos);
    const amplitud = Math.max(maximoGlobal - minimoGlobal, 1);

    for (let indice = 0; indice < cantidadDias; indice++) {
        const fila = crearDiaPronostico(pronostico, indice, fechaActual, false);
        const rango = fila.querySelector(".rango-temperatura");
        const inicio = ((minimos[indice] - minimoGlobal) / amplitud) * 100;
        const ancho = ((maximos[indice] - minimos[indice]) / amplitud) * 100;

        rango.style.left = `${inicio}%`;
        rango.style.width = `${Math.max(ancho, 3)}%`;
        contenedorDiezDias.append(fila);
    }
}

function crearDiaPronostico(pronostico, indice, fechaActual, diario) {
    const fecha = pronostico.time[indice];
    const codigo = Number(pronostico.weather_code[indice]);
    const condicion = describirClima(codigo);
    const minimo = Number(pronostico.temperature_2m_min[indice]);
    const maximo = Number(pronostico.temperature_2m_max[indice]);

    if (pronostico.weather_code[indice] == null ||
        !Number.isFinite(codigo) ||
        pronostico.temperature_2m_min[indice] == null ||
        pronostico.temperature_2m_max[indice] == null ||
        !Number.isFinite(minimo) ||
        !Number.isFinite(maximo) ||
        minimo > maximo) {
        throw new Error("Los datos del pronóstico no son válidos.");
    }

    const dia = fecha === fechaActual
        ? "Hoy"
        : new Intl.DateTimeFormat("es", { weekday: "short" })
            .format(new Date(`${fecha}T12:00:00`))
            .replace(".", "");

    if (diario) {
        const tarjeta = document.createElement("article");
        tarjeta.className = "pronostico-dia";

        const nombreDia = document.createElement("h3");
        nombreDia.textContent = dia;

        const icono = document.createElement("span");
        icono.className = "pronostico-icono";
        icono.textContent = condicion.icono;
        icono.setAttribute("role", "img");
        icono.setAttribute("aria-label", condicion.texto);

        const temperaturas = document.createElement("p");
        temperaturas.className = "dia-temperaturas";

        const temperaturaMaxima = document.createElement("strong");
        temperaturaMaxima.textContent = `${Math.round(maximo)}°`;

        const temperaturaMinima = document.createElement("span");
        temperaturaMinima.textContent = `${Math.round(minimo)}°`;

        temperaturas.append(temperaturaMaxima, temperaturaMinima);
        tarjeta.append(nombreDia, icono, temperaturas);
        return tarjeta;
    }

    const fila = document.createElement("article");
    fila.className = "fila-pronostico";

    const nombreDia = document.createElement("span");
    nombreDia.className = "fila-dia";
    nombreDia.textContent = dia;

    const icono = document.createElement("span");
    icono.className = "fila-icono";
    icono.textContent = condicion.icono;
    icono.setAttribute("role", "img");
    icono.setAttribute("aria-label", condicion.texto);

    const temperaturaMinima = document.createElement("span");
    temperaturaMinima.className = "fila-minima";
    temperaturaMinima.textContent = `${Math.round(minimo)}°`;

    const barra = document.createElement("span");
    barra.className = "barra-rango";
    barra.setAttribute(
        "aria-label",
        `Rango de ${Math.round(minimo)} a ${Math.round(maximo)} grados`
    );
    const rango = document.createElement("span");
    rango.className = "rango-temperatura";
    barra.append(rango);

    const temperaturaMaxima = document.createElement("span");
    temperaturaMaxima.className = "fila-maxima";
    temperaturaMaxima.textContent = `${Math.round(maximo)}°`;

    fila.append(
        nombreDia,
        icono,
        temperaturaMinima,
        barra,
        temperaturaMaxima
    );
    return fila;
}


// 9. Función para traducir los códigos meteorológicos
function describirClima(codigo) {

    const condiciones = {
        0:  { texto: "Despejado", icono: "☀️" },
        1:  { texto: "Principalmente despejado", icono: "🌤️" },
        2:  { texto: "Parcialmente nublado", icono: "⛅" },
        3:  { texto: "Nublado", icono: "☁️" },
        45: { texto: "Niebla", icono: "🌫️" },
        48: { texto: "Niebla", icono: "🌫️" },
        51: { texto: "Llovizna", icono: "🌦️" },
        53: { texto: "Llovizna", icono: "🌦️" },
        55: { texto: "Llovizna intensa", icono: "🌧️" },
        61: { texto: "Lluvia ligera", icono: "🌧️" },
        63: { texto: "Lluvia moderada", icono: "🌧️" },
        65: { texto: "Lluvia intensa", icono: "🌧️" },
        71: { texto: "Nevada ligera", icono: "❄️" },
        73: { texto: "Nevada moderada", icono: "❄️" },
        75: { texto: "Nevada intensa", icono: "❄️" },
        80: { texto: "Chubascos", icono: "🌦️" },
        81: { texto: "Chubascos moderados", icono: "🌧️" },
        82: { texto: "Chubascos intensos", icono: "🌧️" },
        95: { texto: "Tormenta eléctrica", icono: "⛈️" },
        96: { texto: "Tormenta con granizo", icono: "⛈️" },
        99: { texto: "Tormenta intensa con granizo", icono: "⛈️" }
    };

    return condiciones[codigo] || {
        texto: "Condición meteorológica variable",
        icono: "🌡️"
    };
}
