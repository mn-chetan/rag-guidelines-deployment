FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY admin.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 8080

# Configure nginx to listen on port 8080 (Cloud Run requirement)
RUN sed -i 's/listen       80;/listen       8080;/' /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
