# First Stage: Build the Next.js app
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build the Next.js application
RUN npm run build

# Second Stage: Create the Lambda function image
FROM public.ecr.aws/lambda/nodejs:20

# Set working directory
WORKDIR /var/task

# Copy the built Next.js app and necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/index.js ./index.js
COPY --from=builder /app/public ./public

# Command to run the Lambda function
CMD ["index.handler"]
