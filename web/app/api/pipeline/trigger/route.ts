import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

type TriggerMode = "direct" | "github_actions";

type AttemptClaim = {
  allowed: boolean;
  reason: "daily_limit" | "user_limit" | "already_scheduled" | null;
  daily_count: number;
  daily_limit: number;
  manual_count?: number;
  manual_limit?: number;
};

async function claimManualAttempt(userId: string, runDate: string) {
  const { data, error } = await supabaseAdmin.rpc("claim_pipeline_run_attempt", {
    p_user_id: userId,
    p_run_date: runDate,
    p_source: "manual",
  });

  if (error || !data) {
    console.error("Pipeline attempt budget unavailable:", error);
    return { error: "Usage limits are temporarily unavailable. Please try again shortly." } as const;
  }

  const claim = data as AttemptClaim;
  if (!claim.allowed) {
    if (claim.reason === "user_limit") {
      return { error: "You have used today's manual digest run. Your scheduled digest will run at your next delivery time.", dailyLimitReached: true } as const;
    }
    if (claim.reason === "daily_limit") {
      return { error: "Today's shared digest capacity is full. Please try again tomorrow.", dailyLimitReached: true } as const;
    }
    return { error: "A digest attempt is already queued for today." } as const;
  }

  return { claim } as const;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTriggerMode(): TriggerMode {
  const configured = process.env.PIPELINE_TRIGGER_MODE?.toLowerCase();
  if (configured === "direct" || configured === "github_actions") {
    return configured;
  }

  return process.env.NODE_ENV === "production"
    ? "github_actions"
    : "direct";
}

function getTriggerConfigurationError(triggerMode: TriggerMode): string | null {
  if (triggerMode === "github_actions") {
    if (
      !process.env.PIPELINE_GITHUB_TOKEN ||
      !process.env.PIPELINE_GITHUB_REPOSITORY
    ) {
      return "Pipeline dispatch is not configured. Set PIPELINE_GITHUB_TOKEN and PIPELINE_GITHUB_REPOSITORY.";
    }
    return null;
  }

  if (process.env.PIPELINE_SERVICE_URL) return null;

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "The local pipeline is not configured. Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).";
  }
  if (!process.env.OPENAI_API_KEY) {
    return "The local pipeline is not configured. Add OPENAI_API_KEY to web/.env.local and restart the dev server.";
  }

  return null;
}

