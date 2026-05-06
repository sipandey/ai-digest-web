import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

type TriggerMode = "direct" | "github_actions";

// Maximum number of manual pipeline triggers allowed per user per day.
// The scheduled morning run does not count toward this limit (it bypasses
// this route entirely via GitHub Actions cron).
const MAX_DAILY_TRIGGERS = 3;

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

async function markRunFailed(runId: string, message: string) {
  await supabaseAdmin
    .from("pipeline_runs")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Resolve user + config in one query
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, user_configs(notion_connected)")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const configs = user.user_configs as { notion_connected: boolean }[];
    const notionConnected = configs?.[0]?.notion_connected ?? false;

    if (!notionConnected) {
      return NextResponse.json(
        { error: "Notion not connected — complete onboarding first" },
        { status: 400 }
      );
    }

    const today = todayISO();
    const triggerMode = getTriggerMode();

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

      // ── Daily cap (DB-based, works across serverless instances) ──────────────
      if (triggerCount >= MAX_DAILY_TRIGGERS) {
        return NextResponse.json(
          {
            error: `You've reached the limit of ${MAX_DAILY_TRIGGERS} manual runs today. Your scheduled digest will run again tomorrow morning.`,
            dailyLimitReached: true,
          },
          { status: 429 }
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
        } else {
          await spawnLocalPipeline(user.id, today);
        }
      } catch (dispatchError) {
        const message =
          dispatchError instanceof Error
            ? dispatchError.message
            : "Failed to trigger pipeline";
        await markRunFailed(rerun.id, message);
        throw dispatchError;
      }

      const runsLeft = MAX_DAILY_TRIGGERS - (rerun.trigger_count ?? triggerCount + 1);
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
      } else {
        await spawnLocalPipeline(user.id, today);
      }
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error
          ? dispatchError.message
          : "Failed to trigger pipeline";
      await markRunFailed(run.id, message);
      throw dispatchError;
    }

    console.log(`Pipeline triggered for user ${user.id} (run ${run.id}) via ${triggerMode}`);

    return NextResponse.json({
      success: true,
      runId: run.id,
      runsRemainingToday: MAX_DAILY_TRIGGERS - 1,
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
