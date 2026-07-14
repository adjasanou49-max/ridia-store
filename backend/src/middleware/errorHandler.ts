import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route non trouvée: ${req.method} ${req.path}` });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Erreur de validation',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Filet de sécurité Prisma : capture TOUTE erreur connue de la base de données
  // (pas seulement les conflits d'unicité) et renvoie un message exploitable au lieu
  // d'un 500 générique qui masque la vraie cause. Toujours loggé en détail côté serveur
  // pour debug, mais le message renvoyé au client reste sûr (pas de détails internes).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error('Erreur Prisma connue', {
      code: err.code,
      meta: err.meta,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[] | undefined)?.join(', ') || 'ce champ';
      return res.status(409).json({ error: `Une valeur en conflit existe déjà pour : ${fields}` });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Ressource introuvable.' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'Référence invalide (élément lié introuvable).' });
    }
    // Codes P1xxx = problème de connexion à la base de données elle-même.
    if (err.code.startsWith('P1')) {
      return res
        .status(503)
        .json({ error: 'Base de données temporairement indisponible, réessaie dans un instant.' });
    }
    return res.status(400).json({ error: 'Requête invalide.' });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error('Erreur de validation Prisma (champ manquant/mal typé)', {
      message: err.message,
      path: req.path,
    });
    return res.status(400).json({ error: 'Données invalides envoyées au serveur.' });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error('Impossible de se connecter à la base de données', {
      message: err.message,
      path: req.path,
    });
    return res
      .status(503)
      .json({ error: 'Connexion à la base de données impossible, réessaie dans un instant.' });
  }

  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({ error: 'Erreur interne du serveur' });
}

// Wraps async route handlers to forward errors to errorHandler
type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
