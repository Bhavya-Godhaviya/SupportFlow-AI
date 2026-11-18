const validateTicket = (req, res, next) => {
    const { title, description } = req.body;
    if (
      typeof title !== "string" ||
      typeof description !== "string" ||
      !title.trim() ||
      !description.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }  
    next();
};
  
export default validateTicket;