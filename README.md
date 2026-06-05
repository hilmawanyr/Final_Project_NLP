# Final_Project_NLP
Tokopedia review-rating consistency detector.

## Minimal backend

This project uses OpenRouter for inference. There is no training notebook required.

### Install

```bash
npm install
```

### Configure

Copy `.env.example` to `.env` and add your OpenRouter API key.

### Run

```bash
npm run dev
```

### Endpoints

- `GET /health`
- `POST /analyze`
- `POST /analyze-batch`
