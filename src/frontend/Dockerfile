# build stage
FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

# ncu 설치 및 의존성 업데이트
RUN npm install -g npm-check-updates && \
    ncu -u

# 의존성 설치
RUN npm install --legacy-peer-deps

COPY . .

# 빌드 실행
RUN npm run build

# prod stage
FROM node:lts-alpine

RUN apk update && \
    apk add --no-cache nginx

WORKDIR /app

ENV NODE_ENV=production

# nginx 설정 파일과 실행 스크립트 복사
COPY default.conf /etc/nginx/http.d/default.conf
COPY ./run.sh ./run.sh

# 빌드된 파일 복사
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

CMD ["sh", "run.sh"]
