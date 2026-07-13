import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { supportChatAgent } from '../integrations/ai/SupportChatAgent';

const router = Router();

router.post(
  '/chat',
  authenticate,
  asyncHandler(async (req, res) => {
    const { message, history } = req.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Le champ "message" est requis.' });
    }

    const reply = await supportChatAgent.reply(req.auth!.userId, message, history ?? []);
    res.json({ reply });
  })
);

export default router;
