FROM node:6
MAINTAINER "andro <andro999b@gmail.com>"

RUN apt-get update
RUN apt-get install -y graphicsmagick

RUN mkdir -p /opt/media
WORKDIR /opt/media

COPY package.json /opt/media/
RUN npm install

COPY . /opt/media

EXPOSE 8080

CMD [ "npm", "start" ]