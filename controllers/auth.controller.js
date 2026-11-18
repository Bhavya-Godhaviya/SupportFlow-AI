import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import emailQueue from "../queues/email.queue.js";

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    // Add welcome email to background queue
  try {
    await emailQueue.add("welcome-email", {
      to: user.email,
      subject: "Welcome to SupportFlow AI!",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Welcome to SupportFlow AI, ${user.name}!</h2>

          <p>Your account has been created successfully.</p>

          <p>You can now log in and start using SupportFlow AI.</p>

          <p>Thank you for joining us!</p>

          <strong>SupportFlow AI Team</strong>
        </div>
      `,
    });

    console.log("Welcome email job added to queue");
  } catch (emailError) {
    console.error("Welcome email queue failed:", emailError.message);
  }

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Registration failed"
    });
  }
};
export const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({
          message: "Email and password are required"
        });
      }
  
      const user = await User.findOne({
        email: email.toLowerCase().trim()
      }).select("+password");
  
      if (!user) {
        return res.status(401).json({
          message: "Invalid email or password"
        });
      }
  
      const isMatch = await bcrypt.compare(
        password,
        user.password
      );
  
      if (!isMatch) {
        return res.status(401).json({
          message: "Invalid email or password"
        });
      }
  
      const token = jwt.sign(
        {
          userId: user._id.toString(),
          role: user.role
        },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || "1d"
        }
      );
  
      return res.status(200).json({
        message: "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
  
    } catch (error) {
      return res.status(500).json({
        message: "Login failed"
      });
    }
};