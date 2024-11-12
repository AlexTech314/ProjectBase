# Use the official AWS Lambda Node.js 20 base image
FROM public.ecr.aws/lambda/nodejs:20

# Copy application files
COPY index.js package.json package-lock.json ./

# Install dependencies
RUN npm install

# Command to run the Lambda function
CMD ["index.handler"]