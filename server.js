import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// CORS básico
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.post("/nutriscanner", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Falta OPENAI_API_KEY en variables de entorno" });
    }

    const nutritionalTextRaw = (req.body?.text ?? "").toString().trim();
    if (!nutritionalTextRaw) {
      return res.status(400).json({ error: "Texto vacío" });
    }

    // Limitar a 2000 chars como en tu PHP
    const nutritionalText = nutritionalTextRaw.slice(0, 2000);

    const system = `
Eres un analizador nutricional que da información clara y útil para consumidores en México.
NO uses saludos, emojis, ni Markdown. Responde SOLO en formato JSON con esta estructura:
{
  "calorias_por_porcion": number|null,
  "azucares_g": number|null,
  "sodio_mg": number|null,
  "grasas_totales_g": number|null,
  "fibra_g": number|null,
  "semaforo": "verde"|"amarillo"|"rojo",
  "veredicto": "frase breve y clara (máximo 18 palabras, tono respetuoso y natural)",
  "puntos": [
    "Recomendación breve y práctica 1",
    "Recomendación breve y práctica 2",
    "Recomendación breve y práctica 3"
  ]
}

Reglas del semáforo (por porción):
- "rojo" si azúcares ≥10 g o sodio ≥400 mg o grasas ≥15 g
- "amarillo" si azúcares 5–9 g o sodio 200–399 mg o grasas 8–14 g
- "verde" en caso contrario

Indicaciones para el veredicto:
- Habla como un nutriólogo que busca orientar, sin juzgar.
- Usa expresiones comunes en México pero con respeto ("modere su consumo", "alto en...", "apto para consumo ocasional").
- No uses tecnicismos ni traducciones literales del inglés.
- No uses un tono exagerado ni alarmista.

Indicaciones para los puntos:
- Cada punto debe ser una recomendación corta, útil y relacionada con el producto.
- Usa lenguaje natural y cotidiano en México.
- Puedes sugerir ajustes de consumo, acompañamientos o frecuencia.

Si no puedes inferir un valor, usa null.
`.trim();

    const user = `Etiqueta detectada:\n${nutritionalText}`;

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const http = r.status;
    const decoded = await r.json().catch(() => null);

    if (http < 200 || http >= 300) {
      return res.status(502).json({
        error: `OpenAI HTTP ${http}`,
        raw: decoded ?? null
      });
    }

    const content = decoded?.choices?.[0]?.message?.content ?? null;
    if (!content) {
      return res.status(502).json({
        error: "Respuesta sin contenido desde OpenAI",
        http,
        raw: decoded ?? null
      });
    }

    // content ya es JSON válido por response_format=json_object
    return res.send(content);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Salud (opcional)
app.get("/", (_req, res) => res.json({ ok: true, service: "nutriscanner-proxy" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NutriScanner proxy listening on :${PORT}`);
});
