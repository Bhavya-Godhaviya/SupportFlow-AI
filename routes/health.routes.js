import express from "express";

const router = express.Router();
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is running successfully
 */
router.get("/", (req,res) => {
    res.status(200).json({
        success: true,
        message: "Supportflow-AI API is healthy",
    });
});

export default router;