// Must be imported first so OpenTelemetry is initialized before the OpenAI
// client is created and instrumented.
import {
    langfuseEnabled,
    flushTracing,
    shutdownTracing,
} from "./instrumentation.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { parse } from "csv-parse/sync";
import swaggerUi from "swagger-ui-express";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { startActiveObservation, propagateAttributes } from "@langfuse/tracing";
import {
    analysisResultSchema,
    batchRequestSchema,
    csvRowSchema,
    reviewRequestSchema,
    scrapingRequestSchema,
} from "./schemas.js";
import openapiSpec from "./openapi.js";

dotenv.config();

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});
const port = process.env.PORT || 3000;
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
const defaultOpenRouterModel =
    process.env.OPENROUTER_MODEL?.trim() || "google/gemini-3.1-flash-lite";
const allowedModels = (process.env.OPENROUTER_MODELS || defaultOpenRouterModel)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
const ScraperAppHost = process.env.SCRAPER_APP_HOST?.trim();
const ScraperAppToken = process.env.SCRAPER_APP_TOKEN?.trim();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/openapi.json", (_req, res) => {
    res.json(openapiSpec);
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

function ratingToSentiment(rating) {
    if (rating <= 2) return "Genuine Negative";
    if (rating === 3) return "Neutral";
    return "Positive";
}

function normalizeCsvRows(buffer) {
    const records = parse(buffer, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    return records.map((row) => csvRowSchema.parse(row));
}

function resolveModel(requestedModel) {
    const selectedModel = requestedModel?.trim() || defaultOpenRouterModel;
    if (!allowedModels.includes(selectedModel)) {
        throw new Error(`Model not allowed: ${selectedModel}`);
    }
    return selectedModel;
}

// OpenRouter is OpenAI-compatible, so we use the OpenAI SDK pointed at its base
// URL. Constructed lazily so the server can still boot (and warn) without a key.
let _openRouterClient = null;
function getOpenRouterClient() {
    if (!_openRouterClient) {
        _openRouterClient = new OpenAI({
            apiKey: openRouterApiKey,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
                "X-Title": process.env.OPENROUTER_APP_NAME,
            },
        });
    }
    return _openRouterClient;
}

// Wraps an Express handler in a Langfuse trace (a root span whose name becomes
// the trace name). LLM generations created inside `handler` nest under it
// automatically via OpenTelemetry context. No-op when tracing is disabled.
async function withTrace(name, { tags, ...attributes } = {}, handler) {
    if (!langfuseEnabled) return handler();
    const run = () =>
        startActiveObservation(name, async (span) => {
            span.update(attributes);
            return handler(span);
        });
    return tags ? propagateAttributes({ tags }, run) : run();
}

async function analyzeWithOpenRouter(review_text, rating, model) {
    if (!openRouterApiKey) {
        throw new Error(
            "OPENROUTER_API_KEY is missing from .env or not loaded",
        );
    }
    const selectedModel = resolveModel(model);
    const ratingSentiment = ratingToSentiment(rating);

    const prompt = [
        {
            role: "system",
            content: `You analyze Indonesian e-commerce reviews. Return only valid JSON with keys predicted_sentiment,
            rating_sentiment, is_consistent, explanation, confidence_percentage.
            Keep predicted_sentiment and rating_sentiment exactly as Positive, Neutral, Irrelevant, Sarcastic Negative, or
            Genuine Negative because the code depends on those values. Irrelevant is when the rating is low but the comments are positive.
            Sarcastic Negative is characterized by high ratings and negative comments.
            Write explanation in Bahasa Indonesia.
            Be careful with slang, emojis, and mixed Indonesian-English text.
            For confidence_percentage must be in integer type.`,
        },
        {
            role: "user",
            content: JSON.stringify({
                review_text,
                rating,
                rating_sentiment: ratingSentiment,
            }),
        },
    ];

    // observeOpenAI records this call as a Langfuse generation, automatically
    // capturing the model, token usage, and input/output messages.
    const client = langfuseEnabled
        ? observeOpenAI(getOpenRouterClient(), {
              generationName: "review-consistency-analysis",
              generationMetadata: { rating, rating_sentiment: ratingSentiment },
          })
        : getOpenRouterClient();

    const completion = await client.chat.completions.create({
        model: selectedModel,
        messages: prompt,
        temperature: 0,
        response_format: { type: "json_object" },
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("OpenRouter returned no content");
    }

    const parsed = analysisResultSchema.parse(JSON.parse(content));
    return parsed;
}

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        default_model: defaultOpenRouterModel,
        allowed_models: allowedModels,
        has_api_key: Boolean(openRouterApiKey),
        langfuse_enabled: langfuseEnabled,
    });
});

app.get("/models", (_req, res) => {
    res.json({
        default_model: defaultOpenRouterModel,
        allowed_models: allowedModels,
    });
});

