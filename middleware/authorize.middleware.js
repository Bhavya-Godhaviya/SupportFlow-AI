const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        console.log("User role:", req.user.role);
        console.log("Allowed roles:", allowedRoles);
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You are not authorized"
            });
        }
        
        next();
    };
};

export default authorizeRoles;