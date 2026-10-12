# Implementation Plan: Enhanced Quiz Prompt Clarity, Choice Randomization & Session Completion

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your preferences:
> 1. **Question Prompt Clarity**: AI prompt templates will include explicit conceptual context, problem framing, and analytical depth rather than vague article snippets.
> 2. **Choice Randomization**: Question choice options will be automatically shuffled upon generation/parsing so correct answers are evenly distributed across A, B, C, and D.
> 3. **Session Completion & Loop Prevention**: Once all due review questions in a session are completed and rated, a clean session summary screen will be shown, returning you to the dashboard without endless looping.

- **Confirmed Decision 1**: Add conceptual framing instructions in `buildQuestionPrompt`.
- **Confirmed Decision 2**: Implement a robust Fisher-Yates shuffle on choices in `questionUtils.ts` so correct answer positions are randomized.
- **Confirmed Decision 3**: Track session completion in `QuestionGenerationModal.tsx` and show a completion summary screen instead of looping back to index 0.

## 1. Overview & Core Concept

- **What It Does**: Upgrades the quiz and question generation engine to produce clear, unambiguous questions with randomized choice positions, and provides a proper session completion summary screen to prevent endless looping.
- **Target Audience / Persona**: Knowledge learners seeking rigorous active recall without repetitive looping or ambiguous prompts.
- **Key Value**: High-quality, balanced quizzes and satisfying completion workflows.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Generate questions with clear contextual framing.
  2. Answer questions with randomized correct choice positions (A, B, C, or D).
  3. Upon answering all due questions in a session, view a session summary screen with performance stats (total answered, correct count, average SRS rating) and a button to return to the dashboard.
- **Visual Identity & Theme**:
  - Consistent with the app's dark SaaS/knowledge-base aesthetic (`#0d1117`, `#161b22`, emerald/sky/indigo accents).
  - Clean unboxed metadata, zero-pill discipline, WCAG AA legibility.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Shuffle choices during generation and validation in `questionUtils.ts`.
  - *Why*: Directly solves the bias towards A or A&B.
- **Decision 2**: Session completion state check in `QuestionGenerationModal.tsx`.
  - *Why*: Prevents endless looping over reviewed cards and provides a rewarding closure.

## 4. Technical Architecture & Data Strategy

```
[Question Generation & Parsing (questionUtils.ts)]
  ├── Enhanced prompt with conceptual context & framing
  └── Fisher-Yates choice shuffler (randomized correct answer position)

[Quiz Player & Review Session (QuestionGenerationModal.tsx)]
  ├── Multi-select & single-select question handlers
  └── Session completion tracking -> Completion Summary Screen -> Dashboard return
```
