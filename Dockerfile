FROM node:16-alpine
# Create app directory
# WORKDIR /app/api-oracle

COPY package*.json ./
COPY .env .
COPY ./data/src /data/src
COPY ./data/package*.json /data

RUN npm install

WORKDIR /app/api-oracle
COPY ./app/api-oracle/ .
RUN npm install

# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
# COPY package*.json ./

# RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source

EXPOSE 3002

CMD [ "npm","run","dev" ]

