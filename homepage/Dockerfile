FROM caddy:2.11.4-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY ["index.html", "privacy.html", "terms.html", "LOGO.jpg", "home.png", "/srv/"]

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
