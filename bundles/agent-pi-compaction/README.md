# Agent Pi Compaction

Product-owned compaction provider for Agent Pi DSH. It delegates first to the official DSH current-route summarizer and only uses configured fallback targets after that call fails. This keeps the official DeepSeek Harness checkout unmodified.
