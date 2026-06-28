import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { denyUnlessCanManageCommercial } from "@/lib/staff-authz";
import { AIService } from "@/lib/ai/ai-service";
import {
  buildAiMeteringContext,
  runMeteredAiFeature,
} from "@/lib/billing/run-metered-ai-feature";

export const dynamic = "force-dynamic";

const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const AI_MAX_REQUESTS_PER_WINDOW = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContextOrThrow();
    const denied = denyUnlessCanManageCommercial(ctx.role);
    if (denied) {
      return NextResponse.json({ error: denied }, { status: 403 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || ctx.userId;
    if (
      !(await checkRateLimit(`${ctx.organizationId}:${ip}`, {
        windowMs: AI_RATE_LIMIT_WINDOW_MS,
        max: AI_MAX_REQUESTS_PER_WINDOW,
        keyPrefix: "ai-suggest-tags",
      }))
    ) {
      return NextResponse.json({ error: "Too many AI requests. Please try again later." }, { status: 429 });
    }

    const { title, description, context } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const existingTags = await db.tag.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      select: { name: true, aliases: true },
    });

    const promptChars = [title, description, context].filter(Boolean).join("\n").length;
    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "tag_suggestions",
        requestKind: "generate",
        promptChars,
      }),
      run: async () => {
        const aiService = new AIService();
        const result = await aiService.suggestTags({
          title,
          description,
          context,
          existingTags: existingTags.map((t) => ({ name: t.name, aliases: t.aliases })),
        });
        return {
          result: result.tags,
          metering: result.metering,
          responseChars: result.tags.join(",").length,
        };
      },
    });

    if (!metered.ok) {
      return NextResponse.json(
        { error: metered.error, billingPath: metered.billingPath, code: metered.code },
        { status: metered.code === "BILLING_REQUIRED" ? 402 : 403 },
      );
    }

    return NextResponse.json({ suggestions: metered.data });
  } catch (e) {
    console.error("AI Tag Suggestion Error:", e);
    return NextResponse.json({ error: "Failed to suggest tags" }, { status: 500 });
  }
}
