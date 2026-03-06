FROM node:20-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar código fonte
COPY server.js ./
COPY public ./public

# Criar diretório para dados persistentes
RUN mkdir -p /data

# Expor porta
EXPOSE 3000

# Variáveis de ambiente
ENV PORT=3000
ENV HOST_IP=localhost

# Comando de inicialização
CMD ["node", "server.js"]

