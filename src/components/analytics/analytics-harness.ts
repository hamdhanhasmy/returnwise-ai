"use client";
import {
  createAiHarness,
  type AgAiAgentRunner,
  type AgAiHarnessSetup,
  type AgStudioApi,
} from "ag-studio";
import { agentAnswerSchema } from "@/lib/analytics/agent";
import type { AnalyticsFilter } from "@/lib/analytics/contracts";
export function analyticsHarness(
  filter: AnalyticsFilter,
  workspace: string,
): AgAiHarnessSetup {
  return ({ api }) =>
    createAiHarness(api as AgStudioApi, () => {
      const agent: AgAiAgentRunner = {
        id: "returnwise-analytics",
        name: "ReturnWise analyst",
        maxTurns: 1,
        description:
          "Read-only aggregate analysis. One bounded DeepSeek function-selection request; exact results computed on the server.",
        async *run(input, ctx) {
          yield {
            type: "RUN_STARTED",
            runId: input.runId,
            threadId: input.threadId,
          };
          yield {
            type: "STEP_STARTED",
            stepName: "Select one safe aggregate tool",
          };
          try {
            const question =
              [...input.messages].reverse().find((m) => m.role === "user")
                ?.content ?? "";
            const r = await fetch("/api/analytics/ask", {
              method: "POST",
              signal: ctx.signal,
              headers: {
                "Content-Type": "application/json",
                "X-ReturnWise-Workspace": workspace,
              },
              body: JSON.stringify({
                question,
                consent: true,
                filter: {
                  source: filter.source,
                  period: filter.period,
                  category: filter.category,
                },
              }),
            });
            const body = await r.json();
            if (!r.ok)
              throw Error(body.error ?? "Analytics assistant unavailable.");
            if (body.status !== "SUCCEEDED")
              throw Error(
                "Analysis is unavailable or its earlier result is uncertain. No automatic retry was made; use Studio's manual exploration.",
              );
            const result = agentAnswerSchema.parse(body.result),
              toolCallId = crypto.randomUUID();
            yield {
              type: "TOOL_CALL_START",
              toolCallId,
              toolCallName: result.tool,
            };
            yield { type: "TOOL_CALL_ARGS", toolCallId, delta: "{}" };
            yield { type: "TOOL_CALL_END", toolCallId };
            yield {
              type: "TOOL_CALL_RESULT",
              toolCallId,
              messageId: crypto.randomUUID(),
              content: JSON.stringify(result.facts),
              role: "tool",
            };
            const messageId = crypto.randomUUID();
            // Bare custom runners emit granular events; Studio's direct LLM runner alone expands chunks.
            yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" };
            yield {
              type: "TEXT_MESSAGE_CONTENT",
              messageId,
              delta: `${result.answer}\n\n${body.cacheHit ? "Cached request; no new model call." : "One bounded DeepSeek tool-selection request."}`,
            };
            yield { type: "TEXT_MESSAGE_END", messageId };
            yield {
              type: "STEP_FINISHED",
              stepName: "Select one safe aggregate tool",
            };
            yield {
              type: "RUN_FINISHED",
              runId: input.runId,
              threadId: input.threadId,
            };
          } catch (e) {
            if (ctx.signal?.aborted) return;
            yield {
              type: "RUN_ERROR",
              code: "ANALYTICS_UNAVAILABLE",
              message: (e as Error).message,
            };
          }
        },
      };
      return {
        agents: [agent],
        primary: agent.id,
        models: [{ id: "deepseek-flash", label: "DeepSeek Flash · read-only" }],
        promptStarters: [
          {
            label: "Common return reasons",
            prompt: "Show the most common return reasons.",
          },
          {
            label: "Compare full remedies",
            prompt: "Compare returnless refunds with physical returns.",
          },
          {
            label: "Verified Sandbox refunds",
            prompt: "How many refunds were completed through PayPal Sandbox?",
          },
          {
            label: "Recovery by category",
            prompt:
              "Which categories have the highest estimated recovery value?",
          },
        ],
      };
    });
}
