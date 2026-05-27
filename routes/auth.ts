// 📁 File: routes/auth.ts
import express, { Request, Response } from 'express'; 
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../database/db';
import { sendEmail } from '../utils/sendEmail'; 

const router = express.Router();

router.post('/signup', async (req: express.Request, res: express.Response): Promise<any> => {
  console.log("Checking for existing user with email:");
  try {
    const { name, email, password, role } = req.body;
    const db = getDB();

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing name, email, or password input parameters.' });
    }
    
    const userExists = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: 'A user account with this email address already exists.' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserDoc = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'customer',
      createdAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUserDoc);
    const userIdString = result.insertedId.toString();

    const token = jwt.sign(
      { id: userIdString, name: newUserDoc.name, role: newUserDoc.role },
      (process.env.JWT_SECRET || 'fallback_dev_secret_key_change_me').trim(),
      { expiresIn: '7d' }
    );

    try {
      await sendEmail({
        email: newUserDoc.email,
        subject: 'Welcome to the Platform!',
        message: `Hi ${newUserDoc.name},\n\nYour account has been successfully created with the role: ${newUserDoc.role}.\n\nWelcome aboard!`,
        html: `
          <h1>Welcome to our worknoon Chat Platform, ${newUserDoc.name}!</h1>
          <p>Your account has been successfully set up as a <strong>${newUserDoc.role}</strong>.</p>
          <br />
          <p>Best regards,<br />Worknoon Team</p>
        `  
      });
    } catch (emailError) {
      console.error('Nodemailer pipeline notification execution failure:', emailError);
    }

    return res.status(201).json({
      success: true,
      token: token, // 🚀 FIX: Removed the static string prefix wrapper
      user: { id: userIdString, name: newUserDoc.name, role: newUserDoc.role }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    const db = getDB();

    if (!email || !password) {
      return res.status(400).json({ message: 'Missing email or password fields.' });
    }

    const user = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Authentication failure: Invalid credential values.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Authentication failure: Invalid credential values.' });
    }

    const token = jwt.sign(
      { id: user._id.toString(), name: user.name, role: user.role },
      (process.env.JWT_SECRET || 'fallback_dev_secret_key_change_me').trim(),
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token: token, // 🚀 FIX: Deliver a clean, raw JWT token key string here
      user: { id: user._id.toString(), name: user.name, role: user.role }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
