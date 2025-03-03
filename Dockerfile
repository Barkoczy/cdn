# Nginx Dockerfile
FROM nginx:alpine

# Install additional packages if needed
RUN apk update && apk add --no-cache bash curl

# Copy custom nginx configuration
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]