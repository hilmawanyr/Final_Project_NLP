// OpenTelemetry + Langfuse bootstrap.
// This module MUST be imported before any code that makes LLM calls so the
// tracer provider is active before the OpenAI client is instrumented.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import dotenv from "dotenv";

dotenv.config();

export const langfuseEnabled = Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
        process.env.LANGFUSE_SECRET_KEY?.trim(),
);

let spanProcessor = null;
let sdk = null;

if (langfuseEnabled) {
    // LangfuseSpanProcessor reads LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY /
    // LANGFUSE_BASE_URL from the environment loaded above.
    spanProcessor = new LangfuseSpanProcessor();
    sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
    sdk.start();
} else {
    console.warn(
        "Langfuse tracing disabled. Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL in .env to enable it.",
    );
}

// Flush buffered spans (use in short-lived contexts or before sending a response).
export async function flushTracing() {
    await spanProcessor?.forceFlush();
}

// Flush and tear down the tracer provider on shutdown.
export async function shutdownTracing() {
    await sdk?.shutdown();
}
