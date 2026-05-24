import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';


export interface UserPayload extends JwtPayload {
  id: string;
  name: string;
  role: 'admin' | 'agent' | 'customer' | 'designer' | 'merchant';
}


export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface IFileAttachment {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}