async function dispatchGitHubWorkflow(userId: string, runDate: string) {
  const token = process.env.PIPELINE_GITHUB_TOKEN;
  const repository = process.env.PIPELINE_GITHUB_REPOSITORY;
  const workflowId =
    process.env.PIPELINE_GITHUB_WORKFLOW_ID ?? "daily_pipeline.yml";
  const ref = process.env.PIPELINE_GITHUB_REF ?? "main";

  if (!token || !repository) {
    throw new Error(
      "Missing GitHub workflow trigger configuration. Set PIPELINE_GITHUB_TOKEN and PIPELINE_GITHUB_REPOSITORY."
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          user_id: userId,
          run_date: runDate,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub workflow dispatch failed (${response.status}): ${body || "no response body"}`
    );
  }
}

async function spawnLocalPipeline(userId: string, runDate: string) {
  const { spawn } = await import("node:child_process");
  const { resolve } = await import("node:path");

  const pipelineDir = resolve(process.cwd(), "../pipeline");
  const pythonBin = process.env.PIPELINE_PYTHON_BIN ?? "python3";
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase env for direct pipeline mode. Expected SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Missing OPENAI_API_KEY for direct pipeline mode. Add it to web/.env.local."
    );
  }

  const child = spawn(pythonBin, ["pipeline.py"], {
    cwd: pipelineDir,
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      PIPELINE_USER_ID: userId,
      PIPELINE_RUN_DATE: runDate,
      PIPELINE_SKIP_TIME_FILTER: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => {
    console.log(`[pipeline stdout] ${chunk.toString().trimEnd()}`);
  });
  child.stderr?.on("data", (chunk) => {
    console.error(`[pipeline stderr] ${chunk.toString().trimEnd()}`);
  });
  child.on("error", (error) => {
    console.error("Failed to spawn local pipeline:", error);
  });

  child.unref();
}

async function dispatchPipelineService(userId: string, runDate: string) {
  const serviceUrl = process.env.PIPELINE_SERVICE_URL;
  if (!serviceUrl) {
    throw new Error("PIPELINE_SERVICE_URL not configured");
  }

  const response = await fetch(`${serviceUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, run_date: runDate }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pipeline service error (${response.status}): ${text}`);
  }
}

async function markRunFailed(runId: string, message: string, userId: string, runDate: string) {
  await supabaseAdmin
    .from("pipeline_runs")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  await supabaseAdmin
    .from("pipeline_run_attempts")
    .update({ status: "failed", error_class: "dispatch_error", completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("run_date", runDate)
    .eq("source", "manual");
}

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = todayISO();

    // Resolve user + config in one query
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, user_configs(id, updated_at)")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const configs = user.user_configs as { id: string; updated_at: string | null }[];
    if (!configs || configs.length === 0) {
      return NextResponse.json(
        { error: "Please complete onboarding before triggering a digest" },
        { status: 400 }
      );
    }

    const configUpdatedAt = configs[0]?.updated_at ?? null;

    const triggerMode = getTriggerMode();
    const configurationError = getTriggerConfigurationError(triggerMode);
    if (configurationError) {
      return NextResponse.json({ error: configurationError }, { status: 503 });
    }

    // Fetch today's run row — includes trigger_count for the daily cap check.
    const { data: existingRun, error: existingRunError } = await supabaseAdmin
      .from("pipeline_runs")
      .select("id, status, completed_at, trigger_count")
      .eq("user_id", user.id)
      .eq("run_date", today)
      .maybeSingle();

    if (existingRunError) {
      console.error("Fetch existing pipeline_run error:", existingRunError);
      return NextResponse.json({ error: "Failed to check existing run" }, { status: 500 });
    }

    if (existingRun) {
      // ── Already in-flight ────────────────────────────────────────────────────
      if (existingRun.status === "pending" || existingRun.status === "running") {
        return NextResponse.json(
          { error: "Digest is already running", status: existingRun.status },
          { status: 400 }
        );
      }

      const triggerCount = existingRun.trigger_count ?? 1;
      const ranSuccessfully =
        existingRun.status === "complete" || existingRun.status === "empty";

      // ── Config-unchanged cache — skip rerun if config hasn't changed ─────────
      // If the last run was successful and the user's config was last modified
      // before that run completed, the output would be identical — return the
      // cached result immediately without dispatching or incrementing trigger_count.
      // Failed runs always proceed: the user shouldn't be stuck waiting for a
      // run that errored out before producing anything.
      if (
        ranSuccessfully &&
        existingRun.completed_at &&
        configUpdatedAt &&
        new Date(configUpdatedAt) <= new Date(existingRun.completed_at)
      ) {
        return NextResponse.json({
          success: true,
          runId: existingRun.id,
          runsRemainingToday: 0,
          cached: true,
          message:
            "Your digest is already up to date. Update your topics or preferences to generate a new one.",
        });
      }

      // ── 5-minute cooldown — only after a successful run ───────────────────────
      // Failed runs allow an immediate retry so the user isn't penalised for
      // pipeline errors (e.g. a transient OpenAI outage or a startup crash).
      if (ranSuccessfully && existingRun.completed_at) {
        const secondsSinceCompletion =
          (Date.now() - new Date(existingRun.completed_at).getTime()) / 1000;
        const COOLDOWN_SECONDS = 5 * 60;
        if (secondsSinceCompletion < COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(COOLDOWN_SECONDS - secondsSinceCompletion);
          const waitMins = Math.ceil(waitSeconds / 60);
          return NextResponse.json(
            {
              error: `Please wait ${waitMins} minute${waitMins !== 1 ? "s" : ""} before running again.`,
              retryAfterSeconds: waitSeconds,
            },
            { status: 429 }
          );
        }
      }

      const attempt = await claimManualAttempt(user.id, today);
      if ("error" in attempt) {
        return NextResponse.json(
          { error: attempt.error, dailyLimitReached: "dailyLimitReached" in attempt ? attempt.dailyLimitReached : false },
          { status: "dailyLimitReached" in attempt && attempt.dailyLimitReached ? 429 : 503 },
        );
      }

      // ── Atomic reset — only wins if status is still terminal ─────────────────
      // Prevents a race where two concurrent requests both see status=complete
      // and both dispatch a workflow.
      const { data: rerun, error: updateError } = await supabaseAdmin
        .from("pipeline_runs")
        .update({
          status: "pending",
          papers_fetched: 0,
          papers_passed: 0,
          top_score: null,
          notion_page_url: null,
          error_message: null,
          started_at: null,
          completed_at: null,
          trigger_count: triggerCount + 1,
        })
        .eq("id", existingRun.id)
        .not("status", "in", '("pending","running")')
        .select("id, trigger_count")
        .single();

      if (updateError) {
        console.error("Reset pipeline_run error:", updateError);
        return NextResponse.json({ error: "Failed to queue rerun" }, { status: 500 });
      }
      // Atomic update matched nothing — another concurrent request won the race.
      if (!rerun) {
        return NextResponse.json(
          { error: "Digest is already running", status: "pending" },
          { status: 400 }
        );
      }

      try {
        if (triggerMode === "github_actions") {
          await dispatchGitHubWorkflow(user.id, today);
        } else if (process.env.PIPELINE_SERVICE_URL) {
          await dispatchPipelineService(user.id, today);
        } else {
          await spawnLocalPipeline(user.id, today);
        }
      } catch (dispatchError) {
        const message =
          dispatchError instanceof Error
            ? dispatchError.message
            : "Failed to trigger pipeline";
        await markRunFailed(rerun.id, message, user.id, today);
        throw dispatchError;
      }

      const runsLeft = Math.max(0, (attempt.claim.manual_limit ?? 1) - (attempt.claim.manual_count ?? 1));
      console.log(
        `Pipeline retriggered for user ${user.id} (run ${rerun.id}) via ${triggerMode} — ${runsLeft} manual trigger(s) remaining today`
      );

      return NextResponse.json({
        success: true,
        runId: rerun.id,
        runsRemainingToday: runsLeft,
        message:
          triggerMode === "github_actions"
            ? "Your digest was queued in GitHub Actions. Check back in a few minutes."
            : "Your digest is being generated locally. Check back in a few minutes.",
      });
    }

    // ── First trigger today — insert the run row ──────────────────────────────
    const attempt = await claimManualAttempt(user.id, today);
    if ("error" in attempt) {
      return NextResponse.json(
        { error: attempt.error, dailyLimitReached: "dailyLimitReached" in attempt ? attempt.dailyLimitReached : false },
        { status: "dailyLimitReached" in attempt && attempt.dailyLimitReached ? 429 : 503 },
      );
    }

    const { data: run, error: insertError } = await supabaseAdmin
      .from("pipeline_runs")
      .insert({ user_id: user.id, run_date: today, status: "pending", trigger_count: 1 })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert pipeline_run error:", insertError);
      return NextResponse.json({ error: "Failed to queue run" }, { status: 500 });
    }

    try {
      if (triggerMode === "github_actions") {
        await dispatchGitHubWorkflow(user.id, today);
      } else if (process.env.PIPELINE_SERVICE_URL) {
        await dispatchPipelineService(user.id, today);
      } else {
        await spawnLocalPipeline(user.id, today);
      }
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error
          ? dispatchError.message
          : "Failed to trigger pipeline";
      await markRunFailed(run.id, message, user.id, today);
      throw dispatchError;
    }

    console.log(`Pipeline triggered for user ${user.id} (run ${run.id}) via ${triggerMode}`);

    return NextResponse.json({
      success: true,
      runId: run.id,
      runsRemainingToday: Math.max(0, (attempt.claim.manual_limit ?? 1) - (attempt.claim.manual_count ?? 1)),
      message:
        triggerMode === "github_actions"
          ? "Your digest was queued in GitHub Actions. Check back in a few minutes."
          : "Your digest is being generated locally. Check back in a few minutes.",
    });
  } catch (error) {
    console.error("Pipeline trigger error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
