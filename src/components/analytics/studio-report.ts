import type {
  AgDataSourcesDefinition,
  AgFieldDefinition,
  AgReportState,
} from "ag-studio";
import type { AnalyticsSnapshot } from "@/server/services/analytics";

export type ReportView = "overview" | "economics" | "cases";
const field = (
  id: string,
  name: string,
  format: AgFieldDefinition["format"] = "textFormat",
): AgFieldDefinition => ({ id, name, format });
export function studioData(s: AnalyticsSnapshot): AgDataSourcesDefinition {
  const fields: AgFieldDefinition[] = [
    field("reference", "Case"),
    field("product", "Product"),
    field("category", "Category"),
    field("source", "Record source"),
    field("status", "Case status"),
    field("reason", "Return reason"),
    field("resolution", "Approved remedy"),
    field("recommendation", "Recommendation"),
    field("day", "Submitted UTC day", "dateFormat"),
    field("dateProvenance", "Date provenance"),
    field("aiStatus", "AI status"),
    field("evaluationVersion", "Calculation version"),
    field("physicalMinor", "Physical return · USD cents", "integerFormat"),
    field("returnlessMinor", "Returnless · USD cents", "integerFormat"),
    field("avoidanceMinor", "Modeled avoidance · USD cents", "integerFormat"),
    field("shippingMinor", "Estimated shipping · USD cents", "integerFormat"),
    field("handlingMinor", "Estimated handling · USD cents", "integerFormat"),
    field("recoveryMinor", "Estimated recovery · USD cents", "integerFormat"),
  ];
  return {
    sources: [
      {
        id: "cases",
        name: "Return cases · classified source",
        data: s.rows,
        fields,
      },
      {
        id: "trends",
        name: "Trusted dates only · synthetic labeled",
        data: s.trends,
        fields,
      },
      {
        id: "economics",
        name: "Comparable full remedies · estimates",
        data: s.rows.filter((r) => r.comparable === 1),
        fields,
      },
      {
        id: "refunds",
        name: "Persisted refund operations",
        data: s.refunds,
        fields: [
          field("status", "Refund operation status"),
          field("count", "Operations", "integerFormat"),
        ],
      },
      {
        id: "activity",
        name: "Evidence analysis · persisted activity",
        data: s.ai,
        fields: [
          field("status", "Analysis status"),
          field("count", "Analyses", "integerFormat"),
        ],
      },
    ],
  };
}
type Widget = NonNullable<
  NonNullable<AgReportState["pages"][number]["widgets"]>[string]
>;
const title = (text: string) => ({
  title: {
    enabled: true,
    text,
    typography: { fontSize: 16, fontWeight: "bold" as const },
    color: "#284b38",
  },
});
const bars = (
  table: string,
  category: string,
  values: string[],
  text: string,
  count = false,
): Widget => ({
  type: "bar-chart-grouped",
  dataMapping: {
    categoryKey: [{ id: `${table}.${category}` }],
    valueKey: values.map((id) => ({
      id: `${table}.${id}`,
      aggregation: count ? "count" : "sum",
    })),
  },
  format: title(text),
});
const grid = (table: string, columns: string[], text: string): Widget => ({
  type: "grid",
  dataMapping: { cols: columns.map((id) => ({ id: `${table}.${id}` })) },
  format: title(text),
});
export function reportState(view: ReportView): AgReportState {
  const widgets: Record<string, Widget> =
    view === "overview"
      ? {
          reasons: bars(
            "cases",
            "reason",
            ["reference"],
            "What brings products back?",
            true,
          ),
          resolutions: bars(
            "cases",
            "resolution",
            ["reference"],
            "Merchant-approved resolutions",
            true,
          ),
          timeline: {
            type: "line-chart",
            dataMapping: {
              categoryKey: [{ id: "trends.day" }],
              valueKey: [{ id: "trends.reference", aggregation: "count" }],
            },
            format: title("Return requests over time · trusted UTC only"),
          },
          refunds: bars(
            "refunds",
            "status",
            ["count"],
            "PayPal refund operation states",
          ),
          category: bars(
            "cases",
            "category",
            ["reference"],
            "Return cases by category",
            true,
          ),
          ai: bars(
            "activity",
            "status",
            ["count"],
            "Evidence analysis activity",
          ),
        }
      : view === "economics"
        ? {
            comparison: bars(
              "economics",
              "reference",
              ["physicalMinor", "returnlessMinor"],
              "Equivalent full remedies · modeled USD cents",
            ),
            advantage: bars(
              "economics",
              "category",
              ["avoidanceMinor"],
              "Modeled cost avoidance by category · USD cents",
            ),
            assumptions: bars(
              "economics",
              "reference",
              ["shippingMinor", "handlingMinor", "recoveryMinor"],
              "Configured estimates · USD cents",
            ),
            detail: grid(
              "economics",
              [
                "reference",
                "source",
                "recommendation",
                "physicalMinor",
                "returnlessMinor",
                "avoidanceMinor",
                "evaluationVersion",
              ],
              "Reproducible comparison inputs",
            ),
          }
        : {
            detail: grid(
              "cases",
              [
                "reference",
                "product",
                "source",
                "status",
                "reason",
                "resolution",
                "aiStatus",
                "day",
                "dateProvenance",
              ],
              "Explore the current case snapshot",
            ),
          };
  const ids = Object.keys(widgets);
  return {
    version: "3.1.0",
    selectedPageId: "return-intelligence",
    pages: [
      {
        id: "return-intelligence",
        widgets,
        widgetLayout: Object.fromEntries(
          ids.map((id, i) => [
            id,
            {
              xTrack: view === "cases" ? 0 : (i % 2) * 12,
              yTrack: view === "cases" ? 0 : Math.floor(i / 2) * 19,
              xSpan: view === "cases" ? 24 : 12,
              ySpan: view === "cases" ? 42 : 19,
            },
          ]),
        ),
      },
    ],
    panels: { filters: { collapsed: true }, edit: { collapsed: true } },
  };
}