app.post("/analyze", async (req, res) => {
    const input = reviewRequestSchema.safeParse(req.body);
    if (!input.success) {
        return res.status(400).json({
            error: "Invalid request body",
            details: input.error.flatten(),
        });
    }

    await withTrace(
        "analyze-review",
        {
            input: input.data,
            metadata: { endpoint: "/analyze" },
            tags: ["analyze"],
        },
        async (span) => {
            try {
                const result = await analyzeWithOpenRouter(
                    input.data.review_text,
                    input.data.rating,
                    input.data.model,
                );
                span?.update({ output: result });
                res.json(result);
            } catch (error) {
                span?.update({
                    level: "ERROR",
                    statusMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
                if (
                    error instanceof Error &&
                    error.message.startsWith("Model not allowed:")
                ) {
                    return res.status(400).json({
                        error: "Invalid model",
                        message: error.message,
                        allowed_models: allowedModels,
                    });
                }
                res.status(500).json({
                    error: "Analysis failed",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        },
    );
});

app.post("/analyze-batch", async (req, res) => {
    const input = batchRequestSchema.safeParse(req.body);
    if (!input.success) {
        return res.status(400).json({
            error: "Invalid request body",
            details: input.error.flatten(),
        });
    }

    await withTrace(
        "analyze-batch",
        {
            input: input.data,
            metadata: {
                endpoint: "/analyze-batch",
                review_count: input.data.reviews.length,
            },
            tags: ["analyze-batch"],
        },
        async (span) => {
            try {
                const selectedModel = resolveModel(input.data.model);
                const results = [];
                for (const review of input.data.reviews) {
                    const result = await analyzeWithOpenRouter(
                        review.review_text,
                        review.rating,
                        selectedModel,
                    );
                    results.push(result);
                }

                span?.update({ output: results });
                res.json(results);
            } catch (error) {
                span?.update({
                    level: "ERROR",
                    statusMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
                if (
                    error instanceof Error &&
                    error.message.startsWith("Model not allowed:")
                ) {
                    return res.status(400).json({
                        error: "Invalid model",
                        message: error.message,
                        allowed_models: allowedModels,
                    });
                }
                res.status(500).json({
                    error: "Batch analysis failed",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        },
    );
});

app.post("/analyze-bulk", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            error: "Missing CSV file",
            message: "Upload a file field named 'file' with a CSV attachment.",
        });
    }

    await withTrace(
        "analyze-bulk",
        {
            metadata: {
                endpoint: "/analyze-bulk",
                filename: req.file.originalname,
            },
            tags: ["analyze-bulk"],
        },
        async (span) => {
            try {
                const rows = normalizeCsvRows(req.file.buffer);
                const selectedModel = resolveModel(req.body.model);
                const results = [];

                span?.update({
                    input: { total_rows: rows.length, model: selectedModel },
                    metadata: { row_count: rows.length },
                });

                for (const row of rows) {
                    const result = await analyzeWithOpenRouter(
                        row.review_text,
                        row.rating,
                        selectedModel,
                    );
                    results.push(result);
                }

                span?.update({ output: results });
                res.json({
                    total_rows: rows.length,
                    results,
                });
            } catch (error) {
                span?.update({
                    level: "ERROR",
                    statusMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
                if (
                    error instanceof Error &&
                    error.message.startsWith("Model not allowed:")
                ) {
                    return res.status(400).json({
                        error: "Invalid model",
                        message: error.message,
                        allowed_models: allowedModels,
                    });
                }
                res.status(500).json({
                    error: "Bulk analysis failed",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        },
    );
});

app.post("/scrape", async (req, res) => {
    const input = scrapingRequestSchema.safeParse(req.body);
    if (!input.success) {
        return res.status(400).json({
            error: "Invalid request body",
            details: input.error.flatten(),
        });
    }

    const { url, total_reviews, model } = input.data;

    console.log("app_token", ScraperAppToken);
    const reviews = await fetch(`${ScraperAppHost}/scrape`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ScraperAppToken}`,
        },
        body: JSON.stringify({ url, total_reviews }),
    });

    if (!reviews.ok) {
        return res.status(reviews.status).json({
            error: "Failed to scrape reviews",
            message: reviews.statusText,
        });
    }

    const data = await reviews.json();

    await withTrace(
        "scrape",
        {
            input: { url, total_reviews, model },
            metadata: {
                endpoint: "/scrape",
                scraped_count: data.reviews.length,
            },
            tags: ["scrape"],
        },
        async (span) => {
            try {
                const resBucket = await Promise.all(
                    data.reviews.map(async (d) => {
                        const scrapeRvw = await analyzeWithOpenRouter(
                            d.text,
                            d.rating,
                            model,
                        );
                        return scrapeRvw;
                    }),
                );

                span?.update({ output: resBucket });

                res.json({
                    total_rows: data.reviews.length,
                    results: resBucket,
                });
            } catch (error) {
                span?.update({
                    level: "ERROR",
                    statusMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
                if (
                    error instanceof Error &&
                    error.message.startsWith("Model not allowed:")
                ) {
                    return res.status(400).json({
                        error: "Invalid model",
                        message: error.message,
                        allowed_models: allowedModels,
                    });
                }
                res.status(500).json({
                    error: "Scrape analysis failed",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        },
    );
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
    if (!openRouterApiKey) {
        console.warn(
            "OPENROUTER_API_KEY is not set. /analyze will fail until .env is populated and the server is restarted.",
        );
    }
});

async function shutdown(signal) {
    console.log(`Received ${signal}, flushing Langfuse traces...`);
    await flushTracing();
    await shutdownTracing();
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
