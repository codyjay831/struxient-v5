import { NextRequest, NextResponse } from "next/server";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { AIService } from "@/lib/ai/ai-service";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContextOrThrow();
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
