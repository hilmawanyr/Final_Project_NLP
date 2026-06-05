# Tokopedia Review-Rating Consistency Detector
## NLP Final Bootcamp Project Summary

---

## Problem Statement
Fake or misleading reviews are a significant problem on Indonesian e-commerce platforms. A common pattern is when a review's **text sentiment contradicts its star rating** — e.g., a 5-star review with negative text like *"barang jelek, pengiriman lama"*, or a 1-star review with positive text. This inconsistency is a strong signal of:
- Fake/paid reviews
- Misclicks on ratings
- Manipulated review scores

This project builds an NLP system to **detect review-rating inconsistencies** on Tokopedia using LLMs via OpenRouter.

---

## Dataset
- **Source:** [Tokopedia Product Reviews 2025 - Kaggle](https://www.kaggle.com/datasets/salmanabdu/tokopedia-product-reviews-2025)
- **Total Reviews:** 65,543 samples
- **Collection Date:** December 2025
- **Language:** Indonesian (Bahasa Indonesia), including slang & emojis
- **File Format:** CSV (`utf-8-sig`)
- **Primary Domain:** E-commerce, Sentiment Analysis, Consumer Behavior

### Categories Covered
6 major market categories:
| Category | Description |
|----------|-------------|
| `Handphone & Tablet` | Mobile Devices |
| `Elektronik` | General Electronics |
| `Pertukangan` | Tools & Hardware |
| `Kesehatan` | Health & Wellness |
| `Makanan & Minuman` | Food & Beverage |
| `Olahraga` | Sports & Outdoors |

### Column Dictionary
| Column | Description | Usage in Project |
|--------|-------------|-----------------|
| `review_text` | Raw review content with emojis & punctuation | Primary LLM input |
| `review_date` | Submission date (YYYY-MM-DD) | Optional: trend over time |
| `review_id` | Unique review identifier | Deduplication |
| `product_name` | Full product listing title | Display in demo UI |
| `product_category` | High-level category | Breakdown analysis |
| `product_variant` | Color/Size/Model variant purchased | Optional context |
| `product_price` | Listing price in IDR | Optional: price tier analysis |
| `product_url` | Direct Tokopedia product URL | Display in demo UI |
| `product_id` | Unique product identifier | Grouping by product |
| `rating` | Customer rating 1-5 | Derive rating sentiment |
| `sold_count` | Total units sold | Optional: popularity weight |
| `shop_id` | Anonymized seller identifier | Grouping by shop |
| `sentiment_label` | Derived sentiment (Positive/Neutral/Negative) | Reference only — do NOT use as LLM label |

---

## Approach

### Pipeline
```
review_text + rating → OpenRouter LLM → Structured JSON Output
                                               ↓
                              { predicted_sentiment,
                                rating_sentiment,
                                is_consistent,
                                explanation }
                                               ↓
                          Flag as CONSISTENT or INCONSISTENT
```

### Sentiment Derivation from Rating
```
rating 1-2  → Negative
rating 3    → Neutral
rating 4-5  → Positive
```

### Inconsistency Logic
```
predicted_sentiment != rating_sentiment → INCONSISTENT (potential fake)
predicted_sentiment == rating_sentiment → CONSISTENT
```

---

## Tech Stack

### Backend (Node.js + Express)
```
node + express                    # API server
@openrouter/ai-sdk-provider       # OpenRouter SDK
ai                                # Vercel AI SDK (generateObject)
zod                               # Schema validation + structured output
p-limit                           # Concurrency control for batch processing
dotenv                            # Environment variables
```

### Frontend / Demo UI
```
react + vite                      # Demo interface
```

### Data Analysis (Python — optional, for EDA)
```
pandas
matplotlib / seaborn
jupyter
```

---

## LLM Configuration

### Recommended Models (via OpenRouter)
| Model | Reason |
|-------|--------|
| `openai/gpt-5.4-mini` | Strong multilingual + structured JSON output |
| `google/gemini-3.1-flash-lite` | Very cheap, fast, good Indonesian slang handling |
| `deepseek/deepseek-v4-flash` | Cost-effective, strong reasoning for inconsistency detection |

> Pick one and stick with it for consistency across batch runs. `gemini-3.1-flash-lite` recommended for cost efficiency given 65k rows.

### Structured Output Schema (Zod)
```ts
z.object({
  predicted_sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  rating_sentiment:    z.enum(["Positive", "Neutral", "Negative"]),
  is_consistent:       z.boolean(),
  explanation:         z.string(),
})
```

---

## Project Structure
```
tokopedia-consistency-detector/
├── data/
│   └── tokopedia_reviews_2025.csv
├── notebooks/
│   └── 01_eda.ipynb                  # Optional EDA in Python
├── src/
│   ├── routes/
│   │   └── analyze.js                # Express routes
│   ├── services/
│   │   ├── llm.js                    # OpenRouter/generateObject logic
│   │   └── consistency.js            # Inconsistency flag logic
│   └── index.js                      # Express entry point
├── client/                           # React demo UI
│   └── src/
│       └── App.jsx
├── .env
├── package.json
└── summary.md
```

---

## API Endpoints

### Single Review Analysis
```
POST /analyze
Body: { "review_text": "...", "rating": 5 }
Response: {
  "predicted_sentiment": "Negative",
  "rating_sentiment": "Positive",
  "is_consistent": false,
  "explanation": "..."
}
```

### Batch Analysis
```
POST /analyze-batch
Body: { "reviews": [{ "review_text": "...", "rating": 5 }, ...] }
Response: [ ...array of analysis results ]
```

---

## 1-Week Timeline
| Day | Task |
|-----|------|
| 1 | Dataset download + EDA (column exploration, class distribution) |
| 2 | Backend setup: Express + OpenRouter SDK + `/analyze` endpoint |
| 3 | Batch endpoint with `p-limit` concurrency + run on dataset sample |
| 4 | Consistency logic + per-category breakdown analysis |
| 5 | React demo UI (paste review + rating → get result) |
| 6 | Analysis: which `product_category` has most inconsistencies? |
| 7 | Slide preparation + final polish |

---

## Evaluation
Since there's no traditional train/test split with LLMs:
- **Spot-check accuracy:** Manually verify 50-100 LLM outputs vs expected
- **Consistency rate:** % of reviews flagged inconsistent per `product_category`
- **Category breakdown:** Which categories have the most suspicious reviews?
- **Demo:** Live prediction in React UI

---

## Demo UI
**Inputs:**
- Review text (textarea)
- Star rating (1-5 selector)

**Outputs:**
- Predicted sentiment from review text
- Rating-derived sentiment
- Consistency status: ✅ Consistent / ⚠️ Inconsistent
- LLM explanation of why it's inconsistent

---

## Presentation Narrative
1. **Problem:** Fake reviews hurt buyers and legitimate sellers on Tokopedia
2. **Solution:** LLM that cross-checks review text sentiment vs star rating
3. **Findings:** Show which product categories have the highest inconsistency rates
4. **Impact:** Can be integrated by Tokopedia to auto-flag suspicious reviews
5. **Demo:** Live inconsistency checker

---

## Notes for Agent
- Use `@openrouter/ai-sdk-provider` + `generateObject` from Vercel AI SDK — avoids manual JSON parsing
- Use `p-limit(5)` for batch processing to avoid OpenRouter rate limits
- `sentiment_label` column is derived from `rating` — cross-check but do NOT rely on it blindly
- Read CSV with `utf-8-sig` encoding to handle BOM character at file start
- Prompt must explicitly instruct the LLM to handle mixed Indonesian/English/emoji/slang
- Dataset is 65,543 rows — **do NOT run full dataset through API in one go**, start with a stratified sample of ~500-1000 rows
- Store batch results to a local JSON/CSV file to avoid re-running API calls
- Verify OpenRouter model string names before running — check exact slugs at openrouter.ai/models