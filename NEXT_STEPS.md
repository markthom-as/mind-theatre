# Next Steps for Mind Theatre (Python to Next.js Port)

This document outlines the remaining tasks to complete the port of the Mind Theatre application from Python/Flask to Next.js/TypeScript.

## I. API Endpoint Parity (Largely Completed)

The following API endpoints from the Python version have been implemented in Next.js:

*   **`GET /api/agents`**: Implemented as `mind-theatre/pages/api/agents.ts`.
*   **`POST /api/stream_inner_dialogue`**: Implemented as `mind-theatre/pages/api/stream_inner_dialogue.ts` (currently stateless for agents).
*   **`POST /api/start_chat`**: Implemented as `mind-theatre/pages/api/start_chat.ts`.
*   **`GET /api/chat/:chatId/history`**: Implemented as `mind-theatre/pages/api/chat/[chatId]/history.ts`.
*   **`POST /api/chat/:chatId`**: Implemented as `mind-theatre/pages/api/chat/[chatId]/index.ts`. (Handles chat turns, stores messages, basic agent history).
*   **`GET /api/chats`**: Implemented as `mind-theatre/pages/api/chats.ts`.
*   **`POST /api/clear_memory`**: Implemented as `mind-theatre/pages/api/clear_memory.ts` (clears `Chat`, `Message`, and `Memory` tables).
*   **`GET /api/agent_memory/:agentName`**: Implemented as `mind-theatre/pages/api/agent_memory/[agentName].ts` (retrieves selected fields from `Memory` table).

## II. Core Logic and Feature Parity (Outstanding Work)

This section details the critical logic from `mind_theatre.py` and related files that needs to be ported or re-implemented in TypeScript to achieve full feature parity.

### 1. Episodic Memory System (Port from `memory.py` and `mind_theatre.py`)

This is a high-priority area. The Python version had a sophisticated episodic memory system (`MemoryStore` class in `memory.py`) that included creating embeddings, storing them with valence/arousal, and retrieving relevant memories. The `Memory` model in `schema.prisma` is designed for this.

*   **Populating the `Memory` Table**: Currently, no Next.js logic actively populates the `Memory` table.
    *   **Port `add_episodic_memory` logic**: Create a TypeScript function (e.g., in `mind-theatre/lib/memoryUtils.ts`) that:
        *   Takes agent name, text, user prompt, (and eventually valence, arousal, embedding).
        *   Saves this information to the `Memory` table in Prisma.
    *   **Port `should_write_memory` logic**: Create a TypeScript function (e.g., in `memoryUtils.ts`) that determines if an agent's reply is significant enough to be stored as an episodic memory. The Python version checked for length, keywords, etc.
    *   **Integration Point**: This logic should be called after an agent generates a reply, likely within `POST /api/chat/:chatId` and potentially `POST /api/stream_inner_dialogue` if streamed agent replies should also form episodic memories.

*   **Embedding Generation**: 
    *   **Functionality**: The Python `create_embedding(text)` function used an embedding model (e.g., from OpenAI via LiteLLM).
    *   **Implementation**: Create a TypeScript function (e.g., in `lib/llmUtils.ts` or a new `embeddingUtils.ts`) to generate embeddings for given text using the `openai` package or another chosen provider. The `Memory.embedding` field is `Unsupported("vector(1536)")`, so ensure the embedding dimension matches.
    *   **Integration**: Call this function before saving to the `Memory` table if `should_write_memory` is true.

*   **Valence and Arousal Scoring**:
    *   **Functionality**: The Python `score_valence_arousal(text)` function used an LLM to score text on valence and arousal dimensions.
    *   **Implementation**: Create a TypeScript function (e.g., in `lib/llmUtils.ts` or `memoryUtils.ts`) that replicates this. It will involve an LLM call with a specific prompt to get these scores.
    *   **Integration**: Call this function for agent replies that meet `should_write_memory` criteria, before saving to the `Memory` table.

