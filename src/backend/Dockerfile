####################
#	build stage
####################

FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

# 전역 설치 및 패키지 업데이트
RUN npm install -g npm-check-updates && \
    ncu -u

# 의존성 설치
RUN npm install --legacy-peer-deps

COPY . .
COPY *.png /photo/

## prisma
RUN npx prisma generate

RUN npm run build

####################
# production stage
####################

FROM node:lts-alpine

WORKDIR /app

ARG NODE_ENV=production

ENV NODE_ENV=${NODE_ENV}

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json .
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/*.png /photo/

# 의존성 설치
RUN npm install --only=production --legacy-peer-deps

# prisma
COPY ./prisma ./prisma
EXPOSE 5555


CMD ["npm", "run", "start:migrate:prod"]
