const errorMiddleware = (err, req, res, next) => {
    console.error(err);
  
    if (res.headersSent) {
      return next(err);
    }
  
    let statusCode = err.statusCode || 500;
    let message =
        statusCode === 500 && !err.isOperational
            ? "Internal server error"
            : err.message || "Internal server error";
  
    // Mongoose validation errors
    if (err.name === "ValidationError") {
      statusCode = 400;
      message = err.message;
    }
  
    // Invalid MongoDB ObjectId
    if (err.name === "CastError") {
      statusCode = 400;
      message = "Invalid data format";
    }
  
    // Duplicate key error
    if (err.code === 11000) {
      statusCode = 409;
      message = "Duplicate value already exists";
    }
  
    res.status(statusCode).json({
      success: false,
      message,
    });
  };
  
  export default errorMiddleware;