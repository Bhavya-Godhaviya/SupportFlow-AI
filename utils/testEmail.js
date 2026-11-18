import dotenv from "dotenv";
import transporter from "../config/email.js";

dotenv.config();

const testEmail = async () => {
  try {
    await transporter.verify();

    console.log("Email server is ready!");

    const info = await transporter.sendMail({
      from: `"SupportFlow AI" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "SupportFlow AI - Email Test",
      html: `
        <h2>Welcome to SupportFlow AI!</h2>
        <p>Your email integration is working successfully.</p>
      `,
    });

    console.log("Test email sent:", info.messageId);
  } catch (error) {
    console.error("Email test failed:", error);
  }
};

testEmail();