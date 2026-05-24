import { Response, NextFunction } from 'express';
import jwt = require('jsonwebtoken');
import { AuthenticatedRequest, UserPayload } from '../types/type';

export const protectRoute = (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
  let token: string | undefined;

  // Read standard 'Authorization: Bearer <token>' header layout formatting
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied: Authentication token is missing.' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Critical config fault: JWT_SECRET environment key missing.");

    // Enforce type verification when decoding the token payload parameters
    const verified = jwt.verify(token, secret) as UserPayload;
    req.user = verified;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Access denied: Session key has expired or is invalid.' });
  }
};
