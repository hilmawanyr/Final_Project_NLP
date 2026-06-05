import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-lite";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const requestSchema = z.object({
  review_text: z.string().min(1),
  rating: z.number().int().min(1).max(5)
});

const analysisSchema = z.object({
  predicted_sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  rating_sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  is_consistent: z.boolean(),
  explanation: z.string().min(1)
});

function ratingToSentiment(rating) {
  if (rating <= 2) return "Negative";
  if (rating === 3) return "Neutral";
  return "Positive";
}

async function analyzeWithOpenRouter(review_text, rating) {
  if (!openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is missing from .env or not loaded");
  }

  const prompt = [
    {
      role: "system",
      content:
        "You analyze Indonesian e-commerce reviews. Return only valid JSON with keys predicted_sentiment, rating_sentiment, is_consistent, explanation. Keep predicted_sentiment and rating_sentiment exactly as Positive, Neutral, or Negative because the code depends on those values. Write explanation in Bahasa Indonesia. Be careful with slang, emojis, and mixed Indonesian-English text."
    },
    {
      role: "user",
      content: JSON.stringify({
        review_text,
        rating,
        rating_sentiment: ratingToSentiment(rating)
      })
    }
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
      "X-Title": process.env.OPENROUTER_APP_NAME
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: prompt,
      temperature: 0,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  const parsed = analysisSchema.parse(JSON.parse(content));
  return parsed;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    model: openRouterModel,
    has_api_key: Boolean(openRouterApiKey)
  });
});

app.post("/analyze", async (req, res) => {
  const input = requestSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: input.error.flatten()
    });
  }

  try {
    const result = await analyzeWithOpenRouter(input.data.review_text, input.data.rating);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Analysis failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/analyze-batch", async (req, res) => {
  const batchSchema = z.object({
    reviews: z.array(requestSchema).min(1)
  });

  const input = batchSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: input.error.flatten()
    });
  }

  try {
    const results = [];
    for (const review of input.data.reviews) {
      const result = await analyzeWithOpenRouter(review.review_text, review.rating);
      results.push(result);
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: "Batch analysis failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  if (!openRouterApiKey) {
    console.warn("OPENROUTER_API_KEY is not set. /analyze will fail until .env is populated and the server is restarted.");
  }
});
