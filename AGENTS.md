# AI Agent Memory & Guidelines

## GEMINI API & SCRIPT GENERATION RULES

1. **Lightweight Model Support (Cost Savings):** 
   The user frequently uses lightweight models like `gemini-flash-lite-latest` to save on API costs. When making changes to API calling scripts (like `google-apps-script.js`), you MUST ensure that the code supports these lightweight models.
   
2. **Fallback Mechanism (Crucial for Flash-Lite):** 
   Lightweight models often fail at "Structured Output" (JSON Schema) generation. To prevent script failure, you MUST maintain the robust fallback chain currently implemented:
   - First try: `Structured Output (JSON)`
   - If failed/fallback triggered: `Free-text Generation`
   - If AI completely fails: `Heuristic/Local Text Extraction (Zero API call)`
   DO NOT remove these fallbacks, as doing so will break the pipeline when using `gemini-flash-lite-latest`.

3. **Rate Limits & API Saving Features:**
   Always preserve features that reduce API consumption, such as:
   - `SHORT_ARTICLE_THRESHOLD`: Skipping Gemini completely for very short texts.
   - `maxInputChars` restrictions: Truncating texts before sending to Gemini to save input tokens.
