# Source registry

This source-only distribution contains no downloaded evidence or historical response packets. Fetch and review sources locally before expecting cited answers. Evaluation has not run for this copy.

Publisher URLs, source categories and fetch configuration are in [`data/sources.json`](../data/sources.json); retrieval dates are unset until you fetch. See [distribution and terms](DISTRIBUTION.md) and [geographic methods](GEOSPATIAL.md).

Each retrieval source keeps its stable `source_id` and official `canonical_url`. The registry also separates automated link observations (`last_link_checked_at`, `link_status`) from human content review (`last_content_reviewed_at`, `review_status`, `next_review_at`, `known_issues`, `review_notes`). The source-only checkout starts without a substantive review date for these retrieval records; a successful fetch or HTTP response cannot create one. Run the [resource freshness report](RESOURCE_VERIFICATION.md#automated-freshness-report), then use the [reviewed source-update pipeline](SOURCE_UPDATES.md) before changing evidence or citations.
