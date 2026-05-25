import express, { Request, Response } from 'express'; 
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../database/db';
import { sendEmail } from '../utils/sendEmail'; 

const router = express.Router();

router.post('/signup', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password, role } = req.body;
    const db = getDB();

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing name, email, or password input parameters.' });
    }

    // Verify user uniqueness
    const userExists = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: 'A user account with this email address already exists.' });
    }

    // Hash plain text password 
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserDoc = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'customer', // Default fallback configuration
      createdAt: new Date()
    };

    // Save profile to MongoDB Atlas collection
    const result = await db.collection('users').insertOne(newUserDoc);
    const userIdString = result.insertedId.toString();

    // Issue a signed access token string matching your UserPayload signature
    const token = jwt.sign(
      { id: userIdString, name: newUserDoc.name, role: newUserDoc.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // FIX: Added the missing try block around the email pipeline
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
      token: `Bearer ${token}`,
      user: { id: result.insertedId, name: newUserDoc.name, role: newUserDoc.role }
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

    // Evaluate cryptographic password metrics
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Authentication failure: Invalid credential values.' });
    }

    // Sign login validation session token properties
    const token = jwt.sign(
      { id: user._id.toString(), name: user.name, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token: `Bearer ${token}`,
      user: { id: user._id.toString(), name: user.name, role: user.role }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
