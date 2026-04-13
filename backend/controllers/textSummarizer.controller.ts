import { Request, Response } from "express";
import { openRouter } from "../config/openRouter";
import sql from "../config/db";
import { response } from "../utils/responseHandler";
import { clerkClient } from "@clerk/express";
import { buildTextSummarizerPrompt } from "../prompts/textSummarizerPrompt";
import { generateGeminiEmbedding } from "../utils/geminiEmbedding";

export const generateSummary = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { text, length = "medium", style = "neutral" } = req.body;

        if (!text || typeof text !== "string" || text.trim().length < 50) {
            response(res, 400, "Please provide valid text (minimum 50 characters)");
            return;
        }

        const plan: string | undefined = req.plan;
        const free_usage: number | undefined = req.free_usage;

        // Free users limit (e.g., 10 summaries per month)
        if (plan !== "premium" && (free_usage ?? 0) >= 10) {
            response(res, 403, "Usage limit reached. Upgrade to premium.");
            return;
        }

        const formattedPrompt = buildTextSummarizerPrompt({ text, length, style });

        // 🔥 Call OpenRouter AI
        const aiResponse = await openRouter.post("/chat/completions", {
            model: "google/gemma-4-31b-it:free",
            messages: [{ role: "user", content: formattedPrompt }],
            temperature: 0.6,
            max_tokens: 1500,
        });

        const content: string = aiResponse.data.choices?.[0]?.message?.content ?? "";


        if (!content.trim()) {
            response(res, 500, "Failed to generate summary");
            return;
        }

        const embedding = await generateGeminiEmbedding(content);
        // Save to database
        await sql`
      INSERT INTO creations (user_id, prompt, content, type, embedding)
      VALUES (${userId}, ${text}, ${content}, 'text-summary', ${embedding})
    `;

        // Increment free usage counter if not premium
        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: (free_usage ?? 0) + 1,
                },
            });
        }

        response(res, 200, "Summary generated successfully", { summary: content });
    } catch (error: any) {
        console.error(error.response?.data || error.message);
        response(res, 500, "Something went wrong", error.response?.data ?? error.message);
    }
};

export const getSummaries = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;

        const summaries = await sql`
      SELECT id, prompt, content, created_at
      FROM creations
      WHERE user_id = ${userId}
      AND type = 'text-summary'
      ORDER BY created_at DESC
    `;

        response(res, 200, "Summaries fetched successfully", summaries);
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, "Failed to fetch summaries");
    }
};

export const deleteSummary = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { id } = req.params;

        if (!id) {
            response(res, 400, "Summary ID is required");
            return;
        }

        // Ownership check
        const [summary] = await sql`
      SELECT id FROM creations
      WHERE id = ${id}
        AND user_id = ${userId}
        AND type = 'text-summary'
    `;

        if (!summary) {
            response(res, 404, "Summary not found or unauthorized");
            return;
        }

        await sql`
      DELETE FROM creations
      WHERE id = ${id}
    `;

        response(res, 200, "Summary deleted successfully");
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, "Failed to delete summary");
    }
};