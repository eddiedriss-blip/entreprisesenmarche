#!/bin/sh
# Lance le serveur de développement avec Node 22 (requis pour la lecture des PDF),
# même si la version de Node installée sur la machine est plus ancienne.
cd "$(dirname "$0")" && exec npx -y node@22 node_modules/next/dist/bin/next dev -p 3200
