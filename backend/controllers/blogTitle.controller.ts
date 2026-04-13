import { Request, Response } from "express";
import { openRouter } from "../config/openRouter";
import sql from "../config/db";
import { response } from "../utils/responseHandler";
import { clerkClient } from "@clerk/express";
import { buildBlogTitlePrompt } from "../prompts/blogTitlePrompt";
import { generateEmbeddingInBackground } from "../utils/generateEmbeddingInBackground";
import { generateGeminiEmbedding } from "../utils/geminiEmbedding";

export const generateBlogTitle = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { prompt } = req.body;

        // Free users limit
        const plan: string | undefined = req.plan;
        const free_usage: number | undefined = req.free_usage;
        if (plan !== "premium" && (free_usage ?? 0) >= 10) {
            response(res, 403, "Limit Reached. Upgrade to continue.");
            return;
        }

        const formattedPrompt = buildBlogTitlePrompt({ prompt });

        // 🔥 OpenRouter AI call

        const aiResponse = await openRouter.post("/chat/completions", {
            model: "google/gemma-4-31b-it:free",
            messages: [{ role: "user", content: formattedPrompt }],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content: string = aiResponse.data.choices?.[0]?.message?.content ?? "";

        // Save immediately without embedding
        const embedding = await generateGeminiEmbedding(content);

        const creation = await sql`
            INSERT INTO creations (user_id, prompt, content, type,embedding)
            VALUES (${userId}, ${prompt}, ${content}, 'blog-title', ${embedding})
            RETURNING id
        `;

        const creationId = creation[0].id;

        // Respond immediately to user
        response(res, 200, "Success", content);

        // Queue embedding generation in background
        generateEmbeddingInBackground(creationId, content);

        // Update free usage
        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { free_usage: (free_usage ?? 0) + 1 },
            });
        }

    } catch (error: any) {
        console.error(error.response?.data || error.message);
        response(res, 500, "Something went wrong", error.response?.data ?? error.message);
    }
};


export const getBlogTitles = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId: string = req.auth().userId;

        const blogTitles = await sql`
            SELECT id, prompt, content, created_at
            FROM creations
            WHERE user_id = ${userId}
              AND type = 'blog-title'
            ORDER BY created_at DESC
        `;

        response(res, 200, "Blog titles fetched successfully", blogTitles);
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, "Failed to fetch blog titles");
    }
};

export const deleteBlogTitle = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { id } = req.params;

        if (!id) {
            response(res, 400, "Blog title ID is required");
            return;
        }

        // Ownership check
        const [blogTitle] = await sql`
            SELECT id FROM creations
            WHERE id = ${id}
              AND user_id = ${userId}
              AND type = 'blog-title'
        `;

        if (!blogTitle) {
            response(res, 404, "Blog title not found or unauthorized");
            return;
        }

        await sql`
            DELETE FROM creations
            WHERE id = ${id}
        `;

        response(res, 200, "Blog title deleted successfully");
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, "Failed to delete blog title");
    }
};
