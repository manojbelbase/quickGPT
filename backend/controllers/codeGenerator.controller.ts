import { Request, Response } from 'express';
import { openRouter } from '../config/openRouter';
import sql from '../config/db';
import { response } from '../utils/responseHandler';
import { clerkClient } from '@clerk/express';
import { buildCodeGeneratorPrompt } from '../prompts/codeGeneratorPrompt';
import { generateGeminiEmbedding } from '../utils/geminiEmbedding';

export const generateCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { prompt } = req.body;
        const plan: string | undefined = req.plan;
        const free_usage: number | undefined = req.free_usage;

        // Free users limit (e.g. 10 generations per month)
        if (plan !== 'premium' && (free_usage ?? 0) >= 10) {
            response(res, 403, 'Limit Reached. Upgrade to continue.');
            return;
        }

        const formattedPrompt = buildCodeGeneratorPrompt({ prompt });

        // 🔥 OpenRouter AI call (you can change the model)
        const aiResponse = await openRouter.post('/chat/completions', {
            model: 'google/gemma-4-31b-it:free',
            messages: [{ role: 'user', content: formattedPrompt }],
            temperature: 0.4,
            max_tokens: 2000,
        });

        const content: string = aiResponse.data.choices?.[0]?.message?.content ?? '';
        const embedding = await generateGeminiEmbedding(content);

        // Save to database
        await sql`
      INSERT INTO creations (user_id, prompt, content, type, embedding)
      VALUES (${userId}, ${prompt}, ${content}, 'code-generation',${embedding})
    `;

        // Increment free usage counter if not premium
        if (plan !== 'premium') {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: (free_usage ?? 0) + 1,
                },
            });
        }

        response(res, 200, 'Code generated successfully', content);
    } catch (error: any) {
        console.error(error.response?.data || error.message);
        response(res, 500, 'Something went wrong', error.response?.data ?? error.message);
    }
};

export const getGeneratedCodes = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;

        const codes = await sql`
      SELECT id, prompt, content, created_at
      FROM creations
      WHERE user_id = ${userId}
        AND type = 'code-generation'
      ORDER BY created_at DESC
    `;

        response(res, 200, 'Generated codes fetched successfully', codes);
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, 'Failed to fetch generated codes');
    }
};

export const deleteGeneratedCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId: string = req.auth().userId;
        const { id } = req.params;

        if (!id) {
            response(res, 400, 'Code generation ID is required');
            return;
        }

        // Ownership check
        const [codeEntry] = await sql`
      SELECT id FROM creations
      WHERE id = ${id}
        AND user_id = ${userId}
        AND type = 'code-generation'
    `;

        if (!codeEntry) {
            response(res, 404, 'Code generation not found or unauthorized');
            return;
        }

        await sql`
      DELETE FROM creations
      WHERE id = ${id}
    `;

        response(res, 200, 'Code generation deleted successfully');
    } catch (error: any) {
        console.error(error.message);
        response(res, 500, 'Failed to delete code generation');
    }
};