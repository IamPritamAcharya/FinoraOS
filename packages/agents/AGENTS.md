# Agents package

Agents only orchestrate controlled `FinanceTools` and typed AI outputs. They must never import Prisma, calculate database totals through prompts, or mutate records directly. Deterministic calculations belong in the API/domain layer; AI is optional explanation and ambiguity handling.