*   **Retrieving Relevant Memories (`retrieve_relevant_memories` from `memory.py`)**:
    *   **Functionality**: Given a query text (e.g., user input) and an agent name, find the most relevant memories using vector similarity search (FAISS in Python version).
    *   **Implementation for PostgreSQL/Prisma**: PostgreSQL with the `pgvector` extension allows for vector similarity searches. This requires:
        1.  Ensuring `pgvector` is enabled and configured for your PostgreSQL database.
        2.  Modifying Prisma queries to perform similarity searches (e.g., using `prisma.$queryRawUnsafe` or waiting for official Prisma `pgvector` support to mature if not already sufficient).
        3.  Creating a TypeScript function (e.g., in `memoryUtils.ts`) that takes query text, generates its embedding, and then queries the `Memory` table for similar embeddings for the specified agent.
    *   **Integration**: This is crucial for providing agents with long-term memory context. It would be used in `POST /api/chat/:chatId` when preparing context for an agent, alongside shorter-term chat history.

### 2. Agent Working Memory / Context Refinement

*   **Current State**: `POST /api/chat/:chatId` fetches some agent-specific message history. `POST /api/stream_inner_dialogue` is stateless.
*   **Enhancement**: 
    *   Improve history fetching for `POST /api/chat/:chatId`: Ensure it correctly assembles a coherent conversational history for each agent (user messages + that agent's replies, possibly interleaved with other agents if relevant to the agent's persona).
    *   Consider if `POST /api/stream_inner_dialogue` should have an option to be stateful or if its purpose is purely for stateless, parallel agent reactions.
    *   Integrate retrieved episodic memories (from `retrieve_relevant_memories` above) into the context passed to agents in `getAgentLLMReply`.

### 3. Synthesiser Logic Refinement

*   **Current State**: `POST /api/chat/:chatId` calls `getSynthesiserLLMReply` with a basic concatenation of user input and agent dialogues.
*   **Enhancement**: Review the Python `run_synthesiser_from_agent_dialogue` and ensure the input formatting for the synthesiser LLM in `getSynthesiserLLMReply` is optimal and matches the intent of the `synthesiser_prompt`.

### 4. Initialization Logic (`initialize_psyche_components` from `mind_theatre.py`)

*   **Functionality**: In Python, this initialized `MEMORY_STORE` and `AGENT_WORKING_MEMORIES`. 
*   **Next.js Equivalent**: 
    *   `MEMORY_STORE` is replaced by Prisma and the database. No explicit initialization step is needed for each request once Prisma client is set up globally (`lib/prisma.ts`).
    *   `AGENT_WORKING_MEMORIES` (short-term, per-request agent history) is currently handled within the scope of the `POST /api/chat/:chatId` request. If more persistent working memory across multiple requests *without* full DB storage is needed, a server-side caching mechanism (e.g., Redis, in-memory cache for a single server instance - careful with serverless environments) might be considered, but Prisma-backed chat history is likely the primary mechanism.
    *   The `AGENTS` constant (agent definitions) is loaded from `prompts.yaml` via `lib/loadPrompts.ts`, which is good.

## III. General Considerations (Ongoing)

*   **Error Handling**: Continue to enhance error handling in all API routes and utility functions.
*   **Prisma Schema Review**: Periodically review `schema.prisma` as new features are added (e.g., ensure `Memory` table and its vector types are optimal for `pgvector`).
*   **Environment Variables**: Maintain and document all required environment variables (e.g., `DATABASE_URL`, `OPENAI_API_KEY`, specific model names if configurable).
*   **Testing**: Implement unit and integration tests for API routes and core logic.
*   **Frontend Integration**: Keep in mind how the frontend will consume these APIs.

## IV. Completed Milestones (Summary)

*   Basic project setup with Next.js and TypeScript.
*   Utility for loading agent/prompt configurations from `prompts.yaml`.
*   Utility for LLM calls (OpenAI).
*   Shared Prisma client instance setup.
*   Implementation of all primary Flask API endpoints with basic Prisma integration for chat session and message storage. 