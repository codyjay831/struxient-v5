import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { denyUnlessCanManageCommercial } from "@/lib/staff-authz";
import { AIService } from "@/lib/ai/ai-service";

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

    // Fetch existing tags for the organization to help AI suggest from library
    const existingTags = await db.tag.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      select: { name: true, aliases: true },
    });

    const aiService = new AIService();
    const suggestions = await aiService.suggestTags({
      title,
      description,
      context,
      existingTags: existingTags.map(t => ({ name: t.name, aliases: t.aliases })),
    });

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("AI Tag Suggestion Error:", e);
    return NextResponse.json({ error: "Failed to suggest tags" }, { status: 500 });
  }
}
