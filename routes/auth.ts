import express = require('express');
const router = express.Router();
import bcrypt = require('bcryptjs');
import jwt = require('jsonwebtoken');
import { getDB } from  '../database/db';


router.post('/sign-up', async (req: any, res: any): Promise<any> => {
    return res.status(501).json({ message: 'User registration endpoint is not implemented yet.' });
 })
 router.post('/sign-in', async (req: any, res: any): Promise<any> => {
    return res.status(501).json({ message: 'User authentication endpoint is not implemented yet.' });   
 })

export default router;
