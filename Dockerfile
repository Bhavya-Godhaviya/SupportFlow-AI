# Use Node.js 24 lightweight image
FROM node:24-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Set production environment
ENV NODE_ENV=production

# Expose API port
EXPOSE 5001

# Start application
CMD ["npm", "start"]