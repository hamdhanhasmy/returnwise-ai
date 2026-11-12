"use client";
import { useMemo, useRef, useState } from "react";
import { AgStudio } from "ag-studio-react";
import {
  singleColumnLayout,
  studioTheme,
  type AgReportState,
  type AgCoreDefaultRegistry,
  AgStudioAiModule,
  AgStudioLicenseManager,
  type AgPageLayoutState,
  type AgResponsiveLayoutBreakpoint,
} from "ag-studio";
import { Button } from "@/components/ui/button";
import type { AnalyticsSnapshot } from "@/server/services/analytics";
import { studioData, reportState, type ReportView } from "./studio-report";
import { analyticsHarness } from "./analytics-harness";

const theme = studioTheme.withParams({
  accentColor: "#315b45",
  backgroundColor: "#ffffff",
  foregroundColor: "#202d27",
  borderColor: "#e5e8e0",
  fontFamily: "Segoe UI, sans-serif",
  studioMinWidth: 0,
  chartPaletteFills1Color: "#315b45",
  chartPaletteFills2Color: "#b8c99d",
  chartPaletteFills3Color: "#c68c5a",
  chartPaletteFills4Color: "#6c8b91",
});
const modules = [AgStudioAiModule];
const layout: Partial<AgPageLayoutState> = {
  minWidth: 250,
  columns: 24,
  rowHeight: 16,
  widgetPadding: 20,
  widgetBorderEnabled: true,
  widgetBorderRadius: 12,
  widgetBorderColor: "#e5e8e0",
  backgroundColor: "#f7f8f4",
  pagePadding: 16,
};
const breakpoints: AgResponsiveLayoutBreakpoint[] = [
  { maxWidth: 720, layout: singleColumnLayout },
];
// Studio licences are browser entitlements. Register once before any React instance is created.
const studioLicense = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
if (studioLicense) AgStudioLicenseManager.setLicenseKey(studioLicense);
export default function StudioCanvas({
  snapshot,
  view,
  workspace,
  assistant,
  compact,
}: {
  snapshot: AnalyticsSnapshot;
  view: ReportView;
  workspace: string;
  assistant: boolean;
  compact: boolean;
}) {
  const ref = useRef<AgStudio<AgCoreDefaultRegistry>>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  const [initialState] = useState<AgReportState>(() => {
    try {
      const value = sessionStorage.getItem(
        `returnwise-studio-v1:${workspace}:${view}`,
      );
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed.version === "3.1.0" && Array.isArray(parsed.pages))
          return parsed;
      }
    } catch {
      /* Private browser storage may be disabled. */
    }
    return reportState(view);
  });
  const data = useMemo(() => studioData(snapshot), [snapshot]);
  const ai = useMemo(
    () =>
      assistant ? analyticsHarness(snapshot.filter, workspace) : undefined,
    [assistant, snapshot.filter, workspace],
  );
  function save() {
    try {
      sessionStorage.setItem(
        `returnwise-studio-v1:${workspace}:${view}`,
        JSON.stringify(ref.current!.api.getState()),
      );
      setMessage("Layout saved for this merchant in this browser session.");
    } catch {
      setMessage(
        "Browser storage unavailable. Your current layout remains usable.",
      );
    }
  }
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[#f8faf6] p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            AG Studio · Interactive workspace
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select chart values to explore. Edit widgets and layout; business
            records remain read-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assistant && (
            <Button
              variant="outline"
              size="sm"
              disabled={!ready}
              onClick={() => {
                setMode("edit");
                requestAnimationFrame(() => {
                  const state = ref.current?.api.getState();
                  if (!state) return;
                  ref.current!.api.setState({
                    ...state,
                    panels: {
                      ...state.panels,
                      edit: { collapsed: true },
                      data: { collapsed: true },
                      filters: { collapsed: true },
                      ai: {
                        collapsed: false,
                        width: Math.min(
                          360,
                          Math.max(240, window.innerWidth - 100),
                        ),
                      },
                    },
                  });
                });
              }}
            >
              Open AI assistant
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={compact}
            onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
          >
            {compact
              ? "Customize on desktop"
              : mode === "view"
                ? "Customize view"
                : "Finish customizing"}
          </Button>
          <Button variant="outline" size="sm" disabled={!ready} onClick={save}>
            Save layout
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              try {
                sessionStorage.removeItem(
                  `returnwise-studio-v1:${workspace}:${view}`,
                );
                ref.current?.api.setState(reportState(view));
                setMessage("Default report restored.");
              } catch {
                setMessage(
                  "Browser storage unavailable. Refresh to restore the default report.",
                );
              }
            }}
          >
            Reset layout
          </Button>
        </div>
      </div>
      {message && (
        <p className="px-4 pt-3 text-xs" role="status">
          {message}
        </p>
      )}
      <div
        data-testid="ag-studio-canvas"
        className={`h-[1020px] min-w-0 w-full ${assistant ? "lg:h-[850px]" : view === "economics" ? "lg:h-[740px]" : view === "cases" ? "lg:h-[800px]" : "lg:h-[1020px]"}`}
        aria-label="AG Studio return intelligence report"
      >
        <AgStudio
          ref={ref}
          style={{ height: "100%", width: "100%" }}
          data={data}
          initialState={initialState}
          mode={mode}
          theme={theme}
          modules={modules}
          ai={ai}
          layout={layout}
          responsiveLayoutBreakpoints={breakpoints}
          enableFilterEditingInViewMode
          onStudioReady={() => setReady(true)}
          onErrorRaised={() =>
            setMessage(
              "A Studio widget could not render. Try Reset layout or refresh the report.",
            )
          }
        />
      </div>
    </div>
  );
}
