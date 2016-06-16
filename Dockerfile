FROM node:6
MAINTAINER "andro <andro999b@gmail.com>"

RUN apt-get update
RUN apt-get install -y graphicsmagick

RUN mkdir -p /usr/src/app
COPY package.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

EXPOSE 8080
WORKDIR /usr/src/app
CMD [ "npm", "start" ]