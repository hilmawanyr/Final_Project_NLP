# Final_Project_NLP
Tokopedia review-rating consistency detector.

### Install

```bash
npm install
cp .env.example .env   # then fill in your keys
```

### Observability (Langfuse)

LLM calls are traced with [Langfuse](https://langfuse.com). Set `LANGFUSE_PUBLIC_KEY`
and `LANGFUSE_SECRET_KEY` (from https://cloud.langfuse.com) in `.env` to enable it;
optionally set `LANGFUSE_BASE_URL` for the US region or a self-hosted instance. Tracing
is automatically disabled when the keys are absent — the app runs normally either way.
Each request becomes a trace, and every OpenRouter call is recorded as a generation
with its prompt, response, model, and token usage. Confirm the status via `GET /health`
(`langfuse_enabled`).

### Run

```bash
npm run dev
```

### Endpoints

- `GET /api-docs`
- `GET /models`
- `GET /health`
- `POST /analyze`
- `POST /analyze-batch`
- `POST /analyze-bulk`
