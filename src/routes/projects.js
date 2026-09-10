import { Router } from 'express';
import Project from '../models/Project.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const projects = await Project.find().sort({ code: 1 });
  res.json(projects);
}));

export default router;
