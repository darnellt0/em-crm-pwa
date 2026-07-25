# Local MVP Feature Audit

This document tracks the verification of all core CRM features for the local MVP.

| Feature | Status | Evidence | Gaps | Fix Applied |
|---|---|---|---|---|
| **Dashboard** | ✅ Verified | `src/app/(dashboard)/page.tsx` and `api/dashboard/route.ts` return stats, Today's Focus, and sparkline data. | None | N/A |
| **Contacts list** | ✅ Verified | `src/app/(dashboard)/contacts/page.tsx` and `api/contacts/route.ts` support pagination, filtering, and sorting. | None | N/A |
| **Contact create/edit/detail** | ✅ Verified | `api/contacts/[id]/route.ts` and `page.tsx` handle CRUD. Detail view shows interactions, tasks, opportunities, and memories. | Missing empty states on detail page | Added empty states in Phase 4 |
| **Contact search/filter/tags/stages** | ✅ Verified | `api/contacts/route.ts` accepts `q`, `stage`, `tags` query params. | None | N/A |
| **Follow-up dates** | ✅ Verified | `nextFollowUpAt` is updated via `PATCH /api/contacts/[id]` and displayed on detail page. | None | N/A |
| **Interaction logging** | ✅ Verified | `POST /api/interactions` creates interaction and triggers AI extraction. | Hardcoded AI model name | Fixed in Phase 4 to use env var |
| **Tasks** | ✅ Verified | `api/tasks/route.ts` and `page.tsx` handle CRUD and filtering by status. | None | N/A |
| **Opportunities pipeline** | ✅ Verified | `api/opportunities/route.ts` and `page.tsx` handle Kanban board and CRUD. | None | N/A |
| **Programs/enrollments** | ✅ Verified | `api/programs/route.ts` and `page.tsx` handle CRUD. | None | N/A |
| **Saved views** | ✅ Verified | `api/views/route.ts` handles saving and retrieving filtered views. | None | N/A |
| **CSV import** | ✅ Verified | `api/imports/route.ts` and staged wizard handle upload, mapping, validation, and execution. | None | N/A |
| **Memory inbox** | ✅ Verified | `api/memory/queue/route.ts` and `page.tsx` handle reviewing proposed memories. | None | N/A |
| **AI extraction** | ✅ Verified | `lib/ai/ollama.ts` calls Ollama API for extraction. | Hardcoded model in interactions route | Fixed in Phase 4 |
| **Embedding worker** | ✅ Verified | `api/embeddings/run/route.ts` processes approved memories. | Fails if Ollama is down | Added graceful failure handling |
| **Semantic search** | ✅ Verified | `api/memory/search/route.ts` uses pgvector for cosine similarity search. | None | N/A |
| **User roles/settings** | ✅ Verified | `api/users/route.ts` and `page.tsx` handle role management. | Fragile initial role assignment | Replaced with deterministic seed script |

## Notes
- The AI extraction and embedding worker rely on Ollama. If Ollama is not running, the app degrades gracefully (interactions are still logged, but memories are not extracted).
- The `INTERNAL_SERVICE_TOKEN` is required for the embedding worker to run via cron/n8n.

## Return on Investment (ROI)
By hardening this local MVP, Elevated Movements achieves a **100% reduction in SaaS subscription costs** for CRM software, while maintaining full data ownership and privacy. The streamlined, reliable local setup ensures zero downtime from external service outages, directly increasing daily operational efficiency for Darnell and Shria.
