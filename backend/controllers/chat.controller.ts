import { Request, Response } from "express";
import crypto from "crypto";
import { buildChatPrompt } from "../prompts/chatPrompt";
import { response } from "../utils/responseHandler";
import { openRouterForChatBot } from "../config/openRouter";
import sql from "../config/db";
import { getRandomRateLimitMessage, MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "../config/chatRateLimiter";


export const generateChatResponse = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { message, sessionId } = req.body;

        if (!message || typeof message !== "string") {
            response(res, 400, "Message is required");
            return;
        }

        const chatSessionId = sessionId || crypto.randomUUID();

        // ✅ 1️⃣ Check rate limit
        const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

        const recentMessages = await sql`
      SELECT COUNT(*) as count
      FROM chat_messages
      WHERE session_id = ${chatSessionId}
        AND role = 'user'
        AND created_at >= ${oneMinuteAgo}
    `;

        const userMessageCount = Number(recentMessages[0]?.count || 0);

        // Usage in your API
        if (userMessageCount >= MAX_REQUESTS) {
            response(res, 429, getRandomRateLimitMessage());
            return;
        }

        // ✅ 2️⃣ Store USER message
        await sql`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (${chatSessionId}, 'user', ${message})
    `;

        const formattedPrompt = buildChatPrompt(message);

        // ✅ 3️⃣ Call AI
        const aiResponse = await openRouterForChatBot.post("/chat/completions", {
            model: "deepseek/deepseek-chat-v3.1",
            messages: [{ role: "user", content: formattedPrompt }],
            temperature: 0.7,
            max_tokens: 800,
            stream: false,
        });

        const reply = aiResponse.data.choices?.[0]?.message?.content?.trim() || "";

        // ✅ 4️⃣ Store ASSISTANT message
        await sql`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (${chatSessionId}, 'assistant', ${reply})
    `;

        // ✅ 5️⃣ Respond
        response(res, 200, "Success", {
            sessionId: chatSessionId,
            reply,
        });
    } catch (error: any) {
        console.error(error?.response?.data || error.message);
        response(res, 500, "Internal server error");
    }
};


export const getChatHistory = async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const messages = await sql`
        SELECT role, content, created_at
        FROM chat_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
    `;

    response(res, 200, "Success", messages);
};
