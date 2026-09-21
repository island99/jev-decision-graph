# Ticket Router Benchmark

- Dataset: `benchmark/tickets.json` (MD5: `4ed573c9c33ecd7b0e5070d198a8562d`)
- Graph: `ticket_router@1.0.0`
- Result: **10/10 passed**
- Accuracy: **1**

| ID | Result | Expected | Actual | Trace |
| --- | --- | --- | --- | --- |
| refund_escalation | ✅ | route_refund | route_refund | is_relevant → intent → refund_check |
| invoice_query | ✅ | route_billing | route_billing | is_relevant → intent → refund_check |
| login_failure | ✅ | route_technical | route_technical | is_relevant → intent |
| sync_delay | ✅ | route_technical | route_technical | is_relevant → intent |
| pricing_inquiry | ✅ | route_sales | route_sales | is_relevant → intent |
| renewal_inquiry | ✅ | route_sales | route_sales | is_relevant → intent |
| spam_ad | ✅ | close_not_relevant | close_not_relevant | is_relevant |
| low_relevance | ✅ | human_review | human_review | is_relevant |
| ambiguous_intent | ✅ | human_review | human_review | is_relevant → intent |
| refund_low_confidence | ✅ | human_review | human_review | is_relevant → intent → refund_check |

