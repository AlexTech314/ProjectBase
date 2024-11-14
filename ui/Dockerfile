FROM public.ecr.aws/lambda/nodejs:20

WORKDIR /var/task

COPY package.json package-lock.json ./

RUN npm install

COPY . .

RUN npm run build

CMD ["index.handler"]
