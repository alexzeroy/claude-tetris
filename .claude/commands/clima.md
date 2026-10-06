Obtén el clima actual para la ubicación del usuario usando la API de wttr.in.

Si el usuario proporcionó una ciudad como argumento ($ARGUMENTS), úsala. Si no, usa "Asuncion,Paraguay" como ubicación por defecto.

Pasos:
1. Construye la URL: `https://wttr.in/{ciudad}?format=j1` (reemplaza espacios con `+`)
2. Usa WebFetch para obtener el JSON
3. Extrae y muestra en español:
   - Ciudad y país
   - Temperatura actual (°C)
   - Sensación térmica (°C)
   - Descripción del clima (tradúcela al español)
   - Humedad (%)
   - Viento (km/h y dirección)
   - Temperatura máxima y mínima del día

Presenta la información de forma clara y concisa, sin mostrar el JSON crudo.
