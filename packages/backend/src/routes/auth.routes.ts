import { Router, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, req.ip, req.headers['user-agent']);
  res.json({ success: true, data: result });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);
  res.json({ success: true, data: result });
}));

router.post('/logout', authenticate as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionId) await authService.logout(req.sessionId);
  res.json({ success: true, message: 'Logged out' });
}));

router.post('/change-password', authenticate as any, validateBody(changePasswordSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.changePassword({ userId: req.user.id, ...req.body });
  res.json({ success: true, message: 'Password changed' });
}));

export default router;
