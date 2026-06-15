import type { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import {
  extractGeminiUsageFromSdkResponse,
  type GeminiTokenUsage,
} from "@/lib/ai/gemini-generate-content";

export type GeminiSdkCallResult = {
  text: string;
  usage: GeminiTokenUsage | null;
};

export async function callGeminiSdkGenerateContent(params: {
  model: GenerativeModel;
  prompt: string | Array<string | { text: string }>,
}): Promise<GeminiSdkCallResult> {
  const result = await params.model.generateContent(params.prompt);
  const response = result.response;
  return {
    text: response.text(),
    usage: extractGeminiUsageFromSdkResponse(response),
  };
}

export function getGeminiGenerativeModel(
  gemini: GoogleGenerativeAI,
  modelName: string,
  generationConfig?: { responseMimeType?: string },
) {
  return gemini.getGenerativeModel({
    model: modelName,
    ...(generationConfig ? { generationConfig } : {}),
  });
}
