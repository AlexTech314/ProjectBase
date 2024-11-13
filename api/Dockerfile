# Use the official AWS Lambda Node.js 20 base image
FROM public.ecr.aws/lambda/nodejs:20

# Set the working directory
WORKDIR /var/task

# Copy dependency files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY index.js ./

# Command to run the Lambda function
CMD ["index.handler"]
