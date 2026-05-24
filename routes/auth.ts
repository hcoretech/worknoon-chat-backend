import express = require('express');
const router = express.Router();
import bcrypt = require('bcryptjs');
import jwt = require('jsonwebtoken');
import { getDB } from  '../database/db';


router.post('/signup', async (req: express.Request, res: express.Response) => {
  try {
    const { name, email, password, role } = req.body;
    const db = getDB();

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing name, email, or password input parameters.' });
    }

    // 1. Verify user does not already exist
    const userExists = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: 'A user account with this email address already exists.' });
    }

    // 2. Hash plain text password using standard cryptographic nesting cycles
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserDoc = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'customer', // Default fallback profiles: customer, designer, merchant, agent, admin
      createdAt: new Date()
    };

    // 3. Persist the user profile document down to the cluster
    const result = await db.collection('users').insertOne(newUserDoc);

    // 4. Issue a signed validation access token string
    const token = jwt.sign(
      { id: result.insertedId.toString(), name: newUserDoc.name, role: newUserDoc.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      token: `Bearer ${token}`,
      user: { id: result.insertedId, name: newUserDoc.name, role: newUserDoc.role }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


router.post('/login', async (req: express.Request, res: express.Response) => {
  try {
    const { email, password } = req.body;
    const db = getDB();

    if (!email || !password) {
      return res.status(400).json({ message: 'Missing email or password fields.' });
    }

    // 1. Check if user email match exists
    const user = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Authentication failure: Invalid credential values.' });
    }

    // 2. Natively evaluate password matching metrics
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Authentication failure: Invalid credential values.' });
    }

    // 3. Issue new validation token mapping properties
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
