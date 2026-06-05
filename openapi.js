const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Tokopedia Review Consistency Detector API",
    version: "1.0.0",
    description: "API for analyzing Tokopedia review text against star ratings using OpenRouter."
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server"
    }
  ],
  tags: [
    {
      name: "System",
      description: "Health and model discovery"
    },
    {
      name: "Analysis",
      description: "Single, batch, and CSV-based analysis"
    }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Check service status",
        responses: {
          200: {
            description: "Service is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    default_model: { type: "string" },
                    allowed_models: {
                      type: "array",
                      items: { type: "string" }
                    },
                    has_api_key: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/models": {
      get: {
        tags: ["System"],
        summary: "List allowed OpenRouter models",
        responses: {
          200: {
            description: "Allowed models",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    default_model: { type: "string" },
                    allowed_models: {
                      type: "array",
                      items: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/analyze": {
      post: {
        tags: ["Analysis"],
        summary: "Analyze one review",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["review_text", "rating"],
                properties: {
                  review_text: {
                    type: "string",
                    example: "barang bagus, pengiriman cepat"
                  },
                  rating: {
                    type: "integer",
                    minimum: 1,
                    maximum: 5,
                    example: 5
                  },
                  model: {
                    type: "string",
                    example: "google/gemini-3.1-flash-lite",
                    description: "Optional. Must be one of the allowed models."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Analysis result"
          }
        }
      }
    },
    "/analyze-batch": {
      post: {
        tags: ["Analysis"],
        summary: "Analyze multiple reviews in one request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reviews"],
                properties: {
                  model: {
                    type: "string",
                    example: "google/gemini-3.1-flash-lite",
                    description: "Optional. Must be one of the allowed models."
                  },
                  reviews: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["review_text", "rating"],
                      properties: {
                        review_text: { type: "string" },
                        rating: {
                          type: "integer",
                          minimum: 1,
                          maximum: 5
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Array of analysis results"
          }
        }
      }
    },
    "/analyze-bulk": {
      post: {
        tags: ["Analysis"],
        summary: "Upload a CSV file and analyze every row",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  model: {
                    type: "string",
                    description: "Optional. Must be one of the allowed models."
                  },
                  file: {
                    type: "string",
                    format: "binary",
                    description: "CSV file with review_text and rating columns"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Bulk analysis result"
          }
        }
      }
    }
  }
};

export default openapiSpec;
